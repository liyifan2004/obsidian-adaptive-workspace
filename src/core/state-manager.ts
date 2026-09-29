import type { EvaluationResult } from "./rule-engine";
import { computeRuleEdges } from "./rule-engine";
import type { ActionResult, PluginControl } from "./action-executor";
import type { PluginLog } from "../utils/logging";
import { EVALUATE_LOG_SIZE } from "../config";

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
 */
export class StateManager {
  private previousMatched: Set<string> = new Set();
  private firstRunDone = false;
  private readonly ledger = new Map<string, ManagedPluginRecord>();
  private readonly evaluateLog: EvaluateRecord[] = [];

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
    options: { runCommandsOnStartup: boolean },
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

      const res = this.control.executeCommand(evt.commandId);
      if (res.ok) {
        record.commandActions.push(`${evt.commandId} (rule: ${evt.ruleName})`);
      } else {
        record.errors.push(`${evt.commandId}: ${res.error ?? "unknown error"}`);
      }
    }

    this.previousMatched = new Set(result.matchedRuleIds);
    this.firstRunDone = true;

    this.evaluateLog.push(record);
    if (this.evaluateLog.length > EVALUATE_LOG_SIZE) {
      this.evaluateLog.splice(0, this.evaluateLog.length - EVALUATE_LOG_SIZE);
    }
  }
}
