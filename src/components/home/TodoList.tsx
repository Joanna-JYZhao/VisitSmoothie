"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { storeActions, useStore } from "@/lib/store";
import { homeTodos, type HomeTodo } from "@/lib/reminders";
import { cn, fmtISODate } from "@/lib/utils";

/* The home page's to-do list: medicines and when, the next visit, and anything else the doctor asked for. */

const DONE_KEY = "yiban.doneToday";
const KIND: Record<HomeTodo["kind"], string> = { medicine: "吃药", care: "要做的", followup: "下次复诊", caution: "注意" };

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
    return <p className="mt-2 text-lg text-ink">看完医生，在 post 里录音或上传，吃药和复诊会自动放到这里。</p>;
  }
  return (
    <ul className="mt-3 divide-y divide-line">
      {todos.map((t) => {
        const ticked = keys.includes(t.key);
        const r = t.reminder;
        return (
          <li key={t.key} className="flex items-center gap-3 py-2">
            <button
              type="button"
              role="checkbox"
              aria-checked={ticked}
              aria-label={`今天做了：${t.title}`}
              onClick={() => tick(t.key)}
              className="flex min-h-12 min-w-12 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
            >
              <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg border-2", ticked ? "border-brand-600 bg-brand-600 text-white" : "border-line-strong bg-surface")}>
                {ticked && <Check className="h-5 w-5" />}
              </span>
            </button>
            <div className={cn("min-w-0 flex-1", ticked && "opacity-60")}>
              <p className={cn("text-lg leading-snug text-ink", ticked && "line-through")}>
                <span className="mr-2 font-semibold text-brand-800">{KIND[t.kind]}</span>
                {t.title}
              </p>
              {t.detail && <p className="text-lg leading-snug text-ink">{t.detail}</p>}
            </div>
            {r && (
              <button
                type="button"
                role="switch"
                aria-checked={r.enabled}
                aria-label={`提醒：${t.title}`}
                onClick={() => storeActions.updateReminder(r.id, (x) => ({ ...x, enabled: !x.enabled }))}
                className="flex min-h-12 shrink-0 items-center gap-2 rounded-xl px-1 text-base font-medium text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
              >
                {r.enabled ? "提醒开" : "提醒关"}
                <span className={cn("relative h-8 w-14 rounded-full transition-colors", r.enabled ? "bg-brand-600" : "bg-line-strong")}>
                  <span className={cn("absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all", r.enabled ? "left-7" : "left-1")} />
                </span>
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
