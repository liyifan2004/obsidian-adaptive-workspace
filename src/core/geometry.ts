import { SPANNING_RATIO_THRESHOLD } from "../config";
import type { Rect } from "../types/environment";

/** Pure geometry helpers — unit tested. */

export function intersectionArea(a: Rect, b: Rect): number {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return xOverlap * yOverlap;
}

export interface DisplayMatch {
  /** Index into the input displays array. */
  index: number;
  /** Intersection area of the window with the matched display. */
  area: number;
  /** True when the window significantly overlaps more than one display. */
  spanning: boolean;
}

/**
 * Pick the display a window is "mostly on": the one with the largest
 * intersection area. Falls back to index 0 for an empty/zero-area window.
 */
export function matchDisplay(windowBounds: Rect, displays: readonly Rect[]): DisplayMatch {
  if (displays.length === 0) {
    return { index: -1, area: 0, spanning: false };
  }
  const areas = displays.map((d) => intersectionArea(windowBounds, d));
  let bestIndex = 0;
  let bestArea = areas[0] ?? 0;
  for (let i = 1; i < areas.length; i += 1) {
    const area = areas[i] ?? 0;
    if (area > bestArea) {
      bestArea = area;
      bestIndex = i;
    }
  }
  if (bestArea <= 0) {
    // Window entirely off-screen (e.g. while minimized): keep a deterministic pick.
    return { index: 0, area: 0, spanning: false };
  }
  const windowArea = Math.max(1, windowBounds.width * windowBounds.height);
  const sorted = [...areas].sort((x, y) => y - x);
  const second = sorted[1] ?? 0;
  const spanning = second > 0 && second / windowArea > SPANNING_RATIO_THRESHOLD;
  return { index: bestIndex, area: bestArea, spanning };
}
