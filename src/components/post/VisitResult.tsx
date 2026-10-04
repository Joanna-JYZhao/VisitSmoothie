"use client";

import type { AfterResult } from "@/lib/types";
import { followUpDate } from "@/lib/after";
import { fmtDate } from "@/lib/utils";
import { Card } from "@/components/ui";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-4">
      <p className="text-base font-medium text-ink-2">{label}</p>
      <div className="mt-0.5 text-lg leading-relaxed text-ink">{children}</div>
    </div>
  );
}

/** What was read from the recording and the photos, in the order the patient needs it. */
export function VisitResult({ result: r }: { result: AfterResult }) {
  const where = [r.date ? fmtDate(`${r.date}T12:00:00`, { year: true }) : "", r.hospital, r.department].filter(Boolean).join(" · ");
  const next = followUpDate(r);
  const followUp = [r.followUpNote, next ? `（${fmtDate(next, { weekday: true })}）` : ""].filter(Boolean).join("");
  return (
    <Card className="divide-y divide-line">
      {where && <Row label="时间地点">{where}</Row>}
      <Row label="诊断">{r.diagnosis ? <span className="text-xl font-semibold">{r.diagnosis}</span> : "没有写诊断"}</Row>
      {r.findings.length > 0 && <Row label="检查结果">{r.findings.join("；")}</Row>}
      <Row label="药和用法">
        {r.medications.length ? (
          <ul className="space-y-1">
            {r.medications.map((m, i) => (
              <li key={i}>
                <span className="font-semibold">{m.name}</span>
                {m.usage ? `：${m.usage}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          "没有开药"
        )}
      </Row>
      {r.advice && <Row label="注意事项">{r.advice}</Row>}
      {r.procedures.length > 0 && <Row label="其他治疗">{r.procedures.join("；")}</Row>}
      <Row label="复诊">{followUp || "没有说要复诊"}</Row>
      {r.unclear.length > 0 && (
        <Row label="这几处没看清，请对一下原件">
          <ul className="space-y-0.5">
            {r.unclear.map((u, i) => (
              <li key={i}>· {u}</li>
            ))}
          </ul>
        </Row>
      )}
    </Card>
  );
}
