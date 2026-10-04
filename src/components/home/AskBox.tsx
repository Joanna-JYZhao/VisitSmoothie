"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { ask, usePendingAsk } from "@/lib/ask";
import { homeTodos, suggestedTodoQuestions } from "@/lib/reminders";
import { Button, Spinner } from "@/components/ui";
import { HintBanner } from "@/components/HintBanner";

/* 提问框: a question about one's medicines or visit, answered from the records (问医伴). */

export function AskBox({ now }: { now: number }) {
  const { state } = useStore();
  const pending = usePendingAsk();
  const [text, setText] = useState("");
  const [failed, setFailed] = useState(false);
  const recent = state.asks.slice(-3).reverse();
  const asked = new Set(state.asks.map((a) => a.question));
  const suggestions = suggestedTodoQuestions(homeTodos(state, now)).filter((q) => !asked.has(q));

  const send = async (q: string) => {
    if (!q.trim() || pending) return;
    setText("");
    setFailed(false);
    const turn = await ask(q);
    if (!turn) setFailed(true);
  };

  return (
    <div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="对吃药或就诊有疑问？问我"
          aria-label="对吃药或就诊有疑问？问我"
          className="min-h-14 min-w-0 flex-1 rounded-2xl border-2 border-line-strong bg-surface px-4 text-lg text-ink placeholder:text-ink-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
        />
        <Button type="submit" size="lg" disabled={!text.trim() || pending != null}>
          问
        </Button>
      </form>
      {suggestions.length > 0 && !pending && (
        <div className="mt-2 flex flex-wrap gap-2">
          {suggestions.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => void send(q)}
              className="min-h-11 rounded-full border-2 border-line-strong bg-surface px-4 text-base text-ink hover:border-brand-400 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
            >
              {q}
            </button>
          ))}
        </div>
      )}
      {pending && (
        <p className="mt-3 flex items-center gap-2 text-lg text-ink" role="status">
          <Spinner className="h-5 w-5" />
          正在查你的记录，回答「{pending.question}」……
        </p>
      )}
      {failed && <p className="mt-3 text-lg text-ink">这次没问成，再问一遍试试。</p>}
      {recent.length > 0 && (
        <ul className="mt-3 space-y-3">
          {recent.map((t) => (
            <li key={t.id} className="rounded-xl bg-surface-2 px-4 py-3">
              <p className="text-lg font-semibold text-ink">{t.question}</p>
              {t.hint && (
                <div className="mt-2">
                  <HintBanner hint={t.hint} />
                </div>
              )}
              <p className="mt-1 text-lg leading-relaxed whitespace-pre-wrap text-ink">{t.answer}</p>
              {t.sources.length > 0 && (
                <p className="mt-1 text-base text-ink">
                  依据：
                  {t.sources.map((s, i) => (
                    <Link key={i} href={s.href} className="mr-3 inline-flex min-h-11 items-center font-medium text-brand-700 underline underline-offset-4">
                      {s.label}
                    </Link>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
