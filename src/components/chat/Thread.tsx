"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import type { ThreadItem } from "@/lib/types";
import { useStore } from "@/lib/store";
import { useReplyPending } from "@/lib/episodeAI";
import { instantSummary, refreshSummary, summaryBusy, summaryIsStale } from "@/lib/summaries";
import {
  discardDescription,
  discardOrders,
  explainOrders,
  listTodos,
  pickBodyArea,
  restoreDescription,
  reviseDescription,
  saveDescription,
  saveOrders,
} from "@/lib/thread";
import { medicationLine } from "@/lib/after";
import { cn, showDiagnosis } from "@/lib/utils";
import { HintBanner } from "@/components/HintBanner";
import { TodoCard } from "@/components/chat/TodoCard";
import { ExplainCard } from "@/components/chat/ExplainCard";
import { useToast } from "@/components/Toast";
import { Button, Card, Spinner, TypingDots } from "@/components/ui";
import { BodyMap } from "@/components/chat/BodyMap";

/* The conversation: plain bubbles, and cards with their own buttons. */

const bubble = "max-w-[88%] rounded-3xl px-4 py-3 text-lg leading-relaxed whitespace-pre-wrap";
const mine = "rounded-br-lg bg-brand-600 text-white";
const theirs = "rounded-bl-lg border border-line bg-surface text-ink shadow-card";

export function Bubble({ from, children }: { from: "user" | "ai"; children: React.ReactNode }) {
  return (
    <div className={cn("flex", from === "user" ? "justify-end" : "justify-start")}>
      <div className={cn(bubble, from === "user" ? mine : theirs)}>{children}</div>
    </div>
  );
}

/** The description of one complaint, as it will be handed to the doctor. It follows the record: say a correction and it changes. */
function DescriptionCard({ item }: { item: Extract<ThreadItem, { kind: "description" }> }) {
  const { state } = useStore();
  const toast = useToast();
  const episode = state.episodes.find((e) => e.id === item.episodeId);
  const busy = summaryBusy.use(item.episodeId);
  const reading = useReplyPending(item.episodeId);
  const stale = episode ? summaryIsStale(episode) : false;
  const live = Boolean(episode) && item.state !== "discarded";

  // the same rule as on the doctor's page: whatever was said since the last version is worked in
  useEffect(() => {
    if (live && stale && !busy && !reading) void refreshSummary(item.episodeId);
  }, [item.episodeId, live, stale, busy, reading]);

  const instant = useMemo(() => (episode ? instantSummary(episode, state) : null), [episode, state]);
  if (!episode || item.state === "discarded") {
    return <p className="text-center text-base text-ink-2">这次的病情描述已放弃。</p>;
  }
  const view = !stale && episode.summary ? episode.summary : instant;
  if (!view) return null;

  const discard = () => {
    const kept = discardDescription(item.id);
    if (kept) toast.show(`没有记「${kept.title}」`, "neutral", { label: "撤销", onClick: () => restoreDescription(item.id, kept) });
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-brand-800">病情描述 · {episode.title}</h2>
        {item.state === "saved" && <span className="rounded-full bg-good-bg px-3 py-0.5 text-base font-medium text-good">已保存</span>}
      </div>
      <p className="mt-2 text-xl leading-relaxed font-semibold text-ink">{view.chiefComplaint}</p>
      <p className="mt-1.5 text-lg leading-relaxed text-ink">{view.presentIllness}</p>
      {(busy || stale || reading) && (
        <p className="mt-2 flex items-center gap-2 text-base text-ink-2" role="status">
          <Spinner className="h-5 w-5" />
          还在整理，稍等一下会更通顺
        </p>
      )}
      {item.state === "draft" && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Button onClick={() => saveDescription(item.id)}>保存</Button>
          <Button variant="secondary" onClick={() => reviseDescription(item.id)}>
            改一下
          </Button>
          <Button variant="ghost" onClick={discard}>
            放弃
          </Button>
        </div>
      )}
      <Link
        href={`/doctor/${episode.id}`}
        className="mt-3 inline-flex min-h-12 items-center gap-1.5 rounded-xl text-base font-medium text-brand-700 underline-offset-4 hover:underline"
      >
        <FileText className="h-5 w-5" />
        给医生看
      </Link>
    </Card>
  );
}

const triageTones = {
  emergency: "border-2 border-danger bg-danger-bg",
  today: "border border-warn/40 bg-warn-bg",
  soon: "border border-warn/40 bg-warn-bg",
  watch: "border border-line bg-surface",
} as const;

