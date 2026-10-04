"use client";

import { Wrench } from "lucide-react";
import { setDev, useDev } from "@/lib/dev";
import { IconTile, SwitchTrack } from "./ui";
import { L } from "@/lib/lang";

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
      aria-label={L(`开发者：${on ? "开" : "关"}`, `Developer: ${on ? "on" : "off"}`)}
      onClick={() => setDev(!on)}
      title={on ? L("开发者模式开着：必填都可以不填", "Developer mode is on: required fields can be left empty") : L("打开后，必填都可以不填", "When on, required fields can be left empty")}
      className="press flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition duration-200 hover:bg-surface-2/70 focus-visible:bg-brand-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 focus-visible:ring-inset"
    >
      <IconTile tone="neutral">
        <Wrench />
      </IconTile>
      <span className="min-w-0 flex-1 text-lg font-medium text-ink">{L("开发者", "Developer")}</span>
      <span aria-hidden="true" className="text-lg text-ink-2">
        {on ? L("开", "On") : L("关", "Off")}
      </span>
      <SwitchTrack on={on} />
    </button>
  );
}
