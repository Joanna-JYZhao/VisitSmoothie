"use client";

import { useEffect, useMemo } from "react";
import { CalendarClock } from "lucide-react";
import type { AnnualSummary } from "@/lib/types";
import { useStore } from "@/lib/store";
import { L } from "@/lib/lang";
import { METRICS, hasYearOfData } from "@/lib/metrics";
import { annualFacts, annualIsStale, instantAnnual, refreshAnnual, useAnnualBusy } from "@/lib/summaries";
import { annualToText, fmtDate, nowISO } from "@/lib/utils";
import {
  DoctorTabs,
  GlanceSheet,
  QuestionsCard,
  SheetActions,
  SheetDetails,
  SheetFootnote,
  SheetHints,
  SheetList,
  SheetPairs,
  SheetSection,
  SheetSkeleton,
} from "@/components/DoctorSheet";
import { TrendChart, type TrendPoint } from "@/components/TrendChart";
import { BackButton, LinkButton, Notice } from "@/components/ui";

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 这一年: the yearly review for people who look after a long-term condition. */
export default function DoctorYearPage() {
  const { state } = useStore();
  const busy = useAnnualBusy();
  const profile = state.profile;
  const enough = hasYearOfData(state);
  const stale = annualIsStale(state);

  useEffect(() => {
    if (enough && stale && !busy) void refreshAnnual();
  }, [enough, stale, busy]);

  const facts = useMemo(() => annualFacts(state), [state]);
  const instant = useMemo(() => instantAnnual(state), [state]);
  if (!profile) return <SheetSkeleton />;

  if (!enough) {
    return (
      <Notice
        icon={<CalendarClock className="h-6 w-6" />}
        title={L("还没有这一年的记录", "No record of this year yet")}
        action={<LinkButton href="/">{L("回到今天", "Back to today")}</LinkButton>}
      >
        {L(
          "血糖、血压这类指标记上两个月，或者存过两次复诊结果以后，这里会整理出这段时间的变化。",
          "After two months of readings such as glucose or blood pressure, or after two saved follow-up visits, this page will show how things changed over that time.",
        )}
      </Notice>
    );
  }

  const view: AnnualSummary | null =
    !stale && state.annualSummary
      ? state.annualSummary
      : instant
        ? { ...instant, generatedAt: nowISO(), mode: "fallback", periodStart: facts.periodStart, periodEnd: facts.periodEnd }
        : null;
  if (!view) return <SheetSkeleton />;

  const active = state.episodes.find((e) => e.status === "active");
  const start = new Date(facts.periodStart).getTime();
  const end = new Date(facts.periodEnd).getTime();
  const a1c: TrendPoint[] = facts.hba1c.map((x, i) => ({ id: `a${i}`, t: new Date(x.at).getTime(), at: x.at, v: x.value }));
  const fbg: TrendPoint[] = facts.fbgMonthly.map((m) => {
    const [y, mo] = m.month.split("-").map(Number);
    // The middle of the month, kept inside the period: the month still running has its average at
    // today, not past the chart's edge (where its label was cut off on paper).
    const mid = new Date(Math.max(start, Math.min(new Date(y, mo - 1, 15, 12).getTime(), end)));
    return { id: m.month, t: mid.getTime(), at: mid.toISOString(), v: m.avg, note: L(`${m.count} 次，${m.min.toFixed(1)} 到 ${m.max.toFixed(1)}`, `${m.count} ${m.count === 1 ? "reading" : "readings"}, ${m.min.toFixed(1)} to ${m.max.toFixed(1)}`) };
  });
  const working = busy || stale;

  return (
    <div className="space-y-5">
      <div className="no-print -mb-2">
        <BackButton href="/" />
      </div>
      <DoctorTabs current="year" episodeHref={active ? `/doctor/${active.id}` : null} yearHref="/doctor/year" />

      <GlanceSheet profile={profile} subject={L("这一年", "This year")} lines={view.glance} generatedAt={view.generatedAt} busy={working} />

      <SheetDetails>
        <SheetSection
          title={L(
            `${fmtDate(view.periodStart, { year: true })} 至 ${fmtDate(view.periodEnd, { year: true })}`,
            `${fmtDate(view.periodStart, { year: true })} to ${fmtDate(view.periodEnd, { year: true })}`,
          )}
        >
          <p className="text-xl leading-snug font-semibold tracking-[-0.01em]">{view.headline}</p>
          <p className="mt-2">{view.overview}</p>
        </SheetSection>
        {view.currentConcerns.length > 0 && (
          <SheetSection title={L("目前需要医生关注", "Needs the doctor's attention now")}>
            <SheetList items={view.currentConcerns} />
          </SheetSection>
        )}
        {view.metricTrends.length > 0 && (
          <SheetSection title={L("指标变化", "How the readings changed")}>
            <SheetPairs rows={view.metricTrends.map((m) => ({ head: m.name, body: m.trend }))} />
            {a1c.length >= 2 && (
              <figure className="mt-7 print:break-inside-avoid">
                <figcaption className="mb-3 text-base font-semibold text-ink print:text-black">{L("糖化血红蛋白（%）", "HbA1c (%)")}</figcaption>
                <TrendChart
                  points={a1c}
                  unit="%"
                  decimals={1}
                  start={start}
                  end={end}
                  band={METRICS.hba1c.target}
                  height={190}
                  ariaLabel={L("过去一年糖化血红蛋白的变化", "HbA1c over the past year")}
                />
              </figure>
            )}
            {fbg.length >= 2 && (
              <figure className="mt-7 print:break-inside-avoid">
                <figcaption className="mb-3 text-base font-semibold text-ink print:text-black">
                  {L("空腹血糖，每月平均（mmol/L）", "Fasting glucose, monthly average (mmol/L)")}
                </figcaption>
                <TrendChart
                  points={fbg}
                  unit="mmol/L"
                  decimals={1}
                  start={start}
                  end={end}
                  band={METRICS.fbg.target}
                  height={190}
                  dateLabel={(p) => L(`${new Date(p.at).getMonth() + 1}月平均`, `${MONTHS_EN[new Date(p.at).getMonth()]} average`)}
                  ariaLabel={L("过去一年每月空腹血糖平均值的变化", "Monthly average fasting glucose over the past year")}
                />
              </figure>
            )}
          </SheetSection>
        )}
        {view.medicationChanges.length > 0 && (
          <SheetSection title={L("用药调整", "Changes to medicines")}>
            <SheetPairs rows={view.medicationChanges.map((m) => ({ head: m.time, body: m.change }))} />
          </SheetSection>
        )}
        {view.keyEvents.length > 0 && (
          <SheetSection title={L("重要的事", "Important events")}>
            <SheetPairs rows={view.keyEvents.map((k) => ({ head: k.time, body: k.event }))} />
          </SheetSection>
        )}
        {view.patterns.length > 0 && (
          <SheetSection title={L("从记录里看到的规律", "Patterns seen in the records")}>
            <SheetList items={view.patterns} />
          </SheetSection>
        )}
        {view.hints.length > 0 && (
          <SheetSection title={L("整理时留意到的", "Noticed while organising")}>
            <SheetHints hints={view.hints} />
          </SheetSection>
        )}
      </SheetDetails>

      {!working && <QuestionsCard questions={view.questionsForDoctor} />}
      <SheetActions text={() => annualToText(view, profile, facts)} onRefresh={() => void refreshAnnual()} busy={busy} />
      <SheetFootnote />
    </div>
  );
}
