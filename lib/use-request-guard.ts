"use client";

import { useCallback, useRef } from "react";

/** Ignore late responses after a newer request, month change, logout, or unmount. */
export function useRequestGuard() {
  const sequence = useRef(0);
  const begin = useCallback(() => {
    const id = ++sequence.current;
    return () => sequence.current === id;
  }, []);
  const cancel = useCallback(() => { sequence.current += 1; }, []);
  return [begin, cancel] as const;
}
