"use client";

import { useId, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconTile } from "@/components/ui";

/*
 * 疼痛定位：点一下身体图告诉医伴哪里疼。正面、背面各一张，点膝、肩、腹部、腰背时再放大成细分图。
 * 点完调用 onPick("右膝内侧") 这样的规范名称。左右都按患者自己的身体说：正面图上，患者的右边在画面左边。
 */

type Side = "右" | "左";
type Detail = { kind: "knee" | "shoulder"; side: Side } | { kind: "belly" } | { kind: "back" };

interface Zone {
  /** 规范名称，点了就是它（有细分图的点了先放大） */
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 圆角 */
  r?: number;
  detail?: Detail;
}

/** 正面：患者的右边画在左边 */
const FRONT: Zone[] = [
  { name: "头", x: 76, y: 4, w: 48, h: 53, r: 24 },
  { name: "颈部", x: 82, y: 57, w: 36, h: 26, r: 6 },
  { name: "右肩", x: 36, y: 82, w: 32, h: 30, r: 12, detail: { kind: "shoulder", side: "右" } },
  { name: "左肩", x: 132, y: 82, w: 32, h: 30, r: 12, detail: { kind: "shoulder", side: "左" } },
  { name: "胸部", x: 68, y: 82, w: 64, h: 48, r: 8 },
  { name: "上腹", x: 68, y: 130, w: 64, h: 40, r: 4, detail: { kind: "belly" } },
  { name: "下腹", x: 68, y: 170, w: 64, h: 44, r: 8, detail: { kind: "belly" } },
  { name: "右上臂", x: 36, y: 112, w: 28, h: 48, r: 10 },
  { name: "左上臂", x: 136, y: 112, w: 28, h: 48, r: 10 },
  { name: "右肘", x: 34, y: 160, w: 28, h: 28, r: 12 },
  { name: "左肘", x: 138, y: 160, w: 28, h: 28, r: 12 },
  { name: "右前臂和手", x: 30, y: 188, w: 30, h: 72, r: 12 },
  { name: "左前臂和手", x: 140, y: 188, w: 30, h: 72, r: 12 },
  { name: "右大腿", x: 68, y: 214, w: 31, h: 72, r: 10 },
  { name: "左大腿", x: 101, y: 214, w: 31, h: 72, r: 10 },
  { name: "右膝", x: 68, y: 286, w: 31, h: 32, r: 14, detail: { kind: "knee", side: "右" } },
  { name: "左膝", x: 101, y: 286, w: 31, h: 32, r: 14, detail: { kind: "knee", side: "左" } },
  { name: "右小腿", x: 70, y: 318, w: 28, h: 50, r: 10 },
  { name: "左小腿", x: 102, y: 318, w: 28, h: 50, r: 10 },
  { name: "右脚踝和脚", x: 64, y: 368, w: 34, h: 28, r: 10 },
  { name: "左脚踝和脚", x: 102, y: 368, w: 34, h: 28, r: 10 },
];

