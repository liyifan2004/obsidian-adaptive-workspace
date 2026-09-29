import type { Condition } from "../types/condition";
import type { EnvironmentState } from "../types/environment";
import { compare, type ConditionDef } from "./condition-registry";

const NUMERIC_OPERATORS = ["equals", "notEquals", "gt", "gte", "lt", "lte"] as const;

export const windowConditionDef: ConditionDef = {
  type: "window",
  label: "Window",
  properties: [
    {
      key: "state",
      label: "Window state",
      kind: "enum",
      options: [
        { value: "normal", label: "Normal (windowed)" },
        { value: "maximized", label: "Maximized" },
        { value: "fullscreen", label: "Fullscreen" },
        { value: "minimized", label: "Minimized" },
      ],
      operators: ["equals", "notEquals"],
      defaultOperator: "equals",
      defaultValue: "maximized",
    },
    {
      key: "maximized",
      label: "Is maximized",
      kind: "boolean",
      operators: ["equals", "notEquals"],
      defaultOperator: "equals",
      defaultValue: true,
    },
    {
      key: "fullscreen",
      label: "Is fullscreen",
      kind: "boolean",
      operators: ["equals", "notEquals"],
      defaultOperator: "equals",
      defaultValue: true,
    },
    {
      key: "width",
      label: "Window width (px)",
      kind: "number",
      operators: [...NUMERIC_OPERATORS],
      defaultOperator: "gte",
      defaultValue: 1800,
    },
    {
      key: "height",
      label: "Window height (px)",
      kind: "number",
      operators: [...NUMERIC_OPERATORS],
      defaultOperator: "gte",
      defaultValue: 1000,
    },
  ],
  evaluate(state: EnvironmentState, condition: Condition): boolean {
    const w = state.window;
    switch (condition.property) {
      case "state":
        return compare(condition.operator, w.state, condition.value);
      case "maximized":
        return compare(condition.operator, w.maximized, condition.value);
      case "fullscreen":
        return compare(condition.operator, w.fullscreen, condition.value);
      case "width":
        return compare(condition.operator, w.width, condition.value);
      case "height":
        return compare(condition.operator, w.height, condition.value);
      default:
        return false;
    }
  },
};
