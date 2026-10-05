"use client";

import { Info, Phone, Siren, TriangleAlert } from "lucide-react";
import type { Hint } from "@/lib/types";
import { cn } from "@/lib/utils";

const STYLES = {
  info: { cls: "border-info/20 bg-info-bg text-ink", icon: "text-info", Icon: Info },
  warn: { cls: "border-warn/30 bg-warn-bg text-ink", icon: "text-warn", Icon: TriangleAlert },
  urgent: { cls: "border-danger bg-danger text-white", icon: "text-white", Icon: Siren },
} as const;

/**
 * What the assistant wants the user to notice. An urgent one is a solid red block in large type:
 * it has to be read before anything else on the screen.
 */
export function HintBanner({ hint, className, children }: { hint: Hint; className?: string; children?: React.ReactNode }) {
  const { cls, icon, Icon } = STYLES[hint.level] ?? STYLES.info;
  const urgent = hint.level === "urgent";
  return (
    <div
      role={urgent ? "alert" : "status"}
      className={cn("flex items-start gap-3 rounded-2xl border px-4 py-3.5", cls, urgent && "px-5 py-4 shadow-float", className)}
    >
      <Icon className={cn("mt-0.5 shrink-0", urgent ? "h-7 w-7" : "h-6 w-6", icon)} />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "leading-relaxed",
            urgent ? "text-xl font-semibold" : hint.level === "warn" ? "text-[1.2rem] font-medium" : "text-base",
          )}
        >
          {hint.text}
        </p>
        {urgent && /120/.test(hint.text) && (
          <a
            href="tel:120"
            className="mt-3 mr-2 inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-5 text-lg font-semibold text-danger transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60"
          >
            <Phone className="h-5 w-5" />
            拨打 120
          </a>
        )}
        {children}
      </div>
    </div>
  );
}
