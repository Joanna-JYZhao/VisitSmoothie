"use client";

import { Fragment, useEffect, useLayoutEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronRight, CircleCheck, FileSearch, History } from "lucide-react";
import type { ChatMessage, Episode } from "@/lib/types";
import { useStore } from "@/lib/store";
import { requestReply, sendMessage, useRelatedEpisodes, useReplyPending } from "@/lib/episodeAI";
import { cn, episodeLine, fmtDate, fmtTime, textOverlap } from "@/lib/utils";
import { HintBanner } from "@/components/HintBanner";
import { SpeakInput } from "@/components/SpeakInput";
import { useToast } from "@/components/Toast";
import { Button, Card, IconTile, LinkButton, Notice, PageHeader, TextButton, TextLink, TypingDots } from "@/components/ui";

export default function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useStore();
  const episode = state.episodes.find((e) => e.id === id);
  if (!episode) {
    return (
      <Notice icon={<FileSearch className="h-6 w-6" />} title="找不到这条记录" action={<LinkButton href="/">回到今天</LinkButton>}>
        它可能已经被删除了。
      </Notice>
    );
  }
  return <Conversation episode={episode} />;
}

const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();

/*
 * The bubbles: what the patient said sits on the right in the brand gradient, what Yiban said on
 * the left as a white sheet. The time runs small under each, the way a messaging app sets it.
 */
function Bubble({ m }: { m: ChatMessage }) {
  const mine = m.role === "user";
  const checkin = m.content.startsWith("【定时记录】");
  const text = checkin ? m.content.replace(/^【定时记录】/, "") : m.content;
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[86%] animate-fade-up rounded-[22px] px-4.5 py-3 text-lg leading-relaxed whitespace-pre-wrap",
          mine
            ? "rounded-br-md bg-linear-to-b from-brand-600 to-brand-650 text-white shadow-btn"
            : "material rounded-bl-md border border-line/80 text-ink",
        )}
      >
        {text}
        <span className={cn("mt-1 block text-base tabular", mine ? "text-white/90" : "text-ink-2")}>
          {checkin ? "回答追问 · " : ""}
          {fmtTime(m.at)}
        </span>
      </div>
    </div>
  );
}

