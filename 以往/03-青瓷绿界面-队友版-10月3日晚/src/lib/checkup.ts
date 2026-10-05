import type { AppState, ChatMeasurement, CheckupResult, Measurement } from "./types";
import { L } from "./lang";
import { storeActions } from "./store";
import { METRICS, formatValue } from "./metrics";
import { fmtDate, fmtISODate } from "./utils";

/* 体检报告建档: what a check-up report turns into once it has been read and confirmed. */

/** A made-up report that ships with the app, so the flow can be tried without a real one. */
export const SAMPLE_CHECKUP_URL = "/demo/checkup-sample.jpg";

/**
 * What reading the sample report gives, word for word. Used when the vision model cannot be
 * reached, so that trying the sample never fails; a real photo has no such stand-in.
 */
export const SAMPLE_CHECKUP: CheckupResult = {
  name: "陈建华",
  gender: "男",
  birthYear: 1968,
  date: "2026-09-20",
  institution: null,
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
    "体重指数（BMI）26.5 偏高",
    "血压 148/92 mmHg 偏高",
    "空腹血糖 7.8 mmol/L 偏高",
    "糖化血红蛋白 7.2% 偏高",
    "总胆固醇 5.9 mmol/L 偏高",
    "甘油三酯 2.3 mmol/L 偏高",
    "低密度脂蛋白胆固醇 3.8 mmol/L 偏高",
    "尿酸 452 μmol/L 偏高",
    "腹部超声：脂肪肝（轻度）",
  ],
  advice: [
    "血压偏高（148/92 mmHg）：建议心内科随诊，按医嘱服药，每日监测血压。",
    "空腹血糖、糖化血红蛋白高于参考范围：建议内分泌科复诊。",
    "血脂偏高、轻度脂肪肝：低脂饮食，适量运动，3 至 6 个月后复查。",
    "尿酸偏高：少吃动物内脏和海鲜，多饮水，3 个月后复查。",
  ].join("\n"),
  unclear: [],
};

/** "血压 148/92" / "糖化血红蛋白 7.2%": a reading the way it is said. */
export function readingText(r: ChatMeasurement): string {
  const def = METRICS[r.type];
  const unit = r.type === "hba1c" ? "%" : r.type === "weight" ? " kg" : "";
  return `${def.label} ${formatValue(r)}${unit}`;
}

/**
 * When the readings printed on a report were taken, as far as the report says. Null when it
 * gives no date: a number cannot be put on a time line without one. A report says the day, never
 * the hour, so a reading is placed at noon, or at the start of the day for a report dated today.
 * It is never stamped "now": a very high blood pressure off a sheet of paper would otherwise
 * raise the "rest ten minutes and measure again" card, as if it had just been taken.
 */
export function checkupReadingsAt(date: string | null, now: Date = new Date()): string | null {
  if (!date) return null;
  const day = new Date(`${date}T00:00:00`);
  // no date, or one that has not come yet: nothing can be placed on it
  if (!Number.isFinite(day.getTime()) || day.getTime() > now.getTime()) return null;
  return (fmtISODate(day) === fmtISODate(now) ? day : new Date(`${date}T12:00:00`)).toISOString();
}

/**
 * Files the check-up itself: what the report flagged, and the readings printed on it.
 * Without a date on the report the readings are left out and the record is filed under today.
 */
export function saveCheckup(result: CheckupResult): void {
  const at = checkupReadingsAt(result.date);
  const measurements: Omit<Measurement, "id">[] =
    at == null
      ? []
      : result.readings.map((r) => ({
          type: r.type,
          value: r.value,
          value2: r.value2,
          at,
          source: "visit",
          note: L("体检", "Check-up"),
        }));
  storeActions.addCheckup(
    {
      date: result.date ?? fmtISODate(new Date()),
      ...(result.date ? {} : { undated: true }),
      abnormal: result.abnormal,
      advice: result.advice ?? undefined,
    },
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
  const total = latest.abnormal.length;
  const more = total - shown.length;
  // the day a report was filed is not the day of the check-up, and is not passed off as one
  if (latest.undated) {
    return [
      L(
        `体检报告（日期没认出来）标出：${shown.join("、")}${more > 0 ? `等 ${total} 项` : ""}`,
        `Marked on a check-up report (its date could not be read): ${shown.join(", ")}${more > 0 ? ` (${total} in all)` : ""}`,
      ),
    ];
  }
  const when = fmtDate(`${latest.date}T12:00:00`, { year: true });
  return [
    L(
      `${when}体检报告标出：${shown.join("、")}${more > 0 ? `等 ${total} 项` : ""}`,
      `Marked on the check-up report of ${when}: ${shown.join(", ")}${more > 0 ? ` (${total} in all)` : ""}`,
    ),
  ];
}
