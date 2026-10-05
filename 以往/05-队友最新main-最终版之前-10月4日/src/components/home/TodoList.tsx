"use client";

import { useState } from "react";
import { AlertTriangle, CalendarDays, Check, ChevronDown, ClipboardCheck, Clock, Lightbulb, Pill, Sparkles } from "lucide-react";
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
/* Kind icons supplement, rather than replace, the written labels. One accent; only a caution is amber. */
const KIND_ICON: Record<HomeTodo["kind"], { Icon: typeof Pill; tone: IconTone }> = {
  medicine: { Icon: Pill, tone: "brand" },
  care: { Icon: ClipboardCheck, tone: "brand" },
  followup: { Icon: CalendarDays, tone: "brand" },
  caution: { Icon: AlertTriangle, tone: "warn" },
};

const HAS_TIME = /\d{1,2}:\d{2}/;
const ONLY_TIMES = /^\d{1,2}:\d{2}(\s+\d{1,2}:\d{2})*$/;

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
      <div className="mt-3 flex items-center gap-3 border-t border-line py-4">
        <IconTile tone="brand" size="sm">
          <Sparkles />
        </IconTile>
        <p className="t-body text-ink">
          {L("看完医生，在「看病后」里录音或上传，吃药和复诊会自动放到这里。", "After a doctor's visit, record or upload in post. Medicines and visits will show up here.")}
        </p>
      </div>
    );
  }
  /* Rows: tick, what to do and when, and the reminder switch. */
  return (
    <ul className="mt-2 divide-y divide-line border-t border-line">
      {todos.map((t) => {
        const ticked = keys.includes(t.key);
        const r = t.reminder;
        const k = KIND_ICON[t.kind];
        const { what, when, note } = layout(t);
        const times = ONLY_TIMES.test(when) ? when.split(/\s+/) : null;
        return (
          <li key={t.key} className="flex items-start gap-1.5 py-2.5">
            <button
              type="button"
              role="checkbox"
              aria-checked={ticked}
              aria-label={L(`今天做了：${t.title}`, `Done today: ${t.title}`)}
              onClick={() => tick(t.key)}
              className="press -ml-2.5 flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
            >
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border-2 transition-all duration-300",
                  ticked ? "border-transparent bg-brand-600 text-white" : "border-line-strong/70 bg-surface",
                )}
              >
                {ticked && <Check className="h-[1.1rem] w-[1.1rem] animate-pop" strokeWidth={3} />}
              </span>
            </button>
            <div className={cn("min-w-0 flex-1 pt-2.5 transition-opacity duration-300", ticked && "opacity-60")}>
              {/* what */}
              <p className="text-base leading-snug">
                <k.Icon
                  className={cn("mr-1.5 inline-block h-5 w-5 align-[-0.22em]", ticked ? "text-ink-3" : k.tone === "warn" ? "text-warn" : "text-brand-600")}
                  aria-hidden="true"
                />
                <span className={cn("font-semibold", ticked ? "text-ink-2" : k.tone === "warn" ? "text-warn" : "text-brand-700")}>{kindLabel(t.kind)}</span>
                {what && (
                  <>
                    <span className="mx-1.5 text-ink-3" aria-hidden="true">
                      ·
                    </span>
                    <span className={cn("font-medium text-ink", ticked && "line-through decoration-ink-3")}>{what}</span>
                  </>
                )}
              </p>
              {/* when: large figures, each time on its own chip when there are several */}
              {when &&
                (times ? (
                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {times.map((x, i) => (
                      <span
                        key={i}
                        className={cn(
                          "rounded-lg px-2 py-0.5 text-[1.2rem] leading-snug font-semibold tabular-nums",
                          ticked ? "bg-surface-2 text-ink-2" : "bg-brand-50 text-brand-800",
                        )}
                      >
                        {x}
                      </span>
                    ))}
                  </p>
                ) : (
                  <p className={cn("mt-1 flex items-center gap-1.5 text-[1.2rem] leading-snug font-semibold tabular-nums", ticked ? "text-ink-2" : "text-ink")}>
                    <Clock className={cn("h-[1.1rem] w-[1.1rem] shrink-0", ticked ? "text-ink-3" : "text-brand-600")} aria-hidden="true" />
                    <span className={cn("[word-break:keep-all]", t.kind === "followup" && ticked && "line-through decoration-ink-3")}>{when}</span>
                  </p>
                ))}
              {note && <p className="t-body mt-1 text-ink-2">{note}</p>}
              {/* what the assistant explained about it after the visit, one tap away */}
              {t.explain && (
                <details className="group mt-1">
                  <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-lg text-base font-medium text-brand-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 [&::-webkit-details-marker]:hidden">
                    <Lightbulb aria-hidden="true" className="h-4.5 w-4.5" />
                    {L("为什么要这样", "Why this")}
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
                className="press mt-1 flex min-h-12 shrink-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-base font-medium text-ink-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
              >
                <span
                  className={cn("relative h-[1.9rem] w-[3.1rem] rounded-full transition-colors duration-300", r.enabled ? "bg-brand-600" : "bg-line-strong/55")}
                >
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
