"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, BookOpen, ChevronRight, ListChecks, MessageCircle, MessageCircleQuestion } from "lucide-react";
import { useNow, useStore } from "@/lib/store";
import { checkInQuestion, currentHint, isCheckInDue } from "@/lib/checkin";
import { TodoList } from "@/components/home/TodoList";
import { AskBox } from "@/components/home/AskBox";
import { IconTile, focusRing } from "@/components/ui";
import { GuideTour, TOUR_FLAG } from "@/components/GuideTour";
import { unsavedCards } from "@/lib/drafts";
import { cn } from "@/lib/utils";
import { L } from "@/lib/lang";

const ITEM_TONE = {
  red: { row: "bg-danger-bg", tile: "solidDanger" as const, Icon: AlertTriangle },
  warn: { row: "bg-warn-bg", tile: "warn" as const, Icon: AlertCircle },
  plain: { row: "bg-brand-50", tile: "brand" as const, Icon: MessageCircle },
};

/** The heading of each half: the accent tile and the name, the same on both. */
function HalfTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <IconTile tone="solid" size="sm">
        {icon}
      </IconTile>
      <h2 className="t-title text-ink">{children}</h2>
    </div>
  );
}

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
  if (unsavedCards(state.thread, state.episodes).length) items.push({ key: "unsaved", text: L("有一条记录还没保存，点这里处理", "One record isn't saved yet. Tap here."), href: "/pre", tone: "warn" });

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
  const stale =
    about != null && (about.status !== "active" || (about.visit != null && new Date(about.visit.recordedAt).getTime() >= new Date(triage!.at).getTime()));
  if (triage && triage.kind === "triage" && !stale) {
    items.push({
      key: "triage",
      text: `${triage.triage.title}${triage.triage.department ? ` · ${triage.triage.department}` : ""}：${triage.triage.note}`,
      tone: triage.triage.level === "emergency" ? "red" : "warn",
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      {/* demo button for public demo */}
      {state.demo !== "lin" && (
        <Link
          href="/demo/lin"
          className={cn(
            "animate-fade-up flex min-h-12 items-center gap-3 rounded-[1.1rem] bg-brand-50 px-4 py-3",
            "border border-brand-100 shadow-[0_0_0_0.5px_var(--color-line)]",
            "lift press hover:bg-brand-100 transition",
            focusRing
          )}
        >
          <IconTile tone="solid" size="sm" className="shrink-0">
            <BookOpen />
          </IconTile>
          <span className="t-heading flex-1 text-ink">{L("看看林叔的记录", "See Uncle Lin's records")}</span>
          <ChevronRight className="h-5 w-5 shrink-0 text-ink-3" aria-hidden="true" />
        </Link>
      )}

      {/* top half: what to do today, and when */}
      <section
        data-guide="todo"
        className="rise-1 flex max-h-[52dvh] min-h-0 flex-col overflow-hidden rounded-[1.1rem] bg-surface shadow-[0_0_0_0.5px_var(--color-line)]"
      >
        <div className="px-4 pt-4 pb-1">
          <HalfTitle icon={<ListChecks />}>{L("待办和提醒", "to do & tips")}</HalfTitle>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 pb-3">
          <TodoList now={now} />
          {items.length > 0 && (
            <ul className="mt-3 space-y-2">
              {items.map((it, i) => {
                const t = ITEM_TONE[it.tone ?? "plain"];
                const body = (
                  <span className={cn("flex items-start gap-3 rounded-xl px-3.5 py-3", t.row)}>
                    <IconTile tone={t.tile} size="sm" className="mt-0.5">
                      <t.Icon />
                    </IconTile>
                    <span className={cn("t-body min-w-0 flex-1 pt-0.5", it.tone === "red" ? "font-semibold text-danger" : "text-ink")}>{it.text}</span>
                    {it.href && <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-ink-3" aria-hidden="true" />}
                  </span>
                );
                return (
                  <li key={it.key} className="animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
                    {it.href ? (
                      <Link href={it.href} className={cn("lift press block rounded-xl", focusRing)}>
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
        </div>
      </section>

      {/* bottom half: ask anything; it grows into the whole screen once a question is being asked */}
      <section className="rise-2 flex flex-1 flex-col rounded-[1.1rem] bg-surface p-4 shadow-[0_0_0_0.5px_var(--color-line)]">
        <div className="mb-3">
          <HalfTitle icon={<MessageCircleQuestion />}>{L("问一问", "Ask AI")}</HalfTitle>
        </div>
        <AskBox now={now} />
      </section>
      {tourOpen && <GuideTour onFinish={finishTour} />}
    </div>
  );
}
