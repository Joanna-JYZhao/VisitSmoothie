"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AfterResult } from "@/lib/types";
import { getState } from "@/lib/store";
import { explainParts } from "@/lib/reminders";
import { ask } from "@/lib/ask";
import { Check, MessageCircleQuestion, Sparkles } from "lucide-react";
import { HintBanner } from "@/components/HintBanner";
import { Button, Card, IconTile, Spinner, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";

/** The extra choice besides the parts of the orders: the visit as a whole. */
export const VISIT_PART = "就诊内容";

/** The parts a patient can tick, with the one about the whole visit last. */
export const questionChoices = (result: AfterResult): string[] => [...explainParts(result), VISIT_PART];

interface Answer {
  q: string;
  a: string;
  hint?: import("@/lib/types").Hint | null;
}

async function explain(result: AfterResult, part: string): Promise<string> {
  const profile = getState().profile;
  if (!profile) return "";
  try {
    const res = await fetch("/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile, result, part: part === VISIT_PART ? "这次就诊的内容，整体讲一讲" : part }),
    });
    if (!res.ok) return "";
    return ((await res.json()) as { answer?: string }).answer ?? "";
  } catch {
    return "";
  }
}

/** 对这次就诊还有没有问题: none goes home; some are ticked and answered, then anything else can be asked. */
export function Questions({ result }: { result: AfterResult }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"ask" | "pick" | "answering" | "chat">("ask");
  const [picked, setPicked] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const choices = questionChoices(result);

  const answerPicked = async () => {
    setPhase("answering");
    for (const part of picked) {
      const a = await explain(result, part);
      setAnswers((list) => [...list, { q: part, a: a || "这一项这次没解释成，可以在下面直接问。" }]);
    }
    setPhase("chat");
  };

  const send = async () => {
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    try {
      const turn = await ask(q);
      setAnswers((list) => [...list, { q, a: turn?.answer ?? "这次没回答成，再问一次试试。", hint: turn?.hint ?? null }]);
      setText("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="animate-fade-up p-6">
        <div className="flex items-center gap-4">
          <IconTile tone="brand" size="lg">
            <MessageCircleQuestion />
          </IconTile>
          <p className="t-heading text-ink">对这次就诊还有没有问题？</p>
        </div>
        {phase === "ask" && (
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Button variant="secondary" size="lg" className="press" onClick={() => router.push("/")}>
              没有了
            </Button>
            <Button size="lg" className="press" onClick={() => setPhase("pick")}>
              有
            </Button>
          </div>
        )}
        {phase === "pick" && (
          <>
            <p className="t-body mt-3 text-ink-2">勾选想问的，可以选好几项。</p>
            {/* the choices as one hairline list, a check circle at the end of each row the way iOS does it */}
            <div className="mt-5 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-edge">
              {choices.map((c) => {
                const on = picked.includes(c);
                return (
                  <label
                    key={c}
                    className={cn(
                      "press flex min-h-16 cursor-pointer items-center gap-4 px-5 py-3 text-lg leading-snug transition-colors duration-200 select-none has-[:focus-visible]:bg-brand-50 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-brand-200",
                      on ? "bg-brand-50 font-medium text-brand-800" : "text-ink hover:bg-surface-2/70",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={on}
                      onChange={() => setPicked((p) => (on ? p.filter((x) => x !== c) : [...p, c]))}
                    />
                    <span className="min-w-0 flex-1">{c}</span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all duration-200",
                        on ? "tile-brand text-white" : "border-[1.5px] border-line-strong bg-surface",
                      )}
                    >
                      {on && <Check className="h-4.5 w-4.5" strokeWidth={3} />}
                    </span>
                  </label>
                );
              })}
            </div>
            <Button size="lg" className="press mt-6 w-full" disabled={!picked.length} onClick={() => void answerPicked()}>
              问这些
            </Button>
          </>
        )}
        {phase !== "ask" && phase !== "pick" && picked.length > 0 && <p className="t-body mt-3 text-ink-2">你问的：{picked.join("、")}</p>}
      </Card>

      {answers.map((x, i) => (
        <Card key={i} className="animate-rise overflow-hidden">
          <div className="flex items-start gap-3.5 border-b border-line bg-brand-50/50 px-6 py-4">
            <IconTile tone="brand" size="sm" className="mt-0.5">
              <MessageCircleQuestion className="h-5 w-5" />
            </IconTile>
            <p className="min-w-0 flex-1 pt-1 text-lg leading-snug font-semibold text-brand-800">{x.q}</p>
          </div>
          <div className="px-6 py-5">
            {x.hint && (
              <div className="mb-4">
                <HintBanner hint={x.hint} />
              </div>
            )}
            <p className="t-body whitespace-pre-line text-ink">{x.a}</p>
          </div>
        </Card>
      ))}

      {phase === "answering" && (
        <p role="status" className="flex animate-fade-up items-center gap-3.5 rounded-card border border-line/80 bg-surface px-5 py-4 text-lg text-ink-2 shadow-card">
          <Spinner className="h-6 w-6" />
          <span className="tabular-nums">
            正在回答第 {Math.min(answers.length + 1, picked.length)} 项，共 {picked.length} 项
          </span>
        </p>
      )}

      {phase === "chat" && (
        <Card className="animate-fade-up p-6">
          <div className="mb-4 flex items-center gap-3.5">
            <IconTile tone="brand" size="md">
              <Sparkles className="h-5 w-5" />
            </IconTile>
            <p className="t-heading text-ink">还有别的问题？直接问</p>
          </div>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="比如：这个药饭前吃还是饭后吃？" className="min-h-24" aria-label="还有别的问题" />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button variant="secondary" size="lg" className="press" onClick={() => router.push("/")}>
              回主页
            </Button>
            <Button size="lg" className="press" disabled={!text.trim() || busy} onClick={() => void send()}>
              {busy ? "正在想…" : "问"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
