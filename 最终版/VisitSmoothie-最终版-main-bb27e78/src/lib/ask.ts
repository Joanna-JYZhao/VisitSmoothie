"use client";

import { useSyncExternalStore } from "react";
import type { AppState, AskRecord, AskRequest, AskTurn, Entry, Episode, Hint, Measurement } from "./types";
import { getState, storeActions } from "./store";
import { inChinese } from "./lang";
import { askQuestion } from "./ai/client";
import { askAlert, medicinesOnFile, quickAnswer, zhDate } from "./ai/askRules";
import { GLUCOSE_LOW, METRICS, METRIC_ORDER, formatValue, isOutOfRange, measurementsOf } from "./metrics";
import { DAY, NO_DIAGNOSIS, calendarDays, nowISO, sortedEntries } from "./utils";

/*
 * 问医伴: questions about one's own health, answered from what is on file. Everything on file is
 * turned into numbered records here; an answer cites the numbers it used, and the page shows
 * them as chips that open the record, so every claim can be checked.
 */

/* ---------- the question being answered right now ---------- */

export interface PendingAsk {
  question: string;
  /** raised by rule the moment the question is sent, so a warning never waits for an answer */
  hint: Hint | null;
}

// Kept outside React: a question asked on this page is still shown as "in progress" after leaving and coming back.
let pending: PendingAsk | null = null;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
function setPending(next: PendingAsk | null) {
  pending = next;
  listeners.forEach((l) => l());
}

/** The question that is waiting for its answer, if there is one. */
export function usePendingAsk(): PendingAsk | null {
  return useSyncExternalStore(
    subscribe,
    () => pending,
    () => null,
  );
}

/* ---------- everything on file, as records ---------- */

