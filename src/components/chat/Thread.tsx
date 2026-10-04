"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { CalendarClock, ChevronRight, ClipboardList, Eye, FileText, Phone, Siren, Stethoscope } from "lucide-react";
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
import { LogoMark } from "@/components/Logo";
import { TodoCard } from "@/components/chat/TodoCard";
import { ExplainCard } from "@/components/chat/ExplainCard";
import { useToast } from "@/components/Toast";
import { Badge, Button, Card, IconTile, Spinner, TypingDots } from "@/components/ui";
import { BodyMap } from "@/components/chat/BodyMap";

/*
 * The conversation, the way Messages and Health would draw it. What the assistant has said earlier
 * sits on the left in quiet white sheets; the patient answers from the right in the brand colour.
 * The one question still waiting for an answer is not in a bubble at all: it is set in display
 * type, with the answers to tap right under it, so there is never any doubt what to do next.
 * Cards with their own buttons sit full width between them. Everything new comes up with the same
 * short fade.
 */

const bubble = "max-w-[86%] rounded-[22px] px-5 py-3.5 whitespace-pre-wrap";
/** the patient: the brand gradient on the right, white text (brand-600 and darker only: 5.3:1 and up) */
const mine = "rounded-br-[6px] bg-linear-to-b from-brand-600 to-brand-700 text-lg leading-relaxed text-white shadow-btn";
/** the assistant, earlier: a white sheet on the left with a hairline edge */
const theirs = "material rounded-bl-[6px] border border-line/80 bg-surface text-lg leading-relaxed text-ink";

export function Bubble({ from, children }: { from: "user" | "ai"; children: React.ReactNode }) {
  return (
    <div className={cn("flex animate-fade-up", from === "user" ? "justify-end" : "justify-start")}>
      <div className={cn(bubble, from === "user" ? mine : theirs)}>{children}</div>
    </div>
  );
}

/** The assistant's mark in front of what it is saying now, and in front of the dots while it thinks. */
function Mark() {
  return <LogoMark className="h-7 w-7 rounded-[8px] shadow-glow" />;
}

/**
 * The question that is open right now: no bubble, display type. The eye lands on it first, and the
 * answers to tap come up under it one after the other.
 */
