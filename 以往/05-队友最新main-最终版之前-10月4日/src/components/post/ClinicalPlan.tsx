"use client";

import { useState } from "react";
import { CalendarDays, Check, CircleAlert, ClipboardList, HelpCircle, Lightbulb, MessageCircleQuestion, Stethoscope } from "lucide-react";
import type { AfterResult, LearnedItem, PostDraft, Todo } from "@/lib/types";
import { getState, storeActions, useStore } from "@/lib/store";
import { buildTodos, explainQuestion, followUpNote, scheduleText } from "@/lib/reminders";
import { previousContext } from "@/lib/records";
import { cn, fmtDate } from "@/lib/utils";
import { L, getLang } from "@/lib/lang";
import { Button, Card, IconTile, Input, Spinner } from "@/components/ui";

/*
 * Clinical Plan: what was read from the photos and the recording, one line per thing to do. Each
 * line can be ticked for the to-do list; any line can be marked unclear and explained, and the
 * explanation goes with it onto the to-do list. Nothing is stored until 加入待办并保存.
 */

const KIND_LABEL: Record<Todo["kind"], [string, string]> = {
  medicine: ["用药", "Medicines"],
  care: ["要做的", "To do"],
  caution: ["要注意的", "Take care"],
  followup: ["复诊", "Follow-up visit"],
};
const kindLabel = (k: Todo["kind"]) => L(...KIND_LABEL[k]);
const ORDER: Todo["kind"][] = ["medicine", "care", "caution", "followup"];

/** One question about a line and its answer. The first is the explanation itself; the rest are follow-ups asked under it. */
interface Turn {
  q: string;
  a: string;
}

const NOT_EXPLAINED = ["这一条这次没解释成，可以再问一次，或者问医生、药师。", "This one couldn't be explained just now. Ask again, or ask your doctor or pharmacist."] as const;

/** `history`: what was already asked about the same line, so a follow-up is answered about it. */
async function explain(result: AfterResult, part: string, history: Turn[] = [], previous?: string): Promise<string> {
  const profile = getState().profile;
  if (!profile) return "";
  try {
    const res = await fetch("/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile, result, part, history, previous, lang: getLang() }),
    });
    if (!res.ok) return "";
    return ((await res.json()) as { answer?: string }).answer ?? "";
  } catch {
    return "";
  }
}

function Tick({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all duration-200",
        on ? "tile-brand text-white" : "border-[1.5px] border-line-strong bg-surface",
      )}
    >
      {on && <Check className="h-4.5 w-4.5" strokeWidth={3} />}
    </span>
  );
}

/** What goes onto the to-do: the explanation, then each follow-up as 问 / 答. */
export function turnsText(turns: Turn[] | undefined): string | undefined {
  if (!turns?.length) return undefined;
  const [first, ...more] = turns;
  return [first.a, ...more.map((t) => L(`问：${t.q}\n答：${t.a}`, `Q: ${t.q}\nA: ${t.a}`))].join("\n\n");
}

/**
 * The explanation under the line it is about, the follow-ups asked under it, and a box to ask one
 * more about this same line: 漏吃了一次怎么办, 能和降压药一起吃吗.
 */
