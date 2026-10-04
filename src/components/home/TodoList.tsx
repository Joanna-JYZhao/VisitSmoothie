"use client";

import { useState } from "react";
import { AlertTriangle, CalendarDays, Check, ChevronDown, ClipboardCheck, Lightbulb, Pill, Sparkles } from "lucide-react";
import { IconTile, type IconTone } from "@/components/ui";
import { storeActions, useStore } from "@/lib/store";
import { homeTodos, type HomeTodo } from "@/lib/reminders";
import { cn, fmtISODate } from "@/lib/utils";

/* The home page's to-do list: medicines and when, the next visit, and anything else the doctor asked for. */

const DONE_KEY = "yiban.doneToday";
const KIND: Record<HomeTodo["kind"], string> = { medicine: "吃药", care: "要做的", followup: "下次复诊", caution: "注意" };
/* Kind icons supplement, rather than replace, the written labels. */
const KIND_ICON: Record<HomeTodo["kind"], { Icon: typeof Pill; tone: IconTone }> = {
  medicine: { Icon: Pill, tone: "brand" },
  care: { Icon: ClipboardCheck, tone: "info" },
  followup: { Icon: CalendarDays, tone: "good" },
  caution: { Icon: AlertTriangle, tone: "warn" },
};

/** What was ticked today. Kept in this browser only and forgotten the next day. */
function readDone(today: string): string[] {
  try {
    const o = JSON.parse(localStorage.getItem(DONE_KEY) || "{}") as { day?: string; keys?: string[] };
    return o.day === today && Array.isArray(o.keys) ? o.keys : [];
  } catch {
    return [];
  }
}
function writeDone(today: string, keys: string[]) {
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify({ day: today, keys }));
  } catch {
    /* the tick just won't survive a reload */
  }
}

export function TodoList({ now }: { now: number }) {
  const { state } = useStore();
  const today = fmtISODate(new Date(now));
  const [done, setDone] = useState<{ day: string; keys: string[] }>(() => ({ day: today, keys: typeof window === "undefined" ? [] : readDone(today) }));
  const keys = done.day === today ? done.keys : readDone(today);
  const todos = homeTodos(state, now);

  const tick = (key: string) => {
    const next = keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];
    writeDone(today, next);
    setDone({ day: today, keys: next });
  };

  if (!todos.length) {
    return (
      <div className="mt-4 flex items-center gap-3 border-t border-line px-1 py-5">
        <IconTile tone="neutral" size="sm">
          <Sparkles />
        </IconTile>
        <p className="t-body text-ink">看完医生，在 post 里录音或上传，吃药和复诊会自动放到这里。</p>
      </div>
    );
  }
  return (
    <ul className="mt-3 divide-y divide-line border-t border-line">
      {todos.map((t) => {
        const ticked = keys.includes(t.key);
        const r = t.reminder;
        const k = KIND_ICON[t.kind];
        return (
          <li key={t.key} className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 py-2 transition-colors duration-150", !ticked && "bg-surface")}>
            <button
              type="button"
              role="checkbox"
              aria-checked={ticked}
              aria-label={`今天做了：${t.title}`}
              onClick={() => tick(t.key)}
              className="press flex min-h-12 min-w-12 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
            >
              <span className={cn("flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] transition-all duration-300", ticked ? "bg-brand-600 border-transparent text-white" : "border-line-strong bg-surface")}>
                {ticked && <Check className="h-5 w-5 animate-pop" strokeWidth={2.5} />}
              </span>
            </button>
            <IconTile tone={ticked ? "neutral" : k.tone} size="md" className="transition duration-300 max-sm:hidden">
              <k.Icon />
            </IconTile>
            {/* on a phone the text gets the whole width; the switch wraps under it */}
            <div className="min-w-0 flex-1 transition duration-300 max-sm:basis-[calc(100%-3.75rem)]">
              <p className={cn("text-base leading-snug font-medium", ticked ? "text-ink-3 line-through decoration-ink-3" : "text-ink")}>
                <span className={cn("mr-2 font-semibold", ticked ? "text-ink-3" : "text-brand-700")}>{KIND[t.kind]}</span>
                {t.title}
              </p>
              {t.detail && <p className={cn("t-body mt-0.5", ticked ? "text-ink-3" : "text-ink-2")}>{t.detail}</p>}
              {/* what the assistant explained about it after the visit, one tap away */}
              {t.explain && (
                <details className="group mt-1">
                  <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-lg text-base font-medium text-brand-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 [&::-webkit-details-marker]:hidden">
                    <Lightbulb aria-hidden="true" className="h-4.5 w-4.5" />
                    为什么要这样
                    <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" />
                  </summary>
                  <p className="t-body mt-1 mb-2 rounded-xl bg-brand-50/70 px-3.5 py-2.5 whitespace-pre-line text-ink">{t.explain}</p>
                </details>
              )}
            </div>
            {r && (
              <button
                type="button"
                role="switch"
                aria-checked={r.enabled}
                aria-label={`提醒：${t.title}`}
                onClick={() => storeActions.updateReminder(r.id, (x) => ({ ...x, enabled: !x.enabled }))}
                className="press flex min-h-12 shrink-0 items-center gap-2 rounded-xl px-1 text-base font-medium text-ink-2 max-sm:ml-[3.75rem] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
              >
                {r.enabled ? "提醒开" : "提醒关"}
                <span className={cn("relative h-8 w-14 rounded-full transition-colors duration-300", r.enabled ? "bg-brand-600" : "bg-line-strong")}>
                  <span className={cn("absolute top-0.5 h-7 w-7 rounded-full bg-white shadow-[0_2px_6px_rgba(20,38,47,0.25),0_0_0_0.5px_rgba(20,38,47,0.06)] transition-all duration-300", r.enabled ? "left-[26px]" : "left-0.5")} />
                </span>
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
