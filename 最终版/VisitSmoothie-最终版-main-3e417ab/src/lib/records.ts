import type { AfterResult, AppState, Episode, FollowUp, LearnedItem, NextVisitPlan, PlanItem, Todo } from "./types";
import { L } from "./lang";
import { DAY, fmtDate, uid } from "./utils";

/*
 * Records as the Record page lists them: a pre record (an episode, with or without the visit filed
 * into it) or a visit filed on its own (post only). A record can follow up an earlier one (复诊).
 * Also: the saved Clinical Plan with each line's status, the next visit, and the earlier record as
 * context for the assistant.
 */

export interface RecordRef {
  id: string;
  kind: "episode" | "visit";
  /** what is shown: the main complaint in a phrase, with 复诊 · in front when it follows up an earlier record */
  title: string;
  /** the main complaint alone, without 复诊 · */
  base: string;
  /** when it happened: the start of the complaint, or the day of the visit */
  at: string;
  /** a visit (post) is filed in it */
  hasVisit: boolean;
  followUpOf: string | null;
}

const visitTitle = (f: FollowUp) => f.reason.replace(/^复诊（(.+)）$/, "$1").replace(/^Follow-up \((.+)\)$/, "$1");

/**
 * Every record, newest first. The title is the main complaint in a phrase (the pre record's title; a
 * visit filed on its own has no description, so a follow-up of that kind takes the complaint of the
 * record it follows up, and otherwise the diagnosis), with 复诊 · in front for a follow-up.
 */
export function allRecords(state: Pick<AppState, "episodes" | "followUps">): RecordRef[] {
  const refs = [
    ...state.episodes.map((e) => ({ id: e.id, kind: "episode" as const, title: e.title, base: e.title, own: true, at: e.startedAt, hasVisit: Boolean(e.visit), followUpOf: e.followUpOf ?? null })),
    ...state.followUps.map((f) => ({ id: f.id, kind: "visit" as const, title: visitTitle(f), base: visitTitle(f), own: false, at: `${f.date}T12:00:00`, hasVisit: true, followUpOf: f.followUpOf ?? null })),
  ];
  const byId = new Map(refs.map((r) => [r.id, r]));
  // the complaint a visit on its own follows up, looked up along the chain (never round in a circle)
  const complaint = (r: (typeof refs)[number], seen = new Set<string>()): string => {
    if (r.own || !r.followUpOf || seen.has(r.id)) return r.base;
    seen.add(r.id);
    const of = byId.get(r.followUpOf);
    return of ? complaint(of, seen) : r.base;
  };
  return refs
    .map((r): RecordRef => {
      const base = complaint(r);
      return { id: r.id, kind: r.kind, base, title: r.followUpOf ? L(`复诊 · ${base}`, `Follow-up · ${base}`) : base, at: r.at, hasVisit: r.hasVisit, followUpOf: r.followUpOf };
    })
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

/** The records this one follows up, nearest first: 上一次, 上上次 (at most `n`). */
export function followUpChain(state: Pick<AppState, "episodes" | "followUps">, id: string, n = 2): RecordRef[] {
  const all = allRecords(state);
  const out: RecordRef[] = [];
  let cur = all.find((r) => r.id === id);
  while (cur?.followUpOf && out.length < n) {
    const of = all.find((r) => r.id === cur!.followUpOf);
    if (!of || of.id === id || out.some((r) => r.id === of.id)) break;
    out.push(of);
    cur = of;
  }
  return out;
}

/**
 * The patient's description as kept in the record: what is already in the profile is left out — the
 * age at the start ("我46岁，") and the bracket of unrelated history, regular medicines and allergies
 * at the end ("（补充：…）" / "(Also: …)").
 */
export function recordNarrative(narrative: string): string {
  let t = narrative.trim().replace(/^[“"]|[”"]$/g, "");
  t = t.replace(/[（(](补充|Also)[:：][^（）()]*[）)]\s*/g, "");
  t = t.replace(/^我\s*\d+\s*岁[，,、]\s*/, "");
  t = t.replace(/^I(?:'m| am)\s+\d+(?:\s+years?\s+old)?[,.]\s*(\w)/, (_m, c: string) => c.toUpperCase());
  return t.trim();
}

export function recordById(state: Pick<AppState, "episodes" | "followUps">, id: string | null | undefined): RecordRef | null {
  return id ? (allRecords(state).find((r) => r.id === id) ?? null) : null;
}

/** "左膝内侧酸痛 · 10月1日" */
export const recordLabel = (r: RecordRef) => `${r.title} · ${fmtDate(r.at)}`;

/** Where a record opens. */
export const recordHref = (r: Pick<RecordRef, "id" | "kind">) => (r.kind === "episode" ? `/episodes/${r.id}/detail` : `/report/visit/${r.id}`);

/* ---------- the saved Clinical Plan ---------- */

const CN_NUM: Record<string, number> = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 半: 0.5 };
const num = (s: string) => (/^\d+(\.\d+)?$/.test(s) ? Number(s) : s === "十" ? 10 : s.length === 2 && s[0] === "十" ? 10 + (CN_NUM[s[1]] ?? 0) : (CN_NUM[s] ?? NaN));

/** How many days a course lasts, when the line says ("吃两周", "连用7天", "for 2 weeks"); null otherwise. */
export function courseDays(text: string): number | null {
  // "一日三次" and "每天一次" say how often, not for how long: no 每 before it, no 次 after it
  const zh = text.match(/(?<!每)(\d+|[一两二三四五六七八九十半]{1,2})\s*(天|日|周|星期|个?月)(?![一二两三四五六\d]?\s*次)/);
  if (zh) {
    const n = num(zh[1]);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * (zh[2] === "天" || zh[2] === "日" ? 1 : /周|星期/.test(zh[2]) ? 7 : 30));
  }
  const en = text.match(/\bfor\s+(\d+|one|two|three|four|five|six|seven|ten)\s+(day|week|month)s?\b/i);
  if (en) {
    const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, ten: 10 };
    const n = /^\d+$/.test(en[1]) ? Number(en[1]) : words[en[1].toLowerCase()];
    return n * (/day/i.test(en[2]) ? 1 : /week/i.test(en[2]) ? 7 : 30);
  }
  return null;
}

