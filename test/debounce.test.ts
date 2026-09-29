import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debounce } from "../src/utils/debounce";

describe("debounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs once after the delay", () => {
    let calls = 0;
    const d = debounce(() => {
      calls += 1;
    }, 300);
    d();
    d();
    d();
    expect(calls).toBe(0);
    vi.advanceTimersByTime(299);
    expect(calls).toBe(0);
    vi.advanceTimersByTime(1);
    expect(calls).toBe(1);
  });

  it("cancel drops the pending call", () => {
    let calls = 0;
    const d = debounce(() => {
      calls += 1;
    }, 300);
    d();
    d.cancel();
    vi.advanceTimersByTime(1000);
    expect(calls).toBe(0);
  });

  it("flush runs immediately", () => {
    let calls = 0;
    const d = debounce(() => {
      calls += 1;
    }, 300);
    d();
    expect(d.pending()).toBe(true);
    d.flush();
    expect(calls).toBe(1);
    expect(d.pending()).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(calls).toBe(1);
  });
});
