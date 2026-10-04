"use client";

import { useId, useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { L } from "@/lib/lang";
import { IconTile } from "@/components/ui";

/*
 * 疼痛定位：在身体图上点出哪里不舒服，可以点好几处。正面、背面各一张，点膝、肩、腹部、腰背时再放大成细分图。
 * 点「选好了」调用 onPick(["左膝内侧", "腰正中"]) 这样的规范名称。左右都按患者自己的身体说：正面图上，患者的右边在画面左边。
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

/*
 * English names, for what is shown only. What is picked (and sent on) is always the Chinese name
 * above, so the record and the assistant see the same words in either language.
 */
const NAME_EN: Record<string, string> = {
  头: "Head", 颈部: "Neck", 右肩: "Right shoulder", 左肩: "Left shoulder", 胸部: "Chest", 上腹: "Upper belly", 下腹: "Lower belly",
  右上臂: "Right upper arm", 左上臂: "Left upper arm", 右肘: "Right elbow", 左肘: "Left elbow",
  右前臂和手: "Right forearm and hand", 左前臂和手: "Left forearm and hand", 右大腿: "Right thigh", 左大腿: "Left thigh",
  右膝: "Right knee", 左膝: "Left knee", 右小腿: "Right lower leg", 左小腿: "Left lower leg",
  右脚踝和脚: "Right ankle and foot", 左脚踝和脚: "Left ankle and foot",
  后脑: "Back of head", 后颈: "Back of neck", 上背: "Upper back", 腰: "Lower back", 臀部: "Buttocks",
  左上臂后侧: "Back of left upper arm", 右上臂后侧: "Back of right upper arm", 左肘后面: "Back of left elbow", 右肘后面: "Back of right elbow",
  左手背和前臂: "Back of left hand and forearm", 右手背和前臂: "Back of right hand and forearm",
  左大腿后侧: "Back of left thigh", 右大腿后侧: "Back of right thigh", 左小腿肚: "Left calf", 右小腿肚: "Right calf", 左脚跟: "Left heel", 右脚跟: "Right heel",
  右上腹: "Upper right belly", "上腹正中（心窝）": "Upper middle (pit of the stomach)", 左上腹: "Upper left belly", 右侧腹: "Right side of belly",
  肚脐周围: "Around the belly button", 左侧腹: "Left side of belly", 右下腹: "Lower right belly", "下腹正中（小腹）": "Lower middle belly", 左下腹: "Lower left belly",
  整个肚子: "The whole belly", 左上背: "Upper left back", 上背正中: "Upper back, middle", 右上背: "Upper right back", 左腰: "Left lower back",
  腰正中: "Lower back, middle", 右腰: "Right lower back", 左侧臀部: "Left buttock", 尾骨附近: "Near the tailbone", 右侧臀部: "Right buttock", 整个后背: "The whole back",
};
const PART_EN: Record<string, string> = {
  "前面（膝盖骨）": "front (kneecap)", 外侧: "outer side", 内侧: "inner side", 正中: "middle", "后面（腘窝）": "back (behind the knee)",
  顶: "top", 前面: "front", 关节: "joint", 后面: "back",
};
/** The name to show: the Chinese name itself, or its English. */
function shownName(name: string): string {
  const m = /^(右|左)(膝|肩)(.+)$/.exec(name);
  const en = m ? `${m[1] === "右" ? "Right" : "Left"} ${m[2] === "膝" ? "knee" : "shoulder"}, ${PART_EN[m[3]] ?? m[3]}` : (NAME_EN[name] ?? name);
  return L(name, en);
}
/** The blocks of a close-up grid are narrow: short English names there (the full name is shown once picked). */
const TILE_EN: Record<string, string> = {
  "前面（膝盖骨）": "Kneecap", 外侧: "Outer side", 内侧: "Inner side", 正中: "Middle", "后面（腘窝）": "Back of knee",
  顶: "Top", 前面: "Front", 关节: "Joint", 后面: "Back",
  右上腹: "Upper right", "上腹正中（心窝）": "Upper middle", 左上腹: "Upper left", 右侧腹: "Right side", 肚脐周围: "Belly button",
  左侧腹: "Left side", 右下腹: "Lower right", "下腹正中（小腹）": "Lower middle", 左下腹: "Lower left",
  左上背: "Upper left", 上背正中: "Upper middle", 右上背: "Upper right", 左腰: "Left waist", 腰正中: "Middle waist", 右腰: "Right waist",
  左侧臀部: "Left buttock", 尾骨附近: "Tailbone", 右侧臀部: "Right buttock",
};
/** A block of the close-up grid: the part without the joint in front of it. */
function tileName(name: string): string {
  const part = name.replace(/^(右膝|左膝|右肩|左肩)/, "");
  return L(part, TILE_EN[part.replace(/^[膝肩]/, "")] ?? TILE_EN[part] ?? shownName(name));
}
function detailTitle(d: Detail): string {
  switch (d.kind) {
    case "knee":
      return L(`${d.side}膝，从正面看`, `${d.side === "右" ? "Right" : "Left"} knee, seen from the front`);
    case "shoulder":
      return L(`${d.side}肩`, `${d.side === "右" ? "Right" : "Left"} shoulder`);
    case "belly":
      return L("肚子，从正面看", "Belly, seen from the front");
    case "back":
      return L("后背和腰，从背后看", "Back, seen from behind");
  }
}

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

/** Is anything picked inside this block: the block itself, or a part of its close-up? */
function zoneHas(z: Zone, picked: string[]): boolean {
  if (picked.includes(z.name)) return true;
  if (!z.detail) return false;
  const d = detailOf(z.detail);
  return picked.some((p) => p === d.whole || d.zones.includes(p));
}

/* the figure: soft brand-tinted blocks, lit from above like the tiles of an app icon; a block fills in under the finger, and stays filled once picked */
function Figure({ zones, onZone, picked }: { zones: Zone[]; onZone: (z: Zone) => void; picked: string[] }) {
  const id = useId();
  return (
    <svg viewBox="0 0 200 400" className="mx-auto block h-auto w-full max-w-[280px]" role="group" aria-label={L("身体图", "Body map")}>
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
      {zones.map((z) => {
        const on = zoneHas(z, picked);
        return (
        <g
          key={z.name + z.x}
          role="button"
          tabIndex={0}
          aria-label={shownName(z.name)}
          aria-pressed={z.detail ? undefined : on}
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
            className={cn("transition-[fill,stroke] duration-200", on ? "fill-brand-400 stroke-brand-700" : "stroke-brand-300/80")}
            strokeWidth={on ? 2 : 1}
          />
          <title>{shownName(z.name)}</title>
        </g>
        );
      })}
    </svg>
  );
}

const panel = "material rounded-card border border-line/80 bg-surface p-5";
/** one block of the close-up grid, and the two ways out under it */
const tile =
  "press material min-h-16 rounded-2xl border border-line/70 px-2 py-2 text-lg leading-snug font-medium text-brand-800 transition duration-200 hover:border-brand-200 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200";

const tileOn = "border-brand-600 bg-brand-100 text-brand-800 ring-2 ring-brand-600/40";

/** What has been picked so far, each with a way to take it back, and the button that sends them. */
function Picked({ picked, onRemove, onDone }: { picked: string[]; onRemove: (name: string) => void; onDone: () => void }) {
  return (
    <div className="mt-5 border-t border-line pt-4">
      {picked.length > 0 ? (
        <div className="flex flex-wrap gap-2" aria-label={L("已经选的地方", "Places picked")}>
          {picked.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => onRemove(name)}
              aria-label={L(`去掉${name}`, `Remove ${shownName(name)}`)}
              className="press inline-flex min-h-11 items-center gap-1.5 rounded-full bg-brand-50 pr-3 pl-4 text-lg font-medium text-brand-800 transition hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
            >
              {shownName(name)}
              <X className="h-4 w-4 text-brand-600" />
            </button>
          ))}
        </div>
      ) : (
        <p className="text-base text-ink-2">{L("可以点好几个地方，点错了再点一下就去掉。", "You can tap several places. Tap again to take one off.")}</p>
      )}
      <button
        type="button"
        disabled={!picked.length}
        onClick={onDone}
        className="press mt-4 min-h-14 w-full rounded-full bg-linear-to-b from-brand-600 to-brand-700 px-6 text-xl font-semibold text-white shadow-btn transition duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {picked.length ? L(`选好了（${picked.length} 处）`, `Done (${picked.length})`) : L("选好了", "Done")}
      </button>
    </div>
  );
}

