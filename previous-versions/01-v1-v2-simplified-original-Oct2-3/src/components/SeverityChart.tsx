"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChartLine, Table2 } from "lucide-react";
import type { Entry } from "@/lib/types";
import { cn, feelWord, fmtDate, severitySeries } from "@/lib/utils";

const PAD = { l: 14, r: 16, t: 16, b: 32 };
const H = 210;

export function SeverityChart({ entries, className }: { entries: Entry[]; className?: string }) {
  const points = useMemo(
    () =>
      severitySeries({ entries }).map((e) => ({
        id: e.id,
        t: new Date(e.at).getTime(),
        v: e.severity as number,
        note: e.note,
        at: e.at,
      })),
    [entries],
  );
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [view, setView] = useState<"chart" | "table">("chart");

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((list) => {
      for (const en of list) setWidth(en.contentRect.width);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [view]);

  const plotW = Math.max(0, width - PAD.l - PAD.r);
  const plotH = H - PAD.t - PAD.b;
  const t0 = points[0]?.t ?? 0;
  const t1 = points[points.length - 1]?.t ?? t0 + 1;
  const span = Math.max(t1 - t0, 1);
  const x = (t: number) => (points.length === 1 ? PAD.l + plotW / 2 : PAD.l + ((t - t0) / span) * plotW);
  const y = (v: number) => PAD.t + (1 - v / 10) * plotH;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const areaPath =
    points.length > 1 ? `${linePath} L${x(t1).toFixed(1)},${y(0).toFixed(1)} L${x(t0).toFixed(1)},${y(0).toFixed(1)} Z` : "";

  // X labels: always the first and last point; a middle one only when it has room on both sides.
  type Anchor = "start" | "middle" | "end";
  const xLabels: { i: number; anchor: Anchor }[] = [];
  if (points.length === 1) {
    xLabels.push({ i: 0, anchor: "middle" });
  } else if (points.length > 1) {
    xLabels.push({ i: 0, anchor: "start" });
    const MIN_GAP = 170;
    const cx = PAD.l + plotW / 2;
    let best = -1;
    let bd = Infinity;
    for (let i = 1; i < points.length - 1; i++) {
      const d = Math.abs(x(points[i].t) - cx);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best > 0) {
      const bx = x(points[best].t);
      if (bx - x(t0) >= MIN_GAP && x(t1) - bx >= MIN_GAP) xLabels.push({ i: best, anchor: "middle" });
    }
    xLabels.push({ i: points.length - 1, anchor: "end" });
  }

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
    } else if (e.key === "Escape") {
      setActive(null);
    }
  };

  const last = points[points.length - 1];
  const act = active != null ? points[active] : null;

  return (
    <div className={className}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-base text-ink-2">线越高越难受</p>
        <div className="inline-flex rounded-xl bg-surface-2 p-1" role="radiogroup" aria-label="显示方式">
          {(
            [
              { v: "chart", label: "图", Icon: ChartLine },
              { v: "table", label: "表", Icon: Table2 },
            ] as const
          ).map(({ v, label, Icon }) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              onClick={() => setView(v)}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3.5 text-base font-medium transition",
                view === v ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink",
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {!points.length ? (
        <p className="py-6 text-lg text-ink-2">还没有可以画成线的记录。</p>
      ) : view === "table" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-base">
            <thead>
              <tr className="border-b border-line text-left text-ink-2">
                <th className="py-2 pr-3 font-medium">时间</th>
                <th className="py-2 pr-3 font-medium">多难受</th>
                <th className="py-2 font-medium">记录</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.id} className="border-b border-line/70 align-top last:border-0">
                  <td className="py-2.5 pr-3 whitespace-nowrap text-ink-2 tabular-nums">{fmtDate(p.at, { time: true })}</td>
                  <td className="py-2.5 pr-3 font-medium whitespace-nowrap text-ink">{feelWord(p.v)}</td>
                  <td className="py-2.5 text-ink">{p.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          ref={wrapRef}
          className="relative outline-none focus-visible:ring-4 focus-visible:ring-brand-100 rounded-lg"
          tabIndex={0}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
          aria-label="难受程度变化图，用左右方向键逐条查看"
        >
          {width > 0 && (
            <svg width={width} height={H} role="img" aria-label={`共 ${points.length} 条记录，最近一次：${feelWord(last.v)}`}>
              {[0, 5, 10].map((v) => (
                <line key={v} x1={PAD.l} x2={width - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth={1} />
              ))}
              {xLabels.map(({ i, anchor }) => (
                <text key={i} x={x(points[i].t)} y={H - 8} textAnchor={anchor} fontSize={14} fill="var(--color-ink-2)">
                  {fmtDate(points[i].at, { time: true })}
                </text>
              ))}
              {areaPath && <path d={areaPath} fill="var(--color-brand-600)" opacity={0.1} />}
              {points.length > 1 && (
                <path
                  d={linePath}
                  fill="none"
                  stroke="var(--color-brand-600)"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              {act && (
                <line x1={x(act.t)} x2={x(act.t)} y1={PAD.t} y2={H - PAD.b} stroke="var(--color-ink-3)" strokeWidth={1} />
              )}
              {points.map((p, i) => (
                <circle
                  key={p.id}
                  cx={x(p.t)}
                  cy={y(p.v)}
                  r={active === i ? 5.5 : 4}
                  fill="var(--color-brand-600)"
                  stroke="var(--color-surface)"
                  strokeWidth={2}
                />
              ))}
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
              className="pointer-events-none absolute z-10 w-52 rounded-xl border border-line bg-surface p-3 shadow-float"
              style={{
                left: Math.min(Math.max(x(act.t) - 110, 0), Math.max(width - 221, 0)),
                top: Math.max(y(act.v) - 100, 0),
              }}
            >
              <div className="text-lg font-semibold text-ink">{feelWord(act.v)}</div>
              <div className="mt-0.5 text-[15px] text-ink-2">{fmtDate(act.at, { time: true })}</div>
              <div className="mt-1 line-clamp-3 text-[15px] text-ink">{act.note}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
