"use client";

import type { AfterResult, AppState, Reminder, Todo } from "./types";
import { getState, storeActions } from "./store";
import { followUpDate, medicationLine } from "./after";
import { DAY, HOUR, fmtISODate, uid } from "./utils";
import { L, getLang } from "./lang";

/*
 * 医嘱 a: what the doctor's orders ask the patient to do, as a list of to-dos with sensible
 * default reminder times; and the reminders themselves, which the scheduler fires while the app is open.
 * 医嘱 b: the parts of the orders that can be explained, to pick from.
 */

/* ---------- reading the orders into to-dos ---------- */

/** "每日三次" → 3. null when the text does not say. */
export function dosesPerDay(usage: string): number | null {
  const u = usage.toLowerCase();
  if (/(必要|需要|疼|痛|发热|发烧|不适)时|prn|按需/.test(u)) return 0;
  if (/每周|一周|每星期/.test(u)) return -1;
  if (/四次|4\s*次|qid/.test(u)) return 4;
  if (/三次|3\s*次|tid|每\s*8\s*小时|早中晚|三餐/.test(u)) return 3;
  if (/两次|二次|2\s*次|bid|每\s*12\s*小时|早晚/.test(u)) return 2;
  if (/一次|1\s*次|qd|qn|每晚|每早|睡前/.test(u)) return 1;
  return null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const shift = (hhmm: string, minutes: number) => {
  const [h, m] = hhmm.split(":").map(Number);
  const t = h * 60 + m + minutes;
  return `${pad(Math.floor(t / 60) % 24)}:${pad(t % 60)}`;
};

/** Default times to take a medicine, guessed from how it is to be taken. */
export function medicineTimes(usage: string): string[] {
  const n = dosesPerDay(usage) ?? 1;
  const bed = /睡前/.test(usage);
  let base = n >= 4 ? ["08:00", "12:00", "18:00", "21:30"] : n === 3 ? ["08:00", "12:00", "18:00"] : n === 2 ? ["08:00", "20:00"] : ["08:00"];
  const meal = /饭后|餐后/.test(usage) ? 30 : /饭前|餐前/.test(usage) ? -30 : 0;
  if (meal) base = base.map((t) => (t === "21:30" ? t : shift(t, meal)));
  if (bed) {
    if (n <= 1) base = ["21:30"];
    else base[base.length - 1] = "21:30";
  }
  return base;
}

const CAUTION = /避免|不要|不宜|不能|不可|别|忌|禁|勿|少吃|少喝|戒|如果|如有|如出现|若|一旦|及时|立即|马上|注意|观察|监测/;
const CARE = /锻炼|练习|功能训练|运动|冰敷|热敷|敷|护膝|护腰|护具|支具|夹板|石膏|制动|抬高|休息|理疗|康复|拉伸|按摩|泡脚|坐浴|换药|佩戴|戴|散步|走路|多喝水|饮水|漱口|雾化|清洗|消毒|拄拐/;
const STARTS_CONDITION = /^(如果|如有|如|若|一旦|假如|万一)/;

/** The doctor's advice, one instruction per piece: "如出现…，及时就医" stays together. */
export function adviceItems(advice: string | null): string[] {
  if (!advice) return [];
  const out: string[] = [];
  for (const sentence of advice.split(/[。；;\n！!]/)) {
    const clauses = sentence.split(/[，,、]/).map((c) => c.trim()).filter(Boolean);
    let carry = "";
    for (const c of clauses) {
      if (carry) {
        out.push(`${carry}，${c}`);
        carry = "";
      } else if (STARTS_CONDITION.test(c)) carry = c;
      else out.push(c);
    }
    if (carry) out.push(carry);
  }
  return out.filter((x) => x.length >= 2);
}

/** Whether a piece of advice is something to do (care) or something to watch out for (caution). */
export function adviceKind(text: string): "care" | "caution" {
  if (CAUTION.test(text) && !/^(每天|每日|坚持)/.test(text)) return "caution";
  return CARE.test(text) ? "care" : "caution";
}

/** A procedure done on the spot (复位、输液) is not a to-do; one that repeats (每两天换药) is. */
const ONGOING = /每|天|周|次|继续|坚持|定期/;

/** Everything the orders ask the patient to do, with default reminders. */
export function buildTodos(result: AfterResult): Todo[] {
  const todos: Todo[] = [];
  for (const m of result.medications) {
    const n = dosesPerDay(m.usage);
    const times = medicineTimes(m.usage);
    // "疼时吃" and "每周一次" are not daily reminders; the patient can still switch one on
    const regular = n !== 0 && n !== -1;
    todos.push({ id: uid(), kind: "medicine", text: medicationLine(m), remind: regular, frequency: regular ? "each" : "none", times });
  }
  for (const p of result.procedures) {
    if (ONGOING.test(p)) todos.push({ id: uid(), kind: "care", text: p, remind: false, frequency: "daily", times: ["09:00"] });
  }
  for (const a of adviceItems(result.advice)) {
    const kind = adviceKind(a);
    todos.push(
      kind === "care"
        ? { id: uid(), kind, text: a, remind: false, frequency: "daily", times: ["09:00"] }
        : { id: uid(), kind, text: a, remind: false, frequency: "none", times: ["09:00"] },
    );
  }
  const at = followUpDate(result);
  const note = result.followUpNote ?? (at ? "回医院复诊" : null);
  if (at) {
    // "携带既往就诊资料及正在使用的药盒": the evening before, a reminder to get them ready (队友剧本)
    const bring = [result.followUpNote, result.advice, result.summary].filter(Boolean).join(" ");
    if (/携带|带上|带着|带好|要带|带以前|带既往|带药盒/.test(bring)) {
      const eve = new Date(at);
      eve.setDate(eve.getDate() - 1);
      eve.setHours(20, 0, 0, 0);
      const what = /药盒/.test(bring) && /资料|病历/.test(bring) ? "准备病历和药盒" : "准备复诊要带的东西";
      todos.push({ id: uid(), kind: "care", text: what, remind: true, frequency: "once", at: eve.toISOString() });
    }
    todos.push({ id: uid(), kind: "followup", text: `复诊：${note}`, remind: true, frequency: "once", at });
  }
  else if (note) todos.push({ id: uid(), kind: "followup", text: `复诊：${note}`, remind: false, frequency: "none", at: null });
  return todos;
}

/** The parts of the orders that can be explained, as buttons. */
export function explainParts(result: AfterResult): string[] {
  const parts: string[] = [];
  if (result.diagnosis) parts.push(`诊断「${result.diagnosis}」是什么意思`);
  if (result.findings.length) parts.push("检查结果是什么意思");
  for (const m of result.medications) parts.push(`${m.name}是干什么的`);
  if (result.medications.length) parts.push("这些药常见的副作用");
  const advice = adviceItems(result.advice);
  if (advice.some((a) => adviceKind(a) === "caution")) parts.push("注意事项为什么要注意");
  if (advice.some((a) => adviceKind(a) === "care") || result.procedures.some((p) => ONGOING.test(p))) parts.push("其他治疗怎么做");
  if (result.followUpDays || result.followUpNote) parts.push("复诊要准备什么");
  return parts;
}

/* ---------- reminders ---------- */

/** The next time this clock time comes round, from `from`. */
function nextAt(hhmm: string, from: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(from);
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= from) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

/** Stores the to-dos that are to be reminded about. A list set again for the same visit replaces the old one. */
export function setReminders(todos: Todo[], episodeId: string | null, now: number = Date.now()): Reminder[] {
  const chosen = todos.filter((t) => t.remind && t.frequency !== "none");
  const texts = new Set(chosen.map((t) => t.text));
  // one visit, one reminder: a follow-up on a day that already has one replaces it, whichever record set it
  const visitDays = new Set(chosen.filter((t) => t.kind === "followup" && t.at).map((t) => fmtISODate(t.at as string)));
  for (const r of getState().reminders) {
    const sameVisit = r.kind === "followup" && r.at != null && visitDays.has(fmtISODate(r.at));
    if ((r.episodeId === episodeId && texts.has(r.text)) || sameVisit) storeActions.removeReminder(r.id);
  }
  return storeActions.addReminders(
    chosen.map((t) => ({
      todoId: t.id,
      episodeId,
      text: t.text,
      kind: t.kind,
      frequency: t.frequency,
      times: t.frequency === "daily" ? (t.times ?? ["09:00"]).slice(0, 1) : t.times,
      at: t.frequency === "once" ? (t.at ?? nextAt(t.times?.[0] ?? "09:00", now)) : null,
      enabled: true,
      lastFiredAt: null,
    })),
  );
}

/** How long after its time a reminder may still go off (the app was closed at the time). */
const LATE_DAILY = 2 * HOUR;
const LATE_ONCE = 12 * HOUR;

export interface Slot {
  /** when this reminder was due, ms */
  at: number;
  /** a follow-up visit's reminder the day before */
  dayBefore: boolean;
}

/** The time slot a reminder is due for now, or null. A slot it already went off for does not count again. */
export function dueSlot(r: Reminder, now: number): Slot | null {
  if (!r.enabled || r.frequency === "none") return null;
  const fired = r.lastFiredAt ? new Date(r.lastFiredAt).getTime() : -Infinity;
  const created = new Date(r.createdAt).getTime();
  const slots: Slot[] = [];
  if (r.frequency === "once") {
    if (!r.at) return null;
    const at = new Date(r.at).getTime();
    if (r.kind === "followup") slots.push({ at: at - DAY, dayBefore: true });
    slots.push({ at, dayBefore: false });
  } else {
    const times = r.frequency === "daily" ? (r.times ?? []).slice(0, 1) : (r.times ?? []);
    for (const t of times) {
      const [h, m] = t.split(":").map(Number);
      for (const back of [0, 1]) {
        const d = new Date(now);
        d.setDate(d.getDate() - back);
        d.setHours(h, m, 0, 0);
        slots.push({ at: d.getTime(), dayBefore: false });
      }
    }
  }
  const late = r.frequency === "once" ? LATE_ONCE : LATE_DAILY;
  const due = slots.filter((s) => s.at <= now && now - s.at <= late && s.at > fired && s.at >= created - 60_000).sort((a, b) => b.at - a.at);
  return due[0] ?? null;
}

/** The day of a follow-up visit, which is what makes two reminders the same visit. */
const visitDay = (r: Pick<Reminder, "kind" | "at">) => (r.kind === "followup" && r.at ? fmtISODate(r.at) : null);

/**
 * Reminders whose time has come and that have not gone off for this slot yet. Two reminders for
 * the follow-up visit on the same day are one visit: only the first is returned.
 */
export function dueReminders(reminders: Reminder[], now: number): Reminder[] {
  const days = new Set<string>();
  return reminders.filter((r) => {
    if (dueSlot(r, now) == null) return false;
    const day = visitDay(r);
    if (!day) return true;
    if (days.has(day)) return false;
    days.add(day);
    return true;
  });
}

/** What the scheduler does now: which reminders go off, and which ones are marked as gone off (the same visit's twins too). */
export function fireDue(reminders: Reminder[], now: number): { fire: { reminder: Reminder; slot: Slot }[]; mark: string[] } {
  const fire = dueReminders(reminders, now).map((reminder) => ({ reminder, slot: dueSlot(reminder, now) as Slot }));
  const days = new Set(fire.map((f) => visitDay(f.reminder)).filter(Boolean));
  const mark = reminders.filter((r) => fire.some((f) => f.reminder.id === r.id) || (visitDay(r) != null && days.has(visitDay(r)))).map((r) => r.id);
  return { fire, mark };
}

/* ---------- the home page's to-do list ---------- */

export interface HomeTodo {
  /** stable for a day, for the "done today" tick */
  key: string;
  kind: Todo["kind"];
  /** "洛索洛芬钠片" */
  title: string;
  /** "08:30 12:30 18:30 · 饭后" */
  detail: string;
  /** the reminder behind it, if there is one, to switch it on and off */
  reminder: Reminder | null;
}

const MEAL = /饭前|饭后|餐前|餐后|空腹|睡前|随餐|嚼服|含服|外用/g;

/**
 * Everything to do, from the reminders that were set and the follow-up dates on file. A follow-up
 * visit is listed once, however many records carry its date.
 */
export function homeTodos(state: Pick<AppState, "reminders" | "episodes" | "nextVisit">, now: number = Date.now()): HomeTodo[] {
  const out: HomeTodo[] = [];
  const order: Todo["kind"][] = ["medicine", "care", "followup", "caution"];
  const visits = new Set<string>();
  const sorted = [...state.reminders].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  for (const r of sorted) {
    if (r.kind === "followup") {
      const day = visitDay(r);
      if (!day || visits.has(day) || new Date(r.at as string).getTime() < now - DAY) continue;
      visits.add(day);
      out.push({ key: r.id, kind: r.kind, title: whenText(r.at as string), detail: r.text.replace(/^复诊[：:]/, ""), reminder: r });
      continue;
    }
    if (r.kind === "medicine") {
      const { name, usage } = splitLine(r.text);
      const times = r.frequency === "once" && r.at ? [whenText(r.at)] : r.frequency === "daily" ? (r.times ?? []).slice(0, 1) : (r.times ?? []);
      const meal = [...new Set(usage.match(MEAL) ?? [])].join("、");
      out.push({ key: r.id, kind: r.kind, title: name, detail: [times.join(" "), meal].filter(Boolean).join(" · "), reminder: r });
      continue;
    }
    out.push({ key: r.id, kind: r.kind, title: r.text, detail: scheduleText(r), reminder: r });
  }
  // follow-up dates kept with the records, when no reminder covers that day
  const dated = [
    ...state.episodes.filter((e) => e.status === "active" && e.visit?.followUpAt).map((e) => ({ at: e.visit!.followUpAt as string, note: e.visit!.followUp ?? `复查「${e.title}」` })),
    ...(state.nextVisit ? [state.nextVisit] : []),
  ];
  for (const v of dated) {
    const day = fmtISODate(v.at);
    if (visits.has(day) || new Date(v.at).getTime() < now - DAY) continue;
    visits.add(day);
    out.push({ key: `visit-${day}`, kind: "followup", title: whenText(v.at), detail: v.note, reminder: null });
  }
  return out;
}

/** Two or three questions worth asking about what is on the list. */
export function suggestedTodoQuestions(todos: HomeTodo[]): string[] {
  const out: string[] = [];
  const med = todos.find((t) => t.kind === "medicine");
  if (med) out.push(`${med.title}饭前还是饭后吃？`);
  if (todos.some((t) => t.kind === "followup")) out.push("下次复诊要带什么？");
  if (med) out.push(`${med.title}漏吃了一次怎么办？`);
  return out.slice(0, 3);
}

/** "洛索洛芬钠片（每日三次，饭后）" → name and how to take it. */
function splitLine(text: string): { name: string; usage: string } {
  const m = text.match(/^(.*?)（(.*)）$/);
  return m ? { name: m[1], usage: m[2] } : { name: text, usage: "" };
}

/** What the reminder says when it goes off: "该吃洛索洛芬钠片了（午饭后）". */
export function reminderMessage(r: Reminder, slot: Slot): string {
  if (r.kind === "medicine") {
    const { name, usage } = splitLine(r.text);
    const h = new Date(slot.at).getHours();
    const meal = h < 10 ? "早饭" : h < 15 ? "午饭" : "晚饭";
    const when = /睡前/.test(usage) && h >= 21 ? "睡前" : /饭后|餐后/.test(usage) ? `${meal}后` : /饭前|餐前/.test(usage) ? `${meal}前` : usage;
    return `该吃${name}了${when ? `（${when}）` : ""}`;
  }
  if (r.kind === "followup") {
    const note = r.text.replace(/^复诊[：:]/, "");
    return slot.dayBefore ? `明天要去复诊：${note}。记得带上病历和在吃的药。` : `今天要去复诊：${note}。`;
  }
  if (r.kind === "care") return `到时间了：${r.text}`;
  return `记得：${r.text}`;
}

const FREQ: Record<Todo["frequency"], string> = { each: "每次", daily: "每天一次", once: "只提醒一次", none: "不提醒" };
export const frequencyLabel = (f: Todo["frequency"]) => FREQ[f];

/** "10月10日 周六 上午 9:00"; in English "Sat, Oct 10, 9:00 AM" (display only — text the rules write is built in Chinese). */
export function whenText(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  if (getLang() === "en") {
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
    const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()];
    return `${day}, ${month} ${d.getDate()}, ${h % 12 === 0 ? 12 : h % 12}:${pad(d.getMinutes())} ${h < 12 ? "AM" : "PM"}`;
  }
  const wd = "日一二三四五六"[d.getDay()];
  return `${d.getMonth() + 1}月${d.getDate()}日 周${wd} ${h < 12 ? "上午" : "下午"} ${h > 12 ? h - 12 : h}:${pad(d.getMinutes())}`;
}

