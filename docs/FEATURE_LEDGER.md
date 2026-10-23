# 功能账簿（Feature Ledger）

长期维护依据。每项功能一个稳定 ID，随代码同步更新。事实来源以源码为准；架构决策见 `docs/adr/`，架构总览见 `docs/ARCHITECTURE.md`，测试场景编号（E/D/W/R/A/C/S）见 `docs/TEST-PLAN.md`。

- 版本：0.1.0（MVP）　最近全面核对：2026-10-23
- 状态口径：**已实现**（源码有实现）/ **已验证**（自动化测试或真机复现通过）/ **部分实现**（有明确缺口）/ **待核实**（证据不足）/ **待实现**（有计划未做）
- 覆盖范围：用户可见功能、内部机制、持久化格式、已知限制。README 的宣传性描述不作为依据。

## 总览

| ID | 功能 | 入口 | 状态 | 验证 |
| --- | --- | --- | --- | --- |
| F-001 | 环境状态快照 | 内部（evaluate 管道） | 已实现·已验证 | 自动化（间接） |
| F-002 | 窗口-显示器归属与跨屏判定 | 内部 | 已实现·已验证 | 自动化（geometry） |
| F-003 | 显示器身份三级解析 | 设置页/Diagnostics 显示 | 已实现·已验证 | 自动化（environment-detector）+ 真机单屏 |
| F-004 | 显示器手动映射持久化与兜底匹配 | 设置页 Display Identity | 已实现·已验证 | 自动化（含兜底匹配） |
| F-005 | 环境事件订阅与去抖 | 自动触发 | 已实现·已验证 | 自动化（debounce）+真机 |
| F-006 | DOM 降级路径 | 自动触发 | 已实现·待核实 | 未验证（需无 remote 环境） |
| F-007 | 条件模型与六运算符 | 规则编辑器 | 已实现·已验证 | 自动化 |
| F-008 | Display 条件 | 规则编辑器 | 已实现·已验证 | 自动化 |
| F-009 | Window 条件 | 规则编辑器 | 已实现·已验证 | 自动化 |
| F-010 | 规则匹配（AND/OR、空条件恒真） | 内部 | 已实现·已验证 | 自动化 |
| F-011 | 期望状态合并与冲突解析 | 内部 | 已实现·已验证 | 自动化 |
| F-012 | 规则进入边沿计算 | 内部 | 已实现·已验证 | 自动化 |
| F-013 | 插件启停 State Action（diff、幂等、再强制） | 规则动作 | 已实现·已验证 | 自动化 + 真机 |
| F-014 | 自保护（永不管理本插件） | 动作执行 + 编辑器校验 | 已实现·已验证 | 自动化 |
| F-015 | Command Event Action（onEnter/onEvaluate） | 规则动作 | 已实现·已验证 | 自动化 |
| F-016 | 启动首轮命令抑制 | 设置项 | 已实现·已验证 | 自动化 |
| F-017 | 命令跨规则去重 | 内部 | 已实现·已验证 | 自动化 |
| F-018 | 动作失败隔离 | 内部 | 已实现·已验证 | 自动化 |
| F-019 | 受管插件台账 | Diagnostics | 已实现·已验证 | 自动化 |
| F-020 | 设置模型与输入净化 | 自动（加载时） | 已实现·已验证 | 自动化 |
| F-021 | 设置版本迁移 | 自动（加载时） | 已实现·已验证 | 自动化 |
| F-022 | 内部 API 收口、探测与能力分级 | Diagnostics | 已实现·部分验证 | 自动化（适配层 12 例）+ 真机单环境 |
| F-023 | 设置页（总开关、启动命令开关、诊断入口） | 设置 | 已实现·部分验证 | 真机 |
| F-024 | Display Identity 列表与启发式警告 | 设置页 | 已实现·部分验证 | 真机单屏 |
| F-025 | 规则列表（摘要/启停/编辑/删除确认） | 设置页 | 已实现·部分验证 | 真机 |
| F-026 | 规则编辑器（schema 驱动 + 校验） | 设置页 | 已实现·部分验证 | 真机 |
| F-027 | 目标选择器（插件/命令）与 Toggle 警示 | 规则编辑器 | 已实现·待核实 | C4 待验证 |
| F-028 | Diagnostics 视图 | 命令面板 | 已实现·部分验证 | 真机 |
| F-029 | 命令 evaluate-now | 命令面板 | 已实现·已验证 | 真机 |
| F-030 | 命令 open-diagnostics | 命令面板 | 已实现·已验证 | 真机 |
| F-031 | 日志环形缓冲（evaluate 50 / plugin 200） | Diagnostics | 已实现·已验证 | 自动化（间接） |
| F-032 | 提交一致性校验（manifest/版本） | npm run test | 已实现·已验证 | 自动化（含负向验证） |
| F-033 | 受管插件状态备份/恢复 | 无（设计中） | 待实现 | — |

