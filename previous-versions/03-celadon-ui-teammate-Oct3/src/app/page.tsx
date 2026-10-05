"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, Camera, ChevronRight, ListChecks, MessageCircle } from "lucide-react";
import { useNow, useStore } from "@/lib/store";
import { checkInQuestion, currentHint, isCheckInDue } from "@/lib/checkin";
import { TodoList } from "@/components/home/TodoList";
import { AskBox } from "@/components/home/AskBox";
import { IconTile, focusRing } from "@/components/ui";
import { GuideTour, TOUR_FLAG } from "@/components/GuideTour";
import { unsavedCards } from "@/lib/drafts";
import { cn } from "@/lib/utils";

/*
 * One door: a compact row — the app-icon tile on the left, the word and its one sentence beside it,
 * a quiet chevron at the end. It lifts to the hand and gives under the finger. Small enough that both
 * doors and a good part of the to-do list share the first screen of a phone.
 */
const doorCls =
  "lift press group jade-edge flex min-h-25 items-center gap-3.5 rounded-[20px] border border-line/70 px-4 py-3.5 text-left material sm:min-h-28 sm:gap-4 sm:px-5 sm:py-5 hover:border-brand-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200";
const iconCls = "flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] text-white transition-transform duration-300 ease-[cubic-bezier(0.34,1.3,0.64,1)] group-hover:scale-105";

const ITEM_TONE = {
  red: { row: "bg-danger-bg", tile: "solidDanger" as const, Icon: AlertTriangle },
  warn: { row: "bg-warn-bg", tile: "warn" as const, Icon: AlertCircle },
  plain: { row: "bg-surface-2", tile: "brand" as const, Icon: MessageCircle },
};

export default function HomePage() {
  const { state, updateSettings } = useStore();
  const now = useNow(60_000);
  const [tourOpen, setTourOpen] = useState(false);

  // 注册完第一次进首页：开始新手引导（只此一次，完成或跳过后记入 settings.tourDone）
  useEffect(() => {
    let flag = false;
    try {
      flag = Boolean(state.profile && !state.settings.tourDone && sessionStorage.getItem(TOUR_FLAG));
    } catch {
      /* no session storage */
    }
    if (!flag) return;
    const t = window.setTimeout(() => setTourOpen(true), 600); // 等首页卡片落位动画播完
    return () => window.clearTimeout(t);
  }, [state.profile, state.settings.tourDone]);

  const finishTour = () => {
    setTourOpen(false);
    updateSettings({ tourDone: true });
    try {
      sessionStorage.removeItem(TOUR_FLAG);
    } catch {
      /* no session storage */
    }
  };

  if (!state.profile) return null;

  const active = state.episodes.filter((e) => e.status === "active");
  const items: { key: string; text: string; href?: string; tone?: "warn" | "red" }[] = [];
  // a description or orders left unsaved in the conversation: first in the list
  if (unsavedCards(state.thread, state.episodes).length) items.push({ key: "unsaved", text: "有一条记录还没保存，点这里处理", href: "/pre", tone: "warn" });

  // what is due today: the daily question about each complaint
  for (const e of active) {
    if (isCheckInDue(e, state.settings, now)) items.push({ key: `q-${e.id}`, text: checkInQuestion(e, now), href: "/pre" });
    const hint = currentHint(e, now);
    if (hint) items.push({ key: `h-${e.id}`, text: `${e.title}：${hint.text}`, tone: hint.level === "urgent" ? "red" : "warn", href: "/pre" });
  }
  // the latest piece of advice from the conversation
  const triage = [...state.thread].reverse().find((t) => t.kind === "triage");
  // "建议去看医生" is stale once that complaint has been seen by a doctor, or is over
  const about = triage && triage.kind === "triage" ? state.episodes.find((e) => e.id === triage.episodeId) : null;
  const stale = about != null && (about.status !== "active" || (about.visit != null && new Date(about.visit.recordedAt).getTime() >= new Date(triage!.at).getTime()));
  if (triage && triage.kind === "triage" && !stale) {
    items.push({ key: "triage", text: `${triage.triage.title}${triage.triage.department ? ` · ${triage.triage.department}` : ""}：${triage.triage.note}`, tone: triage.triage.level === "emergency" ? "red" : "warn" });
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* the two doors: one compact row each, still the first things to move when the page opens */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
        <Link href="/pre" data-guide="pre" className={cn(doorCls, "rise-1")}>
          <span className={cn(iconCls, "tile-brand")}>
            <MessageCircle className="h-5 w-5" strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[1.5rem] leading-none font-bold tracking-[-0.03em] text-ink">pre</span>
            <span className="t-body mt-1 block text-ink-2">看医生之前：哪里不舒服，跟我说</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-ink-3 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
        <Link href="/post" data-guide="post" className={cn(doorCls, "rise-2")}>
          <span className={cn(iconCls, "tile-ink")}>
            <Camera className="h-5 w-5" strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[1.5rem] leading-none font-bold tracking-[-0.03em] text-ink">post</span>
            <span className="t-body mt-1 block text-ink-2">看完医生：把医嘱拍给我</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-ink-3 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      </div>

      <section data-guide="todo" className="rise-3 material-raised rounded-[28px] border border-line/70 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <IconTile tone="solid" size="lg">
            <ListChecks />
          </IconTile>
          <h2 className="t-title text-ink">to do &amp; tips</h2>
        </div>
        <TodoList now={now} />
        {items.length > 0 && (
          <ul className="mt-4 space-y-2">
            {items.map((it, i) => {
              const t = ITEM_TONE[it.tone ?? "plain"];
              const body = (
                <span className={cn("flex items-start gap-3 rounded-2xl px-3.5 py-3", t.row)}>
                  <IconTile tone={t.tile} size="md" className="mt-0.5">
                    <t.Icon />
                  </IconTile>
                  <span className={cn("t-body min-w-0 flex-1 pt-1", it.tone === "red" ? "font-semibold text-danger" : "text-ink")}>{it.text}</span>
                  {it.href && <ChevronRight className="mt-2 h-5 w-5 shrink-0 text-ink-3" aria-hidden="true" />}
                </span>
              );
              return (
                <li key={it.key} className="animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
                  {it.href ? (
                    <Link href={it.href} className={cn("lift press block rounded-2xl", focusRing)}>
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-5 border-t border-line pt-5">
          <AskBox now={now} />
        </div>
      </section>
      {tourOpen && <GuideTour onFinish={finishTour} />}
    </div>
  );
}
