import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InternalApi,
  type AppInternals,
  type ElectronBrowserWindowLike,
  type ElectronDisplayLike,
  type ElectronScreenLike,
} from "../src/core/internal-api";

/**
 * Covers the internal-API adapter (F-022): remote discovery chain, capability
 * tiering, DOM fallbacks, and the plugin/command access shims. The test
 * environment aliases window to globalThis (scripts/vitest-setup.mjs), so the
 * electron stubs live on globalThis.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeDisplay(overrides: Partial<ElectronDisplayLike> = {}): ElectronDisplayLike {
  return {
    id: 1,
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    size: { width: 1920, height: 1080 },
    scaleFactor: 1,
    ...overrides,
  };
}

function makeBrowserWindow(): ElectronBrowserWindowLike {
  return {
    getBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }),
    isMaximized: () => false,
    isFullScreen: () => false,
    isMinimized: () => false,
    on: () => undefined,
    removeListener: () => undefined,
  };
}

function makeScreen(): ElectronScreenLike {
  const display = makeDisplay();
  return {
    getAllDisplays: () => [display],
    getPrimaryDisplay: () => display,
    getDisplayMatching: () => display,
    on: () => undefined,
    removeListener: () => undefined,
  };
}

function makeRemote() {
  return {
    getCurrentWindow: () => makeBrowserWindow(),
    screen: makeScreen(),
  };
}

/** App with a complete plugins + commands surface (tier "full"). */
function makeFullApp(overrides: Partial<AppInternals> = {}): AppInternals {
  return {
    plugins: {
      manifests: { "some-plugin": { id: "some-plugin", name: "Some plugin" } },
      plugins: { "some-plugin": {} },
      enabledPlugins: new Set(["some-plugin"]),
      enablePluginAndSave: () => undefined,
      disablePluginAndSave: () => undefined,
    },
    commands: {
      listCommands: () => [{ id: "cmd-a", name: "Command A" }],
      executeCommandById: () => true,
    },
    ...overrides,
  };
}

describe("remote discovery and capability tiers", () => {
  it("uses window.electron.remote when present and reports tier full", () => {
    vi.stubGlobal("electron", { remote: makeRemote() });
    const api = new InternalApi(makeFullApp());
    expect(api.probe().via).toBe("window.electron.remote");
    expect(api.probe().remote).toBe(true);
    expect(api.capabilityTier()).toBe("full");
  });

  it("falls back to require('electron').remote", () => {
    vi.stubGlobal("require", (id: string) => (id === "electron" ? { remote: makeRemote() } : undefined));
    const api = new InternalApi(makeFullApp());
    expect(api.probe().via).toBe("require('electron').remote");
    expect(api.isRemoteAvailable()).toBe(true);
  });

  it("degrades to DOM mode when no remote is reachable", () => {
    const api = new InternalApi({});
    expect(api.probe().remote).toBe(false);
    expect(api.capabilityTier()).toBe("degraded");
    expect(api.probe().notes.join(" ")).toContain("electron remote unavailable");
    expect(api.isRemoteAvailable()).toBe(false);
  });

  it("reports limited when the plugin/command APIs are incomplete", () => {
    vi.stubGlobal("electron", { remote: makeRemote() });
    const api = new InternalApi({});
    expect(api.capabilityTier()).toBe("limited");
    const notes = api.probe().notes.join(" ");
    expect(notes).toContain("app.plugins API incomplete");
    expect(notes).toContain("app.commands API incomplete");
  });
});

