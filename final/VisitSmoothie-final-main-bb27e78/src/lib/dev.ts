"use client";

import { useSyncExternalStore } from "react";

/*
 * 开发者开关: on, nothing is required any more (the seven sign-up items, the password), so a demo
 * or a test can click straight through. Kept in this browser only; off by default.
 */

const KEY = "yiban.dev";
const listeners = new Set<() => void>();

export function isDev(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setDev(on: boolean) {
  try {
    if (on) window.localStorage.setItem(KEY, "1");
    else window.localStorage.removeItem(KEY);
  } catch {
    /* no storage: the switch just does not stick */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => e.key === KEY && l();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

export function useDev(): boolean {
  return useSyncExternalStore(subscribe, isDev, () => false);
}

/** A name for an account registered with the name left empty. */
export function placeholderName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `测试用户${p(now.getMonth() + 1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}
