import type { ActionTrigger } from "../types/action";
import type { EnvironmentState } from "../types/environment";
import type { Rule } from "../types/rule";
import type { ActionRegistry } from "../actions/action-registry";
import type { ConditionRegistry } from "../conditions/condition-registry";

/**
 * Pure rule evaluation: EnvironmentState + Rules → DesiredState + events.
 * No side effects here (see docs/adr/0001, 0006) — fully unit tested.
 */

export interface RuleMatchInfo {
  ruleId: string;
  ruleName: string;
  priority: number;
  matched: boolean;
}

export interface OverrideInfo {
  ruleId: string;
  ruleName: string;
  enabled: boolean;
  priority: number;
}

export interface PluginDesireInfo {
  pluginId: string;
  enabled: boolean;
  ruleId: string;
  ruleName: string;
  priority: number;
  /** Lower-priority rules that lost the merge (conflict reporting). */
  overridden: OverrideInfo[];
}

export interface CommandEventInfo {
  commandId: string;
  ruleId: string;
  ruleName: string;
  priority: number;
  trigger: ActionTrigger;
}

export interface EvaluationResult {
  ruleMatches: RuleMatchInfo[];
  matchedRuleIds: string[];
  /** Final merged desired plugin states — the ONLY thing the executor consumes. */
  pluginDesires: Map<string, PluginDesireInfo>;
  commandEvents: CommandEventInfo[];
  warnings: string[];
}

function evaluateRuleMatch(rule: Rule, state: EnvironmentState, conditions: ConditionRegistry): boolean {
  if (rule.conditions.length === 0) return true;
  const results = rule.conditions.map((condition) => {
    const def = conditions.get(condition.type);
    if (!def) return false; // unknown condition type: never matches (forward compatible)
    return def.evaluate(state, condition);
  });
  return rule.conditionLogic === "OR" ? results.some(Boolean) : results.every(Boolean);
}

export function evaluateRules(
  rules: Rule[],
  state: EnvironmentState,
  conditions: ConditionRegistry,
  actions: ActionRegistry,
): EvaluationResult {
  const warnings: string[] = [];
  const ruleMatches: RuleMatchInfo[] = [];
  const matched: Array<{ rule: Rule; index: number }> = [];

  rules.forEach((rule, index) => {
    const ok = rule.enabled && evaluateRuleMatch(rule, state, conditions);
    ruleMatches.push({
      ruleId: rule.id,
      ruleName: rule.name,
      priority: rule.priority,
      matched: ok,
    });
    if (ok) matched.push({ rule, index });
  });

  // Conflict resolution happens HERE, in the merge step (ADR 0006):
  // higher priority first; ties broken by position in the rules array.
  const ordered = [...matched].sort((a, b) => {
    if (b.rule.priority !== a.rule.priority) return b.rule.priority - a.rule.priority;
    return a.index - b.index;
  });

  const pluginDesires = new Map<string, PluginDesireInfo>();
  const commandEvents = new Map<string, CommandEventInfo>();

  for (const { rule } of ordered) {
    for (const action of rule.actions) {
      const def = actions.get(action.type);
      if (!def) {
        warnings.push(`Rule "${rule.name}": unknown action type "${action.type}" skipped`);
        continue;
      }
      if (def.category === "state") {
        const effect = def.stateEffect ? def.stateEffect(action) : null;
        if (!effect) continue;
        const existing = pluginDesires.get(effect.pluginId);
        if (!existing) {
          pluginDesires.set(effect.pluginId, {
            pluginId: effect.pluginId,
            enabled: effect.enabled,
            ruleId: rule.id,
            ruleName: rule.name,
            priority: rule.priority,
            overridden: [],
          });
        } else {
          // First writer (higher priority) wins. Record the loss for Diagnostics.
          existing.overridden.push({
            ruleId: rule.id,
            ruleName: rule.name,
            enabled: effect.enabled,
            priority: rule.priority,
          });
          if (existing.enabled !== effect.enabled) {
            warnings.push(
              `Conflict on plugin "${effect.pluginId}": "${rule.name}" wants ` +
                `${effect.enabled ? "ON" : "OFF"}, but "${existing.ruleName}" (priority ${existing.priority}) wins`,
            );
          }
        }
      } else {
        const effect = def.eventEffect ? def.eventEffect(action) : null;
        if (!effect) continue;
        const key = effect.commandId;
        const existing = commandEvents.get(key);
        const trigger: ActionTrigger = action.trigger === "onEvaluate" ? "onEvaluate" : "onEnter";
        if (!existing) {
          commandEvents.set(key, {
            commandId: key,
            ruleId: rule.id,
            ruleName: rule.name,
            priority: rule.priority,
            trigger,
          });
        } else if (existing.ruleId !== rule.id) {
          warnings.push(
            `Command "${key}" requested by both "${rule.name}" and "${existing.ruleName}"; running once (higher priority)`,
          );
        }
      }
    }
  }

  return {
    ruleMatches,
    matchedRuleIds: ordered.map((m) => m.rule.id),
    pluginDesires,
    commandEvents: [...commandEvents.values()],
    warnings,
  };
}

/**
 * Rule-enter edges: ids that are matched now but were not matched before.
 * On the first run `previousIds` is empty, so every matched rule is an edge;
 * the caller decides whether startup edges may fire Event Actions.
 */
export function computeRuleEdges(
  matchedIds: readonly string[],
  previousIds: ReadonlySet<string>,
): string[] {
  return matchedIds.filter((id) => !previousIds.has(id));
}