describe("DOM fallbacks (no remote)", () => {
  it("synthesizes a single display from window.screen", () => {
    vi.stubGlobal("screen", {
      width: 1440,
      height: 900,
      availLeft: 0,
      availTop: 0,
      availWidth: 1440,
      availHeight: 860,
    });
    vi.stubGlobal("devicePixelRatio", 2);
    const displays = new InternalApi({}).getDisplays();
    expect(displays).toHaveLength(1);
    expect(displays[0]).toMatchObject({
      label: "DOM screen",
      size: { width: 1440, height: 900 },
      scaleFactor: 2,
    });
  });

  it("approximates the window bounds from screenX/outerWidth", () => {
    vi.stubGlobal("screenX", 40);
    vi.stubGlobal("screenY", 20);
    vi.stubGlobal("outerWidth", 1000);
    vi.stubGlobal("outerHeight", 700);
    expect(new InternalApi({}).getWindowBounds()).toEqual({
      x: 40,
      y: 20,
      width: 1000,
      height: 700,
    });
  });

  it("approximates maximized from the available screen size", () => {
    vi.stubGlobal("screen", {
      width: 1000,
      height: 800,
      availLeft: 0,
      availTop: 0,
      availWidth: 1000,
      availHeight: 800,
    });
    vi.stubGlobal("outerWidth", 1000);
    vi.stubGlobal("outerHeight", 800);
    const state = new InternalApi({}).getWindowState();
    expect(state).toEqual({ maximized: true, fullscreen: false, minimized: false });
  });
});

describe("plugin management shims", () => {
  function appWithPlugins(pluginState: NonNullable<AppInternals["plugins"]>): AppInternals {
    return { plugins: pluginState };
  }

  it("reads enabled state from a Set or an array, then falls back to running instances", () => {
    const viaSet = new InternalApi(
      appWithPlugins({ enabledPlugins: new Set(["a"]), plugins: {} }),
    );
    expect(viaSet.isPluginEnabled("a")).toBe(true);
    expect(viaSet.isPluginEnabled("b")).toBe(false);

    const viaArray = new InternalApi(appWithPlugins({ enabledPlugins: ["b"], plugins: {} }));
    expect(viaArray.isPluginEnabled("b")).toBe(true);

    const viaRunning = new InternalApi(appWithPlugins({ plugins: { c: {} } }));
    expect(viaRunning.isPluginEnabled("c")).toBe(true);
    expect(viaRunning.isPluginLoaded("c")).toBe(true);
    expect(viaRunning.isPluginLoaded("missing")).toBe(false);
  });

  it("delegates enable/disable and survives a missing API without throwing", () => {
    const enable = vi.fn();
    const disable = vi.fn();
    const api = new InternalApi(appWithPlugins({ enablePluginAndSave: enable, disablePluginAndSave: disable }));
    api.enablePluginAndSave("x");
    api.disablePluginAndSave("x");
    expect(enable).toHaveBeenCalledWith("x");
    expect(disable).toHaveBeenCalledWith("x");

    const bare = new InternalApi({});
    expect(() => {
      bare.enablePluginAndSave("x");
      bare.disablePluginAndSave("x");
    }).not.toThrow();
  });

  it("lists installed plugin manifests", () => {
    const api = new InternalApi(
      appWithPlugins({ manifests: { p: { id: "p", name: "P", description: "d" } } }),
    );
    expect(api.listInstalledPlugins().map((m) => m.id)).toEqual(["p"]);
    expect(api.getManifest("p")?.name).toBe("P");
    expect(api.getManifest("missing")).toBeNull();
  });
});

describe("command shims", () => {
  it("prefers listCommands() and falls back to the commands record", () => {
    const viaFn = new InternalApi({
      commands: {
        listCommands: () => [{ id: "a", name: "A" }],
        commands: { b: { id: "b", name: "B" } },
      },
    });
    expect(viaFn.listCommands().map((c) => c.id)).toEqual(["a"]);

    const viaRecord = new InternalApi({ commands: { commands: { b: { id: "b", name: "B" } } } });
    expect(viaRecord.listCommands().map((c) => c.id)).toEqual(["b"]);

    expect(new InternalApi({}).listCommands()).toEqual([]);
  });

  it("reports command execution results faithfully", () => {
    expect(new InternalApi({}).executeCommandById("x")).toBe(false);

    const declined = new InternalApi({ commands: { executeCommandById: () => false } });
    expect(declined.executeCommandById("x")).toBe(false);

    const ok = new InternalApi({ commands: { executeCommandById: () => undefined } });
    expect(ok.executeCommandById("x")).toBe(true);
  });
});
