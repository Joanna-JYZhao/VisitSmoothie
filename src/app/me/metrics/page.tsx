"use client";

import { useMemo, useState } from "react";
import { ChartLine, Pencil, Plus, Table2, Trash2 } from "lucide-react";
import type { Measurement, MetricType } from "@/lib/types";
import { useNow, useStore } from "@/lib/store";
import { GLUCOSE_LOW, METRICS, METRIC_ORDER, detectInsights, formatValue, isOutOfRange, measurementsOf, plainConclusion } from "@/lib/metrics";
import { cn, fmtDate, relativeTime } from "@/lib/utils";
import { InsightList } from "@/components/InsightList";
import { RecordMetricModal } from "@/components/RecordMetricModal";
import { useToast } from "@/components/Toast";
import { TrendChart, type TrendPoint } from "@/components/TrendChart";
import { Badge, Button, Card, PageHeader, SectionTitle, Segmented, focusRing } from "@/components/ui";

type RangeKey = "30d" | "90d" | "1y";
const RANGES: { value: RangeKey; label: string }[] = [
  { value: "30d", label: "30 天" },
  { value: "90d", label: "3 个月" },
  { value: "1y", label: "一年" },
];
const DAY = 86_400_000;

function MetricCard({
  type,
  all,
  start,
  end,
  now,
  onRecord,
  onEdit,
}: {
  type: MetricType;
  all: Measurement[];
  start: number;
  end: number;
  now: number;
  onRecord: () => void;
  onEdit: (m: Measurement) => void;
}) {
  const { deleteMeasurement, addMeasurement } = useStore();
  const toast = useToast();
  const def = METRICS[type];
  const [view, setView] = useState<"chart" | "table">("chart");
  const inRange = all.filter((m) => {
    const t = new Date(m.at).getTime();
    return t >= start && t <= end;
  });
  const latest = all[all.length - 1];
  const out = latest ? isOutOfRange(latest) : null;
  const glucose = type === "fbg" || type === "ppg";

  const points: TrendPoint[] = inRange.map((m) => ({
    id: m.id,
    t: new Date(m.at).getTime(),
    at: m.at,
    v: m.value,
    v2: m.value2,
    note: m.note,
    flag: glucose && m.value < GLUCOSE_LOW ? "low" : null,
  }));

  const remove = (m: Measurement) => {
    const { id: _id, ...rest } = m;
    void _id;
    deleteMeasurement(m.id);
    toast.show(`已删除 ${formatValue(m)}`, "neutral", { label: "撤销", onClick: () => addMeasurement(rest) });
  };

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-ink">{def.label}</h2>
          {def.targetText && <p className="mt-0.5 text-base text-ink-2">{def.targetText}</p>}
        </div>
        <Button size="sm" variant="soft" className="shrink-0" onClick={onRecord}>
          <Plus className="h-5 w-5" />
          记一个
        </Button>
      </div>

      {latest ? (
        <p className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[2rem] leading-none font-semibold tracking-tight text-ink tabular-nums">{formatValue(latest)}</span>
          <span className="text-base text-ink-2">{def.unit}</span>
          {def.target &&
            (out ? (
              <Badge tone={out === "low" ? "danger" : "warn"}>{out === "low" ? "低于一般范围" : "高于一般范围"}</Badge>
            ) : (
              <Badge tone="good">在一般范围内</Badge>
            ))}
          <span className="text-base text-ink-2">{relativeTime(latest.at, now)}</span>
        </p>
      ) : (
        <p className="mt-3 text-lg text-ink-2">还没有记录。</p>
      )}

      {all.length > 0 && (
        <div className="mt-4">
          {inRange.length === 0 ? (
            <p className="rounded-2xl bg-surface-2 px-4 py-6 text-center text-lg text-ink-2">这段时间没有记录，把上面的时间调长一点看看。</p>
          ) : view === "chart" ? (
            <TrendChart
              points={points}
              unit={def.unit}
              decimals={def.decimals}
              start={start}
              end={end}
              band={def.target}
              dual={type === "bp" ? { first: "高压", second: "低压" } : undefined}
              showTime={type === "ppg"}
              ariaLabel={`${def.label}的变化，共 ${inRange.length} 条记录`}
            />
          ) : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {[...inRange].reverse().map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2">
                  <span className="w-16 shrink-0 text-lg font-semibold text-ink tabular-nums">{formatValue(m)}</span>
                  <span className="min-w-0 flex-1 text-base text-ink-2">
                    {fmtDate(m.at, { year: true, time: true })}
                    {m.note ? ` · ${m.note}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => onEdit(m)}
                    aria-label={`改 ${fmtDate(m.at)} 的 ${formatValue(m)}`}
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-2 transition hover:bg-brand-50 hover:text-brand-700",
                      focusRing,
                    )}
                  >
                    <Pencil className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(m)}
                    aria-label={`删除 ${fmtDate(m.at)} 的 ${formatValue(m)}`}
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-2 transition hover:bg-danger-bg hover:text-danger",
                      focusRing,
                    )}
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <span className="text-base whitespace-nowrap text-ink-2">
              这段时间 {inRange.length} 条，一共 {all.length} 条
            </span>
            <div className="ml-auto inline-flex shrink-0 rounded-xl bg-surface-2 p-1" role="radiogroup" aria-label="显示方式">
              {(
                [
                  { v: "chart", label: "图", Icon: ChartLine },
                  { v: "table", label: "改 / 删", Icon: Table2 },
                ] as const
              ).map(({ v, label, Icon }) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={view === v}
                  onClick={() => setView(v)}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3.5 text-base font-medium whitespace-nowrap transition",
                    focusRing,
                    view === v ? "bg-surface text-ink shadow-pill" : "text-ink-2 hover:text-ink",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function MetricsPage() {
  const { state, updateSettings } = useStore();
  const now = useNow();
  const tracked = state.settings.trackedMetrics;
  const oldest = useMemo(
    () => state.measurements.reduce((min, m) => Math.min(min, new Date(m.at).getTime()), Infinity),
    [state.measurements],
  );
  const [range, setRange] = useState<RangeKey>(() => (Number.isFinite(oldest) && Date.now() - oldest > 100 * DAY ? "1y" : "90d"));
  const [recording, setRecording] = useState<{ type?: MetricType; editing?: Measurement } | null>(null);
  const insights = useMemo(() => detectInsights(state.measurements, now), [state.measurements, now]);
  const conclusion = plainConclusion(state.measurements, now);

  const visible = METRIC_ORDER.filter((t) => tracked.includes(t) || state.measurements.some((m) => m.type === t));
  const start = range === "30d" ? now - 30 * DAY : range === "90d" ? now - 90 * DAY : now - 365 * DAY;
  // `now` only ticks once a minute, so a reading saved a moment ago can be "later than now". Keep it in range.
  const end = state.measurements.reduce((max, m) => Math.max(max, new Date(m.at).getTime()), now);

  const toggle = (t: MetricType) =>
    updateSettings({ trackedMetrics: tracked.includes(t) ? tracked.filter((x) => x !== t) : [...tracked, t] });

  const chooser = (
    <Card className="p-5">
      <SectionTitle>要记哪些</SectionTitle>
      <p className="mb-3 text-base leading-relaxed text-ink-2">点亮的会出现在首页，每天只问你一个数。</p>
      <div className="flex flex-wrap gap-2">
        {METRIC_ORDER.map((t) => {
          const on = tracked.includes(t);
          return (
            <button
              key={t}
              type="button"
              role="switch"
              aria-checked={on}
              onClick={() => toggle(t)}
              className={cn(
                "min-h-12 rounded-full border-2 px-4 text-lg transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200",
                on ? "border-brand-500 bg-brand-50 font-medium text-brand-800" : "border-line-strong bg-surface text-ink-2 shadow-edge hover:bg-surface-2",
              )}
            >
              {METRICS[t].label}
            </button>
          );
        })}
      </div>
    </Card>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ href: "/me", label: "我的档案" }}
        title="健康指标"
        sub={conclusion || "血糖、血压、体重都记在这里，复诊时一起给医生看。"}
      />

      {visible.length === 0 ? (
        chooser
      ) : (
        <>
          <Button size="lg" onClick={() => setRecording({})} className="w-full">
            <Plus className="h-6 w-6" />
            记一个数
          </Button>
          <Segmented options={RANGES} value={range} onChange={setRange} label="看多长时间" className="flex w-full" />

          {insights.length > 0 && (
            <Card className="p-5">
              <SectionTitle>医伴看到的</SectionTitle>
              <InsightList insights={insights} />
            </Card>
          )}

          {visible.map((t) => (
            <MetricCard
              key={t}
              type={t}
              all={measurementsOf(state.measurements, t)}
              start={start}
              end={end}
              now={now}
              onRecord={() => setRecording({ type: t })}
              onEdit={(m) => setRecording({ editing: m })}
            />
          ))}

          {chooser}
          <p className="text-center text-base leading-relaxed text-ink-2">这里说的范围是一般的标准，你自己的目标听医生的。</p>
        </>
      )}

      <RecordMetricModal open={recording != null} defaultType={recording?.type} editing={recording?.editing} onClose={() => setRecording(null)} />
    </div>
  );
}
