import type {
  AnnualFacts,
  Episode,
  FollowUp,
  Hint,
  Insight,
  Measurement,
  MetricType,
  Settings,
} from "./types";

/*
 * Health metrics: definitions, alert rules, pattern detection and yearly aggregates.
 * This module deliberately has no runtime imports so it can be unit-tested directly.
 */

export const METRIC_ORDER: MetricType[] = ["fbg", "ppg", "hba1c", "weight", "bp"];

export interface MetricDef {
  type: MetricType;
  label: string;
  unit: string;
  decimals: number;
  inputMin: number;
  inputMax: number;
  step: number;
  /** General reference range. Personal targets are the doctor's call. */
  target?: { low?: number; high?: number };
  targetText?: string;
  placeholder: string;
  /** For delta colouring: is a lower number the good direction? */
  lowerIsBetter: boolean;
}

export const METRICS: Record<MetricType, MetricDef> = {
  fbg: {
    type: "fbg",
    label: "空腹血糖",
    unit: "mmol/L",
    decimals: 1,
    inputMin: 1,
    inputMax: 35,
    step: 0.1,
    target: { low: 4.4, high: 7.0 },
    targetText: "一般在 4.4–7.0 之间",
    placeholder: "例如 6.5",
    lowerIsBetter: true,
  },
  ppg: {
    type: "ppg",
    label: "饭后或其他时间的血糖",
    unit: "mmol/L",
    decimals: 1,
    inputMin: 1,
    inputMax: 35,
    step: 0.1,
    target: { low: 4.4, high: 10.0 },
    targetText: "一般低于 10.0",
    placeholder: "例如 8.2",
    lowerIsBetter: true,
  },
  hba1c: {
    type: "hba1c",
    label: "糖化血红蛋白",
    unit: "%",
    decimals: 1,
    inputMin: 3,
    inputMax: 20,
    step: 0.1,
    target: { high: 7.0 },
    targetText: "一般低于 7.0%",
    placeholder: "例如 6.8",
    lowerIsBetter: true,
  },
  weight: {
    type: "weight",
    label: "体重",
    unit: "kg",
    decimals: 1,
    inputMin: 20,
    inputMax: 250,
    step: 0.1,
    placeholder: "例如 68",
    lowerIsBetter: true,
  },
  bp: {
    type: "bp",
    label: "血压",
    unit: "mmHg",
    decimals: 0,
    inputMin: 50,
    inputMax: 260,
    step: 1,
    target: { high: 140 },
    targetText: "一般低于 140/90，医生可能给你定得更低",
    placeholder: "高压",
    lowerIsBetter: true,
  },
};

export const GLUCOSE_LOW = 3.9;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/* ---------- small local helpers ---------- */

const pad = (n: number) => String(n).padStart(2, "0");
const time = (iso: string) => new Date(iso).getTime();
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export function dayKey(iso: string | Date) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthDay(iso: string | Date) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function formatValue(m: Pick<Measurement, "type" | "value" | "value2">): string {
  const def = METRICS[m.type];
  if (m.type === "bp") return `${Math.round(m.value)}/${m.value2 != null ? Math.round(m.value2) : "–"}`;
  return m.value.toFixed(def.decimals);
}

export function measurementsOf(list: Measurement[], type: MetricType): Measurement[] {
  return list.filter((m) => m.type === type).sort((a, b) => time(a.at) - time(b.at));
}

export function latestOf(list: Measurement[], type: MetricType): Measurement | null {
  const xs = measurementsOf(list, type);
  return xs.length ? xs[xs.length - 1] : null;
}

export function isOutOfRange(m: Pick<Measurement, "type" | "value" | "value2">): "low" | "high" | null {
  const t = METRICS[m.type].target;
  if (!t) return null;
  if (t.low != null && m.value < t.low) return "low";
  // Flagged only when clearly high. A reading like 128/82 is the doctor's call, not ours.
  if (m.type === "bp") return m.value >= 140 || (m.value2 ?? 0) >= 90 ? "high" : null;
  if (t.high != null && m.value > t.high) return "high";
  return null;
}

/**
 * How to colour a change between two readings. A move is only "good" or "bad" when the latest
 * reading is outside the reference range; small moves inside the range stay neutral, and weight
 * is always neutral because losing weight is not good for everyone.
 */
