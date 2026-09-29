import { describe, expect, it } from "vitest";
import { CURRENT_SETTINGS_VERSION, DEFAULT_SETTINGS, migrate } from "../src/types/settings";

describe("settings migration", () => {
  it("returns defaults for empty/invalid input", () => {
    for (const raw of [null, undefined, 42, "x", [], {}]) {
      const { settings } = migrate(raw);
      expect(settings.enabled).toBe(DEFAULT_SETTINGS.enabled);
      expect(settings.rules).toEqual([]);
    }
  });

  it("keeps valid rules and drops malformed ones", () => {
    const { settings, migrated, fromVersion } = migrate({
      settingsVersion: 1,
      settings: {
        enabled: false,
        runCommandsOnStartup: true,
        rules: [
          {
            id: "good",
            name: "Good",
            enabled: true,
            conditions: [{ type: "window", property: "state", operator: "equals", value: "maximized" }],
            conditionLogic: "AND",
            actions: [{ type: "enablePlugin", target: "p" }],
            priority: 0,
          },
          { id: "bad" },
          "not-a-rule",
        ],
      },
    });
    expect(migrated).toBe(false);
    expect(fromVersion).toBe(CURRENT_SETTINGS_VERSION);
    expect(settings.enabled).toBe(false);
    expect(settings.runCommandsOnStartup).toBe(true);
    expect(settings.rules.map((r) => r.id)).toEqual(["good"]);
  });

  it("treats 0 as a legal value (not missing)", () => {
    const { settings } = migrate({
      settingsVersion: 1,
      settings: {
        rules: [
          {
            id: "r",
            name: "n",
            priority: 0,
            conditions: [],
            actions: [{ type: "enablePlugin", target: "p" }],
          },
        ],
      },
    });
    expect(settings.rules[0]?.priority).toBe(0);
    expect(settings.rules[0]?.name).toBe("n");
    expect(settings.rules[0]?.actions).toHaveLength(1);
  });

  it("falls back on bad types", () => {
    const { settings } = migrate({
      settingsVersion: 1,
      settings: {
        enabled: "yes",
        runCommandsOnStartup: 1,
        displayAssignments: {
          "1": { identity: "internal", width: 1920, height: 1080, scaleFactor: 1 },
          "2": { identity: "green" },
          "3": "nope",
        },
        rules: "many",
      },
    });
    expect(settings.enabled).toBe(true); // default
    expect(settings.runCommandsOnStartup).toBe(false); // default
    expect(Object.keys(settings.displayAssignments)).toEqual(["1"]);
    expect(settings.rules).toEqual([]);
  });

  it("flags migration from older versions", () => {
    const { migrated, fromVersion } = migrate({ settingsVersion: 0, rules: [] });
    expect(migrated).toBe(true);
    expect(fromVersion).toBe(0);
  });

  it("keeps unknown action/condition fields for forward compatibility", () => {
    const { settings } = migrate({
      settingsVersion: 1,
      settings: {
        rules: [
          {
            id: "r",
            name: "n",
            conditions: [{ type: "display", property: "identity", operator: "equals", value: "external" }],
            actions: [{ type: "enablePlugin", target: "p", persist: false, trigger: "onEnter" }],
          },
        ],
      },
    });
    expect(settings.rules[0]?.actions[0]?.persist).toBe(false);
    expect(settings.rules[0]?.actions[0]?.trigger).toBe("onEnter");
    expect(settings.rules[0]?.conditions[0]?.property).toBe("identity");
  });
});
