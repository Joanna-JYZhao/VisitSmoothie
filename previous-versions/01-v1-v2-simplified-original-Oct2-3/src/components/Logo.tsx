import { useId } from "react";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  const id = useId();
  // There is no tailwind-merge: a size given by the caller only counts if the default is left out.
  const sized = className != null && /(^|\s)h-/.test(className);
  return (
    <svg viewBox="0 0 40 40" className={cn("shrink-0", !sized && "h-9 w-9", className)} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="40" y2="40">
          <stop stopColor="#3FA5CD" />
          <stop offset="1" stopColor="#00617F" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#${id})`} />
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

export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={compact ? "h-9 w-9" : "h-11 w-11"} />
      <span className="leading-tight">
        <span className={cn("block font-semibold tracking-tight text-ink", compact ? "text-xl" : "text-2xl")}>医伴</span>
        {!compact && <span className="block text-base text-ink-2">你的私人医生助理</span>}
      </span>
    </span>
  );
}
