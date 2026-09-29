import type { Action } from "../types/action";

export type ActionTargetKind = "plugin" | "command" | "none";

export interface StateEffect {
  pluginId: string;
  enabled: boolean;
}

export interface EventEffect {
  commandId: string;
}

export interface ActionDef {
  type: string;
  label: string;
  /** "state" actions feed the desired state; "event" actions fire on edges. */
  category: "state" | "event";
  targetKind: ActionTargetKind;
  /** For state actions: the declared desired plugin state. */
  stateEffect?(action: Action): StateEffect | null;
  /** For event actions: the command to run. */
  eventEffect?(action: Action): EventEffect | null;
  describe(action: Action): string;
}

export class ActionRegistry {
  private readonly defs = new Map<string, ActionDef>();

  register(def: ActionDef): void {
    this.defs.set(def.type, def);
  }

  get(type: string): ActionDef | undefined {
    return this.defs.get(type);
  }

  all(): ActionDef[] {
    return [...this.defs.values()];
  }
}
