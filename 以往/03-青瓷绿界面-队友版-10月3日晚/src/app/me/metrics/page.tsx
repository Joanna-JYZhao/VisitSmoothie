"use client";

import { useMemo, useState } from "react";
import { Activity, ChartLine, Check, Droplets, FlaskConical, HeartPulse, Pencil, Plus, Scale, Table2, Trash2 } from "lucide-react";
import type { Measurement, MetricType } from "@/lib/types";
import { useNow, useStore } from "@/lib/store";
import { GLUCOSE_LOW, METRICS, METRIC_ORDER, detectInsights, formatValue, isOutOfRange, measurementsOf, plainConclusion } from "@/lib/metrics";
import { cn, fmtDate, relativeTime } from "@/lib/utils";
import { InsightList } from "@/components/InsightList";
import { RecordMetricModal } from "@/components/RecordMetricModal";
import { useToast } from "@/components/Toast";
import { TrendChart, type TrendPoint } from "@/components/TrendChart";
import { Badge, Button, Card, IconTile, PageHeader, SectionTitle, Segmented, Stat, focusRing, type IconTone } from "@/components/ui";

type RangeKey = "30d" | "90d" | "1y";
const RANGES: { value: RangeKey; label: string }[] = [
  { value: "30d", label: "30 天" },
  { value: "90d", label: "3 个月" },
  { value: "1y", label: "一年" },
];
const DAY = 86_400_000;

/* one icon per kind of reading, the way Health tells its categories apart */
const METRIC_ICON: Record<MetricType, { icon: React.ReactNode; tone: IconTone }> = {
  fbg: { icon: <Droplets />, tone: "info" },
  ppg: { icon: <Droplets />, tone: "info" },
  hba1c: { icon: <FlaskConical />, tone: "brand" },
  weight: { icon: <Scale />, tone: "good" },
  bp: { icon: <HeartPulse />, tone: "danger" },
};

