"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, FileText, MessageCircleQuestion } from "lucide-react";
import type { AskTurn } from "@/lib/types";
import { useStore } from "@/lib/store";
import { L, getLang } from "@/lib/lang";
import { ask, suggestedQuestions, usePendingAsk } from "@/lib/ask";
import { HintBanner } from "@/components/HintBanner";
import { SpeakInput } from "@/components/SpeakInput";
import { useToast } from "@/components/Toast";
import { BackLink, Card, IconTile, LinkButton, TextButton, TextLink, TypingDots } from "@/components/ui";

const toBottom = () => window.scrollTo(0, document.documentElement.scrollHeight);

/**
 * 问医伴: ask anything about your own health. Answers come from the profile and the records, and
 * each one shows which records it used. It reminds and explains; it does not diagnose.
 */
export default function AskPage() {
  const { state, clearAsks, addAsk } = useStore();
  const toast = useToast();
  // The question being answered lives outside this page, so it is still shown after leaving and coming back.
  const pending = usePendingAsk();
  const busy = pending != null;
  const turns = state.asks;
  const hasProfile = state.profile != null;
  const bar = useRef<HTMLDivElement>(null);
  const spacer = useRef<HTMLDivElement>(null);

  // Keep the newest answer in view. Set directly: smooth scrolling stalls in background tabs.
  useLayoutEffect(() => {
    if (turns.length || busy) toBottom();
  }, [turns.length, busy]);
  useEffect(() => {
    if (!turns.length) return;
    const timers = [setTimeout(toBottom, 0), setTimeout(toBottom, 150)];
    return () => timers.forEach(clearTimeout);
    // only on arrival: later turns are handled by the layout effect above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The input bar is fixed, and it grows: with what is typed, and on a phone with a placeholder
  // that needs three lines. The room kept free at the end of the page follows its real height,
  // so the bar never sits on top of the last answer.
  useLayoutEffect(() => {
    const el = bar.current;
    const gap = spacer.current;
    if (!el || !gap) return;
    const fit = () => {
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      // the page already keeps some room of its own under its content
      const below = parseFloat(getComputedStyle(el.closest("main") ?? document.body).paddingBottom) || 0;
      gap.style.height = `${Math.max(0, el.offsetHeight + 16 - below)}px`;
      if (atBottom && window.scrollY > 0) toBottom();
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, [hasProfile]);

  if (!state.profile) return null;
  const suggestions = suggestedQuestions(state);

  const send = (question: string) => {
    if (question.trim() && !busy) void ask(question);
  };

  const clear = () => {
    const kept = turns;
    clearAsks();
    toast.show(L("已清空", "Cleared"), "neutral", {
      label: L("撤销", "Undo"),
      onClick: () => kept.forEach(({ id: _id, ...rest }) => (void _id, addAsk(rest))),
    });
  };

  return (
    <div>
      {/* the same top as the home's 问 AI sheet: the way back on the left, the name beside it, 清空 at the right */}
      <div className="flex min-h-12 items-center gap-1">
        <BackLink href="/">{L("返回", "Back")}</BackLink>
        <h1 className="t-heading min-w-0 flex-1 animate-fade-up truncate text-ink">{L("问医伴", "Ask VisitSmoothie")}</h1>
        {turns.length > 0 && !busy && (
          <TextButton tone="muted" className="-mr-2" onClick={clear}>
            {L("清空", "Clear")}
          </TextButton>
        )}
      </div>
      <p className="t-body mt-2 animate-fade-up text-ink-2">
        {L(
          "关于你自己的健康，记不清的都可以问我。我按你的档案和看病记录回答，不做诊断。",
          "Ask me what you can't quite remember about your own health. I answer from your records and your doctor visits. I do not diagnose.",
        )}
      </p>
      {getLang() === "en" && <p className="t-body mt-2 text-ink-2">AI replies are in Chinese for now.</p>}

      <div className="mt-6 space-y-3" aria-live="polite">
        {turns.map((t) => (
          <Turn key={t.id} turn={t} />
        ))}
        {pending && (
          <div className="animate-fade-up rounded-card bg-surface px-4 py-4">
            <Question text={pending.question} />
            {/* raised by rule the moment the question is sent: a warning never waits for an answer */}
            {pending.hint?.level === "urgent" && (
              <div className="mt-3">
                <HintBanner hint={pending.hint} />
              </div>
            )}
            <p className="mt-3 flex items-center gap-3 text-lg text-ink-2">
              <span>{L("正在查你的记录", "Checking your records")}</span>
              <TypingDots label={L("医伴正在查记录", "VisitSmoothie is checking your records")} />
            </p>
          </div>
        )}
      </div>

      {!busy && suggestions.length > 0 && (
        <section className="mt-6 animate-fade-up" aria-label={L("可以这样问", "You can ask")}>
          <p className="text-base font-medium text-ink-2">{turns.length ? L("还可以问", "You can also ask") : L("可以这样问", "You can ask")}</p>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {suggestions.map((q, i) => (
              <button
                key={q}
                type="button"
                onClick={() => send(q)}
                className={`press material rise-${Math.min(i + 1, 4)} min-h-12 rounded-xl border border-line/80 px-4 py-2 text-left text-base leading-snug font-medium text-brand-800 transition duration-200 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200`}
              >
                {q}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Nothing on file yet: say what would make this page useful, instead of an empty screen. */}
      {!busy && !turns.length && !suggestions.length && (
        <Card tone="raised" className="mt-6 animate-pop px-5 py-8 text-center">
          <IconTile size="xl" tone="brand" className="mx-auto mb-5 animate-breathe">
            <MessageCircleQuestion />
          </IconTile>
          <p className="t-lead mx-auto max-w-md text-ink">
            {L(
              "现在还没有看病记录。看完医生后存一下，以后就能问我「上次医生说了什么」「这个药怎么吃」。",
              "There are no doctor visits on file yet. Save one after you see a doctor. Then you can ask me what the doctor said, or how to take a medicine.",
            )}
          </p>
          <div className="mt-6 flex justify-center">
            <LinkButton href="/after" variant="secondary" className="press">
              {L("看完医生了", "I've seen the doctor")}
            </LinkButton>
          </div>
          <p className="t-body mx-auto mt-6 max-w-md text-ink-2">
            {L("一般的问题现在也可以问，比如某个药饭前吃还是饭后吃。", "You can ask general questions now too, such as whether a medicine is taken before or after meals.")}
          </p>
        </Card>
      )}

      <div ref={spacer} className="h-36" aria-hidden="true" />
      {/* docked on the tab bar like the input of the pre chat; the deeper bottom padding keeps the tab bar's raised mark clear */}
      <div ref={bar} className="glass no-print phone-fixed z-20 shadow-[0_-1px_0_var(--color-line)]" style={{ bottom: "var(--tab-bar)" }}>
        <div className="px-4 pt-2.5 pb-8">
          <SpeakInput
            placeholder={L("说一句或打一句，比如：上次医生说了什么", "Ask a question")}
            ariaLabel={L("问医伴", "Ask VisitSmoothie")}
            onSubmit={send}
            disabled={busy}
          />
          <p className="mt-1.5 text-center text-base text-ink-2">{L("急事不要等我回答，直接拨打 120。", "Emergency? Don't wait for me. Call 120.")}</p>
        </div>
      </div>
    </div>
  );
}

/** The question at the head of its answer, as on the home's 问 AI sheet. */
function Question({ text }: { text: string }) {
  return <p className="t-heading whitespace-pre-wrap text-ink">{text}</p>;
}

/** A piece that starts a line of its own even without a label in front of it. */
const STANDS_ALONE = /^(这次|记下的最高体温|报告上没有标出异常|（中间还有|这些范围)/;

/**
 * A record as lines to read. It is kept as one text, parts joined by "；"; a part with a short
 * label ("医生叮嘱：…", "9月25日：…") starts a line, and what follows without one belongs to it.
 */
function recordLines(text: string): string[] {
  const lines: string[] = [];
  for (const part of text.split("；")) {
    if (!part || (part === "档案" && !lines.length)) continue;
    if (!lines.length || /^[^：；]{1,14}：/.test(part) || STANDS_ALONE.test(part)) lines.push(part);
    else lines[lines.length - 1] += `；${part}`;
  }
  return lines;
}

const chipCls =
  "press inline-flex min-h-12 items-center gap-1.5 rounded-full bg-brand-50 px-3.5 text-left text-base font-medium text-brand-800 transition hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200";

function Turn({ turn: t }: { turn: AskTurn }) {
  // which of the records under the answer is open
  const [open, setOpen] = useState<number | null>(null);
  const shown = open != null ? t.sources[open] : undefined;
  return (
    <div className="animate-fade-up rounded-card bg-surface px-4 py-4">
      <Question text={t.question} />
      {t.hint && t.hint.level === "urgent" && (
        <div className="mt-3">
          <HintBanner hint={t.hint} />
        </div>
      )}
      <div className="mt-2 min-w-0">
        <p className="t-body whitespace-pre-wrap text-ink">{t.answer}</p>
        {t.sources.length > 0 && (
          <div className="mt-3.5 border-t border-line pt-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-base text-ink-2">{L("我查的是", "I checked")}</span>
              {t.sources.map((s, i) =>
                s.text ? (
                  // the record opens right here, as it stood when the answer was given
                  <button key={`${s.href}-${i}`} type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)} className={chipCls}>
                    <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {s.label}
                    {open === i ? <ChevronUp className="h-4 w-4 shrink-0" aria-hidden="true" /> : <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  </button>
                ) : (
                  // an answer saved before records were kept with it: all there is to do is go and look
                  <Link key={`${s.href}-${i}`} href={s.href} className={chipCls}>
                    <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {s.label}
                  </Link>
                ),
              )}
            </div>
            {shown?.text && (
              <div className="mt-3 animate-fade-up rounded-2xl border border-line/80 bg-surface-2 px-4 pt-3.5 pb-1">
                <ul className="space-y-1.5 text-base leading-relaxed text-ink">
                  {recordLines(shown.text).map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
                <TextLink href={shown.href} className="-ml-2">
                  {L("打开这条记录", "Open this record")}
                </TextLink>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
