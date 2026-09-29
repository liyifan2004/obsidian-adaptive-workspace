import { describe, expect, it } from "vitest";
import { ConditionRegistry, compare } from "../src/conditions/condition-registry";
import { displayConditionDef } from "../src/conditions/display-condition";
import { windowConditionDef } from "../src/conditions/window-condition";
import { ActionRegistry } from "../src/actions/action-registry";
import {
  enablePluginActionDef,
  disablePluginActionDef,
} from "../src/actions/plugin-action";
import { executeCommandActionDef } from "../src/actions/command-action";
import { computeRuleEdges, evaluateRules } from "../src/core/rule-engine";
import type { Rule } from "../src/types/rule";
import { makeState } from "./helpers";

function registries() {
  const conditions = new ConditionRegistry();
  conditions.register(displayConditionDef);
  conditions.register(windowConditionDef);
  const actions = new ActionRegistry();
  actions.register(enablePluginActionDef);
  actions.register(disablePluginActionDef);
  actions.register(executeCommandActionDef);
  return { conditions, actions };
}

function rule(partial: Partial<Rule> & Pick<Rule, "id">): Rule {
  return {
    name: partial.id,
    enabled: true,
    conditions: [],
    conditionLogic: "AND",
    actions: [],
    priority: 0,
    ...partial,
  };
}

describe("compare", () => {
  it("handles numeric operators", () => {
    expect(compare("gte", 1800, 1800)).toBe(true);
    expect(compare("gt", 1800, 1800)).toBe(false);
    expect(compare("lt", 5, 10)).toBe(true);
    expect(compare("notEquals", 5, 10)).toBe(true);
  });
});

describe("condition evaluation", () => {
  const { conditions, actions } = registries();

  it("matches window state = maximized", () => {
    const state = makeState({ state: "maximized", maximized: true });
    const r = rule({
      id: "a",
      conditions: [{ type: "window", property: "state", operator: "equals", value: "maximized" }],
      actions: [{ type: "enablePlugin", target: "p" }],
    });
    expect(evaluateRules([r], state, conditions, actions).matchedRuleIds).toEqual(["a"]);
  });

  it("treats fullscreen as distinct from maximized", () => {
    const state = makeState({ state: "fullscreen", fullscreen: true, maximized: true });
    const r = rule({
      id: "a",
      conditions: [{ type: "window", property: "state", operator: "equals", value: "maximized" }],
    });
    expect(evaluateRules([r], state, conditions, actions).matchedRuleIds).toEqual([]);
  });

  it("refuses to match internal/external when identity is unknown", () => {
    const state = makeState();
    state.display.identity = "unknown";
    state.display.detectionMethod = "unresolved";
    const r = rule({
      id: "a",
      conditions: [{ type: "display", property: "internal", operator: "equals", value: true }],
    });
    expect(evaluateRules([r], state, conditions, actions).matchedRuleIds).toEqual([]);
  });

  it("AND requires all conditions; OR requires any", () => {
    const state = makeState({ state: "maximized", maximized: true });
    const cond = [
      { type: "display", property: "identity", operator: "equals" as const, value: "external" },
      { type: "window", property: "state", operator: "equals" as const, value: "maximized" },
    ];
    state.display.identity = "external";
    const andRule = rule({ id: "and", conditions: cond, conditionLogic: "AND" });
    const orRule = rule({ id: "or", conditions: cond, conditionLogic: "OR" });
    const result = evaluateRules([andRule, orRule], state, conditions, actions);
    expect(result.matchedRuleIds).toContain("and");
    state.display.identity = "internal";
    const result2 = evaluateRules([andRule, orRule], state, conditions, actions);
    expect(result2.matchedRuleIds).toEqual(["or"]);
  });

  it("unknown condition types never match", () => {
    const state = makeState();
    const r = rule({
      id: "a",
      conditions: [{ type: "future-type", property: "x", operator: "equals", value: 1 }],
    });
    expect(evaluateRules([r], state, conditions, actions).matchedRuleIds).toEqual([]);
  });
});

describe("desired-state merge (conflicts)", () => {
  const { conditions, actions } = registries();
  const state = makeState();

  it("higher priority wins; loser recorded as overridden", () => {
    const a = rule({
      id: "A",
      priority: 100,
      conditions: [{ type: "window", property: "state", operator: "equals", value: "normal" }],
      actions: [{ type: "enablePlugin", target: "wide-plugin" }],
    });
    const b = rule({
      id: "B",
      priority: 50,
      conditions: [{ type: "window", property: "state", operator: "equals", value: "normal" }],
      actions: [{ type: "disablePlugin", target: "wide-plugin" }],
    });
    const result = evaluateRules([b, a], state, conditions, actions);
    const desire = result.pluginDesires.get("wide-plugin");
    expect(desire?.enabled).toBe(true);
    expect(desire?.ruleId).toBe("A");
    expect(desire?.overridden.map((o) => o.ruleId)).toEqual(["B"]);
  });

  it("tie on priority: earlier in the rules array wins", () => {
    const first = rule({
      id: "first",
      priority: 10,
      actions: [{ type: "disablePlugin", target: "p" }],
    });
    const second = rule({
      id: "second",
      priority: 10,
      actions: [{ type: "enablePlugin", target: "p" }],
    });
    const result = evaluateRules([first, second], state, conditions, actions);
    expect(result.pluginDesires.get("p")?.enabled).toBe(false);
    expect(result.pluginDesires.get("p")?.ruleId).toBe("first");
  });

  it("emits exactly one desired entry per plugin (no ON→OFF intermediate)", () => {
    const rules = [
      rule({ id: "r1", priority: 1, actions: [{ type: "enablePlugin", target: "p" }] }),
      rule({ id: "r2", priority: 2, actions: [{ type: "disablePlugin", target: "p" }] }),
      rule({ id: "r3", priority: 3, actions: [{ type: "enablePlugin", target: "p" }] }),
    ];
    const result = evaluateRules(rules, state, conditions, actions);
    expect(result.pluginDesires.size).toBe(1);
    expect(result.pluginDesires.get("p")?.enabled).toBe(true);
  });

  it("deduplicates command events across rules", () => {
    const rules = [
      rule({ id: "r1", priority: 5, actions: [{ type: "executeCommand", target: "cmd:x" }] }),
      rule({ id: "r2", priority: 1, actions: [{ type: "executeCommand", target: "cmd:x" }] }),
    ];
    const result = evaluateRules(rules, state, conditions, actions);
    expect(result.commandEvents).toHaveLength(1);
    expect(result.commandEvents[0]?.ruleId).toBe("r1");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("skips unknown action types with a warning", () => {
    const rules = [rule({ id: "r1", actions: [{ type: "futureAction", target: "x" }] })];
    const result = evaluateRules(rules, state, conditions, actions);
    expect(result.pluginDesires.size).toBe(0);
    expect(result.warnings.some((w) => w.includes("futureAction"))).toBe(true);
  });
});

describe("computeRuleEdges", () => {
  it("returns rules that newly entered", () => {
    expect(computeRuleEdges(["a", "b"], new Set(["a"]))).toEqual(["b"]);
    expect(computeRuleEdges(["a"], new Set(["a"]))).toEqual([]);
    expect(computeRuleEdges(["a", "b"], new Set())).toEqual(["a", "b"]);
  });
});
