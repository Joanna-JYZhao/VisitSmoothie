"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Loader2, X } from "lucide-react";
import { L } from "@/lib/lang";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/utils";

/*
 * Sizes follow one rule: body text is 17px or more, anything that must not be missed is 20px or
 * more, and shared controls are at least 44px tall. (1rem is 17px, see globals.css.)
 */

/** The one focus style: a soft halo in the brand colour. For anything tappable that is not built from the parts below. */
export const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";

/* ---------- buttons ---------- */

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-xl text-center font-semibold leading-tight tracking-[-0.005em] select-none transition-all duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 active:opacity-75 disabled:pointer-events-none disabled:opacity-45";
const btnVariants = {
  /** Flat blue primary action; white text clears AA contrast. */
  primary: "bg-brand-600 text-white hover:bg-brand-700",
  secondary: "bg-surface-2 text-brand-700 hover:bg-brand-100",
  /** frosted: sits on photos, gradients and other busy ground */
  glass: "glass border border-white/60 text-ink shadow-pill hover:bg-white/90",
  soft: "bg-brand-50 text-brand-800 hover:bg-brand-100",
  /** clearly a button, clearly not the main one: brand outline on white */
  outline: "border border-brand-600 bg-surface text-brand-700 hover:bg-brand-50",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  danger: "bg-danger text-white shadow-edge hover:bg-[#952e35]",
  dangerSoft: "bg-danger-bg text-danger hover:bg-[#f7e1e2]",
  dangerGhost: "text-danger hover:bg-danger-bg",
} as const;
const btnSizes = {
  sm: "min-h-12 px-4 text-base",
  md: "min-h-12 px-5 text-base",
  lg: "min-h-13 px-5 text-base",
  /** an answer to tap: as tall as `lg`, but with little side padding so three fit on a phone */
  tile: "min-h-12 rounded-xl px-1.5 text-base",
} as const;

