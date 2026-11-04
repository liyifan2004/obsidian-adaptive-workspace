/**
 * Obsidian 的最小测试桩。
 *
 * 只提供设置页与测试需要的形状 —— 不是完整模拟。
 *
 * 它**记录**每个设置行的名字与挂载的控件，这样测试才能断言
 * 「声明式路径与命令式路径产出的行集合一致」——
 * 这正是双轨改造最该守住的不变量（两份 UI 漂移是这类改造最大的坑，
 * 而且它在 Obsidian 里不会报错，只表现为「少了一项设置」）。
 */

/** 所有被创建出来的 Setting 行 —— 测试用来断言两条渲染路径的一致性。 */
export const __createdSettings: Setting[] = [];

/**
 * 造一个「什么都不做但什么方法都有」的元素桩。
 *
 * 设置页会 createEl / createDiv / createSpan / setAttribute / addClass ……
 * 全部都要有，否则测试会因为桩不完整而失败 ——
 * 那种失败是**桩的问题**，不是被测代码的问题。
 *
 * ## 为什么它要跟踪子节点
 *
 * Obsidian 的 `Setting` 结构是 `settingEl > (infoEl, controlEl)`。
 * `settingEl.empty()` 会把子节点一起清掉 —— 之后往 `controlEl` 画的内容
 * **不会出现在页面上**。
 *
 * 这种「容器已脱离 DOM」的错误在纯方法级 mock 里查不出来
 * （每个属性都是独立对象，互相不知道关系）。
 * 所以这里让 `empty()` 真的把子节点标记为「已清空」。
 */
