"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Copy, FileText, Info, MessageCircleQuestion, Printer, RefreshCw, ScrollText, TriangleAlert } from "lucide-react";
import type { Gender, Hint, Profile } from "@/lib/types";
import { L } from "@/lib/lang";
import { ageOf, cn, copyText, fmtDate } from "@/lib/utils";
import { useToast } from "./Toast";
import { Card, IconTile, Spinner, focusRing, segmentCls } from "./ui";

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
export function DoctorTabs({ current, episodeHref, yearHref }: { current: "episode" | "year"; episodeHref: string | null; yearHref: string | null }) {
  if (!episodeHref || !yearHref) return null;
  const tabs = [
    { key: "episode", label: L("这次不舒服", "This problem"), href: episodeHref },
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
    <div aria-hidden="true" className="mx-5 sm:mx-6 print:mx-0">
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
    profile.conditions.length ? L(`既往：${joined(profile.conditions)}`, `History: ${joined(profile.conditions)}`) : L("既往：无特殊", "History: nothing notable"),
    profile.surgeries.length ? L(`手术：${joined(profile.surgeries)}`, `Surgery: ${joined(profile.surgeries)}`) : "",
  ]
    .filter(Boolean)
    .join(L("　", " · "));
  return (
    <Card tone="raised" className="print-sheet animate-fade-up overflow-hidden">
      {/* the letterhead: this card is a document, the one thing here that leaves the phone */}
      <div className="px-5 pt-6 pb-6 sm:px-6 sm:pt-7 print:px-0! print:pt-0 print:pb-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="flex min-w-0 items-center gap-3">
            <IconTile tone="solid" size="sm" className="no-print">
              <FileText />
            </IconTile>
            <span className="min-w-0 text-base leading-snug font-semibold tracking-[0.01em] text-brand-700 print:text-black">
              {L(`给医生看 · ${subject}`, `For the doctor · ${subject}`)}
            </span>
          </p>
          <p className="ml-auto shrink-0 text-base text-ink-2 tabular print:text-black">{fmtDate(generatedAt, { year: true })}</p>
        </div>
        <p className="mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-1 print:mt-4">
          <span className="t-display text-ink print:text-black">{profile.name}</span>
          <span className="t-lead font-medium text-ink-2 print:text-black">
            {L(`${profile.gender} · ${ageOf(profile.birthYear)} 岁`, `${genderText(profile.gender)} · ${ageOf(profile.birthYear)} years old`)}
          </span>
        </p>
      </div>
      <LetterheadRule />
      {/* the standing facts, one per hairline-ruled row, like the fields of a form */}
      <div className="divide-y divide-line border-b border-line px-5 text-lg leading-relaxed text-ink sm:px-6 print:px-0! print:text-black">
        <p className="py-3.5">{background}</p>
        <p className="py-3.5 font-semibold text-danger print:text-black">
          {L(
            `过敏：${profile.allergies.length ? joined(profile.allergies) : "无已知过敏"}`,
            `Allergies: ${profile.allergies.length ? joined(profile.allergies) : "none known"}`,
          )}
        </p>
        {profile.medications.length > 0 && (
          <p className="py-3.5">{L(`长期用药：${joined(profile.medications)}`, `Regular medicines: ${joined(profile.medications)}`)}</p>
        )}
      </div>
      {/* the lines that matter most: each one comes in a beat after the one before */}
      <ul className="divide-y divide-line px-5 py-2 sm:px-6 print:px-0!">
        {lines.map((line, i) => (
          <li key={i} className="flex animate-fade-up gap-4 py-4.5 print:py-3" style={{ animationDelay: `${80 + i * 60}ms` }}>
            <span
              aria-hidden="true"
              className="mt-[0.62em] h-2.5 w-2.5 shrink-0 rounded-full bg-brand-600 ring-4 ring-brand-50 print:bg-black print:ring-0"
            />
            <span className="text-[1.25rem] leading-[1.4] font-semibold tracking-[-0.015em] text-ink sm:text-[1.4rem] sm:leading-[1.35] print:text-black">{line}</span>
          </li>
        ))}
      </ul>
      {busy && (
        <p className="no-print flex items-center gap-3 border-t border-line bg-surface-2/60 px-5 py-4 text-base text-ink-2 sm:px-6" role="status">
          <Spinner className="h-5 w-5" />
          {L("上面这几条已经可以给医生看。下面的细节还在整理…", "The lines above are ready to show the doctor. The details below are still being organised…")}
        </p>
      )}
    </Card>
  );
}

