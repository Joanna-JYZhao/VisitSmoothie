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
      alt={L("问诊奶昔", "VisitSmoothie")}
      width={2172}
      height={724}
      /* Match the compact header and rail sizes. */
      sizes="(max-width: 767px) 187px, 221px"
      preload={preload}
      className={cn("brand-logo", className)}
    />
  );
}

/**
 * The app's own mark as a small icon (splash, demo loading, the assistant's avatar): the same app
 * icon as the home button in the tab bar, so the app has one face everywhere.
 */
export function LogoMark({ className }: { className?: string }) {
  // There is no tailwind-merge: a size given by the caller only counts if the default is left out.
  const sized = className != null && /(^|\s)h-/.test(className);
  return <SmoothieMark className={cn(!sized && "h-9 w-9", className)} />;
}

/** `textClassName` goes on the name beside the mark, so a crowded header can drop the name and keep the mark. */
export function Logo({ compact = false, className, textClassName }: { compact?: boolean; className?: string; textClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={compact ? "h-9 w-9" : "h-11 w-11"} />
      <span className={cn("leading-tight", textClassName)}>
        <span className={cn("block font-semibold tracking-tight text-ink", compact ? "text-xl" : "text-2xl")}>{L("问诊奶昔", "VisitSmoothie")}</span>
        {!compact && <span className="block text-base text-ink-2">{L("你的私人医生助理", "Your personal doctor's assistant")}</span>}
      </span>
    </span>
  );
}

/**
 * The app icon, in the manner of the supplied mark: a white squircle, the cup in teal fading to
 * orange, the leaf and the swirl rising out of it, the pale liquid inside, the two dots above.
 * Drawn here so it stays crisp at any size; the PNG lockup itself is never cropped. Used for the
 * home button in the tab bar and everywhere the app shows its own small mark.
 */
export function SmoothieMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("app-icon shrink-0", className)} aria-hidden="true">
      <defs>
        <linearGradient id="vs-icon-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#eaf6f1" />
        </linearGradient>
        <linearGradient id="vs-icon-cup" x1="0.1" y1="0.2" x2="0.95" y2="0.9">
          <stop offset="0" stopColor="#3fcfae" />
          <stop offset="0.55" stopColor="#17917f" />
          <stop offset="1" stopColor="#f39a4a" />
        </linearGradient>
        <linearGradient id="vs-icon-swirl" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#f39a4a" />
          <stop offset="1" stopColor="#fbd6a2" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#vs-icon-bg)" />
      <rect x="0.5" y="0.5" width="63" height="63" rx="14.5" fill="none" stroke="rgba(13,59,64,0.10)" />
      {/* the liquid inside the cup */}
      <path d="M22.5 36.5c4.5-3 9.5 2.5 18.5-1.5-.6 7.4-4.4 12-9.2 12-5.2 0-8.6-4.4-9.3-10.5z" fill="#bfe8dc" />
      {/* the cup */}
      <path d="M19.5 25.5c.6 13.5 5.5 22.5 12.4 22.5 6.9 0 11.8-9 12.6-22.5" fill="none" stroke="url(#vs-icon-cup)" strokeWidth="5.2" strokeLinecap="round" />
      {/* the leaf over the left rim */}
      <path d="M13.5 21.5c4.2-2.6 11.4-2.6 15.2 4.6" fill="none" stroke="#2fbfa0" strokeWidth="4.6" strokeLinecap="round" />
      {/* the swirl rising out of it */}
      <path d="M28.5 40c2.6-9 7.6-15.8 18.8-18" fill="none" stroke="url(#vs-icon-swirl)" strokeWidth="4.6" strokeLinecap="round" />
      {/* the two dots */}
      <circle cx="27.5" cy="13.5" r="3.3" fill="#2fbfa0" />
      <circle cx="37" cy="10.5" r="3.9" fill="#f39a4a" />
    </svg>
  );
}
