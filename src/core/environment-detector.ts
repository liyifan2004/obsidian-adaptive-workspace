import type { Settings } from "../types/settings";
import type {
  DisplayDetectionMethod,
  DisplayIdentity,
  DisplayInfo,
  EnvironmentState,
  ObsidianInfo,
  WindowState,
} from "../types/environment";
import { matchDisplay } from "./geometry";
import type { InternalApi, ElectronDisplayLike } from "./internal-api";

export interface DetectorEventHandlers {
  /** High-frequency geometry change (resize/move) — caller debounces. */
  onGeometryChange: () => void;
  /** Discrete change (window state / displays) — caller may evaluate sooner. */
  onDiscreteChange: () => void;
}

/**
 * Builds an EnvironmentState snapshot on demand. Pure geometry lives in
 * geometry.ts; identity resolution policy is documented in docs/adr/0002:
 * manual mapping → electron `internal` flag → labeled heuristic → unknown.
 */
export class EnvironmentDetector {
  /** Note from the last cross-check between our matcher and Electron's. */
  private matchNote = "";

  constructor(
    private readonly api: InternalApi,
    private readonly getSettings: () => Settings,
    private readonly getObsidianInfo: () => ObsidianInfo,
  ) {}

  getState(): EnvironmentState {
    const displays = this.api.getDisplays();
    const primary = this.api.getPrimaryDisplay();
    const bounds = this.api.getWindowBounds();
    const winState = this.api.getWindowState();
    const settings = this.getSettings();

    const match = matchDisplay(bounds, displays.map((d) => d.bounds));
    const dominant: ElectronDisplayLike | null =
      match.index >= 0 ? displays[match.index] ?? null : null;

    // Cross-check with Electron's own matcher (Diagnostics value).
    const matchMethod: EnvironmentState["window"]["matchMethod"] = this.api.isRemoteAvailable()
      ? "intersection-area"
      : "dom-fallback";
    if (this.api.isRemoteAvailable()) {
      const electronMatch = this.api.getDisplayMatching(bounds);
      if (electronMatch && dominant && electronMatch.id !== dominant.id) {
        this.matchNote = `Intersection area picked display ${dominant.id}, Electron getDisplayMatching picked ${electronMatch.id} (using intersection area)`;
      } else {
        this.matchNote = "Intersection Area (consistent with Electron getDisplayMatching)";
      }
    } else {
      this.matchNote = "DOM fallback (remote unavailable)";
    }

    const displayInfo = this.resolveDisplay(dominant, primary, settings);

    const state: WindowState = winState.minimized
      ? "minimized"
      : winState.fullscreen
        ? "fullscreen"
        : winState.maximized
          ? "maximized"
          : "normal";

    const environmentState: EnvironmentState = {
      display: displayInfo,
      window: {
        bounds,
        width: bounds.width,
        height: bounds.height,
        state,
        maximized: winState.maximized,
        fullscreen: winState.fullscreen,
        spanning: match.spanning,
        matchMethod,
        matchNote: this.matchNote,
      },
      obsidian: this.getObsidianInfo(),
      signature: "",
    };
    environmentState.signature = computeSignature(environmentState);
    return environmentState;
  }

  subscribe(handlers: DetectorEventHandlers): () => void {
    const offWindow = this.api.subscribeWindowEvents({
      onGeometry: handlers.onGeometryChange,
      onStateChange: handlers.onDiscreteChange,
    });
    const offDisplay = this.api.subscribeDisplayEvents({
      onDisplayChange: handlers.onDiscreteChange,
    });
    return () => {
      offWindow();
      offDisplay();
    };
  }

  /** Identity-resolved description of every display (settings / diagnostics). */
  describeDisplays(): DisplayInfo[] {
    const displays = this.api.getDisplays();
    const primary = this.api.getPrimaryDisplay();
    const settings = this.getSettings();
    return displays.map((d) => this.resolveDisplay(d, primary, settings));
  }

  /* ---------------- display identity resolution ---------------- */

  private resolveDisplay(
    display: ElectronDisplayLike | null,
    primary: ElectronDisplayLike | null,
    settings: Settings,
  ): DisplayInfo {
    if (!display) {
      return {
        id: -1,
        label: "No display",
        identity: "unknown",
        detectionMethod: "unresolved",
        electronInternal: null,
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        workArea: { x: 0, y: 0, width: 0, height: 0 },
        size: { width: 0, height: 0 },
        scaleFactor: 1,
        isPrimary: false,
      };
    }

    const assignment = findAssignment(settings, display);
    const base: DisplayInfo = {
      id: display.id,
      label: display.label ?? `Display ${display.id}`,
      identity: "unknown",
      detectionMethod: "unresolved",
      electronInternal: typeof display.internal === "boolean" ? display.internal : null,
      bounds: display.bounds,
      workArea: display.workArea ?? display.bounds,
      size: display.size,
      scaleFactor: display.scaleFactor,
      isPrimary: primary ? display.id === primary.id : false,
    };

    // 1. Manual mapping always wins.
    if (assignment && assignment.identity !== "auto") {
      base.identity = assignment.identity === "internal" ? "internal" : "external";
      base.detectionMethod = "manual";
      return base;
    }

    // 2. Electron flag: `internal === true` is the only trustworthy value.
    if (display.internal === true) {
      base.identity = "internal";
      base.detectionMethod = "electron-flag";
      return base;
    }

    // 3. Labeled heuristic: primary is assumed to be the laptop screen.
    if (primary && display.id === primary.id) {
      base.identity = "internal";
      base.detectionMethod = "heuristic-primary";
      return base;
    }
    if (primary) {
      base.identity = "external";
      base.detectionMethod = "heuristic-primary";
      return base;
    }

    // 4. Refuse to guess.
    base.identity = "unknown";
    base.detectionMethod = "unresolved";
    return base;
  }
}

/**
 * Find a user assignment for a display: exact id key first, then a unique
 * width/height/scaleFactor match (display ids can change across sessions).
 */
function findAssignment(settings: Settings, display: ElectronDisplayLike) {
  const exact = settings.displayAssignments[String(display.id)];
  if (exact) return exact;
  const candidates = Object.values(settings.displayAssignments).filter(
    (a) =>
      a.width === display.size.width &&
      a.height === display.size.height &&
      a.scaleFactor === display.scaleFactor,
  );
  return candidates.length === 1 ? candidates[0] : undefined;
}

function computeSignature(s: EnvironmentState): string {
  return JSON.stringify({
    d: s.display.id,
    i: s.display.identity,
    m: s.display.detectionMethod,
    x: s.window.bounds.x,
    y: s.window.bounds.y,
    w: s.window.bounds.width,
    h: s.window.bounds.height,
    st: s.window.state,
    sp: s.window.spanning,
    sf: s.display.scaleFactor,
    rw: s.display.size.width,
    rh: s.display.size.height,
    f: s.obsidian.activeFile,
  });
}

export type { DisplayDetectionMethod, DisplayIdentity };