export type ButtonVariant = keyof typeof btnVariants;
export type ButtonSize = keyof typeof btnSizes;

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}) {
  return (
    <button
      type={type}
      className={cn(btnBase, btnVariants[variant], btnSizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-5 w-5 animate-spin" />}
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={cn(btnBase, btnVariants[variant], btnSizes[size], className)}>
      {children}
    </Link>
  );
}

const linkBase =
  "inline-flex min-h-12 items-center gap-0.5 rounded-xl px-2 text-base font-medium underline-offset-4 transition hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";
const linkTones = { brand: "text-brand-700", danger: "text-danger", plain: "text-ink", muted: "text-ink-2" } as const;
type LinkTone = keyof typeof linkTones;

/** A quiet action that reads as a link but is still a full-size tap target. */
export function TextLink({
  href,
  tone = "brand",
  className,
  children,
}: {
  href: string;
  tone?: LinkTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={cn(linkBase, linkTones[tone], className)}>
      {children}
    </Link>
  );
}

export function TextButton({
  tone = "brand",
  className,
  children,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: LinkTone }) {
  return (
    <button type={type} className={cn(linkBase, linkTones[tone], className)} {...props}>
      {children}
    </button>
  );
}

/* ---------- surfaces ---------- */

/*
 * There is no tailwind-merge here, so a background or border passed in className does not replace
 * the card's own. A card that is not plain white says so with `tone`.
 */
const cardTones = {
  plain: "material border border-line/80 bg-surface",
  /** White grouped surface, shared with the other cards. */
  raised: "bg-surface border border-line/60",
  /** frosted glass over whatever is behind it */
  glass: "glass border border-white/70 shadow-card",
  /** tinted: the thing that matters today (an appointment, something to confirm) */
  brand: "border border-brand-200/70 bg-brand-50 shadow-card",
  /** a red edge: to be dealt with before anything else on the screen */
  alert: "border-[1.5px] border-danger bg-surface shadow-card",
} as const;
export type CardTone = keyof typeof cardTones;

export function Card({
  tone = "plain",
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tone?: CardTone }) {
  return (
    <div className={cn("rounded-card", cardTones[tone], className)} {...props}>
      {children}
    </div>
  );
}

const toneStyles: Record<Tone | "brand" | "info", string> = {
  neutral: "bg-surface-2 text-ink-2",
  good: "bg-good-bg text-good",
  warn: "bg-warn-bg text-warn",
  serious: "bg-serious-bg text-serious",
  danger: "bg-danger-bg text-danger",
  brand: "bg-brand-50 text-brand-800",
  info: "bg-info-bg text-info",
};
export type BadgeTone = keyof typeof toneStyles;

export function Badge({ tone = "neutral", className, children }: { tone?: BadgeTone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-base font-medium leading-7 tracking-[-0.005em]", toneStyles[tone], className)}>
      {children}
    </span>
  );
}

const tileTones = {
  brand: "bg-brand-50 text-brand-700",
  info: "bg-info-bg text-info",
  good: "bg-good-bg text-good",
  warn: "bg-warn-bg text-warn",
  danger: "bg-danger-bg text-danger",
  serious: "bg-serious-bg text-serious",
  neutral: "bg-surface-2 text-ink-2",
  /** White icon on a solid action colour. */
  solid: "tile-brand text-white",
  solidInk: "tile-ink text-white",
  solidDanger: "tile-danger text-white",
} as const;
export type IconTone = keyof typeof tileTones;
const tileSizes = {
  sm: "h-9 w-9 rounded-[11px] [&>svg]:h-5 [&>svg]:w-5",
  md: "h-10 w-10 rounded-[12px] [&>svg]:h-5 [&>svg]:w-5",
  lg: "h-12 w-12 rounded-[15px] [&>svg]:h-6 [&>svg]:w-6",
  xl: "h-16 w-16 rounded-[20px] [&>svg]:h-8 [&>svg]:w-8",
} as const;

/** A small icon on a tinted square: what tells one row or entry from the next at a glance. */
export function IconTile({
  tone = "brand",
  size = "md",
  className,
  children,
}: {
  tone?: IconTone;
  size?: keyof typeof tileSizes;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span aria-hidden="true" className={cn("flex shrink-0 items-center justify-center", tileSizes[size], tileTones[tone], className)}>
      {children}
    </span>
  );
}

const rowCls =
  "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition duration-200 hover:bg-surface-2/70 focus-visible:bg-brand-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-brand-200";

function RowBody({ title, detail, icon, iconTone }: { title: React.ReactNode; detail?: React.ReactNode; icon?: React.ReactNode; iconTone: IconTone }) {
  return (
    <>
      {icon && <IconTile tone={iconTone}>{icon}</IconTile>}
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-medium text-ink">{title}</span>
        {detail && <span className="mt-0.5 block text-base text-ink-2">{detail}</span>}
      </span>
    </>
  );
}

/** One row of a list that leads somewhere: big, with a chevron. */
export function RowLink({
  href,
  title,
  detail,
  icon,
  iconTone = "brand",
  className,
}: {
  href: string;
  title: React.ReactNode;
  detail?: React.ReactNode;
  icon?: React.ReactNode;
  iconTone?: IconTone;
  className?: string;
}) {
  return (
    <Link href={href} className={cn(rowCls, className)}>
      <RowBody title={title} detail={detail} icon={icon} iconTone={iconTone} />
      <ChevronRight className="h-5 w-5 shrink-0 text-ink-3" />
    </Link>
  );
}

/** The same row as a button. With `expanded` given, it is the head of something that opens in place. */
export function RowButton({
  title,
  detail,
  icon,
  iconTone = "brand",
  expanded,
  className,
  ...props
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "title"> & {
  title: React.ReactNode;
  detail?: React.ReactNode;
  icon?: React.ReactNode;
  iconTone?: IconTone;
  expanded?: boolean;
}) {
  const Chevron = expanded == null ? ChevronRight : expanded ? ChevronUp : ChevronDown;
  return (
    <button type="button" aria-expanded={expanded} className={cn(rowCls, className)} {...props}>
      <RowBody title={title} detail={detail} icon={icon} iconTone={iconTone} />
      <Chevron className="h-5 w-5 shrink-0 text-ink-3" />
    </button>
  );
}

/**
 * A small card that leads somewhere, made to sit two in a row: icon and a short name on one line,
 * a sentence under it. The name stays in one piece; on a very narrow phone it drops under the icon.
 */
export function TileLink({
  href,
  title,
  detail,
  icon,
  iconTone = "brand",
  stacked = false,
  className,
}: {
  href: string;
  title: React.ReactNode;
  detail?: React.ReactNode;
  icon?: React.ReactNode;
  iconTone?: IconTone;
  /** the icon above the name instead of beside it: for names too long to share a line with it (English) */
  stacked?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "lift material flex min-h-16 flex-col rounded-card border border-line/80 py-3.5 hover:border-brand-200",
        stacked ? "px-3" : "px-3.5",
        focusRing,
        className,
      )}
    >
      <span className={stacked ? "flex flex-col items-start gap-2" : "flex flex-wrap items-center gap-x-2 gap-y-1.5"}>
        {icon && (
          <IconTile tone={iconTone} size="sm">
            {icon}
          </IconTile>
        )}
        <span className={cn("leading-tight font-semibold text-ink", stacked ? "text-base" : "text-lg whitespace-nowrap")}>{title}</span>
      </span>
      {detail && <span className="mt-2 block text-base leading-snug text-ink-2">{detail}</span>}
    </Link>
  );
}

/* ---------- forms ---------- */

export const inputCls =
  "w-full rounded-lg border border-line-strong bg-surface px-3 text-base text-ink placeholder:text-ink-3 outline-none transition duration-200 focus:border-brand-500 focus:ring-4 focus:ring-brand-100 disabled:bg-surface-2";

export function Field({
  label,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-2 text-base font-semibold text-ink">
        {label}
        {required && <span className="text-danger"> *</span>}
      </div>
      {children}
      {hint && <div className="mt-1.5 text-base leading-relaxed text-ink-2">{hint}</div>}
    </div>
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputCls, "h-12", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputCls, "min-h-28 resize-none py-3 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(inputCls, "h-12 appearance-none pr-11", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-4 h-5 w-5 -translate-y-1/2 text-ink-3" />
    </div>
  );
}

/** The look of one option inside a segmented control (also used by tab bars built from links). */
export const segmentCls = (selected: boolean) =>
  cn(
    "min-h-12 rounded-lg px-4 text-base font-medium whitespace-nowrap transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
    selected ? "bg-surface text-ink shadow-pill" : "text-ink-2 hover:text-ink",
  );

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  label?: string;
}) {
  return (
    <div className={cn("inline-flex flex-wrap gap-1 rounded-xl bg-surface-3/80 p-1", className)} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(segmentCls(o.value === value), "flex-1")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The switch itself, the iOS shape: a pill in the theme accent when on, a quiet grey when off.
 * Purely visual; the button around it carries role="switch" and aria-checked.
 */
export function SwitchTrack({ on, className }: { on: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("relative ml-1 inline-block h-8 w-[3.25rem] shrink-0 rounded-full transition-colors duration-300", on ? "bg-brand-600" : "bg-line-strong", className)}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 h-7 w-7 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.2),0_0_0_0.5px_rgba(0,0,0,0.05)] transition-transform duration-300",
          on && "translate-x-5",
        )}
      />
    </span>
  );
}

