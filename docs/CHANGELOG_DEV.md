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
| O-05 | P2 | `saveSettings().then(...)` 无 catch（4 处），落盘失败静默 | main.ts / settings-tab.ts | 统一持久化辅助函数并接住失败、记日志 | 失败可见（log/Diagnostics） | 待实施 |
| O-06 | P2 | onEvaluate 命令在高频事件下可能频繁触发（仅 resize/move 有去抖） | rule-engine/state-manager 语义 | 全局命令最小间隔限流（产品行为变更） | 需用户确认语义后实施 | 待确认 |
| O-07 | P2 | "卸载/禁用后不恢复受管插件状态"是用户痛点 | README Limitations；对标 Control Center/Plugins-Toggler 都做备份恢复 | 设计"受管状态备份/恢复"功能（v0.2 候选） | 需用户确认恢复语义后立项 | 待确认 |
| O-08 | P3 | 规则列表不能直接调 priority/排序，须进编辑器 | ui/rule-list.ts | 借鉴 Auto Switch Sidebar 拖拽排序 | 可拖拽或上下移 | 待实施 |
| O-09 | P3 | 空条件规则（手工编辑 data.json）恒真执行，与编辑器"至少一条件"不一致 | settings.ts 净化 vs rule-editor 校验 | 文档化现状（README §7 已加说明；F-010 已记）；如需禁止再改净化 | README 提及 | ✅ 文档化 |
| O-10 | P3 | Diagnostics "Evaluate now" 的 200ms setTimeout 刷新与评估管道重复 | diagnostics-view.ts | 移除；runEvaluate 末尾统一 refreshDiagnostics（移到循环外，禁用时也刷新） | 点击后仍即时刷新 | ✅ 完成 |
| O-11 | P3 | EnvironmentState.signature 生成后无消费者 | environment-detector.ts | 用作评估去重（签名相同跳过）或删除 | 二选一，需设计 | 待实施 |
| O-12 | P3 | rule-editor 死状态（conditionRows/actionRows 只写不读）、settings-tab 孤立分号 | 源码 | 删除 | lint/test 绿 | ✅ 完成 |
| O-13 | P3 | TEST-PLAN 用例计数过时（写 36，实际 41+） | test/ 实跑结果 | 改为不写死数字 | 文档与实际一致 | ✅ 完成 |

未发现 P0 级问题。无数据丢失、崩溃或关键功能不可用的证据。

## 迭代记录

### 2026-10-23　基线摸底 + 功能账簿 + 首批优化（O-01/02/03/10/12/13 + O-09 文档化）

- **目标**：建立功能账簿；官方文档/同类项目调研；有证据的问题清单；实施首批低风险优化。
- **完成**：`docs/FEATURE_LEDGER.md`（F-001~F-031）；`docs/TECHNICAL_REFERENCES.md`（R1~R6）；本清单；O-01/02/03/10/12/13 实施。
- **关键文件**：manifest.json、package.json、src/core/environment-detector.ts（抽 EnvironmentApi 接口）、test/environment-detector.test.ts、test/manifest.test.ts（新增）、src/ui/{rule-editor,settings-tab,diagnostics-view}.ts、src/main.ts、README.md、docs/*。
- **方案要点**：EnvironmentDetector 依赖由具体类 `InternalApi` 改为结构化接口 `EnvironmentApi`（依赖倒置，便于假实现测试，运行时行为不变）。
- **验证**：`npm run verify`（typecheck + eslint + stylelint + vitest + build）。结果见本文件末尾"验证记录"。
- **未解决**：O-04~O-08、O-11；多显示器真机场景（TEST-PLAN E/D/S 系列）全部待硬件。

## 验证记录

- 2026-10-23 修改前基线：`npm run verify` 全绿（vitest 41/41；eslint 1 已知 warning）。
- 2026-10-23 修改后：`npm run verify` 全绿——typecheck ✓、eslint ✓（仍 1 条已知 warning，无新增）、stylelint ✓、vitest **60/60**（新增 environment-detector 13 例、manifest 6 例）、build ✓。
- 负向验证：manifest description 恢复 "Obsidian" 后 `test/manifest.test.ts` 的禁词用例如期失败，改回后通过（O-02 验收达成）。
- 未执行：Obsidian 真机加载验证（本环境无法启动 Obsidian）；改动集中在测试/文档/无行为变化的清理，唯一行为变化是 Diagnostics 刷新时机（O-10，评估完成后统一刷新，禁用时也会刷新一次），建议真机点一次 "Evaluate now" 确认。
