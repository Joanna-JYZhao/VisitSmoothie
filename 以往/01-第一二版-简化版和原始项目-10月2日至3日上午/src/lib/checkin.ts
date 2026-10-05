import type { AppState, Episode, Hint, Settings } from "./types";
import { calendarDays, hoursBetween, latestSeverityEntry, uid } from "./utils";

const DAY = 24;

/**
 * How often to ask about a symptom. New symptoms are asked at the user's chosen pace (daily by
 * default). One that has dragged on for more than two weeks is asked weekly, so a chronic
 * complaint does not nag every day.
 */
export function checkInIntervalHours(e: Episode, settings: Settings, now: number = Date.now()): number {
  const ageDays = hoursBetween(e.startedAt, now) / DAY;
  return ageDays > 14 ? 7 * DAY : settings.checkInIntervalHours;
}

export function isLongRunning(e: Episode, now: number = Date.now()): boolean {
  return hoursBetween(e.startedAt, now) / DAY > 14;
}

export function isCheckInDue(e: Episode, settings: Settings, now: number = Date.now()): boolean {
  if (e.status !== "active") return false;
  if (e.snoozedUntil && new Date(e.snoozedUntil).getTime() > now) return false;
  return hoursBetween(e.lastCheckInAt, now) >= checkInIntervalHours(e, settings, now);
}

export function dueEpisodes(state: AppState, now: number = Date.now()): Episode[] {
  return state.episodes.filter((e) => isCheckInDue(e, state.settings, now));
}

export function checkInQuestion(e: Episode, now: number = Date.now()): string {
  if (e.visit && !isLongRunning(e, now)) return `看完医生后，「${e.title}」好些了吗？`;
  const when = isLongRunning(e, now) ? "这周" : "今天";
  return `「${e.title}」${when}怎么样了？`;
}

/** The doctor said to come back after a while, that time has passed, and the symptom is still tracked. */
export function recheckDue(e: Episode, now: number = Date.now()): boolean {
  const at = e.visit?.followUpAt;
  return e.status === "active" && Boolean(at) && new Date(at as string).getTime() <= now;
}

/* ---------- the three one-tap answers ---------- */

export type CheckInAnswer = "better" | "same" | "worse";

export const CHECKIN_ANSWERS: { key: CheckInAnswer; label: string }[] = [
  { key: "better", label: "好多了" },
  { key: "same", label: "差不多" },
  { key: "worse", label: "更严重了" },
];

export interface CheckInOutcome {
  answer: CheckInAnswer;
  /** what the assistant says back, shown on the card at once */
  reply: string;
  hint: Hint | null;
  /** it is time to see a doctor: "给医生看" becomes the main button */
  suggestVisit: boolean;
  /** the episode with this answer recorded */
  episode: Episode;
}

/**
 * Records one of the three answers. No model is involved, so the reaction is instant:
 * 好多了 leads to "算是好了吗？", 更严重了 leads to a plain "建议今天去看医生".
 */