/** An on/off switch with its label, as one big row. */
export function Toggle({
  checked,
  onChange,
  label,
  detail,
  icon,
  iconTone = "brand",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  detail?: React.ReactNode;
  icon?: React.ReactNode;
  iconTone?: IconTone;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={rowCls}
    >
      {icon && (
        // the text under the label can run to several lines; the icon stays level with the label
        <IconTile tone={iconTone} className="self-start">
          {icon}
        </IconTile>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-medium text-ink">{label}</span>
        {detail && <span className="mt-0.5 block text-base leading-relaxed text-ink-2">{detail}</span>}
      </span>
      <SwitchTrack on={checked} />
    </button>
  );
}

/* ---------- overlays ---------- */

/**
 * A bottom sheet, the phone way: it rises from the foot of the column, covers the tab bar, and keeps
 * its last button clear of the home indicator. Tapping the shade or pressing Escape closes it.
 * Footer buttons stack full width, the main one on top (pass them cancel first, main last).
 */
export function Modal({
  open,
  title,
  children,
  onClose,
  footer,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      // it slides up as it appears (@starting-style); a browser without that simply shows it in place
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 transition-colors duration-300 starting:bg-ink/0"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "flex max-h-[calc(100dvh-2.5rem)] w-full max-w-[var(--phone-w)] flex-col rounded-t-sheet bg-surface shadow-float transition-transform duration-300 ease-out-soft starting:translate-y-full",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* the grabber, so it reads as a sheet */}
        <span aria-hidden="true" className="mx-auto mt-2 block h-1.5 w-10 shrink-0 rounded-full bg-surface-3" />
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-2">
          <h3 className="t-title min-w-0 pt-1.5 text-ink">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "-mr-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-ink-2 transition hover:bg-surface-2 hover:text-ink",
              focusRing,
            )}
            aria-label={L("关闭", "Close")}
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-2 text-base leading-relaxed text-ink-2"
          style={footer ? undefined : { paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }}
        >
          {children}
        </div>
        {footer && (
          <div
            className="flex shrink-0 flex-col-reverse gap-2 px-5 pt-5 [&>*]:w-full"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- layout bits ---------- */

const backCls =
  "no-print -ml-2 inline-flex min-h-12 items-center gap-0.5 rounded-xl px-2 text-base font-medium text-ink-2 transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";

export function BackLink({ href, children = L("返回", "Back") }: { href: string; children?: React.ReactNode }) {
  return (
    <Link href={href} className={backCls}>
      <ChevronLeft className="h-5 w-5" />
      {children}
    </Link>
  );
}

/** Goes back to wherever the user came from; falls back to `href` when there is nothing to go back to. */
export function BackButton({ href, children = L("返回", "Back") }: { href: string; children?: React.ReactNode }) {
  const router = useRouter();
  return (
    <button type="button" onClick={() => (window.history.length > 1 ? router.back() : router.push(href))} className={backCls}>
      <ChevronLeft className="h-5 w-5" />
      {children}
    </button>
  );
}

/* a phone large title: one fixed size, not one that grows with the window */
const titleCls = "text-[1.75rem] leading-tight font-bold tracking-[-0.03em] text-balance text-ink";
const subCls = "t-body mt-2 text-ink-2";

export function PageTitle({ children, sub, className }: { children: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-5 animate-fade-up", className)}>
      <h1 className={titleCls}>{children}</h1>
      {sub && <p className={subCls}>{sub}</p>}
    </div>
  );
}

/**
 * The top of a page, the same everywhere: the way back, the title, one sentence under it.
 * `action` sits opposite the way back (or opposite the title when there is no way back);
 * `aside` always sits opposite the title.
 */
export function PageHeader({
  title,
  sub,
  back,
  action,
  aside,
  className,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  /** `history: true` goes back to wherever the user came from, with `href` as the fallback */
  back?: { href: string; label?: React.ReactNode; history?: boolean };
  action?: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
}) {
  const beside = aside ?? (back ? null : action);
  return (
    <header className={cn("animate-fade-up", className)}>
      {back && (
        <div className="no-print mb-1 flex items-center justify-between gap-2">
          {back.history ? <BackButton href={back.href}>{back.label}</BackButton> : <BackLink href={back.href}>{back.label}</BackLink>}
          {action}
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <h1 className={cn(titleCls, "min-w-0")}>{title}</h1>
        {beside && <div className="-my-1.5 shrink-0">{beside}</div>}
      </div>
      {sub && <p className={subCls}>{sub}</p>}
    </header>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex min-h-10 items-center justify-between gap-3">
      {/* a short brand mark in front: sections are found by it when scrolling a long page */}
      <h2 className="t-heading flex items-center gap-2.5 text-ink">
        {children}
      </h2>
      {action}
    </div>
  );
}

export function TypingDots({ label = L("医伴正在想", "VisitSmoothie is thinking") }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" role="status" aria-label={label}>
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-2 w-2 animate-pulse-dot rounded-full bg-ink-3" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  );
}

/** The one spinner: a ring of the brand colour with a bright arc going round. Sized with h-/w- like an icon. */
export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("spinner-ring inline-block h-6 w-6 shrink-0", className)} />;
}

/** The shape of something still loading: a quiet shimmering bar. Give it a width and height. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("skeleton block h-5 w-full", className)} />;
}

/** A measurement the way iOS Health shows one: the number big and tabular, the unit and label quiet beside it. */
export function Stat({
  value,
  unit,
  label,
  tone = "ink",
  className,
}: {
  value: React.ReactNode;
  unit?: React.ReactNode;
  label?: React.ReactNode;
  tone?: "ink" | "brand" | "good" | "warn" | "danger";
  className?: string;
}) {
  const tones = { ink: "text-ink", brand: "text-brand-700", good: "text-good", warn: "text-warn", danger: "text-danger" } as const;
  return (
    <span className={cn("inline-flex flex-col", className)}>
      {label && <span className="mb-1 block text-base font-medium text-ink-2">{label}</span>}
      <span className="flex items-baseline gap-1.5">
        <span className={cn("t-number", tones[tone])}>{value}</span>
        {unit && <span className="text-lg font-medium text-ink-2">{unit}</span>}
      </span>
    </span>
  );
}

/** A page-level "nothing here" message with a way out. */
export function Notice({
  title,
  children,
  action,
  icon,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <Card tone="raised" className="animate-pop px-6 py-12 text-center">
      {icon && (
        <IconTile size="xl" tone="brand" className="mx-auto mb-5 animate-breathe">
          {icon}
        </IconTile>
      )}
      <h2 className="t-heading text-ink">{title}</h2>
      {children && <p className="t-body mx-auto mt-2 max-w-sm text-ink-2">{children}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </Card>
  );
}
