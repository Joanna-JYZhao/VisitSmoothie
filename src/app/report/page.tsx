"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { episodeLine, fmtDate } from "@/lib/utils";

/** report: every visit record, whole (问诊 + 医嘱) or in part, each with the page for the doctor. */
export default function ReportPage() {
  const { state } = useStore();
  const rows = [
    ...state.episodes.map((e) => ({
      key: e.id,
      at: new Date(e.startedAt).getTime(),
      title: e.title,
      kind: e.visit ? "问诊 + 医嘱" : "问诊",
      line: `${fmtDate(e.startedAt, { year: true })} · ${episodeLine(e)}`,
      doctor: `/doctor/${e.id}`,
      detail: `/episodes/${e.id}/detail`,
    })),
    ...state.followUps.map((f) => ({
      key: f.id,
      at: new Date(`${f.date}T12:00:00`).getTime(),
      title: f.reason,
      kind: "医嘱",
      line: `${f.date} · ${f.findings}；${f.plan}`,
      doctor: null as string | null,
      detail: "/me",
    })),
  ].sort((a, b) => b.at - a.at);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-ink">report · 就诊记录</h1>
      {rows.length === 0 && <p className="text-lg text-ink-2">还没有记录。</p>}
      {rows.map((r) => (
        <div key={r.key} className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xl font-semibold text-ink">{r.title}</span>
            <span className="rounded-full bg-brand-50 px-3 text-base text-brand-800">{r.kind}</span>
          </div>
          <p className="mt-1 text-base text-ink-2">{r.line}</p>
          <div className="mt-2 flex gap-4">
            {r.doctor && (
              <Link href={r.doctor} className="text-base font-medium text-brand-700 underline">
                给医生看
              </Link>
            )}
            <Link href={r.detail} className="text-base font-medium text-brand-700 underline">
              详情
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