export function makeStubElement(): HTMLElement {
  const el: Record<string, unknown> = {
    setAttribute: () => undefined,
    getAttribute: () => null,
    addClass: () => undefined,
    removeClass: () => undefined,
    toggleClass: () => undefined,
    hasClass: () => false,
    setText: () => undefined,
    appendChild: () => el,
    remove: () => undefined,
    detach: () => undefined,
    empty: () => {
      // 清空自己：子节点一并失效（模拟真实 DOM 的 empty() 语义）
      for (const child of el.__children as unknown[]) {
        (child as { __detached?: boolean }).__detached = true;
      }
      (el.__children as unknown[]).length = 0;
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    getBoundingClientRect: () => ({ left: 0, top: 0, bottom: 0, right: 0, width: 0, height: 0 }),
    style: {
      setProperty: () => undefined,
      removeProperty: () => undefined,
      getPropertyValue: () => "",
    },
    /** 子节点列表（测试用来判断某容器是否已被清空） */
    __children: [] as unknown[],
    /** 是否已被 empty() 脱离 */
    __detached: false,
  };
  el.createEl = () => makeStubElement();
  el.createDiv = () => makeStubElement();
  el.createSpan = () => makeStubElement();
  return el as unknown as HTMLElement;
}

export class App {}

export class Plugin {}

export class Notice {
  constructor(
    public message: string | DocumentFragment,
    public timeout?: number,
  ) {}
  setMessage(message: string | DocumentFragment): this {
    this.message = message;
    return this;
  }
  hide(): void {
    /* noop */
  }
}

export class Modal {
  contentEl: HTMLElement = makeStubElement();
  titleEl: HTMLElement = makeStubElement();
  modalEl: HTMLElement = makeStubElement();
  scope = {};

  constructor(public app: App) {}

  open(): void {
    /* noop */
  }

  close(): void {
    /* noop */
  }

  onOpen(): void {
    /* noop */
  }

  onClose(): void {
    /* noop */
  }
}

export class SuggestModal<T> extends Modal {
  inputEl: HTMLInputElement = makeStubElement() as unknown as HTMLInputElement;
  resultContainerEl: HTMLElement = makeStubElement();
  limit = 100;
  emptyStateText = "No results found.";

  constructor(app: App) {
    super(app);
  }

  setPlaceholder(_placeholder: string): void {
    /* noop */
  }

  setInstructions(_instructions: unknown): void {
    /* noop */
  }

  getSuggestions(_query: string): T[] | Promise<T[]> {
    return [];
  }

  renderSuggestion(_item: T, _el: HTMLElement): void {
    /* noop */
  }

  onChooseSuggestion(_item: T, _evt: MouseEvent | KeyboardEvent): void {
    /* noop */
  }
}

export class ItemView {
  containerEl: HTMLElement = makeStubElement();
  contentEl: HTMLElement = makeStubElement();

  constructor(public leaf: unknown) {}

  getViewType(): string {
    return "";
  }

  async onOpen(): Promise<void> {
    /* noop */
  }

  async onClose(): Promise<void> {
    /* noop */
  }
}

export class Setting {
  /** 本行的显示名（setName 的入参）。 */
  name: string | undefined;
  /** 本行的描述（setDesc 的入参）。 */
  desc: string | undefined;
  /** 是否是分组标题（setHeading）。 */
  heading = false;
  /** 挂过的控件类型，按挂载顺序。 */
  controls: string[] = [];
  /** 附加按钮的个数。 */
  extraButtons = 0;
  /** controlEl —— 自定义渲染块用它当容器。 */
  controlEl: HTMLElement = makeStubElement();
  /** infoEl —— 名称与描述的容器。自定义块清它来去掉默认文案。 */
  infoEl: HTMLElement = makeStubElement();
  /** settingEl —— 整行的容器。 */
  settingEl: HTMLElement = makeStubElement();

  constructor(public el: unknown) {
    __createdSettings.push(this);
    // 模拟真实的父子结构：controlEl / infoEl 是 settingEl 的子节点。
    // 这样 `settingEl.empty()` 之后往 controlEl 画的内容会被标记为脱离，
    // 测试才能查出「画进了已失效的容器」这类缺陷。
    const children = (this.settingEl as unknown as { __children?: unknown[] }).__children;
    if (children) {
      children.push(this.infoEl, this.controlEl);
    }
  }

  setName(name?: string): this {
    this.name = name;
    return this;
  }

  setDesc(desc?: string): this {
    this.desc = desc;
    return this;
  }

  setHeading(): this {
    this.heading = true;
    return this;
  }

  setTooltip(): this {
    return this;
  }

  setClass(): this {
    return this;
  }

  setDisabled(): this {
    return this;
  }

  setValue(): this {
    return this;
  }

  setPlaceholder(): this {
    return this;
  }

  setCta(): this {
    return this;
  }

  addButton(cb?: (b: ButtonComponent) => void): this {
    this.controls.push("button");
    const button: ButtonComponent = {
      text: "",
      setButtonText: (text: string) => {
        button.text = text;
        return button;
      },
      setIcon: () => button,
      setTooltip: () => button,
      setCta: () => button,
      setDisabled: () => button,
      onClick: () => button,
    };
    cb?.(button);
    return this;
  }

  addToggle(cb?: (t: ToggleComponent) => void): this {
    this.controls.push("toggle");
    const toggle: ToggleComponent = {
      setValue: () => toggle,
      onChange: () => toggle,
      toggleEl: { setAttribute: () => undefined },
    };
    cb?.(toggle);
    return this;
  }

  addDropdown(cb?: (d: DropdownComponent) => void): this {
    this.controls.push("dropdown");
    const dropdown: DropdownComponent = {
      addOption: () => dropdown,
      addOptions: () => dropdown,
      setValue: () => dropdown,
      onChange: () => dropdown,
    };
    cb?.(dropdown);
    return this;
  }

  addExtraButton(cb?: (b: ExtraButtonComponent) => void): this {
    this.extraButtons += 1;
    this.controls.push("extraButton");
    const extra: ExtraButtonComponent = {
      setIcon: () => extra,
      setTooltip: () => extra,
      onClick: () => extra,
      extraSettingsEl: makeStubElement(),
    };
    cb?.(extra);
    return this;
  }
}

/** 按钮组件的最小形状。 */
export interface ButtonComponent {
  text: string;
  setButtonText(text: string): ButtonComponent;
  setIcon(icon: string): ButtonComponent;
  setTooltip(tooltip: string): ButtonComponent;
  setCta(): ButtonComponent;
  setDisabled(): ButtonComponent;
  onClick(fn: () => unknown): ButtonComponent;
}

/** 开关组件的最小形状。 */
export interface ToggleComponent {
  setValue(value: boolean): ToggleComponent;
  onChange(fn: (value: boolean) => unknown): ToggleComponent;
  toggleEl: { setAttribute(name: string, value: string): void };
}

/** 下拉组件的最小形状。 */
export interface DropdownComponent {
  addOption(value: string, label: string): DropdownComponent;
  addOptions(options: Record<string, string>): DropdownComponent;
  setValue(value: string): DropdownComponent;
  onChange(fn: (value: string) => unknown): DropdownComponent;
}

/** 附加按钮组件的最小形状。 */
export interface ExtraButtonComponent {
  setIcon(icon: string): ExtraButtonComponent;
  setTooltip(tooltip: string): ExtraButtonComponent;
  onClick(fn: () => unknown): ExtraButtonComponent;
  extraSettingsEl: HTMLElement;
}

export class PluginSettingTab {
  containerEl: HTMLElement = makeStubElement();

  constructor(public app: App, public plugin: Plugin) {}

  display(): void {
    /* noop */
  }

  /** 1.13+ 的声明式刷新 API。 */
  update(): void {
    /* noop */
  }

  /** 1.13+ 的声明式定义 API。基类没有具体实现，桩里返回空数组。 */
  getSettingDefinitions(): unknown[] {
    return [];
  }

  getControlValue(_key: string): unknown {
    return undefined;
  }

  setControlValue(_key: string, _value: unknown): void | Promise<void> {
    /* noop */
  }
}

/**
 * Obsidian 的运行时特性探测。
 *
 * 桩里默认返回 false —— 也就是「假装跑在 1.13 以下」，
 * 这样命令式路径是默认被测的那条。
 * 测试需要 1.13+ 分支时用 {@link __setApiVersion} 切换。
 */
export function requireApiVersion(_version: string): boolean {
  return currentApiVersion;
}

let currentApiVersion = false;

/** 切换 requireApiVersion 的返回值（测试用）。 */
export function __setApiVersion(value: boolean): void {
  currentApiVersion = value;
}