function OpenQuestion({ text, chips, onChip, opening }: { text: string; chips?: string[]; onChip: (text: string) => void; opening?: boolean }) {
  return (
    <div className={cn("animate-fade-up pt-1", opening && "relative flex flex-col items-center py-6 text-center")}>
      {opening ? (
        <>
          <span aria-hidden="true" className="pool -top-10 left-1/2 h-64 w-64 -translate-x-1/2" />
          <LogoMark className="relative h-16 w-16 animate-breathe rounded-[18px] shadow-glow" />
        </>
      ) : (
        <Mark />
      )}
      <p className={cn("relative mt-3 whitespace-pre-wrap text-ink", opening ? "t-display mt-7 max-w-xl" : "t-title")}>{text}</p>
      {chips && chips.length > 0 && (
        <div className={cn("relative mt-5 flex flex-wrap gap-2.5", opening && "mt-8 justify-center")} aria-label="可以直接点的回答">
          {chips.map((c, i) => (
            <button
              key={c}
              type="button"
              onClick={() => onChip(c)}
              className={cn(
                "press material min-h-14 rounded-full border border-line/70 px-6 text-lg font-semibold text-brand-800 transition duration-200 hover:border-brand-200 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200",
                ["rise-1", "rise-2", "rise-3", "rise-4"][Math.min(i, 3)],
              )}
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The head of a card in the thread: an icon tile, the name of the card, and its state. */
function CardHead({ icon, title, aside, tone = "brand" }: { icon: React.ReactNode; title: React.ReactNode; aside?: React.ReactNode; tone?: "brand" | "good" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="t-heading flex min-w-0 items-center gap-3 text-ink">
        <IconTile tone={tone}>{icon}</IconTile>
        <span className="min-w-0">{title}</span>
      </h2>
      {aside && <span className="shrink-0">{aside}</span>}
    </div>
  );
}

/** A quiet line across the thread: what was decided about a card. */
function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="animate-fade-up flex justify-center">
      <span className="rounded-full bg-surface-2 px-4 py-1.5 text-base text-ink-2">{children}</span>
    </p>
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
    return <Note>这次的病情描述已放弃。</Note>;
  }
  const view = !stale && episode.summary ? episode.summary : instant;
  if (!view) return null;

  const discard = () => {
    const kept = discardDescription(item.id);
    if (kept) toast.show(`没有记「${kept.title}」`, "neutral", { label: "撤销", onClick: () => restoreDescription(item.id, kept) });
  };

  const draft = item.state === "draft";
  return (
    <Card tone={draft ? "raised" : "plain"} className={cn("p-6", draft ? "animate-pop" : "animate-fade-up")}>
      <CardHead
        icon={<ClipboardList />}
        title={<>病情描述 · {episode.title}</>}
        aside={item.state === "saved" && <Badge tone="good">已保存</Badge>}
      />
      {/* the document itself: the complaint in one line, then the story in reading type */}
      <div className="mt-5 border-t border-line pt-5">
        <p className="t-heading text-ink">{view.chiefComplaint}</p>
        <p className="t-body mt-3 text-ink">{view.presentIllness}</p>
      </div>
      {(busy || stale || reading) && (
        <p className="mt-4 flex items-center gap-2.5 text-base text-ink-2" role="status">
          <Spinner className="h-5 w-5" />
          还在整理，稍等一下会更通顺
        </p>
      )}
      {draft && (
        <div className="mt-6 grid grid-cols-3 gap-2">
          <Button size="lg" className="px-2" onClick={() => saveDescription(item.id)}>
            保存
          </Button>
          <Button size="lg" variant="secondary" className="px-2" onClick={() => reviseDescription(item.id)}>
            改一下
          </Button>
          <Button size="lg" variant="ghost" className="px-2" onClick={discard}>
            放弃
          </Button>
        </div>
      )}
      <Link
        href={`/doctor/${episode.id}`}
        className="press -mx-2 -mb-2 mt-4 flex min-h-14 items-center gap-3 rounded-2xl px-2 text-lg font-medium text-brand-800 transition duration-200 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
      >
        <IconTile size="sm">
          <FileText />
        </IconTile>
        <span className="min-w-0 flex-1">给医生看</span>
        <ChevronRight className="h-5 w-5 shrink-0 text-ink-3" />
      </Link>
    </Card>
  );
}

/* 分诊: the card is tinted by how soon, and the icon says it again */
const triageTones = {
  emergency: { cls: "border border-danger/25 bg-danger-bg", tile: "solidDanger", label: "text-danger", Icon: Siren },
  today: { cls: "border border-warn/20 bg-warn-bg", tile: "warn", label: "text-warn", Icon: CalendarClock },
  soon: { cls: "border border-warn/20 bg-warn-bg", tile: "warn", label: "text-warn", Icon: Stethoscope },
  watch: { cls: "material border border-line/80 bg-surface", tile: "brand", label: "text-brand-700", Icon: Eye },
} as const;

/** 分诊: whether to see a doctor and how soon. Red when it cannot wait. */
function TriageCard({ item }: { item: Extract<ThreadItem, { kind: "triage" }> }) {
  const t = item.triage;
  const tone = triageTones[t.level];
  const emergency = t.level === "emergency";
  return (
    <div
      className={cn("rounded-card p-6 shadow-card", tone.cls, emergency ? "animate-pop shadow-float" : "animate-fade-up")}
      role={emergency ? "alert" : undefined}
    >
      <div className="flex items-center gap-3">
        <IconTile tone={tone.tile} size="lg" className={emergency ? "animate-breathe" : undefined}>
          <tone.Icon />
        </IconTile>
        <p className={cn("text-base font-semibold tracking-[-0.005em]", tone.label)}>分诊建议</p>
      </div>
      <p className="t-title mt-4 text-ink">{t.title}</p>
      {t.department && <p className="t-lead mt-3 text-ink">可以挂：{t.department}</p>}
      {t.note && <p className="t-body mt-2 text-ink-2">{t.note}</p>}
      {emergency && (
        <a
          href="tel:120"
          className="press tile-danger mt-5 flex min-h-14 w-full items-center justify-center gap-2.5 rounded-full px-6 text-xl font-semibold text-white transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-danger/30"
        >
          <Phone className="h-6 w-6" />
          拨打 120
        </a>
      )}
    </div>
  );
}

/** One line of what the doctor wrote: the label above on a phone, in a column beside it where there is room (the way Health lays out details). */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-3.5 first:pt-0 last:pb-0 sm:grid sm:grid-cols-[7.5rem_1fr] sm:gap-4">
      <dt className="text-base font-medium text-ink-2 sm:pt-0.5">{label}</dt>
      <dd className="mt-1 text-lg leading-relaxed text-ink sm:mt-0">{children}</dd>
    </div>
  );
}

/** What the doctor wrote, read from a photo or from what the patient said, to be checked before it is saved. */
function OrdersCard({ item, busy }: { item: Extract<ThreadItem, { kind: "orders" }>; busy: boolean }) {
  const r = item.result;
  if (item.state === "discarded") return <Note>这次的医嘱没有保存。</Note>;
  const draft = item.state === "draft";
  return (
    <Card tone={draft ? "raised" : "plain"} className={cn("p-6", draft ? "animate-pop" : "animate-fade-up")}>
      <CardHead icon={<Stethoscope />} title="医嘱整理" aside={item.state === "saved" && <Badge tone="good">已保存</Badge>} />
      <dl className="mt-5 divide-y divide-line border-t border-line pt-5">
        {(r.date || r.hospital || r.department) && <Row label="时间和地点">{[r.date, r.hospital, r.department].filter(Boolean).join(" · ")}</Row>}
        <Row label="诊断">{r.diagnosis ? showDiagnosis(r.diagnosis) : "没有认出诊断"}</Row>
        {r.findings.length > 0 && <Row label="检查结果">{r.findings.join("；")}</Row>}
        {r.medications.length > 0 && (
          <Row label="开的药">
            <ul className="space-y-1">
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
      {draft ? (
        <div className="mt-6 grid grid-cols-2 gap-2">
          <Button size="lg" onClick={() => saveOrders(item.id)}>
            保存
          </Button>
          <Button size="lg" variant="ghost" onClick={() => discardOrders(item.id)}>
            放弃
          </Button>
        </div>
      ) : (
        <div className="mt-6 grid gap-2">
          <Button size="lg" variant="secondary" onClick={() => listTodos(item.id)}>
            整理要做的事并提醒
          </Button>
          <Button size="lg" variant="secondary" disabled={busy} onClick={() => explainOrders(item.id)}>
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
export function Thread({ items, busy, onChip, opening }: { items: ThreadItem[]; busy: boolean; onChip: (text: string) => void; opening?: boolean }) {
  // the question still open: the last thing the assistant said, with nothing after it but its own
  // picture to tap or a warning (the patient has not answered yet)
  const lastId = items[items.length - 1]?.id;
  const lastAi = items.findLastIndex((x) => x.kind === "ai");
  const openId = lastAi >= 0 && items.slice(lastAi + 1).every((x) => x.kind === "bodymap" || x.kind === "alert") ? items[lastAi].id : undefined;
  return (
    <div className="space-y-5" aria-live="polite">
      {items.map((item) => {
        switch (item.kind) {
          case "user":
            return (
              <Bubble key={item.id} from="user">
                {item.text}
                {item.photos ? <span className="block text-base text-white/90">{item.text ? "" : "发了"} {item.photos} 张照片</span> : null}
              </Bubble>
            );
          case "ai":
            // the question still open is set large; once answered (or while the assistant works) it settles into a bubble
            return item.id === openId && !busy ? (
              // answers to tap, only under the question that is the last thing said
              <OpenQuestion key={item.id} text={item.text} chips={item.id === lastId ? item.chips : undefined} onChip={onChip} opening={opening} />
            ) : (
              <Bubble key={item.id} from="ai">
                {item.text}
              </Bubble>
            );
          case "alert":
            return <HintBanner key={item.id} hint={item.hint} className="animate-fade-up" />;
          case "description":
            return <DescriptionCard key={item.id} item={item} />;
          case "triage":
            return <TriageCard key={item.id} item={item} />;
          case "orders":
            return <OrdersCard key={item.id} item={item} busy={busy} />;
          case "answer":
            return (
              <div key={item.id} className="flex animate-fade-up justify-start">
                <div className={cn(bubble, theirs)}>
                  {item.text}
                  {item.sources.length > 0 && (
                    <span className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-3 text-base text-ink-2">
                      依据：
                      {item.sources.map((s, i) => (
                        <Link
                          key={i}
                          href={s.href}
                          className="press inline-flex min-h-11 items-center gap-1 rounded-full bg-brand-50 px-4 font-medium text-brand-800 transition hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
                        >
                          {s.label}
                          <ChevronRight className="h-4 w-4" />
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
              <div key={item.id} className="max-w-md animate-pop">
                <BodyMap onPick={(area) => void pickBodyArea(item.id, area)} />
              </div>
            ) : null;
          case "note":
            return <Note key={item.id}>{item.text}</Note>;
        }
      })}
      {busy && (
        <div className="flex animate-fade-up items-end gap-2.5">
          <Mark />
          <div className="material rounded-[22px] rounded-bl-[6px] border border-line/80 bg-surface px-5 py-4">
            <TypingDots />
          </div>
        </div>
      )}
    </div>
  );
}