function MetricCard({
  type,
  all,
  start,
  end,
  now,
  onRecord,
  onEdit,
  className,
}: {
  type: MetricType;
  all: Measurement[];
  start: number;
  end: number;
  now: number;
  onRecord: () => void;
  onEdit: (m: Measurement) => void;
  className?: string;
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

  const { icon, tone } = METRIC_ICON[type];

  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3.5">
          <IconTile tone={tone} size="lg">
            {icon}
          </IconTile>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 className="t-heading text-ink">{def.label}</h2>
            {def.targetText && <p className="mt-0.5 text-base text-ink-2">{def.targetText}</p>}
          </div>
        </div>

        {/* the latest reading big and tabular, the way Health shows one; the way to add another beside it */}
        <div className="mt-6 flex items-end justify-between gap-4">
          {latest ? (
            <Stat value={formatValue(latest)} unit={def.unit} tone={out === "low" ? "danger" : out === "high" ? "warn" : "ink"} />
          ) : (
            <div className="flex min-w-0 items-center gap-3.5">
              <span aria-hidden="true" className="flex h-10 shrink-0 items-end gap-1 opacity-60">
                {[14, 22, 18, 28, 20].map((h, i) => (
                  <span key={i} className="w-1.5 rounded-full bg-line-strong" style={{ height: h }} />
                ))}
              </span>
              <p className="text-lg text-ink-2">还没有记录。</p>
            </div>
          )}
          <Button size="sm" variant="soft" className="press shrink-0" onClick={onRecord}>
            <Plus className="h-5 w-5" />
            记一个
          </Button>
        </div>
        {latest && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {def.target &&
              (out ? (
                <Badge tone={out === "low" ? "danger" : "warn"}>{out === "low" ? "低于一般范围" : "高于一般范围"}</Badge>
              ) : (
                <Badge tone="good">
                  <Check className="h-4 w-4" aria-hidden="true" />
                  在一般范围内
                </Badge>
              ))}
            <span className="text-base text-ink-2">{relativeTime(latest.at, now)}</span>
          </div>
        )}
      </div>

      {all.length > 0 && (
        <div className="border-t border-line px-5 pt-5 pb-5 sm:px-6">
          {inRange.length === 0 ? (
            <p className="t-body rounded-2xl bg-surface-2/70 px-5 py-8 text-center text-ink-2">这段时间没有记录，把上面的时间调长一点看看。</p>
          ) : view === "chart" ? (
            <div className="animate-fade-up">
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
            </div>
          ) : (
            <ul className="scroll-thin max-h-80 animate-fade-up divide-y divide-line overflow-y-auto rounded-2xl border border-line bg-surface">
              {[...inRange].reverse().map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2 pr-2 pl-4">
                  <span className="w-20 shrink-0 text-lg font-semibold text-ink tabular-nums">{formatValue(m)}</span>
                  <span className="min-w-0 flex-1 text-base text-ink-2">
                    {fmtDate(m.at, { year: true, time: true })}
                    {m.note ? ` · ${m.note}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => onEdit(m)}
                    aria-label={`改 ${fmtDate(m.at)} 的 ${formatValue(m)}`}
                    className={cn(
                      "press flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-2 transition hover:bg-brand-50 hover:text-brand-700",
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
                      "press flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-2 transition hover:bg-danger-bg hover:text-danger",
                      focusRing,
                    )}
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <span className="text-base whitespace-nowrap text-ink-2 tabular-nums">
              这段时间 {inRange.length} 条，一共 {all.length} 条
            </span>
            <div className="ml-auto inline-flex shrink-0 gap-1 rounded-[18px] bg-surface-3/80 p-1" role="radiogroup" aria-label="显示方式">
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
                    "inline-flex min-h-11 items-center gap-1.5 rounded-[14px] px-3.5 text-base font-medium whitespace-nowrap transition duration-200",
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

  // before anything is chosen it is the one card on the screen, the icon breathing over the choices;
  // with readings on the page the same choices sit quietly at the foot
  const hero = visible.length === 0;
  const chooser = (
    <Card tone={hero ? "raised" : "plain"} className={hero ? "animate-pop p-6 text-center sm:p-8" : "p-5 sm:p-6"}>
      {hero && (
        <IconTile size="xl" tone="solid" className="mx-auto mb-6 animate-breathe">
          <Activity />
        </IconTile>
      )}
      <h2 className="t-heading text-ink">要记哪些</h2>
      <p className={cn("t-body mt-1 mb-5 text-ink-2", hero && "mx-auto mb-6 max-w-sm")}>点亮的会出现在首页，每天只问你一个数。</p>
      <div className={cn("flex flex-wrap gap-2.5", hero && "justify-center")}>
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
                "press inline-flex min-h-12 items-center gap-1.5 rounded-full text-lg transition duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200",
                on
                  ? "bg-brand-50 pr-5 pl-3.5 font-medium text-brand-800 ring-[1.5px] ring-brand-600 ring-inset"
                  : "bg-surface px-5 text-ink-2 shadow-edge hover:bg-surface-2 hover:text-ink",
              )}
            >
              {on && <Check className="h-5 w-5" aria-hidden="true" />}
              {METRICS[t].label}
            </button>
          );
        })}
      </div>
    </Card>
  );

  return (
    <div className="space-y-8">
      <PageHeader
        back={{ href: "/me", label: "我的档案" }}
        title="健康指标"
        sub={conclusion || "血糖、血压、体重都记在这里，复诊时一起给医生看。"}
      />

      {hero ? (
        chooser
      ) : (
        <>
          <div className="rise-1 space-y-4">
            <Button size="lg" onClick={() => setRecording({})} className="press w-full">
              <Plus className="h-6 w-6" />
              记一个数
            </Button>
            <Segmented options={RANGES} value={range} onChange={setRange} label="看多长时间" className="flex w-full" />
          </div>

          {insights.length > 0 && (
            <Card className="rise-2 p-5 sm:p-6">
              <SectionTitle>医伴看到的</SectionTitle>
              <InsightList insights={insights} />
            </Card>
          )}

          <div className="space-y-6">
            {visible.map((t, i) => (
              <MetricCard
                key={t}
                type={t}
                all={measurementsOf(state.measurements, t)}
                start={start}
                end={end}
                now={now}
                onRecord={() => setRecording({ type: t })}
                onEdit={(m) => setRecording({ editing: m })}
                className={i < 3 ? `rise-${i + 2}` : undefined}
              />
            ))}
          </div>

          {chooser}
          <p className="t-body text-center text-ink-2">这里说的范围是一般的标准，你自己的目标听医生的。</p>
        </>
      )}

      <RecordMetricModal open={recording != null} defaultType={recording?.type} editing={recording?.editing} onClose={() => setRecording(null)} />
    </div>
  );
}
