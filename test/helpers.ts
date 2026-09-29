import type { EnvironmentState, Rect } from "../src/types/environment";

export function makeState(overrides?: Partial<EnvironmentState["window"]>): EnvironmentState {
  const bounds: Rect = overrides?.bounds ?? { x: 0, y: 0, width: 1200, height: 800 };
  return {
    display: {
      id: 1,
      label: "Built-in",
      identity: "internal",
      detectionMethod: "manual",
      electronInternal: true,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      size: { width: 1920, height: 1080 },
      scaleFactor: 1,
      isPrimary: true,
    },
    window: {
      bounds,
      width: bounds.width,
      height: bounds.height,
      state: "normal",
      maximized: false,
      fullscreen: false,
      spanning: false,
      matchMethod: "intersection-area",
      matchNote: "Intersection Area",
      ...overrides,
    },
    obsidian: { vault: "test", theme: "dark", activeFile: null },
    signature: "",
  };
}
