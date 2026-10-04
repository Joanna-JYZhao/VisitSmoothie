"use client";

import { Clock, ListChecks } from "lucide-react";
import type { ThreadItem, Todo } from "@/lib/types";
import { storeActions, useStore } from "@/lib/store";
import { frequencyLabel, scheduleText, setReminders } from "@/lib/reminders";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, IconTile } from "@/components/ui";

/* 医嘱 a: what to do, and which of them to be reminded about, set before anything is stored. */

const KIND_LABEL: Record<Todo["kind"], string> = { medicine: "吃药", care: "要做的", caution: "要注意的", followup: "复诊" };
/** The kind is already said in front of the text. */
const shown = (t: Pick<Todo, "kind" | "text">) => (t.kind === "followup" ? t.text.replace(/^复诊[：:]/, "") : t.text);

function choicesFor(t: Todo): Todo["frequency"][] {
  if (t.kind === "followup") return [];
  if (t.kind === "medicine" && (t.times?.length ?? 0) > 1) return ["each", "daily", "once"];
  return ["daily", "once"];
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="flex min-h-12 shrink-0 items-center gap-2.5 rounded-xl px-1 text-base font-medium text-ink-2 transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
    >
      <span className={cn(on && "text-ink")}>{on ? "提醒" : "不提醒"}</span>
      <span className={cn("relative h-8 w-14 rounded-full transition-colors duration-300", on ? "bg-brand-600" : "bg-line-strong")}>
        <span
          className={cn(
            "absolute top-0.5 h-7 w-7 rounded-full bg-white shadow-[0_2px_6px_rgba(20,38,47,0.25),0_0_0_0.5px_rgba(20,38,47,0.06)] transition-all duration-300",
            on ? "left-[26px]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

function TodoRow({ todo, onChange }: { todo: Todo; onChange: (t: Todo) => void }) {
  const choices = choicesFor(todo);
  const canRemind = todo.kind !== "followup" || Boolean(todo.at);
  const on = todo.remind && todo.frequency !== "none";
  const toggle = (v: boolean) =>
    onChange({ ...todo, remind: v, frequency: v ? (todo.frequency !== "none" ? todo.frequency : (choices[0] ?? "once")) : "none" });
  const times = todo.frequency === "daily" || todo.frequency === "once" ? (todo.times ?? []).slice(0, 1) : (todo.times ?? []);
  return (
    <li className="border-t border-line py-4 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-lg leading-relaxed text-ink">
          <span className="mr-2 inline-block rounded-full bg-brand-50 px-2.5 text-base leading-7 font-semibold text-brand-800">{KIND_LABEL[todo.kind]}</span>
          {shown(todo)}
        </p>
        {canRemind && <Switch on={on} onChange={toggle} label={`提醒：${todo.text}`} />}
      </div>
      {!canRemind && <p className="mt-1.5 text-base leading-relaxed text-ink-2">医生没定具体日子，到时候按医生说的去。</p>}
      {on && todo.kind === "followup" && todo.at && <p className="mt-1.5 text-base text-ink">{scheduleText(todo)}</p>}
      {on && choices.length > 0 && (
        <div className="mt-3 space-y-3">
          <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-[18px] bg-surface-3/80 p-1" role="radiogroup" aria-label="多久提醒一次">
            {choices.map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={todo.frequency === f}
                onClick={() => onChange({ ...todo, frequency: f })}
                className={cn(
                  "min-h-12 rounded-[14px] px-1 text-base font-medium whitespace-nowrap transition duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200",
                  todo.frequency === f ? "bg-surface text-ink shadow-pill" : "text-ink-2 hover:text-ink",
                )}
              >
                {frequencyLabel(f)}
              </button>
            ))}
          </div>
          <div>
            <span className="inline-flex items-center gap-1.5 text-base font-medium text-ink-2">
              <Clock aria-hidden="true" className="h-5 w-5 text-brand-700" />
              时间
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {times.map((t, i) => (
                <input
                  key={i}
                  type="time"
                  value={t}
                  aria-label={`第 ${i + 1} 个提醒时间`}
                  onChange={(e) => {
                    const next = [...(todo.times ?? [])];
                    next[i] = e.target.value || t;
                    onChange({ ...todo, times: next });
                  }}
                  className="todo-time material relative min-h-12 w-[5.5rem] appearance-none rounded-full border border-line/80 bg-surface px-2 py-0 text-center text-lg font-medium text-ink tabular-nums transition duration-200 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

/** Asks once for permission to show notifications. Only ever called from a button press. */
async function askToNotify(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "denied") return false;
  if (Notification.permission === "granted") {
    storeActions.updateSettings({ notificationsEnabled: true });
    return true;
  }
  try {
    const p = await Notification.requestPermission();
    if (p === "granted") storeActions.updateSettings({ notificationsEnabled: true });
    return p === "granted";
  } catch {
    return false;
  }
}

export function TodoCard({ item }: { item: Extract<ThreadItem, { kind: "todo" }> }) {
  const { state } = useStore();
  const patch = (todo: Todo) =>
    storeActions.patchThread(item.id, (x) => (x.kind === "todo" ? { ...x, todos: x.todos.map((t) => (t.id === todo.id ? todo : t)) } : x));

  const done = () => {
    const made = setReminders(item.todos, item.episodeId);
    storeActions.patchThread(item.id, (x) => (x.kind === "todo" ? { ...x, state: "set" } : x));
    const allowed = typeof Notification !== "undefined" && Notification.permission === "granted" && state.settings.notificationsEnabled;
    storeActions.pushThread({
      kind: "ai",
      text: made.length
        ? `设好了 ${made.length} 条提醒：\n${made.map((r) => `· ${r.text}：${scheduleText(r)}`).join("\n")}\n到时间我会在这里提醒你${allowed ? "，也会弹出通知" : ""}。`
        : "好的，这次不设提醒。上面的待办都留在记录里，随时可以看。",
    });
    // the browser asks once, right after the button press; the answer may take a while, so nothing waits for it
    if (made.length && !allowed) {
      void askToNotify().then((ok) => {
        if (ok) storeActions.pushThread({ kind: "ai", text: "好的，到时间也会弹出通知提醒你。" });
      });
    }
  };

  const set = item.state === "set";
  const mine = state.reminders.filter((r) => item.todos.some((t) => t.id === r.todoId));
  return (
    <Card tone={set ? "plain" : "raised"} className={cn("p-5", set ? "animate-fade-up" : "animate-pop")}>
      {/* the clock control without the browser's own icon: a plain pill with the time in it (a tap still opens the picker on a phone) */}
      <style>{`.todo-time::-webkit-calendar-picker-indicator{display:none}.todo-time::-webkit-date-and-time-value{text-align:center;margin:0}`}</style>
      <div className="flex items-center justify-between gap-3">
        <h2 className="t-heading flex items-center gap-3 text-ink">
          <IconTile>
            <ListChecks />
          </IconTile>
          要做的事
        </h2>
        {set && <Badge tone="good">提醒已设好</Badge>}
      </div>
      {item.todos.length === 0 ? (
        <p className="t-body mt-4 border-t border-line pt-4 text-ink">这次的医嘱里没有认出要吃的药或要做的事。</p>
      ) : set ? (
        <ul className="mt-5 divide-y divide-line border-t border-line pt-5">
          {item.todos.map((t) => {
            const r = mine.find((x) => x.todoId === t.id);
            return (
              <li key={t.id} className="py-3.5 text-lg leading-relaxed text-ink first:pt-0 last:pb-0">
                <span className="mr-2 inline-block rounded-full bg-brand-50 px-2.5 text-base leading-7 font-semibold text-brand-800">{KIND_LABEL[t.kind]}</span>
                {shown(t)}
                <span className="mt-0.5 block text-base text-ink-2">{r ? `提醒：${scheduleText(r)}${r.enabled ? "" : "（已关）"}` : "不提醒"}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <>
          <p className="t-body mt-2 text-ink-2">打开的会按时提醒你，可以改时间和次数。</p>
          <ul className="mt-5 border-t border-line pt-5">
            {item.todos.map((t) => (
              <TodoRow key={t.id} todo={t} onChange={patch} />
            ))}
          </ul>
          <Button size="lg" className="mt-6 w-full" onClick={done}>
            设好了
          </Button>
        </>
      )}
    </Card>
  );
}
