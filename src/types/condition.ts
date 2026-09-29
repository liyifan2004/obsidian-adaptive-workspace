export type Operator = "equals" | "notEquals" | "gt" | "gte" | "lt" | "lte";

export interface Condition {
  /** Condition provider type, e.g. "display" | "window". */
  type: string;
  /** Property within the provider, e.g. "internal" | "state" | "width". */
  property: string;
  operator: Operator;
  value: string | number | boolean;
}
