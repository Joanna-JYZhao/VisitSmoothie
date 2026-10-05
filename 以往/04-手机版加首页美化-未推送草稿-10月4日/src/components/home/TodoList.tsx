"use client";

import { useState } from "react";
import { AlertTriangle, CalendarDays, Check, ChevronDown, ClipboardCheck, Lightbulb, Pill, Sparkles } from "lucide-react";
import { IconTile, type IconTone } from "@/components/ui";
import { storeActions, useStore } from "@/lib/store";
import { homeTodos, type HomeTodo } from "@/lib/reminders";
import { cn, fmtISODate } from "@/lib/utils";
import { L } from "@/lib/lang";

/* The home page's to-do list: medicines and when, the next visit, and anything else the doctor asked for. */

const DONE_KEY = "yiban.doneToday";
const kindLabel = (k: HomeTodo["kind"]): string =>
  ({
    medicine: L("吃药", "Medicine"),
    care: L("要做的", "To do"),
    followup: L("下次复诊", "Next visit"),
    caution: L("注意", "Take care"),
  })[k];
/* Kind icons supplement, rather than replace, the written labels. One accent family; only a caution is amber. */
const KIND_ICON: Record<HomeTodo["kind"], { Icon: typeof Pill; tone: IconTone }> = {
  medicine: { Icon: Pill, tone: "solid" },
  care: { Icon: ClipboardCheck, tone: "brand" },
  followup: { Icon: CalendarDays, tone: "brand" },
  caution: { Icon: AlertTriangle, tone: "warn" },
};

const HAS_TIME = /\d{1,2}:\d{2}/;
const ONLY_TIMES = /^\d{1,2}:\d{2}(\s+\d{1,2}:\d{2})*$/;
/* "10月10日 周六 下午 8:00" / "Sat, Oct 10, 8:00 PM": the clock time at the end, and the day before it */
const DAY_AND_TIME = /^(.+?)[,\s]+((?:上午|下午)\s*\d{1,2}:\d{2}|\d{1,2}:\d{2}\s*(?:AM|PM))$/;

/**
 * One to-do, laid out as "what · when": the what (the kind and its name), the when on its own line
 * in large figures, and whatever else was said (饭后, the note for a visit) after it. Only the
 * order on screen changes; the words are the ones the list already carries.
 */
function layout(t: HomeTodo): { what: string; when: string; note: string } {
  // a visit: the date is its title, the note says what it is for
  if (t.kind === "followup") return { what: "", when: t.title, note: t.detail };
  const parts = t.detail ? t.detail.split(" · ") : [];
  if (parts.length && HAS_TIME.test(parts[0])) return { what: t.title, when: parts[0], note: parts.slice(1).join(" · ") };
  return { what: t.title, when: "", note: t.detail };
}

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

/** The ticks of the day, shared by the list and the heading that counts what is left. */
export function useDoneToday(now: number): { keys: string[]; tick: (key: string) => void } {
  const today = fmtISODate(new Date(now));
  const [done, setDone] = useState<{ day: string; keys: string[] }>(() => ({ day: today, keys: typeof window === "undefined" ? [] : readDone(today) }));
  const keys = done.day === today ? done.keys : readDone(today);
  const tick = (key: string) => {
    const next = keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];
    writeDone(today, next);
    setDone({ day: today, keys: next });
  };
  return { keys, tick };
}

/** The when, as the row's anchor: the clock time in large figures, the day beside it in quieter type. */
function When({ when, times, ticked, struck }: { when: string; times: string[] | null; ticked: boolean; struck: boolean }) {
  if (times) {
    return (
      <p className="flex flex-wrap items-center gap-1.5">
        {times.map((x, i) => (
          <span key={i} className={cn("todo-time", ticked ? "bg-surface-2 text-ink-2" : "bg-brand-50 text-brand-800")}>
            {x}
          </span>
        ))}
      </p>
    );
  }
  const m = DAY_AND_TIME.exec(when);
  const clock = m ? m[2] : when;
  const day = m ? m[1] : "";
  return (
    <p className={cn("flex flex-wrap items-baseline gap-x-2 gap-y-0.5", struck && "line-through decoration-ink-3")}>
      <span className={cn("todo-when [word-break:keep-all]", ticked ? "text-ink-2" : "text-ink")}>{clock}</span>
      {day && <span className={cn("text-base font-medium [word-break:keep-all]", ticked ? "text-ink-3" : "text-ink-2")}>{day}</span>}
    </p>
  );
}

