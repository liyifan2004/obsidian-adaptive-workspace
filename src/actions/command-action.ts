import type { Action } from "../types/action";
import type { ActionDef } from "./action-registry";

/** Heuristic: command ids/names containing these are likely Toggle commands. */
const TOGGLE_PATTERN = /toggle|切换/i;

export function isLikelyToggleCommand(id: string, name: string): boolean {
  return TOGGLE_PATTERN.test(id) || TOGGLE_PATTERN.test(name);
}

export const executeCommandActionDef: ActionDef = {
  type: "executeCommand",
  label: "Execute Command",
  category: "event",
  targetKind: "command",
  eventEffect(action: Action) {
    return { commandId: action.target };
  },
  describe(action: Action) {
    const trigger = action.trigger === "onEvaluate" ? "onEvaluate" : "onEnter";
    return `Execute command ${action.target} (${trigger})`;
  },
};
