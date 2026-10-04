"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, ChevronRight, Stethoscope } from "lucide-react";
import { useNow, useStore } from "@/lib/store";
import { startVisit } from "@/lib/episodeAI";
import { dayLabel } from "@/lib/checkin";
import { hasYearOfData } from "@/lib/metrics";
import { MicButton } from "@/components/MicButton";
import { useAiAvailable } from "@/components/AiStatus";
import { BackLink, Button, Card, PageTitle, RowLink } from "@/components/ui";
import { L, pick } from "@/lib/lang";

/** The five things a doctor wants to hear. Picked at render time, so they follow the language. */
const topics = () =>
  pick(
    ["哪里不舒服", "什么时候开始的", "有多难受", "吃过什么药", "最想问医生什么"],
    ["Where it hurts", "When it started", "How bad it is", "What you have taken", "What you most want to ask"],
  );

/**
 * Speech arrives in pieces when the microphone is used more than once. A piece is joined to what
 * is already there with a comma unless that already ends in punctuation, so two sentences do not
 * run into each other ("肚子痛两天了昨晚开始拉肚子").
 */
function joinSpoken(before: string, piece: string): string {
  if (!before) return piece;
  if (/[，。！？、；：,.!?;:\s]$/.test(before)) return `${before}${piece}`;
  return `${before}${/[\u4e00-\u9fff]/.test(before) ? "，" : ", "}${piece}`;
}

/**
 * 去看医生: say what is wrong once, and the page for the doctor is ready. Nothing is asked back.
 * Complaints that are already being tracked are offered first, since their page already exists.
 */
export default function VisitPage() {
  const { state } = useStore();
  const router = useRouter();
  const now = useNow(60_000);
  const canSpeak = useAiAvailable();
  const [text, setText] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 132)}px`;
  }, [text]);

  if (!state.profile) return null;
  const active = state.episodes.filter((e) => e.status === "active");
  const year = state.settings.longTerm && hasYearOfData(state);
  const known = active.length > 0 || year;

  const go = () => {
    if (!text.trim()) return;
    const episode = startVisit(text);
    // replace, so that "back" from the doctor's page leads home and not to an empty form
    router.replace(`/doctor/${episode.id}`);
  };

  return (
    <div className="space-y-5">
      <div>
        <BackLink href="/">{L("返回", "Back")}</BackLink>
        <PageTitle
          className="mt-1 mb-0"
          sub={L(
            "把这次的问题说一遍。我结合你的档案和以前的记录，整理成一页交给医生。",
            "Tell me what is wrong, once. I put it together with your records into one page for the doctor.",
          )}
        >
          {L("去看医生", "See a doctor")}
        </PageTitle>
      </div>

      {known && (
        <section aria-label={L("已经在记的", "Already being tracked")}>
          <h2 className="mb-2 text-lg font-semibold text-ink">
            {L("是为了这些去的吗？点一下，直接打开给医生看的一页", "Is it about one of these? Tap it to open its page for the doctor")}
          </h2>
          <Card className="divide-y divide-line overflow-hidden">
            {active.map((e) => (
              <RowLink
                key={e.id}
                href={`/doctor/${e.id}`}
                icon={<Stethoscope className="h-5 w-5" />}
                title={e.title}
                detail={`${dayLabel(e, now)}${e.visit ? L(" · 看过医生", " · seen a doctor") : ""}`}
              />
            ))}
            {year && (
              <RowLink
                href="/doctor/year"
                icon={<CalendarCheck className="h-5 w-5" />}
                title={L("复诊：这一年的情况", "Follow-up visit: this year")}
                detail={L("血糖、血压、用药的变化", "Changes in glucose, blood pressure and medicines")}
              />
            )}
          </Card>
        </section>
      )}

      <section aria-label={L("说这次的问题", "Describe the problem")} className="space-y-3">
        {known && <h2 className="text-lg font-semibold text-ink">{L("是别的问题？说给我听", "Something else? Tell me")}</h2>}
        <MicButton big label={L("按一下，开始说", "Tap to start talking")} maxSeconds={180} onText={(t) => setText((x) => joinSpoken(x, t))} />
        <div className="rounded-card border-2 border-line-strong bg-surface p-2 shadow-card transition focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100">
          <textarea
            ref={box}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label={L("这次的问题", "What is wrong this time")}
            placeholder={
              canSpeak
                ? L("说的话会出现在这里，可以改。也可以直接打字。", "What you say appears here and you can edit it. You can also type.")
                : L(
                    "比如：这两天肚子痛，昨晚开始拉肚子，吃了蒙脱石散没用。",
                    "For example: my stomach has hurt for two days, diarrhea since last night, the medicine did not help.",
                  )
            }
            className="min-h-32 w-full resize-none bg-transparent px-2.5 py-2 text-lg leading-relaxed text-ink outline-none placeholder:text-ink-3"
          />
        </div>
        <div className="rounded-2xl bg-brand-50 px-4 py-3.5">
          <p className="text-base font-medium text-brand-800">
            {L("想到什么说什么。说到这几件，医生看得更明白：", "Say whatever comes to mind. These help the doctor most:")}
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-lg text-ink">
            {topics().map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <ChevronRight className="h-4 w-4 text-brand-600" aria-hidden="true" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        {/* Stays at the bottom edge of the screen while the text above it grows, so it is never pushed out of sight. */}
        <div className="sticky bottom-0 z-10 -mx-4 bg-canvas/95 px-4 pt-2 pb-3 backdrop-blur">
          <Button size="lg" className="w-full" disabled={!text.trim()} onClick={go}>
            {L("整理成给医生看的一页", "Make the doctor's page")}
          </Button>
        </div>
        <p className="text-center text-base leading-relaxed text-ink-2">
          {L("我只整理你说的和以前记下的，不做判断。", "I only organise what you say and what is on record. I make no judgement.")}
        </p>
      </section>
    </div>
  );
}
