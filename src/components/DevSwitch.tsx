"use client";

import { Wrench } from "lucide-react";
import { setDev, useDev } from "@/lib/dev";
import { IconTile, SwitchTrack } from "./ui";

/**
 * 开发者开关, on the set page: one settings row with an iOS switch. One tap on, one tap off.
 */
export function DevSwitch() {
  const on = useDev();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`开发者：${on ? "开" : "关"}`}
      onClick={() => setDev(!on)}
      title={on ? "开发者模式开着：必填都可以不填" : "打开后，必填都可以不填"}
      className="press flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition duration-200 hover:bg-surface-2/70 focus-visible:bg-brand-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 focus-visible:ring-inset"
    >
      <IconTile tone="neutral">
        <Wrench />
      </IconTile>
      <span className="min-w-0 flex-1 text-lg font-medium text-ink">开发者</span>
      <span aria-hidden="true" className="text-lg text-ink-2">
        {on ? "开" : "关"}
      </span>
      <SwitchTrack on={on} />
    </button>
  );
}
