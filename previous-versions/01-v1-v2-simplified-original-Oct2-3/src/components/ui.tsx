"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/utils";

/*
 * Sizes follow one rule: body text is 17px or more, anything that must not be missed is 20px or
 * more, and everything tappable is at least 48px tall. (1rem is 17px, see globals.css.)
 */

/** The one focus style: a soft halo in the brand colour. For anything tappable that is not built from the parts below. */
export const focusRing = "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200";

/* ---------- buttons ---------- */

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-2xl text-center font-semibold leading-tight select-none transition-all duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";
const btnVariants = {
  /** the one main action on a screen. The gradient starts at brand-600 and only gets darker, so white text never drops below 4.9:1 */
  primary: "bg-linear-to-b from-brand-600 to-brand-650 text-white shadow-btn hover:from-brand-700 hover:to-brand-700",
  secondary: "border-2 border-line-strong bg-surface text-ink shadow-edge hover:border-brand-400 hover:bg-brand-50",
  soft: "bg-brand-50 text-brand-800 hover:bg-brand-100",
  /** clearly a button, clearly not the main one: brand outline on white */
  outline: "border-2 border-brand-600 bg-surface text-brand-800 shadow-edge hover:bg-brand-50",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  danger: "bg-danger text-white shadow-edge hover:bg-[#a92d33]",
  dangerSoft: "bg-danger-bg text-danger hover:bg-[#f8d7d9]",
  dangerGhost: "text-danger hover:bg-danger-bg",
} as const;
const btnSizes = {
  sm: "min-h-11 px-4 text-base",
  md: "min-h-12 px-5 text-base",
  lg: "min-h-14 px-6 text-lg",
  /** an answer to tap: as tall as `lg`, but with little side padding so three fit on a phone */
  tile: "min-h-14 px-1.5 text-lg",
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
  "inline-flex min-h-12 items-center gap-0.5 rounded-xl px-2 text-base font-medium underline-offset-4 transition hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200";
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
  plain: "border border-line bg-surface shadow-card",
  /** tinted: the thing that matters today (an appointment, something to confirm) */
  brand: "border border-brand-200 bg-brand-50 shadow-card",
  /** a red edge: to be dealt with before anything else on the screen */
  alert: "border-2 border-danger bg-surface shadow-card",
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
    <span className={cn("inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-base font-medium leading-7", toneStyles[tone], className)}>
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
  neutral: "bg-surface-2 text-ink-2",
} as const;
export type IconTone = keyof typeof tileTones;
const tileSizes = {
  sm: "h-9 w-9 rounded-xl",
  md: "h-10 w-10 rounded-xl",
  lg: "h-12 w-12 rounded-2xl",
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
  "flex min-h-16 w-full items-center gap-3 px-5 py-3.5 text-left transition hover:bg-brand-50/60 focus-visible:bg-brand-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-brand-200";

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
    <Link
      href={href}
      className={cn(
        "flex min-h-16 flex-col rounded-card border border-line bg-surface px-3.5 py-3.5 shadow-card transition hover:border-brand-300 hover:bg-brand-50/60 active:scale-[0.99]",
        focusRing,
        className,
      )}
    >
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {icon && (
          <IconTile tone={iconTone} size="sm">
            {icon}
          </IconTile>
        )}
        <span className="text-lg leading-tight font-semibold whitespace-nowrap text-ink">{title}</span>
      </span>
      {detail && <span className="mt-2 block text-base leading-snug text-ink-2">{detail}</span>}
    </Link>
  );
}

/* ---------- forms ---------- */

export const inputCls =
  "w-full rounded-2xl border-2 border-line-strong bg-surface px-4 text-lg text-ink placeholder:text-ink-3 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100 disabled:bg-surface-2";

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
      <div className="mb-2 text-base font-medium text-ink">
        {label}
        {required && <span className="text-danger"> *</span>}
      </div>
      {children}
      {hint && <div className="mt-1.5 text-base leading-relaxed text-ink-2">{hint}</div>}
    </div>
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputCls, "h-13", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputCls, "min-h-28 resize-y py-3 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(inputCls, "h-13 appearance-none pr-11", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-4 h-5 w-5 -translate-y-1/2 text-ink-3" />
    </div>
  );
}

/** The look of one option inside a segmented control (also used by tab bars built from links). */
export const segmentCls = (selected: boolean) =>
  cn(
    "min-h-11 rounded-xl px-4 text-base font-medium whitespace-nowrap transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200",
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
    <div className={cn("inline-flex flex-wrap gap-1 rounded-2xl bg-surface-2 p-1", className)} role="radiogroup" aria-label={label}>
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
      <span className={cn("relative ml-1 h-8 w-14 shrink-0 rounded-full transition-colors", checked ? "bg-brand-600" : "bg-line-strong")}>
        <span className={cn("absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all", checked ? "left-7" : "left-1")} />
      </span>
    </button>
  );
}

/* ---------- overlays ---------- */

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
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-ink/45 p-4 backdrop-blur-[3px] sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md animate-fade-up rounded-card bg-surface p-6 shadow-float"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-xl leading-snug font-semibold text-ink">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "-mt-1.5 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-2 transition hover:bg-surface-2 hover:text-ink",
              focusRing,
            )}
            aria-label="关闭"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        <div className="mt-3 text-base leading-relaxed text-ink-2">{children}</div>
        {footer && <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- layout bits ---------- */

const backCls =
  "no-print -ml-2 inline-flex min-h-12 items-center gap-0.5 rounded-xl px-2 text-base font-medium text-ink-2 transition hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200";

export function BackLink({ href, children = "返回" }: { href: string; children?: React.ReactNode }) {
  return (
    <Link href={href} className={backCls}>
      <ChevronLeft className="h-5 w-5" />
      {children}
    </Link>
  );
}

/** Goes back to wherever the user came from; falls back to `href` when there is nothing to go back to. */
export function BackButton({ href, children = "返回" }: { href: string; children?: React.ReactNode }) {
  const router = useRouter();
  return (
    <button type="button" onClick={() => (window.history.length > 1 ? router.back() : router.push(href))} className={backCls}>
      <ChevronLeft className="h-5 w-5" />
      {children}
    </button>
  );
}

const titleCls = "text-[1.65rem] leading-tight font-semibold tracking-tight text-balance text-ink";
const subCls = "mt-1.5 text-lg leading-relaxed text-ink-2";

export function PageTitle({ children, sub, className }: { children: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-5", className)}>
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
    <header className={className}>
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
    <div className="mb-2 flex min-h-10 items-center justify-between gap-3">
      {/* a short brand mark in front: sections are found by it when scrolling a long page */}
      <h2 className="flex items-center gap-2.5 text-lg font-semibold text-ink before:h-[1.05em] before:w-1 before:shrink-0 before:rounded-full before:bg-brand-500">
        {children}
      </h2>
      {action}
    </div>
  );
}

export function TypingDots({ label = "医伴正在想" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" role="status" aria-label={label}>
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-2 w-2 animate-pulse-dot rounded-full bg-ink-3" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-6 w-6 animate-spin text-brand-600", className)} />;
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
    <Card className="px-6 py-8 text-center">
      {icon && (
        <IconTile size="lg" tone="neutral" className="mx-auto mb-4">
          {icon}
        </IconTile>
      )}
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      {children && <p className="mt-2 text-base leading-relaxed text-ink-2">{children}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </Card>
  );
}
