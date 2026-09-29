import { ItemView, Setting, type WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_DIAGNOSTICS } from "../config";
import type { ApiProbe, CapabilityTier, EnvironmentState } from "../types/environment";
import type { PluginDesireInfo, RuleMatchInfo } from "../core/rule-engine";
import type { EvaluateRecord, ManagedPluginRecord } from "../core/state-manager";
import type { LogEntry } from "../utils/logging";

export interface DiagnosticsSnapshot {
  tier: CapabilityTier;
  probe: ApiProbe;
  state: EnvironmentState | null;
  ruleMatches: RuleMatchInfo[];
  pluginDesires: Map<string, PluginDesireInfo>;
  ledger: ManagedPluginRecord[];
  evaluateLog: readonly EvaluateRecord[];
  log: readonly LogEntry[];
}

export interface DiagnosticsHost {
  getSnapshot(): DiagnosticsSnapshot;
  runEvaluateNow(): void;
}

function row(container: HTMLElement, label: string, value: string, cls?: string): void {
  const line = container.createDiv({ cls: `aw-diag-row${cls ? ` ${cls}` : ""}` });
  line.createSpan({ text: label, cls: "aw-diag-label" });
  line.createSpan({ text: value, cls: "aw-diag-value" });
}

function bool(v: boolean): string {
  return v ? "Yes" : "No";
}

export class DiagnosticsView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private readonly host: DiagnosticsHost,
  ) {
    super(leaf);
  }

  override getViewType(): string {
    return VIEW_TYPE_DIAGNOSTICS;
  }

  override getDisplayText(): string {
    return "Adaptive Workspace Diagnostics";
  }

  override getIcon(): string {
    return "activity";
  }

  override async onOpen(): Promise<void> {
    this.render();
  }

  render(): void {
    const el = this.contentEl;
    el.empty();
    const snap = this.host.getSnapshot();

    new Setting(el).addButton((b) =>
      b.setButtonText("Evaluate now").setCta().onClick(() => {
        this.host.runEvaluateNow();
        window.setTimeout(() => this.render(), 200);
      }),
    );

    /* ---- Capability ---- */
    el.createEl("h3", { text: "Capability" });
    row(el, "Tier", snap.tier);
    row(el, "Electron remote", `${bool(snap.probe.remote)} (via: ${snap.probe.via})`);
    row(el, "BrowserWindow", bool(snap.probe.browserWindow));
    row(el, "screen module", bool(snap.probe.screen));
    row(el, "app.plugins", bool(snap.probe.plugins));
    row(el, "app.commands", bool(snap.probe.commands));
    for (const note of snap.probe.notes) {
      row(el, "Note", note, "aw-warn");
    }

    /* ---- Display ---- */
    el.createEl("h3", { text: "Display" });
    const d = snap.state?.display;
    if (d && d.id !== -1) {
      row(el, "Current Display", d.label);
      row(el, "ID", String(d.id));
      row(el, "Identity", d.identity);
      row(el, "Detection method", d.detectionMethod);
      row(el, "Electron internal flag", d.electronInternal === null ? "n/a" : bool(d.electronInternal));
      row(el, "Bounds", `${d.bounds.x}, ${d.bounds.y}, ${d.bounds.width}×${d.bounds.height}`);
      row(el, "Resolution", `${d.size.width}×${d.size.height}`);
      row(el, "Work area", `${d.workArea.width}×${d.workArea.height}`);
      row(el, "Scale Factor", String(d.scaleFactor));
    } else {
      row(el, "Current Display", "unavailable");
    }

    /* ---- Window ---- */
    el.createEl("h3", { text: "Window" });
    const w = snap.state?.window;
    if (w) {
      row(el, "Bounds", `${w.bounds.x}, ${w.bounds.y}, ${w.bounds.width}×${w.bounds.height}`);
      row(el, "State", w.state);
      row(el, "Maximized", bool(w.maximized));
      row(el, "Fullscreen", bool(w.fullscreen));
      row(el, "Spanning", bool(w.spanning));
      row(el, "Matched by", w.matchNote);
    } else {
      row(el, "Window", "unavailable");
    }

    /* ---- Obsidian ---- */
    el.createEl("h3", { text: "Obsidian" });
    const o = snap.state?.obsidian;
    if (o) {
      row(el, "Vault", o.vault);
      row(el, "Theme", o.theme);
      row(el, "Active File", o.activeFile ?? "(none)");
    }

    /* ---- Rules ---- */
    el.createEl("h3", { text: "Rules" });
    if (snap.ruleMatches.length === 0) {
      row(el, "Rules", "none defined");
    }
    for (const m of snap.ruleMatches) {
      row(
        el,
        m.matched ? "✓ Matched" : "✕ Not matched",
        `${m.ruleName} (priority ${m.priority})`,
        m.matched ? "aw-ok" : undefined,
      );
    }
    for (const desire of snap.pluginDesires.values()) {
      for (const lost of desire.overridden) {
        row(
          el,
          "⚠ Conflict",
          `plugin ${desire.pluginId}: "${desire.ruleName}" (P${desire.priority}) overrides "${lost.ruleName}" (P${lost.priority})`,
          "aw-warn",
        );
      }
    }

    /* ---- Managed plugins ---- */
    el.createEl("h3", { text: "Managed Plugins" });
    if (snap.ledger.length === 0) {
      row(el, "Managed", "none yet");
    }
    for (const rec of snap.ledger) {
      row(
        el,
        rec.pluginId,
        `current: ${rec.current === null ? "?" : rec.current ? "ON" : "OFF"} · ` +
          `desired: ${rec.desired === null ? "?" : rec.desired ? "ON" : "OFF"} · ` +
          `last action: ${rec.lastAction ?? "—"}`,
        rec.lastError ? "aw-error" : undefined,
      );
      if (rec.lastError) row(el, "Error", rec.lastError, "aw-error");
    }

    /* ---- Evaluate log ---- */
    el.createEl("h3", { text: "Evaluate Log (recent)" });
    const log = snap.evaluateLog.slice(-8).reverse();
    if (log.length === 0) row(el, "Log", "no evaluations yet");
    for (const entry of log) {
      const summary =
        `matched: ${entry.matchedRuleIds.length} · actions: ${entry.pluginActions.length + entry.commandActions.length}` +
        (entry.errors.length > 0 ? ` · errors: ${entry.errors.length}` : "");
      row(el, new Date(entry.time).toLocaleTimeString(), summary, entry.errors.length ? "aw-error" : undefined);
      for (const a of entry.pluginActions) row(el, "  action", a);
      for (const a of entry.commandActions) row(el, "  command", a);
    }

    /* ---- Plugin log ---- */
    el.createEl("h3", { text: "Plugin Log" });
    const entries = [...snap.log].slice(-10).reverse();
    for (const entry of entries) {
      row(
        el,
        new Date(entry.time).toLocaleTimeString(),
        `${entry.level}: ${entry.message}${entry.detail ? ` — ${entry.detail}` : ""}`,
        entry.level === "error" ? "aw-error" : entry.level === "warn" ? "aw-warn" : undefined,
      );
    }
  }

  override async onClose(): Promise<void> {
    this.contentEl.empty();
  }
}
