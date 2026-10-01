export interface DebouncedFunction {
  (): void;
  /** Drop a pending invocation. */
  cancel(): void;
  /** Run a pending invocation immediately (no-op when none pending). */
  flush(): void;
  /** Whether an invocation is currently scheduled. */
  pending(): boolean;
}

/**
 * Trailing-edge debounce. Centralized here so timing lives in one place;
 * callers pass the delay from config.ts.
 */
export function debounce(fn: () => void, ms: number): DebouncedFunction {
  let timer: number | null = null;

  const debounced = (() => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  }) as DebouncedFunction;

  debounced.cancel = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };

  debounced.flush = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
      fn();
    }
  };

  debounced.pending = () => timer !== null;

  return debounced;
}