---

## A. 环境感知

### F-001 环境状态快照（EnvironmentState）
- **用户价值**：规则判定的唯一事实来源，含检测方式标注，问题可诊断。
- **用户入口**：无直接入口；Diagnostics 展示。
- **预期行为**：`getState()` 每次采集显示器、窗口、Obsidian 信息。采集失败时取 DOM 兜底值而非抛异常。（曾含 `signature` 一致性签名字段，因无消费者且"签名去重"会弱化 ADR 0001 再强制收敛而删除，见 ADR 0008/优化清单 O-11。）
- **实现位置**：`src/core/environment-detector.ts`（getState）；`src/types/environment.ts`。
- **依赖与约束**：F-022（InternalApi）、F-002、F-003。
- **状态**：已实现。
- **验证方式**：间接经 rule-engine/state-manager 测试；真机 S7/S10 待验证。
- **已知问题**：无。
- **关联**：F-002、F-003、F-005。

### F-002 窗口-显示器归属与跨屏判定
- **用户价值**：窗口在多屏间移动时规则跟随正确的屏。
- **用户入口**：自动触发；Diagnostics "Matched by"。
- **预期行为**：按窗口与各屏相交面积取最大者为归属屏；次大相交 > 窗口面积 10%（`SPANNING_RATIO_THRESHOLD`）标 `spanning=true`；窗口零面积（最小化）时确定性取第 0 块屏；与 Electron `getDisplayMatching` 结果不一致时写入 matchNote（以相交面积为准）。
- **实现位置**：`src/core/geometry.ts`（intersectionArea、matchDisplay）；`environment-detector.ts` 交叉核对逻辑。
- **依赖与约束**：坐标为 Electron DIP。
- **状态**：已实现。
- **验证方式**：自动化 6 例（test/geometry.test.ts）；真机 D7 跨屏待验证。
- **已知问题**：零面积窗口"取第 0 块"是确定性占位，不是语义正确；最小化时条件判定可能指向任意屏（当前仅影响 minimized 场景）。
- **关联**：F-001、F-003。

### F-003 显示器身份三级解析（internal/external/unknown）
- **用户价值**：`internal/external` 条件可靠或明确"不知道"，不静默猜错。
- **用户入口**：设置页每屏下拉（F-024）；Diagnostics 显示 Detection method。
- **预期行为**：解析顺序：①手动映射（manual）→ ②`display.internal === true` 才判 internal（electron-flag）→ ③与 primary 同屏判 internal、其余判 external（heuristic-primary，如实标注"启发式未验证"）→ ④仍无法判定为 unknown/unresolved，internal/external 条件一律不匹配。
- **实现位置**：`environment-detector.ts` resolveDisplay。
- **依赖与约束**：Windows 上 Electron `internal` 字段不可靠（ADR 0002）。
- **状态**：已实现·已验证。
- **验证方式**：条件侧"unknown 不匹配 internal/external"已自动化（rule-engine.test.ts）；resolveDisplay 各分支（manual 覆盖 electron-flag、electron-flag、auto 落入自动检测、internal=false 不作外屏证据、primary 启发式、无 primary 拒绝猜测）已自动化（test/environment-detector.test.ts）；真机 D1~D4 待验证（单屏 heuristic 路径曾真机通过）。
- **已知问题**：heuristic 把非 primary 一律判 external，无 primary 时才 unresolved；多外屏场景正确性未验证（S1）。
- **关联**：F-004、F-008。

### F-004 显示器手动映射持久化与兜底匹配
- **用户价值**：换接口/重启后 display.id 变化时手动指定仍生效。
- **用户入口**：设置页 Display Identity 下拉（Auto/Internal/External）。
- **预期行为**：选择 internal/external 时以 `String(display.id)` 为 key 写入 `displayAssignments` 并存宽高/scaleFactor；选 Auto 删除条目。读取时先精确 id 匹配，失败后按 width+height+scaleFactor **唯一**匹配兜底，多个候选视为未分配。保存后立即重评估并刷新设置页。
- **实现位置**：`ui/settings-tab.ts`（renderDisplaySection）；`environment-detector.ts` findAssignment；`types/settings.ts` sanitizeDisplayAssignments。
- **依赖与约束**：持久化格式 `displayAssignments`（settingsVersion 1）。
- **状态**：已实现·已验证。
- **验证方式**：净化逻辑（migration.test.ts）；兜底匹配（唯一尺寸匹配生效、歧义匹配放弃、精确 id 优先）已自动化（test/environment-detector.test.ts）。
- **已知问题**：同规格双屏（同分辨率同缩放）时兜底失效（设计如此，靠 id）；id 变化且规格重复时用户需重新指定——无提示。
- **关联**：F-003、F-020。

