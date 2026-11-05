# Adaptive Workspace

<p align="center"><b>Automatically adapt your Obsidian workspace based on display, window, and environment — with a general rule engine, not a screen-size-only tool.</b></p>

## Features

- **[Display conditions](docs/user-guide.md#display)**: internal / external identity, display ID, resolution, scale factor.
- **[Window conditions](docs/user-guide.md#window)**: Normal / Maximized / Fullscreen (three independent states), window width / height.
- **[Actions](docs/user-guide.md#supported-actions)**: enable plugin, disable plugin, execute command.
- **[Conflict resolution](docs/user-guide.md#rule-examples)**: overlapping rules merge by priority; a single evaluation never produces an ON→OFF intermediate.
- **Event-driven**: reacts to display and window changes, with debouncing for noisy events (resize/move).
- **[Diagnostics view](docs/user-guide.md#diagnostics)**: display detection, window state, rule matching, and managed-plugin status in one place.

## Use cases

- Docked at a desk: enable your multi-pane / external-monitor plugin set; undocked: disable it to keep the laptop clean.
- Maximized or fullscreen: run a "focus mode" command; back to windowed: run the inverse.
- Big external monitor: enable plugins that only make sense with screen space; small internal screen: turn them off.

## Installation

In Obsidian, open **Settings → Community plugins → Browse**, search for `Adaptive Workspace`, install and enable it.

Manual installation: download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/liyifan2004/obsidian-adaptive-workspace/releases/latest), drop them into `.obsidian/plugins/adaptive-workspace/`, then reload Obsidian.

Requires Obsidian 1.7.2+ on desktop (Windows / macOS / Linux). Mobile is not supported.

## Important limitations

These are the two that will bite you first — the full list is in the [user guide](docs/user-guide.md#limitations).

- **It uses Obsidian internal APIs.** Enabling/disabling plugins and executing commands by id are not part of the public plugin API. Future Obsidian updates may change or remove these internals and break the plugin's actions. The Diagnostics view shows the current capability tier so breakage is visible, not silent.
- **Managed plugin states are not restored.** When you disable or uninstall this plugin, the plugin states it produced stay as-is. Check *Diagnostics → Managed Plugins* and restore anything you need manually.

## Documentation

- [User guide](docs/user-guide.md) — rule examples, supported conditions and actions, diagnostics, full limitations
- [Architecture](docs/ARCHITECTURE.md)
- [Changelog](https://github.com/liyifan2004/obsidian-adaptive-workspace/releases)
- [Issue tracker](https://github.com/liyifan2004/obsidian-adaptive-workspace/issues)

## License

[MIT](LICENSE)
