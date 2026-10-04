"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Copy, Printer, RefreshCw } from "lucide-react";
import type { Gender, Hint, Profile } from "@/lib/types";
import { L } from "@/lib/lang";
import { ageOf, cn, copyText, fmtDate } from "@/lib/utils";
import { useToast } from "./Toast";
import { Button, Card, Spinner, segmentCls } from "./ui";

/* The pieces of the page that is handed to the doctor. */

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
    <nav className="no-print mb-4 flex gap-1 rounded-2xl bg-surface-2 p-1" aria-label={L("给医生看什么", "What to show the doctor")}>
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? "page" : undefined}
          className={cn(segmentCls(t.key === current), "flex flex-1 items-center justify-center")}
        >
          {t.label}
        </Link>
      ))}
    </nav>
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
    <Card className="print-sheet overflow-hidden">
      {/* a letterhead: this card is a document, the one thing here that leaves the phone */}
      <div aria-hidden="true" className="h-1.5 bg-linear-to-r from-brand-500 to-brand-700 print:hidden" />
      <div className="border-b border-line bg-brand-50 px-5 py-4 print:bg-transparent print:px-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="text-base font-semibold text-brand-800">{L(`给医生看 · ${subject}`, `For the doctor · ${subject}`)}</p>
          <p className="text-base text-ink-2 tabular-nums">{fmtDate(generatedAt, { year: true })}</p>
        </div>
        <p className="mt-1 text-2xl font-semibold text-ink">
          {profile.name}
          <span className="ml-2 text-lg font-normal text-ink-2">
            {L(`${profile.gender} · ${ageOf(profile.birthYear)} 岁`, `${genderText(profile.gender)} · ${ageOf(profile.birthYear)} years old`)}
          </span>
        </p>
        <p className="mt-1.5 text-base leading-relaxed text-ink">{background}</p>
        <p className="text-base leading-relaxed font-semibold text-danger">
          {L(
            `过敏：${profile.allergies.length ? joined(profile.allergies) : "无已知过敏"}`,
            `Allergies: ${profile.allergies.length ? joined(profile.allergies) : "none known"}`,
          )}
        </p>
        {profile.medications.length > 0 && (
          <p className="text-base leading-relaxed text-ink">
            {L(`长期用药：${joined(profile.medications)}`, `Regular medicines: ${joined(profile.medications)}`)}
          </p>
        )}
      </div>
      <ul className="space-y-3 px-5 py-5 print:px-0">
        {lines.map((line, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-[0.6em] h-2.5 w-2.5 shrink-0 rounded-full bg-brand-600" aria-hidden="true" />
            <span className="text-[1.3rem] leading-snug font-semibold text-ink">{line}</span>
          </li>
        ))}
      </ul>
      {busy && (
        <p className="no-print flex items-center gap-2.5 border-t border-line px-5 py-3 text-base text-ink-2" role="status">
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
      <Button variant="secondary" size="lg" className="no-print w-full" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? L("收起细节", "Hide details") : L("看全部细节", "Show all details")}
        {open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
      </Button>
      <Card className={cn("print-sheet p-5 print:p-0", !open && "print-only")}>{children}</Card>
    </>
  );
}

export function SheetSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line py-4 first:pt-0 last:border-0 last:pb-0">
      <h3 className="mb-1.5 text-base font-semibold text-brand-800">{title}</h3>
      <div className="text-lg leading-relaxed text-ink">{children}</div>
    </section>
  );
}

export function SheetList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((x, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="mt-[0.7em] h-1.5 w-1.5 shrink-0 rounded-full bg-ink-3" aria-hidden="true" />
          <span>{x}</span>
        </li>
      ))}
    </ul>
  );
}

export function SheetPairs({ rows }: { rows: { head: string; body: string }[] }) {
  return (
    <ul className="space-y-2">
      {rows.map((r, i) => (
        <li key={i}>
          <span className="font-semibold tabular-nums">{r.head}</span>
          <span className="text-ink-2">　</span>
          {r.body}
        </li>
      ))}
    </ul>
  );
}

export function SheetHints({ hints }: { hints: Hint[] }) {
  return (
    <ul className="space-y-2">
      {hints.map((h, i) => (
        <li key={i} className={cn("rounded-xl px-3.5 py-2.5", h.level === "info" ? "bg-info-bg" : "bg-warn-bg")}>
          {h.text}
        </li>
      ))}
    </ul>
  );
}

/** Questions the assistant prepared for the patient to ask. */
export function QuestionsCard({ questions }: { questions: string[] }) {
  if (!questions.length) return null;
  return (
    <Card className="print-sheet p-5 print:p-0 print:pt-4">
      <h2 className="text-lg font-semibold text-ink">{L("可以问医生的问题", "Questions to ask the doctor")}</h2>
      <ol className="mt-2 space-y-2 text-lg leading-relaxed text-ink">
        {questions.map((q, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="shrink-0 font-semibold text-brand-700 tabular-nums">{i + 1}.</span>
            <span>{q}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function SheetActions({ text, onRefresh, busy }: { text: () => string; onRefresh: () => void; busy: boolean }) {
  const toast = useToast();
  return (
    <div className="no-print grid grid-cols-3 gap-2">
      <Button variant="ghost" size="sm" className="flex-col py-2.5" onClick={() => window.print()}>
        <Printer className="h-5 w-5" />
        {L("打印", "Print")}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="flex-col py-2.5"
        onClick={async () => {
          const ok = await copyText(text());
          toast.show(
            ok
              ? L("已复制，可以粘贴发给医生", "Copied. You can paste it and send it to your doctor.")
              : L("没复制成功，可以改用打印", "Could not copy. You can print it instead."),
            ok ? "good" : "danger",
          );
        }}
      >
        <Copy className="h-5 w-5" />
        {L("复制文字", "Copy text")}
      </Button>
      <Button variant="ghost" size="sm" className="flex-col py-2.5" onClick={onRefresh} disabled={busy}>
        <RefreshCw className={cn("h-5 w-5", busy && "animate-spin")} />
        {L("重新整理", "Refresh")}
      </Button>
    </div>
  );
}

export function SheetFootnote() {
  return (
    // on paper it closes the sheet: set off from the last section by a rule, like a footer
    <p className="text-center text-base leading-relaxed text-ink-2 print:mt-5 print:border-t print:border-line print:pt-3">
      {L("以上是患者自己记录、由医伴整理的内容，不是诊断。", "Recorded by the patient and organised by Yiban. Not a diagnosis.")}
    </p>
  );
}
