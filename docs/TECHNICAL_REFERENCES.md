# 技术调研记录（TECHNICAL REFERENCES）

日期：2026-10-23。只记录本轮**实际查阅并核实**的内容；无法核实的明确标注。结论分为【事实】（直接证实）/【推断】/【建议待验证】。

## R1. manifest 禁词与 description 格式校验（官方 lint 规则）

- **要解决的问题**：manifest.json 是否符合社区商店提交校验。
- **来源**：`eslint-plugin-obsidianmd`（devDependency，官方评审 bot 使用同一规则集）本地源码 `dist/lib/rules/validateManifest.js`。【事实】
- **核实的实现**：`FORBIDDEN_WORDS = ["obsidian", "plugin"]`；对 `name`/`description` 等字段查禁词（`noForbiddenWords`）；description 另查格式（10–250 字符、首字母大写、句号结尾、限定字符集）（`descriptionFormat`）。
- **对本插件的影响**：当前 description `Automatically adapt your Obsidian workspace based…` 含 "Obsidian"，违反禁词规则。【事实】
- **附带发现**：`npm run lint` 只跑 `eslint src test`，manifest.json 从未被 lint；即使显式 `eslint manifest.json` 也报 "File ignored because no matching configuration was supplied"——`validate-manifest` 规则在本仓库**从未生效**。【事实，实测】
- **决定**：采纳。① 改写 description 去掉禁词（已完成）；② 校验纳入 verify。
- **实施中发现（2026-10-23 实测）**：`validate-manifest` 规则监听 `Program > ExpressionStatement > ObjectExpression` 形状的 AST，但可用的 JSON 解析器都不产生这种形状——`@eslint/json` 根节点是 `Document`（规则完全静默），`jsonc-eslint-parser` 是 `JSONExpressionStatement`/`JSONObjectExpression`（规则误报 "mustBeRootObject"）。上游 recommended 配置本身也没有给 manifest.json 配 JSON 语言块，该规则在官方插件里同样是死规则。【事实，实测】
- **最终方案**：不硬接上游死规则，改为 `test/manifest.test.ts` 编码同样的提交约束（禁词、description 格式、必填键、id 小写连字符、manifest/package.json/versions.json 三方版本一致），随 `npm run test` 强制执行。负向验证过：description 含 "Obsidian" 时测试失败。这是社区同类插件（Control Center 的 `check-release.mjs`）验证过的"发布一致性检查"模式。【事实】

## R2. 官方插件评审规则逐条自查

- **来源**：https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines 。直接抓取为空页（JS 渲染）【事实】；内容经搜索引擎快照获得条目清单【转述，双源印证见 R3】。
- **与本仓库对照**（逐条核对源码）：
  - 不用全局 `app`（用 `this.app`）：符合。【事实】
  - 无 `innerHTML` 系列（用 createEl/createDiv）：符合。【事实】
  - 资源在 onunload 清理：符合（Electron 监听手动 removeListener + `register()` 兜底）。【事实】
  - UI 文案 sentence case、设置页用 `setHeading()`、命令名不冗长：符合。【事实】
  - `registerView` 工厂不持有 view 引用：符合。【事实】
  - 命令用 `callback`（无条件执行）：符合。【事实】
  - Electron/Node API → `isDesktopOnly: true`：manifest 已设。【事实】
- **未逐条核实**：无障碍（aria-label 等）细则以 obsidianmd lint 通过为准（仅 1 条已知 warning），未人工走查键盘可达性。【待验证】

## R3. 提交校验的第三方实践清单（印证 R1）

- **来源**：time-tracker-invoicing `docs/obsidian-release-checklist.md`、Obsidian Plugin Playbooks skill（均经搜索快照阅读）。【转述】
- **要点**：发布前用官方 lint 全量跑且 `--max-warnings 0`（warning 也可能挡评审）；tag 与 manifest 版本一致；versions.json 同步。
- **对本插件**：已有 1 条 warning（`settings-tab/prefer-setting-definitions`，因 minAppVersion 1.7.2 不支持声明式设置）。决定：不迁移（会抬高最低版本）；提交社区商店时在说明中解释该 warning 的兼容性理由。【建议待验证：评审是否接受该理由】

## R4. 同类插件对标（功能描述层面核实，未读源码）

| 项目 | 与本插件相关的能力 | 借鉴价值 | 决定 |
| --- | --- | --- | --- |
| Control Center（plugins-control，社区商店） | 插件启停管理、按设备类型禁用规则、**启用状态备份/恢复** | "备份/恢复受管状态"是对本插件"卸载不恢复"限制的成熟解法 | 部分采纳：列为 v0.2 候选特性（改变产品行为，需用户确认语义后再设计） |
| Plugins-Toggler（GitHub） | 命令面板批量启停 + 记忆并恢复启用集合 | 同上，"记住再恢复"模式简单可靠 | 同上，合并考虑 |
| Auto Switch Sidebar（GitHub） | 上下文触发的规则卡片 UI、拖拽排序 | 规则排序交互（F-025 目前只能进编辑器改 priority） | 采纳为 P3 交互改进参考 |

- **不采纳**：引入它们的代码/依赖（本项目零运行时依赖，保持不变）。
- **未核实**：三者的内部实现与异常处理（未读源码）。【如实标注】

## R5. 官方构建教程

- **来源**：https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin （抓取成功）。【事实】
- **结论**：流程（esbuild 编译出 main.js、manifest 改动需重启）与本仓库一致，无新增要求。

## R6. 内部 API 类型缺口（沿用既有核实）

- ARCHITECTURE §1 记录 `app.plugins`/`app.commands` 未进官方 d.ts（此前已核对 obsidian-api 仓库）。**本轮未重新核对上游**，沿用该结论。【待重新核实】上游若变动，影响 F-022 的类型层而非运行时。
