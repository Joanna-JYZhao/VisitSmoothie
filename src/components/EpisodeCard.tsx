"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Frown, History, Meh, Smile, type LucideIcon } from "lucide-react";
import type { Episode } from "@/lib/types";
import { useStore } from "@/lib/store";
import {
  CHECKIN_ANSWERS,
  answerCheckIn,
  checkInQuestion,
  currentHint,
  dayLabel,
  isCheckInDue,
  isLongRunning,
  recheckDue,
  type CheckInAnswer,
  type CheckInOutcome,
} from "@/lib/checkin";
import { sendMessage, useRelatedEpisodes, useReplyPending } from "@/lib/episodeAI";
import { L, getLang } from "@/lib/lang";
import { cn, episodeLine, fmtDate, hoursBetween, relativeTime, sortedEntries } from "@/lib/utils";
import { HintBanner } from "./HintBanner";
import { LogoMark } from "./Logo";
import { SpeakInput } from "./SpeakInput";
import { useToast } from "./Toast";
import { Badge, Button, Card, IconTile, LinkButton, TextButton, TextLink, TypingDots, focusRing } from "./ui";

/*
 * The three answers are told apart by a face as well as by words, so nobody has to read to choose.
 * `en` is what the button shows in English. What is recorded is still the Chinese label from
 * CHECKIN_ANSWERS, which the rules read.
 */
const ANSWER_LOOK: Record<CheckInAnswer, { Icon: LucideIcon; face: string; hover: string; en: string }> = {
  better: { Icon: Smile, face: "bg-good-bg text-good", hover: "hover:border-good/60 hover:bg-good-bg/60", en: "Much better" },
  same: { Icon: Meh, face: "bg-surface-2 text-ink-2", hover: "hover:border-brand-300 hover:bg-brand-50/70", en: "About the same" },
  worse: { Icon: Frown, face: "bg-danger-bg text-danger", hover: "hover:border-danger/60 hover:bg-danger-bg/60", en: "Worse" },
};

/**
 * The card for one symptom being tracked. It is the whole home screen for most people, and it
 * changes with the course of the illness: it asks, reacts to the answer, says when to see a
 * doctor, remembers what the doctor said, and keeps asking until the user says they are well.
 *
 * `quiet`: another card on the screen already offers 给医生看 and 看完医生了 for today's
 * appointment, so this one leaves them out. Two buttons with the same name must not lead to two places.
 */
