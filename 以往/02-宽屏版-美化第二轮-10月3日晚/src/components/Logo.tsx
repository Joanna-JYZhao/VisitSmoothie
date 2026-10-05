import { useId } from "react";
import { L } from "@/lib/lang";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  const id = useId();
  // There is no tailwind-merge: a size given by the caller only counts if the default is left out.
  const sized = className != null && /(^|\s)h-/.test(className);
  return (
    <svg viewBox="0 0 40 40" className={cn("shrink-0", !sized && "h-9 w-9", className)} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="40" y2="40">
          <stop stopColor="#4BA2BF" />
          <stop offset="1" stopColor="#105C76" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#${id})`} />
      <rect x="0.5" y="0.5" width="39" height="39" rx="10.5" fill="none" stroke="rgba(255,255,255,0.28)" />
      <path
        d="M8 21h6l3-7 5 13 3-8 2 2h5"
        fill="none"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** `textClassName` goes on the name beside the mark, so a crowded header can drop the name and keep the mark. */
export function Logo({ compact = false, className, textClassName }: { compact?: boolean; className?: string; textClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={compact ? "h-9 w-9" : "h-11 w-11"} />
      <span className={cn("leading-tight", textClassName)}>
        <span className={cn("block font-semibold tracking-tight text-ink", compact ? "text-xl" : "text-2xl")}>{L("医伴", "Yiban")}</span>
        {!compact && <span className="block text-base text-ink-2">{L("你的私人医生助理", "Your personal doctor's assistant")}</span>}
      </span>
    </span>
  );
}
