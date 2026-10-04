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
import { L } from "@/lib/lang";
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

const bubble = "max-w-[85%] rounded-[20px] px-4 py-2.5 whitespace-pre-wrap";
/** The patient: solid blue on the right, with readable white text. */
const mine = "rounded-br-[6px] bg-brand-600 text-base leading-relaxed text-white";
/** the assistant, earlier: a white sheet on the left with a hairline edge */
const theirs = "rounded-bl-[6px] bg-surface text-base leading-relaxed text-ink";

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
    <div className={cn("animate-fade-up pt-1", opening && "relative flex flex-col items-center py-4 text-center")}>
      {opening ? (
        <>
          <span aria-hidden="true" className="pool -top-10 left-1/2 h-64 w-64 -translate-x-1/2" />
          <LogoMark className="relative h-11 w-11 rounded-xl" />
          <span className="relative mt-2 text-lg font-semibold tracking-tight text-brand-ink">{L("问诊奶昔", "VisitSmoothie")}</span>
        </>
      ) : (
        <Mark />
      )}
      <p className={cn("relative mt-3 whitespace-pre-wrap text-ink", opening ? "t-title mt-5 max-w-xl" : "t-heading")}>{text}</p>
      {chips && chips.length > 0 && (
        <div className={cn("relative mt-5 flex flex-wrap gap-2.5", opening && "mt-8 justify-center")} aria-label={L("可以直接点的回答", "Answers you can tap")}>
          {chips.map((c, i) => (
            <button
              key={c}
              type="button"
              onClick={() => onChip(c)}
              className={cn(
                "press bg-surface min-h-12 rounded-xl border border-line/70 px-4 text-base font-semibold text-brand-800 transition duration-200 hover:border-brand-200 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200",
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
  const replaced = item.state === "replaced";
  const live = Boolean(episode) && item.state !== "discarded" && !replaced;

  // the same rule as on the doctor's page: whatever was said since the last version is worked in
  useEffect(() => {
    if (live && stale && !busy && !reading) void refreshSummary(item.episodeId);
  }, [item.episodeId, live, stale, busy, reading]);

  const instant = useMemo(() => (episode ? instantSummary(episode, state) : null), [episode, state]);

  // corrected with 改一下: what it said then, greyed, with the new one further down
  if (replaced) {
    const old = item.snapshot;
    if (!old) return <Note>{L("这条描述改过了，新的在下面。", "This description was changed; the new one is below.")}</Note>;
    return (
      <Card tone="plain" className="animate-fade-up p-6 opacity-70">
        <CardHead icon={<ClipboardList />} title={<>{L("病情描述", "Description")} · {episode?.title ?? ""}</>} aside={<Badge>{L("旧版本", "Old version")}</Badge>} />
        <div className="mt-5 border-t border-line pt-5">
          {old.narrative ? (
            <p className="t-body text-ink-2">{old.narrative}</p>
          ) : (
            <>
              <p className="t-heading text-ink-2">{old.chiefComplaint}</p>
              <p className="t-body mt-3 text-ink-2">{old.presentIllness}</p>
            </>
          )}
        </div>
        <p className="mt-4 text-base text-ink-3">{L("改过了，以下面的新描述为准。", "Changed — the new description below is the one that counts.")}</p>
      </Card>
    );
  }
  if (!episode || item.state === "discarded") {
    return <Note>{L("这次的病情描述已放弃。", "This description was not kept.")}</Note>;
  }
  const view = !stale && episode.summary ? episode.summary : instant;
  if (!view) return null;

  const discard = () => {
    const kept = discardDescription(item.id);
    if (kept) toast.show(L(`没有记「${kept.title}」`, `Not kept: "${kept.title}"`), "neutral", { label: L("撤销", "Undo"), onClick: () => restoreDescription(item.id, kept) });
  };

  const draft = item.state === "draft";
  return (
    <Card tone={draft ? "raised" : "plain"} className={cn("p-5", draft ? "animate-pop" : "animate-fade-up")}>
      <CardHead
        icon={<ClipboardList />}
        title={<>{L("病情描述", "Description")} · {episode.title}</>}
        aside={item.state === "saved" && <Badge tone="good">{L("已保存", "Saved")}</Badge>}
      />
      {/* the document itself: what the patient will hand the doctor, in their own voice */}
      <div className="mt-5 border-t border-line pt-5">
        {view.narrative ? (
          <p className="t-body text-ink">{view.narrative}</p>
        ) : (
          <>
            <p className="t-heading text-ink">{view.chiefComplaint}</p>
            <p className="t-body mt-3 text-ink">{view.presentIllness}</p>
          </>
        )}
      </div>
      {(busy || stale || reading) && (
        <p className="mt-4 flex items-center gap-2.5 text-base text-ink-2" role="status">
          <Spinner className="h-5 w-5" />
          {L("还在整理，稍等一下会更通顺", "Still tidying up. It will read better in a moment.")}
        </p>
      )}
      {draft && (
        <div className="mt-6 grid grid-cols-3 gap-2">
          <Button size="lg" className="px-2" onClick={() => saveDescription(item.id)}>
            {L("保存", "Save")}
          </Button>
          <Button size="lg" variant="secondary" className="px-2" onClick={() => reviseDescription(item.id)}>
            {L("改一下", "Change")}
          </Button>
          <Button size="lg" variant="ghost" className="px-2" onClick={discard}>
            {L("放弃", "Discard")}
          </Button>
        </div>
      )}
      <Link
        href={`/doctor/${episode.id}`}
        className="press -mx-2 -mb-2 mt-4 flex min-h-14 items-center gap-3 rounded-xl px-2 text-lg font-medium text-brand-800 transition duration-200 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
      >
        <IconTile size="sm">
          <FileText />
        </IconTile>
        <span className="min-w-0 flex-1">{L("给医生看", "Show the doctor")}</span>
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
      className={cn("rounded-card p-5 shadow-card", tone.cls, emergency ? "animate-pop shadow-float" : "animate-fade-up")}
      role={emergency ? "alert" : undefined}
    >
      <div className="flex items-center gap-3">
        <IconTile tone={tone.tile} size="lg" className={emergency ? "animate-breathe" : undefined}>
          <tone.Icon />
        </IconTile>
        <p className={cn("text-base font-semibold tracking-[-0.005em]", tone.label)}>{L("分诊建议", "Where to go")}</p>
      </div>
      <p className="t-title mt-4 text-ink">{t.title}</p>
      {t.department && <p className="t-lead mt-3 text-ink">{L("可以挂：", "Clinic to book: ")}{t.department}</p>}
      {t.note && <p className="t-body mt-2 text-ink-2">{t.note}</p>}
      {emergency && (
        <a
          href="tel:120"
          className="press tile-danger mt-5 flex min-h-14 w-full items-center justify-center gap-2.5 rounded-full px-6 text-xl font-semibold text-white transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-danger/30"
        >
          <Phone className="h-6 w-6" />
          {L("拨打 120", "Call 120")}
        </a>
      )}
    </div>
  );
}

/** One line of what the doctor wrote: the label above, the words under it (the way Health lays out details on a phone). */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-3.5 first:pt-0 last:pb-0">
      <dt className="text-base font-medium text-ink-2">{label}</dt>
      <dd className="mt-1 text-lg leading-relaxed text-ink">{children}</dd>
    </div>
  );
}

/** What the doctor wrote, read from a photo or from what the patient said, to be checked before it is saved. */
function OrdersCard({ item, busy }: { item: Extract<ThreadItem, { kind: "orders" }>; busy: boolean }) {
  const r = item.result;
  if (item.state === "discarded") return <Note>{L("这次的医嘱没有保存。", "These doctor's orders were not kept.")}</Note>;
  const draft = item.state === "draft";
  return (
    <Card tone={draft ? "raised" : "plain"} className={cn("p-5", draft ? "animate-pop" : "animate-fade-up")}>
      <CardHead icon={<Stethoscope />} title={L("医嘱整理", "Doctor's orders")} aside={item.state === "saved" && <Badge tone="good">{L("已保存", "Saved")}</Badge>} />
      <dl className="mt-5 divide-y divide-line border-t border-line pt-5">
        {(r.date || r.hospital || r.department) && <Row label={L("时间和地点", "When and where")}>{[r.date, r.hospital, r.department].filter(Boolean).join(" · ")}</Row>}
        <Row label={L("诊断", "Diagnosis")}>{r.diagnosis ? showDiagnosis(r.diagnosis) : L("没有认出诊断", "No diagnosis found")}</Row>
        {r.findings.length > 0 && <Row label={L("检查结果", "Test results")}>{r.findings.join(L("；", "; "))}</Row>}
        {r.medications.length > 0 && (
          <Row label={L("开的药", "Medicines")}>
            <ul className="space-y-1">
              {r.medications.map((m, i) => (
                <li key={i}>{medicationLine(m)}</li>
              ))}
            </ul>
          </Row>
        )}
        {r.procedures.length > 0 && <Row label={L("其他处理", "Other treatment")}>{r.procedures.join(L("；", "; "))}</Row>}
        {r.advice && <Row label={L("医生叮嘱", "Doctor's advice")}>{r.advice}</Row>}
        {r.followUpNote && <Row label={L("复诊", "Follow-up visit")}>{r.followUpNote}</Row>}
        {r.unclear.length > 0 && <Row label={L("没认准的地方", "Not sure about")}>{r.unclear.join(L("；", "; "))}</Row>}
      </dl>
      {draft ? (
        <div className="mt-6 grid grid-cols-2 gap-2">
          <Button size="lg" onClick={() => saveOrders(item.id)}>
            {L("保存", "Save")}
          </Button>
          <Button size="lg" variant="ghost" onClick={() => discardOrders(item.id)}>
            {L("放弃", "Discard")}
          </Button>
        </div>
      ) : (
        <div className="mt-6 grid gap-2">
          <Button size="lg" variant="secondary" onClick={() => listTodos(item.id)}>
            {L("整理要做的事并提醒", "List what to do and remind me")}
          </Button>
          <Button size="lg" variant="secondary" disabled={busy} onClick={() => explainOrders(item.id)}>
            {L("给我解释一下", "Explain it to me")}
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
                {item.photos ? <span className="block text-base text-white/90">{L(`${item.text ? "" : "发了"} ${item.photos} 张照片`, `${item.text ? "" : "Sent "}${item.photos} photo${item.photos === 1 ? "" : "s"}`)}</span> : null}
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
                      {L("依据：", "Based on:")}
                      {item.sources.map((s, i) => (
                        <Link
                          key={i}
                          href={s.href}
                          className="press inline-flex min-h-12 items-center gap-1 rounded-full bg-brand-50 px-4 font-medium text-brand-800 transition hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
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
            // once picked (or answered in words), the answer is in the bubble below: the picture goes
            return item.state === "open" && !busy ? (
              <div key={item.id} className={cn("max-w-md animate-pop", !item.episodeId && "mx-auto w-full")}>
                <BodyMap
                  prompt={item.episodeId ? L("点一下疼的地方", "Tap where it hurts") : L("点一下不舒服的地方", "Tap where it feels unwell")}
                  onPick={(areas) => void pickBodyArea(item.id, areas)}
                />
              </div>
            ) : null;
          case "note":
            return <Note key={item.id}>{item.text}</Note>;
        }
      })}
      {busy && (
        <div className="flex animate-fade-up items-end gap-2.5">
          <Mark />
          <div className="rounded-[20px] rounded-bl-[6px] bg-surface px-4 py-3.5">
            <TypingDots />
          </div>
        </div>
      )}
    </div>
  );
}
