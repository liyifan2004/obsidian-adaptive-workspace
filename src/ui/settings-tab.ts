import {
  PluginSettingTab,
  Setting,
  requireApiVersion,
  type App,
  type Plugin,
  type SettingDefinitionItem,
} from "obsidian";
import type { Settings, DisplayIdentitySetting } from "../types/settings";
import type { Rule } from "../types/rule";
import type { DisplayDetectionMethod, DisplayIdentity } from "../types/environment";
import type { ConditionRegistry } from "../conditions/condition-registry";
import type { ActionRegistry } from "../actions/action-registry";
import type { CommandLike, PluginManifestLike } from "../core/internal-api";
import { renderRuleList } from "./rule-list";
import { moveRule } from "../utils/rule-order";

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

  /**
   * 声明式设置定义（Obsidian 1.13+）。
   *
   * 1.13+ 由 Obsidian 自己渲染这些定义，并把每一项登记进**设置搜索**
   * （用户在设置里搜「display」「rules」能直接定位到本插件）。
   * 没有它，本插件的设置在 1.13+ 的搜索里**完全不出现** ——
   * Obsidian 商店审查把这条列为 Warning
   * （官方 eslint 规则 `settings-tab/prefer-setting-definitions` 会报出来）。
   *
   * 1.13+ 一旦本方法返回非空数组，Obsidian 就完全绕过 {@link display}，
   * 两条路径共存、不会重复渲染。
   *
   * **本方法必须保持廉价**：Obsidian 会在每次 `update()` 时重新调用它。
   * 所以这里不能读实时状态（`host.listDisplays()` 之类）——
   * 需要实时数据的部分放在 `render` 回调里（渲染时才求值）。
   */
  override getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        // 开场说明段。
        //
        // 官方类型 `SettingDefinitionItem` 允许顶层就是一条含 `render` 的定义
        // （`SettingDefinition`），它会渲染成「所有分组上方的一行」。
        //
        // 2026-11-12 修复：这段说明此前只存在于命令式路径（`renderImperative`
        // 里 `containerEl.createEl("p", …)`），1.13+ 的用户看不到 ——
        // 而它正是设置页要回答的第一个问题（这插件会做什么）。
        name: "About",
        desc: "Automatically adapt your Obsidian workspace based on your display, window, and environment.",
        searchable: false,
        render: (setting: Setting) => {
          // **只清 infoEl，不清 settingEl**：
          // Obsidian 的 Setting 结构是 `settingEl > (infoEl, controlEl)`，
          // empty() 整个 settingEl 会把 controlEl 一起清掉（它已被移出 DOM），
          // 之后往 controlEl 画的内容不会出现在页面上。
          setting.infoEl.empty();
          setting.controlEl.createEl("p", {
            text: "Automatically adapt your Obsidian workspace based on your display, window, and environment.",
            cls: "aw-desc",
          });
          // 显式返回 undefined：Obsidian 会把 render 的返回值当「行销毁前的
          // 清理函数」调用，返回非函数值会抛 TypeError（设置页永远打不开）。
        },
      },
      {
        type: "group",
        items: [
          {
            name: "Enable adaptive workspace",
            desc:
              "When off, no rules are evaluated and nothing is changed. Plugin states produced while it " +
              "was enabled are kept as-is — this plugin never restores them on disable or uninstall.",
            // 用 render 而不是 control：两条渲染路径的结构必须完全一致，
            // 否则「1.13+ 有、旧版没有」的不一致就没法被断言守住。
            // 副作用（保存 + 评估）集中在 {@link setControlValue} 这一个出口。
            render: (setting: Setting) => {
              const settings = this.host.pluginSettings;
              setting.addToggle((t) => {
                t.setValue(settings.enabled).onChange(async (v) => {
                  await this.setControlValue("enabled", v);
                });
              });
            },
          },
          {
            name: "Run commands on startup",
            desc:
              "By default, Execute Command actions do NOT fire on the first evaluation after startup. " +
              "Enable this if your commands should also run when Obsidian starts.",
            render: (setting: Setting) => {
              const settings = this.host.pluginSettings;
              setting.addToggle((t) => {
                t.setValue(settings.runCommandsOnStartup).onChange(async (v) => {
                  await this.setControlValue("runCommandsOnStartup", v);
                });
              });
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Display identity",
        items: [
          {
            // 这一项的内容依赖实时状态（当前接了几块屏、检测方式是什么），
            // 所以只能放在 render 回调里 —— getSettingDefinitions 必须保持廉价。
            name: "Display identity",
            desc: "Tell Adaptive Workspace which display is your laptop screen.",
            searchable: false,
            render: (setting: Setting) => {
              // **只清 infoEl，不清 settingEl**：
              // Obsidian 的 Setting 结构是 `settingEl > (infoEl, controlEl)`，
              // empty() 整个 settingEl 会把 controlEl 一起清掉（它已被移出 DOM），
              // 之后往 controlEl 画的内容不会出现在页面上。
              setting.infoEl.empty();
              this.renderDisplaySection(setting.controlEl, this.host.pluginSettings);
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Rules",
        items: [
          {
            name: "Rules",
            desc: "Rules are evaluated whenever the environment changes.",
            searchable: false,
            render: (setting: Setting) => {
              setting.infoEl.empty();
              this.renderRuleSection(setting.controlEl, this.host.pluginSettings);
            },
          },
        ],
      },
      {
        type: "group",
        items: [
          {
            name: "Diagnostics",
            desc: "Inspect the live environment, matched rules and managed plugins.",
            render: (setting: Setting) => {
              setting.addButton((b) =>
                b.setButtonText("Open diagnostics").onClick(() => this.host.openDiagnostics()),
              );
              setting.addButton((b) => b.setButtonText("Evaluate now").onClick(() => this.host.runEvaluateNow()));
            },
          },
        ],
      },
    ];
  }

  /**
   * 声明式控件的取值：统一从 host.pluginSettings 读。
   *
   * 基类默认读 `this.plugin.settings` —— 本插件的设置存在 host 里
   * （host 是插件与设置页之间的桥），所以必须覆写。
   */
  override getControlValue(key: string): unknown {
    const settings = this.host.pluginSettings as unknown as Record<string, unknown>;
    return settings[key];
  }

  /**
   * 声明式控件的写入：赋值 + 副作用 + 持久化。
   *
   * 副作用集中在这里 —— 声明式 API 的所有控件共用这一个出口，
   * 所以「改了设置要做什么」只有一处实现，不会像命令式那样散落在每个 onChange 里。
   */
  override async setControlValue(key: string, value: unknown): Promise<void> {
    const settings = this.host.pluginSettings as unknown as Record<string, unknown>;

    if (key === "enabled") {
      settings["enabled"] = Boolean(value);
    } else if (key === "runCommandsOnStartup") {
      settings["runCommandsOnStartup"] = Boolean(value);
    } else {
      settings[key] = value;
    }

    await this.host.saveSettings();

    // 主开关变了要立刻重新评估一次 —— 与命令式路径的 onChange 行为一致。
    if (key === "enabled") {
      this.host.runEvaluateNow();
    }
  }

  /**
   * 旧版命令式渲染入口（Obsidian 1.12 及以下）。
   *
   * 1.13+ 一旦 {@link getSettingDefinitions} 返回非空数组，Obsidian 就完全绕过
   * 这个方法。两条路径共存、不会重复渲染。
   *
   * 方法体放在 {@link refresh} 里，是为了让刷新路径可以重画而不必
   * 调用 `this.display()` —— `display()` 在 1.13+ 的类型定义里标了 `@deprecated`，
   * 而官方 eslint 插件禁止用屏蔽注释压掉那条告警
   * （`eslint-comments/no-restricted-disable`）。
   */
  override display(): void {
    this.refresh();
  }

  /**
   * 重画设置页。
   *
   * 两条渲染路径要用不同的调用：
   *   - Obsidian 1.13+：声明式树由框架持有，重调 `display()` 不生效，
   *     必须用官方刷新 API `update()`。
   *   - Obsidian 1.13 以下：命令式渲染器就是渲染器本身，得重跑。
   *
   * `requireApiVersion` 是 Obsidian 官方的运行时特性探测，
   * 即使构建时的类型定义更旧也能正确判断。
   */
  refresh(): void {
    if (requireApiVersion("1.13.0")) {
      this.update();
      return;
    }
    this.renderImperative();
  }

  /**
   * 命令式渲染本体（Obsidian 1.12 及以下）。
   *
   * 与声明式路径共用同一批节实现（显示身份、规则列表、诊断按钮），
   * 所以不会出现「1.13+ 有、旧版没有」的不一致。
   */
  private renderImperative(): void {
    const { containerEl } = this;
    const settings = this.host.pluginSettings;
    containerEl.empty();

    // 开场说明占一个**宿主行**，内容画在 controlEl 里 ——
    // 与声明式路径的结构完全一致，两条路径的行集合才能对上。
    // （此前这里直接往 containerEl 里 createEl，两条路径形态不同。）
    const introHost = new Setting(containerEl).setName("About");
    introHost.infoEl.empty();
    introHost.controlEl.createEl("p", {
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

    // 「显示身份」「规则」两节各占一个**宿主行**（Setting），
    // 内容画在宿主的 controlEl 里 —— 与声明式路径的结构完全一致。
    // 两条路径结构一致，「两条路径等价」这个不变量才能被断言守住。
    //
    // **只清 infoEl，不清 settingEl** —— Obsidian 的 Setting 结构是
    // `settingEl > (infoEl, controlEl)`，empty() 整个 settingEl 会把 controlEl
    // 一起清掉（它已被移出 DOM），之后往 controlEl 画的内容不会出现在页面上。
    const displayHost = new Setting(containerEl).setName("Display identity").setHeading();
    displayHost.infoEl.empty();
    this.renderDisplaySection(displayHost.controlEl, settings);

    const ruleHost = new Setting(containerEl).setName("Rules").setHeading();
    ruleHost.infoEl.empty();
    this.renderRuleSection(ruleHost.controlEl, settings);

    new Setting(containerEl)
      .setName("Diagnostics")
      .setDesc("Inspect the live environment, matched rules and managed plugins.")
      .addButton((b) => b.setButtonText("Open diagnostics").onClick(() => this.host.openDiagnostics()))
      .addButton((b) => b.setButtonText("Evaluate now").onClick(() => this.host.runEvaluateNow()));
  }

  /* ---------------- display identity ---------------- */

  /**
   * 「显示身份」一节的内容。
   *
   * @param body 这一节的内容容器（宿主行的 controlEl）。
   *   - 命令式路径：调用方自建宿主行，取它的 controlEl。
   *   - 声明式路径：item 本身就是宿主行，取它的 controlEl。
   *
   * 两条路径共用这一个实现，所以内容不会漂移。
   */
  private renderDisplaySection(body: HTMLElement, settings: Settings): void {
    body.createEl("p", {
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
      const callout = body.createDiv({ cls: "aw-callout" });
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
      body.createDiv({ cls: "aw-empty", text: "No display information available." });
      return;
    }

    for (const display of displays) {
      const key = String(display.id);
      const current: DisplayIdentitySetting = settings.displayAssignments[key]?.identity ?? "auto";
      const setting = new Setting(body)
        .setName(display.label)
        .setDesc(
          `ID ${display.id} · ${display.size.width}×${display.size.height} DIP · ` +
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

  /**
   * 「规则」一节的内容。
   *
   * 与 {@link renderDisplaySection} 同一个约定：两条渲染路径共用这一个实现，
   * 内容画在调用方给的宿主行里。
   */
  private renderRuleSection(body: HTMLElement, settings: Settings): void {
    new Setting(body).addButton((b) =>
      b.setButtonText("New rule").setCta().onClick(() => {
        this.host.openRuleEditor(createDefaultRule());
      }),
    );

    const listEl = body.createDiv({ cls: "aw-rule-list" });
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
      onMove: (rule, direction) => {
        const next = moveRule(settings.rules, rule.id, direction);
        if (next === settings.rules) return; // boundary no-op
        settings.rules = next;
        void this.host.saveSettings().then(() => {
          this.host.runEvaluateNow();
          this.refresh();
        });
      },
    });
  }
}