/** 背面：患者的左边画在左边 */
const BACK: Zone[] = [
  { name: "后脑", x: 76, y: 4, w: 48, h: 53, r: 24 },
  { name: "后颈", x: 82, y: 57, w: 36, h: 26, r: 6 },
  { name: "左肩", x: 36, y: 82, w: 32, h: 30, r: 12, detail: { kind: "shoulder", side: "左" } },
  { name: "右肩", x: 132, y: 82, w: 32, h: 30, r: 12, detail: { kind: "shoulder", side: "右" } },
  { name: "上背", x: 68, y: 82, w: 64, h: 62, r: 8, detail: { kind: "back" } },
  { name: "腰", x: 68, y: 144, w: 64, h: 42, r: 4, detail: { kind: "back" } },
  { name: "臀部", x: 68, y: 186, w: 64, h: 40, r: 10 },
  { name: "左上臂后侧", x: 36, y: 112, w: 28, h: 48, r: 10 },
  { name: "右上臂后侧", x: 136, y: 112, w: 28, h: 48, r: 10 },
  { name: "左肘后面", x: 34, y: 160, w: 28, h: 28, r: 12 },
  { name: "右肘后面", x: 138, y: 160, w: 28, h: 28, r: 12 },
  { name: "左手背和前臂", x: 30, y: 188, w: 30, h: 72, r: 12 },
  { name: "右手背和前臂", x: 140, y: 188, w: 30, h: 72, r: 12 },
  { name: "左大腿后侧", x: 68, y: 226, w: 31, h: 60, r: 10 },
  { name: "右大腿后侧", x: 101, y: 226, w: 31, h: 60, r: 10 },
  { name: "左膝", x: 68, y: 286, w: 31, h: 32, r: 14, detail: { kind: "knee", side: "左" } },
  { name: "右膝", x: 101, y: 286, w: 31, h: 32, r: 14, detail: { kind: "knee", side: "右" } },
  { name: "左小腿肚", x: 70, y: 318, w: 28, h: 50, r: 10 },
  { name: "右小腿肚", x: 102, y: 318, w: 28, h: 50, r: 10 },
  { name: "左脚跟", x: 64, y: 368, w: 34, h: 28, r: 10 },
  { name: "右脚跟", x: 102, y: 368, w: 34, h: 28, r: 10 },
];

/** 细分图：一块块大格子，按身上的位置排 */
function detailOf(d: Detail): { title: string; cols: number; zones: (string | null)[]; whole: string } {
  switch (d.kind) {
    case "knee":
      // 正面看右膝：外侧在画面左边，内侧在右边
      return {
        title: `${d.side}膝，从正面看`,
        cols: 3,
        zones: [null, `${d.side}膝前面（膝盖骨）`, null, d.side === "右" ? `${d.side}膝外侧` : `${d.side}膝内侧`, `${d.side}膝正中`, d.side === "右" ? `${d.side}膝内侧` : `${d.side}膝外侧`, null, `${d.side}膝后面（腘窝）`, null],
        whole: `${d.side}膝`,
      };
    case "shoulder":
      return {
        title: `${d.side}肩`,
        cols: 3,
        zones: [null, `${d.side}肩顶`, null, d.side === "右" ? `${d.side}肩外侧` : `${d.side}肩前面`, `${d.side}肩关节`, d.side === "右" ? `${d.side}肩前面` : `${d.side}肩外侧`, null, `${d.side}肩后面`, null],
        whole: `${d.side}肩`,
      };
    case "belly":
      // 患者的右边在画面左边
      return {
        title: "肚子，从正面看",
        cols: 3,
        zones: ["右上腹", "上腹正中（心窝）", "左上腹", "右侧腹", "肚脐周围", "左侧腹", "右下腹", "下腹正中（小腹）", "左下腹"],
        whole: "整个肚子",
      };
    case "back":
      // 背面：患者的左边在画面左边
      return {
        title: "后背和腰，从背后看",
        cols: 3,
        zones: ["左上背", "上背正中", "右上背", "左腰", "腰正中", "右腰", "左侧臀部", "尾骨附近", "右侧臀部"],
        whole: "整个后背",
      };
  }
}