export function BodyMap({ onPick, prompt = L("点一下不舒服的地方", "Tap where it feels unwell") }: { onPick: (areas: string[]) => void; prompt?: string }) {
  const [view, setView] = useState<"front" | "back">("front");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [sent, setSent] = useState(false);

  const toggle = (name: string) => setPicked((p) => (p.includes(name) ? p.filter((x) => x !== name) : [...p, name]));
  const zone = (z: Zone) => (z.detail ? setDetail(z.detail) : toggle(z.name));
  const done = () => {
    if (sent || !picked.length) return;
    setSent(true);
    onPick(picked);
  };

  if (sent) {
    return (
      <div className={cn(panel, "flex animate-pop items-center gap-3 text-lg text-ink")}>
        <IconTile tone="good">
          <Check />
        </IconTile>
        <span>
          {L("你选的是：", "You picked: ")}<span className="font-semibold text-brand-700">{picked.map(shownName).join(L("、", ", "))}</span>
        </span>
      </div>
    );
  }

  if (detail) {
    const d = detailOf(detail);
    return (
      <div className={panel}>
        <p className="t-heading text-ink">{L(`${d.title}：具体是哪一块？可以选几块。`, `${detailTitle(detail)}: which part exactly? You can pick more than one.`)}</p>
        <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${d.cols}, minmax(0, 1fr))` }}>
          {d.zones.map((name, i) =>
            name ? (
              <button
                key={name}
                type="button"
                aria-pressed={picked.includes(name)}
                onClick={() => toggle(name)}
                className={cn(tile, picked.includes(name) && tileOn)}
              >
                {tileName(name)}
              </button>
            ) : (
              <span key={i} aria-hidden />
            ),
          )}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 border-t border-line pt-4">
          <button
            type="button"
            aria-pressed={picked.includes(d.whole)}
            onClick={() => toggle(d.whole)}
            className={cn(
              "press min-h-13 rounded-full border-[1.5px] border-brand-600 bg-surface px-3 text-lg font-medium text-brand-800 shadow-edge transition duration-200 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200",
              picked.includes(d.whole) && "bg-brand-100",
            )}
          >
            {L(`说不清，就是${d.whole}`, "Not sure, all of it")}
          </button>
          <button
            type="button"
            onClick={() => setDetail(null)}
            className="press min-h-13 rounded-full px-3 text-lg font-medium text-ink-2 transition duration-200 hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
          >
            {L("返回全身图", "Back to the whole body")}
          </button>
        </div>
        <Picked picked={picked} onRemove={toggle} onDone={done} />
      </div>
    );
  }

  return (
    <div className={panel}>
      <div className="grid grid-cols-2 gap-1 rounded-[18px] bg-surface-3/80 p-1" role="tablist" aria-label={L("正面或背面", "Front or back")}>
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
            {v === "front" ? L("正面", "Front") : L("背面", "Back")}
          </button>
        ))}
      </div>
      <p className="t-heading mt-5 text-center text-ink">{prompt}</p>
      <div className="relative mt-3">
        <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-between px-1 text-lg font-semibold text-ink-3" aria-hidden>
          <span>{view === "front" ? L("右", "Right") : L("左", "Left")}</span>
          <span>{view === "front" ? L("左", "Left") : L("右", "Right")}</span>
        </div>
        <Figure zones={view === "front" ? FRONT : BACK} onZone={zone} picked={picked} />
      </div>
      <Picked picked={picked} onRemove={toggle} onDone={done} />
    </div>
  );
}
