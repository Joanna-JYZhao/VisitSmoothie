"use client";

import Link from "next/link";
import { CalendarClock, ChevronDown, ChevronRight, ClipboardList, Link2, MessageCircleQuestion } from "lucide-react";
import type { PlanItem, Todo } from "@/lib/types";
import { storeActions, useNow, useStore } from "@/lib/store";
import { allRecords, followUpChain, planStatus, recordHref, recordLabel, visitPartsOf, type RecordRef } from "@/lib/records";
import { followUpNote } from "@/lib/reminders";
import { L } from "@/lib/lang";
import { cn, fmtDate } from "@/lib/utils";
import { Badge, Card, IconTile, focusRing } from "@/components/ui";

/*
 * What a visit (post) put on the record: the Clinical Plan with where each line stands, the next visit
 * and what to do or bring for it, and what the patient asked and had explained, by the line it was about.
 * Nothing else: the rest of what was read is not shown here.
 */

const KIND: Record<Todo["kind"], [string, string]> = {
  medicine: ["用药", "Medicine"],
  care: ["要做的", "To do"],
  caution: ["要注意的", "Take care"],
  followup: ["复诊", "Follow-up visit"],
};

function Title({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h2 className="t-heading flex items-center gap-3 text-ink">
      <IconTile tone="brand">{icon}</IconTile>
      {children}
    </h2>
  );
}

function PlanRow({ recordId, item, now }: { recordId: string; item: PlanItem; now: number }) {
  const status = planStatus(item, now);
  const text = item.kind === "followup" ? followUpNote(item.text) : item.text;
  return (
    <li className="flex items-start gap-3 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-lg leading-snug text-ink">
          <span className="mr-2 font-semibold text-brand-700">{L(...KIND[item.kind])}</span>
          {text}
        </p>
        <p className={cn("mt-1 text-base", status.ongoing ? "text-brand-700" : "text-ink-3")}>{status.label}</p>
      </div>
      {/* ended by hand, or taken back; the follow-up visit ends on its day */}
      {item.kind !== "followup" && (status.ongoing || item.endedAt) && (
        <button
          type="button"
          onClick={() => storeActions.endPlanItem(recordId, item.id, !item.endedAt)}
          className={cn("press min-h-11 shrink-0 rounded-full border border-line px-3.5 text-base font-medium text-ink-2 hover:bg-surface-2", focusRing)}
        >
          {item.endedAt ? L("没结束", "Not ended") : L("结束", "End")}
        </button>
      )}
    </li>
  );
}

/**
 * 复诊: a button to the record this one follows up (上一次) and to the one before that (上上次); further
 * back is one more tap from there. Below, the records that follow this one up.
 */
export function RecordLinks({ id }: { id: string }) {
  const { state } = useStore();
  const chain = followUpChain(state, id, 2);
  const later = allRecords(state).filter((r) => r.followUpOf === id);
  if (!chain.length && !later.length) return null;
  const row = (r: RecordRef, label: string) => (
    <Link key={r.id} href={recordHref(r)} className={cn("press flex min-h-13 items-center gap-3 rounded-2xl bg-brand-50 px-3.5 py-2 text-left transition-colors hover:bg-brand-100", focusRing)}>
      <Link2 aria-hidden="true" className="h-5 w-5 shrink-0 text-brand-700" />
      <span className="min-w-0 flex-1 text-base leading-snug text-ink">
        <span className="font-semibold text-brand-800">{label}</span> {recordLabel(r)}
      </span>
      <ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-brand-700" />
    </Link>
  );
  return (
    <div className="no-print space-y-2">
      {chain.map((r, i) => row(r, i === 0 ? L("上一次：", "Last time:") : L("上上次：", "The time before:")))}
      {later.map((r) => row(r, L("它的复诊：", "Its follow-up:")))}
    </div>
  );
}
export function VisitPlanView({ id }: { id: string }) {
  const { state } = useStore();
  const now = useNow(60_000);
  const parts = visitPartsOf(state, id);
  if (!parts) return null;
  const { plan, next, learned } = parts;
  const ongoing = plan.filter((p) => planStatus(p, now).ongoing).length;
  return (
    <div className="space-y-4">
      <Card className="px-4 pt-4 pb-1">
        <div className="flex items-center justify-between gap-3">
          <Title icon={<ClipboardList />}>{L("治疗计划", "Clinical Plan")}</Title>
          {plan.length > 0 && <Badge tone={ongoing ? "brand" : "good"}>{ongoing ? L(`${ongoing} 条进行中`, `${ongoing} ongoing`) : L("都已结束", "All ended")}</Badge>}
        </div>
        {parts.date && <p className="mt-2 text-base text-ink-2">{L(`${fmtDate(`${parts.date}T12:00:00`, { year: true })}看的医生`, `Seen on ${fmtDate(`${parts.date}T12:00:00`, { year: true })}`)}</p>}
        {plan.length ? (
          <ul className="mt-1 divide-y divide-line">
            {plan.map((p) => (
              <PlanRow key={p.id} recordId={id} item={p} now={now} />
            ))}
          </ul>
        ) : (
          <p className="t-body py-4 text-ink-2">{L("这次没有存下治疗计划。", "No plan was saved with this visit.")}</p>
        )}
      </Card>

      {next && (
        <Card className="px-4 py-4">
          <Title icon={<CalendarClock />}>{L("下次复诊", "Next visit")}</Title>
          <p className="t-body mt-3 text-ink">
            {next.note}
            {next.at ? L(`（${fmtDate(next.at, { weekday: true })}）`, ` (${fmtDate(next.at, { weekday: true })})`) : ""}
          </p>
          {next.prepare.length > 0 && (
            <>
              <p className="mt-3 text-base font-semibold text-ink-2">{L("要做的、要带的", "To do or bring")}</p>
              <ul className="mt-1.5 space-y-1.5">
                {next.prepare.map((x, i) => (
                  <li key={i} className="flex gap-3 text-lg leading-snug text-ink">
                    <span aria-hidden="true" className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" />
                    <span className="min-w-0">{x}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}

      {learned.length > 0 && (
        <Card className="px-4 pt-4 pb-2">
          <Title icon={<MessageCircleQuestion />}>{L("问过的问题", "What I asked")}</Title>
          <ul className="mt-1 divide-y divide-line">
            {learned.map((x, i) => (
              <li key={i}>
                <details className="group py-3">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-lg font-medium text-ink [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0">{x.about}</span>
                    <ChevronDown aria-hidden="true" className="h-5 w-5 shrink-0 text-ink-3 transition-transform duration-200 group-open:rotate-180" />
                  </summary>
                  <p className="t-body mt-2 rounded-2xl bg-brand-50/70 px-4 py-3 whitespace-pre-line text-ink">{x.text}</p>
                </details>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
