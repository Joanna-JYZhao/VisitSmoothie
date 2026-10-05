"use client";

import { useEffect, useMemo } from "react";
import { CalendarClock } from "lucide-react";
import type { AnnualSummary } from "@/lib/types";
import { useStore } from "@/lib/store";
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
} from "@/components/DoctorSheet";
import { TrendChart, type TrendPoint } from "@/components/TrendChart";
import { BackButton, LinkButton, Notice } from "@/components/ui";

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
  if (!profile) return null;

  if (!enough) {
    return (
      <Notice icon={<CalendarClock className="h-6 w-6" />} title="还没有这一年的记录" action={<LinkButton href="/">回到今天</LinkButton>}>
        血糖、血压这类指标记上两个月，或者存过两次复诊结果以后，这里会整理出这段时间的变化。
      </Notice>
    );
  }

  const view: AnnualSummary | null =
    !stale && state.annualSummary
      ? state.annualSummary
      : instant
        ? { ...instant, generatedAt: nowISO(), mode: "fallback", periodStart: facts.periodStart, periodEnd: facts.periodEnd }
        : null;
  if (!view) return null;

  const active = state.episodes.find((e) => e.status === "active");
  const start = new Date(facts.periodStart).getTime();
  const end = new Date(facts.periodEnd).getTime();
  const a1c: TrendPoint[] = facts.hba1c.map((x, i) => ({ id: `a${i}`, t: new Date(x.at).getTime(), at: x.at, v: x.value }));
  const fbg: TrendPoint[] = facts.fbgMonthly.map((m) => {
    const [y, mo] = m.month.split("-").map(Number);
    // The middle of the month, kept inside the period: the month still running has its average at
    // today, not past the chart's edge (where its label was cut off on paper).
    const mid = new Date(Math.max(start, Math.min(new Date(y, mo - 1, 15, 12).getTime(), end)));
    return { id: m.month, t: mid.getTime(), at: mid.toISOString(), v: m.avg, note: `${m.count} 次，${m.min.toFixed(1)} 到 ${m.max.toFixed(1)}` };
  });

  return (
    <div className="space-y-4">
      <div className="no-print">
        <BackButton href="/" />
      </div>
      <DoctorTabs current="year" episodeHref={active ? `/doctor/${active.id}` : null} yearHref="/doctor/year" />

      <GlanceSheet profile={profile} subject="这一年" lines={view.glance} generatedAt={view.generatedAt} busy={busy || stale} />

      <SheetDetails>
        <SheetSection title={`${fmtDate(view.periodStart, { year: true })} 至 ${fmtDate(view.periodEnd, { year: true })}`}>
          <p className="font-semibold">{view.headline}</p>
          <p className="mt-1">{view.overview}</p>
        </SheetSection>
        {view.currentConcerns.length > 0 && (
          <SheetSection title="目前需要医生关注">
            <SheetList items={view.currentConcerns} />
          </SheetSection>
        )}
        {view.metricTrends.length > 0 && (
          <SheetSection title="指标变化">
            <SheetPairs rows={view.metricTrends.map((m) => ({ head: m.name, body: m.trend }))} />
            {a1c.length >= 2 && (
              <div className="mt-4">
                <p className="mb-1 text-base font-medium text-ink-2">糖化血红蛋白（%）</p>
                <TrendChart
                  points={a1c}
                  unit="%"
                  decimals={1}
                  start={start}
                  end={end}
                  band={METRICS.hba1c.target}
                  height={190}
                  ariaLabel="过去一年糖化血红蛋白的变化"
                />
              </div>
            )}
            {fbg.length >= 2 && (
              <div className="mt-4">
                <p className="mb-1 text-base font-medium text-ink-2">空腹血糖，每月平均（mmol/L）</p>
                <TrendChart
                  points={fbg}
                  unit="mmol/L"
                  decimals={1}
                  start={start}
                  end={end}
                  band={METRICS.fbg.target}
                  height={190}
                  dateLabel={(p) => `${new Date(p.at).getMonth() + 1}月平均`}
                  ariaLabel="过去一年每月空腹血糖平均值的变化"
                />
              </div>
            )}
          </SheetSection>
        )}
        {view.medicationChanges.length > 0 && (
          <SheetSection title="用药调整">
            <SheetPairs rows={view.medicationChanges.map((m) => ({ head: m.time, body: m.change }))} />
          </SheetSection>
        )}
        {view.keyEvents.length > 0 && (
          <SheetSection title="重要的事">
            <SheetPairs rows={view.keyEvents.map((k) => ({ head: k.time, body: k.event }))} />
          </SheetSection>
        )}
        {view.patterns.length > 0 && (
          <SheetSection title="从记录里看到的规律">
            <SheetList items={view.patterns} />
          </SheetSection>
        )}
        {view.hints.length > 0 && (
          <SheetSection title="整理时留意到的">
            <SheetHints hints={view.hints} />
          </SheetSection>
        )}
      </SheetDetails>

      {!(busy || stale) && <QuestionsCard questions={view.questionsForDoctor} />}
      <SheetActions text={() => annualToText(view, profile, facts)} onRefresh={() => void refreshAnnual()} busy={busy} />
      <SheetFootnote />
    </div>
  );
}
