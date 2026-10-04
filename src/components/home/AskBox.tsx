"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { ask, usePendingAsk } from "@/lib/ask";
import { homeTodos, suggestedTodoQuestions } from "@/lib/reminders";
import { Button, IconTile, Spinner } from "@/components/ui";
import { AlertCircle, BookOpen, MessageCircleQuestion } from "lucide-react";
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
        <IconTile tone="brand" size="sm" className="hidden shrink-0 self-center sm:flex">
          <MessageCircleQuestion />
        </IconTile>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="对吃药或就诊有疑问？问我"
          aria-label="对吃药或就诊有疑问？问我"
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-base text-ink transition duration-200 placeholder:text-ink-2 focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
        />
        <Button type="submit" size="sm" className="w-11 shrink-0" disabled={!text.trim() || pending != null}>
          问
        </Button>
      </form>
      {suggestions.length > 0 && !pending && (
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => void send(q)}
              className="press material min-h-11 rounded-lg border border-line/80 px-4 text-base font-medium text-brand-800 transition duration-200 hover:border-brand-200 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
            >
              {q}
            </button>
          ))}
        </div>
      )}
      {pending && (
        <div className="mt-4 animate-fade-up rounded-2xl bg-surface-2/70 px-5 py-4" role="status">
          <p className="flex items-center gap-3 text-lg text-ink">
            <Spinner className="h-6 w-6" />
            正在查你的记录，回答「{pending.question}」……
          </p>
          <div className="mt-4 space-y-2.5">
            <span className="skeleton block h-4 w-11/12" />
            <span className="skeleton block h-4 w-3/4" />
            <span className="skeleton block h-4 w-1/2" />
          </div>
        </div>
      )}
      {failed && (
        <p className="mt-4 flex animate-fade-up items-center gap-3 rounded-2xl bg-warn-bg px-5 py-4 text-lg text-ink" role="alert">
          <IconTile tone="warn" size="md">
            <AlertCircle />
          </IconTile>
          这次没问成，再问一遍试试。
        </p>
      )}
      {recent.length > 0 && (
        <ul className="mt-3 space-y-3">
          {recent.map((t) => (
            <li key={t.id} className="animate-fade-up rounded-xl bg-surface-2/60 px-4 py-4">
              <p className="t-heading text-ink">{t.question}</p>
              {t.hint && (
                <div className="mt-2">
                  <HintBanner hint={t.hint} />
                </div>
              )}
              <p className="t-body mt-2 whitespace-pre-wrap text-ink">{t.answer}</p>
              {t.sources.length > 0 && (
                <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-3 text-base text-ink-2">
                  <BookOpen className="h-5 w-5 text-ink-3" aria-hidden="true" />
                  依据：
                  {t.sources.map((s, i) => (
                    <Link key={i} href={s.href} className="press inline-flex min-h-11 items-center rounded-full bg-brand-50 px-3 font-medium text-brand-800 transition hover:bg-brand-100">
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