export function deltaTone(
  latest: Pick<Measurement, "type" | "value" | "value2">,
  delta: number,
): "good" | "serious" | "neutral" {
  if (latest.type === "weight" || delta === 0) return "neutral";
  const out = isOutOfRange(latest);
  if (out === "high") return delta < 0 ? "good" : "serious";
  if (out === "low") return delta > 0 ? "good" : "serious";
  return "neutral";
}

/* ---------- alert rules for a single reading (safety-relevant, rule-based) ---------- */

export function evaluateMeasurement(m: Pick<Measurement, "type" | "value" | "value2">): Hint | null {
  if (m.type === "fbg" || m.type === "ppg") {
    if (m.value < GLUCOSE_LOW) {
      return {
        level: "urgent",
        text: `血糖 ${m.value.toFixed(1)} 属于低血糖。请现在吃 15 克左右的糖，比如 3 块糖或半杯果汁，坐下休息，15 分钟后复测。如果出现意识不清或无法进食，请立即拨打 120。`,
      };
    }
    if (m.value >= 16.7) {
      return {
        level: "warn",
        text: `血糖 ${m.value.toFixed(1)} 明显偏高。如果伴有恶心呕吐、腹痛、呼吸深快或意识模糊，请立即就医；没有这些情况也建议尽快联系医生。`,
      };
    }
    if (m.value >= 13.9) {
      return {
        level: "warn",
        text: `血糖 ${m.value.toFixed(1)} 比一般范围高不少。过一会儿再测一次；如果还是这么高，或者有恶心呕吐、肚子痛、特别口渴，请尽快联系医生。`,
      };
    }
    const high = METRICS[m.type].target?.high ?? Infinity;
    if (m.value > high) {
      return { level: "info", text: `${METRICS[m.type].label} ${m.value.toFixed(1)}，比一般范围高一点（${METRICS[m.type].targetText}）。想想最近吃的和用的药有没有变化，下次照常记。` };
    }
    return null;
  }
  if (m.type === "bp") {
    const dia = m.value2 ?? 0;
    if (m.value >= 180 || dia >= 110) {
      return {
        level: "urgent",
        text: `血压 ${formatValue(m)} 很高。请先坐下休息 10 分钟再测一次；如果还有头痛、胸闷、看东西模糊或手脚没力气，请立即就医或拨打 120。`,
      };
    }
    if (m.value >= 140 || dia >= 90) {
      return { level: "info", text: `血压 ${formatValue(m)}，比一般范围高一点。休息几分钟后可以再测一次，连续几天都高请告诉医生。` };
    }
    return null;
  }
  if (m.type === "hba1c" && m.value >= 7.0) {
    return { level: "info", text: `糖化血红蛋白 ${m.value.toFixed(1)}%，一般低于 7.0%。你自己的目标听医生的。` };
  }
  return null;
}

/**
 * A number far from this person's usual readings is more often a slip of the finger than a real
 * change (16.5 for 6.5). Returns a question to ask before saving, or null when nothing looks odd.
 */
export function looksMistyped(
  m: Pick<Measurement, "type" | "value" | "value2">,
  history: Measurement[],
): string | null {
  const same = measurementsOf(history, m.type).slice(-10);
  const shown = formatValue(m);
  if (m.type === "fbg" || m.type === "ppg") {
    const usual = same.length >= 3 ? mean(same.map((x) => x.value)) : null;
    if (usual != null && m.value >= 3.9 && Math.abs(m.value - usual) >= 5) {
      return `你填的是 ${shown}，平时大多在 ${usual.toFixed(1)} 左右。没有填错吧？`;
    }
    if (usual == null && m.value >= 20) return `你填的是 ${shown}，这个数很高。没有填错吧？`;
    return null;
  }
  if (m.type === "bp") {
    if (m.value < 80 || (m.value2 ?? 0) < 40) return `你填的是 ${shown}，这个数很低。没有填错吧？`;
    // 248 for 148 is a far likelier story than a real 248
    if (m.value >= 210 || (m.value2 ?? 0) >= 130) return `你填的是 ${shown}，这个数非常高。没有填错吧？`;
    const usual = same.length >= 1 ? mean(same.map((x) => x.value)) : null;
    if (usual != null && Math.abs(m.value - usual) >= 50) return `你填的是 ${shown}，平时高压大多在 ${Math.round(usual)} 左右。没有填错吧？`;
    return null;
  }
  if (m.type === "weight") {
    const last = same[same.length - 1];
    if (last && Math.abs(m.value - last.value) >= 10) return `你填的是 ${shown} 公斤，上次是 ${formatValue(last)}。没有填错吧？`;
    return null;
  }
  if (m.type === "hba1c") {
    const last = same[same.length - 1];
    if (last && Math.abs(m.value - last.value) >= 4) return `你填的是 ${shown}%，上次是 ${formatValue(last)}%。没有填错吧？`;
  }
  return null;
}

