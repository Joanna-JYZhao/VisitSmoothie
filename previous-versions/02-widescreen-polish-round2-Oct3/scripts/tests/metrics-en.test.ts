/* Unit checks for the English wording of src/lib/metrics.ts. Run with: npx tsx scripts/tests/metrics-en.test.ts */
import { check, finish } from "./_check";
import { buildWangXiulanState } from "../fixtures/demo-wang";
import { getLang, setLang } from "../../src/lib/lang";
import {
  METRICS,
  METRIC_ORDER,
  buildAnnualFacts,
  detectInsights,
  evaluateMeasurement,
  holidayBetween,
  looksMistyped,
  metricsContextText,
  plainConclusion,
} from "../../src/lib/metrics";
import type { Hint, Measurement, MetricType } from "../../src/lib/types";

// Fixed "today", so nothing depends on when the checks run: 2 Oct 2026, 21:00 local time.
const ANCHOR = new Date(2026, 9, 2, 21, 0, 0);
const NOW = ANCHOR.getTime();
const wang = buildWangXiulanState(ANCHOR);
const ms = wang.measurements;

const HAN = /[一-鿿]/;
type Reading = Pick<Measurement, "type" | "value" | "value2">;

/** Runs something in English and always puts the language back, even when it throws. */
function inEnglish<T>(fn: () => T): T {
  setLang("en");
  try {
    return fn();
  } finally {
    setLang("zh");
  }
}

/** Every number in a sentence, in the order it appears. "HbA1c" is a name, not a number. */
const numbers = (text: string) => text.replace(/HbA1c/g, "").match(/\d+(?:\.\d+)?/g) ?? [];
/**
 * The same, without the count of sweets. That is the one place where the two languages differ on
 * purpose for now: the English already says "4 or 5 sweets", the Chinese is brought in line later.
 */
const numbersApartFromSweets = (text: string) => numbers(text.replace(/\d+ or \d+ sweets/, "").replace(/\d+ 块糖/, ""));
const sameList = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);
const sorted = (xs: string[]) => [...xs].sort();

const reading = (type: MetricType, value: number, value2?: number | null): Reading => ({ type, value, value2 });
const made = (type: MetricType, value: number, daysAgo: number, value2?: number): Measurement => ({
  id: `${type}-${value}-${daysAgo}`,
  type,
  value,
  value2,
  at: new Date(NOW - daysAgo * 86_400_000 - 3_600_000).toISOString(),
  source: "user",
});

/* ---------- every tier of every metric: the same level in both languages ---------- */

// values on, just under and just over every line the rules draw
const GLUCOSE = [1, 2.5, 3.8, 3.89, 3.9, 4, 4.4, 6.9, 7, 7.1, 9.9, 10, 10.1, 13.8, 13.89, 13.9, 14, 16.6, 16.69, 16.7, 16.8, 20, 33.3, 35];
const HBA1C = [3, 6.9, 6.99, 7, 7.1, 9, 20];
const WEIGHT = [20, 67.2, 250];
const SYSTOLIC = [50, 79, 80, 120, 139, 140, 141, 179, 180, 181, 209, 210, 260];
const DIASTOLIC = [null, 30, 39, 40, 80, 89, 90, 91, 109, 110, 111, 130];
const GRID: Reading[] = [
  ...GLUCOSE.flatMap((v) => [reading("fbg", v), reading("ppg", v)]),
  ...HBA1C.map((v) => reading("hba1c", v)),
  ...WEIGHT.map((v) => reading("weight", v)),
  ...SYSTOLIC.flatMap((s) => DIASTOLIC.map((d) => reading("bp", s, d))),
];
const name = (r: Reading) => `${r.type} ${r.value}${r.type === "bp" ? `/${r.value2}` : ""}`;

const zhHints = GRID.map((r) => evaluateMeasurement(r));
const enHints = inEnglish(() => GRID.map((r) => evaluateMeasurement(r)));
const pairs = GRID.map((r, i) => ({ r, zh: zhHints[i], en: enHints[i] }));
const spoken = pairs.filter((p): p is { r: Reading; zh: Hint; en: Hint } => p.zh != null && p.en != null);

