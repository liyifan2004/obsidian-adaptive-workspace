/**
 * State Action  — declares a desired state, managed via desired-state diff.
 * Event Action  — fires once on a rule-enter edge (cannot be diffed).
 */
export type ActionCategory = "state" | "event";

export type ActionTrigger = "onEnter" | "onEvaluate";

export interface Action {
  /** Action provider type: "enablePlugin" | "disablePlugin" | "executeCommand". */
  type: string;
  /** Target: plugin id for plugin actions, command id for command actions. */
  target: string;
  /** Event actions only: when to fire. MVP implements "onEnter" only. */
  trigger?: ActionTrigger;
  /** State actions only: persist via AndSave (default true). */
  persist?: boolean;
}
