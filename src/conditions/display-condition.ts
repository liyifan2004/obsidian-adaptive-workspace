import type { Condition } from "../types/condition";
import type { EnvironmentState } from "../types/environment";
import { compare, type ConditionDef } from "./condition-registry";

const NUMERIC_OPERATORS = ["equals", "notEquals", "gt", "gte", "lt", "lte"] as const;

export const displayConditionDef: ConditionDef = {
  type: "display",
  label: "Display",
  properties: [
    {
      key: "identity",
      label: "Identity",
      kind: "enum",
      options: [
        { value: "internal", label: "Internal (laptop screen)" },
        { value: "external", label: "External display" },
        { value: "unknown", label: "Unknown" },
      ],
      operators: ["equals", "notEquals"],
      defaultOperator: "equals",
      defaultValue: "internal",
    },
    {
      key: "internal",
      label: "Is internal display",
      kind: "boolean",
      operators: ["equals", "notEquals"],
      defaultOperator: "equals",
      defaultValue: true,
    },
    {
      key: "id",
      label: "Display ID",
      kind: "number",
      operators: [...NUMERIC_OPERATORS],
      defaultOperator: "equals",
      defaultValue: 0,
    },
    {
      key: "width",
      label: "Resolution width (px)",
      kind: "number",
      operators: [...NUMERIC_OPERATORS],
      defaultOperator: "gte",
      defaultValue: 1920,
    },
    {
      key: "height",
      label: "Resolution height (px)",
      kind: "number",
      operators: [...NUMERIC_OPERATORS],
      defaultOperator: "gte",
      defaultValue: 1080,
    },
    {
      key: "scaleFactor",
      label: "Scale factor",
      kind: "number",
      operators: [...NUMERIC_OPERATORS],
      defaultOperator: "equals",
      defaultValue: 1,
    },
  ],
  evaluate(state: EnvironmentState, condition: Condition): boolean {
    const d = state.display;
    switch (condition.property) {
      case "identity":
        return compare(condition.operator, d.identity, condition.value);
      case "internal": {
        // "unknown" identity must never satisfy internal/external checks:
        // we refuse to guess (see docs/adr/0002).
        if (d.identity === "unknown") return false;
        const isInternal = d.identity === "internal";
        return compare(condition.operator, isInternal, condition.value);
      }
      case "id":
        return compare(condition.operator, d.id, condition.value);
      case "width":
        return compare(condition.operator, d.size.width, condition.value);
      case "height":
        return compare(condition.operator, d.size.height, condition.value);
      case "scaleFactor":
        return compare(condition.operator, d.scaleFactor, condition.value);
      default:
        return false;
    }
  },
};
