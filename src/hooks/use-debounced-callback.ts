"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

export type DebouncedCallback<Args extends unknown[]> = {
  /** Schedule `callback(...args)` after `delayMs` of inactivity (replaces any pending call). */
  run: (...args: Args) => void;
  /** Run the pending call now (no-op when nothing is pending). */
  flush: () => void;
  /** Drop the pending call. */
  cancel: () => void;
};

/**
 * Debounces `callback` by `delayMs`. The latest `callback` is always used and any pending call is cancelled on
 * unmount. Returns a stable `{ run, flush, cancel }` object.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delayMs: number,
): DebouncedCallback<Args> {
  const callbackRef = useRef(callback);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingArgsRef = useRef<Args | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingArgsRef.current = null;
  }, []);

  const flush = useCallback(() => {
    const args = pendingArgsRef.current;
    if (timerRef.current !== null && args !== null) {
      cancel();
      callbackRef.current(...args);
    }
  }, [cancel]);

  const run = useCallback(
    (...args: Args) => {
      pendingArgsRef.current = args;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const pending = pendingArgsRef.current;
        pendingArgsRef.current = null;
        if (pending) callbackRef.current(...pending);
      }, delayMs);
    },
    [delayMs],
  );

  useEffect(() => cancel, [cancel]);

  return useMemo(() => ({ run, flush, cancel }), [run, flush, cancel]);
}