{
  check("the grid is run in both languages", pairs.length === GRID.length && GRID.length > 200, GRID.length);
  const silentMismatch = pairs.filter((p) => (p.zh == null) !== (p.en == null)).map((p) => name(p.r));
  check("a reading that raises nothing in Chinese raises nothing in English, and the other way round", silentMismatch.length === 0, silentMismatch);
  const levelMismatch = spoken.filter((p) => p.zh.level !== p.en.level).map((p) => `${name(p.r)}: ${p.zh.level} / ${p.en.level}`);
  check("every hint has the same level in both languages", levelMismatch.length === 0, levelMismatch);
  for (const level of ["info", "warn", "urgent"] as const) {
    check(`the grid reaches level ${level}`, spoken.some((p) => p.en.level === level));
  }
  const chinese = spoken.filter((p) => HAN.test(p.en.text)).map((p) => p.en.text);
  check("no English hint contains a Chinese character", chinese.length === 0, chinese.slice(0, 3));
  const english = spoken.filter((p) => !HAN.test(p.zh.text)).map((p) => p.zh.text);
  check("every Chinese hint is still Chinese", english.length === 0, english.slice(0, 3));
  const numberMismatch = spoken
    .filter((p) => !sameList(numbersApartFromSweets(p.zh.text), numbersApartFromSweets(p.en.text)))
    .map((p) => [p.zh.text, p.en.text]);
  check("every English hint has the same numbers as the Chinese one, in the same order", numberMismatch.length === 0, numberMismatch.slice(0, 2));
  const shown = spoken.filter((p) => {
    const value = p.r.type === "bp" ? String(Math.round(p.r.value)) : p.r.value.toFixed(1);
    return !p.en.text.includes(value) || !p.zh.text.includes(value);
  });
  check("the reading itself is quoted in both languages", shown.length === 0, shown.slice(0, 2));
}

/* ---------- 120: where the Chinese says to call, the English says to call ---------- */
{
  const callMismatch = spoken.filter((p) => /拨打 120/.test(p.zh.text) !== /call 120/.test(p.en.text)).map((p) => name(p.r));
  check("'call 120' appears exactly where the Chinese says 拨打 120", callMismatch.length === 0, callMismatch);
  const anyMismatch = spoken.filter((p) => /120/.test(p.zh.text) !== /120/.test(p.en.text)).map((p) => name(p.r));
  check("120 appears in English only where it appears in Chinese", anyMismatch.length === 0, anyMismatch);
  const urgent = spoken.filter((p) => p.en.level === "urgent");
  check("every urgent English hint names 120, so the call button is shown", urgent.length > 0 && urgent.every((p) => /call 120/.test(p.en.text)));
  const calm = spoken.filter((p) => p.en.level !== "urgent");
  check("no hint below urgent mentions calling", calm.length > 0 && calm.every((p) => !/call|拨打/.test(`${p.en.text}${p.zh.text}`)));
  check("the emergency number is not translated into another one", spoken.every((p) => !/\b(911|999|112)\b/.test(p.en.text)));
}

