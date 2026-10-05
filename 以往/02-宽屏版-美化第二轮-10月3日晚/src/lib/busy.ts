"use client";

import { useSyncExternalStore } from "react";

/**
 * Tracks which long-running jobs are in flight, by id, outside React. A job started on one
 * screen stays visible as "busy" on the next, and it can never be started twice.
 */
export function createBusy() {
  const ids = new Set<string>();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  };
  return {
    has: (id: string) => ids.has(id),
    start(id: string) {
      ids.add(id);
      emit();
    },
    stop(id: string) {
      ids.delete(id);
      emit();
    },
    /** Hook: true while the job with this id is running. */
    use(id: string): boolean {
      return useSyncExternalStore(
        subscribe,
        () => ids.has(id),
        () => false,
      );
    },
  };
}