/**
 * Readings whose advice is "measure again shortly": a low glucose (again in 15 minutes) or a very
 * high blood pressure (again after 10 minutes of rest). Returns the one still waiting for its
 * second reading, for as long as it is recent enough to matter.
 */
export function pendingRetest(
  measurements: Measurement[],
  now: number = Date.now(),
): { kind: "glucose" | "bp"; reading: Measurement } | null {
  const latest = (types: MetricType[]) =>
    measurements.filter((m) => types.includes(m.type)).sort((a, b) => time(a.at) - time(b.at)).pop() ?? null;
  const glucose = latest(["fbg", "ppg"]);
  if (glucose && glucose.value < GLUCOSE_LOW && now - time(glucose.at) <= 3 * HOUR) return { kind: "glucose", reading: glucose };
  const bp = latest(["bp"]);
  if (bp && (bp.value >= 180 || (bp.value2 ?? 0) >= 110) && now - time(bp.at) <= 3 * HOUR) return { kind: "bp", reading: bp };
  return null;
}

/**
 * Whether there is enough history for a yearly review: readings spread over two months, or two
 * recorded check-ups. With one or two readings a "year" page has nothing true to say.
 */
export function hasYearOfData(data: { measurements: Measurement[]; followUps: FollowUp[] }): boolean {
  if (data.followUps.length >= 2) return true;
  if (data.measurements.length < 8) return false;
  const times = data.measurements.map((m) => time(m.at));
  return Math.max(...times) - Math.min(...times) >= 60 * DAY;
}

/* ---------- "how am I doing", in one plain sentence ---------- */

export function plainConclusion(measurements: Measurement[], now: number = Date.now()): string {
  const parts: string[] = [];
  const fbgAll = measurementsOf(measurements, "fbg");
  const recent = fbgAll.filter((m) => now - time(m.at) <= 14 * DAY);
  if (recent.length >= 3) {
    const values = recent.map((m) => m.value);
    const high = values.filter((v) => v > (METRICS.fbg.target?.high ?? Infinity)).length;
    const low = values.filter((v) => v < GLUCOSE_LOW).length;
    const head = `最近两周空腹血糖平均 ${mean(values).toFixed(1)}`;
    if (low) parts.push(`${head}，有 ${low} 次偏低，要告诉医生。`);
    else if (high) parts.push(`${head}，${values.length} 次里有 ${high} 次偏高。`);
    else parts.push(`${head}，都在一般范围内。`);
  } else if (fbgAll.length) {
    const last = fbgAll[fbgAll.length - 1];
    parts.push(`最近一次空腹血糖 ${last.value.toFixed(1)}（${monthDay(last.at)}）。`);
  }
  const a1c = measurementsOf(measurements, "hba1c");
  if (a1c.length >= 2) {
    const first = a1c[0].value;
    const last = a1c[a1c.length - 1].value;
    if (last < first) parts.push(`糖化血红蛋白从 ${first.toFixed(1)}% 降到了 ${last.toFixed(1)}%。`);
    else if (last > first) parts.push(`糖化血红蛋白从 ${first.toFixed(1)}% 升到了 ${last.toFixed(1)}%。`);
    else parts.push(`糖化血红蛋白保持在 ${last.toFixed(1)}%。`);
  } else if (a1c.length === 1) {
    parts.push(`糖化血红蛋白 ${a1c[0].value.toFixed(1)}%。`);
  }
  const bp = latestOf(measurements, "bp");
  if (bp && (isOutOfRange(bp) === "high" || !parts.length)) {
    const very = bp.value >= 180 || (bp.value2 ?? 0) >= 110;
    parts.push(`最近一次血压 ${formatValue(bp)}${very ? "，很高" : isOutOfRange(bp) === "high" ? "，偏高" : ""}。`);
  }
  if (!parts.length) {
    const w = latestOf(measurements, "weight");
    if (w) parts.push(`最近一次体重 ${formatValue(w)} 公斤。`);
  }
  return parts.join("");
}

/* ---------- reminders ---------- */

/** Whole calendar days between two moments (0 = the same day). */
function calendarDaysBetween(a: number, b: number): number {
  const x = new Date(a);
  const y = new Date(b);
  return Math.round(
    (new Date(y.getFullYear(), y.getMonth(), y.getDate()).getTime() -
      new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()) /
      DAY,
  );
}