### F-005 环境事件订阅与去抖
- **用户价值**：拖动/缩放窗口不抖动，离散状态变化立即响应。
- **用户入口**：自动触发。
- **预期行为**：resize/move 走 300ms trailing debounce；maximize/unmaximize/minimize/restore/enter-full-screen/leave-full-screen/display-added/display-removed/display-metrics-changed 立即评估（取消挂起的去抖）；另挂 DOM resize/fullscreenchange 作补充。onunload 与 register() 双路清理全部监听和 timer。
- **实现位置**：`internal-api.ts` subscribeWindowEvents/subscribeDisplayEvents；`environment-detector.ts` subscribe；`main.ts` 事件接线；`utils/debounce.ts`。
- **依赖与约束**：Electron BrowserWindow/screen 事件（F-022）。
- **状态**：已实现。
- **验证方式**：debounce 工具 3 例自动化；事件接线真机通过（20 次快速拖动无抖动、纯移动无误动作）。
- **已知问题**：去抖期间的离散事件会 cancel 挂起评估并立即评估，行为正确但未单测；DOM resize 与 Electron resize 双触发由去抖吸收。
- **关联**：F-017（评估管道）、F-022。

### F-006 DOM 降级路径
- **用户价值**：remote 不可用时插件不崩，粗粒度仍可用。
- **用户入口**：自动（能力等级 degraded 显示于 Diagnostics）。
- **预期行为**：无 remote 时用 `window.screen` 合成单显示器、screenX/outerWidth 估窗口 bounds、maximized 用 avail 尺寸近似、fullscreen 用 document.fullscreenElement；matchMethod 标 `dom-fallback`。
- **实现位置**：`internal-api.ts` domDisplays、getWindowBounds/getWindowState 兜底分支。
- **依赖与约束**：原生全屏在 DOM 路径不可检测（代码注释明示）。
- **状态**：已实现，**待核实**（无真实降级环境跑过）。
- **验证方式**：无。
- **已知问题**：降级下 display identity 恒走 heuristic/unresolved；跨屏完全失效。风险已在 README Limitations 声明。
- **关联**：F-022。

## B. 规则引擎（纯函数层）

### F-007 条件模型与六运算符
- **用户价值**：表达力（=、≠、>、≥、<、≤）且类型安全。
- **用户入口**：规则编辑器条件行（schema 驱动）。
- **预期行为**：`Condition {type, property, operator, value}`；数值比较对非数值先 Number() 转换，NaN 一律 false；boolean/enum 属性仅 equals/notEquals（schema 约束）。
- **实现位置**：`conditions/condition-registry.ts`（compare、ConditionDef schema）。
- **状态**：已实现·已验证。
- **验证方式**：自动化（rule-engine.test.ts "compare"）。
- **已知问题**：equals 对 number vs string `"5"` 严格不等（用户输入框产出 number，行为一致；但持久化旧数据若为字符串则不匹配——净化层只校验类型不转换）。
- **关联**：F-008、F-009、F-026。

### F-008 Display 条件
- **用户价值**：按屏身份/规格触发规则。
- **用户入口**：规则编辑器 → Display。
- **预期行为**：属性 identity（enum）、internal（boolean，unknown 恒 false）、id/width/height/scaleFactor（number 六运算符）。width/height 取 `display.size`（物理像素）。
- **实现位置**：`conditions/display-condition.ts`。
- **状态**：已实现·已验证。
- **验证方式**：自动化（含 unknown 不匹配用例）；真机 D5/D6 部分。
- **已知问题**：README 表述与实现一致；无 spanning 属性可作条件（仅诊断展示）。
- **关联**：F-003。

### F-009 Window 条件
- **用户价值**：按窗口状态/尺寸触发。
- **用户入口**：规则编辑器 → Window。
- **预期行为**：state（normal/maximized/fullscreen/minimized，三态独立绝不合并）、maximized、fullscreen（boolean）、width/height（number，逻辑像素）。
- **实现位置**：`conditions/window-condition.ts`。
- **状态**：已实现·已验证。
- **验证方式**：自动化（W1/W2/W4）。
- **已知问题**：无 minimized 布尔别名（可用 state 替代）；无窗口位置（x/y）条件。
- **关联**：F-001。

