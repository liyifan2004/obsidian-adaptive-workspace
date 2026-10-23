# 开发记录与优化清单（CHANGELOG_DEV）

面向维护 Agent 的长期记录。功能账簿见 `docs/FEATURE_LEDGER.md`，调研见 `docs/TECHNICAL_REFERENCES.md`，架构决策见 `docs/adr/`。

## 优化清单（按优先级，持续维护）

优先级：P0 数据丢失/崩溃/关键不可用；P1 核心缺陷或明显兼容性问题；P2 有明确收益的改进；P3 低风险细节。

| # | 优先级 | 问题/机会 | 证据 | 方案 | 验收标准 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| O-01 | P1 | manifest description 含禁词 "Obsidian"，违反官方 validate-manifest 规则，社区商店提交会报 | eslint-plugin-obsidianmd validateManifest.js 源码（TECHNICAL_REFERENCES R1） | 改写 description（manifest.json 与 package.json 同步） | 语义不变且不含禁词 | ✅ 完成 |
| O-02 | P1 | manifest 提交约束无任何本地校验（官方 lint 规则对可用 JSON 解析器全部失效，实测见 R1） | 实测 @eslint/json 与 jsonc-eslint-parser 的 AST 均不匹配规则预期 | `test/manifest.test.ts` 编码提交约束（禁词/格式/必填键/三方版本一致），负向验证通过 | 故意写坏 manifest 能被测试拦下 | ✅ 完成 |
| O-03 | P2 | environment-detector（身份三级解析、id 失效兜底匹配）无单测，是核心策略 | test/ 目录无该文件测试 | 抽出 EnvironmentApi 依赖接口，用假实现补行为测试 | 身份解析与兜底匹配各分支有测试且通过 | ✅ 完成（13 例） |
| O-04 | P2 | 已知 lint warning（prefer-setting-definitions）可能影响社区评审 | README §11 已声明 | 提交说明中解释（1.7.2 兼容）；不迁移声明式设置 | 提交材料含解释 | 待提交时 |
| O-05 | P2 | `saveSettings().then(...)` 无 catch（4 处），落盘失败静默 | main.ts / settings-tab.ts | saveSettings 作为单一持久化漏斗：try/catch + 记日志 + Notice，永不 reject，调用点链路自动安全 | 失败可见（log/Notice） | ✅ 完成 |
| O-14 | P2 | internal-api 适配层（F-022 最高风险层）无单测 | test/ 目录无该文件测试 | 构造器改收导出的结构化 `AppInternals`（免 cast），补 remote 发现链/能力分级/DOM 兜底/插件命令 shim 测试 | 各分支有测试且通过 | ✅ 完成（12 例） |
| O-06 | P2 | onEvaluate 命令在高频事件下可能频繁触发（仅 resize/move 有去抖） | rule-engine/state-manager 语义 | 按 commandId 限流（2s 最小间隔，leading+trailing 补跑，手动评估绕过）——2026-10-23 自主决策实施，理由与备选方案见 ADR 0008 | 同命令间隔内至多一次且最终状态必执行 | ✅ 完成 |
| O-07 | P2 | "卸载/禁用后不恢复受管插件状态"是用户痛点 | README Limitations；对标 Control Center/Plugins-Toggler 都做备份恢复 | 2026-10-23 自主决策：**立项 v0.2 设计任务**（F-033 设计稿：baseline 采集 + 显式恢复命令 + 可选自动恢复；恢复语义实现前需用户确认），本轮不写产品代码 | 设计要点记录于 F-033 | 🗂 已立项 |
| O-08 | P3 | 规则列表不能直接调 priority/排序，须进编辑器 | ui/rule-list.ts | 上/下移按钮（交换相邻 priority + 平局换位；比拖拽低风险且键盘可达），moveRule 纯函数带单测 | 可上下移且持久化生效 | ✅ 完成 |
| O-09 | P3 | 空条件规则（手工编辑 data.json）恒真执行，与编辑器"至少一条件"不一致 | settings.ts 净化 vs rule-editor 校验 | 文档化现状（README §7 已加说明；F-010 已记）；如需禁止再改净化 | README 提及 | ✅ 文档化 |
| O-10 | P3 | Diagnostics "Evaluate now" 的 200ms setTimeout 刷新与评估管道重复 | diagnostics-view.ts | 移除；runEvaluate 末尾统一 refreshDiagnostics（移到循环外，禁用时也刷新） | 点击后仍即时刷新 | ✅ 完成 |
| O-11 | P3 | EnvironmentState.signature 生成后无消费者 | environment-detector.ts | 2026-10-23 自主决策：**删除**（备选"签名相同跳过评估"会弱化 ADR 0001 再强制收敛，且挡不住 resize 主刷屏场景——限流才是对的层，理由见 ADR 0008） | 字段与计算移除，测试同步 | ✅ 完成 |
| O-12 | P3 | rule-editor 死状态（conditionRows/actionRows 只写不读）、settings-tab 孤立分号 | 源码 | 删除 | lint/test 绿 | ✅ 完成 |
| O-13 | P3 | TEST-PLAN 用例计数过时（写 36，实际 41+） | test/ 实跑结果 | 改为不写死数字 | 文档与实际一致 | ✅ 完成 |
| O-15 | P3 | onEvaluate 限流间隔为常量（2s），不可按需调整 | config.ts ON_EVALUATE_MIN_INTERVAL_MS | 如有用户反馈再改为按动作配置 | — | 候选 |

