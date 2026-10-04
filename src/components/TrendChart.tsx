"use client";

import { useEffect, useRef, useState } from "react";
import { fmtDate } from "@/lib/utils";
import { L } from "@/lib/lang";

export interface TrendPoint {
  id: string;
  t: number;
  at: string;
  v: number;
  /** second series value (e.g. diastolic pressure) */
  v2?: number | null;
  note?: string;
  /** an out-of-range reading that deserves its own mark and label */
  flag?: "low" | null;
}

interface Props {
  points: TrendPoint[];
  unit: string;
  decimals: number;
  start: number;
  end: number;
  /** General reference range: both bounds draw a band, a single upper bound draws a line. */
  band?: { low?: number; high?: number };
  /** Labels for the two series when `v2` is used. */
  dual?: { first: string; second: string };
  height?: number;
  showTime?: boolean;
  /** Overrides the date line of the tooltip, e.g. for monthly averages. */
  dateLabel?: (p: TrendPoint) => string;
  ariaLabel: string;
  className?: string;
}

const DAY = 86_400_000;
const SERIES_1 = "var(--color-brand-600)";
const SERIES_2 = "var(--color-series-2)";

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function timeTicks(start: number, end: number): { t: number; label: string }[] {
  const span = end - start;
  const out: { t: number; label: string }[] = [];
  if (span > 100 * DAY) {
    const d = new Date(start);
    let cur = new Date(d.getFullYear(), d.getMonth() + (d.getDate() > 1 ? 1 : 0), 1);
    let first = true;
    while (cur.getTime() <= end) {
      const m = cur.getMonth() + 1;
      out.push({
        t: cur.getTime(),
        label:
          first || m === 1
            ? L(`${String(cur.getFullYear()).slice(2)}年${m}月`, `${MONTHS_EN[m - 1]} '${String(cur.getFullYear()).slice(2)}`)
            : L(`${m}月`, MONTHS_EN[m - 1]),
      });
      first = false;
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    return out;
  }
  const stepDays = span > 45 * DAY ? 14 : span > 16 * DAY ? 7 : 2;
  const s = new Date(start);
  let cur = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1).getTime();
  for (; cur <= end; cur += stepDays * DAY) {
    const d = new Date(cur);
    out.push({ t: cur, label: L(`${d.getMonth() + 1}月${d.getDate()}日`, `${MONTHS_EN[d.getMonth()]} ${d.getDate()}`) });
  }
  return out;
}

