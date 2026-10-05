"use client";

import { Fragment, useEffect, useLayoutEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronRight, FileSearch, History } from "lucide-react";
import type { ChatMessage, Episode } from "@/lib/types";
import { useStore } from "@/lib/store";
import { requestReply, sendMessage, useRelatedEpisodes, useReplyPending } from "@/lib/episodeAI";
import { cn, episodeLine, fmtDate, fmtTime, textOverlap } from "@/lib/utils";
import { HintBanner } from "@/components/HintBanner";
import { SpeakInput } from "@/components/SpeakInput";
import { useToast } from "@/components/Toast";
import { Button, LinkButton, Notice, PageHeader, TextButton, TextLink, TypingDots } from "@/components/ui";

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

function Bubble({ m }: { m: ChatMessage }) {
  const mine = m.role === "user";
  const checkin = m.content.startsWith("【定时记录】");
  const text = checkin ? m.content.replace(/^【定时记录】/, "") : m.content;
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[86%] rounded-3xl px-4 py-3 text-lg leading-relaxed whitespace-pre-wrap",
          mine ? "rounded-br-lg bg-brand-600 text-white shadow-edge" : "rounded-bl-lg border border-line bg-surface text-ink shadow-card",
        )}
      >
        {text}
        <span className={cn("mt-1 block text-base tabular-nums", mine ? "text-white" : "text-ink-2")}>
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
        className="mb-4"
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
          className="mb-4 flex w-full items-start gap-3 rounded-2xl border border-info/20 bg-info-bg px-4 py-3 hover:no-underline"
        >
          <History className="mt-0.5 h-6 w-6 shrink-0 text-info" />
          <span className="min-w-0 flex-1 text-base leading-relaxed font-normal">
            你以前有过类似的情况：{fmtDate(prior.startedAt, { year: true })}「{prior.title}」，{episodeLine(prior)}。
          </span>
          <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-ink-3" />
        </TextLink>
      )}

      <div className="space-y-3" aria-live="polite">
        {e.messages.map((m, i) => (
          <Fragment key={m.id}>
            {(i === 0 || !sameDay(e.messages[i - 1].at, m.at)) && (
              <p className="mx-auto mt-1 w-fit rounded-full bg-ink/5 px-3.5 py-0.5 text-base text-ink-2">{fmtDate(m.at, { weekday: true })}</p>
            )}
            <Bubble m={m} />
          </Fragment>
        ))}
        {pending && (
          <div className="flex justify-start">
            <div className="rounded-3xl rounded-bl-lg border border-line bg-surface px-5 py-4 shadow-card">
              <TypingDots />
            </div>
          </div>
        )}
      </div>

      {showHint && e.lastHint && <HintBanner hint={e.lastHint} className="mt-4" />}

      {quick.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2" aria-label="可以直接点的回答">
          {quick.map((q) => (
            <Button key={q} variant="secondary" size="tile" onClick={() => void sendMessage(e.id, q)}>
              {q}
            </Button>
          ))}
        </div>
      )}

      {finished && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <LinkButton href={`/doctor/${e.id}`} variant={serious ? "primary" : "secondary"} size="lg">
            给医生看
          </LinkButton>
          <LinkButton href="/" variant={serious ? "secondary" : "primary"} size="lg">
            回到首页
          </LinkButton>
          <div className="col-span-2 flex justify-center">
            <TextButton onClick={well}>已经好了，结束这次记录</TextButton>
          </div>
        </div>
      )}

      {active ? (
        <>
          <div className="h-32" aria-hidden="true" />
          <div className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas/95 backdrop-blur">
            <div className="mx-auto w-full max-w-[36rem] px-4 pt-3 pb-4">
              <SpeakInput
                placeholder={finished ? "还想补充什么，说或者打字" : "说一句或打一句"}
                ariaLabel="对医伴说"
                onSubmit={(t) => void sendMessage(e.id, t)}
                disabled={pending}
                className="shadow-float"
              />
            </div>
          </div>
        </>
      ) : (
        <div className="mt-5 rounded-card bg-good-bg p-5">
          <p className="text-xl font-semibold text-ink">
            这次已经好了{e.resolvedAt ? `（${fmtDate(e.resolvedAt)}）` : ""}。
          </p>
          <p className="mt-1 text-lg text-ink-2">又不舒服了？可以接着这次的记录继续。</p>
          <Button variant="secondary" className="mt-3" onClick={() => setStatus(e.id, "active")}>
            又不舒服了，接着记
          </Button>
        </div>
      )}
    </div>
  );
}