未发现 P0 级问题。无数据丢失、崩溃或关键功能不可用的证据。

## 迭代记录

### 2026-10-23　第一批：基线摸底 + 功能账簿 + 首批优化（O-01/02/03/09/10/12/13）

- **目标**：建立功能账簿；官方文档/同类项目调研；有证据的问题清单；实施首批低风险优化。
- **完成**：`docs/FEATURE_LEDGER.md`（F-001~F-031）；`docs/TECHNICAL_REFERENCES.md`（R1~R6）；本清单；O-01/02/03/10/12/13 实施。提交：c74cf8c / 3c108ed / 62b62a5 / 456c327（4 个原子提交）。
- **关键文件**：manifest.json、package.json、src/core/environment-detector.ts（抽 EnvironmentApi 接口）、test/environment-detector.test.ts、test/manifest.test.ts（新增）、src/ui/{rule-editor,settings-tab,diagnostics-view}.ts、src/main.ts、README.md、docs/*。
- **方案要点**：EnvironmentDetector 依赖由具体类 `InternalApi` 改为结构化接口 `EnvironmentApi`（依赖倒置，便于假实现测试，运行时行为不变）。
- **验证**：`npm run verify` 全绿（vitest 60/60）。详见"验证记录"。
- **未解决**：O-04~O-08、O-11；多显示器真机场景（TEST-PLAN E/D/S 系列）全部待硬件。

### 2026-10-23　第二批：落盘失败可见 + internal-api 测试（O-05/O-14）

- **完成**：saveSettings 单一持久化漏斗（try/catch + log + Notice，永不 reject）；internal-api 构造器改收导出的 `AppInternals` 并补 12 例测试（remote 三级发现、能力分级、DOM 兜底、插件/命令 shim）。
- **验证**：`npm run verify` 全绿（vitest 72/72）。

### 2026-10-23　第三批：onEvaluate 限流 + 规则排序 + signature 清理（O-06/O-07/O-08/O-11，用户授权自主决策）

- **决策**：O-06 限流落地（ADR 0008，含备选方案否决理由）；O-11 删除 signature（与 O-06 同一决策链）；O-07 立项 v0.2 设计任务（F-033）；O-08 用上下移按钮替代拖拽。
- **完成**：`state-manager` 按 commandId 2s 限流（leading+trailing 补跑防丢唤醒、dispose 清理 timer）；`runEvaluateNow` 手动绕过限流并取消排队补跑；`EnvironmentState.signature` 及计算删除；`utils/rule-order.ts` moveRule 纯函数 + 规则列表上/下移按钮（平局换位）；F-033 设计稿。
- **关键文件**：src/config.ts、src/core/state-manager.ts、src/main.ts、src/types/environment.ts、src/core/environment-detector.ts、src/utils/rule-order.ts、src/ui/rule-list.ts、src/ui/settings-tab.ts、test/{state-manager,rule-order,helpers}.*、docs/adr/0008。
- **验证**：`npm run verify` 全绿（vitest 83/83 = 72 + 限流 5 例 + rule-order 6 例）；lint 仍仅 1 条已知 warning（期间引入 2 条 prefer-window-timers，已按仓库惯例改 `window.setTimeout` 消除）。

## 验证记录

- 2026-10-23 修改前基线：`npm run verify` 全绿（vitest 41/41；eslint 1 已知 warning）。
- 2026-10-23 修改后：`npm run verify` 全绿——typecheck ✓、eslint ✓（仍 1 条已知 warning，无新增）、stylelint ✓、vitest **60/60**（新增 environment-detector 13 例、manifest 6 例）、build ✓。
- 负向验证：manifest description 恢复 "Obsidian" 后 `test/manifest.test.ts` 的禁词用例如期失败，改回后通过（O-02 验收达成）。
- 2026-10-23 第二批（O-05/O-14）：`npm run verify` 全绿——vitest **72/72**（新增 internal-api 12 例）、eslint 仍仅 1 条已知 warning（期间引入过 1 条 sentence-case 警告，已按规则改写 Notice 文案消除）。
- 2026-10-23 第三批（O-06/O-08/O-11）：`npm run verify` 全绿——vitest **83/83**（新增限流 5 例、rule-order 6 例）、eslint 仍仅 1 条已知 warning（期间引入 2 条 prefer-window-timers，已消除）。
- 未执行：Obsidian 真机加载验证（本环境无法启动 Obsidian）；行为变化有两处建议真机过一遍：Diagnostics 的 "Evaluate now" 刷新时机（O-10）、落盘失败时的 Notice 提示（O-05，需磁盘异常场景）。第三批新增真机待验：规则上/下移按钮交互、onEvaluate 限流在真实拖动下的频率（O-06/O-08）。