function Why({ turns, onAsk, busy, disabled }: { turns: Turn[]; onAsk: (q: string) => void; busy: boolean; disabled?: boolean }) {
  const [text, setText] = useState("");
  const [first, ...more] = turns;
  const send = () => {
    const q = text.trim();
    if (!q || busy) return;
    onAsk(q);
    setText("");
  };
  return (
    <div className="mt-3 animate-fade-up rounded-2xl bg-brand-50/70 px-4 py-3">
      <div className="flex gap-3">
        <Lightbulb aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-brand-700" />
        <p className="t-body min-w-0 flex-1 whitespace-pre-line text-ink">{first.a}</p>
      </div>
      {more.map((t, i) => (
        <div key={i} className="mt-3 animate-fade-up border-t border-brand-100 pt-3">
          <p className="flex gap-2 text-lg leading-snug font-semibold text-brand-800">
            <MessageCircleQuestion aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
            {t.q}
          </p>
          <p className="t-body mt-1.5 whitespace-pre-line text-ink">{t.a}</p>
        </div>
      ))}
      {busy && (
        <p role="status" className="mt-3 flex items-center gap-2.5 border-t border-brand-100 pt-3 text-base text-ink-2">
          <Spinner className="h-5 w-5" />
          {L("正在回答…", "Answering…")}
        </p>
      )}
      {!disabled && (
        <form
          className="mt-3 flex gap-2 border-t border-brand-100 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={L("还有不明白的？接着问这一条", "Still unclear? Ask more about this line")}
            aria-label={L("接着问这一条", "Ask more about this line")}
            className="min-w-0 flex-1 bg-surface"
            disabled={busy}
          />
          <Button type="submit" className="press shrink-0 px-5" disabled={!text.trim() || busy}>
            {L("问", "Ask")}
          </Button>
        </form>
      )}
    </div>
  );
}

/**
 * What was asked about and explained in this Clinical Plan, one item per line asked about, in the
 * order of the plan: kept with the visit in the record when it is saved.
 */
export function learnedOf(draft: PostDraft): LearnedItem[] {
  const out: LearnedItem[] = [];
  const add = (id: string, about: string) => {
    const text = turnsText(draft.turns[id]);
    if (text) out.push({ about, text });
  };
  if (draft.result.diagnosis) add("diagnosis", L(`诊断：${draft.result.diagnosis}`, `Diagnosis: ${draft.result.diagnosis}`));
  if (draft.result.findings.length) add("findings", L("检查结果", "Test results"));
  for (const t of draft.todos) add(t.id, t.kind === "followup" ? followUpNote(t.text) : t.text);
  return out;
}

/** A new Clinical Plan for what was read: every line ticked, nothing explained yet. */
export function newPostDraft(result: AfterResult, mode: PostDraft["mode"], text: string, episodeId: string | null): PostDraft {
  const todos = buildTodos(result);
  return { result, mode, text, episodeId, todos, picked: todos.map((t) => t.id), turns: {}, at: new Date().toISOString() };
}

/**
 * The Clinical Plan as it is kept in the store (draft), so that leaving the page and coming back
 * finds it as it was left. `onSave` gets the lines ticked, with what was explained, and the pre
 * record picked to link the visit to (null for none).
 */
