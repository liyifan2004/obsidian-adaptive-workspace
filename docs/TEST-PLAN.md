# Adaptive Workspace 测试计划

版本：0.1.0（MVP）　　状态标记：[自动化] 单元测试已覆盖，`npm run verify` 全绿；[待验证] 需真机 Obsidian 手工执行。

## 一、核心流程端到端测试（手工，按顺序执行）

目标：验证完整生命周期，而非孤立 API。前置：一台笔记本 + 一台外接显示器，测试 vault 已安装本插件及两个可观察的测试插件（如 `Plugin A`、`Plugin B`）。

| 步骤 | 操作 | 预期 | 状态 |
| --- | --- | --- | --- |
| E1 | 内屏启动 Obsidian | 启动首轮不执行 Command 动作；Diagnostics 显示内屏（identity 检测方式如实标注） | 待验证 |
| E2 | 接入外接显示器，把 Obsidian 窗口拖到外屏 | 外屏规则命中，Plugin A 启用 / Plugin B 禁用，仅在实际状态不符时各执行一次 | 待验证 |
| E3 | 外屏上最大化窗口 | `Window State = Maximized` 规则命中，对应动作执行；Diagnostics 的 Window 节显示 maximized | 待验证 |
| E4 | 还原为普通窗口 | 回到窗口化规则；命令动作为边沿触发（进入时一次，不重复） | 待验证 |
| E5 | 拔掉外接显示器 | 环境回内屏，规则恢复内屏期望状态；无报错、无残留 ON→OFF 中间态 | 待验证 |
| E6 | 全程检查 Diagnostics | Display / Window / Rules / Managed Plugins 各节字段与实际一致 | 待验证 |

## 二、22 条场景清单

### 显示器判定（D）

| # | 场景 | 预期 | 状态 |
| --- | --- | --- | --- |
| D1 | 手动指定显示器为 Internal | identity=internal，检测方式=manual | 待验证 |
| D2 | 手动指定显示器为 External | identity=external，检测方式=manual | 待验证 |
| D3 | Auto 模式下 Electron `internal` 标志为 true | 判定 internal，检测方式=electron-flag | 待验证 |
| D4 | Auto 模式且 Electron 标志不可靠，走 primary 启发式 | 启发式结果明确标注（未验证），不伪装成事实 | 待验证 |
| D5 | identity 解析不出（unknown） | internal/external 条件一律不匹配，不静默猜测 | [自动化] |
| D6 | 显示器 ID / 分辨率 / 缩放条件 | 六种运算符判定正确 | [自动化] |
| D7 | 窗口跨两块屏幕 | 最大相交面积屏为 matching display，spanning=true，Diagnostics 显示 matched-by | [自动化] + 待验证 |
| D8 | 拔插显示器后重新 evaluate | 环境检测刷新，规则重新判定 | 待验证 |

### 窗口状态（W）

| # | 场景 | 预期 | 状态 |
| --- | --- | --- | --- |
| W1 | `Window State = Maximized` | 命中最大化，不误判全屏 | [自动化] |
| W2 | `Window State = Fullscreen` | 命中全屏；与 Maximized 严格独立，不合并 | [自动化] |
| W3 | Normal / Maximized / Fullscreen 三态切换 | 各态条件互不混淆 | [自动化] + 待验证 |
| W4 | 窗口 width/height 条件 | 六种运算符判定正确 | [自动化] |
| W5 | resize/move 事件 | 300ms debounce 后合并为一次 evaluate | [自动化] |

### 规则与冲突（R）

| # | 场景 | 预期 | 状态 |
| --- | --- | --- | --- |
| R1 | 两规则对同一插件要求相反（AND/OR 混合） | 高 priority 胜出，败者记 overridden | [自动化] |
| R2 | priority 平局 | 规则数组靠前者胜出 | [自动化] |
| R3 | 一次 evaluate 内冲突合并 | 只输出最终 Desired State，绝不出现 ON→OFF 中间态 | [自动化] |
| R4 | 多规则触发同一命令 | commandId 去重，只执行一次 | [自动化] |

### 动作执行（A）

| # | 场景 | 预期 | 状态 |
| --- | --- | --- | --- |
| A1 | Enable/Disable Plugin 重复 evaluate | 期望态与实际态一致时不再调用 AndSave（幂等） | [自动化] |
| A2 | Command 边沿触发 | 仅规则进入时执行一次；持续命中不重复 | [自动化] |
| A3 | 启动首轮 | 默认不执行 Command；`runCommandsOnStartup` 开启后执行 | [自动化] |
| A4 | 用户手动改受管插件状态 | 下次 evaluate 恢复规则期望状态（写入文档的行为） | [自动化] |
| A5 | 规则试图禁用本插件自身 | 自保护拒绝执行 | [自动化] |
| A6 | 一个命令执行失败 | 不影响其余动作继续执行 | [自动化] |

### 配置与可靠（C）

| # | 场景 | 预期 | 状态 |
| --- | --- | --- | --- |
| C1 | 旧版本 settings 数据迁移 | settingsVersion 迁移正确；0 是合法值不被当缺失 | [自动化] |
| C2 | 损坏/非法配置输入 | sanitize 丢弃坏规则、保留未知字段（前向兼容） | [自动化] |
| C3 | 重复快速事件 / 异常动作 | 无循环触发、无崩溃，异常隔离在单动作内 | [自动化] + 待验证 |
| C4 | 命令选择器中的 Toggle 类命令 | 显示警告提示 | 待验证 |

## 三、已知限制（测试时注意）

1. 本环境无法启动 Obsidian，全部 [待验证] 项需真机完成；[自动化] 项 36 条用例已随 `npm run verify` 通过。
2. 内部 API（`app.plugins` / `app.commands` / remote）行为依赖具体 Obsidian 版本，真机验证时记录 Obsidian 版本号。
3. 卸载插件后受管插件状态残留为预期行为（ADR 0007），测试后手动恢复测试 vault 状态。
