"use client";

import { Fragment, useEffect, useLayoutEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronRight, CircleCheck, FileSearch, History } from "lucide-react";
import type { ChatMessage, Episode } from "@/lib/types";
import { useStore } from "@/lib/store";
import { requestReply, sendMessage, useRelatedEpisodes, useReplyPending } from "@/lib/episodeAI";
import { cn, episodeLine, fmtDate, fmtTime, textOverlap } from "@/lib/utils";
import { L, getLang } from "@/lib/lang";
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
      <Notice icon={<FileSearch className="h-6 w-6" />} title={L("找不到这条记录", "Record not found")} action={<LinkButton href="/">{L("回到今天", "Back to today")}</LinkButton>}>
        {L("它可能已经被删除了。", "It may have been deleted.")}
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
          {checkin ? L("回答追问 · ", "Check-in answer · ") : ""}
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
    toast.show(L(`没有记「${e.title}」`, `Not kept: "${e.title}"`), "neutral", { label: L("撤销", "Undo"), onClick: () => restoreEpisode(snapshot) });
  };

  const well = () => {
    const snapshot = e;
    setStatus(e.id, "resolved");
    toast.show(L(`「${e.title}」已存档。以后再犯，我会把这次的记录找出来`, `"${e.title}" is saved. If it comes back, I'll find this record for you.`), "good", {
      label: L("撤销", "Undo"),
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
            {L("详情", "Details")}
            <ChevronRight className="h-5 w-5" />
          </TextLink>
        }
        title={e.title}
        aside={
          justStarted && (
            <TextButton tone="muted" className="-mr-2" onClick={discard}>
              {L("点错了，不记这条", "Tapped by mistake, don't keep this")}
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
            {L(
              `你以前有过类似的情况：${fmtDate(prior.startedAt, { year: true })}「${prior.title}」，${episodeLine(prior)}。`,
              `You had something similar before: "${prior.title}", ${fmtDate(prior.startedAt, { year: true })}, ${episodeLine(prior)}.`,
            )}
          </span>
          <ChevronRight className="mt-2 h-5 w-5 shrink-0 text-ink-3" />
        </TextLink>
      )}

      {getLang() === "en" && <p className="t-body mb-4 text-ink-2">AI replies are in Chinese for now.</p>}
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
        <div className="mt-5 grid grid-cols-2 gap-2.5" aria-label={L("可以直接点的回答", "Answers you can tap")}>
          {quick.map((q, i) => (
            <Button key={q} variant="outline" size="tile" className={cn("animate-rise", `rise-${Math.min(i + 1, 4)}`)} onClick={() => void sendMessage(e.id, q)}>
              {q}
            </Button>
          ))}
        </div>
      )}

      {finished && (
        <div className="mt-5 grid animate-fade-up grid-cols-2 gap-2.5">
          <LinkButton href={`/doctor/${e.id}`} variant={serious ? "primary" : "outline"} size="lg" className="press">
            {L("给医生看", "Show the doctor")}
          </LinkButton>
          <LinkButton href="/" variant={serious ? "outline" : "primary"} size="lg" className="press">
            {L("回到首页", "Home")}
          </LinkButton>
          <div className="col-span-2 flex justify-center">
            <TextButton onClick={well}>{L("已经好了，结束这次记录", "I'm better, end this record")}</TextButton>
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
          <div className="no-print sticky z-20 mt-6" style={{ bottom: "calc(var(--tab-bar) + 2.25rem)" }}>
            <div className="glass mx-auto w-full max-w-[36rem] rounded-[30px] border border-white/70 p-1.5 shadow-float">
              <SpeakInput
                placeholder={finished ? L("还想补充什么，说或者打字", "Anything to add? Say it or type it") : L("说一句或打一句", "Say or type a line")}
                ariaLabel={L("对医伴说", "Say it to VisitSmoothie")}
                onSubmit={(t) => void sendMessage(e.id, t)}
                disabled={pending}
              />
            </div>
          </div>
        </>
      ) : (
        <Card className="mt-8 animate-fade-up p-4">
          <div className="flex items-start gap-4">
            <IconTile tone="good" size="lg">
              <CircleCheck />
            </IconTile>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="t-heading text-ink">
                {L(`这次已经好了${e.resolvedAt ? `（${fmtDate(e.resolvedAt)}）` : ""}。`, `This one is over${e.resolvedAt ? ` (${fmtDate(e.resolvedAt)})` : ""}.`)}
              </p>
              <p className="t-body mt-1.5 text-ink-2">{L("又不舒服了？可以接着这次的记录继续。", "Feeling unwell again? You can carry on with this record.")}</p>
            </div>
          </div>
          <Button variant="secondary" className="press mt-5 w-full" onClick={() => setStatus(e.id, "active")}>
            {L("又不舒服了，接着记", "Unwell again, keep recording")}
          </Button>
        </Card>
      )}
    </div>
  );
}
