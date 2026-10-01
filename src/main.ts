import { Plugin } from "obsidian";
import { debounce, type DebouncedFunction } from "./utils/debounce";
import { PluginLog } from "./utils/logging";
import {
  EVALUATE_DEBOUNCE_MS,
  PLUGIN_ID,
  VIEW_TYPE_DIAGNOSTICS,
} from "./config";
import {
  migrate,
  toPersisted,
  type Settings,
} from "./types/settings";
import type { EnvironmentState, ObsidianInfo } from "./types/environment";
import { InternalApi } from "./core/internal-api";
import { EnvironmentDetector } from "./core/environment-detector";
import { ActionExecutor } from "./core/action-executor";
import { StateManager } from "./core/state-manager";
import { evaluateRules, type EvaluationResult, type PluginDesireInfo } from "./core/rule-engine";
import { ConditionRegistry } from "./conditions/condition-registry";
import { displayConditionDef } from "./conditions/display-condition";
import { windowConditionDef } from "./conditions/window-condition";
import { ActionRegistry } from "./actions/action-registry";
import { enablePluginActionDef, disablePluginActionDef } from "./actions/plugin-action";
import { executeCommandActionDef } from "./actions/command-action";
import { AdaptiveSettingTab, type SettingsTabHost } from "./ui/settings-tab";
import { RuleEditorModal, type RuleEditorHost } from "./ui/rule-editor";
import {
  DiagnosticsView,
  type DiagnosticsHost,
  type DiagnosticsSnapshot,
} from "./ui/diagnostics-view";
import type { Rule } from "./types/rule";

