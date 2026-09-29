# 0004. Execute Command 动作采用「规则进入边沿」触发

日期：2026-09-29　状态：已接受

## 背景

Command 是命令式动作，无法 diff。许多命令是 Toggle（如 workspace:toggle-left-sidebar），重复执行 = 状态翻转 = 震荡。resize 高频事件下若每次 evaluate 都执行，Toggle 必乱。

## 决策

Command 动作只在**规则进入边沿**执行一次：该规则从"上一轮不匹配"变为"本轮匹配"时触发；规则持续匹配期间的后续 evaluate 不触发；退出再进入才再次触发。规则内多条件由 AND/OR 定义匹配结果，边沿以整条规则的匹配布尔值为基准。

补充：

- 启动后首轮 evaluate 不触发任何 Command（无"上一轮"，视为冷启动，全部记为已进入），防止 Obsidian 启动时命令风暴；设置里留 `runCommandsOnStartup` 开关（默认关）供用户显式开启。
- 执行失败（命令不存在 / 回调抛错 / checkCallback 拒绝）：捕获、记 log、Diagnostics 标红，不影响其他动作与规则。
- UI 对疑似 Toggle 命令（id/name 含 toggle/切换）加提示徽标，提醒用户本插件只在进入边沿触发。

## 理由

- 边沿语义与"进入某环境执行一次初始化命令"的心智模型一致，且天然防震荡。
- 启动默认不执行，避免与 Obsidian 自身/其他自动化插件的启动动作冲突（安全边界：自动化默认保守）。

## 后果

- 好：Toggle 命令安全；重复 evaluate 零副作用。
- 坏："每次匹配都执行"的需求（如定时刷新类命令）暂不支持——模型里预留 `trigger: "onEnter" | "onEvaluate"`，MVP 只实现 onEnter。
- 跟进：真实用户反馈后再决定是否开放 onEvaluate。
