"use client";

import { Info, Phone, Siren, TriangleAlert } from "lucide-react";
import type { Hint } from "@/lib/types";
import { L } from "@/lib/lang";
import { cn } from "@/lib/utils";

/*
 * A tinted sheet with an icon tile in front, the way Health flags something worth a look.
 * The urgent one is a solid red block in large type with a glossy edge: read before anything else.
 */
const STYLES = {
  info: { cls: "border border-info/15 bg-info-bg text-ink shadow-card", tile: "bg-info/10 text-info", Icon: Info },
  warn: { cls: "border border-warn/20 bg-warn-bg text-ink shadow-card", tile: "bg-warn/12 text-warn", Icon: TriangleAlert },
  urgent: {
    cls: "border border-danger/40 bg-[linear-gradient(180deg,#d4454c_0%,#b52f36_100%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_24px_48px_-20px_rgba(200,55,62,0.6)]",
    tile: "bg-white/18 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]",
    Icon: Siren,
  },
} as const;

/**
 * What the assistant wants the user to notice. An urgent one is a solid red block in large type:
 * it has to be read before anything else on the screen.
 */
export function HintBanner({ hint, className, children }: { hint: Hint; className?: string; children?: React.ReactNode }) {
  const { cls, tile, Icon } = STYLES[hint.level] ?? STYLES.info;
  const urgent = hint.level === "urgent";
  return (
    <div
      role={urgent ? "alert" : "status"}
      className={cn("flex items-start gap-3.5 rounded-card px-5 py-4", cls, urgent && "animate-pop px-6 py-5", className)}
    >
      <span
        aria-hidden="true"
        className={cn("flex shrink-0 items-center justify-center", urgent ? "h-12 w-12 rounded-[15px] animate-breathe" : "h-10 w-10 rounded-[12px]", tile)}
      >
        <Icon className={urgent ? "h-6 w-6" : "h-5 w-5"} />
      </span>
      <div className="min-w-0 flex-1 self-center">
        <p className={cn(urgent ? "t-heading" : hint.level === "warn" ? "t-lead font-medium" : "t-body")}>{hint.text}</p>
        {urgent && /120/.test(hint.text) && (
          <a
            href="tel:120"
            className="press mt-4 mr-2 inline-flex min-h-13 items-center gap-2.5 rounded-full bg-white px-7 text-lg font-semibold text-danger shadow-[0_1px_2px_rgba(0,0,0,0.12),0_8px_20px_-8px_rgba(0,0,0,0.35)] transition hover:bg-white/95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60"
          >
            <Phone className="h-5 w-5" />
            {L("拨打 120", "Call 120")}
          </a>
        )}
        {children}
      </div>
    </div>
  );
}
