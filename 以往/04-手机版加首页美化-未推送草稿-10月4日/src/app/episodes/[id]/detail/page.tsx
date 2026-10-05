"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChartLine, FileSearch, History, ListOrdered, Stethoscope } from "lucide-react";
import type { Episode } from "@/lib/types";
import { useStore } from "@/lib/store";
import { useRelatedEpisodes } from "@/lib/episodeAI";
import { cn, episodeLine, fmtDate, roughDuration, severitySeries } from "@/lib/utils";
import { L } from "@/lib/lang";
import { HintBanner } from "@/components/HintBanner";
import { SeverityChart } from "@/components/SeverityChart";
import { Timeline } from "@/components/Timeline";
import { useToast } from "@/components/Toast";
import { Badge, Button, Card, IconTile, LinkButton, Modal, Notice, PageHeader, RowLink, SectionTitle, focusRing } from "@/components/ui";

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

/** Everything kept about one symptom: nothing is thrown away, it just lives here instead of on the home screen. */
function Detail({ episode: e }: { episode: Episode }) {
  const { setStatus, deleteEpisode, restoreEpisode } = useStore();
  const router = useRouter();
  const toast = useToast();
  const related = useRelatedEpisodes(e);
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

      {e.lastHint && active && <HintBanner hint={e.lastHint} />}

      <div className="grid animate-rise grid-cols-2 gap-2.5 rise-1">
        <LinkButton href={`/doctor/${e.id}`} size="lg" className="press">
          {L("给医生看", "Show the doctor")}
        </LinkButton>
        <LinkButton href={`/episodes/${e.id}`} variant="outline" size="lg" className="press">
          {L("看对话", "See the chat")}
        </LinkButton>
      </div>

      {v && (
        // what the doctor said is the record that matters most here: the raised card
        <Card tone="raised" className="animate-rise px-4 pt-4 pb-1 rise-2">
          <CardTitle icon={<Stethoscope />}>{L("看医生的结果", "What the doctor said")}</CardTitle>
          <dl className="divide-y divide-line text-lg leading-relaxed [&>div]:py-4 [&>div:first-child]:pt-1">
            <div>
              <dt className="text-base font-medium text-ink-2 tabular">
                {fmtDate(`${v.date}T12:00:00`, { year: true })}
                {[v.hospital, v.department].filter(Boolean).length ? ` · ${[v.hospital, v.department].filter(Boolean).join(" ")}` : ""}
              </dt>
              <dd className="t-heading mt-1 text-ink">{v.diagnosis}</dd>
            </div>
            {v.findings && v.findings.length > 0 && (
              <div>
                <dt className="text-base font-medium text-ink-2">{L("检查结果", "Test results")}</dt>
                <dd className="mt-1 text-ink">{v.findings.join("；")}</dd>
              </div>
            )}
            <div>
              <dt className="text-base font-medium text-ink-2">{L("开的药和处理", "Medicines and treatment")}</dt>
              <dd className="mt-1 text-ink">{v.treatment}</dd>
            </div>
            {v.advice && (
              <div>
                <dt className="text-base font-medium text-ink-2">{L("医生的叮嘱", "The doctor's advice")}</dt>
                <dd className="mt-1 text-ink">{v.advice}</dd>
              </div>
            )}
            {v.followUp && (
              <div>
                <dt className="text-base font-medium text-ink-2">{L("复查", "Follow-up visit")}</dt>
                <dd className="mt-1 text-ink">
                  {v.followUp}
                  {v.followUpAt ? L(`（${fmtDate(v.followUpAt)}提醒你）`, ` (reminder on ${fmtDate(v.followUpAt)})`) : ""}
                </dd>
              </div>
            )}
            {v.archiveSummary && (
              <div>
                <dt className="text-base font-medium text-ink-2">{L("存档摘要", "Saved summary")}</dt>
                <dd className="mt-1 text-ink">{v.archiveSummary}</dd>
              </div>
            )}
          </dl>
        </Card>
      )}

      {severitySeries(e).length >= 2 && (
        <Card className="animate-rise p-4 rise-3">
          <CardTitle icon={<ChartLine />}>{L("难受程度的变化", "How bad it has been")}</CardTitle>
          <SeverityChart entries={e.entries} />
        </Card>
      )}

      <Card className="animate-rise p-4 rise-4">
        <CardTitle icon={<ListOrdered />}>{L("全部记录", "All records")}</CardTitle>
        <div className="pt-1">
          <Timeline episode={e} />
        </div>
      </Card>

      {related.length > 0 && (
        <Card className="animate-rise overflow-hidden rise-4">
          <div className="px-4 pt-4">
            <CardTitle icon={<History />} tone="neutral">
              {L("以前类似的情况", "Similar times before")}
            </CardTitle>
          </div>
          <div className="divide-y divide-line border-t border-line">
            {related.map((r) => (
              <RowLink
                key={r.id}
                href={`/episodes/${r.id}/detail`}
                title={r.title}
                detail={`${fmtDate(r.startedAt, { year: true })} · ${episodeLine(r)}`}
              />
            ))}
          </div>
        </Card>
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
