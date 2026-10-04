import Image from "next/image";
import { useId } from "react";
import { L } from "@/lib/lang";
import { cn } from "@/lib/utils";

/**
 * The brand, as the user supplied it: one PNG, used exactly as it is — never redrawn, recoloured or
 * re-encoded. Its ground is white, so it is multiplied onto the page: the white takes on the paper
 * behind it (the jade-white canvas, or the faint celadon wash at the top of a page) while the teal,
 * turquoise and orange of the mark stay untouched.
 *
 * It is sized by width (`.brand-logo`: ~300px, ~256px on a tablet, ~240px on a phone) with
 * `height: auto`, so the 2172×724 lockup always keeps its 3:1 proportions and is never stretched.
 * `max-width: 100%` on the image and a shrinkable parent anchor mean a fixed size can never widen
 * the header: where the column is narrower than the artwork, the artwork follows the column.
 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/visit-smoothie-logo.png"
      alt="VisitSmoothie"
      width={2172}
      height={724}
      /* the mark renders ~240–300px wide; saying so keeps the browser from fetching a
         full-width rendition of the artwork */
      sizes="(max-width: 430px) 240px, (max-width: 760px) 256px, 300px"
      preload
      className={cn("brand-logo", className)}
    />
  );
}

export function LogoMark({ className }: { className?: string }) {
  const id = useId();
  // There is no tailwind-merge: a size given by the caller only counts if the default is left out.
  const sized = className != null && /(^|\s)h-/.test(className);
  return (
    <svg viewBox="0 0 40 40" className={cn("shrink-0", !sized && "h-9 w-9", className)} aria-hidden="true">
      <defs>
        {/* celadon glaze: pale jade at the top-left corner, the deep green of the ink at the far one */}
        <linearGradient id={id} x1="0" y1="0" x2="40" y2="40">
          <stop stopColor="#5FA88E" />
          <stop offset="1" stopColor="#123B31" />
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
