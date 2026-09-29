import type { Action } from "../types/action";
import type { ActionDef } from "./action-registry";

export const enablePluginActionDef: ActionDef = {
  type: "enablePlugin",
  label: "Enable Plugin",
  category: "state",
  targetKind: "plugin",
  stateEffect(action: Action) {
    return { pluginId: action.target, enabled: true };
  },
  describe(action: Action) {
    return `Enable plugin ${action.target}`;
  },
};

export const disablePluginActionDef: ActionDef = {
  type: "disablePlugin",
  label: "Disable Plugin",
  category: "state",
  targetKind: "plugin",
  stateEffect(action: Action) {
    return { pluginId: action.target, enabled: false };
  },
  describe(action: Action) {
    return `Disable plugin ${action.target}`;
  },
};
