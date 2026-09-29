import { describe, expect, it } from "vitest";
import { StateManager } from "../src/core/state-manager";
import type { ActionResult, PluginControl } from "../src/core/action-executor";
import type { EvaluationResult, PluginDesireInfo } from "../src/core/rule-engine";
import { PluginLog } from "../src/utils/logging";

class FakeControl implements PluginControl {
  enabled = new Set<string>();
  enableCalls: string[] = [];
  disableCalls: string[] = [];
  commandCalls: string[] = [];
  failCommands = new Set<string>();

  hasPlugin(): boolean {
    return true;
  }

  isPluginEnabled(pluginId: string): boolean {
    return this.enabled.has(pluginId);
  }

  async setPluginEnabled(pluginId: string, enable: boolean): Promise<ActionResult> {
    if (enable) {
      this.enabled.add(pluginId);
      this.enableCalls.push(pluginId);
    } else {
      this.enabled.delete(pluginId);
      this.disableCalls.push(pluginId);
    }
    return { ok: true };
  }

  executeCommand(commandId: string): ActionResult {
    if (this.failCommands.has(commandId)) return { ok: false, error: "boom" };
    this.commandCalls.push(commandId);
    return { ok: true };
  }
}

function result(partial: Partial<EvaluationResult>): EvaluationResult {
  return {
    ruleMatches: [],
    matchedRuleIds: [],
    pluginDesires: new Map(),
    commandEvents: [],
    warnings: [],
    ...partial,
  };
}

function desire(pluginId: string, enabled: boolean, ruleId: string): [string, PluginDesireInfo] {
  return [pluginId, { pluginId, enabled, ruleId, ruleName: ruleId, priority: 0, overridden: [] }];
}

describe("StateManager", () => {
  it("only acts when actual state differs from desired (no repeated enables)", async () => {
    const control = new FakeControl();
    const sm = new StateManager(control, new PluginLog());
    const r = result({ pluginDesires: new Map([desire("p", true, "a")]), matchedRuleIds: ["a"] });

    await sm.apply(r, { runCommandsOnStartup: false });
    await sm.apply(r, { runCommandsOnStartup: false });
    expect(control.enableCalls).toEqual(["p"]); // second pass: already ON → no action
  });

  it("re-enforces desired state after a manual change", async () => {
    const control = new FakeControl();
    const sm = new StateManager(control, new PluginLog());
    const r = result({ pluginDesires: new Map([desire("p", true, "a")]), matchedRuleIds: ["a"] });
    await sm.apply(r, { runCommandsOnStartup: false });

    control.enabled.delete("p"); // user manually disables
    await sm.apply(r, { runCommandsOnStartup: false });
    expect(control.enableCalls).toEqual(["p", "p"]);
  });

  it("suppresses command actions on the startup pass by default", async () => {
    const control = new FakeControl();
    const sm = new StateManager(control, new PluginLog());
    const r = result({
      matchedRuleIds: ["a"],
      commandEvents: [{ commandId: "cmd:x", ruleId: "a", ruleName: "a", priority: 0, trigger: "onEnter" }],
    });
    await sm.apply(r, { runCommandsOnStartup: false });
    expect(control.commandCalls).toEqual([]);
  });

  it("fires startup commands when runCommandsOnStartup is enabled", async () => {
    const control = new FakeControl();
    const sm = new StateManager(control, new PluginLog());
    const r = result({
      matchedRuleIds: ["a"],
      commandEvents: [{ commandId: "cmd:x", ruleId: "a", ruleName: "a", priority: 0, trigger: "onEnter" }],
    });
    await sm.apply(r, { runCommandsOnStartup: true });
    expect(control.commandCalls).toEqual(["cmd:x"]);
  });

  it("fires onEnter commands only on rule-enter edges", async () => {
    const control = new FakeControl();
    const sm = new StateManager(control, new PluginLog());
    const r = result({
      matchedRuleIds: ["a"],
      commandEvents: [{ commandId: "cmd:x", ruleId: "a", ruleName: "a", priority: 0, trigger: "onEnter" }],
    });
    await sm.apply(r, { runCommandsOnStartup: false }); // startup: suppressed
    await sm.apply(r, { runCommandsOnStartup: false }); // still matched: no edge
    expect(control.commandCalls).toEqual([]);

    await sm.apply(result({ matchedRuleIds: [] }), { runCommandsOnStartup: false }); // leave
    await sm.apply(r, { runCommandsOnStartup: false }); // re-enter: fires once
    expect(control.commandCalls).toEqual(["cmd:x"]);
  });

  it("continues with other actions when one command fails", async () => {
    const control = new FakeControl();
    control.failCommands.add("cmd:bad");
    const sm = new StateManager(control, new PluginLog());
    const r = result({
      matchedRuleIds: ["a", "b"],
      commandEvents: [
        { commandId: "cmd:bad", ruleId: "a", ruleName: "a", priority: 0, trigger: "onEnter" },
        { commandId: "cmd:good", ruleId: "b", ruleName: "b", priority: 0, trigger: "onEnter" },
      ],
    });
    await sm.apply(r, { runCommandsOnStartup: true });
    expect(control.commandCalls).toEqual(["cmd:good"]);
  });

  it("records a managed-plugin ledger entry", async () => {
    const control = new FakeControl();
    const sm = new StateManager(control, new PluginLog());
    await sm.apply(result({ pluginDesires: new Map([desire("p", true, "a")]), matchedRuleIds: ["a"] }), {
      runCommandsOnStartup: false,
    });
    const ledger = sm.getLedger();
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.desired).toBe(true);
    expect(ledger[0]?.current).toBe(true);
    expect(ledger[0]?.lastAction).toContain("enable");
  });
});