function Conversation({ episode: e }: { episode: Episode }) {
  const { setStatus, restoreEpisode, deleteEpisode } = useStore();
  const router = useRouter();
  const toast = useToast();
  const pending = useReplyPending(e.id);
  const related = useRelatedEpisodes(e);
  const last = e.messages[e.messages.length - 1];
  const active = e.status === "active";
  const waiting = last?.role === "user";

  // Whenever the user has the last word, the assistant owes a reply (first message, or a reload mid-request).
  useEffect(() => {
    if (active && waiting && !pending) void requestReply(e.id);
  }, [e.id, active, waiting, pending, last?.id]);

  // Keep the newest message in view. Set directly: smooth scrolling stalls in background tabs.
  useLayoutEffect(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  }, [e.messages.length, pending, e.lastHint?.text]);
  // On arrival the router scrolls a new page to the top after this component's effects have run,
  // which would leave a long conversation showing its oldest messages. Go down once more afterwards.
  useEffect(() => {
    const down = () => window.scrollTo(0, document.documentElement.scrollHeight);
    const timers = [setTimeout(down, 0), setTimeout(down, 150)];
    return () => timers.forEach(clearTimeout);
  }, [e.id]);

  const finished = active && e.done !== false && !pending && !waiting;
  const quick = active && !pending && !waiting ? (e.suggestedReplies ?? []) : [];
  const serious = e.lastHint != null && e.lastHint.level !== "info";
  const prior = related[0];
  // The same advice is not said twice: when the assistant's last message already says what the
  // note says, the note is left out. An alarm is always shown.
  const lastReply = [...e.messages].reverse().find((m) => m.role === "assistant")?.content ?? "";
  const showHint =
    e.lastHint != null && (e.lastHint.level === "urgent" || textOverlap(e.lastHint.text, lastReply) < 0.4);
  // a symptom started by a slip of the finger can be taken back right here, while it is still one line long
  const justStarted = active && e.messages.filter((m) => m.role === "user").length === 1 && !e.visit;
  const discard = () => {
    const snapshot = e;
    deleteEpisode(e.id);
    router.replace("/");
    toast.show(`没有记「${e.title}」`, "neutral", { label: "撤销", onClick: () => restoreEpisode(snapshot) });
  };

  const well = () => {
    const snapshot = e;
    setStatus(e.id, "resolved");
    toast.show(`「${e.title}」已存档。以后再犯，我会把这次的记录找出来`, "good", {
      label: "撤销",
      onClick: () => restoreEpisode(snapshot),
    });
    router.push("/");
  };

  return (
    <div>
      <PageHeader
        className="mb-5"
        back={{ href: "/" }}
        action={
          <TextLink href={`/episodes/${e.id}/detail`} className="-mr-2">
            详情
            <ChevronRight className="h-5 w-5" />
          </TextLink>
        }
        title={e.title}
        aside={
          justStarted && (
            <TextButton tone="muted" className="-mr-2" onClick={discard}>
              点错了，不记这条
            </TextButton>
          )
        }
      />

      {prior && (
        <TextLink
          href={`/episodes/${prior.id}/detail`}
          tone="plain"
          className="press mb-6 flex w-full items-start gap-3 rounded-2xl bg-info-bg px-4 py-3.5 hover:no-underline"
        >
          <IconTile tone="info" size="sm" className="bg-transparent!">
            <History />
          </IconTile>
          <span className="min-w-0 flex-1 pt-1 text-base leading-relaxed font-normal">
            你以前有过类似的情况：{fmtDate(prior.startedAt, { year: true })}「{prior.title}」，{episodeLine(prior)}。
          </span>
          <ChevronRight className="mt-2 h-5 w-5 shrink-0 text-ink-3" />
        </TextLink>
      )}

      <div className="space-y-3.5" aria-live="polite">
        {e.messages.map((m, i) => (
          <Fragment key={m.id}>
            {(i === 0 || !sameDay(e.messages[i - 1].at, m.at)) && (
              <p className="mx-auto mt-4 mb-2 w-fit rounded-full bg-surface-3/80 px-4 py-1 text-base font-medium text-ink-2">{fmtDate(m.at, { weekday: true })}</p>
            )}
            <Bubble m={m} />
          </Fragment>
        ))}
        {pending && (
          <div className="flex justify-start">
            <div className="material animate-pop rounded-[22px] rounded-bl-md border border-line/80 px-5 py-4">
              <TypingDots />
            </div>
          </div>
        )}
      </div>

      {showHint && e.lastHint && <HintBanner hint={e.lastHint} className="mt-5" />}

      {quick.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-2.5" aria-label="可以直接点的回答">
          {quick.map((q, i) => (
            <Button key={q} variant="secondary" size="tile" className={cn("animate-rise", `rise-${Math.min(i + 1, 4)}`)} onClick={() => void sendMessage(e.id, q)}>
              {q}
            </Button>
          ))}
        </div>
      )}

      {finished && (
        <div className="mt-5 grid animate-fade-up grid-cols-2 gap-2.5">
          <LinkButton href={`/doctor/${e.id}`} variant={serious ? "primary" : "secondary"} size="lg" className="press">
            给医生看
          </LinkButton>
          <LinkButton href="/" variant={serious ? "secondary" : "primary"} size="lg" className="press">
            回到首页
          </LinkButton>
          <div className="col-span-2 flex justify-center">
            <TextButton onClick={well}>已经好了，结束这次记录</TextButton>
          </div>
        </div>
      )}

      {active ? (
        <>
          {/*
           * The dock: a frosted pill held near the foot of the window while the conversation scrolls
           * under it. Sticky rather than fixed, so it stays in the page's own column and keeps working
           * inside an animated or transformed ancestor.
           */}
          <div className="no-print sticky bottom-4 z-20 mt-6 sm:bottom-5">
            <div className="glass mx-auto w-full max-w-[36rem] rounded-[30px] border border-white/70 p-1.5 shadow-float">
              <SpeakInput
                placeholder={finished ? "还想补充什么，说或者打字" : "说一句或打一句"}
                ariaLabel="对医伴说"
                onSubmit={(t) => void sendMessage(e.id, t)}
                disabled={pending}
              />
            </div>
          </div>
        </>
      ) : (
        <Card className="mt-8 animate-fade-up p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <IconTile tone="good" size="lg">
              <CircleCheck />
            </IconTile>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="t-heading text-ink">
                这次已经好了{e.resolvedAt ? `（${fmtDate(e.resolvedAt)}）` : ""}。
              </p>
              <p className="t-body mt-1.5 text-ink-2">又不舒服了？可以接着这次的记录继续。</p>
            </div>
          </div>
          <Button variant="secondary" className="press mt-5 w-full sm:w-auto" onClick={() => setStatus(e.id, "active")}>
            又不舒服了，接着记
          </Button>
        </Card>
      )}
    </div>
  );
}
