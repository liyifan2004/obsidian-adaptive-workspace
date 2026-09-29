# 0005. 插件启停动作采用 enablePluginAndSave / disablePluginAndSave

日期：2026-09-29　状态：已接受

## 背景

`app.plugins` 提供两组语义：`enablePlugin/disablePlugin`（仅本次会话）与 `enablePluginAndSave/disablePluginAndSave`（写入 Obsidian 的启用清单，重启后保持）。需要选定默认语义。

## 决策

默认使用 **AndSave** 变体（持久化）。理由：

1. 期望状态应跨重启成立，不依赖本插件在启动早期完成 evaluate；
2. 消除"启动时先加载、随后被规则禁用"的闪烁与浪费；
3. diff 的"实际状态"读 `app.plugins.enabledPlugins`（持久清单）+ `app.plugins.plugins`（运行时确认）双源核对，AndSave 下两源收敛，语义简单。

## 理由

- 会话级方案在"启动 → evaluate 前"存在窗口期，且 enablePlugin 与持久清单不一致时行为有历史坑（社区插件踩过：enablePlugin 对已 save 禁用的插件需先 disablePluginAndSave 才能干净切换）。
- 通过官方 API 修改启用清单，不直接写 `community-plugins.json`，符合可靠性要求。

## 后果

- 好：重启一致、无闪烁、双源状态收敛。
- 坏：卸载本插件后，插件启停停留在最后一次应用的环境状态；README 必须写明这一点，且卸载前 Diagnostics 提示"当前受管状态清单"。
- 跟进：数据模型里预留每动作 `persist?: boolean`（默认 true），未来若需要"仅会话"动作，不破坏 schema。
