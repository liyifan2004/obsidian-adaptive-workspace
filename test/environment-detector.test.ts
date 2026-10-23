import { describe, expect, it } from "vitest";
import { EnvironmentDetector, type EnvironmentApi } from "../src/core/environment-detector";
import type { ElectronDisplayLike } from "../src/core/internal-api";
import type { ObsidianInfo, Rect } from "../src/types/environment";
import { DEFAULT_SETTINGS, type Settings } from "../src/types/settings";

/* ------------------------------------------------------------------ */
/* fakes                                                               */
/* ------------------------------------------------------------------ */

interface FakeApiOptions {
  displays?: ElectronDisplayLike[];
  /** null → getPrimaryDisplay() returns null (no primary known). */
  primaryId?: number | null;
  /** null → getDisplayMatching() returns null. */
  matchingId?: number | null;
  windowBounds?: Rect;
  windowState?: { maximized?: boolean; fullscreen?: boolean; minimized?: boolean };
  remoteAvailable?: boolean;
}

function makeDisplay(overrides: Partial<ElectronDisplayLike> & { id: number }): ElectronDisplayLike {
  return {
    label: `Display ${overrides.id}`,
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    size: { width: 1920, height: 1080 },
    scaleFactor: 1,
    ...overrides,
  };
}

function makeFakeApi(opts: FakeApiOptions = {}): EnvironmentApi {
  const displays = opts.displays ?? [makeDisplay({ id: 1 })];
  const primaryId = opts.primaryId ?? null;
  const matchingId = opts.matchingId ?? null;
  return {
    getDisplays: () => displays,
    getPrimaryDisplay: () => displays.find((d) => d.id === primaryId) ?? null,
    getDisplayMatching: () => displays.find((d) => d.id === matchingId) ?? null,
    getWindowBounds: () => opts.windowBounds ?? { x: 0, y: 0, width: 1200, height: 800 },
    getWindowState: () => ({
      maximized: false,
      fullscreen: false,
      minimized: false,
      ...opts.windowState,
    }),
    isRemoteAvailable: () => opts.remoteAvailable ?? true,
    subscribeWindowEvents: () => () => undefined,
    subscribeDisplayEvents: () => () => undefined,
  };
}

const OBSIDIAN: ObsidianInfo = { vault: "test", theme: "dark", activeFile: null };

function makeSettings(assignments: Settings["displayAssignments"] = {}): Settings {
  return { ...DEFAULT_SETTINGS, displayAssignments: assignments, rules: [] };
}

function makeDetector(api: EnvironmentApi, settings: Settings): EnvironmentDetector {
  return new EnvironmentDetector(api, () => settings, () => OBSIDIAN);
}

/* ------------------------------------------------------------------ */
/* F-003 identity resolution                                           */
/* ------------------------------------------------------------------ */

describe("display identity resolution", () => {
  it("manual mapping wins over the electron internal flag", () => {
    const api = makeFakeApi({
      displays: [makeDisplay({ id: 7, internal: true })],
      primaryId: 7,
    });
    const detector = makeDetector(api, makeSettings({ "7": { identity: "external" } }));
    const [display] = detector.describeDisplays();
    expect(display?.identity).toBe("external");
    expect(display?.detectionMethod).toBe("manual");
  });

  it("uses the electron flag when internal === true and nothing is mapped", () => {
    const api = makeFakeApi({
      displays: [makeDisplay({ id: 7, internal: true })],
      primaryId: 7,
    });
    const [display] = makeDetector(api, makeSettings()).describeDisplays();
    expect(display?.identity).toBe("internal");
    expect(display?.detectionMethod).toBe("electron-flag");
  });

  it("an explicit 'auto' assignment falls through to automatic detection", () => {
    const api = makeFakeApi({
      displays: [makeDisplay({ id: 7, internal: true })],
      primaryId: 7,
    });
    const detector = makeDetector(api, makeSettings({ "7": { identity: "auto" } }));
    const [display] = detector.describeDisplays();
    expect(display?.identity).toBe("internal");
    expect(display?.detectionMethod).toBe("electron-flag");
  });

  it("internal === false is not external evidence: falls to the labeled heuristic", () => {
    const api = makeFakeApi({
      displays: [makeDisplay({ id: 1 }), makeDisplay({ id: 2, internal: false })],
      primaryId: 1,
    });
    const [, display] = makeDetector(api, makeSettings()).describeDisplays();
    expect(display?.identity).toBe("external");
    expect(display?.detectionMethod).toBe("heuristic-primary");
  });

  it("heuristic-primary: primary is internal, other displays are external", () => {
    const api = makeFakeApi({
      displays: [makeDisplay({ id: 1 }), makeDisplay({ id: 2 })],
      primaryId: 1,
    });
    const [primary, secondary] = makeDetector(api, makeSettings()).describeDisplays();
    expect(primary).toMatchObject({ identity: "internal", detectionMethod: "heuristic-primary" });
    expect(secondary).toMatchObject({ identity: "external", detectionMethod: "heuristic-primary" });
  });

  it("refuses to guess when there is no primary display", () => {
    const api = makeFakeApi({ displays: [makeDisplay({ id: 1 })], primaryId: null });
    const [display] = makeDetector(api, makeSettings()).describeDisplays();
    expect(display?.identity).toBe("unknown");
    expect(display?.detectionMethod).toBe("unresolved");
  });
});

