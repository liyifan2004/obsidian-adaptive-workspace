import { PluginSettingTab, Setting, type App, type Plugin } from "obsidian";
import type { Settings, DisplayIdentitySetting } from "../types/settings";
import type { Rule } from "../types/rule";
import type { DisplayDetectionMethod, DisplayIdentity } from "../types/environment";
import type { ConditionRegistry } from "../conditions/condition-registry";
import type { ActionRegistry } from "../actions/action-registry";
import type { CommandLike, PluginManifestLike } from "../core/internal-api";
import { renderRuleList } from "./rule-list";

export interface DisplayRowInfo {
  id: number;
  label: string;
  size: { width: number; height: number };
  scaleFactor: number;
  identity: DisplayIdentity;
  detectionMethod: DisplayDetectionMethod;
}

export interface SettingsTabHost {
  pluginSettings: Settings;
  saveSettings(): Promise<void>;
  listDisplays(): DisplayRowInfo[];
  listPlugins(): PluginManifestLike[];
  listCommands(): CommandLike[];
  conditionRegistry: ConditionRegistry;
  actionRegistry: ActionRegistry;
  openRuleEditor(rule: Rule): void;
  openDiagnostics(): void;
  runEvaluateNow(): void;
  refreshSettingsTab(): void;
}

function newRuleId(): string {
  return `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createDefaultRule(): Rule {
  return {
    id: newRuleId(),
    name: "New Rule",
    enabled: true,
    conditions: [
      { type: "display", property: "identity", operator: "equals", value: "external" },
    ],
    conditionLogic: "AND",
    actions: [{ type: "enablePlugin", target: "" }],
    priority: 10,
  };
}

const DETECTION_LABEL: Record<DisplayDetectionMethod, string> = {
  manual: "manual mapping",
  "electron-flag": "Electron internal flag",
  "heuristic-primary": "heuristic (unverified) — please set manually",
  unresolved: "unresolved — please set manually",
};

export class AdaptiveSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private readonly host: SettingsTabHost,
  ) {
    super(app, plugin);
  }

  override display(): void {
    this.refresh();
  }

  /** Re-render without going through the deprecated display() call sites. */
  refresh(): void {
    const { containerEl } = this;
    const settings = this.host.pluginSettings;
    containerEl.empty();

    ;
    containerEl.createEl("p", {
      text: "Automatically adapt your Obsidian workspace based on your display, window, and environment.",
      cls: "aw-desc",
    });

    new Setting(containerEl)
      .setName("Enable adaptive workspace")
      .setDesc(
        "When off, no rules are evaluated and nothing is changed. Plugin states produced while it " +
          "was enabled are kept as-is — this plugin never restores them on disable or uninstall.",
      )
      .addToggle((t) => {
        t.setValue(settings.enabled).onChange(async (v) => {
          settings.enabled = v;
          await this.host.saveSettings();
          this.host.runEvaluateNow();
        });
      });

    new Setting(containerEl)
      .setName("Run commands on startup")
      .setDesc(
        "By default, Execute Command actions do NOT fire on the first evaluation after startup. " +
          "Enable this if your commands should also run when Obsidian starts.",
      )
      .addToggle((t) => {
        t.setValue(settings.runCommandsOnStartup).onChange(async (v) => {
          settings.runCommandsOnStartup = v;
          await this.host.saveSettings();
        });
      });

    this.renderDisplaySection(containerEl, settings);
    this.renderRuleSection(containerEl, settings);

    new Setting(containerEl)
      .setName("Diagnostics")
      .setDesc("Inspect the live environment, matched rules and managed plugins.")
      .addButton((b) => b.setButtonText("Open diagnostics").onClick(() => this.host.openDiagnostics()))
      .addButton((b) => b.setButtonText("Evaluate now").onClick(() => this.host.runEvaluateNow()));
  }

  /* ---------------- display identity ---------------- */

  private renderDisplaySection(containerEl: HTMLElement, settings: Settings): void {
    new Setting(containerEl).setName("Display identity").setHeading();
    containerEl.createEl("p", {
      text:
        "Tell Adaptive Workspace which display is your laptop screen. Auto keeps automatic detection; " +
        "anything detected as “heuristic (unverified)” is a guess — set it manually for reliable rules.",
      cls: "aw-desc",
    });

    const displays = this.host.listDisplays();
    const guesswork = displays.filter(
      (d) => d.detectionMethod === "heuristic-primary" || d.detectionMethod === "unresolved",
    );
    if (guesswork.length > 0) {
      const callout = containerEl.createDiv({ cls: "aw-callout" });
      callout.createDiv({
        text: "⚠ Unverified display detection",
        cls: "aw-callout-title",
      });
      callout.createDiv({
        text:
          `${guesswork.length} display(s) could not be identified reliably on this system. ` +
          "Rules using “internal / external” will treat heuristics as provisional. " +
          "Set Identity manually below — the plugin will never silently guess.",
      });
    }

    if (displays.length === 0) {
      containerEl.createDiv({ cls: "aw-empty", text: "No display information available." });
      return;
    }

    for (const display of displays) {
      const key = String(display.id);
      const current: DisplayIdentitySetting = settings.displayAssignments[key]?.identity ?? "auto";
      const setting = new Setting(containerEl)
        .setName(display.label)
        .setDesc(
          `ID ${display.id} · ${display.size.width}×${display.size.height} · ` +
            `scale ${display.scaleFactor} · current detection: ${DETECTION_LABEL[display.detectionMethod]}`,
        );
      setting.addDropdown((d) => {
        d.addOption("auto", "Auto");
        d.addOption("internal", "Internal");
        d.addOption("external", "External");
        d.setValue(current);
        d.onChange(async (v) => {
          if (v === "auto") {
            delete settings.displayAssignments[key];
          } else {
            settings.displayAssignments[key] = {
              identity: v as DisplayIdentitySetting,
              label: display.label,
              width: display.size.width,
              height: display.size.height,
              scaleFactor: display.scaleFactor,
            };
          }
          await this.host.saveSettings();
          this.host.runEvaluateNow();
          this.refresh();
        });
      });
    }
  }

  /* ---------------- rules ---------------- */

  private renderRuleSection(containerEl: HTMLElement, settings: Settings): void {
    new Setting(containerEl).setName("Rules").setHeading();
    new Setting(containerEl).addButton((b) =>
      b.setButtonText("New rule").setCta().onClick(() => {
        this.host.openRuleEditor(createDefaultRule());
      }),
    );

    const listEl = containerEl.createDiv({ cls: "aw-rule-list" });
    renderRuleList(this.app, listEl, settings.rules, this.host.conditionRegistry, this.host.actionRegistry, {
      onEdit: (rule) => this.host.openRuleEditor(rule),
      onToggle: (rule, enabled) => {
        rule.enabled = enabled;
        void this.host.saveSettings().then(() => {
          this.host.runEvaluateNow();
        });
      },
      onDelete: (rule) => {
        settings.rules = settings.rules.filter((r) => r.id !== rule.id);
        void this.host.saveSettings().then(() => {
          this.host.runEvaluateNow();
          this.refresh();
        });
      },
    });
  }
}
