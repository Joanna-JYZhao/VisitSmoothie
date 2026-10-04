"use client";

import { setDev, useDev } from "@/lib/dev";

/**
 * 开发者开关 on every page. One tap on, one tap off. On a desktop it floats in the bottom-left corner;
 * on a phone it sits at the top of the page, so it never covers the chat's own buttons at the bottom.
 */
export function DevSwitch() {
  const on = useDev();
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => setDev(!on)}
      title={on ? "开发者模式开着：必填都可以不填" : "打开后，必填都可以不填"}
      className={`glass press relative md:fixed md:bottom-3 md:left-3 md:z-50 inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-base font-medium shadow-pill transition duration-200 ${
        on ? "border-amber-400 bg-amber-300/90 text-black" : "border-line text-ink-2 hover:text-ink"
      }`}
    >
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${on ? "bg-amber-700" : "bg-line-strong"}`} />
      开发者：{on ? "开" : "关"}
    </button>
  );
}
