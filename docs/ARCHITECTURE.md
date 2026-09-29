# Adaptive Workspace 架构方案（v2，已确认）

日期：2026-09-29　状态：已接受（v1 草案经用户评审，10 条约束已并入；实现以此为准）

## 0. 定位

JTBD：*当我把 Obsidian 窗口移到不同显示器/不同窗口状态时，我想让指定插件和工作环境自动就位，这样我不用手动开关一堆插件。*

产品定位是 Obsidian 环境自动化引擎（Condition → Rule → Action）。MVP 只做 Display / Window 条件与 Enable Plugin / Disable Plugin / Execute Command 动作；Provider/Registry 只留扩展点，**不实现任意 API 执行器**。

## 1. 已核实的技术事实

| 项 | 结论 | 依据 |
|---|---|---|
| 本机 Obsidian | 1.13.4 | `D:\Obsidian\resources\obsidian.asar` |
| Electron | 28.x | `app.asar` 内 `"electron": "28.x"` |
| @electron/remote | 2.1.3 随 app.asar 内置 | `app.asar` 包清单 |
| `screen` / `BrowserWindow` | 主进程模块，渲染进程须经 remote | Electron 官方文档 |
| `app.plugins` / `app.commands` | 官方 d.ts 未类型化 | 已核对 obsidian-api 仓库 |
| 类型补全 | devDependency `@obsidian-typings/obsidian-public-latest` | obsidian-typings 仓库 |

## 2. 显示器判定（核心，按用户约束强化）

主路径：

```
window.electron.remote.getCurrentWindow() → BrowserWindow
win.getBounds() → screen.getAllDisplays() 自算相交面积 → dominant display
（screen.getDisplayMatching 作对照，不一致时记入 Diagnostics）
```

- **窗口跨屏**：最大相交面积的 Display 为 primary matching display；次大相交 > 窗口面积 10% → `spanning = true`；Diagnostics 显示 "Matched by: Intersection Area"。
- **内/外屏身份是三级解析，且每级都如实标注检测方式（Detection method）**：
  1. `manual`——用户在设置页为每块显示器指定 Internal / External / **Auto**（MVP 一等能力，非可选项）；
  2. `electron-flag`——`Display.internal === true` 才算内屏（`false` 不算外屏证据，因为 Windows 上该字段不可靠）；
  3. `heuristic-primary`——与 primary 相同视为内屏，**明确标注"启发式（未验证）"**，绝不当事实：设置页横幅 + Diagnostics 持续提示"建议手动指定"。
  4. 仍无法判定 → `unresolved`（identity = unknown），`internal` 类条件不匹配，并提示用户手动指定——**不静默猜测**。
- **持久化 key**：`display.id` 为主，附存 `{width, height, scaleFactor}`；id 失效（换接口/重启后变化）时按 size+scaleFactor 唯一匹配兜底，匹配不到视为未分配。
- 坐标统一 DIP，`scaleFactor` 只进条件数据。降级路径（remote 不可用）：DOM 粗粒度模式，能力等级 `degraded`。

## 3. 窗口状态（三态独立，支持直接条件）

`window.state: "normal" | "maximized" | "fullscreen" | "minimized"`，由 `isMaximized()/isFullScreen()/isMinimized()` 独立推导，**maximized 与 fullscreen 绝不合并**。条件支持：

```
Window State = Maximized      （state 属性，enum）
Window Maximized = True       （布尔别名）
Window Fullscreen = True
Window Width >= 1800          （数值比较，六个运算符）
```

## 4. 插件启停实现

- API：`app.plugins.enablePluginAndSave / disablePluginAndSave`（ADR 0005）。
- 状态双源核对：`enabledPlugins` + `plugins`。
- 防护：目标缺失 → warning + Diagnostics 标红 + 跳过；**自保护——永不启停本插件自身**（ADR 0007）；仅 diff 不一致时执行。

## 5. Command Action 实现

- `app.commands.executeCommandById(id)`，try/catch；选择器 `listCommands()` 展示 "命令名 (id)"。
- **Event Action**（区别于 State Action，ADR 0006）：规则进入边沿执行一次；启动首轮默认不执行；设置项 `Run commands on startup` 可开启。
- Toggle 命令（id/name 含 toggle/切换）UI 显示 ⚠ 徽标提示。
- 命令失败：捕获、记 log、Diagnostics 标红，不影响其他 Action。

## 6. 规则模型

```ts
type Operator = "equals" | "notEquals" | "gt" | "gte" | "lt" | "lte";
type ActionTrigger = "onEnter" | "onEvaluate";   // MVP 只实现 onEnter

interface Condition { type: string; property: string; operator: Operator; value: string | number | boolean; }
// State Action:  { type: "enablePlugin" | "disablePlugin", target: pluginId, persist?: boolean }
// Event Action:  { type: "executeCommand", target: commandId, trigger?: ActionTrigger }
interface Rule {
  id: string; name: string; enabled: boolean;
  conditions: Condition[]; conditionLogic: "AND" | "OR";
  actions: Action[]; priority: number;
}
```

- Condition/Action 由注册表解释（`type → schema + evaluate/describe`），UI 按 schema 生成编辑器——加新类型不重写设置页。
- 未知 type：数据保留、条件视为不匹配、动作跳过并告警（前向兼容）。
- 禁止 eval / 任意 JS 表达式。

