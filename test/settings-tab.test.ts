import { beforeEach, describe, expect, it } from "vitest";
import { Setting, __createdSettings, __setApiVersion, makeStubElement } from "./mocks/obsidian";
import { AdaptiveSettingTab, type SettingsTabHost } from "../src/ui/settings-tab";
import { DEFAULT_SETTINGS, type Settings } from "../src/types/settings";

/**
 * 设置页双轨（声明式 + 命令式）的一致性测试。
 *
 * ## 为什么要有这个测试
 *
 * Obsidian 1.13+ 走 `getSettingDefinitions()`，1.13 以下走 `display()`。
 * 两条路径如果各写一遍 UI，加一个设置就要改两处 —— 迟早漏一处，
 * 出现「1.13+ 有、旧版没有」的不一致。
 *
 * 这类缺陷在 Obsidian 里**不会报错**：设置页照常显示，只是少了一项。
 * 唯一能抓住它的办法就是像这样把两条路径都跑一遍、逐项比对。
 */

/** host 桩的最小形状 —— 显式标注，避免自引用导致的类型推断循环。 */
interface HostStub extends SettingsTabHost {
  savedCount: number;
  evaluateCount: number;
}

function makeHost(settings: Settings): HostStub {
  const host: HostStub = {
    pluginSettings: settings,
    savedCount: 0,
    evaluateCount: 0,
    async saveSettings() {
      host.savedCount += 1;
    },
    listDisplays: () => [
      {
        id: 1,
        label: "Built-in display",
        size: { width: 2560, height: 1600 },
        scaleFactor: 2,
        identity: "unknown",
        detectionMethod: "heuristic-primary",
      },
    ],
    listPlugins: () => [],
    listCommands: () => [],
    conditionRegistry: {} as never,
    actionRegistry: {} as never,
    openRuleEditor: () => undefined,
    openDiagnostics: () => undefined,
    runEvaluateNow: () => {
      host.evaluateCount += 1;
    },
    refreshSettingsTab: () => undefined,
  };
  return host;
}

function makeTab(host: HostStub) {
  const tab = new AdaptiveSettingTab({} as never, {} as never, host);
  tab.containerEl = makeStubElement();
  return tab;
}

/**
 * 一行的指纹：名字 + 挂载的控件类型。
 *
 * **只比较有控件的行** —— 自定义块的宿主行本身没有控件
 * （内容画在它的 controlEl 里），它在两条路径里都存在，
 * 名字还可能不同（命令式的标题行 vs 声明式的 item）。
 * 排除空行后，两边比较的就是**用户真正能交互的那些项**，
 * 这才是「两条路径等价」要保证的东西。
 */
function fingerprint(settings: { name?: string; controls: string[] }[]): string[] {
  return settings
    .filter((s) => s.controls.length > 0)
    .map((s) => `${s.name ?? ""}|${[...s.controls].sort().join(",")}`)
    .sort();
}

beforeEach(() => {
  __createdSettings.length = 0;
  __setApiVersion(false);
});