/**
 * The plan as it is filed: every line of the Clinical Plan, starting on the day of the visit. A line
 * with a course ends when it runs out; the rest run until the next visit (or until ended by hand).
 */
export function planFrom(todos: Todo[], startedAt: string, followUpAt: string | null): PlanItem[] {
  const start = new Date(startedAt).getTime();
  return todos.map((t) => {
    const days = t.kind === "followup" ? null : courseDays(t.text);
    const endsAt = t.kind === "followup" ? (t.at ?? followUpAt) : days != null ? new Date(start + days * DAY).toISOString() : followUpAt;
    return { id: uid(), kind: t.kind, text: t.text, startedAt, endsAt: endsAt ?? null, endedAt: null };
  });
}

/** Whether a line is still going, and the words for it: 正在进行 · 第 3 天 / 已结束 5 天 / 还有 4 天. */
export function planStatus(item: PlanItem, now: number = Date.now()): { ongoing: boolean; label: string } {
  const days = (from: number, to: number) => Math.max(0, Math.floor((to - from) / DAY));
  const ends = item.endedAt ?? (item.endsAt && new Date(item.endsAt).getTime() <= now ? item.endsAt : null);
  if (ends) {
    const d = days(new Date(ends).getTime(), now);
    return { ongoing: false, label: d === 0 ? L("今天结束", "Ended today") : L(`已结束 ${d} 天`, `Ended ${d} day${d === 1 ? "" : "s"} ago`) };
  }
  if (item.kind === "followup" && item.endsAt) {
    const d = Math.max(0, Math.ceil((new Date(item.endsAt).getTime() - now) / DAY));
    return { ongoing: true, label: d === 0 ? L("就在今天", "Today") : L(`还有 ${d} 天（${fmtDate(item.endsAt)}）`, `In ${d} day${d === 1 ? "" : "s"} (${fmtDate(item.endsAt)})`) };
  }
  const d = days(new Date(item.startedAt).getTime(), now) + 1;
  const until = item.endsAt ? L(`，到 ${fmtDate(item.endsAt)}`, `, until ${fmtDate(item.endsAt)}`) : "";
  return { ongoing: true, label: L(`正在进行 · 第 ${d} 天${until}`, `Ongoing · day ${d}${until}`) };
}

const BRING = /携带|带上|带着|带好|要带|带以前|带既往|带药盒|空腹|抽血|化验|复查前|\bbring\b|fasting|blood test/i;

