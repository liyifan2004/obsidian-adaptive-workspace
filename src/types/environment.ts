export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type WindowState = "normal" | "maximized" | "fullscreen" | "minimized";

/** Resolved identity of a display. `unknown` means we refuse to guess. */
export type DisplayIdentity = "internal" | "external" | "unknown";

/** How the identity above was determined — always surfaced in Diagnostics. */
export type DisplayDetectionMethod =
  | "manual"
  | "electron-flag"
  | "heuristic-primary"
  | "unresolved";

export interface DisplayInfo {
  id: number;
  label: string;
  /** Resolved identity after manual mapping / detection. */
  identity: DisplayIdentity;
  /** Which strategy produced `identity`. */
  detectionMethod: DisplayDetectionMethod;
  /** Raw Electron `Display.internal` when available. */
  electronInternal: boolean | null;
  bounds: Rect;
  workArea: Rect;
  size: { width: number; height: number };
  scaleFactor: number;
  isPrimary: boolean;
}

export type MatchMethod = "intersection-area" | "electron-getDisplayMatching" | "dom-fallback";

export interface WindowInfo {
  bounds: Rect;
  width: number;
  height: number;
  state: WindowState;
  maximized: boolean;
  fullscreen: boolean;
  /** Window overlaps more than one display significantly. */
  spanning: boolean;
  /** How the dominant display was chosen. */
  matchMethod: MatchMethod;
  /** Human-readable note for Diagnostics ("Matched by" line). */
  matchNote: string;
}

export interface ObsidianInfo {
  vault: string;
  theme: "light" | "dark";
  activeFile: string | null;
}

export interface EnvironmentState {
  display: DisplayInfo;
  window: WindowInfo;
  obsidian: ObsidianInfo;
  /** Stable signature of the state; used to skip redundant work. */
  signature: string;
}

export type CapabilityTier = "full" | "degraded" | "limited";

export interface ApiProbe {
  remote: boolean;
  screen: boolean;
  browserWindow: boolean;
  plugins: boolean;
  commands: boolean;
  via: string;
  notes: string[];
}