### F-010 规则匹配
- **用户价值**：AND/OR 组合条件；未知条件类型不误触发。
- **用户入口**：规则编辑器 Condition logic 下拉。
- **预期行为**：`enabled=false` 的规则不匹配；空条件数组视为恒真（编辑器禁止保存空条件规则，净化层删除"条件与动作皆空"的规则）；未知条件 type 视为 false（前向兼容）。
- **实现位置**：`core/rule-engine.ts` evaluateRuleMatch。
- **状态**：已实现·已验证。
- **验证方式**：自动化。
- **已知问题**：语义缝隙——净化层允许"有动作无条件"的规则（恒真执行），编辑器却要求至少一条件；手工编辑 data.json 可产生恒真规则（未在文档声明）。
- **关联**：F-020、F-026。

### F-011 期望状态合并与冲突解析
- **用户价值**：多规则同管一插件时结果确定、可解释，绝无 ON→OFF 中间态。
- **用户入口**：Diagnostics 显示 overridden 冲突。
- **预期行为**：匹配规则按 priority 降序（平局按数组位置），首个写入者胜出，败者记 `overridden`；相反意愿产生 warning；命令类事件按 commandId 去重（F-017）。输出 `pluginDesires` 是执行器唯一输入。
- **实现位置**：`core/rule-engine.ts` evaluateRules（ADR 0001/0006）。
- **状态**：已实现·已验证。
- **验证方式**：自动化（R1~R4）。
- **已知问题**：同一规则内对同插件 enable+disable 两个动作时，先写者胜（按规则内动作顺序），无 warning——语义未文档化。
- **关联**：F-013、F-017。

### F-012 规则进入边沿计算
- **用户价值**：命令只在规则"进入"时执行一次。
- **用户入口**：无（内部）。
- **预期行为**：`computeRuleEdges(matchedIds, previousIds)` 返回新进入的规则 id；首轮 previous 为空故全部算进入，由调用方决定是否放行（F-016）。
- **实现位置**：`core/rule-engine.ts` computeRuleEdges；`core/state-manager.ts` 消费。
- **状态**：已实现·已验证。
- **验证方式**：自动化。
- **已知问题**：边沿状态仅存内存，重启后首轮全部视为新进入（与 F-016 的启动抑制共同兜底）。
- **关联**：F-015、F-016。

## C. 执行

### F-013 插件启停 State Action
- **用户价值**：声明式管理插件开关，幂等、可重复评估。
- **用户入口**：规则动作 Enable/Disable Plugin。
- **预期行为**：仅当 current ≠ desired 时调用 `enablePluginAndSave/disablePluginAndSave`；执行后重读实际状态记台账；用户手动改动会在下次评估被再强制（ADR 0007，README 已声明）；目标未安装 → warning + 跳过。
- **实现位置**：`core/state-manager.ts` apply；`core/action-executor.ts` setPluginEnabled；`actions/plugin-action.ts`。
- **依赖与约束**：内部 API（F-022）；`Action.persist` 是 ADR 0005 明确**预留**的 schema 字段（为未来"仅会话"动作保兼容），当前执行路径恒用 AndSave，写入该字段无效果且无 UI 入口。
- **状态**：已实现·已验证。
- **验证方式**：自动化（A1/A4/S8 部分）+ 真机（community-plugins.json 落盘核对）。
- **已知问题**：`persist` 字段写了不生效（见"依赖与约束"，属预留非缺陷）。禁用/卸载本插件不恢复状态（明确设计）。
- **关联**：F-014、F-019、F-022。

### F-014 自保护
- **用户价值**：规则永远不能把自适应引擎自己关掉导致"锁死"。
- **用户入口**：编辑器校验拦截 + 执行层兜底。
- **预期行为**：`ActionExecutor.setPluginEnabled` 拒绝 `pluginId === PLUGIN_ID` 并记 error；规则编辑器对 enablePlugin/disablePlugin 指向自身时报错不保存。
- **实现位置**：`core/action-executor.ts`；`ui/rule-editor.ts` validate。
- **状态**：已实现·已验证。
- **验证方式**：自动化（A5）。
- **已知问题**：编辑器校验硬编码 `a.type === "enablePlugin" || "disablePlugin"`，未走 registry 的 category/stateEffect——新增 State 类动作会绕过编辑器校验（执行层仍兜底）。
- **关联**：F-013。

