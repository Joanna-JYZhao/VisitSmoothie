"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Copy,
  FileDown,
  FileText,
  Info,
  MessageCircleQuestion,
  Printer,
  RefreshCw,
  ScrollText,
  TriangleAlert,
} from "lucide-react";
import type { Gender, Hint, Profile } from "@/lib/types";
import { L } from "@/lib/lang";
import { ageOf, cn, copyText, fmtDate } from "@/lib/utils";
import { useToast } from "./Toast";
import { Button, Card, IconTile, Spinner, focusRing, segmentCls } from "./ui";

/*
 * The pieces of the page that is handed to the doctor.
 *
 * On screen it is one typeset document: a letterhead with the patient's name set large, a double
 * rule under it, the standing facts in hairline-ruled rows, then the few lines that matter most.
 * On paper the same markup prints black on white (print-sheet / print-only / no-print).
 */

/** The gender is stored as the Chinese word; this is only how it is shown. */
function genderText(g: Gender): string {
  return g === "男" ? L("男", "Male") : g === "女" ? L("女", "Female") : L("其他", "Other");
}

/** A list from the profile, joined the way each language joins a list. The items stay as they were written. */
const joined = (items: string[]) => items.join(L("、", ", "));

/** 这次不舒服 / 这一年: only shown when both exist. */
export function DoctorTabs({
  current,
  episodeHref,
  yearHref,
}: {
  current: "episode" | "year";
  episodeHref: string | null;
  yearHref: string | null;
}) {
  if (!episodeHref || !yearHref) return null;
  const tabs = [
    {
      key: "episode",
      label: L("这次不舒服", "This problem"),
      href: episodeHref,
    },
    { key: "year", label: L("这一年", "This year"), href: yearHref },
  ] as const;
  return (
    <nav className="no-print flex gap-1 rounded-[18px] bg-surface-3/80 p-1" aria-label={L("给医生看什么", "What to show the doctor")}>
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? "page" : undefined}
          className={cn(segmentCls(t.key === current), "flex min-h-12 flex-1 items-center justify-center")}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** The double rule a letterhead ends with: a fine ink line over a hairline. */
function LetterheadRule() {
  return (
    <div aria-hidden="true" className="mx-4 print:mx-0">
      <div className="h-px bg-ink print:bg-black" />
      <div className="mt-[3px] h-px bg-line-strong print:bg-black" />
    </div>
  );
}

/**
 * The first screen: who the patient is and the few lines that matter most, in large type,
 * so the phone can simply be handed over.
 */
export function GlanceSheet({
  profile,
  subject,
  lines,
  generatedAt,
  busy,
}: {
  profile: Profile;
  subject: string;
  lines: string[];
  generatedAt: string;
  busy: boolean;
}) {
  const background = [
    profile.conditions.length
      ? L(`既往：${joined(profile.conditions)}`, `History: ${joined(profile.conditions)}`)
      : L("既往：无特殊", "History: nothing notable"),
    profile.surgeries.length ? L(`手术：${joined(profile.surgeries)}`, `Surgery: ${joined(profile.surgeries)}`) : "",
  ]
    .filter(Boolean)
    .join(L("　", " · "));
  return (
    <Card tone="raised" className="print-sheet animate-fade-up overflow-hidden">
      {/* the letterhead: this card is a document, the one thing here that leaves the phone */}
      <div className="px-4 pt-4 pb-5 print:px-0! print:pt-0 print:pb-4">
        {/* on a phone the subject and the date sit one over the other; on paper they share a line */}
        <div className="flex items-start gap-3">
          <IconTile tone="solid" size="sm" className="no-print">
            <FileText />
          </IconTile>
          <p className="min-w-0 flex-1 print:flex print:items-baseline print:justify-between print:gap-4">
            <span className="block text-base leading-snug font-semibold tracking-[0.01em] text-brand-700 print:text-black">
              {L(`给医生看 · ${subject}`, `For the doctor · ${subject}`)}
            </span>
            <span className="block text-base leading-snug text-ink-2 tabular print:shrink-0 print:text-black">
              {fmtDate(generatedAt, { year: true })}
            </span>
          </p>
        </div>
        <p className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 print:mt-4">
          <span className="t-display text-ink print:text-black">{profile.name}</span>
          <span className="t-lead font-medium text-ink-2 print:text-black">
            {L(
              `${profile.gender} · ${ageOf(profile.birthYear)} 岁`,
              `${genderText(profile.gender)} · ${ageOf(profile.birthYear)} years old`,
            )}
          </span>
        </p>
      </div>
      <LetterheadRule />
      {/* the standing facts, one per hairline-ruled row, like the fields of a form */}
      <div className="divide-y divide-line border-b border-line px-4 text-lg leading-relaxed text-ink print:px-0! print:text-black">
        <p className="py-3">{background}</p>
        <p className="py-3 font-semibold text-danger print:text-black">
          {L(
            `过敏：${profile.allergies.length ? joined(profile.allergies) : "无已知过敏"}`,
            `Allergies: ${profile.allergies.length ? joined(profile.allergies) : "none known"}`,
          )}
        </p>
        {profile.medications.length > 0 && (
          <p className="py-3">{L(`长期用药：${joined(profile.medications)}`, `Regular medicines: ${joined(profile.medications)}`)}</p>
        )}
      </div>
      {/* the lines that matter most: each one comes in a beat after the one before */}
      <ul className="divide-y divide-line px-4 py-1 print:px-0!">
        {lines.map((line, i) => (
          <li key={i} className="flex animate-fade-up gap-3.5 py-4 print:py-3" style={{ animationDelay: `${80 + i * 60}ms` }}>
            <span
              aria-hidden="true"
              className="mt-[0.62em] h-2.5 w-2.5 shrink-0 rounded-full bg-brand-600 ring-4 ring-brand-50 print:bg-black print:ring-0"
            />
            <span className="min-w-0 text-[1.3rem] leading-[1.4] font-semibold tracking-[-0.015em] text-ink print:text-[1.25rem] print:text-black">
              {line}
            </span>
          </li>
        ))}
      </ul>
      {busy && (
        <p
          className="no-print flex items-center gap-3 border-t border-line bg-surface-2/60 px-4 py-3.5 text-base leading-snug text-ink-2"
          role="status"
        >
          <Spinner className="h-5 w-5" />
          {L(
            "上面这几条已经可以给医生看。下面的细节还在整理…",
            "The lines above are ready to show the doctor. The details below are still being organised…",
          )}
        </p>
      )}
    </Card>
  );
}

/** Everything else, folded away on screen and always printed. The row that opens it and what it opens are one group. */
export function SheetDetails({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="print-sheet overflow-hidden">
      <button
        type="button"
        className={cn("no-print press flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left", focusRing, "focus-visible:ring-inset")}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <IconTile tone="neutral">
          <ScrollText />
        </IconTile>
        <span className="min-w-0 flex-1 text-lg font-medium text-ink">
          {open ? L("收起细节", "Hide details") : L("看全部细节", "Show all details")}
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2 transition-transform duration-300",
            open && "rotate-180",
          )}
        >
          <ChevronDown className="h-5 w-5" />
        </span>
      </button>
      <div className={cn("border-t border-line px-4 py-1 print:border-0 print:p-0", open && "animate-fade-up", !open && "print-only")}>
        {children}
      </div>
    </Card>
  );
}