/** Everything else, folded away on screen and always printed. */
export function SheetDetails({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Card className="no-print lift overflow-hidden hover:border-brand-200">
        <button
          type="button"
          className={cn("press flex min-h-16 w-full items-center gap-3 px-5 py-3.5 text-left sm:px-6", focusRing, "focus-visible:ring-inset")}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <IconTile tone="neutral">
            <ScrollText />
          </IconTile>
          <span className="min-w-0 flex-1 text-lg font-medium text-ink">{open ? L("收起细节", "Hide details") : L("看全部细节", "Show all details")}</span>
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
      </Card>
      <Card className={cn("print-sheet px-5 py-2 sm:px-6 print:p-0", open && "animate-fade-up", !open && "print-only")}>{children}</Card>
    </>
  );
}

export function SheetSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line py-6 last:border-0 print:break-inside-avoid print:py-3 print:first:pt-0">
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
        <li key={i} className="border-t border-line py-3 first:border-0 first:pt-0 last:pb-0 sm:flex sm:gap-6">
          <span className="block font-semibold text-ink tabular sm:w-36 sm:shrink-0 print:text-black">{r.head}</span>
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
            <span aria-hidden="true" className={cn("no-print mt-[0.3em] shrink-0 [&>svg]:h-5 [&>svg]:w-5", info ? "text-info" : "text-warn")}>
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
    <Card className="print-sheet animate-fade-up px-5 pt-6 pb-2 sm:px-6 print:p-0 print:pt-4">
      <h2 className="flex items-center gap-3">
        <IconTile tone="brand" className="no-print">
          <MessageCircleQuestion />
        </IconTile>
        <span className="t-heading text-ink print:text-black">{L("可以问医生的问题", "Questions to ask the doctor")}</span>
      </h2>
      <ol className="mt-3 divide-y divide-line text-lg leading-relaxed text-ink print:text-black">
        {questions.map((q, i) => (
          <li key={i} className="flex gap-4 py-4 print:py-2">
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
        "press flex min-h-[5.5rem] flex-col items-center justify-center gap-2 rounded-2xl px-2 py-3 text-base font-medium text-ink transition duration-200 hover:bg-surface-2/80 disabled:pointer-events-none disabled:opacity-45",
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

export function SheetActions({ text, onRefresh, busy }: { text: () => string; onRefresh: () => void; busy: boolean }) {
  const toast = useToast();
  return (
    <Card className="no-print grid grid-cols-3 gap-1 p-1.5">
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
    </Card>
  );
}

/** The shape of the sheet while the record is still being read: nothing to read yet, so nothing is said. */
export function SheetSkeleton() {
  return (
    <div className="space-y-5" aria-hidden="true">
      <Card tone="raised" className="overflow-hidden">
        <div className="px-5 pt-7 pb-6 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <span className="skeleton block h-5 w-40" />
            <span className="skeleton block h-5 w-24" />
          </div>
          <span className="skeleton mt-6 block h-11 w-44" />
        </div>
        <div className="divide-y divide-line border-y border-line px-5 sm:px-6">
          <div className="py-4">
            <span className="skeleton block h-5 w-3/4" />
          </div>
          <div className="py-4">
            <span className="skeleton block h-5 w-1/2" />
          </div>
        </div>
        <div className="divide-y divide-line px-5 py-2 sm:px-6">
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
      {L("以上是患者自己记录、由医伴整理的内容，不是诊断。", "Recorded by the patient and organised by Yiban. Not a diagnosis.")}
    </p>
  );
}