### F-015 Command Event Action
- **用户价值**：进入某环境时执行命令（如专注模式）。
- **用户入口**：规则动作 Execute Command + trigger 下拉。
- **预期行为**：trigger `onEnter`（默认）仅在规则进入边沿执行一次；`onEvaluate` 每次匹配评估都执行，但同一命令受最小间隔限流（`ON_EVALUATE_MIN_INTERVAL_MS` 2000ms 内至多一次，超出的合并为间隔末补跑一次；手动评估绕过并取消排队补跑，ADR 0008）——均在 F-016 抑制规则内。命令不存在/被 checkCallback 拒绝 → warning 不崩溃；抛异常 → 捕获记录。
- **实现位置**：`actions/command-action.ts`；`state-manager.ts` Event Actions 段 + 限流/补跑（lastCommandRunAt/trailingQueue）；`action-executor.ts` executeCommand。
- **依赖与约束**：`app.commands.executeCommandById`（内部 API）。
- **状态**：已实现·已验证。
- **验证方式**：自动化（A2/A6 + 限流 5 例：deferred 补跑、按命令独立、手动绕过并取消排队、onEnter 不限流、dispose 取消 timer）。
- **已知问题**：`onEvaluate` 严格意义上不再是"每轮评估都执行"（间隔内合并，语义已在 ADR 0008/README 声明）；间隔值为常量不可配（O-15 候选）。Toggle 命令结果依赖未知现态（F-027 提示，无法根治）。
- **关联**：F-012、F-016、F-017。

### F-016 启动首轮命令抑制
- **用户价值**：开机不乱跑命令，可按需开启。
- **用户入口**：设置 "Run commands on startup"。
- **预期行为**：首轮评估（`firstRunDone` 之前）不执行任何命令事件，除非开启该设置；State Actions 不受抑制（插件状态应立即就位）。
- **实现位置**：`state-manager.ts` allowCommands；`types/settings.ts` runCommandsOnStartup。
- **状态**：已实现·已验证。
- **验证方式**：自动化（A3）。
- **已知问题**：无。
- **关联**：F-012、F-015。

### F-017 命令跨规则去重
- **用户价值**：同一命令同轮只执行一次，避免重复副作用。
- **用户入口**：无（Diagnostics/warning 可见）。
- **预期行为**：`commandEvents` 按 commandId 去重，高优先级规则的 trigger 语义生效，其他规则产生 warning。
- **实现位置**：`core/rule-engine.ts`。
- **状态**：已实现·已验证。
- **验证方式**：自动化（R4）。
- **已知问题**：不同 trigger（onEnter vs onEvaluate）请求同一命令时以高优先级者的 trigger 为准，另一规则的边沿**永久不再触发**该命令——warning 提示但语义未在 README 写明。
- **关联**：F-011。

### F-018 动作失败隔离
- **用户价值**：一个动作失败不影响其余。
- **用户入口**：无（Diagnostics Error 行）。
- **预期行为**：单动作异常捕获进 ledger/evaluateLog/pluginLog，循环继续；评估管道顶层 try/catch 防崩溃。
- **实现位置**：`action-executor.ts`、`state-manager.ts`、`main.ts` runEvaluate。
- **状态**：已实现·已验证。
- **验证方式**：自动化（A6 + throwing dependency 用例）。
- **已知问题**：`main.runEvaluate` 顶层 catch 后 `lastResult` 可能停留在旧值，Diagnostics 显示滞后一轮。
- **关联**：F-019、F-028。

### F-019 受管插件台账（Ledger）
- **用户价值**：本插件动过哪些插件、期望/实际状态、最后动作与错误一目了然。
- **用户入口**：Diagnostics → Managed plugins。
- **预期行为**：每插件记录 desired/current/lastAction/lastError；current 在动作后重读；仅内存态，重启清空。
- **实现位置**：`state-manager.ts` ledger。
- **状态**：已实现·已验证。
- **验证方式**：自动化（ledger 记录用例）。
- **已知问题**：台账不持久化，重启后 Diagnostics 无法回答"上次动过谁"（用户需自行恢复状态的场景下信息缺失）。
- **关联**：F-013、F-028。