export function SheetSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line py-5 last:border-0 print:break-inside-avoid print:py-3 print:first:pt-0">
      <h3 className="mb-2.5 text-base font-semibold tracking-[0.02em] text-brand-700 print:text-black">{title}</h3>
      <div className="text-lg leading-relaxed text-ink print:text-black">{children}</div>
    </section>
  );
}

export function SheetList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((x, i) => (
        <li key={i} className="flex gap-3.5">
          <span className="mt-[0.72em] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600 print:bg-black" aria-hidden="true" />
          <span className="min-w-0">{x}</span>
        </li>
      ))}
    </ul>
  );
}

export function SheetPairs({ rows }: { rows: { head: string; body: string }[] }) {
  return (
    <ul>
      {rows.map((r, i) => (
        <li key={i} className="border-t border-line py-3 first:border-0 first:pt-0 last:pb-0 print:flex print:gap-6">
          <span className="block font-semibold text-ink tabular print:w-36 print:shrink-0 print:text-black">{r.head}</span>
          <span className="sr-only">　</span>
          <span className="block min-w-0 flex-1">{r.body}</span>
        </li>
      ))}
    </ul>
  );
}

export function SheetHints({ hints }: { hints: Hint[] }) {
  return (
    <ul className="space-y-2.5">
      {hints.map((h, i) => {
        const info = h.level === "info";
        return (
          <li
            key={i}
            className={cn(
              "flex items-start gap-3 rounded-2xl px-4 py-3 print:rounded-none print:bg-transparent print:p-0",
              info ? "bg-info-bg" : "bg-warn-bg",
            )}
          >
            <span
              aria-hidden="true"
              className={cn("no-print mt-[0.3em] shrink-0 [&>svg]:h-5 [&>svg]:w-5", info ? "text-info" : "text-warn")}
            >
              {info ? <Info /> : <TriangleAlert />}
            </span>
            <span className="min-w-0 flex-1">{h.text}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Questions the assistant prepared for the patient to ask. */
export function QuestionsCard({ questions }: { questions: string[] }) {
  if (!questions.length) return null;
  return (
    <Card className="print-sheet animate-fade-up px-4 pt-4 pb-1 print:p-0 print:pt-4">
      <h2 className="flex items-center gap-3">
        <IconTile tone="brand" className="no-print">
          <MessageCircleQuestion />
        </IconTile>
        <span className="t-heading text-ink print:text-black">{L("可以问医生的问题", "Questions to ask the doctor")}</span>
      </h2>
      <ol className="mt-2 divide-y divide-line text-lg leading-relaxed text-ink print:text-black">
        {questions.map((q, i) => (
          <li key={i} className="flex gap-3 py-3.5 print:py-2">
            <span className="w-7 shrink-0 text-xl leading-[1.45] font-semibold text-brand-700 tabular print:text-black">{i + 1}.</span>
            <span className="min-w-0 flex-1">{q}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** One of the three actions under the sheet: an icon on a tile, a word under it. */
function SheetAction({
  icon,
  label,
  onClick,
  disabled,
  spinning,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  spinning?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "press flex min-h-[5.5rem] flex-col items-center justify-center gap-2 rounded-[10px] px-1 py-3 text-base font-medium text-ink transition duration-200 hover:bg-surface-2/80 disabled:pointer-events-none disabled:opacity-45",
        focusRing,
      )}
    >
      <IconTile tone="brand" className={cn(spinning && "[&>svg]:animate-spin")}>
        {icon}
      </IconTile>
      {label}
    </button>
  );
}

/**
 * Everything that can be done with the sheet, in one group right under it: 导出 PDF (when `pdf`)
 * as the one wide button, then print / copy / refresh side by side, each a big square to tap.
 */
export function SheetActions({
  text,
  onRefresh,
  busy,
  pdf = false,
}: {
  text: () => string;
  onRefresh: () => void;
  busy: boolean;
  pdf?: boolean;
}) {
  const toast = useToast();
  return (
    <Card className="no-print animate-fade-up overflow-hidden">
      {pdf && (
        // 导出 PDF: the browser's own print window saves the sheet as a PDF
        <div className="px-4 pt-4 pb-3">
          <Button size="lg" className="press w-full text-lg" onClick={() => window.print()}>
            <FileDown className="h-6 w-6" />
            {L("导出 PDF", "Export PDF")}
          </Button>
          <p className="mt-2 text-center text-base leading-snug text-ink-2">
            {L("在打印窗口里选「存储为 PDF」", "In the print window, choose “Save as PDF”")}
          </p>
        </div>
      )}
      <div className={cn("grid grid-cols-3 gap-1 p-1.5", pdf && "border-t border-line")}>
        <SheetAction icon={<Printer />} label={L("打印", "Print")} onClick={() => window.print()} />
        <SheetAction
          icon={<Copy />}
          label={L("复制文字", "Copy text")}
          onClick={async () => {
            const ok = await copyText(text());
            toast.show(
              ok
                ? L("已复制，可以粘贴发给医生", "Copied. You can paste it and send it to your doctor.")
                : L("没复制成功，可以改用打印", "Could not copy. You can print it instead."),
              ok ? "good" : "danger",
            );
          }}
        />
        <SheetAction icon={<RefreshCw />} label={L("重新整理", "Refresh")} onClick={onRefresh} disabled={busy} spinning={busy} />
      </div>
    </Card>
  );
}

/** The shape of the sheet while the record is still being read: nothing to read yet, so nothing is said. */
export function SheetSkeleton() {
  return (
    <div className="space-y-5" aria-hidden="true">
      <Card tone="raised" className="overflow-hidden">
        <div className="px-4 pt-4 pb-5">
          <div className="flex items-center justify-between gap-4">
            <span className="skeleton block h-5 w-40" />
            <span className="skeleton block h-5 w-24" />
          </div>
          <span className="skeleton mt-6 block h-11 w-44" />
        </div>
        <div className="divide-y divide-line border-y border-line px-4">
          <div className="py-4">
            <span className="skeleton block h-5 w-3/4" />
          </div>
          <div className="py-4">
            <span className="skeleton block h-5 w-1/2" />
          </div>
        </div>
        <div className="divide-y divide-line px-4 py-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="py-5">
              <span className="skeleton block h-6 w-11/12" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function SheetFootnote() {
  return (
    // on paper it closes the sheet: set off from the last section by a rule, like a footer
    <p className="mx-auto max-w-[30rem] px-4 pt-2 pb-4 text-center text-base leading-relaxed text-ink-2 print:mt-5 print:max-w-none print:border-t print:border-line print:px-0! print:pt-3 print:text-black">
      {L("以上是患者自己记录、由医伴整理的内容，不是诊断。", "Recorded by the patient and organized by VisitSmoothie. Not a diagnosis.")}
    </p>
  );
}