export function TodoList({ now, done }: { now: number; done: ReturnType<typeof useDoneToday> }) {
  const { state } = useStore();
  const { keys, tick } = done;
  const todos = homeTodos(state, now);

  if (!todos.length) {
    return (
      <div className="todo-group flex items-center gap-3.5 px-4 py-4">
        <IconTile tone="brand" size="md">
          <Sparkles />
        </IconTile>
        <p className="t-body text-ink">
          {L("看完医生，在 post 里录音或上传，吃药和复诊会自动放到这里。", "After a doctor's visit, record or upload in post. Medicines and visits will show up here.")}
        </p>
      </div>
    );
  }
  /* Rows: tick, the kind on its tile, what to do and when, and the reminder switch. */
  return (
    <ul className="todo-group divide-y divide-line">
      {todos.map((t, i) => {
        const ticked = keys.includes(t.key);
        const r = t.reminder;
        const k = KIND_ICON[t.kind];
        const { what, when, note } = layout(t);
        const times = ONLY_TIMES.test(when) ? when.split(/\s+/) : null;
        const title = what || kindLabel(t.kind);
        const quiet = [what ? kindLabel(t.kind) : "", note].filter(Boolean).join(" · ");
        return (
          <li key={t.key} className="todo-row flex items-start gap-0.5 py-2.5 pr-2 pl-0.5" style={{ animationDelay: `${i * 50}ms` }}>
            <button
              type="button"
              role="checkbox"
              aria-checked={ticked}
              aria-label={L(`今天做了：${t.title}`, `Done today: ${t.title}`)}
              onClick={() => tick(t.key)}
              className="press-soft flex min-h-12 min-w-12 shrink-0 items-center justify-center self-center rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
            >
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] transition-all duration-300",
                  ticked ? "border-transparent bg-brand-600 text-white shadow-[0_2px_6px_rgba(0,120,102,0.3)]" : "border-line-strong/70 bg-surface",
                )}
              >
                {ticked && <Check className="todo-check h-[1.1rem] w-[1.1rem]" strokeWidth={3} />}
              </span>
            </button>
            <IconTile tone={ticked ? "neutral" : k.tone} size="sm" className="mt-2.5 mr-2.5 transition-colors duration-300">
              <k.Icon />
            </IconTile>
            <div className={cn("min-w-0 flex-1 pt-1.5 transition-opacity duration-300", ticked && "opacity-60")}>
              {/* when: the row's anchor, in large figures */}
              {when && <When when={when} times={times} ticked={ticked} struck={t.kind === "followup" && ticked} />}
              {/* what: the name of the thing to do */}
              <p className={cn("text-lg leading-snug font-semibold", when ? "mt-1" : "pt-1", ticked ? "text-ink-2 line-through decoration-ink-3" : t.kind === "caution" ? "text-warn" : "text-ink")}>
                {title}
              </p>
              {/* the quiet line: the kind, and whatever else was said */}
              {quiet && <p className={cn("t-body mt-0.5", ticked ? "text-ink-3" : "text-ink-2")}>{quiet}</p>}
              {/* what the assistant explained about it after the visit, one tap away */}
              {t.explain && (
                <details className="group mt-0.5">
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
                aria-label={L(`提醒：${t.title}`, `Reminder: ${t.title}`)}
                onClick={() => storeActions.updateReminder(r.id, (x) => ({ ...x, enabled: !x.enabled }))}
                className="press-soft mt-1 ml-1 flex min-h-12 shrink-0 flex-col items-center justify-center gap-1 rounded-xl px-0.5 text-base font-medium text-ink-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
              >
                <span className={cn("relative h-[1.9rem] w-[3.1rem] rounded-full transition-colors duration-300", r.enabled ? "bg-brand-600" : "bg-line-strong/55")}>
                  <span
                    className={cn(
                      "absolute top-[0.15rem] h-[1.6rem] w-[1.6rem] rounded-full bg-white shadow-[0_2px_6px_rgba(13,59,64,0.22),0_0_0_0.5px_rgba(13,59,64,0.06)] transition-all duration-300",
                      r.enabled ? "left-[1.35rem]" : "left-[0.15rem]",
                    )}
                  />
                </span>
                <span className={cn("leading-none", r.enabled && "text-brand-700")}>{r.enabled ? L("提醒开", "Remind on") : L("提醒关", "Remind off")}</span>
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