/**
 * Metrics that are due for a new reading right now. This goes by the calendar, not by hours:
 * "every day" means there is no reading yet today, whatever time yesterday's was taken.
 */
export function dueMetrics(measurements: Measurement[], settings: Settings, now: number = Date.now()): MetricType[] {
  if (!settings.metricReminderHours) return [];
  return settings.trackedMetrics.filter((t) => {
    let hours = 0;
    if (t === "fbg" || t === "ppg") hours = settings.metricReminderHours;
    else if (t === "bp" || t === "weight") hours = Math.max(settings.metricReminderHours, 7 * 24);
    if (!hours) return false;
    const last = latestOf(measurements, t);
    return !last || calendarDaysBetween(time(last.at), now) >= Math.ceil(hours / 24);
  });
}

/* ---------- holidays (used to explain glucose streaks) ---------- */

const HOLIDAYS: { name: string; start: string; end: string }[] = [
  { name: "国庆假期", start: "2025-10-01", end: "2025-10-08" },
  { name: "元旦", start: "2026-01-01", end: "2026-01-03" },
  { name: "春节", start: "2026-02-15", end: "2026-02-23" },
  { name: "清明假期", start: "2026-04-04", end: "2026-04-06" },
  { name: "五一假期", start: "2026-05-01", end: "2026-05-05" },
  { name: "端午假期", start: "2026-06-19", end: "2026-06-21" },
  { name: "中秋假期", start: "2026-09-25", end: "2026-09-27" },
  { name: "国庆假期", start: "2026-10-01", end: "2026-10-07" },
  { name: "元旦", start: "2027-01-01", end: "2027-01-03" },
  { name: "春节", start: "2027-02-05", end: "2027-02-12" },
  { name: "五一假期", start: "2027-05-01", end: "2027-05-05" },
  { name: "国庆假期", start: "2027-10-01", end: "2027-10-07" },
];

/** Name of a public holiday overlapping [startKey, endKey] (YYYY-MM-DD), if any. */
export function holidayBetween(startKey: string, endKey: string): string | null {
  const hit = HOLIDAYS.find((h) => h.start <= endKey && h.end >= startKey);
  return hit ? hit.name : null;
}

/* ---------- pattern detection ---------- */

interface DayPoint {
  key: string;
  t: number;
  value: number;
}

function fbgByDay(list: Measurement[]): DayPoint[] {
  const map = new Map<string, number[]>();
  for (const m of measurementsOf(list, "fbg")) {
    const k = dayKey(m.at);
    map.set(k, [...(map.get(k) ?? []), m.value]);
  }
  return [...map.entries()]
    .map(([key, vs]) => ({ key, t: new Date(`${key}T00:00:00`).getTime(), value: mean(vs) }))
    .sort((a, b) => a.t - b.t);
}

export interface HighStreak {
  startKey: string;
  endKey: string;
  days: number;
  max: number;
  after: number | null;
  holiday: string | null;
}

/**
 * Runs of at least `minDays` consecutive days above the fasting reference, where readings
 * before the run were in range. That last condition is what makes it a pattern worth
 * pointing out, rather than the generally high numbers right after diagnosis.
 */
export function findHighStreaks(list: Measurement[], minDays = 3): HighStreak[] {
  const days = fbgByDay(list);
  const high = METRICS.fbg.target?.high ?? 7.0;
  const out: HighStreak[] = [];
  let i = 0;
  while (i < days.length) {
    if (days[i].value <= high) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < days.length && days[j + 1].value > high && days[j + 1].t - days[j].t <= 1.5 * DAY) j++;
    const len = j - i + 1;
    const before = days.slice(Math.max(0, i - 7), i).map((d) => d.value);
    if (len >= minDays && before.length >= 3 && median(before) <= high) {
      const run = days.slice(i, j + 1);
      out.push({
        startKey: days[i].key,
        endKey: days[j].key,
        days: len,
        max: Math.max(...run.map((d) => d.value)),
        after: days[j + 1]?.value ?? null,
        holiday: holidayBetween(days[i].key, days[j].key),
      });
    }
    i = j + 1;
  }
  return out;
}

