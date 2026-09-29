import { SuggestModal, type App } from "obsidian";
import type { CommandLike, PluginManifestLike } from "../core/internal-api";
import { isLikelyToggleCommand } from "../actions/command-action";

/** Pick a target plugin from the installed manifests. */
export class PluginSuggestModal extends SuggestModal<PluginManifestLike> {
  constructor(
    app: App,
    private readonly items: PluginManifestLike[],
    private readonly onPick: (item: PluginManifestLike) => void,
  ) {
    super(app);
    this.setPlaceholder("Search installed plugins…");
  }

  override getSuggestions(query: string): PluginManifestLike[] {
    const q = query.toLowerCase();
    return this.items.filter(
      (m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
    );
  }

  override renderSuggestion(item: PluginManifestLike, el: HTMLElement): void {
    el.createDiv({ text: item.name, cls: "aw-pick-title" });
    el.createDiv({ text: item.id, cls: "aw-pick-id" });
    if (item.description) el.createDiv({ text: item.description, cls: "aw-pick-desc" });
  }

  override onChooseSuggestion(item: PluginManifestLike): void {
    this.onPick(item);
  }
}

/** Pick a registered command; toggle-like commands are flagged. */
export class CommandSuggestModal extends SuggestModal<CommandLike> {
  constructor(
    app: App,
    private readonly items: CommandLike[],
    private readonly onPick: (item: CommandLike) => void,
  ) {
    super(app);
    this.setPlaceholder("Search commands…");
  }

  override getSuggestions(query: string): CommandLike[] {
    const q = query.toLowerCase();
    return this.items.filter(
      (c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q),
    );
  }

  override renderSuggestion(item: CommandLike, el: HTMLElement): void {
    el.createDiv({ text: item.name, cls: "aw-pick-title" });
    el.createDiv({ text: item.id, cls: "aw-pick-id" });
    if (isLikelyToggleCommand(item.id, item.name)) {
      el.createDiv({
        text: "⚠ Likely a Toggle command — runs once when a rule activates",
        cls: "aw-pick-warn",
      });
    }
  }

  override onChooseSuggestion(item: CommandLike): void {
    this.onPick(item);
  }
}