export function ClinicalPlan({ draft, onSave, saving }: { draft: PostDraft; onSave: (todos: Todo[]) => void; saving?: boolean }) {
  const { state } = useStore();
  const { result, todos, picked, turns } = draft;
  // 复诊: the earlier record, so an explanation builds on what was said last time instead of repeating it
  const previous = previousContext(state, draft.followUpOf ?? state.episodes.find((e) => e.id === draft.episodeId)?.followUpOf);
  const [phase, setPhase] = useState<"choose" | "unclear" | "explaining">("choose");
  const [unclear, setUnclear] = useState<string[]>([]);
  const [asking, setAsking] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const setTurns = (fn: (all: Record<string, Turn[]>) => Record<string, Turn[]>) => storeActions.patchPostDraft((d) => ({ ...d, turns: fn(d.turns) }));

  /** A follow-up about one line, asked right under its explanation. */
  const askMore = async (id: string, q: string) => {
    const history = turns[id] ?? [];
    setAsking(id);
    try {
      const a = (await explain(result, q, history, previous)) || L(NOT_EXPLAINED[0], NOT_EXPLAINED[1]);
      setTurns((all) => ({ ...all, [id]: [...(all[id] ?? []), { q, a }] }));
    } finally {
      setAsking(null);
    }
  };
  const why = (id: string) =>
    turns[id]?.length ? <Why turns={turns[id]} busy={asking === id} disabled={phase !== "choose" || (asking != null && asking !== id)} onAsk={(q) => void askMore(id, q)} /> : null;

  const marking = phase === "unclear";
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const tap = (id: string) => (marking ? setUnclear((u) => toggle(u, id)) : storeActions.patchPostDraft((d) => ({ ...d, picked: toggle(d.picked, id) })));

  const explainUnclear = async () => {
    setPhase("explaining");
    setProgress(0);
    for (const id of unclear) {
      const part =
        id === "diagnosis"
          ? L(`诊断「${result.diagnosis}」是什么意思`, `What the diagnosis “${result.diagnosis}” means`)
          : id === "findings"
            ? L("检查结果是什么意思", "What the test results mean")
            : (() => {
                const t = todos.find((x) => x.id === id);
                return t ? explainQuestion(t, result) : "";
              })();
      if (!part) continue;
      const answer = (await explain(result, part, [], previous)) || L(NOT_EXPLAINED[0], NOT_EXPLAINED[1]);
      // explained again from the start: what was asked under it before is replaced
      setTurns((all) => ({ ...all, [id]: [{ q: part, a: answer }] }));
      setProgress((n) => n + 1);
    }
    setUnclear([]);
    setPhase("choose");
  };

  const where = [result.date ? fmtDate(`${result.date}T12:00:00`, { year: true }) : "", result.hospital, result.department].filter(Boolean).join(" · ");
  const row = (id: string, on: boolean) =>
    cn(
      "press flex w-full items-start gap-4 px-5 py-4 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-brand-200",
      on ? (marking ? "bg-warn-bg" : "bg-brand-50/60") : "hover:bg-surface-2/70",
      !marking && id !== "info" && "cursor-pointer",
    );

  return (
    <div className="space-y-6">
      <Card tone="raised" className="animate-rise overflow-hidden">
        {/* the letterhead: Clinical Plan, when and where, the diagnosis */}
        <div className="border-b border-line px-6 pt-6 pb-5 sm:px-8">
          <p className="flex items-center gap-2.5 text-base font-semibold tracking-wide text-brand-700">
            <IconTile tone="brand" size="sm">
              <ClipboardList className="h-5 w-5" />
            </IconTile>
            {L("治疗计划", "Clinical Plan")}
          </p>
          {where && (
            <p className="mt-3 flex items-center gap-2 text-base text-ink-2">
              <CalendarDays aria-hidden="true" className="h-5 w-5" />
              {where}
            </p>
          )}
          <p className="mt-4 flex items-center gap-2 text-base font-medium text-ink-2">
            <Stethoscope aria-hidden="true" className="h-5 w-5 text-brand-700" />
            {L("诊断", "Diagnosis")}
          </p>
          <p className="t-title mt-1 text-balance text-ink">{result.diagnosis || L("没有写诊断", "No diagnosis written")}</p>
          {result.findings.length > 0 && <p className="t-body mt-3 text-ink">{L("检查结果：", "Test results: ")}{result.findings.join(L("；", "; "))}</p>}
          {why("diagnosis")}
          {why("findings")}
          {marking && (result.diagnosis || result.findings.length > 0) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {(["diagnosis", "findings"] as const)
                .filter((k) => (k === "diagnosis" ? result.diagnosis : result.findings.length))
                .map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={unclear.includes(k)}
                    onClick={() => tap(k)}
                    className={cn(
                      "press inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-lg font-medium transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200",
                      unclear.includes(k) ? "border-warn/40 bg-warn-bg text-ink" : "border-line bg-surface text-ink-2",
                    )}
                  >
                    <HelpCircle className="h-5 w-5" />
                    {k === "diagnosis" ? L("诊断不清楚", "Diagnosis unclear") : L("检查结果不清楚", "Test results unclear")}
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* one line per thing to do, grouped the way the to-do list is */}
        {todos.length === 0 ? (
          <p className="t-body px-6 py-5 text-ink-2 sm:px-8">{L("这次没有认出要吃的药或要做的事。", "No medicines or tasks were found this time.")}</p>
        ) : (
          <div className="divide-y divide-line">
            {ORDER.filter((k) => todos.some((t) => t.kind === k)).map((kind) => (
              <section key={kind}>
                <p className="bg-surface-2/60 px-6 py-2 text-base font-semibold text-ink-2 sm:px-8">{kindLabel(kind)}</p>
                <ul className="divide-y divide-line">
                  {todos
                    .filter((t) => t.kind === kind)
                    .map((t) => {
                      const on = marking ? unclear.includes(t.id) : picked.includes(t.id);
                      return (
                        <li key={t.id}>
                          <button type="button" role="checkbox" aria-checked={on} onClick={() => tap(t.id)} disabled={phase === "explaining"} className={row(t.id, on)}>
                            {marking ? (
                              <HelpCircle aria-hidden="true" className={cn("mt-0.5 h-7 w-7 shrink-0", on ? "text-warn" : "text-ink-3")} />
                            ) : (
                              <Tick on={on} />
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block text-lg leading-snug font-medium text-ink">{t.kind === "followup" ? followUpNote(t.text) : t.text}</span>
                              <span className="mt-1 block text-base text-ink-2">
                                {marking
                                  ? on
                                    ? L("这条不清楚，让助手解释", "Unclear — the AI will explain")
                                    : L("点一下，标成不清楚", "Tap to mark as unclear")
                                  : on
                                    ? `${L("加入待办", "Add to to-do")} · ${t.remind ? scheduleText(t) : L("不定时提醒", "no set time")}`
                                    : L("不加入待办", "Not added")}
                              </span>
                            </span>
                          </button>
                          {turns[t.id]?.length ? <div className="px-5 pb-4 sm:px-8">{why(t.id)}</div> : null}
                        </li>
                      );
                    })}
                </ul>
              </section>
            ))}
          </div>
        )}

        {result.unclear.length > 0 && (
          <div className="flex gap-3 border-t border-line bg-warn-bg/70 px-6 py-4 sm:px-8">
            <CircleAlert aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-warn" />
            <p className="t-body text-ink">{L("这几处没看清，请对一下原件：", "These parts were hard to read; please check the original: ")}{result.unclear.join(L("；", "; "))}</p>
          </div>
        )}
      </Card>

      {/* the two ways on: save to the to-do list, or have the unclear lines explained first */}
      {phase === "choose" && (
        <div className="grid gap-3">
          <Button
            size="lg"
            className="press w-full"
            disabled={saving || asking != null}
            // what was explained, follow-ups included, goes with each line onto the to-do list
            onClick={() => onSave(todos.filter((t) => picked.includes(t.id)).map((t) => ({ ...t, explain: turnsText(turns[t.id]) })))}
          >
            {saving ? L("正在保存…", "Saving…") : picked.length ? L(`加入待办并保存（${picked.length} 条）`, `Save and add to to-do (${picked.length})`) : L("只保存，不加待办", "Save only, no to-do")}
          </Button>
          <Button size="lg" variant="secondary" className="press w-full" disabled={saving} onClick={() => setPhase("unclear")}>
            {L("有不清楚的，让助手解释", "Something unclear? Ask the AI to explain")}
          </Button>
        </div>
      )}
      {phase === "unclear" && (
        <div className="space-y-3">
          <p className="t-body text-center text-ink-2">{L("点哪条不清楚，可以选好几条。", "Tap the lines that are unclear. You can pick several.")}</p>
          <Button size="lg" className="press w-full" disabled={!unclear.length} onClick={() => void explainUnclear()}>
            {unclear.length ? L(`解释这 ${unclear.length} 条`, `Explain these ${unclear.length}`) : L("解释", "Explain")}
          </Button>
          <Button size="lg" variant="ghost" className="press w-full" onClick={() => (setUnclear([]), setPhase("choose"))}>
            {L("算了，回去", "Never mind, go back")}
          </Button>
        </div>
      )}
      {phase === "explaining" && (
        <p role="status" className="flex animate-fade-up items-center gap-3.5 rounded-card border border-line/80 bg-surface px-5 py-4 text-lg text-ink-2 shadow-card">
          <Spinner className="h-6 w-6" />
          <span className="tabular-nums">
            {L(`正在解释第 ${Math.min(progress + 1, unclear.length)} 条，共 ${unclear.length} 条`, `Explaining ${Math.min(progress + 1, unclear.length)} of ${unclear.length}`)}
          </span>
        </p>
      )}
    </div>
  );
}