export function EpisodeCard({ episode: e, now, quiet = false }: { episode: Episode; now: number; quiet?: boolean }) {
  const { state, restoreEpisode, setStatus } = useStore();
  const router = useRouter();
  const toast = useToast();
  const pending = useReplyPending(e.id);
  const earlier = useRelatedEpisodes(e)[0];
  // The answer just tapped, kept so the reaction stays on screen once the question is no longer due.
  const [answered, setAnswered] = useState<{ outcome: CheckInOutcome; before: Episode; notYet?: boolean } | null>(null);

  const due = isCheckInDue(e, state.settings, now);
  const recheck = recheckDue(e, now);
  const hint = currentHint(e, now);
  const next = isLongRunning(e, now) ? L("下周", "next week") : L("明天", "tomorrow");
  const english = getLang() === "en";
  // A conversation left half-way only holds the card for a few hours; after that the daily question takes over.
  const lastMessage = e.messages[e.messages.length - 1];
  const unfinished = e.done === false && lastMessage != null && hoursBetween(lastMessage.at, now) < 6;
  const emphasize = Boolean(answered?.outcome.suggestVisit) || recheck || hint != null;
  const v = e.visit;
  // what was last said, unless the doctor's visit has made it old news
  const newest = sortedEntries(e, "desc")[0];
  const lastEntry = newest && (!v || new Date(newest.at).getTime() > new Date(v.recordedAt).getTime()) ? newest : null;
  // while the card is asking "算是好了吗？" there is one way to say yes, not two
  const asking = answered?.outcome.answer === "better" && !answered.notYet;

  const answer = (a: CheckInAnswer) => {
    const outcome = answerCheckIn(e, a);
    restoreEpisode(outcome.episode);
    setAnswered({ outcome, before: e });
  };

  const well = () => {
    const snapshot = e;
    setStatus(e.id, "resolved");
    setAnswered(null);
    toast.show(L(`「${e.title}」已存档。以后再犯，我会把这次的记录找出来`, `"${e.title}" is filed. If it comes back, I'll bring up this record.`), "good", {
      label: L("撤销", "Undo"),
      onClick: () => restoreEpisode(snapshot),
    });
  };

  // "更严重了" is followed by one sentence about what changed; the conversation takes it from there.
  const tellMore = (text: string) => {
    void sendMessage(e.id, text);
    router.push(`/episodes/${e.id}`);
  };

  return (
    <Card tone="raised" className="animate-fade-up p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <h2 className="t-title text-ink">{e.title}</h2>
          <Badge>{dayLabel(e, now)}</Badge>
        </div>
        <TextLink href={`/episodes/${e.id}/detail`} className="-mt-2 -mr-2 shrink-0">
          {L("详情", "Details")}
          <ChevronRight className="h-5 w-5" />
        </TextLink>
      </div>

      {v ? (
        <dl className="mt-5 divide-y divide-line rounded-2xl border border-line/80 bg-surface-2/60 px-4 text-base leading-relaxed text-ink [&>div]:py-2.5">
          <div>
            <dt className="inline text-ink-2">{L("看过医生：", "Seen a doctor: ")}</dt>
            <dd className="inline font-medium">{v.diagnosis}</dd>
          </div>
          {v.treatment && v.treatment !== "没有开药" && (
            <div>
              <dt className="inline text-ink-2">{L("处理和用药：", "Treatment and medicines: ")}</dt>
              <dd className="inline">{v.treatment}</dd>
            </div>
          )}
          {v.advice && (
            <div>
              <dt className="inline text-ink-2">{L("医生叮嘱：", "Doctor's advice: ")}</dt>
              <dd className="inline">{v.advice}</dd>
            </div>
          )}
          {(v.followUp || v.followUpAt) && (
            <div>
              <dt className="inline text-ink-2">{L("复查：", "Follow-up visit: ")}</dt>
              <dd className="inline">
                {v.followUp ?? L("到时候去复查", "Go back when it is time")}
                {v.followUpAt ? L(`（${fmtDate(v.followUpAt)}提醒你）`, ` (I'll remind you on ${fmtDate(v.followUpAt)})`) : ""}
              </dd>
            </div>
          )}
        </dl>
      ) : (
        earlier && (
          <TextLink
            href={`/episodes/${earlier.id}/detail`}
            tone="plain"
            className="press mt-4 flex w-full items-start gap-3 rounded-2xl bg-info-bg px-4 py-3 hover:no-underline"
          >
            <IconTile tone="info" size="sm" className="bg-transparent!">
              <History />
            </IconTile>
            <span className="min-w-0 flex-1 pt-1 text-base leading-relaxed font-normal">
              {L(
                `以前有过类似的：${fmtDate(earlier.startedAt, { year: true })}「${earlier.title}」，${episodeLine(earlier)}`,
                `Similar before: ${fmtDate(earlier.startedAt, { year: true })}, "${earlier.title}", ${episodeLine(earlier)}`,
              )}
            </span>
            <ChevronRight className="mt-2 h-5 w-5 shrink-0 text-ink-3" />
          </TextLink>
        )
      )}

      {hint && <HintBanner hint={hint} className="mt-4" />}
      {recheck && (
        <p className="mt-4 rounded-2xl bg-warn-bg px-4 py-3.5 text-lg leading-relaxed font-medium text-ink">
          {L(
            `到医生说的复查时间了${v?.followUp ? `：${v.followUp}` : "。"}`,
            `It is time for the follow-up visit your doctor asked for${v?.followUp ? `: ${v.followUp}` : "."}`,
          )}
        </p>
      )}

      <div className="mt-6 border-t border-line pt-6">
        {pending ? (
          <p className="flex min-h-12 items-center gap-3 text-lg text-ink-2">
            <TypingDots /> {L("医伴正在想", "VisitSmoothie is thinking")}
          </p>
        ) : unfinished ? (
          <>
            <p className="t-lead font-semibold text-ink">{L("还有一两句想问你。", "I have one or two more questions.")}</p>
            <LinkButton href={`/episodes/${e.id}`} variant="secondary" size="lg" className="press mt-4 w-full">
              {L("接着说", "Continue")}
            </LinkButton>
          </>
        ) : answered ? (
          <>
            {answered.outcome.answer === "better" && !answered.notYet ? (
              <>
                <p className="t-lead animate-fade-up font-semibold text-ink">{L("太好了。算是好了吗？", "That is good. Are you well now?")}</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button size="lg" className="press" onClick={well}>
                    {L("已经好了", "Yes, I'm well")}
                  </Button>
                  <Button size="lg" variant="secondary" className="press" onClick={() => setAnswered({ ...answered, notYet: true })}>
                    {L("还没全好", "Not quite yet")}
                  </Button>
                </div>
              </>
            ) : (
              // when the reply is the warning itself, the banner above has already said it
              answered.outcome.reply !== answered.outcome.hint?.text && (
                <p className="t-lead animate-fade-up font-semibold text-ink">
                  {answered.notYet ? L(`好，${next}我再来问你。`, `OK, I'll ask again ${next}.`) : answered.outcome.reply}
                </p>
              )
            )}
            {answered.outcome.answer === "worse" && (
              <SpeakInput
                className="mt-4"
                placeholder={L("哪里更严重了？说一句，比如：烧到 38.6，开始咳嗽", "What got worse? One sentence, e.g. fever up to 38.6, started coughing")}
                ariaLabel={L("哪里更严重了", "What got worse")}
                onSubmit={tellMore}
              />
            )}
            <div className="mt-1 flex flex-wrap gap-x-3">
              <TextButton
                onClick={() => {
                  restoreEpisode(answered.before);
                  setAnswered(null);
                }}
              >
                {L("点错了，重选", "Wrong tap, choose again")}
              </TextButton>
              {answered.outcome.answer !== "worse" && <TextLink href={`/episodes/${e.id}`}>{L("想多说两句", "Tell me more")}</TextLink>}
            </div>
          </>
        ) : due ? (
          <>
            <p className="flex items-center gap-2 text-base font-semibold text-brand-700">
              <LogoMark className="h-6 w-6 animate-breathe" />
              {L("VisitSmoothie 问你", "VisitSmoothie asks")}
            </p>
            <p className="t-lead mt-1.5 font-semibold text-ink">{checkInQuestion(e, now)}</p>
            <div className="mt-4 grid grid-cols-3 gap-2.5">
              {CHECKIN_ANSWERS.map((a) => {
                const { Icon, face, hover, en } = ANSWER_LOOK[a.key];
                return (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => answer(a.key)}
                    className={cn(
                      "press material flex min-h-[5.5rem] flex-col items-center gap-2 rounded-[20px] border border-line/80 px-1 py-3 leading-tight font-semibold text-ink transition duration-200",
                      // Chinese answers are one short line. English ones run to two: the words get a
                      // two-line space of their own, so the three faces stay level.
                      english ? "justify-start text-base" : "justify-center text-lg whitespace-nowrap max-[350px]:text-base",
                      focusRing,
                      hover,
                    )}
                  >
                    <span aria-hidden="true" className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", face)}>
                      <Icon className="h-6 w-6" />
                    </span>
                    {english ? <span className="flex min-h-[2.5em] items-center text-center text-balance">{en}</span> : a.label}
                  </button>
                );
              })}
            </div>
            <TextLink href={`/episodes/${e.id}`} className="mt-2 -ml-2">
              {L("想多说两句", "Tell me more")}
            </TextLink>
          </>
        ) : (
          <>
            {lastEntry && (
              <p className="text-lg leading-relaxed text-ink">
                {L(`${relativeTime(lastEntry.at, now)}记的：${lastEntry.note}`, `Noted ${relativeTime(lastEntry.at, now)}: ${lastEntry.note}`)}
              </p>
            )}
            <p className="mt-1.5 text-lg text-ink-2">{L(`${next}我再来问你。`, `I'll ask again ${next}.`)}</p>
            <TextLink href={`/episodes/${e.id}`} className="mt-1">
              {L("想多说两句", "Tell me more")}
            </TextLink>
          </>
        )}
      </div>

      {quiet ? (
        !asking && (
          <div className="mt-1 flex justify-end">
            <TextButton onClick={well}>{L("我好了", "I'm well now")}</TextButton>
          </div>
        )
      ) : (
        <>
          <LinkButton href={`/doctor/${e.id}`} variant={emphasize ? "primary" : "outline"} size="lg" className="press mt-4 w-full">
            {L("给医生看", "Show the doctor")}
          </LinkButton>
          <div className="mt-2 -mx-2 flex flex-wrap items-center justify-between">
            <TextLink href={`/after?episode=${e.id}`}>{v ? L("又看了医生", "Seen the doctor again") : L("看完医生了", "I've seen the doctor")}</TextLink>
            {!asking && <TextButton onClick={well}>{L("我好了", "I'm well now")}</TextButton>}
          </div>
        </>
      )}
    </Card>
  );
}
