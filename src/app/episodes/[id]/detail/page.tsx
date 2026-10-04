"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChartLine, FileSearch, History, ListOrdered, Stethoscope } from "lucide-react";
import type { Episode } from "@/lib/types";
import { useStore } from "@/lib/store";
import { useRelatedEpisodes } from "@/lib/episodeAI";
import { episodeLine, fmtDate, roughDuration, severitySeries } from "@/lib/utils";
import { HintBanner } from "@/components/HintBanner";
import { SeverityChart } from "@/components/SeverityChart";
import { Timeline } from "@/components/Timeline";
import { useToast } from "@/components/Toast";
import { Badge, Button, Card, IconTile, LinkButton, Modal, Notice, PageHeader, RowLink, SectionTitle } from "@/components/ui";

export default function DetailPage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useStore();
  const episode = state.episodes.find((e) => e.id === id);
  if (!episode) {
    return (
      <Notice icon={<FileSearch className="h-6 w-6" />} title="找不到这条记录" action={<LinkButton href="/me">回到我的档案</LinkButton>}>
        它可能已经被删除了。
      </Notice>
    );
  }
  return <Detail episode={episode} />;
}

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
    toast.show(`已删除「${e.title}」`, "neutral", { label: "撤销", onClick: () => restoreEpisode(snapshot) });
  };

  return (
    <div className="space-y-8">
      <PageHeader
        back={{ href: active ? "/" : "/me", label: active ? "今天" : "我的档案" }}
        title={
          <>
            {e.title}{" "}
            <Badge tone={active ? "brand" : "good"} className="ml-1 -translate-y-1 align-middle tracking-normal">
              {active ? "还在跟踪" : "已经好了"}
            </Badge>
          </>
        }
        sub={
          e.startedAt === e.createdAt
            ? `${fmtDate(e.createdAt, { year: true })}第一次记录`
            : `${fmtDate(e.startedAt, { year: true })}开始，${
                active ? `到现在${roughDuration(e.startedAt)}` : `持续了${roughDuration(e.startedAt, e.resolvedAt)}`
              }`
        }
      />

      {e.lastHint && active && <HintBanner hint={e.lastHint} />}

      <div className="grid animate-rise grid-cols-2 gap-2.5 rise-1">
        <LinkButton href={`/doctor/${e.id}`} size="lg" className="press">
          给医生看
        </LinkButton>
        <LinkButton href={`/episodes/${e.id}`} variant="secondary" size="lg" className="press">
          看对话
        </LinkButton>
      </div>

      {v && (
        // what the doctor said is the record that matters most here: the raised card
        <Card tone="raised" className="animate-rise px-5 pt-5 pb-2 rise-2 sm:px-6 sm:pt-6">
          <CardTitle icon={<Stethoscope />}>看医生的结果</CardTitle>
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
                <dt className="text-base font-medium text-ink-2">检查结果</dt>
                <dd className="mt-1 text-ink">{v.findings.join("；")}</dd>
              </div>
            )}
            <div>
              <dt className="text-base font-medium text-ink-2">开的药和处理</dt>
              <dd className="mt-1 text-ink">{v.treatment}</dd>
            </div>
            {v.advice && (
              <div>
                <dt className="text-base font-medium text-ink-2">医生的叮嘱</dt>
                <dd className="mt-1 text-ink">{v.advice}</dd>
              </div>
            )}
            {v.followUp && (
              <div>
                <dt className="text-base font-medium text-ink-2">复查</dt>
                <dd className="mt-1 text-ink">
                  {v.followUp}
                  {v.followUpAt ? `（${fmtDate(v.followUpAt)}提醒你）` : ""}
                </dd>
              </div>
            )}
            {v.archiveSummary && (
              <div>
                <dt className="text-base font-medium text-ink-2">存档摘要</dt>
                <dd className="mt-1 text-ink">{v.archiveSummary}</dd>
              </div>
            )}
          </dl>
        </Card>
      )}

      {severitySeries(e).length >= 2 && (
        <Card className="animate-rise p-5 rise-3 sm:p-6">
          <CardTitle icon={<ChartLine />}>难受程度的变化</CardTitle>
          <SeverityChart entries={e.entries} />
        </Card>
      )}

      <Card className="animate-rise p-5 rise-4 sm:p-6">
        <CardTitle icon={<ListOrdered />}>全部记录</CardTitle>
        <div className="pt-1">
          <Timeline episode={e} />
        </div>
      </Card>

      {related.length > 0 && (
        <Card className="animate-rise overflow-hidden rise-4">
          <div className="px-5 pt-5 sm:px-6 sm:pt-6">
            <CardTitle icon={<History />} tone="neutral">
              以前类似的情况
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

      <div className="grid gap-2.5 pt-2">
        {active ? (
          <>
            <LinkButton href={`/after?episode=${e.id}`} variant="secondary" className="press">
              {v ? "又看了医生，记一下" : "看完医生了，记一下"}
            </LinkButton>
            <Button
              variant="secondary"
              className="press"
              onClick={() => {
                const snapshot = e;
                setStatus(e.id, "resolved");
                toast.show(`「${e.title}」已存档`, "good", { label: "撤销", onClick: () => restoreEpisode(snapshot) });
              }}
            >
              我好了，结束跟踪
            </Button>
          </>
        ) : (
          <Button variant="secondary" className="press" onClick={() => setStatus(e.id, "active")}>
            又不舒服了，接着跟踪
          </Button>
        )}
        <Button variant="dangerGhost" className="press" onClick={() => setConfirming(true)}>
          删除这条记录
        </Button>
      </div>

      <Modal
        open={confirming}
        title={`删除「${e.title}」？`}
        onClose={() => setConfirming(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              不删了
            </Button>
            <Button variant="danger" onClick={remove}>
              删除
            </Button>
          </>
        }
      >
        这次的全部记录、对话和看医生的结果都会删掉。
      </Modal>
    </div>
  );
}