/* the figure: soft brand-tinted blocks, lit from above like the tiles of an app icon; a block fills in under the finger */
function Figure({ zones, onZone }: { zones: Zone[]; onZone: (z: Zone) => void }) {
  const id = useId();
  return (
    <svg viewBox="0 0 200 400" className="mx-auto block h-auto w-full max-w-[280px]" role="group" aria-label="身体图">
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          {/* the theme's own tints (a CSS variable only works in style, not in the attribute) */}
          <stop style={{ stopColor: "var(--color-surface)" }} />
          <stop offset="1" style={{ stopColor: "var(--color-brand-100)" }} />
        </linearGradient>
        <filter id={`${id}-shadow`} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" style={{ floodColor: "var(--color-ink)", floodOpacity: 0.12 }} />
        </filter>
      </defs>
      {zones.map((z) => (
        <g
          key={z.name + z.x}
          role="button"
          tabIndex={0}
          aria-label={z.name}
          className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-brand-600 [&:focus-visible>rect]:stroke-[2.5] [&:hover>rect]:fill-brand-200 [&:hover>rect]:stroke-brand-500 [&:active>rect]:fill-brand-300"
          onClick={() => onZone(z)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onZone(z);
            }
          }}
        >
          <rect
            x={z.x + 1}
            y={z.y + 1}
            width={z.w - 2}
            height={z.h - 2}
            rx={z.r ?? 6}
            fill={`url(#${id}-fill)`}
            filter={`url(#${id}-shadow)`}
            className="stroke-brand-300/80 transition-[fill,stroke] duration-200"
            strokeWidth={1}
          />
          <title>{z.name}</title>
        </g>
      ))}
    </svg>
  );
}

const panel = "material rounded-card border border-line/80 bg-surface p-5";
/** one block of the close-up grid, and the two ways out under it */
const tile =
  "press material min-h-16 rounded-2xl border border-line/70 px-2 py-2 text-lg leading-snug font-medium text-brand-800 transition duration-200 hover:border-brand-200 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200";

export function BodyMap({ onPick }: { onPick: (area: string) => void }) {
  const [view, setView] = useState<"front" | "back">("front");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const pick = (name: string) => {
    if (picked) return;
    setPicked(name);
    onPick(name);
  };
  const zone = (z: Zone) => (z.detail ? setDetail(z.detail) : pick(z.name));

  if (picked) {
    return (
      <div className={cn(panel, "flex animate-pop items-center gap-3 text-lg text-ink")}>
        <IconTile tone="good">
          <Check />
        </IconTile>
        <span>
          你点的是：<span className="font-semibold text-brand-700">{picked}</span>
        </span>
      </div>
    );
  }

  if (detail) {
    const d = detailOf(detail);
    return (
      <div className={panel}>
        <p className="t-heading text-ink">{d.title}：具体是哪一块？</p>
        <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${d.cols}, minmax(0, 1fr))` }}>
          {d.zones.map((name, i) =>
            name ? (
              <button
                key={name}
                type="button"
                onClick={() => pick(name)}
                className={tile}
              >
                {name.replace(/^(右膝|左膝|右肩|左肩)/, "")}
              </button>
            ) : (
              <span key={i} aria-hidden />
            ),
          )}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 border-t border-line pt-4">
          <button
            type="button"
            onClick={() => pick(d.whole)}
            className="press min-h-13 rounded-full border-[1.5px] border-brand-600 bg-surface px-3 text-lg font-medium text-brand-800 shadow-edge transition duration-200 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
          >
            说不清，就是{d.whole}
          </button>
          <button
            type="button"
            onClick={() => setDetail(null)}
            className="press min-h-13 rounded-full px-3 text-lg font-medium text-ink-2 transition duration-200 hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
          >
            返回全身图
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={panel}>
      <div className="grid grid-cols-2 gap-1 rounded-[18px] bg-surface-3/80 p-1" role="tablist" aria-label="正面或背面">
        {(["front", "back"] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={cn(
              "min-h-12 rounded-[14px] px-4 text-lg font-medium whitespace-nowrap transition duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200",
              view === v ? "bg-surface text-ink shadow-pill" : "text-ink-2 hover:text-ink",
            )}
          >
            {v === "front" ? "正面" : "背面"}
          </button>
        ))}
      </div>
      <p className="t-heading mt-5 text-center text-ink">点一下疼的地方</p>
      <div className="relative mt-3">
        <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-between px-1 text-lg font-semibold text-ink-3" aria-hidden>
          <span>{view === "front" ? "右" : "左"}</span>
          <span>{view === "front" ? "左" : "右"}</span>
        </div>
        <Figure zones={view === "front" ? FRONT : BACK} onZone={zone} />
      </div>
    </div>
  );
}
