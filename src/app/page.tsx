"use client";

import Link from "next/link";
import { Camera, MessageCircle } from "lucide-react";
import { useNow, useStore } from "@/lib/store";
import { checkInQuestion, currentHint, isCheckInDue } from "@/lib/checkin";
import { TodoList } from "@/components/home/TodoList";
import { AskBox } from "@/components/home/AskBox";
import { unsavedCards } from "@/lib/drafts";

/**
 * VisitSmoothie, after the wireframe the person drew: two big boxes (pre, post) and a wide
 * "to do & tips" area. Profile and report sit in the bar on the right (see AppShell).
 */
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
    <div className="space-y-6">
      {/* the two doors: the same paper card, a jade edge on the left, the word set in the display serif */}
      <div className="home-doors grid grid-cols-2 gap-6">
        <Link
          href="/pre"
          className="home-entry jade-edge flex min-h-48 flex-col items-center justify-center gap-2.5 rounded-card border border-line bg-surface p-6 text-center shadow-card transition hover:border-brand-300 hover:bg-brand-50/50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
        >
          <MessageCircle className="h-12 w-12 rounded-full bg-brand-50 p-2.5 text-brand-600" />
          <span className="font-serif text-3xl font-semibold tracking-tight text-ink">pre</span>
          <span className="text-base leading-relaxed text-ink-2">看医生之前：哪里不舒服，跟我说</span>
        </Link>
        <Link
          href="/post"
          className="home-entry jade-edge flex min-h-48 flex-col items-center justify-center gap-2.5 rounded-card border border-line bg-surface p-6 text-center shadow-card transition hover:border-brand-300 hover:bg-brand-50/50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
        >
          <Camera className="h-12 w-12 rounded-full bg-brand-50 p-2.5 text-brand-600" />
          <span className="font-serif text-3xl font-semibold tracking-tight text-ink">post</span>
          <span className="text-base leading-relaxed text-ink-2">看完医生：把医嘱拍给我</span>
        </Link>
      </div>

      <section className="home-panel jade-edge min-h-48 rounded-card border border-line bg-surface p-6 shadow-card">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">to do &amp; tips</h2>
        <TodoList now={now} />
        {items.length > 0 && (
          <ul className="mt-4 space-y-2">
            {items.map((it) => {
              const cls =
                it.tone === "red"
                  ? "border-danger bg-danger-bg text-danger"
                  : it.tone === "warn"
                    ? "border-warn bg-warn-bg text-ink"
                    : "border-brand-300 bg-surface-2 text-ink";
              const body = <span className={`block rounded-r-xl border-l-[3px] px-4 py-3 text-lg leading-relaxed ${cls}`}>{it.text}</span>;
              return <li key={it.key}>{it.href ? <Link href={it.href} className="block hover:opacity-80">{body}</Link> : body}</li>;
            })}
          </ul>
        )}
        <div className="mt-5 border-t border-line pt-5">
          <AskBox now={now} />
        </div>
      </section>
    </div>
  );
}
