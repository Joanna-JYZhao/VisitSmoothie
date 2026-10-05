"use client";

import type { AnnualSummaryBody, AppState, DoctorSummaryBody, Episode } from "./types";
import { getState, storeActions } from "./store";
import { createBusy } from "./busy";
import { generateAnnual, generateSummary } from "./ai/client";
import { fallbackAnnual, fallbackSummary } from "./ai/fallback";
import { relatedEpisodesOf } from "./episodeAI";
import { inChinese } from "./lang";
import { checkupBackground } from "./checkup";
import { METRICS, buildAnnualFacts, formatValue, latestOf } from "./metrics";
import { fmtDate, nowISO, toRelatedContext } from "./utils";

/*
 * What gets handed to the doctor. A version built by plain rules is available at once; the
 * model then writes a better one in the background and it replaces the first when ready.
 */

export const summaryBusy = createBusy();
const YEAR = "year";

const time = (iso: string | undefined | null) => (iso ? new Date(iso).getTime() : 0);

/** The stored summary no longer matches the record (new entries since), or there is none. */
export function summaryIsStale(e: Episode): boolean {
  const s = e.summary;
  if (!s || !Array.isArray(s.glance)) return true;
  return time(e.updatedAt) > time(s.generatedAt);
}

/**
 * Recent readings of someone who tracks them: a doctor seeing a dizzy patient with high blood
 * pressure wants the latest pressure on the first screen, not three taps away.
 */
export function vitalsLines(state: AppState, now: number = Date.now()): string[] {
  if (!state.settings.longTerm) return [];
  const lines: string[] = [];
  for (const type of ["bp", "fbg"] as const) {
    const last = latestOf(state.measurements, type);
    if (last && now - time(last.at) <= 14 * 86_400_000) {
      lines.push(`最近${METRICS[type].label} ${formatValue(last)}（${fmtDate(last.at)}）`);
    }
  }
  return lines.slice(0, 2);
}

export function instantSummary(e: Episode, state: AppState): DoctorSummaryBody | null {
  const profile = state.profile;
  if (!profile) return null;
  // in the language the server will answer in, so the first screen does not change when it does
  return inChinese(
    () =>
      fallbackSummary({
        profile,
        episode: e,
        related: relatedEpisodesOf(e, state.episodes).map(toRelatedContext),
        vitals: vitalsLines(state),
        background: checkupBackground(state),
      }).summary,
  );
}

export async function refreshSummary(episodeId: string): Promise<void> {
  const state = getState();
  const episode = state.episodes.find((e) => e.id === episodeId);
  if (!state.profile || !episode || summaryBusy.has(episodeId)) return;
  summaryBusy.start(episodeId);
  try {
    const startedFrom = episode.updatedAt;
    const res = await generateSummary({
      profile: state.profile,
      episode,
      ...inChinese(() => ({
        related: relatedEpisodesOf(episode, state.episodes).map(toRelatedContext),
        vitals: vitalsLines(state),
        background: checkupBackground(state),
      })),
    });
    // stamp it with the moment the request was built, so anything recorded meanwhile makes it stale again
    const generatedAt = new Date(Math.max(time(startedFrom), Date.now() - 1)).toISOString();
    const current = getState().episodes.find((e) => e.id === episodeId);
    storeActions.setSummary(episodeId, {
      ...res.summary,
      generatedAt: current && time(current.updatedAt) > time(startedFrom) ? startedFrom : generatedAt,
      mode: res.mode,
    });
  } finally {
    summaryBusy.stop(episodeId);
  }
}

/* ---------- the year ---------- */

/** The newest thing in the record that a yearly summary would have to include. */
function dataStamp(state: AppState): number {
  let t = 0;
  for (const m of state.measurements) t = Math.max(t, time(m.at));
  for (const f of state.followUps) t = Math.max(t, time(f.recordedAt));
  for (const e of state.episodes) t = Math.max(t, time(e.updatedAt));
  return t;
}

export function annualIsStale(state: AppState): boolean {
  const s = state.annualSummary;
  if (!s || !Array.isArray(s.glance)) return true;
  return dataStamp(state) > time(s.generatedAt);
}

export function annualFacts(state: AppState) {
  return inChinese(() => buildAnnualFacts(state));
}

export function instantAnnual(state: AppState): AnnualSummaryBody | null {
  const profile = state.profile;
  if (!profile) return null;
  return inChinese(() => fallbackAnnual({ profile, facts: annualFacts(state) }).summary);
}

export function useAnnualBusy(): boolean {
  return summaryBusy.use(YEAR);
}

export async function refreshAnnual(): Promise<void> {
  const state = getState();
  if (!state.profile || summaryBusy.has(YEAR)) return;
  summaryBusy.start(YEAR);
  try {
    const facts = annualFacts(state);
    const stamp = dataStamp(state);
    const res = await generateAnnual({ profile: state.profile, facts });
    storeActions.setAnnualSummary({
      ...res.summary,
      generatedAt: dataStamp(getState()) > stamp ? new Date(stamp).toISOString() : nowISO(),
      mode: res.mode,
      periodStart: facts.periodStart,
      periodEnd: facts.periodEnd,
    });
  } finally {
    summaryBusy.stop(YEAR);
  }
}
