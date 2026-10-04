"use client";

import { setDev, useDev } from "@/lib/dev";

/** 开发者开关, in the bottom-left corner of every page. One tap on, one tap off. */
export function DevSwitch() {
  const on = useDev();
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => setDev(!on)}
      title={on ? "开发者模式开着：必填都可以不填" : "打开后，必填都可以不填"}
      className={`fixed bottom-3 left-3 z-50 rounded-full border px-3 py-1.5 text-sm font-medium shadow-sm ${
        on ? "border-amber-500 bg-amber-400 text-black" : "border-line bg-white/90 text-ink-2"
      }`}
    >
      开发者：{on ? "开" : "关"}
    </button>
  );
}
