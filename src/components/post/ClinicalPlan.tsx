"use client";

import { useState } from "react";
import { CalendarDays, Check, CircleAlert, ClipboardList, HelpCircle, Lightbulb, Stethoscope } from "lucide-react";
import type { AfterResult, Todo } from "@/lib/types";
import { getState } from "@/lib/store";
import { buildTodos, explainQuestion, scheduleText } from "@/lib/reminders";
import { cn, fmtDate } from "@/lib/utils";
import { Button, Card, IconTile, Spinner } from "@/components/ui";

/*
 * Clinical Plan: what was read from the photos and the recording, one line per thing to do. Each
 * line can be ticked for the to-do list; any line can be marked unclear and explained, and the
 * explanation goes with it onto the to-do list. Nothing is stored until 加入待办并保存.
 */

const KIND_LABEL: Record<Todo["kind"], string> = { medicine: "用药", care: "要做的", caution: "要注意的", followup: "复诊" };
const ORDER: Todo["kind"][] = ["medicine", "care", "caution", "followup"];

/** What the visit says beyond the to-dos, which can be explained too but goes on no list. */
type InfoKey = "diagnosis" | "findings";

async function explain(result: AfterResult, part: string): Promise<string> {
  const profile = getState().profile;
  if (!profile) return "";
  try {
    const res = await fetch("/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile, result, part }),
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

/** An explanation under the line it is about. */
function Why({ text }: { text: string }) {
  return (
    <div className="mt-3 flex animate-fade-up gap-3 rounded-2xl bg-brand-50/70 px-4 py-3">
      <Lightbulb aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-brand-700" />
      <p className="t-body min-w-0 flex-1 whitespace-pre-line text-ink">{text}</p>
    </div>
  );
}

export function ClinicalPlan({ result, onSave, saving }: { result: AfterResult; onSave: (todos: Todo[]) => void; saving?: boolean }) {
  const [todos, setTodos] = useState<Todo[]>(() => buildTodos(result));
  const [picked, setPicked] = useState<string[]>(() => todos.map((t) => t.id));
  const [phase, setPhase] = useState<"choose" | "unclear" | "explaining">("choose");
  const [unclear, setUnclear] = useState<string[]>([]);
  const [info, setInfo] = useState<Partial<Record<InfoKey, string>>>({});
  const [progress, setProgress] = useState(0);

  const marking = phase === "unclear";
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const tap = (id: string) => (marking ? setUnclear((u) => toggle(u, id)) : setPicked((p) => toggle(p, id)));

  const explainUnclear = async () => {
    setPhase("explaining");
    setProgress(0);
    for (const id of unclear) {
      const part =
        id === "diagnosis" ? `诊断「${result.diagnosis}」是什么意思` : id === "findings" ? "检查结果是什么意思" : (() => {
          const t = todos.find((x) => x.id === id);
          return t ? explainQuestion(t, result) : "";
        })();
      if (!part) continue;
      const answer = (await explain(result, part)) || "这一条这次没解释成，可以再点一次，或者问医生、药师。";
      if (id === "diagnosis" || id === "findings") setInfo((i) => ({ ...i, [id]: answer }));
      else setTodos((list) => list.map((t) => (t.id === id ? { ...t, explain: answer } : t)));
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
            Clinical Plan · 治疗计划
          </p>
          {where && (
            <p className="mt-3 flex items-center gap-2 text-base text-ink-2">
              <CalendarDays aria-hidden="true" className="h-5 w-5" />
              {where}
            </p>
          )}
          <p className="mt-4 flex items-center gap-2 text-base font-medium text-ink-2">
            <Stethoscope aria-hidden="true" className="h-5 w-5 text-brand-700" />
            诊断
          </p>
          <p className="t-title mt-1 text-balance text-ink">{result.diagnosis || "没有写诊断"}</p>
          {result.findings.length > 0 && <p className="t-body mt-3 text-ink">检查结果：{result.findings.join("；")}</p>}
          {info.diagnosis && <Why text={info.diagnosis} />}
          {info.findings && <Why text={info.findings} />}
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
                    {k === "diagnosis" ? "诊断不清楚" : "检查结果不清楚"}
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* one line per thing to do, grouped the way the to-do list is */}
        {todos.length === 0 ? (
          <p className="t-body px-6 py-5 text-ink-2 sm:px-8">这次没有认出要吃的药或要做的事。</p>
        ) : (
          <div className="divide-y divide-line">
            {ORDER.filter((k) => todos.some((t) => t.kind === k)).map((kind) => (
              <section key={kind}>
                <p className="bg-surface-2/60 px-6 py-2 text-base font-semibold text-ink-2 sm:px-8">{KIND_LABEL[kind]}</p>
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
                              <span className="block text-lg leading-snug font-medium text-ink">{t.kind === "followup" ? t.text.replace(/^复诊[：:]/, "") : t.text}</span>
                              <span className="mt-1 block text-base text-ink-2">
                                {marking ? (on ? "这条不清楚，让 AI 解释" : "点一下，标成不清楚") : on ? `加入待办 · ${t.remind ? scheduleText(t) : "不定时提醒"}` : "不加入待办"}
                              </span>
                            </span>
                          </button>
                          {t.explain && (
                            <div className="px-5 pb-4 sm:px-8">
                              <Why text={t.explain} />
                            </div>
                          )}
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
            <p className="t-body text-ink">这几处没看清，请对一下原件：{result.unclear.join("；")}</p>
          </div>
        )}
      </Card>

      {/* the two ways on: save to the to-do list, or have the unclear lines explained first */}
      {phase === "choose" && (
        <div className="grid gap-3">
          <Button size="lg" className="press w-full" disabled={saving} onClick={() => onSave(todos.filter((t) => picked.includes(t.id)))}>
            {saving ? "正在保存…" : picked.length ? `加入待办并保存（${picked.length} 条）` : "只保存，不加待办"}
          </Button>
          <Button size="lg" variant="secondary" className="press w-full" disabled={saving} onClick={() => setPhase("unclear")}>
            有不清楚的，让 AI 解释
          </Button>
        </div>
      )}
      {phase === "unclear" && (
        <div className="space-y-3">
          <p className="t-body text-center text-ink-2">点哪条不清楚，可以选好几条。</p>
          <Button size="lg" className="press w-full" disabled={!unclear.length} onClick={() => void explainUnclear()}>
            {unclear.length ? `解释这 ${unclear.length} 条` : "解释"}
          </Button>
          <Button size="lg" variant="ghost" className="press w-full" onClick={() => (setUnclear([]), setPhase("choose"))}>
            算了，回去
          </Button>
        </div>
      )}
      {phase === "explaining" && (
        <p role="status" className="flex animate-fade-up items-center gap-3.5 rounded-card border border-line/80 bg-surface px-5 py-4 text-lg text-ink-2 shadow-card">
          <Spinner className="h-6 w-6" />
          <span className="tabular-nums">
            正在解释第 {Math.min(progress + 1, unclear.length)} 条，共 {unclear.length} 条
          </span>
        </p>
      )}
    </div>
  );
}
