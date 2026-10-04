"use client";

import Link from "next/link";
import { AlertCircle, AlertTriangle, ArrowRight, Camera, ChevronRight, ListChecks, MessageCircle } from "lucide-react";
import { useNow, useStore } from "@/lib/store";
import { checkInQuestion, currentHint, isCheckInDue } from "@/lib/checkin";
import { TodoList } from "@/components/home/TodoList";
import { AskBox } from "@/components/home/AskBox";
import { IconTile, focusRing } from "@/components/ui";
import { unsavedCards } from "@/lib/drafts";
import { cn } from "@/lib/utils";

/*
 * One door: a sheet of white lit from the corner, an app-icon tile resting on it, the word in display
 * type, one sentence. It lifts to the hand and gives under the finger; an arrow in the corner says it opens.
 */
const doorCls =
  "lift press group jade-edge relative flex min-h-64 flex-col items-center justify-center overflow-hidden rounded-[32px] border border-line/70 px-8 py-12 text-center material-raised sm:min-h-80 hover:border-brand-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200";
const iconCls = "relative flex h-24 w-24 items-center justify-center rounded-[28px] text-white transition-transform duration-500 ease-[cubic-bezier(0.34,1.3,0.64,1)] group-hover:scale-105 group-hover:-translate-y-1";

const ITEM_TONE = {
  red: { row: "bg-danger-bg", tile: "solidDanger" as const, Icon: AlertTriangle },
  warn: { row: "bg-warn-bg", tile: "warn" as const, Icon: AlertCircle },
  plain: { row: "bg-surface-2", tile: "brand" as const, Icon: MessageCircle },
};

export default function HomePage() {
  const { state } = useStore();
  const now = useNow(60_000);
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
    <div className="space-y-6 sm:space-y-8">
      {/* the two doors: big, calm, and the first things to move when the page opens */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
        <Link href="/pre" className={cn(doorCls, "rise-1")}>
          {/* the stage: a pool of light behind the tile, as on the welcome screen */}
          <span aria-hidden="true" className="pool -top-24 left-1/2 h-72 w-72 -translate-x-1/2" />
          <span className={cn(iconCls, "tile-brand")}>
            <MessageCircle className="h-12 w-12" strokeWidth={2} />
          </span>
          <span className="relative mt-7 text-[3.25rem] leading-none font-bold tracking-[-0.045em] text-ink sm:text-[3.75rem]">pre</span>
          <span className="t-lead relative mt-3 text-ink-2">看医生之前：哪里不舒服，跟我说</span>
          <ArrowRight className="absolute right-6 bottom-6 hidden h-6 w-6 text-brand-400 transition-transform duration-300 group-hover:translate-x-1 sm:block" aria-hidden="true" />
        </Link>
        <Link href="/post" className={cn(doorCls, "rise-2")}>
          {/* the stage: a pool of light behind the tile, as on the welcome screen */}
          <span aria-hidden="true" className="pool -top-24 left-1/2 h-72 w-72 -translate-x-1/2" />
          <span className={cn(iconCls, "tile-ink")}>
            <Camera className="h-12 w-12" strokeWidth={2} />
          </span>
          <span className="relative mt-7 text-[3.25rem] leading-none font-bold tracking-[-0.045em] text-ink sm:text-[3.75rem]">post</span>
          <span className="t-lead relative mt-3 text-ink-2">看完医生：把医嘱拍给我</span>
          <ArrowRight className="absolute right-6 bottom-6 hidden h-6 w-6 text-brand-400 transition-transform duration-300 group-hover:translate-x-1 sm:block" aria-hidden="true" />
        </Link>
      </div>

      <section className="rise-3 material-raised min-h-48 rounded-[32px] border border-line/70 p-5 sm:p-8">
        <div className="flex items-center gap-3.5">
          <IconTile tone="solid" size="lg">
            <ListChecks />
          </IconTile>
          <h2 className="t-title text-ink">to do &amp; tips</h2>
        </div>
        <TodoList now={now} />
        {items.length > 0 && (
          <ul className="mt-5 space-y-2.5">
            {items.map((it, i) => {
              const t = ITEM_TONE[it.tone ?? "plain"];
              const body = (
                <span className={cn("flex items-start gap-3.5 rounded-2xl px-4 py-3.5", t.row)}>
                  <IconTile tone={t.tile} size="md" className="mt-0.5">
                    <t.Icon />
                  </IconTile>
                  <span className={cn("t-body min-w-0 flex-1 pt-1.5", it.tone === "red" ? "font-semibold text-danger" : "text-ink")}>{it.text}</span>
                  {it.href && <ChevronRight className="mt-2.5 h-5 w-5 shrink-0 text-ink-3" aria-hidden="true" />}
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
        <div className="mt-7 border-t border-line pt-7">
          <AskBox now={now} />
        </div>
      </section>
    </div>
  );
}
