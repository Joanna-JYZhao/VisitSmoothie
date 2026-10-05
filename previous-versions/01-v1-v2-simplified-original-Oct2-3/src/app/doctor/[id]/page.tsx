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
import { BackButton, Card, LinkButton, Notice } from "@/components/ui";

export default function DoctorEpisodePage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useStore();
  const episode = state.episodes.find((e) => e.id === id);
  if (!episode) {
    return (
      <Notice title="找不到这条记录" action={<LinkButton href="/">回到今天</LinkButton>}>
        它可能已经被删除了。
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

      {e.status === "active" && <AddMore episode={e} />}

      <SheetDetails>
        <SheetSection title="主诉">{view.chiefComplaint}</SheetSection>
        <SheetSection title="现病史">{view.presentIllness}</SheetSection>
        {view.timeline.length > 0 && (
          <SheetSection title="时间线">
            <SheetPairs rows={view.timeline.map((t) => ({ head: t.time, body: t.event }))} />
          </SheetSection>
        )}
        <SheetSection title="当前状态">{view.currentStatus}</SheetSection>
        {view.relevantHistory.length > 0 && (
          <SheetSection title="相关病史">
            <SheetList items={view.relevantHistory} />
          </SheetSection>
        )}
        {view.priorSimilar.length > 0 && (
          <SheetSection title="以前类似的情况">
            <SheetList items={view.priorSimilar} />
          </SheetSection>
        )}
        {view.hints.length > 0 && (
          <SheetSection title="整理时留意到的">
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
      toast.show("加进去了", "good");
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="no-print p-5">
      <h2 className="text-lg font-semibold text-ink">还想补充？</h2>
      {missing.length > 0 && (
        <p className="mt-1 text-lg leading-relaxed text-ink-2">
          医生多半会问：{missing.map((m) => m.ask).join("")}想好了可以补一句。
        </p>
      )}
      <SpeakInput
        className="mt-3"
        placeholder="说一句或打一句，我加进去"
        ariaLabel="补充一句"
        onSubmit={(t) => void add(t)}
        disabled={sending}
      />
    </Card>
  );
}
