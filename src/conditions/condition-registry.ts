import type { Condition, Operator } from "../types/condition";
import type { EnvironmentState } from "../types/environment";

export type ConditionValueKind = "boolean" | "number" | "string" | "enum";

export interface ConditionPropertyDef {
  key: string;
  label: string;
  kind: ConditionValueKind;
  /** For kind === "enum". */
  options?: Array<{ value: string; label: string }>;
  operators: Operator[];
  defaultOperator: Operator;
  defaultValue: string | number | boolean;
}

export interface ConditionDef {
  type: string;
  label: string;
  properties: ConditionPropertyDef[];
  /** Pure evaluation against an environment snapshot. */
  evaluate(state: EnvironmentState, condition: Condition): boolean;
}

/**
 * Registry of condition providers. UI renders editors from the schema,
 * so adding a future condition type does not require rewriting the
 * settings page (architecture requirement).
 */
export class ConditionRegistry {
  private readonly defs = new Map<string, ConditionDef>();

  register(def: ConditionDef): void {
    this.defs.set(def.type, def);
  }

  get(type: string): ConditionDef | undefined {
    return this.defs.get(type);
  }

  all(): ConditionDef[] {
    return [...this.defs.values()];
  }
}

/* ------------------------------------------------------------------ */
/* shared evaluation helpers                                           */
/* ------------------------------------------------------------------ */

export function compare(operator: Operator, actual: unknown, expected: unknown): boolean {
  switch (operator) {
    case "equals":
      return actual === expected;
    case "notEquals":
      return actual !== expected;
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const a = typeof actual === "number" ? actual : Number(actual);
      const b = typeof expected === "number" ? expected : Number(expected);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
      switch (operator) {
        case "gt":
          return a > b;
        case "gte":
          return a >= b;
        case "lt":
          return a < b;
        default:
          return a <= b;
      }
    }
    default:
      return false;
  }
}
