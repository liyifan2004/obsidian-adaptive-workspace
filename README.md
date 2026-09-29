# Adaptive Workspace

Automatically adapt your Obsidian workspace based on display, window, and environment — with a general rule engine (Condition → Rule → Action), not a screen-size-only tool.

## 1. What is Adaptive Workspace

Adaptive Workspace watches where your Obsidian window is (which display, what window state) and applies the workspace you want there. You declare rules such as *"when on an external display and maximized, enable plugin X and disable plugin Y"*, and the plugin keeps the actual state matching the desired state.

It is built on a rule engine:

```
Current State + Rules → Desired State → Diff → Execute necessary actions
```

Actions run only when the actual state differs from the desired state. Nothing is toggled repeatedly on every event.

## 2. Features

- **Display conditions**: internal / external identity, display ID, resolution, scale factor.
- **Window conditions**: Normal / Maximized / Fullscreen (three independent states), window width / height.
- **Actions**: Enable plugin, Disable plugin, Execute command (chosen from registered commands).
- **Conflict resolution**: overlapping rules merge by priority; a single evaluation never produces an ON→OFF intermediate.
- **Event-driven**: reacts to display and window changes, with debouncing for noisy events (resize/move).
- **Diagnostics view**: display detection, window state, rule matching, and managed-plugin status in one place.
- **Safe by design**: never modifies other plugins' code or Obsidian core configuration.

## 3. Use Cases

- Docked at a desk: enable your multi-pane / external-monitor plugin set; undocked: disable it to keep the laptop clean.
- Maximized or fullscreen: run a "focus mode" command; back to windowed: run the inverse.
- Big external monitor: enable plugins that only make sense with screen space (graph, kanban, sliders); small internal screen: turn them off.

## 4. Screenshots

*(placeholder — screenshots will be added before the community release)*

- Settings: rule list and rule editor
- Diagnostics: display / window / rules / managed plugins
- Settings: display identity assignment (Auto / Internal / External)

## 5. Installation

### From the community plugin browser (after release)

1. Open Settings → Community plugins → Browse.
2. Search for **Adaptive Workspace**.
3. Install and enable.

### Manual installation

1. Download `main.js`, `manifest.json`, `styles.css` from the release page.
2. Create a folder `<vault>/.obsidian/plugins/adaptive-workspace/`.
3. Copy the three files into it.
4. Enable the plugin in Settings → Community plugins.

Requires Obsidian 1.4.0+ on desktop (Windows / macOS / Linux). Mobile is not supported (`isDesktopOnly`).

## 6. Rule Examples

**Example 1 — external display setup**

- Condition: Display · Identity · equals · External
- Action: Enable plugin `obsidian-git`
- Action: Disable plugin `sliding-panes-obsidian-plugin`

**Example 2 — focus mode on maximize**

- Condition: Window · State · equals · Maximized
- Action: Execute command `toggle-zen`

**Example 3 — big screen, wide window**

- Condition: Display · Width (px) · gte · 2560
- Condition: Window · Width (px) · gte · 1800 *(rule match mode: AND)*
- Action: Enable plugin `obsidian-kanban`

Rule priority resolves conflicts: when two matching rules disagree about a plugin, the higher-priority rule wins (ties go to the rule earlier in the list).

## 7. Supported Conditions

All conditions support operators: equals, not Equals, >, >=, <, <= (boolean/enum properties support equals / not Equals only).

**Display**

| Property | Type | Notes |
| --- | --- | --- |
| Identity | enum | Internal / External / Unknown (see below) |
| Is internal display | boolean | Identity `unknown` never matches internal/external checks |
| Display ID | number | Electron display id |
| Resolution width / height | number | Physical pixels |
| Scale factor | number | DPI scaling |

**Window**

| Property | Type | Notes |
| --- | --- | --- |
| Window state | enum | Normal / Maximized / Fullscreen / Minimized (three primary states are independent) |
| Is maximized | boolean | |
| Is fullscreen | boolean | Never conflated with maximized |
| Window width / height | number | Logical pixels |

