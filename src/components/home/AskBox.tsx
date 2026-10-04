"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { ask, usePendingAsk } from "@/lib/ask";
import { homeTodos, suggestedTodoQuestions } from "@/lib/reminders";
import type { AskTurn } from "@/lib/types";
import { IconTile, Spinner, focusRing } from "@/components/ui";
import { AlertCircle, ArrowUp, BookOpen, ChevronDown, ChevronRight, MessageCircleQuestion } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { HintBanner } from "@/components/HintBanner";
import { cn } from "@/lib/utils";

/*
 * 提问框: a question about one's medicines or visit, answered from the records (问医伴).
 *
 * On the home it is the bottom half of the screen: the box, a few suggested questions, the last
 * answer. The moment a question is being asked (the box is focused, or a suggestion is tapped) it
 * pushes up into the whole screen, where every question and answer is in one list and the box
 * stays at the bottom. 「收起」 at the top left slides it back down. The questions, answers and
 * sources are the same either way; only the room around them changes.
 */

const inputCls =
  "min-h-14 min-w-0 flex-1 rounded-2xl border border-transparent bg-surface-2 px-4 text-base text-ink transition duration-200 placeholder:text-ink-2 focus-visible:border-brand-400 focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100";

/** The assistant's side of the conversation: the app icon, and a white card beside it. */
function FromApp({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div className="flex items-start gap-2.5" aria-label={label}>
      <LogoMark className="mt-0.5 h-9 w-9" />
      <div className="ask-card min-w-0 flex-1 px-4 py-3.5">{children}</div>
    </div>
  );
}

/** The question as the person asked it: a bubble on the right. */
function Asked({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end pl-10">
      <p className="ask-bubble px-4 py-2.5 text-[1.05rem] leading-relaxed font-medium">{children}</p>
    </div>
  );
}

function Answer({ turn }: { turn: AskTurn }) {
  return (
    <li className="animate-fade-up space-y-3">
      <Asked>{turn.question}</Asked>
      <FromApp>
        {turn.hint && (
          <div className="mb-2.5">
            <HintBanner hint={turn.hint} />
          </div>
        )}
        <p className="t-body whitespace-pre-wrap text-ink">{turn.answer}</p>
        {turn.sources.length > 0 && (
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-line pt-3 text-base text-ink-2">
            <BookOpen className="h-5 w-5 text-brand-600" aria-hidden="true" />
            依据：
            {turn.sources.map((s, i) => (
              <Link
                key={i}
                href={s.href}
                className={cn(
                  "press inline-flex min-h-11 items-center rounded-full bg-brand-50 px-3.5 font-medium text-brand-800 transition hover:bg-brand-100",
                  focusRing,
                )}
              >
                {s.label}
              </Link>
            ))}
          </p>
        )}
      </FromApp>
    </li>
  );
}

