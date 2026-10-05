"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, NotebookPen, Plus } from "lucide-react";
import type { AppState, Hint } from "@/lib/types";
import { useNow, useStore } from "@/lib/store";
import { currentHint, recheckDue } from "@/lib/checkin";
import { requestReply } from "@/lib/episodeAI";
import { instantAlert } from "@/lib/ai/fallback";
import { dueMetrics, formatValue, hasYearOfData, pendingRetest } from "@/lib/metrics";
import { DAY, cn, fmtDate, greeting, nowISO, relativeTime } from "@/lib/utils";
import { EpisodeCard } from "@/components/EpisodeCard";
import { HintBanner } from "@/components/HintBanner";
import { QuickEntries, VisitEntry } from "@/components/HomeEntries";
import { LongTermCard } from "@/components/LongTermCard";
import { ReadingInputs, parseReading, useRecordMetric } from "@/components/RecordMetricModal";
import { SpeakInput } from "@/components/SpeakInput";
import { useToast } from "@/components/Toast";
import { Button, Card, IconTile, LinkButton, TextButton, TextLink, focusRing } from "@/components/ui";

const COMMON = ["头痛", "发烧", "咳嗽", "肚子痛", "拉肚子", "头晕"];
const WELCOME_KEY = "yiban.welcome";
/** The appointment card appears this many days ahead. */
const VISIT_CARD_DAYS = 3;

