"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AfterResult } from "@/lib/types";
import { getState } from "@/lib/store";
import { explainParts } from "@/lib/reminders";
import { ask } from "@/lib/ask";
import { HintBanner } from "@/components/HintBanner";
import { Button, Card, Spinner, Textarea } from "@/components/ui";

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
    <div className="space-y-4">
      <Card className="p-5">
        <p className="text-xl font-semibold text-ink">对这次就诊还有没有问题？</p>
        {phase === "ask" && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="secondary" size="lg" onClick={() => router.push("/")}>
              没有了
            </Button>
            <Button size="lg" onClick={() => setPhase("pick")}>
              有
            </Button>
          </div>
        )}
        {phase === "pick" && (
          <>
            <p className="mt-1 text-lg text-ink-2">勾选想问的，可以选好几项。</p>
            <div className="mt-3 space-y-2">
              {choices.map((c) => {
                const on = picked.includes(c);
                return (
                  <label
                    key={c}
                    className={`flex min-h-13 cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-2 text-lg ${on ? "border-brand-500 bg-brand-50 text-brand-800" : "border-line-strong text-ink"}`}
                  >
                    <input
                      type="checkbox"
                      className="h-6 w-6 shrink-0 accent-brand-600"
                      checked={on}
                      onChange={() => setPicked((p) => (on ? p.filter((x) => x !== c) : [...p, c]))}
                    />
                    {c}
                  </label>
                );
              })}
            </div>
            <Button size="lg" className="mt-4 w-full" disabled={!picked.length} onClick={() => void answerPicked()}>
              问这些
            </Button>
          </>
        )}
        {phase !== "ask" && phase !== "pick" && picked.length > 0 && <p className="mt-1 text-lg text-ink-2">你问的：{picked.join("、")}</p>}
      </Card>

      {answers.map((x, i) => (
        <Card key={i} className="p-5">
          <p className="text-lg font-semibold text-brand-800">{x.q}</p>
          {x.hint && (
            <div className="mt-2">
              <HintBanner hint={x.hint} />
            </div>
          )}
          <p className="mt-2 text-lg leading-relaxed whitespace-pre-line text-ink">{x.a}</p>
        </Card>
      ))}

      {phase === "answering" && (
        <p role="status" className="flex items-center gap-2 text-lg text-ink-2">
          <Spinner className="h-5 w-5" /> 正在回答第 {Math.min(answers.length + 1, picked.length)} 项，共 {picked.length} 项
        </p>
      )}

      {phase === "chat" && (
        <Card className="p-5">
          <p className="mb-2 text-lg font-semibold text-ink">还有别的问题？直接问</p>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="比如：这个药饭前吃还是饭后吃？" className="min-h-24" aria-label="还有别的问题" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary" size="lg" onClick={() => router.push("/")}>
              回主页
            </Button>
            <Button size="lg" disabled={!text.trim() || busy} onClick={() => void send()}>
              {busy ? "正在想…" : "问"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
