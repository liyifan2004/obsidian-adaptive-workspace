import type { CommandEventInfo, EvaluationResult } from "./rule-engine";
import { computeRuleEdges } from "./rule-engine";
import type { ActionResult, PluginControl } from "./action-executor";
import type { PluginLog } from "../utils/logging";
import { EVALUATE_LOG_SIZE, ON_EVALUATE_MIN_INTERVAL_MS } from "../config";

export interface ManagedPluginRecord {
  pluginId: string;
  desired: boolean | null;
  current: boolean | null;
  lastAction: string | null;
  lastError: string | null;
}

export interface EvaluateRecord {
  time: number;
  matchedRuleIds: string[];
  pluginActions: string[];
  commandActions: string[];
  warnings: string[];
  errors: string[];
}

/**
 * Holds cross-evaluation state (rule-enter edges, managed-plugin ledger,
 * evaluate log) and drives the PluginControl for the MERGED desired state
 * only. Startup semantics (ADR 0004): first evaluation marks all matched
 * rules as entered but fires no Event Actions unless explicitly enabled.
 *
 * `onEvaluate` commands are rate-limited per command id (ADR 0008): at most
 * one execution per ON_EVALUATE_MIN_INTERVAL_MS, with a trailing execution so
 * a burst never swallows the final state. `onEnter` edges and manual
 * evaluations always run immediately.
 */
export class StateManager {
  private previousMatched: Set<string> = new Set();
  private firstRunDone = false;
  private readonly ledger = new Map<string, ManagedPluginRecord>();
  private readonly evaluateLog: EvaluateRecord[] = [];
  /** Last execution time per command id (rate limiting, ADR 0008). */
  private readonly lastCommandRunAt = new Map<string, number>();
  /** Deferred onEvaluate events awaiting the trailing run, by command id. */
  private readonly trailingQueue = new Map<string, CommandEventInfo>();
  private trailingTimer: number | null = null;

  constructor(
    private readonly control: PluginControl,
    private readonly log: PluginLog,
  ) {}

  isStartup(): boolean {
    return !this.firstRunDone;
  }

  getLedger(): ManagedPluginRecord[] {
    return [...this.ledger.values()].sort((a, b) => a.pluginId.localeCompare(b.pluginId));
  }

  getEvaluateLog(): readonly EvaluateRecord[] {
    return this.evaluateLog;
  }

  async apply(
    result: EvaluationResult,
    options: { runCommandsOnStartup: boolean; manual?: boolean },
  ): Promise<void> {
    const startup = !this.firstRunDone;
    const record: EvaluateRecord = {
      time: Date.now(),
      matchedRuleIds: [...result.matchedRuleIds],
      pluginActions: [],
      commandActions: [],
      warnings: [...result.warnings],
      errors: [],
    };

    // ---- State Actions: diff the merged desired state vs actual ----
    for (const [pluginId, desire] of result.pluginDesires) {
      const rec = this.ledger.get(pluginId) ?? {
        pluginId,
        desired: null,
        current: null,
        lastAction: null,
        lastError: null,
      };
      rec.desired = desire.enabled;
      this.ledger.set(pluginId, rec);

      let current: boolean;
      try {
        current = this.control.isPluginEnabled(pluginId);
      } catch (e) {
        rec.lastError = String(e);
        record.errors.push(`${pluginId}: ${String(e)}`);
        continue;
      }
      rec.current = current;

      if (current === desire.enabled) {
        rec.lastError = null;
        continue; // already in the desired state — no action (ADR 0001)
      }

      const resultAction: ActionResult = await this.control.setPluginEnabled(pluginId, desire.enabled);
      if (resultAction.ok) {
        rec.lastAction = `${desire.enabled ? "enable" : "disable"} @ ${new Date().toLocaleTimeString()}`;
        rec.lastError = null;
        rec.current = this.control.isPluginEnabled(pluginId); // re-read after acting
        record.pluginActions.push(`${pluginId} → ${desire.enabled ? "ON" : "OFF"}`);
      } else {
        rec.lastError = resultAction.error ?? "unknown error";
        record.errors.push(`${pluginId}: ${rec.lastError}`);
      }
    }

    // ---- Event Actions: fire on rule-enter edges only (ADR 0004/0006) ----
    const edges = new Set(computeRuleEdges(result.matchedRuleIds, this.previousMatched));
    const allowCommands = !startup || options.runCommandsOnStartup;

    for (const evt of result.commandEvents) {
      const fires =
        evt.trigger === "onEvaluate"
          ? allowCommands
          : allowCommands && edges.has(evt.ruleId);
      if (!fires) continue;

      // Rate limit onEvaluate per command id (ADR 0008). A manual evaluation
      // is explicit user intent and always runs.
      if (evt.trigger === "onEvaluate" && options.manual !== true) {
        const wait = this.waitMsFor(evt.commandId);
        if (wait > 0) {
          this.trailingQueue.set(evt.commandId, evt);
          this.scheduleTrailing(wait);
          record.warnings.push(
            `Command "${evt.commandId}" deferred by the onEvaluate rate limit (trailing run in ~${wait}ms)`,
          );
          continue;
        }
      }
      this.trailingQueue.delete(evt.commandId); // a fresh run supersedes any queued trailing one
      this.fireCommand(evt, record);
    }

    this.previousMatched = new Set(result.matchedRuleIds);
    this.firstRunDone = true;
    this.pushRecord(record);
  }

