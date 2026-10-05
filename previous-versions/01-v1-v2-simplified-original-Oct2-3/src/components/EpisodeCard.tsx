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
import { cn, episodeLine, fmtDate, hoursBetween, relativeTime, sortedEntries } from "@/lib/utils";
import { HintBanner } from "./HintBanner";
import { LogoMark } from "./Logo";
import { SpeakInput } from "./SpeakInput";
import { useToast } from "./Toast";
import { Badge, Button, Card, LinkButton, TextButton, TextLink, TypingDots, focusRing } from "./ui";

/* The three answers are told apart by a face as well as by words, so nobody has to read to choose. */
const ANSWER_LOOK: Record<CheckInAnswer, { Icon: LucideIcon; face: string; hover: string }> = {
  better: { Icon: Smile, face: "bg-good-bg text-good", hover: "hover:border-good hover:bg-good-bg" },
  same: { Icon: Meh, face: "bg-surface-2 text-ink-2", hover: "hover:border-brand-400 hover:bg-brand-50" },
  worse: { Icon: Frown, face: "bg-danger-bg text-danger", hover: "hover:border-danger hover:bg-danger-bg" },
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
  const next = isLongRunning(e, now) ? "下周" : "明天";
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
    toast.show(`「${e.title}」已存档。以后再犯，我会把这次的记录找出来`, "good", {
      label: "撤销",
      onClick: () => restoreEpisode(snapshot),
    });
  };

  // "更严重了" is followed by one sentence about what changed; the conversation takes it from there.
  const tellMore = (text: string) => {
    void sendMessage(e.id, text);
    router.push(`/episodes/${e.id}`);
  };

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <h2 className="text-2xl leading-tight font-semibold text-ink">{e.title}</h2>
          <Badge>{dayLabel(e, now)}</Badge>
        </div>
        <TextLink href={`/episodes/${e.id}/detail`} className="-mt-2 -mr-2 shrink-0">
          详情
          <ChevronRight className="h-5 w-5" />
        </TextLink>
      </div>

      {v ? (
        <dl className="mt-3 space-y-1 rounded-2xl bg-surface-2 px-4 py-3 text-base leading-relaxed text-ink">
          <div>
            <dt className="inline text-ink-2">看过医生：</dt>
            <dd className="inline font-medium">{v.diagnosis}</dd>
          </div>
          {v.treatment && v.treatment !== "没有开药" && (
            <div>
              <dt className="inline text-ink-2">处理和用药：</dt>
              <dd className="inline">{v.treatment}</dd>
            </div>
          )}
          {v.advice && (
            <div>
              <dt className="inline text-ink-2">医生叮嘱：</dt>
              <dd className="inline">{v.advice}</dd>
            </div>
          )}
          {(v.followUp || v.followUpAt) && (
            <div>
              <dt className="inline text-ink-2">复查：</dt>
              <dd className="inline">
                {v.followUp ?? "到时候去复查"}
                {v.followUpAt ? `（${fmtDate(v.followUpAt)}提醒你）` : ""}
              </dd>
            </div>
          )}
        </dl>
      ) : (
        earlier && (
          <TextLink
            href={`/episodes/${earlier.id}/detail`}
            tone="plain"
            className="mt-3 flex w-full items-start gap-2.5 rounded-2xl bg-info-bg px-4 py-3 hover:no-underline"
          >
            <History className="mt-0.5 h-5 w-5 shrink-0 text-info" />
            <span className="min-w-0 flex-1 text-base leading-relaxed font-normal">
              以前有过类似的：{fmtDate(earlier.startedAt, { year: true })}「{earlier.title}」，{episodeLine(earlier)}
            </span>
            <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-ink-3" />
          </TextLink>
        )
      )}

      {hint && <HintBanner hint={hint} className="mt-3" />}
      {recheck && (
        <p className="mt-3 rounded-2xl bg-warn-bg px-4 py-3.5 text-lg leading-relaxed font-medium text-ink">
          到医生说的复查时间了{v?.followUp ? `：${v.followUp}` : "。"}
        </p>
      )}

      <div className="mt-4 border-t border-line pt-4">
        {pending ? (
          <p className="flex items-center gap-3 text-lg text-ink-2">
            <TypingDots /> 医伴正在想
          </p>
        ) : unfinished ? (
          <>
            <p className="text-xl leading-relaxed font-semibold text-ink">还有一两句想问你。</p>
            <LinkButton href={`/episodes/${e.id}`} variant="secondary" size="lg" className="mt-3 w-full">
              接着说
            </LinkButton>
          </>
        ) : answered ? (
          <>
            {answered.outcome.answer === "better" && !answered.notYet ? (
              <>
                <p className="text-xl leading-relaxed font-semibold text-ink">太好了。算是好了吗？</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button size="lg" onClick={well}>
                    已经好了
                  </Button>
                  <Button size="lg" variant="secondary" onClick={() => setAnswered({ ...answered, notYet: true })}>
                    还没全好
                  </Button>
                </div>
              </>
            ) : (
              // when the reply is the warning itself, the banner above has already said it
              answered.outcome.reply !== answered.outcome.hint?.text && (
                <p className="text-xl leading-relaxed font-semibold text-ink">
                  {answered.notYet ? `好，${next}我再来问你。` : answered.outcome.reply}
                </p>
              )
            )}
            {answered.outcome.answer === "worse" && (
              <SpeakInput
                className="mt-3"
                placeholder="哪里更严重了？说一句，比如：烧到 38.6，开始咳嗽"
                ariaLabel="哪里更严重了"
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
                点错了，重选
              </TextButton>
              {answered.outcome.answer !== "worse" && <TextLink href={`/episodes/${e.id}`}>想多说两句</TextLink>}
            </div>
          </>
        ) : due ? (
          <>
            <p className="flex items-center gap-2 text-base font-medium text-brand-700">
              <LogoMark className="h-6 w-6" />
              医伴问你
            </p>
            <p className="mt-1 text-xl leading-relaxed font-semibold text-ink">{checkInQuestion(e, now)}</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {CHECKIN_ANSWERS.map((a) => {
                const { Icon, face, hover } = ANSWER_LOOK[a.key];
                return (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => answer(a.key)}
                    className={cn(
                      "flex min-h-[5.25rem] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-line-strong bg-surface px-1 py-2.5 text-lg leading-tight font-semibold whitespace-nowrap text-ink shadow-edge transition active:scale-[0.97] max-[350px]:text-base",
                      focusRing,
                      hover,
                    )}
                  >
                    <span aria-hidden="true" className={cn("flex h-9 w-9 items-center justify-center rounded-full", face)}>
                      <Icon className="h-6 w-6" />
                    </span>
                    {a.label}
                  </button>
                );
              })}
            </div>
            <TextLink href={`/episodes/${e.id}`} className="mt-1">
              想多说两句
            </TextLink>
          </>
        ) : (
          <>
            {lastEntry && (
              <p className="text-lg leading-relaxed text-ink">
                {relativeTime(lastEntry.at, now)}记的：{lastEntry.note}
              </p>
            )}
            <p className="mt-1 text-lg text-ink-2">{next}我再来问你。</p>
            <TextLink href={`/episodes/${e.id}`} className="mt-1">
              想多说两句
            </TextLink>
          </>
        )}
      </div>

      {quiet ? (
        !asking && (
          <div className="mt-1 flex justify-end">
            <TextButton onClick={well}>我好了</TextButton>
          </div>
        )
      ) : (
        <>
          <LinkButton href={`/doctor/${e.id}`} variant={emphasize ? "primary" : "outline"} size="lg" className="mt-3 w-full">
            给医生看
          </LinkButton>
          <div className="mt-1 flex items-center justify-between">
            <TextLink href={`/after?episode=${e.id}`}>{v ? "又看了医生" : "看完医生了"}</TextLink>
            {!asking && <TextButton onClick={well}>我好了</TextButton>}
          </div>
        </>
      )}
    </Card>
  );
}