/** 分诊: whether to see a doctor and how soon. Red when it cannot wait. */
function TriageCard({ item }: { item: Extract<ThreadItem, { kind: "triage" }> }) {
  const t = item.triage;
  return (
    <div className={cn("rounded-card p-5 shadow-card", triageTones[t.level])} role={t.level === "emergency" ? "alert" : undefined}>
      <p className={cn("text-base font-semibold", t.level === "emergency" ? "text-danger" : "text-ink-2")}>分诊建议</p>
      <p className="mt-1 text-xl leading-relaxed font-semibold text-ink">{t.title}</p>
      {t.department && <p className="mt-1 text-lg text-ink">可以挂：{t.department}</p>}
      {t.note && <p className="mt-1 text-lg leading-relaxed text-ink">{t.note}</p>}
      {t.level === "emergency" && (
        <a href="tel:120" className="mt-3 inline-flex min-h-12 items-center rounded-xl bg-danger px-5 text-lg font-semibold text-white">
          拨打 120
        </a>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-base text-ink-2">{label}</dt>
      <dd className="text-lg leading-relaxed text-ink">{children}</dd>
    </div>
  );
}

/** What the doctor wrote, read from a photo or from what the patient said, to be checked before it is saved. */
function OrdersCard({ item, busy }: { item: Extract<ThreadItem, { kind: "orders" }>; busy: boolean }) {
  const r = item.result;
  if (item.state === "discarded") return <p className="text-center text-base text-ink-2">这次的医嘱没有保存。</p>;
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-brand-800">医嘱整理</h2>
        {item.state === "saved" && <span className="rounded-full bg-good-bg px-3 py-0.5 text-base font-medium text-good">已保存</span>}
      </div>
      <dl className="mt-2 space-y-2.5">
        {(r.date || r.hospital || r.department) && <Row label="时间和地点">{[r.date, r.hospital, r.department].filter(Boolean).join(" · ")}</Row>}
        <Row label="诊断">{r.diagnosis ? showDiagnosis(r.diagnosis) : "没有认出诊断"}</Row>
        {r.findings.length > 0 && <Row label="检查结果">{r.findings.join("；")}</Row>}
        {r.medications.length > 0 && (
          <Row label="开的药">
            <ul className="space-y-0.5">
              {r.medications.map((m, i) => (
                <li key={i}>{medicationLine(m)}</li>
              ))}
            </ul>
          </Row>
        )}
        {r.procedures.length > 0 && <Row label="其他处理">{r.procedures.join("；")}</Row>}
        {r.advice && <Row label="医生叮嘱">{r.advice}</Row>}
        {r.followUpNote && <Row label="复诊">{r.followUpNote}</Row>}
        {r.unclear.length > 0 && <Row label="没认准的地方">{r.unclear.join("；")}</Row>}
      </dl>
      {item.state === "draft" ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button onClick={() => saveOrders(item.id)}>保存</Button>
          <Button variant="ghost" onClick={() => discardOrders(item.id)}>
            放弃
          </Button>
        </div>
      ) : (
        <div className="mt-4 grid gap-2">
          <Button variant="secondary" onClick={() => listTodos(item.id)}>
            整理要做的事并提醒
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => explainOrders(item.id)}>
            给我解释一下
          </Button>
        </div>
      )}
    </Card>
  );
}

/**
 * The whole conversation. `onChip` is what happens when one of the suggested answers under the
 * assistant's last question is tapped: it is sent as if it had been said.
 */
export function Thread({ items, busy, onChip }: { items: ThreadItem[]; busy: boolean; onChip: (text: string) => void }) {
  const lastId = items[items.length - 1]?.id;
  return (
    <div className="space-y-3" aria-live="polite">
      {items.map((item) => {
        switch (item.kind) {
          case "user":
            return (
              <Bubble key={item.id} from="user">
                {item.text}
                {item.photos ? <span className="block text-base">{item.text ? "" : "发了"} {item.photos} 张照片</span> : null}
              </Bubble>
            );
          case "ai":
            return (
              <div key={item.id}>
                <Bubble from="ai">{item.text}</Bubble>
                {/* answers to tap, only under the question that is still open */}
                {item.id === lastId && !busy && item.chips && item.chips.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2" aria-label="可以直接点的回答">
                    {item.chips.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => onChip(c)}
                        className="min-h-12 rounded-full border-2 border-line-strong bg-surface px-5 text-lg text-ink transition hover:border-brand-400 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          case "alert":
            return <HintBanner key={item.id} hint={item.hint} />;
          case "description":
            return <DescriptionCard key={item.id} item={item} />;
          case "triage":
            return <TriageCard key={item.id} item={item} />;
          case "orders":
            return <OrdersCard key={item.id} item={item} busy={busy} />;
          case "answer":
            return (
              <div key={item.id} className="flex justify-start">
                <div className={cn(bubble, theirs)}>
                  {item.text}
                  {item.sources.length > 0 && (
                    <span className="mt-2 block border-t border-line pt-2 text-base text-ink-2">
                      依据：
                      {item.sources.map((s, i) => (
                        <Link key={i} href={s.href} className="mr-3 inline-flex min-h-11 items-center font-medium text-brand-700 underline underline-offset-4">
                          {s.label}
                        </Link>
                      ))}
                    </span>
                  )}
                </div>
              </div>
            );
          case "todo":
            return <TodoCard key={item.id} item={item} />;
          case "explain":
            return <ExplainCard key={item.id} item={item} />;
          case "bodymap":
            // once tapped (or answered in words), the answer is in the bubble below: the picture goes
            return item.state === "open" && !busy ? (
              <div key={item.id} className="max-w-md">
                <BodyMap onPick={(area) => void pickBodyArea(item.id, area)} />
              </div>
            ) : null;
          case "note":
            return (
              <p key={item.id} className="text-center text-base text-ink-2">
                {item.text}
              </p>
            );
        }
      })}
      {busy && (
        <div className="flex justify-start">
          <div className="rounded-3xl rounded-bl-lg border border-line bg-surface px-5 py-4 shadow-card">
            <TypingDots />
          </div>
        </div>
      )}
    </div>
  );
}
