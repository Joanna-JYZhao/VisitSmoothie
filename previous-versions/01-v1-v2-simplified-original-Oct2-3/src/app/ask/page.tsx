"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import type { AskTurn } from "@/lib/types";
import { useStore } from "@/lib/store";
import { ask, suggestedQuestions, usePendingAsk } from "@/lib/ask";
import { HintBanner } from "@/components/HintBanner";
import { LogoMark } from "@/components/Logo";
import { SpeakInput } from "@/components/SpeakInput";
import { useToast } from "@/components/Toast";
import { BackLink, TextButton, TypingDots } from "@/components/ui";

/**
 * 问医伴: ask anything about your own health. Answers come from the profile and the records, and
 * each one shows which records it used. It reminds and explains; it does not diagnose.
 */
export default function AskPage() {
  const { state, clearAsks, addAsk } = useStore();
  const toast = useToast();
  const busy = usePendingAsk() != null;
  // shown at once, while the answer is still on its way
  const [waiting, setWaiting] = useState<string | null>(null);
  const turns = state.asks;

  // Keep the newest answer in view. Set directly: smooth scrolling stalls in background tabs.
  useLayoutEffect(() => {
    if (turns.length || waiting) window.scrollTo(0, document.documentElement.scrollHeight);
  }, [turns.length, waiting, busy]);
  useEffect(() => {
    if (!turns.length) return;
    const down = () => window.scrollTo(0, document.documentElement.scrollHeight);
    const timers = [setTimeout(down, 0), setTimeout(down, 150)];
    return () => timers.forEach(clearTimeout);
    // only on arrival: later turns are handled by the layout effect above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!state.profile) return null;
  const suggestions = suggestedQuestions(state).filter((q) => q !== turns[turns.length - 1]?.question);

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setWaiting(q);
    try {
      await ask(q);
    } finally {
      setWaiting(null);
    }
  };

  const clear = () => {
    const kept = turns;
    clearAsks();
    toast.show("已清空", "neutral", {
      label: "撤销",
      onClick: () => kept.forEach(({ id: _id, ...rest }) => (void _id, addAsk(rest))),
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <BackLink href="/">返回</BackLink>
        {turns.length > 0 && !busy && (
          <TextButton tone="plain" className="-mr-2 text-ink-2" onClick={clear}>
            清空
          </TextButton>
        )}
      </div>
      <h1 className="mt-1 text-[1.65rem] leading-tight font-semibold tracking-tight text-ink">问医伴</h1>
      <p className="mt-1.5 text-lg leading-relaxed text-ink-2">
        关于你自己的健康，记不清的都可以问我。我按你的档案和看病记录回答，不做诊断。
      </p>

      <div className="mt-5 space-y-4" aria-live="polite">
        {turns.map((t) => (
          <Turn key={t.id} turn={t} />
        ))}
        {waiting && busy && (
          <>
            <Question text={waiting} />
            <div className="flex items-start gap-2.5">
              <LogoMark className="mt-1 h-8 w-8" />
              <div className="rounded-3xl rounded-tl-lg border border-line bg-surface px-5 py-4 shadow-card">
                <TypingDots label="医伴正在查记录" />
              </div>
            </div>
          </>
        )}
      </div>

      {!busy && suggestions.length > 0 && (
        <section className="mt-6" aria-label="可以这样问">
          <p className="text-base font-medium text-ink-2">{turns.length ? "还可以问" : "可以这样问"}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => void send(q)}
                className="min-h-12 rounded-full border-2 border-line-strong bg-surface px-5 text-left text-lg text-ink transition hover:border-brand-400 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
              >
                {q}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="h-36" aria-hidden="true" />
      <div className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas/95 backdrop-blur">
        <div className="mx-auto w-full max-w-[36rem] px-4 pt-3 pb-3">
          <SpeakInput placeholder="说一句或打一句，比如：上次医生说了什么" ariaLabel="问医伴" onSubmit={(t) => void send(t)} disabled={busy} className="shadow-float" />
          <p className="mt-1.5 text-center text-[15px] text-ink-2">急事不要等我回答，直接拨打 120。</p>
        </div>
      </div>
    </div>
  );
}

function Question({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[86%] rounded-3xl rounded-br-lg bg-brand-600 px-4 py-3 text-lg leading-relaxed whitespace-pre-wrap text-white">{text}</div>
    </div>
  );
}

function Turn({ turn: t }: { turn: AskTurn }) {
  return (
    <div className="space-y-3">
      <Question text={t.question} />
      {t.hint && t.hint.level === "urgent" && <HintBanner hint={t.hint} />}
      <div className="flex items-start gap-2.5">
        <LogoMark className="mt-1 h-8 w-8" />
        <div className="min-w-0 flex-1 rounded-3xl rounded-tl-lg border border-line bg-surface px-4 py-3 shadow-card">
          <p className="text-lg leading-relaxed whitespace-pre-wrap text-ink">{t.answer}</p>
          {t.sources.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
              <span className="text-base text-ink-2">我查的是</span>
              {t.sources.map((s, i) => (
                <Link
                  key={`${s.href}-${i}`}
                  href={s.href}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-brand-50 px-3.5 text-base font-medium text-brand-800 transition hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
                >
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  {s.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