export function answerCheckIn(e: Episode, answer: CheckInAnswer, now: number = Date.now()): CheckInOutcome {
  const label = CHECKIN_ANSWERS.find((a) => a.key === answer)?.label ?? "";
  const prev = latestSeverityEntry(e)?.severity ?? null;
  const long = isLongRunning(e, now);
  const next = long ? "下周" : "明天";
  const days = calendarDays(e.startedAt, now);
  const seen = Boolean(e.visit);
  const prepare = "去之前点「给医生看」，我把记录整理好。";

  let severity: number | null = prev;
  let reply = "";
  let hint: Hint | null = null;
  let suggestVisit = false;

  if (answer === "better") {
    severity = prev != null ? Math.max(1, prev - 2) : null;
    reply = "太好了，比上次好。";
  } else if (answer === "worse") {
    severity = prev != null ? Math.min(10, prev + 2) : null;
    suggestVisit = true;
    hint = {
      level: "warn",
      text: seen ? `比上次重了，建议再去看一次医生。${prepare}` : `比上次重了，建议今天去看医生。${prepare}`,
    };
    reply = hint.text;
  } else if (currentHint(e, now)) {
    // There is already specific advice on the card ("洗脚前先试水温…"). Keep it; do not swap it for a generic line.
    hint = e.lastHint ?? null;
    suggestVisit = !seen;
    reply = `记下了，和上次差不多。${next}我再来问你。`;
  } else if (seen) {
    const sinceVisit = calendarDays(e.visit?.recordedAt ?? e.startedAt, now);
    if (sinceVisit >= 3) {
      suggestVisit = true;
      hint = { level: "warn", text: `看完医生 ${sinceVisit} 天了还是差不多，建议再去问问医生。${prepare}` };
      reply = hint.text;
    } else {
      reply = `记下了，和上次差不多。${next}我再来问你。`;
    }
  } else if (long) {
    suggestVisit = true;
    hint = { level: "warn", text: `已经 ${days} 天了还是老样子，建议找医生看一下。${prepare}` };
    reply = hint.text;
  } else if (days >= 3) {
    suggestVisit = true;
    hint = { level: "warn", text: `已经 ${days} 天了还没见好，建议去看医生。${prepare}` };
    reply = hint.text;
  } else {
    reply = `记下了，和上次差不多。${next}我再来问你。`;
  }

  const at = new Date(now).toISOString();
  const episode: Episode = {
    ...e,
    updatedAt: at,
    lastCheckInAt: at,
    snoozedUntil: null,
    lastHint: hint,
    lastHintAt: hint ? (hint === e.lastHint ? (e.lastHintAt ?? at) : at) : null,
    suggestedReplies: [],
    entries: [...e.entries, { id: uid(), at, severity, exact: false, note: label, location: null, source: "checkin" }],
    messages: [
      ...e.messages,
      { id: uid(), role: "user", content: `【定时记录】${label}`, at, kind: "checkin" },
      { id: uid(), role: "assistant", content: reply, at },
    ],
  };
  return { answer, reply, hint, suggestVisit, episode };
}

/** "第 3 天" / "第 4 周": how long this has been going on, the way people say it (by the calendar). */
export function dayLabel(e: Episode, now: number = Date.now()): string {
  const days = calendarDays(e.startedAt, now);
  // Until the user has said when it began, the card only claims when it was written down.
  const told = e.startedAt !== e.createdAt;
  if (days < 1) return told ? "今天开始的" : "今天记的";
  if (days === 1) return told ? "昨天开始的" : "昨天记的";
  if (days <= 14) return told ? `第 ${days + 1} 天` : `记了 ${days + 1} 天`;
  if (days < 60) return `第 ${Math.floor(days / 7) + 1} 周`;
  return `${Math.floor(days / 30)} 个月了`;
}

/**
 * The advice worth showing on the home card right now. A plain note (info) belongs to the
 * conversation it came from. A warning stays for three days and an alarm for half a day:
 * after that it is old news and must not sit above today's question as if it were fresh.
 */
export function currentHint(e: Episode, now: number = Date.now()): Hint | null {
  const hint = e.lastHint;
  if (!hint || hint.level === "info") return null;
  const lastMessage = e.messages[e.messages.length - 1];
  const at = e.lastHintAt ?? lastMessage?.at ?? e.updatedAt;
  const age = hoursBetween(at, now);
  if (hint.level === "urgent") return age <= 12 ? hint : null;
  // "建议今天去看医生" is about the day it was said. The next day it would be yesterday's advice
  // sitting above today's question, so it goes when the date changes.
  if (/今天/.test(hint.text) && new Date(at).toDateString() !== new Date(now).toDateString()) return null;
  // any other warning lasts until about the next time the question is asked: three days, or nine for a weekly one
  return age <= (isLongRunning(e, now) ? 9 * DAY : 3 * DAY) ? hint : null;
}