export function detectInsights(measurements: Measurement[], now: number = Date.now()): Insight[] {
  const list = measurements.filter((m) => now - time(m.at) <= 366 * DAY && time(m.at) <= now + DAY);
  const out: Insight[] = [];
  const recentLevel = (iso: string) => (now - time(iso) <= 30 * DAY ? "warn" : "info");

  // low glucose events
  const lows = list
    .filter((m) => (m.type === "fbg" || m.type === "ppg") && m.value < GLUCOSE_LOW)
    .sort((a, b) => time(b.at) - time(a.at))
    .slice(0, 3);
  for (const m of lows) {
    out.push({
      kind: "low",
      level: recentLevel(m.at),
      title: "低血糖记录",
      at: m.at,
      text: `${monthDay(m.at)} 血糖 ${m.value.toFixed(1)} mmol/L，属于低血糖。${m.note ? `${m.note.replace(/[。.]$/, "")}。` : ""}复诊时请告诉医生。`,
    });
  }

  // runs of high fasting glucose against an in-range baseline
  for (const s of findHighStreaks(list).slice(-2).reverse()) {
    const range = `${monthDay(`${s.startKey}T12:00:00`)}–${monthDay(`${s.endKey}T12:00:00`)}`;
    out.push({
      kind: "streak",
      level: recentLevel(`${s.endKey}T12:00:00`),
      title: s.holiday ? `${s.holiday}后血糖升高` : "空腹血糖连续偏高",
      at: `${s.endKey}T12:00:00`,
      text:
        `${s.holiday ? `${s.holiday}期间（${range}）` : `${range} `}空腹血糖连续 ${s.days} 天高于一般范围，最高 ${s.max.toFixed(1)}。` +
        `${s.holiday ? "节日饮食后血糖容易升高。" : ""}${s.after != null && s.after <= 7.0 ? `之后已回落到 ${s.after.toFixed(1)}。` : ""}`,
    });
  }

  // how the last two weeks look
  const recent = measurementsOf(list, "fbg").filter((m) => now - time(m.at) <= 14 * DAY);
  if (recent.length >= 3) {
    const inRange = recent.filter((m) => isOutOfRange(m) == null).length;
    out.push({
      kind: "recent",
      level: inRange >= recent.length * 0.7 ? "info" : "warn",
      title: "近两周空腹血糖",
      text: `平均 ${mean(recent.map((m) => m.value)).toFixed(1)} mmol/L，${recent.length} 次记录中 ${inRange} 次在一般范围内。`,
    });
  }

  // long-run trends
  const a1c = measurementsOf(list, "hba1c");
  if (a1c.length >= 2) {
    const first = a1c[0];
    const last = a1c[a1c.length - 1];
    out.push({
      kind: "trend",
      level: "info",
      title: "糖化血红蛋白",
      text: `从 ${first.value.toFixed(1)}%（${monthDay(first.at)}）到 ${last.value.toFixed(1)}%（${monthDay(last.at)}），共 ${a1c.length} 次检查。`,
    });
  }
  const weight = measurementsOf(list, "weight");
  if (weight.length >= 2) {
    const delta = weight[weight.length - 1].value - weight[0].value;
    if (Math.abs(delta) >= 2) {
      out.push({
        kind: "trend",
        level: "info",
        title: "体重",
        text: `从 ${weight[0].value.toFixed(1)} kg 到 ${weight[weight.length - 1].value.toFixed(1)} kg，${delta < 0 ? "下降" : "增加"} ${Math.abs(delta).toFixed(1)} kg。`,
      });
    }
  }
  if (a1c.length) {
    const days = Math.floor((now - time(a1c[a1c.length - 1].at)) / DAY);
    if (days > 90) {
      out.push({
        kind: "overdue",
        level: "info",
        title: "糖化血红蛋白该复查了",
        text: `距上次检查已 ${days} 天。复诊时可以问医生是否需要复查。`,
      });
    }
  }
  return out;
}

/* ---------- text for the chat context ---------- */

export function metricsContextText(measurements: Measurement[], now: number = Date.now()): string {
  if (!measurements.length) return "";
  const L: string[] = ["【近期健康指标】"];
  for (const type of METRIC_ORDER) {
    const last = latestOf(measurements, type);
    if (!last) continue;
    const def = METRICS[type];
    L.push(`${def.label}：最近一次 ${formatValue(last)} ${def.unit}（${monthDay(last.at)}）${def.targetText ? `，${def.targetText}` : ""}`);
  }
  const recent = measurementsOf(measurements, "fbg").filter((m) => now - time(m.at) <= 14 * DAY);
  if (recent.length >= 3) {
    L.push(`近两周空腹血糖：${recent.length} 次，平均 ${mean(recent.map((m) => m.value)).toFixed(1)} mmol/L`);
  }
  const lows = measurements.filter(
    (m) => (m.type === "fbg" || m.type === "ppg") && m.value < GLUCOSE_LOW && now - time(m.at) <= 180 * DAY,
  );
  for (const m of lows.slice(-2)) L.push(`低血糖记录：${monthDay(m.at)} ${m.value.toFixed(1)} mmol/L`);
  return L.length > 1 ? L.join("\n") : "";
}