**Display identity detection.** Identity is resolved in order: (1) manual assignment in settings (Internal / External / Auto per display), (2) Electron's `display.internal` flag when reliable, (3) a clearly-labeled heuristic. When identity cannot be determined it is `unknown`, and the plugin refuses to guess: internal/external conditions simply do not match.

**Cross-display windows.** The matched display is the one with the largest intersection area with the window; when a secondary display overlaps significantly, the window is marked `spanning`. The Diagnostics view shows the matched display and the match method.

## 8. Supported Actions

| Action | Kind | Behavior |
| --- | --- | --- |
| Enable plugin | State | Desired state, applied via diff; persisted with `enablePluginAndSave` |
| Disable plugin | State | Desired state, applied via diff; persisted with `disablePluginAndSave` |
| Execute command | Event | Fires once when a rule enters its matching state (edge-triggered) |

- **State actions** are declarative: the engine only acts when actual ≠ desired, so re-evaluation is idempotent.
- **Command actions** are edge-triggered: they fire on rule-enter, not on every evaluation. By default commands do **not** run on the first (startup) evaluation; enable *Run commands on startup* in settings if you want that.
- Toggle-style commands are flagged with a warning in the picker (their result depends on unknown current state).
- If one command fails, the remaining actions still run.

## 9. Diagnostics

Open via the command palette → *Adaptive Workspace: Open diagnostics*. Sections:

- **Capability**: which Obsidian/Electron APIs are reachable (including the internal-API tier).
- **Display**: detected displays, identity, detection method (manual / electron-flag / heuristic).
- **Window**: state, size, matched display, spanning flag, match method.
- **Rules**: each rule's match result; conflicting losers are recorded as overridden.
- **Managed Plugins**: every plugin this plugin has enabled/disabled — its desired state and last known actual state.
- **Evaluate Log / Plugin Log**: recent evaluations and events.

## 10. Limitations

- **Internal APIs.** Enabling/disabling plugins and executing commands by id are not part of Obsidian's public plugin API. Adaptive Workspace accesses them through a single, clearly-marked internal-API layer (`src/core/internal-api.ts`). Future Obsidian updates may change or remove these internals and break the plugin's plugin/command actions. The Diagnostics view shows the current capability tier so breakage is visible, not silent.
- **Managed state persists after uninstall.** If you uninstall Adaptive Workspace while rules are active, plugins it disabled stay disabled and plugins it enabled stay enabled (they are real, persisted Obsidian states). Check *Diagnostics → Managed Plugins* before uninstalling and restore anything you need manually.
- **Manual changes are re-enforced.** If you manually toggle a plugin that a rule manages, the next evaluation restores the rule's desired state. This is by design (rules are declarative); disable the rule first if you want a manual change to stick.
- **Self-protection.** A rule can never disable Adaptive Workspace itself.
- **No mobile support.** Display/window detection relies on Electron desktop APIs.
- **MVP scope.** Two condition types (Display, Window) and three actions only. The condition/action provider registry is built for extension, but arbitrary code evaluation is deliberately out of scope.
- **Not modifying anything outside.** The plugin does not modify other plugins' code, settings files of other plugins, or Obsidian core configuration. It only flips plugin enable/disable state and runs commands that Obsidian itself registered.

## 11. Development

```bash
npm install
npm run dev      # watch build
npm run verify   # typecheck + lint + test + build (all must pass)
npm run sync     # copy build output into a test vault (edit scripts/sync-to-vault.mjs)
```

Project layout: `src/core` (environment detection, rule engine, state manager, internal API), `src/conditions` / `src/actions` (typed providers), `src/ui` (settings, rule editor, diagnostics), `test/` (vitest unit tests). Architecture decisions are recorded in `docs/adr/`. See `docs/ARCHITECTURE.md` and `docs/TEST-PLAN.md`.

## 12. Contributing

Issues and PRs are welcome. Please:

1. Run `npm run verify` before submitting; it must be green.
2. Add or extend unit tests for behavior changes.
3. Record non-obvious architectural decisions as an ADR in `docs/adr/`.
4. Do not expand scope to arbitrary code execution in rules (see Limitations).

## 13. License

MIT. See [LICENSE](LICENSE).
