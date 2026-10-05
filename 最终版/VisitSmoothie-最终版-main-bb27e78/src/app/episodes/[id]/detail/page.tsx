"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronDown, FileSearch, FileText, MessageCircle, Stethoscope } from "lucide-react";
import type { Episode } from "@/lib/types";
import { useStore } from "@/lib/store";
import { cn, fmtDate, roughDuration } from "@/lib/utils";
import { L } from "@/lib/lang";
import { recordById, recordNarrative } from "@/lib/records";
import { EpisodeSheet } from "@/components/EpisodeSheet";
import { instantSummary, refreshSummary, summaryBusy, summaryIsStale } from "@/lib/summaries";
import { useReplyPending } from "@/lib/episodeAI";
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
  const { state, setStatus, deleteEpisode, restoreEpisode } = useStore();
  const router = useRouter();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const active = e.status === "active";
  const v = e.visit;
  // the main complaint in a phrase, with 复诊 · in front for a follow-up
  const title = recordById(state, e.id)?.title ?? e.title;

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
            {title}{" "}
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

      {/* what pre kept: the description, the history that may matter, the page for the doctor, the conversation */}
      <section className="space-y-3">
        <CardTitle icon={<MessageCircle />}>{L("看医生之前存的", "Saved before the doctor")}</CardTitle>
        <PreSaved episode={e} />
      </section>

      {/* what post kept: the plan and where it stands, the next visit, what was asked */}
      {v && (
        <section className="space-y-3">
          <CardTitle icon={<Stethoscope />}>{L("看医生之后存的", "Saved after the doctor")}</CardTitle>
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

/** A row that opens what is folded under it, like the conversation: the words, and a chevron that turns. */
function Fold({ icon, title, open, onToggle, children }: { icon: React.ReactNode; title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className={cn("press flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/70", focusRing, "focus-visible:ring-inset")}
      >
        <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center text-brand-700 [&>svg]:h-5 [&>svg]:w-5">
          {icon}
        </span>
        <span className="min-w-0 flex-1 text-lg font-medium text-ink">{title}</span>
        <ChevronDown aria-hidden="true" className={cn("h-5 w-5 shrink-0 text-ink-3 transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && <div className="animate-fade-up px-3 pb-3">{children}</div>}
    </div>
  );
}

/**
 * What pre kept: the page for the doctor as it was handed over (the PDF), never what post filed in
 * afterwards. Shown short — the description of the complaint at the time — with the whole page (and its
 * PDF) and the conversation each folded away until opened.
 */
function PreSaved({ episode: e }: { episode: Episode }) {
  const { state } = useStore();
  const busy = summaryBusy.use(e.id);
  const stale = summaryIsStale(e);
  const reading = useReplyPending(e.id);
  const [full, setFull] = useState(false);
  const [chat, setChat] = useState(false);
  useEffect(() => {
    if (stale && !busy && !reading) void refreshSummary(e.id);
  }, [e.id, stale, busy, reading]);
  const view = !stale && e.summary ? e.summary : instantSummary(e, state);
  const narrative = view?.narrative ? recordNarrative(view.narrative) : "";

  return (
    <Card className="divide-y divide-line overflow-hidden">
      <div className="px-4 py-4">
        <p className="text-base font-semibold text-brand-700">{L("给医生看 · 当时的病情描述", "For the doctor · how it was described")}</p>
        {narrative ? (
          <p className="t-body mt-1.5 text-ink">{narrative}</p>
        ) : (
          <p className="t-body mt-1.5 text-ink-2">{busy || reading ? L("正在整理…", "Organising…") : L("这次没有描述。", "No description this time.")}</p>
        )}
      </div>
      <Fold icon={<FileText />} title={L("更详细（给医生看的完整页 · PDF）", "More detail (the full page for the doctor · PDF)")} open={full} onToggle={() => setFull((o) => !o)}>
        <EpisodeSheet episode={e} embedded />
      </Fold>
      <div className="no-print">
        <Fold icon={<MessageCircle />} title={L("对话过程", "The conversation")} open={chat} onToggle={() => setChat((o) => !o)}>
          <Transcript episode={e} />
        </Fold>
      </div>
    </Card>
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