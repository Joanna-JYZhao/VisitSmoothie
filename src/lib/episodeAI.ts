"use client";

import { useMemo } from "react";
import type { ChatKind, ChatMessage, ChatResponse, Episode } from "./types";
import { getState, storeActions, useStore } from "./store";
import { createBusy } from "./busy";
import { askAI } from "./ai/client";
import {
  daysAgoNamed,
  extractOnsetHours,
  extractSeverity,
  extractTemperatures,
  instantAlert,
  statedReadings,
} from "./ai/fallback";
import {
  DAY,
  HOUR,
  detectAreas,
  detectSymptoms,
  extractLocation,
  findSimilarEpisodes,
  fmtDate,
  nowISO,
  titleIsGuess,
  toRelatedContext,
  uid,
} from "./utils";
import { metricsContextText } from "./metrics";
import { previousContext } from "./records";
import { L, inChinese } from "./lang";

/*
 * Talking to the assistant about one tracked symptom. The request lives outside React on purpose:
 * the home screen starts it and the conversation screen shows the answer, so it must survive
 * the page change in between.
 */

const replying = createBusy();

/** True while the assistant is working on a reply for this symptom. */
export function useReplyPending(id: string): boolean {
  return replying.use(id);
}

/** Kinds of symptom that say how it feels, not what the complaint is: on their own they link nothing. */
const GENERIC_KINDS = new Set(["疼痛", "乏力", "发热"]);

/**
 * "以前类似" has to be about the same complaint. What merely came along with it does not count:
 * a headache with nausea is not like the stomach ache on file, although both touch digestion.
 * So the name of this complaint must point at a place or a kind of symptom the other record has.
 */
function sameComplaint(episode: Pick<Episode, "title">, other: Pick<Episode, "title" | "tags">): boolean {
  const areas = detectAreas(episode.title);
  const kinds = detectSymptoms(episode.title).filter((k) => !GENERIC_KINDS.has(k));
  // a name that points nowhere ("不舒服") gives nothing to go by: the score alone decides
  if (!areas.length && !kinds.length) return true;
  if (episode.title.includes(other.title) || other.title.includes(episode.title)) return true;
  const theirs = `${other.title} ${other.tags.join(" ")}`;
  const theirAreas = detectAreas(theirs);
  const theirKinds = detectSymptoms(theirs);
  return areas.some((a) => theirAreas.includes(a)) || kinds.some((k) => theirKinds.includes(k));
}