/* ---------- yearly aggregates ---------- */

/**
 * The latest state of a symptom in words. A one-tap answer ("差不多") says nothing on its own,
 * so it is attached to the last entry that actually describes something.
 */
function lastNoteOf(entries: Episode["entries"]): string {
  if (!entries.length) return "";
  const last = entries[entries.length - 1];
  if (last.source !== "checkin" || last.note.length > 6) return last.note;
  const described = [...entries].reverse().find((x) => x.source !== "checkin" || x.note.length > 6);
  return described ? `${described.note}（最近一次回答：${last.note}）` : last.note;
}

export function buildAnnualFacts(
  data: { measurements: Measurement[]; followUps: FollowUp[]; episodes: Episode[] },
  now: number = Date.now(),
): AnnualFacts {
  const end = new Date(now);
  const start = new Date(end.getFullYear(), end.getMonth() - 11, 1, 0, 0, 0, 0);
  const inPeriod = (iso: string) => time(iso) >= start.getTime() && time(iso) <= now + DAY;
  const ms = data.measurements.filter((m) => inPeriod(m.at));

  const fbgMonthly: AnnualFacts["fbgMonthly"] = [];
  for (let k = 0; k < 12; k++) {
    const d = new Date(start.getFullYear(), start.getMonth() + k, 1);
    const month = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    const vs = measurementsOf(ms, "fbg")
      .filter((m) => dayKey(m.at).startsWith(month))
      .map((m) => m.value);
    if (!vs.length) continue;
    fbgMonthly.push({
      month,
      label: `${d.getMonth() + 1}月`,
      count: vs.length,
      avg: Number(mean(vs).toFixed(1)),
      min: Math.min(...vs),
      max: Math.max(...vs),
    });
  }

  const sortedEntries = (e: Episode) => [...e.entries].sort((a, b) => time(a.at) - time(b.at));
  const episodes = data.episodes
    .filter((e) => inPeriod(e.startedAt) || e.status === "active")
    .sort((a, b) => time(a.startedAt) - time(b.startedAt))
    .map((e) => {
      const entries = sortedEntries(e);
      const scored = entries.filter((x) => x.severity != null);
      return {
        title: e.title,
        status: e.status,
        startedAt: e.startedAt,
        resolvedAt: e.resolvedAt ?? null,
        firstNote: entries[0]?.note ?? "",
        lastNote: lastNoteOf(entries),
        peakSeverity: scored.length ? Math.max(...scored.map((x) => x.severity as number)) : null,
        lastSeverity: scored.length ? (scored[scored.length - 1].severity as number) : null,
        hint: e.status === "active" ? (e.lastHint?.text ?? null) : null,
        visit: e.visit
          ? {
              date: e.visit.date,
              department: e.visit.department,
              diagnosis: e.visit.diagnosis,
              treatment: e.visit.treatment,
              advice: e.visit.advice,
            }
          : null,
      };
    });

  return {
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    hba1c: measurementsOf(ms, "hba1c").map((m) => ({ at: m.at, value: m.value })),
    fbgMonthly,
    weight: measurementsOf(ms, "weight").map((m) => ({ at: m.at, value: m.value })),
    bp: measurementsOf(ms, "bp").map((m) => ({ at: m.at, value: m.value, value2: m.value2 ?? 0 })),
    lows: ms
      .filter((m) => (m.type === "fbg" || m.type === "ppg") && m.value < GLUCOSE_LOW)
      .sort((a, b) => time(a.at) - time(b.at))
      .map((m) => ({ at: m.at, value: m.value, note: m.note })),
    insights: detectInsights(data.measurements, now),
    followUps: data.followUps
      .filter((f) => inPeriod(`${f.date}T12:00:00`))
      .sort((a, b) => a.date.localeCompare(b.date)),
    episodes,
  };
}

/** True when there is enough long-running data for a yearly summary to make sense. */
export function hasChronicData(data: { measurements: Measurement[]; followUps: FollowUp[] }) {
  return data.measurements.length > 0 || data.followUps.length > 0;
}