/** 今天: the one screen that answers "what should I do now". */
export default function TodayPage() {
  const { state, createEpisode } = useStore();
  const router = useRouter();
  const now = useNow(60_000);
  const [adding, setAdding] = useState(false);
  const [alert, setAlert] = useState<Hint | null>(null);
  // what sign-up understood from the one sentence, shown once until it is dismissed
  const [welcome, setWelcome] = useState<string[] | null>(() => {
    try {
      const raw = sessionStorage.getItem(WELCOME_KEY);
      return raw ? (JSON.parse(raw) as string[]) : null;
    } catch {
      return null;
    }
  });
  const dismissWelcome = () => {
    setWelcome(null);
    try {
      sessionStorage.removeItem(WELCOME_KEY);
    } catch {
      /* nothing to clean up */
    }
  };
  const profile = state.profile;
  if (!profile) return null;

  const active = state.episodes.filter((e) => e.status === "active");
  const longTerm = state.settings.longTerm;
  const visitToday = state.nextVisit != null && visitDayDiff(state.nextVisit.at, now) <= 1;
  const metricDue = dueMetrics(state.measurements, state.settings, now).length > 0;
  // One thing stands out at a time. When something more pressing already holds the screen (a red
  // warning, a reading to re-test, today's appointment with its own 给医生看, a symptom whose card
  // says to see a doctor), 去看医生 steps back to an outline.
  const visitHasButton = visitToday && sheetForVisit(state) != null;
  const cardUrges = !visitToday && active.some((e) => currentHint(e, now) != null || recheckDue(e, now));
  const visitQuiet = alert != null || pendingRetest(state.measurements, now) != null || visitHasButton || cardUrges;
  // With cards below it, the entry is one short bar, so that today's question stays on the first screen.
  const visitCardShown = state.nextVisit != null && visitDayDiff(state.nextVisit.at, now) <= VISIT_CARD_DAYS;
  const visitCompact = active.length > 0 || longTerm || visitCardShown;
  const raise = (h: Hint) => {
    setAlert(h);
    window.scrollTo(0, 0);
  };

  const start = (text: string) => {
    // Danger signals are caught by plain rules here, so the warning is on screen before any model answers.
    const ep = createEpisode({ text, hint: instantAlert(text) });
    void requestReply(ep.id, "intake");
    router.push(`/episodes/${ep.id}`);
  };

  const input = (
    <>
      <SpeakInput placeholder="说一句或打一句，比如：喉咙痛，昨晚开始的" ariaLabel="哪里不舒服" onSubmit={start} />
      <div className="mt-3 flex flex-wrap gap-2">
        {COMMON.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => start(s)}
            className={cn(
              "min-h-12 rounded-full border-2 border-line-strong bg-surface px-5 text-lg text-ink shadow-edge transition hover:border-brand-400 hover:bg-brand-50 active:scale-[0.97]",
              focusRing,
            )}
          >
            {s}
          </button>
        ))}
      </div>
    </>
  );

  return (
    <div className="space-y-5">
      <header>
        <p className="text-base font-medium text-brand-700">{fmtDate(new Date(now), { weekday: true })}</p>
        <h1 className="mt-0.5 text-[1.65rem] leading-tight font-semibold tracking-tight text-ink">
          {greeting(new Date(now))}，{profile.name}
        </h1>
      </header>

      {welcome && (
        <Card tone="brand" className="p-5">
          <p className="text-lg font-semibold text-ink">档案建好了。我记下了这些：</p>
          <ul className="mt-1.5 space-y-0.5 text-lg leading-relaxed text-ink">
            {welcome.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className="mt-1 flex items-center justify-between">
            <TextLink href="/me/edit" className="-ml-2">
              不对，去改
            </TextLink>
            <TextButton onClick={dismissWelcome}>知道了</TextButton>
          </div>
        </Card>
      )}

      {alert && (
        <HintBanner hint={alert}>
          <button
            type="button"
            onClick={() => setAlert(null)}
            className="mt-3 min-h-11 rounded-xl bg-white/20 px-5 text-base font-semibold text-white transition hover:bg-white/30 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60"
          >
            知道了
          </button>
        </HintBanner>
      )}

      {/* The order is the order of urgency: a low reading to re-test, then the ways in (going to the
          doctor first), today's appointment, a number that is due, then the complaints being tracked. */}
      <RetestCard now={now} onAlert={raise} onRecovered={() => setAlert(null)} />

      <div className="space-y-3">
        <VisitEntry compact={visitCompact} quiet={visitQuiet} />
        <QuickEntries />
      </div>

      <NextVisitCard state={state} now={now} />

      {longTerm && metricDue && <LongTermCard now={now} onAlert={raise} />}

      {active.map((e) => (
        <EpisodeCard key={e.id} episode={e} now={now} quiet={visitToday} />
      ))}

      {longTerm && !metricDue && <LongTermCard now={now} onAlert={raise} />}

      {!active.length ? (
        // Not the same thing as 去看医生 above: this is for something that does not need a hospital
        // today. It is written down, and asked about every day.
        <section aria-labelledby="record-title" className="pt-2">
          <div className="mb-3 flex items-start gap-3">
            <IconTile size="lg" className="mt-0.5">
              <NotebookPen className="h-6 w-6" />
            </IconTile>
            <div className="min-w-0">
              <h2 id="record-title" className="text-xl leading-snug font-semibold text-ink">
                有点不舒服？先记下来
              </h2>
              <p className="mt-0.5 text-lg leading-relaxed text-ink-2">说一句就行。我每天来问你好点没有。</p>
            </div>
          </div>
          {input}
          <div className="mt-2 flex justify-center">
            <TextLink href="/after">刚看完医生？记一下</TextLink>
          </div>
        </section>
      ) : adding ? (
        <section aria-label="记录不舒服">
          <p className="mb-2 text-xl font-semibold text-ink">还有哪里不舒服？</p>
          {input}
        </section>
      ) : (
        <div className="flex justify-center">
          <TextButton onClick={() => setAdding(true)}>
            <Plus className="h-5 w-5" />
            还有别的不舒服
          </TextButton>
        </div>
      )}
    </div>
  );
}

/** Whole calendar days from today to the appointment (negative once it has passed). */
function visitDayDiff(iso: string, now: number): number {
  const at = new Date(iso);
  const today = new Date(now);
  return Math.round(
    (new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime() -
      new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) /
      DAY,
  );
}

/** Where 给医生看 on the appointment card leads: the yearly review if there is one, else the symptom being tracked. */
function sheetForVisit(state: AppState): string | null {
  const active = state.episodes.find((e) => e.status === "active");
  return state.settings.longTerm && hasYearOfData(state) ? "/doctor/year" : active ? `/doctor/${active.id}` : null;
}