/** One line saying when a reminder goes off. */
export function scheduleText(r: Pick<Reminder, "kind" | "frequency" | "times" | "at">): string {
  if (r.frequency === "none") return L("不提醒", "No reminder");
  if (r.frequency === "once")
    return r.at ? `${whenText(r.at)}${r.kind === "followup" ? L("，前一天也提醒", ", and the day before") : ""}` : L("只提醒一次", "Once");
  const times = r.frequency === "daily" ? (r.times ?? []).slice(0, 1) : (r.times ?? []);
  return L(`每天 ${times.join("、")}`, `Every day ${times.join(", ")}`);
}

/* ---------- 医嘱 b: explaining one part ---------- */

/** Asks for one part of the orders to be explained, and puts the answer into the conversation. */
export async function explainPart(ordersItemId: string, part: string): Promise<boolean> {
  const state = getState();
  const orders = state.thread.find((x) => x.id === ordersItemId);
  if (orders?.kind !== "orders" || !state.profile) return false;
  storeActions.pushThread({ kind: "user", text: part });
  let answer = "";
  try {
    const res = await fetch("/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: state.profile, result: orders.result, part }),
    });
    if (res.ok) answer = ((await res.json()) as { answer?: string }).answer ?? "";
  } catch (err) {
    console.warn("[医伴] /api/explain 不可用", err);
  }
  if (!answer) {
    storeActions.pushThread({ kind: "ai", text: "这次没解释成，再点一下试试。" });
    return false;
  }
  storeActions.pushThread({ kind: "answer", text: answer, sources: [] });
  return true;
}
