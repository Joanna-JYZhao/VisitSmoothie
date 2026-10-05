import type { AppState, ChatMeasurement, CheckupResult, Measurement } from "./types";
import { storeActions } from "./store";
import { METRICS, formatValue } from "./metrics";
import { fmtDate, fmtISODate, nowISO } from "./utils";

/* 体检报告建档: what a check-up report turns into once it has been read and confirmed. */

/** A made-up report that ships with the app, so the flow can be tried without a real one. */
export const SAMPLE_CHECKUP_URL = "/demo/checkup-sample.jpg";

/**
 * What is printed on the sample report. Used when the vision model cannot be reached, so that
 * trying the sample never fails; a real photo has no such stand-in.
 */
export const SAMPLE_CHECKUP: CheckupResult = {
  name: "陈建华",
  gender: "男",
  birthYear: 1968,
  date: "2026-09-20",
  institution: "安和健康体检中心",
  heightCm: 172,
  weightKg: 78.5,
  bloodType: "A",
  conditions: ["高血压（8 年）", "2 型糖尿病（3 年）"],
  allergies: ["青霉素"],
  medications: ["苯磺酸氨氯地平片 5mg 每日一次", "盐酸二甲双胍片 0.5g 每日两次"],
  surgeries: ["胆囊切除术（2012 年）"],
  familyHistory: ["父亲 高血压", "母亲 2 型糖尿病"],
  readings: [
    { type: "bp", value: 148, value2: 92 },
    { type: "fbg", value: 7.8, value2: null },
    { type: "hba1c", value: 7.2, value2: null },
    { type: "weight", value: 78.5, value2: null },
  ],
  abnormal: [
    "血压 148/92 mmHg 偏高",
    "体重指数 26.5 偏高",
    "空腹血糖 7.8 mmol/L 偏高",
    "糖化血红蛋白 7.2% 偏高",
    "总胆固醇 5.9 mmol/L 偏高",
    "甘油三酯 2.3 mmol/L 偏高",
    "低密度脂蛋白胆固醇 3.8 mmol/L 偏高",
    "尿酸 452 μmol/L 偏高",
    "腹部超声：脂肪肝（轻度）",
  ],
  advice:
    "血压偏高：建议心内科随诊，按医嘱服药，每日监测血压。空腹血糖、糖化血红蛋白高于参考范围：建议内分泌科复诊。血脂偏高、轻度脂肪肝：低脂饮食，适量运动，3 至 6 个月后复查。尿酸偏高：少吃动物内脏和海鲜，多饮水，3 个月后复查。",
  unclear: [],
};

/** "血压 148/92" / "糖化血红蛋白 7.2%": a reading the way it is said. */
export function readingText(r: ChatMeasurement): string {
  const def = METRICS[r.type];
  const unit = r.type === "hba1c" ? "%" : r.type === "weight" ? " kg" : "";
  return `${def.label} ${formatValue(r)}${unit}`;
}

/** Files the check-up itself: what the report flagged, and the readings printed on it. */
export function saveCheckup(result: CheckupResult): void {
  const today = fmtISODate(new Date());
  const date = result.date ?? today;
  const at = date === today ? nowISO() : new Date(`${date}T12:00:00`).toISOString();
  const measurements: Omit<Measurement, "id">[] = result.readings.map((r) => ({
    type: r.type,
    value: r.value,
    value2: r.value2,
    at,
    source: "visit",
    note: "体检",
  }));
  storeActions.addCheckup(
    { date, institution: result.institution ?? undefined, abnormal: result.abnormal, advice: result.advice ?? undefined },
    measurements,
  );
}

/**
 * What the latest check-up flagged, for the page handed to the doctor. Only a recent one counts:
 * after about a year the numbers describe someone else.
 */
export function checkupBackground(state: Pick<AppState, "checkups">, now: number = Date.now()): string[] {
  const latest = [...state.checkups].sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!latest || !latest.abnormal.length) return [];
  const at = new Date(`${latest.date}T12:00:00`).getTime();
  if (now - at > 400 * 86_400_000) return [];
  const shown = latest.abnormal.slice(0, 8);
  const more = latest.abnormal.length - shown.length;
  return [`${fmtDate(`${latest.date}T12:00:00`, { year: true })}体检报告标出：${shown.join("、")}${more > 0 ? `等 ${latest.abnormal.length} 项` : ""}`];
}
