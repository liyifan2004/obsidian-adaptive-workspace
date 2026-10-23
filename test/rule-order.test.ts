import { describe, expect, it } from "vitest";
import { moveRule } from "../src/utils/rule-order";
import type { Rule } from "../src/types/rule";

function rule(id: string, priority: number): Rule {
  return {
    id,
    name: id,
    enabled: true,
    conditions: [{ type: "display", property: "identity", operator: "equals", value: "external" }],
    conditionLogic: "AND",
    actions: [{ type: "enablePlugin", target: "p" }],
    priority,
  };
}

describe("moveRule", () => {
  it("swaps priorities with the neighbor above (display order = priority order)", () => {
    const rules = [rule("a", 10), rule("b", 5), rule("c", 1)];
    const next = moveRule(rules, "b", "up");
    expect(next.map((r) => [r.id, r.priority])).toEqual([
      ["b", 10],
      ["a", 5],
      ["c", 1],
    ]);
    // sorted desc: b now comes first
    expect([...next].sort((x, y) => y.priority - x.priority).map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  it("swaps priorities with the neighbor below", () => {
    const rules = [rule("a", 10), rule("b", 5), rule("c", 1)];
    const next = moveRule(rules, "a", "down");
    expect(next.map((r) => [r.id, r.priority])).toEqual([
      ["b", 10],
      ["a", 5],
      ["c", 1],
    ]);
  });

  it("swaps array positions for equal priorities (tie-break order)", () => {
    const rules = [rule("a", 10), rule("b", 10), rule("c", 1)];
    const next = moveRule(rules, "b", "up");
    expect(next.map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(next.map((r) => r.priority)).toEqual([10, 10, 1]);
  });

  it("is a no-op at the boundaries and for unknown ids (same instance)", () => {
    const rules = [rule("a", 10), rule("b", 5)];
    expect(moveRule(rules, "a", "up")).toBe(rules);
    expect(moveRule(rules, "b", "down")).toBe(rules);
    expect(moveRule(rules, "ghost", "up")).toBe(rules);
    expect(moveRule([], "a", "up")).toEqual([]);
  });

  it("does not mutate the input rules", () => {
    const rules = [rule("a", 10), rule("b", 5)];
    const next = moveRule(rules, "b", "up");
    expect(rules.map((r) => r.priority)).toEqual([10, 5]);
    expect(next).not.toBe(rules);
    expect(next[0]).not.toBe(rules[0]);
  });

  it("moves a rule across several steps one neighbor at a time", () => {
    const rules = [rule("a", 3), rule("b", 2), rule("c", 1)];
    let next = moveRule(rules, "c", "up");
    next = moveRule(next, "c", "up");
    expect([...next].sort((x, y) => y.priority - x.priority).map((r) => r.id)).toEqual(["c", "a", "b"]);
  });
});