/* ------------------------------------------------------------------ */
/* F-004 assignment fallback matching                                  */
/* ------------------------------------------------------------------ */

describe("display assignment fallback matching", () => {
  it("falls back to a unique size + scale factor match when the id changed", () => {
    const api = makeFakeApi({
      displays: [
        makeDisplay({ id: 5, size: { width: 2560, height: 1440 }, scaleFactor: 2 }),
      ],
      primaryId: 5,
    });
    const detector = makeDetector(
      api,
      makeSettings({ "999": { identity: "internal", width: 2560, height: 1440, scaleFactor: 2 } }),
    );
    const [display] = detector.describeDisplays();
    expect(display?.identity).toBe("internal");
    expect(display?.detectionMethod).toBe("manual");
  });

  it("ignores ambiguous size matches (two candidates with the same geometry)", () => {
    const api = makeFakeApi({
      displays: [makeDisplay({ id: 3 })],
      primaryId: 3,
    });
    const detector = makeDetector(
      api,
      makeSettings({
        "11": { identity: "internal", width: 1920, height: 1080, scaleFactor: 1 },
        "22": { identity: "external", width: 1920, height: 1080, scaleFactor: 1 },
      }),
    );
    const [display] = detector.describeDisplays();
    expect(display?.detectionMethod).toBe("heuristic-primary");
    expect(display?.identity).toBe("internal");
  });

  it("an exact id match wins over a size-based candidate", () => {
    const api = makeFakeApi({
      displays: [makeDisplay({ id: 5 })],
      primaryId: 5,
    });
    const detector = makeDetector(
      api,
      makeSettings({
        "5": { identity: "external" },
        "888": { identity: "internal", width: 1920, height: 1080, scaleFactor: 1 },
      }),
    );
    const [display] = detector.describeDisplays();
    expect(display?.identity).toBe("external");
    expect(display?.detectionMethod).toBe("manual");
  });
});

/* ------------------------------------------------------------------ */
/* F-001 / F-002 window state and matching                             */
/* ------------------------------------------------------------------ */

describe("window state and display matching", () => {
  const twoDisplays = [
    makeDisplay({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }),
    makeDisplay({ id: 2, bounds: { x: 1920, y: 0, width: 1920, height: 1080 } }),
  ];

  it("derives state with minimized > fullscreen > maximized precedence", () => {
    const state = (windowState: NonNullable<FakeApiOptions["windowState"]>) =>
      makeDetector(
        makeFakeApi({ displays: twoDisplays, primaryId: 1, windowState }),
        makeSettings(),
      ).getState().window.state;

    expect(state({ minimized: true, maximized: true })).toBe("minimized");
    expect(state({ fullscreen: true, maximized: true })).toBe("fullscreen");
    expect(state({ maximized: true })).toBe("maximized");
    expect(state({})).toBe("normal");
  });

  it("marks a window straddling two displays as spanning", () => {
    const api = makeFakeApi({
      displays: twoDisplays,
      primaryId: 1,
      windowBounds: { x: 960, y: 0, width: 1920, height: 1080 },
      matchingId: 1,
    });
    const state = makeDetector(api, makeSettings()).getState();
    expect(state.window.spanning).toBe(true);
    expect(state.display.id).toBe(1);
  });

  it("reports dom-fallback when the electron remote is unavailable", () => {
    const api = makeFakeApi({ displays: twoDisplays, primaryId: 1, remoteAvailable: false });
    const state = makeDetector(api, makeSettings()).getState();
    expect(state.window.matchMethod).toBe("dom-fallback");
    expect(state.window.matchNote).toBe("DOM fallback (remote unavailable)");
  });

  it("records a note when Electron's matcher disagrees with intersection area", () => {
    const disagree = makeFakeApi({
      displays: twoDisplays,
      primaryId: 1,
      windowBounds: { x: 0, y: 0, width: 1200, height: 800 },
      matchingId: 2,
    });
    const note = makeDetector(disagree, makeSettings()).getState().window.matchNote;
    expect(note).toContain("using intersection area");
    expect(note).toContain("picked display 1");
    expect(note).toContain("picked 2");

    const agree = makeFakeApi({
      displays: twoDisplays,
      primaryId: 1,
      windowBounds: { x: 0, y: 0, width: 1200, height: 800 },
      matchingId: 1,
    });
    expect(makeDetector(agree, makeSettings()).getState().window.matchNote).toBe(
      "Intersection Area (consistent with Electron getDisplayMatching)",
    );
  });
});
