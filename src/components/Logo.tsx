import Image from "next/image";
import { L } from "@/lib/lang";
import { cn } from "@/lib/utils";

/**
 * The brand, as the user supplied it: one PNG, used exactly as it is — never redrawn, recoloured or
 * re-encoded. Its ground is white, so it is multiplied onto the page: the white takes on the paper
 * behind it while the teal, turquoise and orange of the mark stay untouched.
 *
 * It is sized by width (`.brand-logo`: ~221px on desktop, ~187px on a phone) with
 * `height: auto`, so the 2172×724 lockup always keeps its 3:1 proportions and is never stretched.
 * `max-width: 100%` on the image and a shrinkable parent anchor mean a fixed size can never widen a
 * header: where the column is narrower than the artwork, the artwork follows the column.
 */
export function BrandLogo({ className, preload = true }: { className?: string; preload?: boolean }) {
  return (
    <Image
      src="/visit-smoothie-logo.png"
      alt="VisitSmoothie"
      width={2172}
      height={724}
      /* Match the compact header and rail sizes. */
      sizes="(max-width: 767px) 187px, 221px"
      preload={preload}
      className={cn("brand-logo", className)}
    />
  );
}

export function LogoMark({ className }: { className?: string }) {
  // There is no tailwind-merge: a size given by the caller only counts if the default is left out.
  const sized = className != null && /(^|\s)h-/.test(className);
  return (
    <svg viewBox="0 0 40 40" className={cn("shrink-0", !sized && "h-9 w-9", className)} aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="var(--color-brand-600)" />
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
