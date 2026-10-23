import { afterEach, describe, expect, it, vi } from "vitest";
import { StateManager } from "../src/core/state-manager";
import type { ActionResult, PluginControl } from "../src/core/action-executor";
import type { EvaluationResult, PluginDesireInfo } from "../src/core/rule-engine";
import type { ActionTrigger } from "../src/types/action";
import { PluginLog } from "../src/utils/logging";
import { ON_EVALUATE_MIN_INTERVAL_MS } from "../src/config";

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

function cmd(
  commandId: string,
  trigger: ActionTrigger = "onEvaluate",
  ruleId = "a",
): EvaluationResult["commandEvents"][number] {
  return { commandId, ruleId, ruleName: ruleId, priority: 0, trigger };
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

describe("StateManager onEvaluate rate limit (ADR 0008)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("defers a repeated onEvaluate and runs it once in the trailing pass", async () => {
    vi.useFakeTimers();
    const control = new FakeControl();
    const sm = new StateManager(control, new PluginLog());
    const r = result({ matchedRuleIds: ["a"], commandEvents: [cmd("cmd:x")] });

    await sm.apply(r, { runCommandsOnStartup: true }); // leading edge: fires
    await sm.apply(r, { runCommandsOnStartup: true }); // inside the interval: deferred
    expect(control.commandCalls).toEqual(["cmd:x"]);
    expect(sm.getEvaluateLog()[1]?.warnings.some((w) => w.includes("rate limit"))).toBe(true);

    vi.advanceTimersByTime(ON_EVALUATE_MIN_INTERVAL_MS);
    expect(control.commandCalls).toEqual(["cmd:x", "cmd:x"]); // trailing run, no lost wakeup
    sm.dispose();
  });

  it("rate-limits each command independently", async () => {
    vi.useFakeTimers();
    const control = new FakeControl();
    const sm = new StateManager(control, new PluginLog());
    const both = result({ matchedRuleIds: ["a"], commandEvents: [cmd("cmd:a"), cmd("cmd:b")] });

    await sm.apply(both, { runCommandsOnStartup: true });
    await sm.apply(both, { runCommandsOnStartup: true });
    expect(control.commandCalls).toEqual(["cmd:a", "cmd:b"]);

    vi.advanceTimersByTime(ON_EVALUATE_MIN_INTERVAL_MS);
    expect(control.commandCalls).toEqual(["cmd:a", "cmd:b", "cmd:a", "cmd:b"]);
    sm.dispose();
  });

  it("lets a manual evaluation bypass the limit and cancels the queued trailing run", async () => {
    vi.useFakeTimers();
    const control = new FakeControl();
    const sm = new StateManager(control, new PluginLog());
    const r = result({ matchedRuleIds: ["a"], commandEvents: [cmd("cmd:x")] });

    await sm.apply(r, { runCommandsOnStartup: true }); // fires
    await sm.apply(r, { runCommandsOnStartup: true }); // deferred + queued
    await sm.apply(r, { runCommandsOnStartup: true, manual: true }); // fires now, drops the queue
    expect(control.commandCalls).toEqual(["cmd:x", "cmd:x"]);

    vi.advanceTimersByTime(ON_EVALUATE_MIN_INTERVAL_MS * 2);
    expect(control.commandCalls).toEqual(["cmd:x", "cmd:x"]); // queued trailing was cancelled
    sm.dispose();
  });

  it("does not rate-limit onEnter edge firings", async () => {
    vi.useFakeTimers();
    const control = new FakeControl();
    const sm = new StateManager(control, new PluginLog());
    const r = result({ matchedRuleIds: ["a"], commandEvents: [cmd("cmd:x", "onEnter")] });

    await sm.apply(r, { runCommandsOnStartup: true }); // startup edge: fires
    await sm.apply(result({ matchedRuleIds: [] }), { runCommandsOnStartup: true }); // leave
    await sm.apply(r, { runCommandsOnStartup: true }); // re-enter immediately: still fires
    expect(control.commandCalls).toEqual(["cmd:x", "cmd:x"]);
    sm.dispose();
  });

  it("dispose cancels the pending trailing run", async () => {
    vi.useFakeTimers();
    const control = new FakeControl();
    const sm = new StateManager(control, new PluginLog());
    const r = result({ matchedRuleIds: ["a"], commandEvents: [cmd("cmd:x")] });

    await sm.apply(r, { runCommandsOnStartup: true });
    await sm.apply(r, { runCommandsOnStartup: true }); // deferred + queued
    sm.dispose();
    vi.advanceTimersByTime(ON_EVALUATE_MIN_INTERVAL_MS * 2);
    expect(control.commandCalls).toEqual(["cmd:x"]);
  });
});
