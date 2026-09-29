# 0006. Action 二分为 State / Event，冲突解析在 DesiredState 合并阶段

日期：2026-09-29　状态：已接受

## 背景

Enable/Disable Plugin 可以表达为"期望状态"并 diff，但 Execute Command 是一次性事件，无法 diff。若把两者混在一个执行流里按 Rule 顺序依次执行，会出现：同一插件被 Rule A 开、Rule B 关，一次 evaluate 内先 ON 后 OFF 的无意义中间切换。

## 决策

1. Action 显式二分：
   - **State Action**：`enablePlugin` / `disablePlugin` → 声明式，进 DesiredState，走 diff；
   - **Event Action**：`executeCommand` → 命令式，走规则进入边沿（ADR 0004），可配置 `trigger: onEnter | onEvaluate`（MVP 只实现 onEnter）。
2. 冲突解析位置固定在 **DesiredState 合并阶段**：所有匹配规则先按 priority 降序（平局取规则数组靠前者）合并出唯一的插件期望表，Action Executor 只执行合并后的最终结果。一次 evaluate 内每个插件至多一次动作，绝不出现 ON→OFF 中间态。

## 理由

- 状态类动作的冲突本质是"多来源对同一变量赋值"，只能在聚合层解决，不能在执行层抢跑。
- 二分后引擎语义清晰：状态可幂等、事件有边沿，各自的防震荡手段互不干扰。

## 后果

- 好：执行次数最小化；冲突可解释（Diagnostics 记录 winner 与 overridden 规则）。
- 坏：Event Action 无法去重到"最终结果"级别（两条规则同一命令 → 按 commandId 去重，取高优先级规则）。
- 跟进：`onEvaluate` 触发模式暂不实现，模型字段已预留。