/* ---------- each tier, sentence by sentence ---------- */
{
  const en = (r: Reading) => inEnglish(() => evaluateMeasurement(r));

  const low = en(reading("ppg", 3.6));
  check("low blood sugar: urgent, with the reading", low?.level === "urgent" && low.text.startsWith("Your blood sugar is 3.6, which is low."), low);
  check("low blood sugar: 15 g of sugar, now", /Eat about 15 g of sugar now/.test(low?.text ?? ""), low?.text);
  check("low blood sugar: the amounts agreed for the whole app", /for example 4 or 5 sweets, or half a glass of juice or a sugary drink\./.test(low?.text ?? ""), low?.text);
  check("low blood sugar: rest, and test again in 15 minutes", /Sit down and rest, and test again in 15 minutes\./.test(low?.text ?? ""), low?.text);
  check("low blood sugar: confused or cannot eat -> call 120 right away", /If you feel confused or cannot eat, call 120 right away\.$/.test(low?.text ?? ""), low?.text);
  check(
    "low blood sugar: sugar first, then the re-test, then 120, as in Chinese",
    (low?.text.indexOf("15 g") ?? -1) < (low?.text.indexOf("15 minutes") ?? -1) && (low?.text.indexOf("15 minutes") ?? -1) < (low?.text.indexOf("120") ?? -1),
    low?.text,
  );
  check("just under 3.9 is low in English too, 3.9 itself is not", en(reading("fbg", 3.89))?.level === "urgent" && en(reading("fbg", 3.9)) === null);

  const veryHigh = en(reading("fbg", 16.7));
  check("16.7: a warning that says very high", veryHigh?.level === "warn" && veryHigh.text.startsWith("Your blood sugar is 16.7, which is very high."), veryHigh);
  check(
    "16.7: the four signs, then a doctor right away, then a doctor soon without them",
    /feel sick or vomit, have stomach pain, breathe fast and deep, or feel confused, see a doctor right away\. Even without these, you should contact your doctor as soon as you can\.$/.test(veryHigh?.text ?? ""),
    veryHigh?.text,
  );
  const high = en(reading("fbg", 13.9));
  check("13.9: a warning that says well above the usual range", high?.level === "warn" && high.text.startsWith("Your blood sugar is 13.9, which is well above the usual range."), high);
  check(
    "13.9: test again first, then when to contact the doctor",
    /Test again in a little while\. If it is still this high, or you feel sick or vomit, have stomach pain or feel very thirsty, contact your doctor as soon as you can\.$/.test(high?.text ?? ""),
    high?.text,
  );
  check("just under 16.7 uses the 13.9 wording, just under 13.9 is a gentle note", /well above/.test(en(reading("fbg", 16.69))?.text ?? "") && en(reading("fbg", 13.89))?.level === "info");
  check("neither high tier mentions 120", !/120/.test(`${veryHigh?.text}${high?.text}`));

  const fasting = en(reading("fbg", 8));
  check(
    "a little high, fasting: label, reading and the usual range",
    fasting?.level === "info" && fasting.text.startsWith("Fasting glucose: 8.0. This is a little above the usual range (usually between 4.4 and 7.0)."),
    fasting,
  );
  const afterMeal = en(reading("ppg", 11.2));
  check(
    "a little high, after a meal: its own label and range",
    afterMeal?.level === "info" && afterMeal.text.startsWith("Glucose after meals or at other times: 11.2. This is a little above the usual range (usually below 10.0)."),
    afterMeal,
  );
  check("a little high: think about food and medicines, record as usual", /Think about whether your food or your medicines have changed lately\. Record it as usual next time\.$/.test(fasting?.text ?? ""), fasting?.text);
  check("in range raises nothing in English", en(reading("fbg", 6.5)) === null && en(reading("ppg", 10)) === null && en(reading("weight", 67.2)) === null);

  const bpUrgent = en(reading("bp", 185, 100));
  check("185/100: urgent, with the reading", bpUrgent?.level === "urgent" && bpUrgent.text.startsWith("Your blood pressure is 185/100, which is very high."), bpUrgent);
  check("185/100: rest for 10 minutes, then measure again", /Sit down and rest for 10 minutes first, then measure again\./.test(bpUrgent?.text ?? ""), bpUrgent?.text);
  check(
    "185/100: the four signs, then a doctor right away or 120",
    /If you also have a headache, chest tightness, blurred vision, or weak arms or legs, see a doctor right away or call 120\.$/.test(bpUrgent?.text ?? ""),
    bpUrgent?.text,
  );
  check("the top number alone at 180, or the bottom number alone at 110, is urgent in English", en(reading("bp", 180, 80))?.level === "urgent" && en(reading("bp", 130, 110))?.level === "urgent");
  check("179/109 is a gentle note in English", en(reading("bp", 179, 109))?.level === "info");
  const bpInfo = en(reading("bp", 150, 92));
  check(
    "150/92: a gentle note, measure again, tell the doctor if it stays high",
    bpInfo?.level === "info" &&
      bpInfo.text === "Your blood pressure is 150/92, a little above the usual range. You can rest for a few minutes and measure again. If it stays high for several days, tell your doctor.",
    bpInfo,
  );
  check("128/82 raises nothing in English", en(reading("bp", 128, 82)) === null);

  const a1c = en(reading("hba1c", 7.6));
  check("HbA1c 7.6: a gentle note with the usual range, and the doctor decides", a1c?.level === "info" && a1c.text === "Your HbA1c is 7.6%. The usual range is below 7.0%. Your doctor decides your own target.", a1c);
  check("HbA1c 6.9 raises nothing in English", en(reading("hba1c", 6.9)) === null);
}

