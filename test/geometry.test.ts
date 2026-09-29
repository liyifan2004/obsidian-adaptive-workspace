import { describe, expect, it } from "vitest";
import { intersectionArea, matchDisplay } from "../src/core/geometry";
import type { Rect } from "../src/types/environment";

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

describe("intersectionArea", () => {
  it("computes overlap", () => {
    expect(intersectionArea(rect(0, 0, 100, 100), rect(50, 50, 100, 100))).toBe(2500);
  });
  it("is 0 for disjoint rects", () => {
    expect(intersectionArea(rect(0, 0, 10, 10), rect(20, 20, 10, 10))).toBe(0);
  });
});

describe("matchDisplay", () => {
  const left = rect(0, 0, 1920, 1080);
  const right = rect(1920, 0, 2560, 1440);

  it("picks the display with the largest intersection area", () => {
    const win = rect(1800, 100, 800, 600); // 120px on left, 680px on right
    const m = matchDisplay(win, [left, right]);
    expect(m.index).toBe(1);
  });

  it("marks spanning when the second display overlap is significant", () => {
    const win = rect(1500, 100, 900, 600); // 420 left / 480 right of 900 wide
    const m = matchDisplay(win, [left, right]);
    expect(m.index).toBe(1);
    expect(m.spanning).toBe(true);
  });

  it("does not mark spanning for a window fully on one display", () => {
    const win = rect(100, 100, 800, 600);
    const m = matchDisplay(win, [left, right]);
    expect(m.index).toBe(0);
    expect(m.spanning).toBe(false);
  });

  it("handles a single display", () => {
    const m = matchDisplay(rect(-100, 0, 800, 600), [left]);
    expect(m.index).toBe(0);
    expect(m.spanning).toBe(false);
  });

  it("handles no displays", () => {
    const m = matchDisplay(rect(0, 0, 10, 10), []);
    expect(m.index).toBe(-1);
  });

  it("handles a minimized (zero-area) window deterministically", () => {
    const m = matchDisplay(rect(5, 5, 0, 0), [left, right]);
    expect(m.index).toBe(0);
    expect(m.spanning).toBe(false);
  });
});