### F-033 受管插件状态备份/恢复（v0.2 设计，待实现）
- **用户价值**：禁用/卸载本插件后受管插件状态可回到"被管理前"，消除 README Limitations 的最大痛点（对标 Control Center / Plugins-Toggler，见 TECHNICAL_REFERENCES R4）。
- **用户入口**：（设计）命令面板显式恢复命令 + 可选"禁用本插件时自动恢复"开关。
- **预期行为**：（设计稿）①baseline 采集：首次对某插件执行 enable/disable 动作前记录其当时状态（managedBaseline）；②恢复语义：显式命令按 baseline 逐个恢复并清空 baseline；③自动恢复为可选项（默认关）；④崩溃/强退无法保证恢复（只能尽力），Obsidian 正常退出时 onunload 可恢复但存在写盘竞态；⑤与 ADR 0005 `persist` 预留字段同属"状态生命周期"主题，实现时一并考虑"仅会话"动作。
- **实现位置**：未实现（设计决策记录于 CHANGELOG_DEV O-07，2026-10-23 立项）。
- **依赖与约束**：F-013（动作执行）、F-019（台账）、F-020（持久化 schema 需扩 managedBaseline + 版本迁移）。
- **状态**：**待实现**（v0.2 候选）。
- **验证方式**：—。
- **已知问题**：恢复语义有争议面（手动改过的插件要不要覆盖？），实现前需用户确认最终语义。
- **关联**：F-013、F-019、F-020。

## D. 配置与持久化

### F-020 设置模型与输入净化
- **用户价值**：data.json 被破坏/篡改时插件不崩、不执行坏配置。
- **用户入口**：自动（loadSettings）。
- **预期行为**：`{settingsVersion, settings}` 结构；所有字段类型校验，坏值退回默认（0 是合法值）；坏条件/动作条目被丢弃；未知字段**不保留**（当前净化只输出已知 schema 字段——注释称"保留未知字段"指条件/动作的 type 值保留，非字段透传）；空条件且空动作的规则整条丢弃。
- **实现位置**：`types/settings.ts` sanitize*。
- **状态**：已实现·已验证。
- **验证方式**：自动化（migration.test.ts，C1/C2）。
- **已知问题**：条件/动作的未知 type 会被**保留**在数据里（前向兼容），但附加字段（如新版插件加的 action 参数）会被净化剥离——降级再升级会丢数据，README 未声明。
- **关联**：F-021。

### F-021 设置版本迁移
- **用户价值**：升级不丢配置。
- **用户入口**：自动。
- **预期行为**：`MIGRATIONS[fromVersion]` 逐级执行（当前 0→1 为恒等）；高于当前版本的数据降级按当前 schema 净化保留可识别部分；migrated 标志写日志。
- **实现位置**：`types/settings.ts` migrate。
- **状态**：已实现·已验证。
- **验证方式**：自动化。
- **已知问题**：迁移不回写 saveData（下次保存才落盘 v1）——无害但日志/数据可短暂不一致。
- **关联**：F-020。

## E. 内部 API 层

### F-022 内部 API 收口、探测与能力分级
- **用户价值**：非公开 API 风险集中一处，失效可见不静默。
- **用户入口**：Diagnostics → Capability。
- **预期行为**：全部 `app.plugins`/`app.commands`/`electron.remote` 访问收口 `internal-api.ts`（ADR 0003）；`probe()` 检测 remote/screen/BrowserWindow/plugins/commands 可用性并缓存；tier：full（全通）/ limited（无 plugins 或 commands）/ degraded（无 remote）；remote 获取支持 `window.electron.remote` → `require('electron').remote` → `require('@electron/remote')` 三级。
- **实现位置**：`core/internal-api.ts`。
- **依赖与约束**：Obsidian 1.13.4 / Electron 28 / @electron/remote 2.1.3 已实测；minAppVersion 1.7.2 的兼容性**未逐版本验证**。
- **状态**：已实现；跨版本/跨平台仍**待核实**。
- **验证方式**：适配层逻辑已自动化（test/internal-api.test.ts 12 例：remote 三级发现、tier 分级、DOM 兜底、插件/命令 shim）；真机单环境（Obsidian 1.13.x）通过。
- **已知问题**：`isPluginEnabled` 在 `enabledPlugins` 缺失时以"实例存在"近似；`listCommands` 兜底读 `commands` record——这些近似路径行为已单测锁定，但真实 Obsidian 版本差异仍待真机核实。tier=limited 时规则动作会逐条失败并记 warning（体验可接受但无总提示）。
- **关联**：F-006、F-013、F-015。

## F. 用户界面

### F-023 设置页
- **用户价值**：一页管理开关、显示器、规则、诊断。
- **用户入口**：Settings → Adaptive Workspace。
- **预期行为**：总开关（关闭即停评估，不回滚已生效状态）、Run commands on startup、Display Identity 区（含启发式警告横幅）、规则区（New rule + 列表）、Diagnostics 区（Open diagnostics / Evaluate now）。改动即保存并重评估。
- **实现位置**：`ui/settings-tab.ts`。
- **状态**：已实现·部分验证。
- **验证方式**：真机操作通过。
- **已知问题**：落盘失败已改为可见（log + Notice，2026-10-23 起，saveSettings 永不 reject）；`settings-tab/prefer-setting-definitions` lint 警告已知接受（1.7.2 兼容）。
- **关联**：F-004、F-025、F-026。

