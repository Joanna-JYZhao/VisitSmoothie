"use client";

import { CalendarClock, CalendarDays, CircleAlert, ClipboardList, MessageSquareText, Pill, Stethoscope, Syringe } from "lucide-react";
import type { AfterResult } from "@/lib/types";
import { followUpDate } from "@/lib/after";
import { cn, fmtDate } from "@/lib/utils";
import { Card, IconTile, type IconTone } from "@/components/ui";

/*
 * The visit as one typeset sheet, the way a good prescription reads: the diagnosis in display type
 * at the top, the medicines as hairline rows with their own tiles, everything else quieter below.
 * Every block is an eyebrow label and its content; blocks are separated by hairlines only.
 */

const ic = "h-5 w-5";

/** A block of the sheet: a quiet label with a small tile, then its content. */
function Block({
  label,
  icon,
  tone = "brand",
  className,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  tone?: IconTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("px-5 py-5", className)}>
      <p className="flex items-center gap-2.5 text-base leading-snug font-medium text-ink-2">
        <IconTile tone={tone} size="sm">
          {icon}
        </IconTile>
        {label}
      </p>
      <div className="t-body mt-3 text-ink">{children}</div>
    </section>
  );
}

/** What was read from the recording and the photos, in the order the patient needs it. */
export function VisitResult({ result: r }: { result: AfterResult }) {
  const where = [r.date ? fmtDate(`${r.date}T12:00:00`, { year: true }) : "", r.hospital, r.department].filter(Boolean).join(" · ");
  const next = followUpDate(r);
  const followUp = [r.followUpNote, next ? `（${fmtDate(next, { weekday: true })}）` : ""].filter(Boolean).join("");
  // a short diagnosis is set like a headline; a long one steps down so it still reads as one line or two
  const short = (r.diagnosis?.length ?? 0) <= 12;
  return (
    <Card tone="raised" className="animate-rise divide-y divide-line overflow-hidden">
      {/* the letterhead: when and where, then the diagnosis as the title of the sheet */}
      <div className="px-5 pt-5 pb-5">
        {where && (
          <p className="mb-5 flex items-center gap-2.5 text-base leading-snug font-medium text-ink-2">
            <IconTile tone="neutral" size="sm">
              <CalendarDays className={ic} />
            </IconTile>
            <span className="min-w-0">
              时间地点
              <span className="ml-2.5 font-normal text-ink">{where}</span>
            </span>
          </p>
        )}
        <p className="flex items-center gap-2.5 text-base leading-snug font-medium text-brand-700">
          <IconTile tone="brand" size="sm">
            <Stethoscope className={ic} />
          </IconTile>
          诊断
        </p>
        {r.diagnosis ? (
          <h2 className={cn("mt-3 text-balance text-ink", short ? "t-display" : "t-title")}>{r.diagnosis}</h2>
        ) : (
          <p className="t-lead mt-3 text-ink-2">没有写诊断</p>
        )}
      </div>

      {r.findings.length > 0 && (
        <Block label="检查结果" icon={<ClipboardList className={ic} />} tone="info">
          {r.findings.join("；")}
        </Block>
      )}

      <Block label="药和用法" icon={<Pill className={ic} />}>
        {r.medications.length ? (
          <ul className="-mx-2 divide-y divide-line">
            {r.medications.map((m, i) => (
              <li key={i} className="flex items-start gap-4 px-2 py-3.5 first:pt-1 last:pb-1">
                <IconTile tone="brand" size="md" className="mt-0.5">
                  <Pill className={ic} />
                </IconTile>
                <span className="min-w-0 flex-1 pt-0.5">
                  <span className="block text-lg leading-snug font-semibold text-ink">{m.name}</span>
                  {m.usage && <span className="mt-1 block text-base leading-relaxed text-ink-2">{m.usage}</span>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-ink-2">没有开药</span>
        )}
      </Block>

      {r.advice && (
        <Block label="注意事项" icon={<MessageSquareText className={ic} />} tone="neutral">
          {r.advice}
        </Block>
      )}

      {r.procedures.length > 0 && (
        <Block label="其他治疗" icon={<Syringe className={ic} />} tone="neutral">
          {r.procedures.join("；")}
        </Block>
      )}

      <Block label="复诊" icon={<CalendarClock className={ic} />} className={followUp ? "bg-brand-50/50" : undefined}>
        {followUp ? <span className="text-lg leading-relaxed font-medium text-brand-800">{followUp}</span> : <span className="text-ink-2">没有说要复诊</span>}
      </Block>

      {r.unclear.length > 0 && (
        <Block label="这几处没看清，请对一下原件" icon={<CircleAlert className={ic} />} tone="warn" className="bg-warn-bg/70">
          <ul className="space-y-1.5">
            {r.unclear.map((u, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden="true" className="text-warn">
                  ·
                </span>
                <span className="min-w-0 flex-1">{u}</span>
              </li>
            ))}
          </ul>
        </Block>
      )}
    </Card>
  );
}