/* ---------- the table: read through getters, so it follows the language of the moment ---------- */
{
  const held = METRICS.fbg; // taken while the language is Chinese, as a page would
  const zh = METRIC_ORDER.map((t) => ({ label: METRICS[t].label, targetText: METRICS[t].targetText, placeholder: METRICS[t].placeholder, unit: METRICS[t].unit }));
  check("labels start in Chinese", sameList(zh.map((x) => x.label), ["空腹血糖", "饭后或其他时间的血糖", "糖化血红蛋白", "体重", "血压"]), zh.map((x) => x.label));

  setLang("en");
  const en = METRIC_ORDER.map((t) => ({ label: METRICS[t].label, targetText: METRICS[t].targetText, placeholder: METRICS[t].placeholder, unit: METRICS[t].unit }));
  const heldInEnglish = held.label;
  const copied = { ...METRICS.bp }.label;
  setLang("zh");

  check(
    "after setLang('en') the labels are the agreed English ones",
    sameList(en.map((x) => x.label), ["Fasting glucose", "Glucose after meals or at other times", "HbA1c", "Weight", "Blood pressure"]),
    en.map((x) => x.label),
  );
  check("an entry taken out of the table earlier follows the language too", heldInEnglish === "Fasting glucose" && held.label === "空腹血糖", [heldInEnglish, held.label]);
  check("a copy made in English keeps the English it was copied with", copied === "Blood pressure", copied);
  check("units do not change with the language", sameList(en.map((x) => x.unit), ["mmol/L", "mmol/L", "%", "kg", "mmHg"]) && sameList(zh.map((x) => x.unit), en.map((x) => x.unit)), en.map((x) => x.unit));
  check(
    "the English ranges are the Chinese ranges",
    sameList(en.map((x) => x.targetText ?? ""), ["Usually between 4.4 and 7.0", "Usually below 10.0", "Usually below 7.0%", "", "Usually below 140/90; your doctor may set it lower for you"]),
    en.map((x) => x.targetText),
  );
  check("ranges and placeholders carry the same numbers in both languages", zh.every((x, i) => sameList(numbers(x.targetText ?? ""), numbers(en[i].targetText ?? "")) && sameList(numbers(x.placeholder), numbers(en[i].placeholder))));
  check("weight has no range in either language", zh[3].targetText === undefined && en[3].targetText === undefined && !("targetText" in METRICS.weight));
  check("no Chinese is left in the English table", en.every((x) => !HAN.test(`${x.label}${x.targetText ?? ""}${x.placeholder}`)), en);
  check("placeholders are in English", sameList(en.map((x) => x.placeholder), ["e.g. 6.5", "e.g. 8.2", "e.g. 6.8", "e.g. 68", "Top number"]), en.map((x) => x.placeholder));
  check("set back to Chinese, the labels are Chinese again", sameList(METRIC_ORDER.map((t) => METRICS[t].label), zh.map((x) => x.label)) && METRICS.bp.placeholder === "高压" && METRICS.fbg.targetText === "一般在 4.4–7.0 之间");
  check("the table still lists its fields in the same order", sameList(Object.keys(METRICS.fbg), ["type", "label", "unit", "decimals", "inputMin", "inputMax", "step", "target", "targetText", "placeholder", "lowerIsBetter"]), Object.keys(METRICS.fbg));
}