const noon = (date: string) => `${date}T12:00:00`;
const whole = (iso: string) => (iso.length <= 10 ? noon(iso) : iso);
const ymd = (iso: string) => zhDate(whole(iso), { year: true });
const md = (iso: string) => zhDate(whole(iso));
const join = (parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join("；");
const bracket = (s: string) => (s ? `（${s}）` : "");

/**
 * How long ago something was, the way a person would say it. Worked out here so that neither a
 * model nor a server in another time zone has to do the arithmetic.
 */
export function agoText(iso: string, now: number = Date.now()): string {
  const d = calendarDays(whole(iso), now);
  if (d < 0) return "";
  if (d === 0) return "今天";
  if (d === 1) return "昨天";
  if (d === 2) return "前天";
  if (d < 14) return `${d} 天前`;
  const rough = d < 60 ? `约 ${Math.round(d / 7)} 周前` : d < 345 ? `约 ${Math.round(d / 30)} 个月前` : d < 400 ? "约 1 年前" : d < 700 ? "1 年多前" : `约 ${Math.round(d / 365)} 年前`;
  // "上个月" and "去年" go by the calendar, which a count of weeks does not show
  const then = new Date(whole(iso));
  const today = new Date(now);
  const months = (today.getFullYear() - then.getFullYear()) * 12 + today.getMonth() - then.getMonth();
  const word = months === 1 ? "上个月" : today.getFullYear() - then.getFullYear() === 1 ? "去年" : "";
  return word ? `${word}，${rough}` : rough;
}

/** A long complaint keeps its first two entries and its latest ten; what is left out is said so. */
const MAX_ENTRIES = 12;

function episodeRecord(e: Episode, now: number): Omit<AskRecord, "id"> {
  const entries = sortedEntries(e);
  const long = entries.length > MAX_ENTRIES;
  const head = long ? entries.slice(0, 2) : entries;
  const tail = long ? entries.slice(2 - MAX_ENTRIES) : [];
  const skipped = entries.length - head.length - tail.length;
  // "最高烧到多少度" is answered from the readings the user gave, not from whichever entries fit
  const hottest = entries.filter((x) => x.temp != null).sort((a, b) => (b.temp ?? 0) - (a.temp ?? 0))[0];
  const onsetKnown = e.startedAt !== e.createdAt;
  const ago = agoText(e.startedAt, now);
  const line = (x: Entry) => `${md(x.at)}${x === entries[0] ? "第一次记" : ""}：${x.note}`;
  return {
    kind: "episode",
    label: `${md(e.startedAt)}「${e.title}」`,
    href: `/episodes/${e.id}/detail`,
    date: e.startedAt,
    fields: { reason: e.title, ago },
    text: join([
      `${ymd(e.startedAt)}${bracket(ago)}${onsetKnown ? "前后开始" : "第一次记录"}的「${e.title}」，${e.status === "active" ? "还在跟踪" : `已经好了${e.resolvedAt ? bracket(ymd(e.resolvedAt)) : ""}`}`,
      ...head.map(line),
      skipped > 0 && `（中间还有 ${skipped} 条记录没有列在这里）`,
      ...tail.map(line),
      hottest && `记下的最高体温是 ${hottest.temp}℃（${md(hottest.at)}）`,
      !e.visit && "这次没有看医生的记录",
    ]),
  };
}

/** One line for each metric: the latest reading, how it sits in the general range, and where it started. */
function metricLines(measurements: Measurement[], now: number): string[] {
  const out: string[] = [];
  const shown = (m: Measurement) => `${formatValue(m)}${m.type === "hba1c" ? "%" : m.type === "weight" ? " 公斤" : ""}`;
  for (const type of METRIC_ORDER) {
    const all = measurementsOf(measurements, type);
    if (!all.length) continue;
    const def = METRICS[type];
    const first = all[0];
    const last = all[all.length - 1];
    const range = isOutOfRange(last);
    const parts = [`最近一次 ${shown(last)}（${md(last.at)}）${def.target ? (range === "high" ? "，比一般范围高" : range === "low" ? "，比一般范围低" : "，在一般范围内") : ""}`];
    if (type === "fbg") {
      const recent = all.filter((m) => now - new Date(m.at).getTime() <= 14 * DAY);
      if (recent.length >= 3) {
        const values = recent.map((m) => m.value);
        const high = values.filter((v) => v > (def.target?.high ?? Infinity)).length;
        const low = values.filter((v) => v < GLUCOSE_LOW).length;
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        parts.push(`最近两周记了 ${values.length} 次、平均 ${mean.toFixed(1)}${low ? `、有 ${low} 次偏低` : ""}${high ? `、有 ${high} 次比一般范围高` : ""}${!low && !high ? "、都在一般范围内" : ""}`);
      }
    }
    if (all.length >= 2) {
      // a handful of check-ups are all worth listing; a year of daily readings is not
      if (type === "hba1c" && all.length <= 6) parts.push(`之前是 ${all.slice(0, -1).map((m) => `${shown(m)}（${md(m.at)}）`).join("、")}`);
      else if (type !== "ppg") parts.push(`最早一次 ${shown(first)}（${md(first.at)}）`);
      if (type === "weight" && Math.abs(last.value - first.value) >= 0.1) {
        parts.push(`比最早一次${last.value < first.value ? "少" : "多"}了 ${Math.abs(last.value - first.value).toFixed(1)} 公斤`);
      }
    }
    if (def.targetText) parts.push(def.targetText);
    out.push(`${def.label}：${parts.join("，")}`);
  }
  const lows = measurements
    .filter((m) => (m.type === "fbg" || m.type === "ppg") && m.value < GLUCOSE_LOW && now - new Date(m.at).getTime() <= 180 * DAY)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    .slice(-3);
  if (lows.length) out.push(`低血糖记录：${lows.map((m) => `${md(m.at)} ${m.value.toFixed(1)}`).join("、")}`);
  if (out.length) out.push("这些范围是一般标准，你自己的目标以医生说的为准");
  return out;
}

/** "今天（10月3日 周六）": when an appointment is, counted in calendar days from today. */
function dueText(at: string, now: number): { when: string; past: boolean } {
  const days = calendarDays(now, at);
  const date = zhDate(at, { year: new Date(at).getFullYear() !== new Date(now).getFullYear(), weekday: true });
  if (days < 0) return { when: `原定 ${date}`, past: true };
  const word = days === 0 ? "今天" : days === 1 ? "明天" : days === 2 ? "后天" : `${days} 天后`;
  return { when: `${word}（${date}）`, past: false };
}

/**
 * Everything on file, newest first, as records an answer can cite. Written in Chinese whatever
 * the interface shows: the answers are Chinese for now, and the rules read these lines back.
 */
export function askRecords(state: AppState, now: number = Date.now()): AskRecord[] {
  return inChinese(() => recordsOf(state, now));
}

function recordsOf(state: AppState, now: number): AskRecord[] {
  const dated: Omit<AskRecord, "id">[] = [];

  for (const e of state.episodes) {
    const v = e.visit;
    if (!v) continue;
    const where = [v.hospital, v.department].filter(Boolean).join(" ");
    const ago = agoText(v.date, now);
    dated.push({
      kind: "visit",
      label: `${md(v.date)} 看医生（${e.title}）`,
      href: `/episodes/${e.id}/detail`,
      date: noon(v.date),
      fields: {
        reason: `因为「${e.title}」`,
        where,
        diagnosis: v.diagnosis,
        treatment: v.treatment,
        advice: v.advice,
        followUp: v.followUp ?? undefined,
        findings: v.findings?.length ? v.findings.join("；") : undefined,
        ago,
      },
      text: join([
        `${ymd(v.date)}${bracket(ago)}因为「${e.title}」看医生${bracket(where)}`,
        v.diagnosis !== NO_DIAGNOSIS && `诊断：${v.diagnosis}`,
        v.findings?.length ? `检查结果：${v.findings.join("、")}` : "",
        `开的药和处理：${v.treatment}`,
        v.advice && `医生叮嘱：${v.advice}`,
        v.followUp && `复查：${v.followUp}`,
        v.followUpAt && `复查提醒定在 ${ymd(v.followUpAt)}`,
        // a prescription belongs to the complaint it was written for: say whether that one is over
        `这次的不舒服${e.status === "active" ? "还没好，还在跟踪" : `后来好了${e.resolvedAt ? bracket(ymd(e.resolvedAt)) : ""}`}`,
        v.archiveSummary && `当时存档的摘要：${v.archiveSummary}`,
      ]),
    });
  }

  for (const f of state.followUps) {
    const where = [f.hospital, f.department].filter(Boolean).join(" ");
    const ago = agoText(f.date, now);
    dated.push({
      kind: "followup",
      label: `${md(f.date)} ${f.reason}`,
      href: `/me#followup-${f.id}`,
      date: noon(f.date),
      fields: { reason: f.reason, where, treatment: f.plan, advice: f.advice, findings: f.findings, ago },
      text: join([
        `${ymd(f.date)}${bracket(ago)}${f.reason}${bracket(where)}`,
        `检查结果：${f.findings}`,
        `开的药和处理：${f.plan}`,
        f.advice && `医生叮嘱：${f.advice}`,
        f.summary && `当时存档的摘要：${f.summary}`,
      ]),
    });
  }

  for (const c of state.checkups) {
    const ago = agoText(c.date, now);
    dated.push({
      kind: "checkup",
      label: `${md(c.date)} 体检`,
      href: `/me#checkup-${c.id}`,
      date: noon(c.date),
      fields: { where: c.institution, findings: c.abnormal.length ? c.abnormal.join("、") : undefined, advice: c.advice, ago },
      text: join([
        `${ymd(c.date)}${bracket(ago)}体检${bracket(c.institution ?? "")}`,
        c.abnormal.length ? `报告上要留意的：${c.abnormal.join("、")}` : "报告上没有标出异常",
        c.advice && `体检建议：${c.advice}`,
      ]),
    });
  }

  // the most recent complaints, each as one record
  const stamp = (iso: string) => new Date(iso).getTime();
  const episodes = [...state.episodes].sort((a, b) => stamp(b.startedAt) - stamp(a.startedAt)).slice(0, 10);
  for (const e of episodes) dated.push(episodeRecord(e, now));

  // by the moment itself: a visit's date is local noon, a complaint's start is a UTC timestamp
  dated.sort((a, b) => stamp(b.date) - stamp(a.date));
  const out: AskRecord[] = dated.slice(0, 30).map((r, i) => ({ id: `R${i + 1}`, ...r }));

  const p = state.profile;
  if (p) {
    out.push({
      id: "P",
      kind: "profile",
      label: "我的档案",
      href: "/me",
      date: "",
      text: join([
        "档案",
        `老毛病：${p.conditions.length ? p.conditions.join("、") : "没有写"}`,
        `过敏：${p.allergies.length ? p.allergies.join("、") : "没有写"}`,
        `长期在吃的药：${p.medications.length ? p.medications.join("、") : "没有写"}`,
        p.surgeries.length ? `做过的手术：${p.surgeries.join("、")}` : "",
        p.familyHistory.length ? `家里人的病：${p.familyHistory.join("、")}` : "",
        p.notes ? `还想让医生知道的：${p.notes}` : "",
        p.emergencyContact ? `紧急联系人：${[p.emergencyContact.relation, p.emergencyContact.name, p.emergencyContact.phone].filter(Boolean).join(" ")}` : "",
      ]),
    });
  }

  const metrics = metricLines(state.measurements, now);
  if (metrics.length) {
    out.push({ id: "M", kind: "metrics", label: "健康指标", href: "/me/metrics", date: "", text: join(metrics) });
  }

  const upcoming: string[] = [];
  if (state.nextVisit) {
    const due = dueText(state.nextVisit.at, now);
    upcoming.push(due.past ? `${due.when}去看医生：${state.nextVisit.note}（日子已经过了）` : `${due.when}要去看医生：${state.nextVisit.note}`);
  }
  for (const e of state.episodes) {
    const at = e.visit?.followUpAt;
    // once the complaint is over its reminder moves to nextVisit (see setStatus); do not say it twice
    if (!at || at === state.nextVisit?.at || stamp(at) <= now - DAY) continue;
    upcoming.push(`${dueText(at, now).when}前后复查「${e.title}」${e.visit?.followUp ? `：${e.visit.followUp}` : ""}`);
  }
  if (upcoming.length) {
    out.push({ id: "N", kind: "reminder", label: "复查提醒", href: "/", date: "", text: `记下的下一次：${upcoming.join("；")}` });
  }
  return out;
}

export function askRequestFor(state: AppState, question: string, now: number = Date.now()): AskRequest | null {
  if (!state.profile) return null;
  return {
    profile: state.profile,
    question: question.trim(),
    history: state.asks.slice(-3).map((t) => ({ question: t.question, answer: t.answer })),
    records: askRecords(state, now),
    localTime: zhDate(new Date(now), { year: true, weekday: true, time: true }),
  };
}

/**
 * A few questions worth asking, picked from what is actually on file and not asked yet.
 * With nothing on file there is nothing to suggest: the page explains what to do instead.
 */
export function suggestedQuestions(state: AppState, now: number = Date.now()): string[] {
  const req = askRequestFor(state, "", now);
  if (!req) return [];
  const p = req.profile;
  const out: string[] = [];
  if (req.records.some((r) => r.kind === "visit" || r.kind === "followup")) out.push("上次医生说了什么？");
  const med = medicinesOnFile(req)[0];
  if (med) out.push(`${med.name}怎么吃？`);
  if (req.records.some((r) => r.kind === "reminder" || r.fields?.followUp)) out.push("什么时候去复查？");
  if (state.settings.longTerm && state.measurements.length) {
    out.push(state.settings.trackedMetrics.includes("fbg") ? "最近血糖控制得怎么样？" : "最近血压怎么样？");
  }
  if (p.allergies.length) out.push("我对什么过敏？");
  if (state.checkups.length) out.push("体检有哪些要留意的？");
  // an earlier complaint with a short name: "上次胃痛是什么时候？"
  const past = [...state.episodes]
    .filter((e) => e.status === "resolved" && e.title.length <= 5)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
  if (past) out.push(`上次${past.title}是什么时候？`);
  if (p.conditions.length || p.medications.length) out.push("我有哪些老毛病和在吃的药？");
  const asked = new Set(state.asks.map((t) => t.question));
  return out.filter((q) => !asked.has(q)).slice(0, 4);
}

/** Asks one question and files the answer. Questions that only look something up are answered on the spot, by rule. */
export async function ask(question: string): Promise<AskTurn | null> {
  const state = getState();
  const req = askRequestFor(state, question);
  if (!req || !req.question || pending) return null;
  const byId = new Map(req.records.map((r) => [r.id, r]));
  // the danger check does not depend on the server: what the rules see here always shows
  const hint = askAlert(req.question);
  const file = (answer: string, sources: string[], mode: AskTurn["mode"], serverHint: Hint | null = null) =>
    storeActions.addAsk({
      at: nowISO(),
      question: req.question,
      answer,
      sources: [...new Set(sources)]
        .map((id) => byId.get(id))
        .filter((r): r is AskRecord => r != null)
        .map((r) => ({ label: r.label, href: r.href, text: r.text })),
      hint: hint ?? serverHint,
      mode,
    });

  const quick = quickAnswer(req);
  if (quick) return file(quick.answer, quick.sources, "fallback");

  setPending({ question: req.question, hint });
  try {
    const res = await askQuestion(req);
    return file(res.answer, res.sources, res.mode, res.hint);
  } finally {
    setPending(null);
  }
}
