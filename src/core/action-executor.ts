import type { PluginManifestLike } from "./internal-api";
import type { PluginLog } from "../utils/logging";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Abstraction over side effects so the StateManager stays testable.
 * Implemented by ActionExecutor; tests provide a fake.
 */
export interface PluginControl {
  hasPlugin(pluginId: string): boolean;
  isPluginEnabled(pluginId: string): boolean;
  setPluginEnabled(pluginId: string, enabled: boolean): Promise<ActionResult>;
  executeCommand(commandId: string): ActionResult;
}

export interface ActionExecutorDeps {
  listInstalledPlugins(): PluginManifestLike[];
  isPluginEnabled(pluginId: string): boolean;
  enablePluginAndSave(pluginId: string): void;
  disablePluginAndSave(pluginId: string): void;
  listCommands(): Array<{ id: string; name: string }>;
  executeCommandById(commandId: string): boolean;
}

/**
 * Executes the merged results only (State Actions via diff, Event Actions
 * via edges). Every failure is captured — one bad action never blocks the
 * rest (reliability requirement 8/9).
 */
export class ActionExecutor implements PluginControl {
  constructor(
    private readonly deps: ActionExecutorDeps,
    private readonly log: PluginLog,
    private readonly selfId: string,
  ) {}

  hasPlugin(pluginId: string): boolean {
    return this.deps.listInstalledPlugins().some((m) => m.id === pluginId);
  }

  isPluginEnabled(pluginId: string): boolean {
    try {
      return this.deps.isPluginEnabled(pluginId);
    } catch (e) {
      this.log.error(`isPluginEnabled(${pluginId}) failed`, String(e));
      return false;
    }
  }

  async setPluginEnabled(pluginId: string, enabled: boolean): Promise<ActionResult> {
    if (pluginId === this.selfId) {
      const msg = "Self-protection: refusing to enable/disable Adaptive Workspace itself";
      this.log.error(msg);
      return { ok: false, error: msg };
    }
    if (!this.hasPlugin(pluginId)) {
      const msg = `Target plugin "${pluginId}" is not installed`;
      this.log.warn(msg);
      return { ok: false, error: msg };
    }
    try {
      if (enabled) {
        this.deps.enablePluginAndSave(pluginId);
      } else {
        this.deps.disablePluginAndSave(pluginId);
      }
      this.log.info(`${enabled ? "Enabled" : "Disabled"} plugin ${pluginId}`);
      return { ok: true };
    } catch (e) {
      const msg = `Failed to ${enabled ? "enable" : "disable"} plugin "${pluginId}": ${String(e)}`;
      this.log.error(msg);
      return { ok: false, error: msg };
    }
  }

  executeCommand(commandId: string): ActionResult {
    try {
      const ok = this.deps.executeCommandById(commandId);
      if (ok) {
        this.log.info(`Executed command ${commandId}`);
        return { ok: true };
      }
      const msg = `Command "${commandId}" declined (missing or checkCallback refused)`;
      this.log.warn(msg);
      return { ok: false, error: msg };
    } catch (e) {
      const msg = `Command "${commandId}" threw: ${String(e)}`;
      this.log.error(msg);
      return { ok: false, error: msg };
    }
  }
}
