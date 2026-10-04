"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FileSearch, FileText, MessageCircle, Stethoscope } from "lucide-react";
import type { Episode } from "@/lib/types";
import { useStore } from "@/lib/store";
import { cn, fmtDate, roughDuration } from "@/lib/utils";
import { L } from "@/lib/lang";
import { EpisodeSheet } from "@/components/EpisodeSheet";
import { RecordLinks, VisitPlanView } from "@/components/VisitPlanView";
import { useToast } from "@/components/Toast";
import { Badge, Button, Card, IconTile, LinkButton, Modal, Notice, PageHeader, SectionTitle, focusRing } from "@/components/ui";

export default function DetailPage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useStore();
  const episode = state.episodes.find((e) => e.id === id);
  if (!episode) {
    return (
      <Notice icon={<FileSearch className="h-6 w-6" />} title={L("找不到这条记录", "Record not found")} action={<LinkButton href="/me">{L("回到我的档案", "Back to My profile")}</LinkButton>}>
        {L("它可能已经被删除了。", "It may have been deleted.")}
      </Notice>
    );
  }
  return <Detail episode={episode} />;
}

/** One action in a white group: a full-width row, the words in the middle. */
const rowAction = cn(
  "press flex min-h-14 w-full items-center justify-center px-4 py-3 text-center text-lg font-semibold transition-colors duration-200 hover:bg-surface-2/70",
  focusRing,
  "focus-visible:outline-offset-[-2px]",
);

/** A section's title with its tile in front, the way the Health app heads a card. */
function CardTitle({ icon, tone = "brand", children }: { icon: React.ReactNode; tone?: "brand" | "good" | "neutral"; children: React.ReactNode }) {
  return (
    <SectionTitle>
      <IconTile tone={tone}>{icon}</IconTile>
      {children}
    </SectionTitle>
  );
}

/**
 * A pre record (with the visit filed into it when post was linked): what pre wrote up for the doctor,
 * the conversation, and what post put on the record. Nothing else.
 */
function Detail({ episode: e }: { episode: Episode }) {
  const { setStatus, deleteEpisode, restoreEpisode } = useStore();
  const router = useRouter();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const active = e.status === "active";
  const v = e.visit;

  const remove = () => {
    const snapshot = e;
    deleteEpisode(e.id);
    router.replace(active ? "/" : "/me");
    toast.show(L(`已删除「${e.title}」`, `Deleted "${e.title}"`), "neutral", { label: L("撤销", "Undo"), onClick: () => restoreEpisode(snapshot) });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: active ? "/" : "/me", label: active ? L("今天", "Today") : L("我的档案", "My profile") }}
        title={
          <>
            {e.title}{" "}
            <Badge tone={active ? "brand" : "good"} className="ml-1 -translate-y-1 align-middle tracking-normal">
              {active ? L("还在跟踪", "Still tracking") : L("已经好了", "Better now")}
            </Badge>
          </>
        }
        sub={
          e.startedAt === e.createdAt
            ? L(`${fmtDate(e.createdAt, { year: true })}第一次记录`, `First recorded ${fmtDate(e.createdAt, { year: true })}`)
            : L(
                `${fmtDate(e.startedAt, { year: true })}开始，${
                  active ? `到现在${roughDuration(e.startedAt)}` : `持续了${roughDuration(e.startedAt, e.resolvedAt)}`
                }`,
                `Started ${fmtDate(e.startedAt, { year: true })}, ${
                  active ? `${roughDuration(e.startedAt)} so far` : `lasted ${roughDuration(e.startedAt, e.resolvedAt)}`
                }`,
              )
        }
      />

      <RecordLinks id={e.id} />

      {/* 1. what pre wrote up for the doctor: the same as the PDF */}
      <section className="space-y-3">
        <CardTitle icon={<FileText />}>{L("给医生看", "For the doctor")}</CardTitle>
        <EpisodeSheet episode={e} embedded />
      </section>

      {/* 2. how pre got there: the conversation */}
      <Card className="no-print animate-rise px-4 pt-4 pb-2">
        <CardTitle icon={<MessageCircle />}>{L("对话过程", "The conversation")}</CardTitle>
        <Transcript episode={e} />
      </Card>

      {/* 3. what post put on the record: the plan and where it stands, the next visit, what was asked */}
      {v && (
        <section className="space-y-3">
          <CardTitle icon={<Stethoscope />}>{L("看医生之后", "After the doctor")}</CardTitle>
          <VisitPlanView id={e.id} />
        </section>
      )}
      {/* what can still be done with this record: one white group of rows, the delete on its own below */}
      <Card className="divide-y divide-line overflow-hidden">
        {active ? (
          <>
            <Link href={`/after?episode=${e.id}`} className={cn(rowAction, "text-brand-700")}>
              {v ? L("又看了医生，记一下", "Saw a doctor again? Record it") : L("看完医生了，记一下", "Seen the doctor? Record it")}
            </Link>
            <button
              type="button"
              className={cn(rowAction, "text-brand-700")}
              onClick={() => {
                const snapshot = e;
                setStatus(e.id, "resolved");
                toast.show(L(`「${e.title}」已存档`, `"${e.title}" is saved`), "good", { label: L("撤销", "Undo"), onClick: () => restoreEpisode(snapshot) });
              }}
            >
              {L("我好了，结束跟踪", "I'm better, stop tracking")}
            </button>
          </>
        ) : (
          <button type="button" className={cn(rowAction, "text-brand-700")} onClick={() => setStatus(e.id, "active")}>
            {L("又不舒服了，接着跟踪", "Unwell again, keep tracking")}
          </button>
        )}
      </Card>
      <Card className="overflow-hidden">
        <button type="button" className={cn(rowAction, "text-danger")} onClick={() => setConfirming(true)}>
          {L("删除这条记录", "Delete this record")}
        </button>
      </Card>

      <Modal
        open={confirming}
        title={L(`删除「${e.title}」？`, `Delete "${e.title}"?`)}
        onClose={() => setConfirming(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              {L("不删了", "Keep it")}
            </Button>
            <Button variant="danger" onClick={remove}>
              {L("删除", "Delete")}
            </Button>
          </>
        }
      >
        {L("这次的全部记录、对话和看医生的结果都会删掉。", "All records, the chat and the doctor's results for this will be deleted.")}
      </Modal>
    </div>
  );
}

/** The conversation in pre, as it went: the patient on the right, the assistant on the left. */
function Transcript({ episode: e }: { episode: Episode }) {
  if (!e.messages.length) return <p className="t-body py-3 text-ink-2">{L("没有对话。", "No conversation.")}</p>;
  return (
    <ol className="space-y-2.5 py-2">
      {e.messages.map((m) => {
        const mine = m.role === "user";
        return (
          <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
            <p
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5 text-base leading-relaxed whitespace-pre-wrap",
                mine ? "rounded-br-md bg-brand-600 text-white" : "rounded-bl-md bg-surface-2 text-ink",
              )}
            >
              {m.content.replace(/^【定时记录】/, "")}
            </p>
          </li>
        );
      })}
    </ol>
  );
}