/** Earlier records that look like this one. "以前类似" must really be earlier: a later relapse is not the past. */
export function relatedEpisodesOf(episode: Episode, all: Episode[]): Episode[] {
  const started = new Date(episode.startedAt).getTime();
  const byId = episode.relatedEpisodeIds
    .map((id) => all.find((e) => e.id === id))
    .filter((e): e is Episode => Boolean(e));
  const similar = findSimilarEpisodes(all, episode, episode.id);
  const seen = new Set<string>();
  const out: Episode[] = [];
  for (const e of [...byId, ...similar]) {
    if (seen.has(e.id) || e.id === episode.id) continue;
    if (new Date(e.startedAt).getTime() >= started) continue;
    if (!sameComplaint(episode, e)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()).slice(0, 3);
}

/** The other complaints being tracked right now, as one line each, for the assistant's context. */
function otherActive(episode: Episode, all: Episode[]): string {
  return all
    .filter((e) => e.status === "active" && e.id !== episode.id)
    .slice(0, 3)
    .map((e) => `- ${e.title}（${fmtDate(e.startedAt)}开始${e.visit ? `，看过医生：${e.visit.diagnosis}` : ""}）`)
    .join("\n");
}

export function useRelatedEpisodes(episode: Episode): Episode[] {
  const { state } = useStore();
  return useMemo(() => relatedEpisodesOf(episode, state.episodes), [state.episodes, episode]);
}

const time = (iso: string) => new Date(iso).getTime();
/** How much of a line added to the record is kept as the note. */
const NOTE_MAX = 400;
/** A line added unasked dates the start only when it says so ("三天前开始的") or is nothing but a time ("上周三"). */
const datesTheStart = (said: string) => /开始|起病|发作|出现|犯了/.test(said) || said.length <= 8;
/** The moment a reading was taken: now, or the middle of the day that was named. */
function readingTime(daysAgo: number | null): string {
  if (!daysAgo) return nowISO();
  const d = new Date(Date.now() - daysAgo * DAY);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

/**
 * Asks the assistant to answer the last thing the user said about this symptom.
 *
 * `silent`: the user is not in a conversation (they described everything in one go for the
 * doctor, or added a line to that page). What the assistant understood is recorded as usual,
 * but it does not speak: no reply is added and no question is left hanging.
 */
export async function requestReply(id: string, kind?: ChatKind, opts: { silent?: boolean } = {}): Promise<ChatResponse | null> {
  const silent = opts.silent === true;
  const state = getState();
  const episode = state.episodes.find((e) => e.id === id);
  if (!state.profile || !episode || replying.has(id)) return null;
  const lastUser = [...episode.messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return null;
  const mode: ChatKind = kind ?? (episode.messages.length === 1 && lastUser.kind === "intake" ? "intake" : "followup");
  const first = mode === "intake";
  const said = lastUser.content.trim();
  // A record started by 去看医生 is marked done from the start. The rules have read the description
  // into it and its page for the doctor is already on screen: whatever the model reads out of the
  // same words, now or when the conversation is opened later, may add to the record but not rewrite it.
  const told = first && (silent || episode.done === true);

  replying.start(id);
  try {
    const res = await askAI({
      kind: mode,
      profile: state.profile,
      episode: {
        title: episode.title,
        tags: episode.tags,
        status: episode.status,
        startedAt: episode.startedAt,
        createdAt: episode.createdAt,
        resolvedAt: episode.resolvedAt,
        entries: episode.entries,
        visit: episode.visit
          ? {
              date: episode.visit.date,
              department: episode.visit.department,
              diagnosis: episode.visit.diagnosis,
              treatment: episode.visit.treatment,
              advice: episode.visit.advice,
            }
          : null,
      },
      messages: episode.messages.slice(-20).map((m) => ({ role: m.role, content: m.content })),
      ...inChinese(() => ({
        related: relatedEpisodesOf(episode, state.episodes).map(toRelatedContext),
        metricsContext: metricsContextText(state.measurements) || undefined,
        localTime: fmtDate(new Date(), { year: true, weekday: true, time: true }),
        others: otherActive(episode, state.episodes) || undefined,
      })),
      // 复诊: the earlier record, so the questions build on it and remind the patient what to say
      previous: previousContext(state, episode.followUpOf),
    });

    const now = nowISO();
    // Readings the user stated in the chat ("测了血糖 3.6") go straight into the metrics log.
    // Those in a description for the doctor were filed when it was given, with the day they were taken.
    const filed = silent || told ? statedReadings(said).map((r) => r.type) : [];
    for (const r of res.measurements ?? []) {
      if (filed.includes(r.type)) continue;
      const duplicate = getState().measurements.some(
        (m) => m.type === r.type && m.value === r.value && Math.abs(new Date(m.at).getTime() - Date.now()) < 30 * 60_000,
      );
      if (!duplicate) {
        storeActions.addMeasurement({ type: r.type, value: r.value, value2: r.value2, at: now, source: "ai", note: L(`对话中提到（${episode.title}）`, `Mentioned in the chat (${episode.title})`) });
      }
    }

    const assistant: ChatMessage = { id: uid(), role: "assistant", content: res.reply, at: now };
    const entry = res.entry;
    // A line added on the doctor's page went onto the record as it was said; it is not noted a second time.
    const noted = episode.entries.some((x) => x.source === "user" && x.note === said.slice(0, NOTE_MAX) && time(x.at) >= time(lastUser.at));
    const addEntry =
      !first && !noted && (silent ? said.length >= 2 : entry != null && (entry.severity != null || entry.temperature != null || Boolean(entry.note)));
    // The danger check does not depend on the model: what the rules see always shows.
    const local = instantAlert(lastUser.content);
    // An alarm the rules raised is already on screen in the rules' words; it is not swapped for another wording.
    // Someone on their way to the doctor needs no "建议今天去看医生": of what the model raises, only an alarm is kept.
    const hint = local ?? (silent ? (res.hint?.level === "urgent" ? res.hint : null) : res.hint);
    // When it began. Words like 昨晚 are worked out here, against this device's clock. Outside the
    // first turn the rules only apply when the assistant had just asked about it, or the line says so.
    const assistantBefore = [...episode.messages].reverse().find((m) => m.role === "assistant")?.content ?? "";
    const askedOnset = /什么时候开始|多久了|哪天开始|开始多久/.test(assistantBefore);
    const ruled = first || askedOnset || (silent && datesTheStart(said)) ? extractOnsetHours(said) : null;
    // In a conversation the model's figure fills in what the rules cannot read. On a record that goes
    // straight to the doctor it does not: asked what "上周三" was, the model answered with the wrong week.
    const onset = ruled ?? (silent || told ? null : res.onsetHoursAgo);
    // The name the rules found is on the doctor's page and stays. The model names the complaint
    // only where the rules could not pick one out of what was said.
    const rename = first && Boolean(res.title) && (!told || (silent && titleIsGuess(said)));

    storeActions.updateEpisode(id, (e) => {
      let entries = e.entries;
      if (first && entry && entries.length) {
        // The first entry holds the user's own words; add what the assistant understood from them.
        entries = entries.map((x, i) =>
          i === 0
            ? {
                ...x,
                // on a page for the doctor "目前比较难受" is only written when the user said so, not when the model judged it
                severity: x.severity ?? (told ? null : entry.severity),
                // what the rules already read from the user's words stands
                exact: x.severity != null ? (x.exact ?? entry.exact) : told ? false : entry.exact,
                // nor is a temperature put beside today's record that the user gave for another day
                temp: x.temp ?? (told ? null : entry.temperature),
                location: x.location ?? entry.location,
              }
            : x,
        );
      } else if (addEntry) {
        entries = [
          ...entries,
          {
            id: uid(),
            at: now,
            severity: entry?.severity ?? null,
            exact: entry?.exact ?? false,
            temp: entry?.temperature ?? null,
            // said unasked, for the doctor: kept in the user's own words
            note: silent ? said.slice(0, NOTE_MAX) : (entry?.note ?? ""),
            location: entry?.location ?? null,
            source: silent ? "user" : "ai",
          },
        ];
      }
      return {
        ...e,
        title: rename && res.title ? res.title : e.title,
        // "When did it start" is taken once: until the user says, a new symptom starts at the moment it was recorded.
        startedAt:
          onset != null && e.startedAt === e.createdAt ? new Date(Date.now() - onset * HOUR).toISOString() : e.startedAt,
        messages: silent ? e.messages : [...e.messages, assistant],
        tags: res.tags.length ? res.tags : e.tags,
        // In a conversation, new information without a new hint means the old advice may no longer
        // fit: drop it. A line added to the doctor's page is not such a turn: an alarm stays up.
        lastHint: hint ?? (silent ? (e.lastHint ?? null) : addEntry ? null : (e.lastHint ?? null)),
        lastHintAt: hint ? now : silent ? (e.lastHintAt ?? null) : addEntry ? null : (e.lastHintAt ?? null),
        suggestedReplies: silent ? [] : res.suggestedReplies,
        done: silent ? true : res.done,
        entries,
        lastCheckInAt: addEntry ? now : e.lastCheckInAt,
        snoozedUntil: addEntry ? null : e.snoozedUntil,
      };
    });
    return res;
  } finally {
    replying.stop(id);
  }
}

/** Adds what the user just said to the conversation and asks for a reply. */
export function sendMessage(id: string, text: string): Promise<ChatResponse | null> {
  const said = text.trim();
  if (!said) return Promise.resolve(null);
  const alert = instantAlert(said);
  const msg: ChatMessage = { id: uid(), role: "user", content: said, at: nowISO(), kind: "followup" };
  storeActions.updateEpisode(id, (e) => ({
    ...e,
    messages: [...e.messages, msg],
    suggestedReplies: [],
    done: false,
    // a danger signal shows at once, before the assistant has answered
    lastHint: alert ?? e.lastHint,
    lastHintAt: alert ? msg.at : e.lastHintAt,
  }));
  return requestReply(id, "followup");
}

/* ---------- 去看医生: say it once, get the page for the doctor ---------- */

/** Resolves once no reply is being worked on for this symptom (or after `maxMs`, whichever is first). */
function whenIdle(id: string, maxMs = 30_000): Promise<void> {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => (replying.has(id) && Date.now() - started < maxMs ? setTimeout(tick, 200) : resolve());
    tick();
  });
}

/**
 * The temperature a description gives for now. One description can hold several ("昨天烧到38.5度",
 * "最高39.2度，今天早上37.5"): what goes beside today's record is the last one not said of an earlier
 * day. The others stay where they are, in the user's words, and still count towards the highest.
 */
function temperatureNow(said: string): number | null {
  const all = extractTemperatures(said);
  let day: number | null = null;
  let temp: number | null = null;
  for (const clause of said.split(/[，,。；;！!？?\n]/)) {
    // the day last named carries on: "昨天晚上开始发烧，最高烧到39.2度" is still about yesterday
    day = daysAgoNamed(clause) ?? day;
    const here = [...extractTemperatures(clause), ...all.filter((t) => clause.includes(String(t)))];
    if (here.length && !day) temp = here[here.length - 1];
  }
  return temp;
}

/** Blood pressure or glucose said along the way is filed with the day it was taken ("昨天量血压是 150/95"). */
function fileReadings(said: string, title: string): void {
  for (const r of statedReadings(said)) {
    storeActions.addMeasurement({ type: r.type, value: r.value, value2: r.value2, at: readingTime(r.daysAgo), source: "ai", note: L(`去看医生时说的（${title}）`, `Said before the visit (${title})`) });
  }
}

/**
 * Starts a record from one spoken or typed description, for someone on their way to the doctor.
 * What plain rules can read (when it began, how bad, a temperature, a reading) is on the record at
 * once, so the page for the doctor is complete the moment it opens and does not change under the
 * reader. The assistant then reads the same words for what the rules cannot (a name where none was
 * found, keywords), without asking anything.
 */
export function startVisit(text: string): Episode {
  const said = text.trim();
  const created = storeActions.createEpisode({ text: said, hint: instantAlert(said) });
  const onset = extractOnsetHours(said);
  const { severity, exact } = extractSeverity(said, null);
  const temp = temperatureNow(said);
  storeActions.updateEpisode(created.id, (e) => ({
    ...e,
    done: true,
    startedAt: onset != null ? new Date(Date.now() - onset * HOUR).toISOString() : e.startedAt,
    entries: e.entries.map((x, i) => (i === 0 ? { ...x, severity, exact, temp, location: extractLocation(said) } : x)),
  }));
  fileReadings(said, created.title);
  void requestReply(created.id, "intake", { silent: true });
  return getState().episodes.find((e) => e.id === created.id) ?? created;
}

/**
 * Adds one more line to a record from the page for the doctor. Nothing is asked back. The line is
 * on the record, and so on the page, at once and in the user's words; the assistant reads it afterwards.
 */
export async function supplement(id: string, text: string): Promise<void> {
  const said = text.trim();
  if (!said) return;
  await whenIdle(id);
  const episode = getState().episodes.find((e) => e.id === id);
  if (!episode) return;
  const alert = instantAlert(said);
  const at = nowISO();
  const msg: ChatMessage = { id: uid(), role: "user", content: said, at, kind: "followup" };
  // relative words ("好多了") are not turned into a score here: nobody asked how it compares
  const { severity, exact } = extractSeverity(said, null);
  const onset = datesTheStart(said) ? extractOnsetHours(said) : null;
  storeActions.updateEpisode(id, (e) => ({
    ...e,
    messages: [...e.messages, msg],
    entries: [
      ...e.entries,
      { id: uid(), at, severity, exact, temp: temperatureNow(said), note: said.slice(0, NOTE_MAX), location: extractLocation(said), source: "user" },
    ],
    startedAt: onset != null && e.startedAt === e.createdAt ? new Date(Date.now() - onset * HOUR).toISOString() : e.startedAt,
    lastHint: alert ?? e.lastHint,
    lastHintAt: alert ? at : e.lastHintAt,
    lastCheckInAt: at,
    snoozedUntil: null,
  }));
  fileReadings(said, episode.title);
  await requestReply(id, "followup", { silent: true });
}
