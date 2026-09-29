import { describe, expect, it } from "vitest";
import { ActionExecutor, type ActionExecutorDeps } from "../src/core/action-executor";
import type { PluginManifestLike } from "../src/core/internal-api";
import { PluginLog } from "../src/utils/logging";

function makeDeps(overrides?: {
  plugins?: PluginManifestLike[];
  executeResult?: boolean;
}): { deps: ActionExecutorDeps; calls: string[] } {
  const calls: string[] = [];
  const plugins = overrides?.plugins ?? [{ id: "plugin-a", name: "Plugin A" }];
  const deps: ActionExecutorDeps = {
    listInstalledPlugins: () => plugins,
    isPluginEnabled: () => true,
    enablePluginAndSave: (id) => {
      calls.push(`enable:${id}`);
    },
    disablePluginAndSave: (id) => {
      calls.push(`disable:${id}`);
    },
    listCommands: () => [{ id: "cmd", name: "Cmd" }],
    executeCommandById: () => {
      calls.push("execute:cmd");
      return overrides?.executeResult ?? true;
    },
  };
  return { deps, calls };
}

describe("ActionExecutor", () => {
  it("refuses to touch itself (self-protection)", async () => {
    const { deps, calls } = makeDeps({ plugins: [{ id: "adaptive-workspace", name: "AW" }] });
    const ex = new ActionExecutor(deps, new PluginLog(), "adaptive-workspace");
    const res = await ex.setPluginEnabled("adaptive-workspace", false);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/self-protection/i);
    expect(calls).toEqual([]);
  });

  it("skips a target plugin that is not installed", async () => {
    const { deps, calls } = makeDeps();
    const ex = new ActionExecutor(deps, new PluginLog(), "adaptive-workspace");
    const res = await ex.setPluginEnabled("ghost-plugin", true);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not installed/);
    expect(calls).toEqual([]);
  });

  it("enables an installed plugin", async () => {
    const { deps, calls } = makeDeps();
    const ex = new ActionExecutor(deps, new PluginLog(), "adaptive-workspace");
    const res = await ex.setPluginEnabled("plugin-a", true);
    expect(res.ok).toBe(true);
    expect(calls).toEqual(["enable:plugin-a"]);
  });

  it("reports a declined command without throwing", () => {
    const { deps } = makeDeps({ executeResult: false });
    const ex = new ActionExecutor(deps, new PluginLog(), "adaptive-workspace");
    const res = ex.executeCommand("cmd");
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it("captures a throwing dependency instead of crashing", async () => {
    const { deps } = makeDeps();
    deps.enablePluginAndSave = () => {
      throw new Error("boom");
    };
    const ex = new ActionExecutor(deps, new PluginLog(), "adaptive-workspace");
    const res = await ex.setPluginEnabled("plugin-a", true);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/boom/);
  });
});