## 7. 执行引擎（冲突与状态同步）

```
事件（去抖）→ EnvironmentState（含 detection method / matchBy / spanning）
  → 匹配规则（AND/OR）
  → 【合并阶段】按 priority 合并出唯一 DesiredState（插件期望表）＋冲突记录
  → 与实际状态 diff → 每插件至多执行一次动作（绝无 ON→OFF 中间态）
  → Event Action 按规则进入边沿执行
```

- 冲突：priority 高者胜；平局取规则数组靠前者 + Diagnostics 告警（ADR 0006）。
- 语义：受管插件状态以规则为准，用户手动更改会在下次 evaluate 被再强制（ADR 0007，README 写明）。
- 重入保护：执行期间新事件置 dirty，末尾补跑一轮。单规则/单动作失败均隔离。

## 8. 事件与去抖

- 常量集中 `src/config.ts`：`EVALUATE_DEBOUNCE_MS = 300`。
- resize/move → 去抖；maximize/unmaximize/enter-full-screen/leave-full-screen/minimize/restore/display-added/display-removed/display-metrics-changed → 立即（同一 evaluate 管道，末尾合并）。
- 不做 polling；onload 立即 evaluate 一次；全部 listener/timer 在 onunload 清理。

## 9. 设置 UI

- 主页：总开关、Run commands on startup、**Display Identity 列表**（每屏：Auto/Internal/External 下拉 + id/size/当前检测方式）、启发式横幅警告、规则列表（名称/摘要/优先级/启停/编辑/删除）、New Rule、Open Diagnostics、Evaluate now。
- Rule Editor（Modal）：名称、条件行（schema 驱动）、AND/OR、动作行（插件/命令选择器 + trigger）、priority、enabled、Save/Cancel、删除二次确认（写明对象与后果）。

## 10. Diagnostics（MVP 一等组成部分）

- **Display**：ID、Internal/External/Unknown、**Detection method**、Bounds、Resolution、Scale Factor。
- **Window**：Bounds、State、Maximized、Fullscreen、**Spanning**、**Matched by**（如 Intersection Area / Electron getDisplayMatching / DOM fallback）。
- **Obsidian**：Vault、Theme、Active File、能力等级（full/degraded/limited）+ 各内部 API 探测结果。
- **Rules**：Matched ✓/✕、Priority、冲突（winner/overridden）。
- **Managed Plugins**：Current State、Desired State、Last Action、Error。
- **Evaluate log**：最近 50 次记录 + "Evaluate now" 按钮。

## 11. 持久化

`loadData()/saveData()` 存 `{ settingsVersion, settings }`；`MIGRATIONS` 逐级升级；加载净化（缺省补默认、坏类型退回默认、0 是合法值）。不写其他插件文件、不写 Obsidian 核心配置 JSON。

## 12. 目录结构

```
src/
├── main.ts                  # 接线层
├── config.ts                # 常量集中
├── types/  rule.ts condition.ts action.ts environment.ts settings.ts
├── core/   internal-api.ts geometry.ts environment-detector.ts rule-engine.ts state-manager.ts action-executor.ts
├── conditions/  display-condition.ts window-condition.ts condition-registry.ts
├── actions/     plugin-action.ts command-action.ts action-registry.ts
├── ui/     settings-tab.ts rule-list.ts rule-editor.ts diagnostics-view.ts pickers.ts
└── utils/  debounce.ts logging.ts
test/       # vitest：engine / diff / 边沿 / migration / geometry / debounce
```

分层：detector（副作用）→ rule-engine（纯函数）→ state-manager（边沿与台账）→ action-executor（副作用）。纯函数层可单测。

## 13. 工程

- 模板：obsidian-sample-plugin（TS strict + esbuild + eslint + vitest）。
- `npm run verify` = typecheck + lint + test + build，提交前全绿；`scripts/sync-to-vault.mjs` 同步产物。
- `manifest.json`：`id: adaptive-workspace`，`isDesktopOnly: true`。
- 真机测试：`docs/TEST-PLAN.md`（用户核心流程端到端 + 22 条场景清单），未实机验证项标"待验证"，**API 实测行为与文档不一致时暂停并说明，不硬 hack**。

## 14. MVP 明确不做

Time/Theme/Vault/File 条件、Toggle/Set Theme 等动作、任意 API 执行器、第三方 Provider SDK、popout 多窗口、设置导入导出。

## 15. 风险清单

| 风险 | 等级 | 缓解 |
|---|---|---|
| 内部 API 随版本失效 | 高 | 单文件收口（internal-api.ts）+ 运行时探测 + 能力分级降级 |
| `Display.internal` Windows 不可靠 | 高 | 手动映射为一等能力 + 检测方式如实标注 + unresolved 明示 |
| Command Toggle 震荡 | 中 | 边沿触发（ADR 0004/0006） |
| 启停插件副作用重 | 中 | 仅 diff 执行 + 防重入 |
| 手动改状态被弹回引发困惑 | 低 | README/ADR 0007 写明 + Diagnostics 显示台账 |
| macOS 全屏异步 | 低 | 事件驱动 + 去抖后重读（Windows 优先） |
