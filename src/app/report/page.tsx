"use client";

import Link from "next/link";
import { ChevronRight, ClipboardList, FolderOpen, MessageCircle, Stethoscope, type LucideIcon } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn, episodeLine, fmtDate } from "@/lib/utils";
import { Badge, Card, IconTile, Notice, focusRing } from "@/components/ui";

/** report: every visit record, whole (问诊 + 医嘱) or in part, each with the page for the doctor. */
export default function ReportPage() {
  const { state } = useStore();
  const rows = [
    ...state.episodes.map((e) => ({
      key: e.id,
      at: new Date(e.startedAt).getTime(),
      title: e.title,
      kind: e.visit ? "问诊 + 医嘱" : "问诊",
      icon: e.visit ? Stethoscope : MessageCircle,
      line: `${fmtDate(e.startedAt, { year: true })} · ${episodeLine(e)}`,
      doctor: `/doctor/${e.id}`,
      detail: `/episodes/${e.id}/detail`,
    })),
    ...state.followUps.map((f) => ({
      key: f.id,
      at: new Date(`${f.date}T12:00:00`).getTime(),
      title: f.reason,
      kind: "医嘱",
      icon: ClipboardList,
      line: `${f.date} · ${f.findings}；${f.plan}`,
      doctor: null as string | null,
      detail: "/me",
    })),
  ].sort((a, b) => b.at - a.at);

  return (
    <div className="space-y-5">
      <header className="animate-fade-up pt-1">
        <h1 className="t-display text-ink">report · 就诊记录</h1>
      </header>
      {rows.length === 0 && <Notice icon={<FolderOpen className="h-6 w-6" />} title="还没有记录。" />}
      {rows.length > 0 && (
        <ol className="space-y-3">
          {rows.map((r, i) => (
            <li key={r.key} className={cn("animate-rise", `rise-${Math.min(i + 1, 4)}`)}>
              <RecordCard row={r} first={i === 0} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const actionCls = cn(
  "press flex min-h-14 flex-1 items-center justify-center gap-0.5 text-lg font-semibold text-brand-700 transition-colors duration-200 hover:bg-surface-2/70",
  focusRing,
  "focus-visible:ring-inset",
);

/**
 * One record, as one inset group: what it was and when on top, and the ways into it as a row of
 * equal doors along the bottom, split by a hairline. The most recent record has the solid tile.
 */
function RecordCard({
  row: r,
  first,
}: {
  row: { title: string; kind: string; icon: LucideIcon; line: string; doctor: string | null; detail: string };
  first: boolean;
}) {
  const Icon = r.icon;
  return (
    <Card tone={first ? "raised" : "plain"} className="overflow-hidden">
      <div className="flex items-start gap-3 px-4 pt-4 pb-4">
        <IconTile tone={first ? "solid" : "brand"} size="lg">
          <Icon />
        </IconTile>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h2 className="min-w-0 text-[1.25rem] leading-snug font-semibold tracking-[-0.015em] text-ink">{r.title}</h2>
            <Badge tone="brand">{r.kind}</Badge>
          </div>
          <p className="t-body mt-1 text-ink-2">{r.line}</p>
        </div>
      </div>
      <div className="flex divide-x divide-line border-t border-line">
        {r.doctor && (
          <Link href={r.doctor} className={actionCls}>
            给医生看
            <ChevronRight className="h-5 w-5" />
          </Link>
        )}
        <Link href={r.detail} className={actionCls}>
          详情
          <ChevronRight className="h-5 w-5" />
        </Link>
      </div>
    </Card>
  );
}
