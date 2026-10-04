"use client";

import { useParams } from "next/navigation";
import { FileSearch } from "lucide-react";
import { useStore } from "@/lib/store";
import { recordById } from "@/lib/records";
import { L } from "@/lib/lang";
import { fmtDate } from "@/lib/utils";
import { LinkButton, Notice, PageHeader } from "@/components/ui";
import { RecordLinks, VisitPlanView } from "@/components/VisitPlanView";

/**
 * A visit filed on its own (post only): the Clinical Plan with where each line stands, the next visit
 * and what to bring, and what was asked. Nothing else.
 */
export default function VisitRecordPage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useStore();
  const visit = state.followUps.find((f) => f.id === id);
  const ref = recordById(state, id);
  if (!visit || !ref) {
    return (
      <Notice
        icon={<FileSearch className="h-6 w-6" />}
        title={L("找不到这条记录", "Record not found")}
        action={<LinkButton href="/report">{L("回到健康报告", "Back to Record")}</LinkButton>}
      >
        {L("它可能已经被删除了。", "It may have been deleted.")}
      </Notice>
    );
  }
  const where = [visit.hospital, visit.department].filter(Boolean).join(" · ");
  return (
    <div className="space-y-5">
      <PageHeader
        back={{ href: "/report", label: L("健康报告", "Record") }}
        title={ref.title}
        sub={`${fmtDate(`${visit.date}T12:00:00`, { year: true })}${where ? ` · ${where}` : ""}`}
      />
      <RecordLinks id={id} />
      <VisitPlanView id={id} />
    </div>
  );
}