describe("设置页双轨一致性", () => {
  it("声明式定义包含 4 个分组", () => {
    const host = makeHost({ ...DEFAULT_SETTINGS });
    const tab = makeTab(host);

    const groups = tab.getSettingDefinitions() as { type: string; heading?: string; items: unknown[] }[];

    expect(groups).toHaveLength(4);
    expect(groups.every((g) => g.type === "group")).toBe(true);
  });

  it("分组标题不含插件名，也不含 settings / options / general", () => {
    const host = makeHost({ ...DEFAULT_SETTINGS });
    const tab = makeTab(host);

    const groups = tab.getSettingDefinitions() as { heading?: string }[];
    for (const g of groups) {
      const h = g.heading ?? "";
      if (!h) continue;
      expect(h).not.toMatch(/adaptive workspace/i);
      expect(h).not.toMatch(/\bsettings\b/i);
      expect(h).not.toMatch(/\boptions\b/i);
      expect(h).not.toMatch(/\bgeneral\b/i);
    }
  });

  it("声明式路径的每一项都返回 undefined（不能返回 Setting 对象）", () => {
    // 真实事故：Obsidian 1.13 的声明式渲染器会把 render() 的返回值
    // 当作「行销毁前的清理函数」调用。
    // 如果 render 写成表达式体 `render: (s) => s.addButton(...)`，
    // 返回的是 Setting 组件对象 → Obsidian 当函数调用 →
    // TypeError: t is not a function → **设置子页面永远打不开**。
    const host = makeHost({ ...DEFAULT_SETTINGS });
    const tab = makeTab(host);
    const groups = tab.getSettingDefinitions() as {
      items: { render?: (setting: Setting) => unknown }[];
    }[];

    let checked = 0;
    for (const group of groups) {
      for (const item of group.items) {
        if (!item.render) continue;
        const result = item.render(new Setting(makeStubElement()));
        expect(result).toBeUndefined();
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("自定义块的内容画进的是还活着的容器", () => {
    // Obsidian 的 Setting 结构是 `settingEl > (infoEl, controlEl)`。
    // 如果实现里调用 `setting.settingEl.empty()`，controlEl 会被一起清掉
    // （脱离 DOM）—— 之后往 controlEl 画的内容**不会出现在页面上**。
    //
    // 这类错误在「每个属性都是独立对象」的朴素 mock 里查不出来，
    // 所以这里显式断言容器没被脱离。
    const host = makeHost({ ...DEFAULT_SETTINGS });
    const tab = makeTab(host);
    const groups = tab.getSettingDefinitions() as {
      items: { name?: string; render?: (setting: Setting) => unknown }[];
    }[];

    let checked = 0;
    for (const group of groups) {
      for (const item of group.items) {
        if (!item.render) continue;
        const setting = new Setting(makeStubElement());
        item.render(setting);
        const control = setting.controlEl as unknown as { __detached?: boolean };
        expect(control.__detached).not.toBe(true);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("命令式路径与声明式路径产出的行集合一致", () => {
    const host = makeHost({ ...DEFAULT_SETTINGS });
    const tab = makeTab(host);

    // 命令式：跑 display()，收集 Setting 桩记录下来的行。
    // 标题行（setHeading）排除 —— 声明式路径的标题在 group.heading 字段里，
    // 由下面那条专门断言覆盖。
    tab.display();
    const imperative = fingerprint(__createdSettings.filter((s) => !s.heading));

    // 声明式：跑每一项的 render，收集它产出的行。
    // 每一项产出的是「宿主行」（render 收到的那个 Setting，控件挂在它身上）
    // **加上** render 内部新建的嵌套行 —— 两边口径要对齐。
    __createdSettings.length = 0;
    const groups = tab.getSettingDefinitions() as {
      items: { name?: string; render?: (setting: Setting) => unknown }[];
    }[];
    const declarativeRows: { name?: string; controls: string[] }[] = [];
    for (const group of groups) {
      for (const item of group.items) {
        if (!item.render) continue;
        const host = new Setting(makeStubElement());
        const before = __createdSettings.length;
        item.render(host);
        declarativeRows.push({ name: item.name, controls: host.controls });
        for (const s of __createdSettings.slice(before)) {
          declarativeRows.push({ name: s.name, controls: s.controls });
        }
      }
    }

    expect(imperative.length).toBeGreaterThan(0);
    // 两条路径必须给出同一批设置项 —— 少了任何一项就是漂移。
    expect(fingerprint(declarativeRows)).toEqual(imperative);
  });

  it("两条路径的分组标题集合一致", () => {
    const host = makeHost({ ...DEFAULT_SETTINGS });
    const tab = makeTab(host);

    tab.display();
    const imperativeHeadings = __createdSettings
      .filter((s) => s.heading)
      .map((s) => s.name)
      .filter((n): n is string => typeof n === "string");

    const groups = tab.getSettingDefinitions() as { heading?: string }[];
    const declarativeHeadings = groups.map((g) => g.heading ?? "").filter((h) => h !== "");

    expect(imperativeHeadings.length).toBeGreaterThan(0);
    expect(declarativeHeadings.sort()).toEqual(imperativeHeadings.sort());
  });
});

describe("声明式控件的读写", () => {
  it("getControlValue 从 host.pluginSettings 读", () => {
    const host = makeHost({ ...DEFAULT_SETTINGS, enabled: false });
    const tab = makeTab(host);

    expect(tab.getControlValue("enabled")).toBe(false);
    expect(tab.getControlValue("runCommandsOnStartup")).toBe(false);
  });

  it("setControlValue 写入并保存；主开关额外触发一次评估", async () => {
    const host = makeHost({ ...DEFAULT_SETTINGS });
    const tab = makeTab(host);

    await tab.setControlValue("enabled", false);

    expect(host.pluginSettings.enabled).toBe(false);
    expect(host.savedCount).toBe(1);
    expect(host.evaluateCount).toBe(1);
  });

  it("setControlValue 改非主开关时不触发评估", async () => {
    const host = makeHost({ ...DEFAULT_SETTINGS });
    const tab = makeTab(host);

    await tab.setControlValue("runCommandsOnStartup", true);

    expect(host.pluginSettings.runCommandsOnStartup).toBe(true);
    expect(host.savedCount).toBe(1);
    expect(host.evaluateCount).toBe(0);
  });
});

describe("刷新路径分流", () => {
  it("1.13 以下重跑命令式渲染", () => {
    __setApiVersion(false);
    const host = makeHost({ ...DEFAULT_SETTINGS });
    const tab = makeTab(host);

    __createdSettings.length = 0;
    tab.refresh();
    expect(__createdSettings.length).toBeGreaterThan(0);
  });

  it("1.13+ 用 update() 而不是重跑命令式渲染", () => {
    __setApiVersion(true);
    const host = makeHost({ ...DEFAULT_SETTINGS });
    const tab = makeTab(host);

    let updateCalls = 0;
    tab.update = () => {
      updateCalls += 1;
    };

    __createdSettings.length = 0;
    tab.refresh();

    expect(updateCalls).toBe(1);
    // 声明式路径下不应再走命令式渲染
    expect(__createdSettings.length).toBe(0);
  });
});