### F-024 Display Identity 列表与启发式警告
- **用户价值**：手动消除内/外屏猜测。
- **用户入口**：设置页 Display identity 区。
- **预期行为**：每屏一行（label、id、分辨率、缩放、当前检测方式），下拉 Auto/Internal/External；存在 heuristic/unresolved 时显示 ⚠ 横幅；改动立即保存+重评估+刷新。
- **实现位置**：`ui/settings-tab.ts` renderDisplaySection。
- **状态**：已实现·部分验证。
- **验证方式**：真机单屏（Auto→heuristic 路径）。
- **已知问题**：显示器热插拔后下拉状态需手动刷新设置页（display() 重入才更新）；选 Auto 时删除 assignment 无确认（低风险）。
- **关联**：F-003、F-004。

### F-025 规则列表
- **用户价值**：一眼看清规则语义与状态。
- **用户入口**：设置页 Rules 区。
- **预期行为**：按 priority 降序展示名称+语义摘要（summarizeRule）、启停 toggle、上/下移按钮（交换相邻规则 priority，同 priority 时交换数组平局顺序；边界禁用）、编辑、删除（二次确认写明条件/动作数量与不可撤销）。变更保存后立即重评估。
- **实现位置**：`ui/rule-list.ts`；`utils/rule-order.ts` moveRule（纯函数，含单测）。
- **状态**：已实现·部分验证。
- **验证方式**：moveRule 纯函数 6 例自动化（跨优先级交换、同优先级平局换位、边界/未知 id 同实例 no-op、不可变性、逐级移动）；按钮 UI 真机待验证。
- **已知问题**：暂不支持拖拽排序（上下移按钮已达同等目的、键盘可访问）；删除不可撤销且无导出备份（MVP 范围内已声明不做导入导出）。
- **关联**：F-026。

### F-026 规则编辑器（schema 驱动）
- **用户价值**：加新条件/动作类型不重写 UI。
- **用户入口**：New rule / 编辑。
- **预期行为**：名称、AND/OR、条件行（type/property/operator/value 按 registry schema 渲染）、动作行（类型 + 目标选择器 + trigger）、priority、enabled、Save/Cancel；校验：名称非空、≥1 条件、每条条件有 type+property、动作有目标、动作非自指、≥1 动作；错误集中展示。
- **实现位置**：`ui/rule-editor.ts`。
- **状态**：已实现·部分验证。
- **验证方式**：真机（含自指拒绝回归，commit 0dc34a9）。
- **已知问题**：未知条件/动作 type 可显示但只能删除（合理）；改类型时目标清空不提示；校验要求 ≥1 条件与 F-010 空条件恒真语义不一致（见 F-010）。
- **关联**：F-007、F-010、F-014、F-027。

### F-027 目标选择器与 Toggle 警示
- **用户价值**：从几百个命令/插件里快速选中，危险命令有提示。
- **用户入口**：规则编辑器动作行按钮。
- **预期行为**：PluginSuggestModal/CommandSuggestModal（按名称+id 搜索，展示描述）；id 或名含 toggle/切换 的命令显示 ⚠"仅在规则进入时执行一次"。
- **实现位置**：`ui/pickers.ts`；`actions/command-action.ts` isLikelyToggleCommand。
- **状态**：已实现·**待核实**（C4 待验证）。
- **验证方式**：无自动化（纯 UI）。
- **已知问题**：toggle 启发式漏检（如 "Toggle" 之外的翻转类命令）；选择器不显示命令所属插件，同名命令难区分。
- **关联**：F-015。

### F-028 Diagnostics 视图
- **用户价值**：出问题时 30 秒定位在哪一层。
- **用户入口**：命令面板 open-diagnostics（右侧栏，幂等复用 leaf）。
- **预期行为**：Capability/Display/Window/Obsidian/Rules（含冲突）/Managed plugins（含"状态不恢复"提示）/Evaluate log（近 8 条）/Plugin log（近 10 条）+ Evaluate now 按钮（200ms 后重渲染）。
- **实现位置**：`ui/diagnostics-view.ts`；数据源 `main.getSnapshot`。
- **状态**：已实现·部分验证。
- **验证方式**：真机单屏（E6 待全量核对）。
- **已知问题**：evaluate log 只显示 8 条（存储 50）无滚动加载；渲染为全量重建，无增量更新。刷新时机：评估管道完成后由 `refreshDiagnostics()` 统一重渲染（2026-10-23 起移除了与管道重复的定时刷新；总开关关闭时点击 "Evaluate now" 也会刷新快照）。
- **关联**：F-001、F-018、F-019、F-031。