/* ---------- "is this number right?" ---------- */
{
  const bpHistory = [made("bp", 126, 9, 78), made("bp", 128, 2, 80)];
  const cases: { what: string; r: Reading; history: Measurement[]; asks: boolean }[] = [
    { what: "16.5 against Wang's usual fasting glucose", r: reading("fbg", 16.5), history: ms, asks: true },
    { what: "7.4, close to her usual", r: reading("fbg", 7.4), history: ms, asks: false },
    { what: "a low 3.5, which is never held up", r: reading("ppg", 3.5), history: ms, asks: false },
    { what: "22 with no history", r: reading("fbg", 22), history: [], asks: true },
    { what: "a weight ten kilos off her last one", r: reading("weight", 78), history: ms, asks: true },
    { what: "a weight close to her last one", r: reading("weight", 67), history: ms, asks: false },
    { what: "248/92 with no history", r: reading("bp", 248, 92), history: [], asks: true },
    { what: "70/35", r: reading("bp", 70, 35), history: [], asks: true },
    { what: "186/112 with no history, which is high but believable", r: reading("bp", 186, 112), history: [], asks: false },
    { what: "190/95 against a usual 127", r: reading("bp", 190, 95), history: bpHistory, asks: true },
    { what: "an HbA1c four points off her last one", r: reading("hba1c", 12), history: ms, asks: true },
    { what: "an HbA1c close to her last one", r: reading("hba1c", 7.1), history: ms, asks: false },
  ];
  for (const c of cases) {
    const zh = looksMistyped(c.r, c.history);
    const en = inEnglish(() => looksMistyped(c.r, c.history));
    const ok =
      (zh != null) === c.asks &&
      (en != null) === c.asks &&
      (en == null || (!HAN.test(en) && en.startsWith("You entered ") && en.endsWith(" Is this number right?") && sameList(numbers(zh ?? ""), numbers(en))));
    check(`mistyped, ${c.what}: ${c.asks ? "asked in both languages, same numbers, no Chinese" : "not asked in either language"}`, ok, [zh, en]);
  }
  const usual = inEnglish(() => looksMistyped(reading("fbg", 16.5), ms));
  check("mistyped: says what the readings usually are", /^You entered 16\.5\. Your readings are usually around \d\.\d\. Is this number right\?$/.test(usual ?? ""), usual);
  check("mistyped: the four fixed sentences", inEnglish(() =>
    looksMistyped(reading("fbg", 22), []) === "You entered 22.0. That is very high. Is this number right?" &&
    looksMistyped(reading("bp", 70, 35), []) === "You entered 70/35. That is very low. Is this number right?" &&
    looksMistyped(reading("bp", 248, 92), []) === "You entered 248/92. That is extremely high. Is this number right?" &&
    looksMistyped(reading("bp", 190, 95), bpHistory) === "You entered 190/95. Your top number is usually around 127. Is this number right?",
  ));
  const weight = inEnglish(() => looksMistyped(reading("weight", 78), [made("weight", 67.2, 3)]));
  const a1c = inEnglish(() => looksMistyped(reading("hba1c", 12), [made("hba1c", 6.8, 30)]));
  check("mistyped: weight and HbA1c quote the last reading", weight === "You entered 78.0 kg. Last time it was 67.2. Is this number right?" && a1c === "You entered 12.0%. Last time it was 6.8%. Is this number right?", [weight, a1c]);
}