export default class AdaptiveWorkspacePlugin
  extends Plugin
  implements SettingsTabHost, DiagnosticsHost, RuleEditorHost
{
  pluginSettings!: Settings;
  readonly log = new PluginLog();

  readonly conditionRegistry = new ConditionRegistry();
  readonly actionRegistry = new ActionRegistry();

  private api!: InternalApi;
  private detector!: EnvironmentDetector;
  private stateManager!: StateManager;
  private settingsTab: AdaptiveSettingTab | null = null;

  private debouncedEvaluate: DebouncedFunction | null = null;
  private unsubscribeDetector: (() => void) | null = null;

  private running = false;
  private pending = false;
  private lastState: EnvironmentState | null = null;
  private lastResult: EvaluationResult | null = null;

  /* ---------------- lifecycle ---------------- */

  override async onload(): Promise<void> {
    await this.loadSettings();

    this.conditionRegistry.register(displayConditionDef);
    this.conditionRegistry.register(windowConditionDef);
    this.actionRegistry.register(enablePluginActionDef);
    this.actionRegistry.register(disablePluginActionDef);
    this.actionRegistry.register(executeCommandActionDef);

    this.api = new InternalApi(this.app);
    const probe = this.api.probe();
    this.log.info(`API probe: tier=${this.api.capabilityTier()} via=${probe.via}`);
    for (const note of probe.notes) this.log.warn(note);

    this.detector = new EnvironmentDetector(
      this.api,
      () => this.pluginSettings,
      () => this.getObsidianInfo(),
    );

    const executor = new ActionExecutor(
      {
        listInstalledPlugins: () => this.api.listInstalledPlugins(),
        isPluginEnabled: (id) => this.api.isPluginEnabled(id),
        enablePluginAndSave: (id) => this.api.enablePluginAndSave(id),
        disablePluginAndSave: (id) => this.api.disablePluginAndSave(id),
        listCommands: () => this.api.listCommands(),
        executeCommandById: (id) => this.api.executeCommandById(id),
      },
      this.log,
      PLUGIN_ID,
    );
    this.stateManager = new StateManager(executor, this.log);

    // Event wiring: debounced for geometry, immediate for discrete changes.
    this.debouncedEvaluate = debounce(() => {
      void this.runEvaluate();
    }, EVALUATE_DEBOUNCE_MS);
    this.register(() => this.debouncedEvaluate?.cancel());

    this.unsubscribeDetector = this.detector.subscribe({
      onGeometryChange: () => this.debouncedEvaluate?.(),
      onDiscreteChange: () => {
        this.debouncedEvaluate?.cancel();
        void this.runEvaluate();
      },
    });

    this.addCommand({
      id: "evaluate-now",
      name: "Evaluate workspace rules now",
      callback: () => this.runEvaluateNow(),
    });
    this.addCommand({
      id: "open-diagnostics",
      name: "Open environment diagnostics",
      callback: () => void this.openDiagnostics(),
    });

    this.registerView(VIEW_TYPE_DIAGNOSTICS, (leaf) => new DiagnosticsView(leaf, this));
    this.settingsTab = new AdaptiveSettingTab(this.app, this, this);
    this.addSettingTab(this.settingsTab);

    // Evaluate once at startup (Event Actions suppressed inside StateManager).
    void this.runEvaluate();
  }

  override onunload(): void {
    this.debouncedEvaluate?.cancel();
    this.unsubscribeDetector?.();
  }

  /* ---------------- settings ---------------- */

  private async loadSettings(): Promise<void> {
    const raw = await this.loadData();
    const { settings, migrated, fromVersion } = migrate(raw ?? null);
    this.pluginSettings = settings;
    if (migrated) {
      this.log.info(`Settings migrated from version ${fromVersion}`);
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(toPersisted(this.pluginSettings));
  }

  /* ---------------- evaluation pipeline ---------------- */

  private async runEvaluate(): Promise<void> {
    this.pending = true;
    if (this.running) return;
    this.running = true;
    try {
      while (this.pending) {
        this.pending = false;
        if (!this.pluginSettings.enabled) {
          this.log.info("Adaptive Workspace is disabled — skipping evaluation");
          continue;
        }
        const state = this.detector.getState();
        this.lastState = state;
        const result = evaluateRules(
          this.pluginSettings.rules,
          state,
          this.conditionRegistry,
          this.actionRegistry,
        );
        this.lastResult = result;
        await this.stateManager.apply(result, {
          runCommandsOnStartup: this.pluginSettings.runCommandsOnStartup,
        });
        this.refreshDiagnostics();
      }
    } catch (e) {
      this.log.error("Evaluation failed", String(e));
    } finally {
      this.running = false;
    }
  }

  runEvaluateNow(): void {
    this.debouncedEvaluate?.cancel();
    void this.runEvaluate();
  }

  /* ---------------- UI host: settings tab ---------------- */

  listDisplays() {
    return this.detector.describeDisplays();
  }

  listPlugins() {
    return this.api.listInstalledPlugins().filter((m) => m.id !== PLUGIN_ID);
  }

  listCommands() {
    return this.api.listCommands();
  }

  openRuleEditor(rule: Rule): void {
    new RuleEditorModal(this.app, this, rule, (saved) => {
      const index = this.pluginSettings.rules.findIndex((r) => r.id === saved.id);
      if (index >= 0) {
        this.pluginSettings.rules[index] = saved;
      } else {
        this.pluginSettings.rules.push(saved);
      }
      void this.saveSettings().then(() => {
        this.refreshSettingsTab();
        this.runEvaluateNow();
      });
    }).open();
  }

  refreshSettingsTab(): void {
    this.settingsTab?.refresh();
  }

  /* ---------------- UI host: diagnostics ---------------- */

  openDiagnostics(): void {
    void this.activateDiagnosticsView();
  }

  private async activateDiagnosticsView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_DIAGNOSTICS);
    const first = existing[0];
    if (first) {
      void this.app.workspace.revealLeaf(first);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE_DIAGNOSTICS, active: true });
    void this.app.workspace.revealLeaf(leaf);
  }

  getSnapshot(): DiagnosticsSnapshot {
    return {
      tier: this.api.capabilityTier(),
      probe: this.api.probe(),
      state: this.lastState,
      ruleMatches: this.lastResult?.ruleMatches ?? [],
      pluginDesires: this.lastResult?.pluginDesires ?? new Map<string, PluginDesireInfo>(),
      ledger: this.stateManager.getLedger(),
      evaluateLog: this.stateManager.getEvaluateLog(),
      log: this.log.getEntries(),
    };
  }

  private refreshDiagnostics(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_DIAGNOSTICS)) {
      const view = leaf.view;
      if (view instanceof DiagnosticsView) view.render();
    }
  }

  /* ---------------- obsidian info ---------------- */

  private getObsidianInfo(): ObsidianInfo {
    const activeFile = this.app.workspace.getActiveFile();
    return {
      vault: this.app.vault.getName(),
      theme: document.body.classList.contains("theme-dark") ? "dark" : "light",
      activeFile: activeFile ? activeFile.path : null,
    };
  }
}

// Keep type-only imports used for interface implementation honest.
export type { SettingsTabHost, DiagnosticsHost, RuleEditorHost };