### F-029 命令 evaluate-now
- **用户价值**：手动立即生效（如刚改完规则）。
- **用户入口**：命令面板 "Evaluate workspace rules now"。
- **预期行为**：取消挂起去抖并立即评估一次；作为显式用户意图**绕过 onEvaluate 限流**并取消已排队的补跑（ADR 0008）。
- **实现位置**：`main.ts` runEvaluateNow（manual 标志经 runEvaluate 传入 state-manager.apply）。
- **状态**：已实现·已验证（真机）。
- **已知问题**：无。

### F-030 命令 open-diagnostics
- **用户价值**：快速打开诊断。
- **用户入口**：命令面板 "Open environment diagnostics"。
- **预期行为**：已有诊断 leaf 则 reveal，否则在右侧栏创建。
- **实现位置**：`main.ts` activateDiagnosticsView。
- **状态**：已实现·已验证（真机）。
- **已知问题**：`getRightLeaf(false)` 返回 null 时静默无反馈（罕见布局下）。

### F-031 日志环形缓冲
- **用户价值**：有限内存内保留最近历史。
- **用户入口**：Diagnostics 底部两节。
- **预期行为**：evaluateLog 50 条、PluginLog 200 条（`config.ts` 常量），超限丢最旧；PluginLog 有 clear()（当前无 UI 调用方）。
- **实现位置**：`utils/logging.ts`、`state-manager.ts`、`config.ts`。
- **状态**：已实现·已验证（间接）。
- **已知问题**：`PluginLog.clear()` 无入口（预留）。

## G. 工程保障

### F-032 提交一致性校验（manifest/版本）
- **用户价值**：社区商店提交约束（禁词、description 格式、必填键、三方版本一致）在开发期被自动拦截，不靠人工记忆。
- **用户入口**：`npm run test`（verify 链的一部分）。
- **预期行为**：`test/manifest.test.ts` 校验：必填键与类型、无多余键、id/name/description 不含 "obsidian"/"plugin"、description 格式（10–250 字符、大写开头、句号结尾、限定字符集）、id 小写连字符、manifest/package.json/versions.json 版本一致。约束来源为官方 validate-manifest 规则（该规则因 AST 形状不兼容在本仓库 lint 中无法生效，见 TECHNICAL_REFERENCES R1）。
- **实现位置**：`test/manifest.test.ts`。
- **状态**：已实现·已验证（含负向验证：description 含禁词时测试失败）。
- **已知问题**：约束是官方规则的**手工转录**，上游规则变更时需同步（已在测试头注释注明来源）。

---

## 交叉验证记录

- 2026-10-23：逐文件通读全部 26 个 src 文件 + 7 个测试文件 + manifest/package/README/ARCHITECTURE/TEST-PLAN/7 ADR，与本账簿逐条对照。抽样回查：F-013/F-015/F-016（state-manager.apply 与测试用例）、F-003（resolveDisplay 四级逻辑）、F-020（sanitize 剥离行为）。
- 确认**无单测**覆盖：environment-detector（F-003/F-004 兜底）、internal-api（F-022）、全部 UI（F-023~F-028）、main.ts 接线（F-005 事件路由、F-018 顶层管道）。
- 真机已验证：单屏窗口链路、去抖、三态独立、重启幂等、单屏 identity（TEST-PLAN 零节，2026-09-09/09-29）。多显示器场景（D7/D8、E1~E6、S1~S10）**全部待验证**——需外接显示器硬件。
- 2026-10-23（首批优化后）：新增 test/environment-detector.test.ts（13 例，F-003/F-004/F-001/F-002）与 test/manifest.test.ts（6 例，F-032），vitest 60/60 通过；F-023/F-026/F-028 已知问题随修复更新；F-013 的 `persist` 字段改按 ADR 0005"预留"表述。
- 2026-10-23（第二批）：新增 test/internal-api.test.ts（12 例，F-022），vitest 72/72 通过；F-022/F-023 验证与已知问题随修复更新。
- 2026-10-23（第三批）：state-manager 限流补跑（F-015，5 例新测试）、moveRule（F-025，6 例新测试）、删除 `signature`（F-001），vitest **83/83** 通过；F-001/F-015/F-025/F-029 同步更新，新增 F-033（待实现设计）。