/* ---------- the one-sentence conclusion ---------- */
{
  const zh = plainConclusion(ms, NOW);
  const en = inEnglish(() => plainConclusion(ms, NOW));
  check("conclusion for Wang: English, with no Chinese character", en.length > 0 && !HAN.test(en), en);
  check("conclusion for Wang: the same numbers as the Chinese one", sameList(sorted(numbers(zh)), sorted(numbers(en))), [zh, en]);
  check(
    "conclusion for Wang: the two-week average, all in range, and the HbA1c falling",
    /^Your fasting glucose averaged \d\.\d over the last two weeks\. All readings were in the usual range\. Your HbA1c went down from 8\.5% to 6\.8%\.$/.test(en),
    en,
  );
  check("no sentence without data, in English either", inEnglish(() => plainConclusion([], NOW)) === "");

  const say = (list: Measurement[]) => inEnglish(() => plainConclusion(list, NOW));
  const lowOnce = say([made("fbg", 3.5, 3), made("fbg", 6.7, 2), made("fbg", 6.9, 1)]);
  const lowTwice = say([made("fbg", 3.5, 3), made("fbg", 3.2, 2), made("fbg", 6.9, 1)]);
  check(
    "conclusion: low readings are counted, one or many, and the doctor is to be told",
    lowOnce === "Your fasting glucose averaged 5.7 over the last two weeks. 1 reading was low. Tell your doctor." &&
      lowTwice === "Your fasting glucose averaged 4.5 over the last two weeks. 2 readings were low. Tell your doctor.",
    [lowOnce, lowTwice],
  );
  const highOnce = say([made("fbg", 7.5, 3), made("fbg", 6.7, 2), made("fbg", 6.9, 1)]);
  const highTwice = say([made("fbg", 7.5, 3), made("fbg", 8.7, 2), made("fbg", 6.9, 1)]);
  check(
    "conclusion: high readings are counted out of the total, one or many",
    highOnce === "Your fasting glucose averaged 7.0 over the last two weeks. 1 of 3 readings was above the usual range." &&
      highTwice === "Your fasting glucose averaged 7.7 over the last two weeks. 2 of 3 readings were above the usual range.",
    [highOnce, highTwice],
  );
  const single = [{ ...made("fbg", 6.5, 0), at: new Date(2026, 8, 30, 7, 10).toISOString() }];
  check("conclusion: a single reading is dated in English", say(single) === "Your last fasting glucose reading was 6.5 (Sep 30).", say(single));
  check("conclusion: the same reading is dated in Chinese as before", plainConclusion(single, NOW) === "最近一次空腹血糖 6.5（9月30日）。", plainConclusion(single, NOW));
  check(
    "conclusion: HbA1c up, level, and on its own",
    say([made("hba1c", 6.5, 200), made("hba1c", 7.2, 10)]) === "Your HbA1c went up from 6.5% to 7.2%." &&
      say([made("hba1c", 6.8, 200), made("hba1c", 6.8, 10)]) === "Your HbA1c stayed at 6.8%." &&
      say([made("hba1c", 8.5, 100)]) === "Your HbA1c was 8.5%.",
  );
  check(
    "conclusion: blood pressure in range, high and very high",
    say([made("bp", 128, 1, 82)]) === "Your last blood pressure reading was 128/82." &&
      say([made("bp", 150, 1, 92)]) === "Your last blood pressure reading was 150/92, which is above the usual range." &&
      say([made("bp", 186, 1, 112)]) === "Your last blood pressure reading was 186/112, which is very high.",
  );
  check("conclusion: 128/82 is not called high in English", !/high|above/.test(say([made("bp", 128, 1, 82)])));
  check("conclusion: weight alone", say([made("weight", 67.2, 1)]) === "Your last weight was 67.2 kg.", say([made("weight", 67.2, 1)]));
  const several = say([made("fbg", 6.5, 2), made("bp", 150, 1, 92)]);
  check("conclusion: English sentences are separated by one space", several === "Your last fasting glucose reading was 6.5 (Sep 30). Your last blood pressure reading was 150/92, which is above the usual range.", several);
}

/* ---------- what is written for the model, or stored with a summary, stays Chinese ---------- */
{
  const zh = {
    context: metricsContextText(ms, NOW),
    insights: JSON.stringify(detectInsights(ms, NOW)),
    months: buildAnnualFacts(wang, NOW).fbgMonthly.map((x) => x.label).join(),
  };
  const en = inEnglish(() => ({
    context: metricsContextText(ms, NOW),
    insights: JSON.stringify(detectInsights(ms, NOW)),
    months: buildAnnualFacts(wang, NOW).fbgMonthly.map((x) => x.label).join(),
    holiday: holidayBetween("2026-05-01", "2026-05-05"),
  }));
  check("the block for the model is the same Chinese text in English mode", en.context === zh.context && en.context.includes("空腹血糖：最近一次") && !/Fasting|Usually|HbA1c/.test(en.context), en.context);
  check("the detected patterns are the same Chinese text in English mode", en.insights === zh.insights && zh.insights.includes("五一假期后血糖升高"));
  check("month labels and holiday names in the yearly facts are unchanged in English mode", en.months === zh.months && zh.months.startsWith("11月") && en.holiday === "五一假期", [en.months, en.holiday]);
}