export function TrendChart({
  points,
  unit,
  decimals,
  start,
  end,
  band,
  dual,
  height = 220,
  showTime = false,
  dateLabel,
  ariaLabel,
  className,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((list) => {
      for (const en of list) setWidth(en.contentRect.width);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const PAD = { l: 48, r: dual ? 76 : 56, t: 18, b: 40 };
  const plotW = Math.max(0, width - PAD.l - PAD.r);
  const plotH = height - PAD.t - PAD.b;

  const values = points.flatMap((p) => (dual && p.v2 != null ? [p.v, p.v2] : [p.v]));
  if (band?.low != null) values.push(band.low);
  if (band?.high != null) values.push(band.high);
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 1;
  const padY = (hi - lo || 1) * 0.08;
  // as many horizontal guides as the height allows, so the 17px labels never touch
  const ticks = niceTicks(lo - padY, hi + padY, Math.max(2, Math.min(4, Math.floor(plotH / 36))));
  const yMin = ticks[0];
  // if the rounding still left them tight, every other guide carries a number
  const labelEvery = plotH / Math.max(ticks.length - 1, 1) < 30 ? 2 : 1;
  const yMax = ticks[ticks.length - 1];
  const tickDecimals = ticks.some((v) => !Number.isInteger(v)) ? 1 : 0;

  const span = Math.max(end - start, 1);
  const x = (t: number) => PAD.l + ((t - start) / span) * plotW;
  const y = (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * plotH;
  const path = (get: (p: TrendPoint) => number | null | undefined) =>
    points
      .filter((p) => get(p) != null)
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(get(p) as number).toFixed(1)}`)
      .join(" ");

  // keep x labels at least ~64px apart
  const allTicks = timeTicks(start, end);
  const keepEvery = Math.max(1, Math.ceil((allTicks.length * 96) / Math.max(plotW, 1)));
  const xTicks = allTicks.filter((_, i) => i % keepEvery === 0);

  const showMarkers = points.length <= 40;
  const last = points[points.length - 1];
  const act = active != null ? points[active] : null;
  const fmt = (v: number) => v.toFixed(decimals);

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left + PAD.l;
    let best = 0;
    let bd = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(x(p.t) - px);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setActive(best);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (!points.length) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setActive((a) => (a == null ? 0 : Math.min(points.length - 1, a + 1)));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setActive((a) => (a == null ? points.length - 1 : Math.max(0, a - 1)));
    } else if (e.key === "Escape") setActive(null);
  };

  const bandTop = band?.high != null ? Math.max(y(band.high), PAD.t) : PAD.t;
  const bandBottom = band?.low != null ? Math.min(y(band.low), height - PAD.b) : height - PAD.b;

  return (
    <div className={className}>
      {dual && (
        // the legend: a short line in each series' colour, the words in ink
        <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-base font-medium text-ink-2">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="h-0.5 w-6 rounded-full" style={{ background: SERIES_1 }} />
            {dual.first}
          </span>
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="h-0.5 w-6 rounded-full" style={{ background: SERIES_2 }} />
            {dual.second}
          </span>
        </div>
      )}
      <div
        ref={wrapRef}
        className="relative rounded-2xl outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
        tabIndex={0}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
        aria-label={L(`${ariaLabel}，使用左右方向键逐条查看`, `${ariaLabel}. Use the left and right arrow keys to go through it.`)}
      >
        {width > 0 && points.length > 0 && (
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            style={{ maxWidth: "100%", height: "auto" }}
            role="img"
            aria-label={ariaLabel}
          >
            {band?.low != null && band?.high != null && bandBottom - bandTop > 2 && (
              <>
                <rect x={PAD.l} y={bandTop} width={plotW} height={bandBottom - bandTop} rx={4} fill="var(--color-brand-50)" />
                {/* the band's name sits at its foot, where readings seldom are, out of the line's way */}
                {bandBottom - bandTop >= 24 && (
                  <text x={PAD.l + 8} y={bandBottom - 8} fontSize={17} fill="var(--color-ink-2)">
                    {L("一般范围", "Usual range")}
                  </text>
                )}
              </>
            )}
            {ticks.map((v, ti) => (
              <g key={v}>
                <line
                  x1={PAD.l}
                  x2={width - PAD.r}
                  y1={y(v)}
                  y2={y(v)}
                  stroke={v === ticks[0] ? "var(--color-line-strong)" : "var(--color-line)"}
                  strokeWidth={1}
                  strokeDasharray={v === ticks[0] ? undefined : "3 4"}
                  shapeRendering="crispEdges"
                />
                {ti % labelEvery === 0 && (
                  <text
                    x={PAD.l - 10}
                    y={y(v) + 6}
                    textAnchor="end"
                    fontSize={17}
                    fill="var(--color-ink-2)"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {v.toFixed(tickDecimals)}
                  </text>
                )}
              </g>
            ))}
            {band?.high != null && band?.low == null && (
              <>
                <line
                  x1={PAD.l}
                  x2={width - PAD.r}
                  y1={y(band.high)}
                  y2={y(band.high)}
                  stroke="var(--color-brand-600)"
                  strokeOpacity={0.45}
                  strokeWidth={1}
                  strokeDasharray="6 4"
                />
                <text x={PAD.l + 8} y={y(band.high) - 7} fontSize={17} fill="var(--color-ink-2)">
                  {L(`一般低于 ${band.high}`, `Usually below ${band.high}`)}
                </text>
              </>
            )}
            {xTicks.map((tk) => (
              <text key={tk.t} x={x(tk.t)} y={height - 10} textAnchor="middle" fontSize={17} fill="var(--color-ink-2)">
                {tk.label}
              </text>
            ))}

            {points.length > 1 && (
              <path d={path((p) => p.v)} fill="none" stroke={SERIES_1} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            )}
            {dual && points.length > 1 && (
              <path d={path((p) => p.v2)} fill="none" stroke={SERIES_2} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            )}

            {act && (
              <line
                x1={x(act.t)}
                x2={x(act.t)}
                y1={PAD.t}
                y2={height - PAD.b}
                stroke="var(--color-line-strong)"
                strokeWidth={1}
                strokeDasharray="2 3"
              />
            )}

            {points.map((p, i) => {
              const on = active === i;
              if (!showMarkers && !on && !p.flag && i !== points.length - 1) return null;
              return (
                <g key={p.id}>
                  {/* a soft halo on the reading under the finger; a white ring keeps every marker apart from the line */}
                  {on && <circle cx={x(p.t)} cy={y(p.v)} r={11} fill={SERIES_1} fillOpacity={0.14} />}
                  <circle
                    cx={x(p.t)}
                    cy={y(p.v)}
                    r={on ? 5.5 : 4}
                    fill={p.flag === "low" ? "var(--color-danger)" : on ? SERIES_1 : "var(--color-surface)"}
                    stroke={p.flag === "low" ? "var(--color-surface)" : SERIES_1}
                    strokeWidth={2}
                  />
                  {dual && p.v2 != null && (
                    <>
                      {on && <circle cx={x(p.t)} cy={y(p.v2)} r={11} fill={SERIES_2} fillOpacity={0.14} />}
                      <circle
                        cx={x(p.t)}
                        cy={y(p.v2)}
                        r={on ? 5.5 : 4}
                        fill={on ? SERIES_2 : "var(--color-surface)"}
                        stroke={SERIES_2}
                        strokeWidth={2}
                      />
                    </>
                  )}
                  {p.flag === "low" && (
                    <text x={x(p.t)} y={y(p.v) + 22} textAnchor="middle" fontSize={17} fontWeight={600} fill="var(--color-ink)">
                      {L(`${fmt(p.v)} 低`, `${fmt(p.v)} low`)}
                    </text>
                  )}
                </g>
              );
            })}

            {last && !last.flag && (
              <text
                x={x(last.t) + 10}
                y={y(last.v) + 6}
                fontSize={17}
                fontWeight={600}
                fill="var(--color-ink)"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {fmt(last.v)}
              </text>
            )}
            {dual && last?.v2 != null && (
              <text
                x={x(last.t) + 10}
                y={y(last.v2) + 6}
                fontSize={17}
                fontWeight={600}
                fill="var(--color-ink)"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {fmt(last.v2)}
              </text>
            )}

            <rect
              x={PAD.l}
              y={PAD.t}
              width={plotW}
              height={plotH}
              fill="transparent"
              onPointerMove={onMove}
              onPointerLeave={() => setActive(null)}
            />
          </svg>
        )}
        {act && (
          <div
            className="glass pointer-events-none absolute z-10 w-56 animate-pop rounded-2xl border border-white/70 px-4 py-3 shadow-float"
            style={{
              left: Math.min(Math.max(x(act.t) - 112, 0), Math.max(width - 238, 0)),
              top: Math.max(y(act.v) - 120, 0),
            }}
          >
            {dual && act.v2 != null ? (
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className="h-0.5 w-3 rounded-full" style={{ background: SERIES_1 }} />
                  <span className="text-base font-semibold text-ink tabular">{fmt(act.v)}</span>
                  <span className="text-base text-ink-2">{dual.first}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className="h-0.5 w-3 rounded-full" style={{ background: SERIES_2 }} />
                  <span className="text-base font-semibold text-ink tabular">{fmt(act.v2)}</span>
                  <span className="text-base text-ink-2">{dual.second}</span>
                </div>
              </div>
            ) : (
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-semibold text-ink tabular">{fmt(act.v)}</span>
                <span className="text-base text-ink-2">{unit}</span>
                {act.flag === "low" && <span className="ml-1 text-base font-medium text-danger">{L("低血糖", "Low sugar")}</span>}
              </div>
            )}
            <div className="mt-0.5 text-base text-ink-2">
              {dateLabel ? dateLabel(act) : fmtDate(act.at, { year: true, time: showTime })}
            </div>
            {act.note && <div className="mt-1 line-clamp-3 text-base text-ink-2">{act.note}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
