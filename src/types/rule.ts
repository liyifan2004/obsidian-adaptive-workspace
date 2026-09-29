import type { Action } from "./action";
import type { Condition } from "./condition";

export type ConditionLogic = "AND" | "OR";

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  conditions: Condition[];
  conditionLogic: ConditionLogic;
  actions: Action[];
  /** Higher number wins on conflicts. Ties: earlier in the rules array wins. */
  priority: number;
}