  /** Cancel the pending trailing run (called on plugin unload). */
  dispose(): void {
    if (this.trailingTimer !== null) {
      window.clearTimeout(this.trailingTimer);
      this.trailingTimer = null;
    }
    this.trailingQueue.clear();
  }

  /* ---------------- command rate limiting (ADR 0008) ---------------- */

  /** Milliseconds to wait before this command may run again (<= 0: now). */
  private waitMsFor(commandId: string): number {
    const last = this.lastCommandRunAt.get(commandId) ?? 0;
    return ON_EVALUATE_MIN_INTERVAL_MS - (Date.now() - last);
  }

  private fireCommand(evt: CommandEventInfo, record: EvaluateRecord): void {
    const res = this.control.executeCommand(evt.commandId);
    if (res.ok) {
      record.commandActions.push(`${evt.commandId} (rule: ${evt.ruleName})`);
    } else {
      record.errors.push(`${evt.commandId}: ${res.error ?? "unknown error"}`);
    }
    this.lastCommandRunAt.set(evt.commandId, Date.now());
  }

  /**
   * Run deferred onEvaluate events once their interval has elapsed. Events
   * whose interval is still open stay queued and get a new timer, so the
   * trailing guarantee holds even when commands were fired at different
   * times (no lost wakeup).
   */
  private scheduleTrailing(delayMs: number): void {
    if (this.trailingTimer !== null) return; // a timer is already pending and will drain the queue
    this.trailingTimer = window.setTimeout(() => {
      this.trailingTimer = null;
      const record: EvaluateRecord = {
        time: Date.now(),
        matchedRuleIds: [],
        pluginActions: [],
        commandActions: [],
        warnings: ["Trailing run for rate-limited onEvaluate commands"],
        errors: [],
      };
      let maxWait = 0;
      for (const [commandId, evt] of [...this.trailingQueue]) {
        const wait = this.waitMsFor(commandId);
        if (wait > 0) {
          maxWait = Math.max(maxWait, wait);
          continue; // still inside the interval — keep queued
        }
        this.trailingQueue.delete(commandId);
        this.fireCommand(evt, record);
      }
      if (this.trailingQueue.size > 0) this.scheduleTrailing(maxWait);
      if (record.commandActions.length > 0 || record.errors.length > 0) {
        this.pushRecord(record);
      }
    }, delayMs);
  }

  private pushRecord(record: EvaluateRecord): void {
    this.evaluateLog.push(record);
    if (this.evaluateLog.length > EVALUATE_LOG_SIZE) {
      this.evaluateLog.splice(0, this.evaluateLog.length - EVALUATE_LOG_SIZE);
    }
  }
}