export function AskBox({ now }: { now: number }) {
  const { state } = useStore();
  const pending = usePendingAsk();
  const [text, setText] = useState("");
  const [failed, setFailed] = useState(false);
  // "open": the full-screen view; "closing": it is on its way down and unmounts when the animation ends
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const asked = new Set(state.asks.map((a) => a.question));
  const suggestions = suggestedTodoQuestions(homeTodos(state, now)).filter((q) => !asked.has(q));
  const last = state.asks[state.asks.length - 1];
  const empty = state.asks.length === 0 && !pending && !failed;

  const expand = () => {
    setClosing(false);
    setOpen(true);
  };
  const collapse = () => {
    if (open) setClosing(true);
  };
  const onSlidDown = () => {
    if (!closing) return;
    setClosing(false);
    setOpen(false);
  };

  const send = async (q: string) => {
    if (!q.trim() || pending) return;
    expand();
    setText("");
    setFailed(false);
    const turn = await ask(q);
    if (!turn) setFailed(true);
  };

  // in case the end of the slide is never reported (a hidden tab, motion turned off): finish anyway
  useEffect(() => {
    if (!closing) return;
    const t = window.setTimeout(() => {
      setClosing(false);
      setOpen(false);
    }, 450);
    return () => window.clearTimeout(t);
  }, [closing]);

  // while the full view is up: no scrolling of the page under it, Esc slides it down
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setClosing(true);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // the newest answer always in view in the full list
  useEffect(() => {
    if (open) end.current?.scrollIntoView({ block: "end" });
  }, [open, state.asks.length, pending]);

  const form = (full: boolean) => (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void send(text);
      }}
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={full ? undefined : expand}
        autoFocus={full}
        placeholder="对吃药或就诊有疑问？问我"
        aria-label="对吃药或就诊有疑问？问我"
        className={inputCls}
      />
      <button
        type="submit"
        disabled={!text.trim() || pending != null}
        className={cn(
          "press flex h-14 min-w-14 shrink-0 items-center justify-center gap-1 rounded-2xl bg-brand-600 px-3 text-lg font-semibold text-white transition duration-200 hover:bg-brand-700 disabled:pointer-events-none disabled:bg-brand-100 disabled:text-brand-600",
          focusRing,
        )}
      >
        问
        <ArrowUp className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
      </button>
    </form>
  );

  const chipCls = cn(
    "press min-h-12 rounded-full border border-brand-200/80 bg-brand-50 px-4 py-2 text-left text-base leading-snug font-medium text-brand-800 transition duration-200 hover:bg-brand-100",
    focusRing,
  );
  const chips = suggestions.length > 0 && !pending && (
    <div className="flex flex-wrap gap-2">
      {suggestions.map((q) => (
        <button key={q} type="button" onClick={() => void send(q)} className={chipCls}>
          {q}
        </button>
      ))}
    </div>
  );

  const status = pending && (
    <div role="status">
      <p className="flex items-center gap-2.5 text-base leading-relaxed text-ink">
        <Spinner />
        正在查你的记录，回答「{pending.question}」……
      </p>
      <div className="mt-3.5 space-y-2.5" aria-hidden="true">
        <span className="skeleton block h-4 w-11/12" />
        <span className="skeleton block h-4 w-3/4" />
        <span className="skeleton block h-4 w-1/2" />
      </div>
    </div>
  );

  const failure = failed && (
    <p className="flex animate-fade-up items-center gap-3 rounded-2xl bg-warn-bg px-4 py-3.5 text-lg text-ink" role="alert">
      <IconTile tone="warn" size="sm">
        <AlertCircle />
      </IconTile>
      这次没问成，再问一遍试试。
    </p>
  );

  return (
    <div className="flex flex-1 flex-col gap-3">
      {/* the home: the box, the suggestions, the last answer */}
      {form(false)}
      {chips}
      {pending && <div className="animate-fade-up rounded-2xl bg-surface-2 px-4 py-3.5">{status}</div>}
      {failure}
      {last && !pending && (
        <button type="button" onClick={expand} className={cn("press lift group block w-full rounded-2xl bg-surface-2 px-4 py-3.5 text-left", focusRing)}>
          <span className="flex items-start gap-2">
            <MessageCircleQuestion className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
            <span className="t-heading min-w-0 flex-1 text-ink">{last.question}</span>
            <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
          <span className="t-body mt-1.5 line-clamp-3 block whitespace-pre-wrap text-ink-2">{last.answer}</span>
        </button>
      )}

      {/* the whole screen: every question and answer, the box at the bottom */}
      {open && (
        <>
          <div aria-hidden="true" className={cn("ask-scrim", closing && "is-closing")} onClick={collapse} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="问 AI"
            className={cn("ask-sheet phone-fixed", closing && "is-closing")}
            onAnimationEnd={(e) => e.target === e.currentTarget && onSlidDown()}
          >
            <div className="glass shrink-0 shadow-header" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
              {/* the grabber: says "this is a sheet that came up, and goes back down" */}
              <div className="flex justify-center pt-2" aria-hidden="true">
                <span className="h-1.5 w-10 rounded-full bg-line-strong/40" />
              </div>
              <div className="grid min-h-14 grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 pb-2">
                <button
                  type="button"
                  onClick={collapse}
                  className={cn(
                    "press inline-flex min-h-12 items-center gap-1 justify-self-start rounded-full bg-brand-50 pr-4 pl-2.5 text-base font-semibold text-brand-700 transition hover:bg-brand-100",
                    focusRing,
                  )}
                >
                  <ChevronDown className="h-6 w-6" strokeWidth={2.4} aria-hidden="true" />
                  收起
                </button>
                <span className="flex items-center gap-2 text-ink">
                  <LogoMark className="h-8 w-8" />
                  <span className="flex flex-col leading-tight">
                    <span className="t-heading leading-tight">问 AI</span>
                    <span className="text-base font-medium text-ink-2">VisitSmoothie</span>
                  </span>
                </span>
                <span aria-hidden="true" />
              </div>
            </div>
            <div className="ask-sheet-body scroll-thin min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-4">
              {empty ? (
                /* nothing asked yet: the icon, the invitation, and the questions worth asking */
                <div className="flex min-h-full flex-col items-center justify-center gap-5 py-6 text-center">
                  <span className="flex flex-col items-center gap-2">
                    <LogoMark className="h-20 w-20" />
                    <span className="text-xl font-semibold tracking-tight text-brand-ink">VisitSmoothie</span>
                  </span>
                  <p className="t-title max-w-[16em] text-balance text-ink">对吃药或就诊有疑问？问我</p>
                  {suggestions.length > 0 && (
                    <ul className="mt-1 w-full space-y-2.5 text-left">
                      {suggestions.map((q) => (
                        <li key={q}>
                          <button
                            type="button"
                            onClick={() => void send(q)}
                            className={cn(
                              "press lift flex min-h-14 w-full items-center gap-3 rounded-2xl bg-surface px-4 py-3 text-left shadow-[0_0_0_0.5px_var(--color-line)]",
                              focusRing,
                            )}
                          >
                            <IconTile tone="brand" size="sm">
                              <MessageCircleQuestion />
                            </IconTile>
                            <span className="min-w-0 flex-1 text-lg leading-snug font-medium text-ink">{q}</span>
                            <ChevronRight className="h-5 w-5 shrink-0 text-ink-3" aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="space-y-5">
                  {state.asks.length > 0 && (
                    <ul className="space-y-5">
                      {state.asks.map((t) => (
                        <Answer key={t.id} turn={t} />
                      ))}
                    </ul>
                  )}
                  {pending && (
                    <div className="animate-fade-up space-y-3">
                      <Asked>{pending.question}</Asked>
                      <FromApp>{status}</FromApp>
                    </div>
                  )}
                  {failure}
                </div>
              )}
              <div ref={end} aria-hidden="true" className="h-px" />
            </div>
            <div
              className="shrink-0 space-y-2.5 border-t border-line bg-surface/95 px-4 pt-3 backdrop-blur"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
            >
              {!empty && chips}
              {form(true)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