/** The appointment the user asked to be reminded of: shown from three days before until it is dealt with. */
function NextVisitCard({ state, now }: { state: AppState; now: number }) {
  const { setNextVisit } = useStore();
  const toast = useToast();
  const visit = state.nextVisit;
  if (!visit) return null;
  const dayDiff = visitDayDiff(visit.at, now);
  if (dayDiff > VISIT_CARD_DAYS) return null;
  const showHref = sheetForVisit(state);
  const when = dayDiff === 0 ? "今天" : dayDiff === 1 ? "明天" : dayDiff > 1 ? `${dayDiff} 天后` : null;

  return (
    <Card tone="brand" className="p-5">
      <div className="flex items-start gap-3.5">
        <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface text-brand-700 shadow-pill">
          <CalendarCheck className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          {when ? (
            <p className="text-xl leading-relaxed font-semibold text-ink">
              {when}要去看医生：{visit.note}
            </p>
          ) : (
            <p className="text-xl leading-relaxed font-semibold text-ink">
              {fmtDate(visit.at)}该去看医生的：{visit.note}。去过了吗？
            </p>
          )}
          {dayDiff > 0 && <p className="mt-0.5 text-base text-ink-2">{fmtDate(visit.at, { weekday: true })}</p>}
        </div>
      </div>
      {showHref && dayDiff <= 1 && (
        <LinkButton href={showHref} size="lg" className="mt-4 w-full">
          给医生看
        </LinkButton>
      )}
      <div className="mt-1 flex items-center justify-between">
        <TextLink href="/after?visit=1">看完医生了</TextLink>
        <TextButton
          onClick={() => {
            const kept = visit;
            setNextVisit(null);
            toast.show("好，这次不提醒了", "neutral", { label: "撤销", onClick: () => setNextVisit(kept) });
          }}
        >
          这次不去了
        </TextButton>
      </div>
    </Card>
  );
}

/**
 * After a low glucose reading the advice is to test again in fifteen minutes. This card is where
 * that second number goes, so the advice is followed through instead of being forgotten.
 */
function RetestCard({ now, onAlert, onRecovered }: { now: number; onAlert: (h: Hint) => void; onRecovered: () => void }) {
  const { state } = useStore();
  const record = useRecordMetric();
  const toast = useToast();
  const [raw, setRaw] = useState("");
  const [raw2, setRaw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pending = pendingRetest(state.measurements, now);
  if (!pending) return null;
  const { kind, reading } = pending;
  const type = kind === "bp" ? "bp" : "ppg";

  const save = () => {
    const parsed = parseReading(type, raw, raw2);
    if (typeof parsed === "string") {
      setError(parsed);
      return;
    }
    const { saved, hint } = record({ type, ...parsed, at: nowISO(), note: kind === "bp" ? "血压很高后复测" : "低血糖后复测" });
    setRaw("");
    setRaw2("");
    setError(null);
    if (hint?.level === "urgent") {
      // a second reading that is still in the danger range: no more "measure again", go now
      onAlert(
        kind === "bp"
          ? { level: "urgent", text: `两次血压都很高（这次 ${formatValue(saved)}）。请今天就去医院；如果有头痛、胸闷、看东西模糊或手脚没力气，请立即拨打 120。` }
          : hint,
      );
      return;
    }
    // back out of the danger range: the red warning has done its job
    onRecovered();
    toast.show(
      kind === "bp"
        ? `血压降到 ${formatValue(saved)} 了。之后照常记，看医生时把这次告诉医生`
        : `血糖回到 ${formatValue(saved)} 了。接下来正常吃饭，复诊时把这次告诉医生`,
      "good",
    );
  };

  return (
    <Card tone="alert" className="p-5">
      <p className="text-xl leading-relaxed font-semibold text-ink">
        {kind === "bp"
          ? `${relativeTime(reading.at, now)}血压 ${formatValue(reading)}，很高。坐下休息 10 分钟后再测一次，把数填在这里。`
          : `${relativeTime(reading.at, now)}血糖 ${formatValue(reading)}，偏低。吃糖后 15 分钟再测一次，把数填在这里。`}
      </p>
      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          save();
        }}
      >
        <ReadingInputs
          type={type}
          raw={raw}
          raw2={raw2}
          onChange={(a, b) => {
            setRaw(a);
            setRaw2(b);
            setError(null);
          }}
        />
        <Button type="submit" className="shrink-0">
          记下
        </Button>
      </form>
      {error && <p className="mt-2 text-base font-medium text-danger">{error}</p>}
    </Card>
  );
}