/* ---------- back in Chinese: nothing has changed ---------- */
{
  check("the language is Chinese again after the English checks", getLang() === "zh");
  const zh = (r: Reading) => evaluateMeasurement(r)?.text;
  const low = zh(reading("ppg", 3.6)) ?? "";
  // The words between "15 克左右的糖" and "坐下休息" are about to be changed app-wide, so they are not pinned here.
  check(
    "Chinese, low blood sugar: reading, 15 克, 15 分钟后复测, 拨打 120",
    low.startsWith("血糖 3.6 属于低血糖。请现在吃 15 克左右的糖，比如 ") && low.endsWith("，坐下休息，15 分钟后复测。如果出现意识不清或无法进食，请立即拨打 120。"),
    low,
  );
  check("Chinese, 16.7", zh(reading("fbg", 16.7)) === "血糖 16.7 明显偏高。如果伴有恶心呕吐、腹痛、呼吸深快或意识模糊，请立即就医；没有这些情况也建议尽快联系医生。", zh(reading("fbg", 16.7)));
  check("Chinese, 13.9", zh(reading("fbg", 13.9)) === "血糖 13.9 比一般范围高不少。过一会儿再测一次；如果还是这么高，或者有恶心呕吐、肚子痛、特别口渴，请尽快联系医生。", zh(reading("fbg", 13.9)));
  check("Chinese, a little high", zh(reading("fbg", 8)) === "空腹血糖 8.0，比一般范围高一点（一般在 4.4–7.0 之间）。想想最近吃的和用的药有没有变化，下次照常记。", zh(reading("fbg", 8)));
  check("Chinese, a little high after a meal", zh(reading("ppg", 11.2)) === "饭后或其他时间的血糖 11.2，比一般范围高一点（一般低于 10.0）。想想最近吃的和用的药有没有变化，下次照常记。", zh(reading("ppg", 11.2)));
  check("Chinese, 185/100", zh(reading("bp", 185, 100)) === "血压 185/100 很高。请先坐下休息 10 分钟再测一次；如果还有头痛、胸闷、看东西模糊或手脚没力气，请立即就医或拨打 120。", zh(reading("bp", 185, 100)));
  check("Chinese, 150/92", zh(reading("bp", 150, 92)) === "血压 150/92，比一般范围高一点。休息几分钟后可以再测一次，连续几天都高请告诉医生。", zh(reading("bp", 150, 92)));
  check("Chinese, HbA1c 7.6", zh(reading("hba1c", 7.6)) === "糖化血红蛋白 7.6%，一般低于 7.0%。你自己的目标听医生的。", zh(reading("hba1c", 7.6)));
  check(
    "Chinese, mistyped",
    /^你填的是 16\.5，平时大多在 \d\.\d 左右。没有填错吧？$/.test(looksMistyped(reading("fbg", 16.5), ms) ?? "") &&
      looksMistyped(reading("bp", 248, 92), []) === "你填的是 248/92，这个数非常高。没有填错吧？" &&
      looksMistyped(reading("weight", 78), [made("weight", 67.2, 3)]) === "你填的是 78.0 公斤，上次是 67.2。没有填错吧？",
  );
  const conclusion = plainConclusion(ms, NOW);
  check("Chinese, conclusion for Wang", /^最近两周空腹血糖平均 \d\.\d，都在一般范围内。糖化血红蛋白从 8\.5% 降到了 6\.8%。$/.test(conclusion), conclusion);
  check(
    "Chinese, conclusion sentences sit against each other, without a space",
    plainConclusion([made("fbg", 6.5, 2), made("bp", 150, 1, 92)], NOW) === "最近一次空腹血糖 6.5（9月30日）。最近一次血压 150/92，偏高。",
    plainConclusion([made("fbg", 6.5, 2), made("bp", 150, 1, 92)], NOW),
  );
}

finish("metrics-en");