/** The next visit: when, what for, and what to do or bring before it. Null when the orders do not mention one. */
export function nextVisitFrom(result: Pick<AfterResult, "followUpNote" | "advice" | "adviceItems">, todos: Todo[], at: string | null): NextVisitPlan | null {
  const prepare = [
    ...todos.filter((t) => t.kind === "care" && /^(准备|Get ready|Get your)/.test(t.text)).map((t) => t.text),
    ...(result.adviceItems?.length ? result.adviceItems : (result.advice ?? "").split(/[。；;\n]/)).map((x) => x.trim()).filter((x) => x && BRING.test(x)),
  ];
  const unique = prepare.filter((x, i) => prepare.indexOf(x) === i);
  if (!at && !result.followUpNote && !unique.length) return null;
  return { at, note: result.followUpNote ?? L("回医院复诊", "Go back to the hospital"), prepare: unique };
}

/** The plan, next visit and what was learned filed with a record, wherever the visit is kept. */
export function visitPartsOf(state: Pick<AppState, "episodes" | "followUps">, id: string): { plan: PlanItem[]; next: NextVisitPlan | null; learned: LearnedItem[]; date: string | null } | null {
  const e = state.episodes.find((x) => x.id === id);
  if (e) return e.visit ? { plan: e.visit.planItems ?? [], next: e.visit.next ?? null, learned: e.visit.learned ?? [], date: e.visit.date } : null;
  const f = state.followUps.find((x) => x.id === id);
  return f ? { plan: f.planItems ?? [], next: f.next ?? null, learned: f.learned ?? [], date: f.date } : null;
}

/* ---------- the earlier record, for the assistant ---------- */

/**
 * The earlier record a 复诊 follows up, as a short text for the assistant: what it was, what the doctor
 * said, the plan with where each line stands now, the next visit and what to bring, what was asked.
 */
export function previousContext(state: Pick<AppState, "episodes" | "followUps">, id: string | null | undefined, now: number = Date.now()): string | undefined {
  const ref = recordById(state, id);
  if (!ref) return undefined;
  const lines: string[] = [];
  const e: Episode | undefined = state.episodes.find((x) => x.id === ref.id);
  const f: FollowUp | undefined = state.followUps.find((x) => x.id === ref.id);
  lines.push(L(`上一次：${ref.base}（${fmtDate(ref.at, { year: true })}）`, `Last time: ${ref.base} (${fmtDate(ref.at, { year: true })})`));
  if (e?.summary?.narrative) lines.push(L(`当时的描述：${e.summary.narrative}`, `What the patient said then: ${e.summary.narrative}`));
  const visit = e?.visit;
  if (visit) {
    lines.push(L(`医生：${visit.date} 诊断 ${visit.diagnosis}；处理 ${visit.treatment}`, `Doctor: ${visit.date}, diagnosis ${visit.diagnosis}; treatment ${visit.treatment}`));
    if (visit.advice) lines.push(L(`叮嘱：${visit.advice}`, `Advice: ${visit.advice}`));
  }
  if (f) {
    lines.push(L(`医生：${f.date} ${f.reason}；检查 ${f.findings}；处理 ${f.plan}`, `Doctor: ${f.date} ${f.reason}; findings ${f.findings}; treatment ${f.plan}`));
    if (f.advice) lines.push(L(`叮嘱：${f.advice}`, `Advice: ${f.advice}`));
  }
  const parts = visitPartsOf(state, ref.id);
  if (parts?.plan.length) {
    lines.push(L("治疗计划和现在的状态：", "The plan and where each line stands now:"));
    for (const p of parts.plan) lines.push(`- ${p.text}（${planStatus(p, now).label}）`);
  }
  if (parts?.next) {
    lines.push(L(`这次复诊：${parts.next.note}${parts.next.at ? `（${fmtDate(parts.next.at)}）` : ""}`, `This follow-up: ${parts.next.note}${parts.next.at ? ` (${fmtDate(parts.next.at)})` : ""}`));
    if (parts.next.prepare.length) lines.push(L(`要做的、要带的：${parts.next.prepare.join("；")}`, `To do or bring: ${parts.next.prepare.join("; ")}`));
  }
  if (parts?.learned.length) {
    lines.push(L("上次问过、已经讲过的（不要重复讲）：", "Already asked and explained last time (don't repeat):"));
    for (const x of parts.learned) lines.push(`- ${x.about}：${x.text.split(/\n/)[0].slice(0, 80)}`);
  }
  return lines.join("\n");
}
