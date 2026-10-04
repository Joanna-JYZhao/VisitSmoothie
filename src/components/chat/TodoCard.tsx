"use client";

import type { ThreadItem, Todo } from "@/lib/types";
import { storeActions, useStore } from "@/lib/store";
import { frequencyLabel, scheduleText, setReminders } from "@/lib/reminders";
import { cn } from "@/lib/utils";
import { Button, Card } from "@/components/ui";

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
      className="flex min-h-12 shrink-0 items-center gap-2 rounded-xl px-1 text-base font-medium text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
    >
      {on ? "提醒" : "不提醒"}
      <span className={cn("relative h-8 w-14 rounded-full transition-colors", on ? "bg-brand-600" : "bg-line-strong")}>
        <span className={cn("absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all", on ? "left-7" : "left-1")} />
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
    <li className="border-t border-line py-3 first:border-t-0">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-lg leading-relaxed text-ink">
          <span className="mr-2 font-semibold text-brand-800">{KIND_LABEL[todo.kind]}</span>
          {shown(todo)}
        </p>
        {canRemind && <Switch on={on} onChange={toggle} label={`提醒：${todo.text}`} />}
      </div>
      {!canRemind && <p className="mt-1 text-base text-ink-2">医生没定具体日子，到时候按医生说的去。</p>}
      {on && todo.kind === "followup" && todo.at && <p className="mt-1 text-base text-ink">{scheduleText(todo)}</p>}
      {on && choices.length > 0 && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="多久提醒一次">
            {choices.map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={todo.frequency === f}
                onClick={() => onChange({ ...todo, frequency: f })}
                className={cn(
                  "min-h-11 rounded-full border-2 px-4 text-base font-medium transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200",
                  todo.frequency === f ? "border-brand-600 bg-brand-50 text-brand-800" : "border-line-strong bg-surface text-ink",
                )}
              >
                {frequencyLabel(f)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base text-ink">时间</span>
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
                className="min-h-11 rounded-xl border-2 border-line-strong bg-surface px-3 text-lg text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
              />
            ))}
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
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-brand-800">要做的事</h2>
        {set && <span className="rounded-full bg-good-bg px-3 py-0.5 text-base font-medium text-good">提醒已设好</span>}
      </div>
      {item.todos.length === 0 ? (
        <p className="mt-2 text-lg text-ink">这次的医嘱里没有认出要吃的药或要做的事。</p>
      ) : set ? (
        <ul className="mt-2 space-y-2">
          {item.todos.map((t) => {
            const r = mine.find((x) => x.todoId === t.id);
            return (
              <li key={t.id} className="text-lg leading-relaxed text-ink">
                <span className="mr-2 font-semibold text-brand-800">{KIND_LABEL[t.kind]}</span>
                {shown(t)}
                <span className="block text-base text-ink">{r ? `提醒：${scheduleText(r)}${r.enabled ? "" : "（已关）"}` : "不提醒"}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <>
          <p className="mt-1 text-base text-ink">打开的会按时提醒你，可以改时间和次数。</p>
          <ul className="mt-1">
            {item.todos.map((t) => (
              <TodoRow key={t.id} todo={t} onChange={patch} />
            ))}
          </ul>
          <Button size="lg" className="mt-3 w-full" onClick={done}>
            设好了
          </Button>
        </>
      )}
    </Card>
  );
}
