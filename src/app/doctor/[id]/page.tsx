"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { DoctorSummary, Episode } from "@/lib/types";
import { useNow, useStore } from "@/lib/store";
import { currentHint } from "@/lib/checkin";
import { supplement, useReplyPending } from "@/lib/episodeAI";
import { missingBasics } from "@/lib/ai/fallback";
import { hasYearOfData } from "@/lib/metrics";
import { instantSummary, refreshSummary, summaryBusy, summaryIsStale } from "@/lib/summaries";
import { nowISO, summaryToText } from "@/lib/utils";
import { HintBanner } from "@/components/HintBanner";
import { SpeakInput } from "@/components/SpeakInput";
import { useToast } from "@/components/Toast";
import {
  DoctorTabs,
  GlanceSheet,
  QuestionsCard,
  SheetActions,
  SheetDetails,
  SheetFootnote,
  SheetHints,
  SheetList,
  SheetPairs,
  SheetSection,
} from "@/components/DoctorSheet";
import { BackButton, Button, Card, LinkButton, Notice } from "@/components/ui";
import { FileDown } from "lucide-react";
import { L } from "@/lib/lang";

export default function DoctorEpisodePage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useStore();
  const episode = state.episodes.find((e) => e.id === id);
  if (!episode) {
    return (
      <Notice title={L("找不到这条记录", "This record cannot be found")} action={<LinkButton href="/">{L("回到今天", "Back to today")}</LinkButton>}>
        {L("它可能已经被删除了。", "It may have been deleted.")}
      </Notice>
    );
  }
  return <EpisodeSheet episode={episode} />;
}

function EpisodeSheet({ episode: e }: { episode: Episode }) {
  const { state } = useStore();
  const busy = summaryBusy.use(e.id);
  const stale = summaryIsStale(e);
  // the assistant is still reading what was just said (a one-go description, or a line added below)
  const reading = useReplyPending(e.id);
  const now = useNow(60_000);

  // Whatever was recorded since the last version, the page brings itself up to date on opening.
  // It waits for the reading to finish, so the details are written once, from the full record.
  useEffect(() => {
    if (stale && !busy && !reading) void refreshSummary(e.id);
  }, [e.id, stale, busy, reading]);

  // Until the fuller version arrives, the rule-built one is shown. It already has everything recorded.
  const instant = useMemo(() => instantSummary(e, state), [e, state]);
  const view: DoctorSummary | null =
    !stale && e.summary ? e.summary : instant ? { ...instant, generatedAt: nowISO(), mode: "fallback" } : null;
  const profile = state.profile;
  if (!profile || !view) return null;

  const chronic = state.settings.longTerm && hasYearOfData(state);
  // a danger signal in what was said is for the patient, now; it is not part of the sheet
  const alarm = currentHint(e, now);

  return (
    <div className="space-y-4">
      <div className="no-print">
        <BackButton href={e.status === "active" ? "/" : `/episodes/${e.id}/detail`} />
      </div>
      {alarm?.level === "urgent" && <HintBanner hint={alarm} className="no-print" />}
      <DoctorTabs current="episode" episodeHref={`/doctor/${e.id}`} yearHref={chronic ? "/doctor/year" : null} />

      <GlanceSheet profile={profile} subject={e.title} lines={view.glance} generatedAt={view.generatedAt} busy={busy || stale || reading} />

      {/* 导出 PDF: the browser's own print window saves the sheet as a PDF */}
      <div className="no-print flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button size="lg" onClick={() => window.print()}>
          <FileDown className="h-6 w-6" />
          {L("导出 PDF", "Export PDF")}
        </Button>
        <span className="text-base text-ink">{L("在打印窗口里选「存储为 PDF」", "In the print window, choose “Save as PDF”")}</span>
      </div>

      {e.status === "active" && <AddMore episode={e} />}

      <SheetDetails>
        <SheetSection title={L("主诉", "Main complaint")}>{view.chiefComplaint}</SheetSection>
        <SheetSection title={L("现病史", "How it has gone")}>{view.presentIllness}</SheetSection>
        {view.timeline.length > 0 && (
          <SheetSection title={L("时间线", "Timeline")}>
            <SheetPairs rows={view.timeline.map((t) => ({ head: t.time, body: t.event }))} />
          </SheetSection>
        )}
        <SheetSection title={L("当前状态", "How it is now")}>{view.currentStatus}</SheetSection>
        {view.relevantHistory.length > 0 && (
          <SheetSection title={L("相关病史", "Relevant history")}>
            <SheetList items={view.relevantHistory} />
          </SheetSection>
        )}
        {view.priorSimilar.length > 0 && (
          <SheetSection title={L("以前类似的情况", "Similar problems before")}>
            <SheetList items={view.priorSimilar} />
          </SheetSection>
        )}
        {view.hints.length > 0 && (
          <SheetSection title={L("整理时留意到的", "Noted while organising")}>
            <SheetHints hints={view.hints} />
          </SheetSection>
        )}
      </SheetDetails>

      {/* shown once the considered version is in, so the list does not change under the reader */}
      {!(busy || stale || reading) && <QuestionsCard questions={view.questionsForDoctor} />}
      <SheetActions text={() => summaryToText(view, profile, e)} onRefresh={() => void refreshSummary(e.id)} busy={busy} />
      <SheetFootnote />
    </div>
  );
}

/**
 * One more line for the doctor, added without leaving the page. If the three things a doctor asks
 * first (when it began, how bad, what was taken) are not on record yet, they are pointed out here.
 * Nothing is asked and nothing has to be answered.
 */
function AddMore({ episode: e }: { episode: Episode }) {
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const said = [...e.messages.filter((m) => m.role === "user").map((m) => m.content), ...e.entries.map((x) => x.note)].join("\n");
  const missing = missingBasics(said, e.startedAt !== e.createdAt);

  const add = async (text: string) => {
    setSending(true);
    try {
      await supplement(e.id, text);
      toast.show(L("加进去了", "Added"), "good");
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="no-print p-5">
      <h2 className="text-lg font-semibold text-ink">{L("还想补充？", "Anything to add?")}</h2>
      {missing.length > 0 && (
        <p className="mt-1 text-lg leading-relaxed text-ink-2">
          {L(
            `医生多半会问：${missing.map((m) => m.ask).join("")}想好了可以补一句。`,
            `The doctor will probably ask: ${missing.map((m) => m.ask).join(" ")} Add a line when you are ready.`,
          )}
        </p>
      )}
      <SpeakInput
        className="mt-3"
        placeholder={L("说一句或打一句，我加进去", "Say or type a line and I will add it")}
        ariaLabel={L("补充一句", "Add a line")}
        onSubmit={(t) => void add(t)}
        disabled={sending}
      />
    </Card>
  );
}
