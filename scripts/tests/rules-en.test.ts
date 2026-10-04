/*
 * What is shown follows the interface language; what is stored stays Chinese.
 * Run with: npx tsx scripts/tests/rules-en.test.ts
 *
 * For now only fixed wording that is merely shown (the question on the home card, the three answer
 * buttons, "第 3 天", the one-line lists) has an English version. Everything that is generated and
 * then stored, or sent to the model, must come out in Chinese whatever the interface is set to:
 * above all what the rule engine writes (replies, alarms, the page for the doctor, the year).
 */
import { check, finish } from "./_check";
import { getLang, inChinese as inChineseOfLang, setLang } from "../../src/lib/lang";
import type { AnnualFacts, AnnualSummary, ChatRequest, DoctorSummary, Episode, Profile } from "../../src/lib/types";
import {
  detectUrgent,
  fallbackAfter,
  fallbackAnnual,
  fallbackChat,
  fallbackProfile,
  fallbackSummary,
  instantAlert,
  missingBasics,
  mustAsk,
  recordedTimeline,
  ruleHints,
} from "../../src/lib/ai/fallback";
import { CHECKIN_ANSWERS, answerCheckIn, answerLabel, checkInQuestion, currentHint, dayLabel, showAnswer, type CheckInAnswer } from "../../src/lib/checkin";
import {
  FEEL_OPTIONS,
  NO_DIAGNOSIS,
  ageOf,
  annualToText,
  episodeLine,
  feelWord,
  inChinese,
  outcomeLine,
  profileLine,
  provisionalTitle,
  severityLabel,
  showDiagnosis,
  showTreatment,
  statusLabel,
  summaryToText,
  toRelatedContext,
} from "../../src/lib/utils";

// A fixed "now": Saturday 3 Oct 2026, 10:30 local time. Nothing below depends on when the checks run.
const now = new Date(2026, 9, 3, 10, 30, 0).getTime();
// The page for the doctor, the yearly summary and a patient's age read the clock themselves and take
// no `now`. For this file (it runs in a process of its own) the clock stands still at that moment.
const RealDate = Date;
class FixedDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(now);
    else super(...(args as [number]));
  }
  static now(): number {
    return now;
  }
}
(globalThis as { Date: DateConstructor }).Date = FixedDate as unknown as DateConstructor;
const iso = (daysAgo: number, hour = 10) => new Date(2026, 9, 3 - daysAgo, hour, 0, 0).toISOString();

const profile: Profile = {
  name: "李明",
  gender: "男",
  birthYear: 1990,
  heightCm: 175,
  weightKg: 70,
  bloodType: "A",
  conditions: ["慢性胃炎"],
  allergies: ["青霉素"],
  medications: [],
  surgeries: [],
  familyHistory: [],
  createdAt: iso(300),
  updatedAt: iso(300),
};
const bare: Profile = { ...profile, name: "王秀兰", gender: "女", birthYear: 1962, heightCm: null, weightKg: null, bloodType: null };

/** A symptom being tracked. `told` false means the user never said when it began. */
const episode = (daysAgo: number, over: Partial<Episode> = {}, told = true): Episode => ({
  id: "e",
  title: "肚子痛",
  tags: ["腹部", "疼痛"],
  status: "active",
  startedAt: iso(daysAgo, 8),
  createdAt: told ? iso(daysAgo, 9) : iso(daysAgo, 8),
  updatedAt: iso(daysAgo, 9),
  lastCheckInAt: iso(daysAgo, 9),
  entries: [{ id: "n1", at: iso(daysAgo, 9), severity: 5, note: "晚饭后隐痛", location: null, source: "user" }],
  messages: [{ id: "m1", role: "user", content: "肚子痛，晚饭后隐痛", at: iso(daysAgo, 9), kind: "intake" }],
  relatedEpisodeIds: [],
  ...over,
});
const visit = (daysAgo: number, diagnosis = "急性胃炎", treatment = "奥美拉唑（每日一次）") => ({
  date: iso(daysAgo).slice(0, 10),
  diagnosis,
  treatment,
  recordedAt: iso(daysAgo, 9),
});
/** Everything about a result except the random ids, so two runs can be compared. */
const plain = (v: unknown) => JSON.stringify(v, (k, x) => (k === "id" ? undefined : x));
const KEYS: CheckInAnswer[] = ["better", "same", "worse"];
const hasChinese = (s: string) => /[一-龥]/.test(s);

const summary: DoctorSummary = {
  glance: ["肚子痛约 2 天，目前比较难受", "起初（10月1日）：晚饭后隐痛"],
  chiefComplaint: "肚子痛约 2 天",
  presentIllness: "患者于 2026年10月1日前后出现肚子痛。10月1日记录：“晚饭后隐痛”。",
  timeline: [{ time: "10月1日 09:00", event: "晚饭后隐痛" }],
  currentStatus: "最近一次记录（10月1日 09:00）：比较难受。",
  relevantHistory: ["既往史：慢性胃炎", "过敏史：青霉素"],
  priorSimilar: [],
  hints: [{ level: "warn", text: "已经持续 3 天，记录里还没有就诊。" }],
  questionsForDoctor: ["这次需要做哪些检查？"],
  generatedAt: iso(0),
  mode: "fallback",
};
const facts: AnnualFacts = {
  periodStart: iso(365),
  periodEnd: iso(0),
  hba1c: [],
  fbgMonthly: [],
  weight: [],
  bp: [],
  lows: [],
  insights: [],
  followUps: [{ id: "f1", date: "2026-01-12", hospital: "市一医院", department: "内分泌科", reason: "3 个月复查", findings: "糖化 7.6%", plan: "二甲双胍加量", recordedAt: iso(260) }],
  episodes: [],
};
const annual: AnnualSummary = {
  glance: ["糖化血红蛋白由 8.5% 到 6.8%"],
  headline: "过去一年：糖化血红蛋白由 8.5% 变为 6.8%",
  overview: "患者既往有慢性胃炎。",
  metricTrends: [{ name: "糖化血红蛋白", trend: "8.5% 到 6.8%。" }],
  medicationChanges: [{ time: "2026年1月12日", change: "二甲双胍加量" }],
  keyEvents: [],
  patterns: [],
  currentConcerns: [],
  hints: [{ level: "info", text: "过敏史：青霉素，用药需避开。" }],
  questionsForDoctor: ["现在的治疗需要调整吗？"],
  generatedAt: iso(0),
  mode: "fallback",
  periodStart: iso(365),
  periodEnd: iso(0),
};

/* The same scenes are read in Chinese first and in English afterwards. */
const fresh = episode(2);
const longRunning = episode(24);
const seen = episode(2, { visit: visit(1) });
const seenLong = episode(24, { visit: visit(20) });
const checkup = episode(2, { visit: visit(1, NO_DIAGNOSIS, "没有开药") });
const resolved = episode(40, { status: "resolved", resolvedAt: iso(35) });
const resolvedSeen = episode(40, { status: "resolved", resolvedAt: iso(35), visit: visit(38) });
// scenes for the three answers: a new symptom, one that drags on, one already seen, one with standing advice
const SCENES: [string, Episode][] = [
  ["day 3", fresh],
  ["day 5", episode(4)],
  ["week 4", longRunning],
  ["seen, 4 days after the visit", episode(6, { visit: visit(4) })],
  ["seen yesterday", seen],
  ["standing advice", episode(24, { lastHint: { level: "warn", text: "洗脚前先用手试水温" }, lastHintAt: iso(1) })],
  ["nothing scored yet", episode(1, { entries: [{ id: "n1", at: iso(1, 9), severity: null, note: "肚子痛", location: null, source: "user" }] })],
];
const answersIn = () => SCENES.flatMap(([, e]) => KEYS.map((k) => plain(answerCheckIn(e, k, now))));
const keptChinese = () => ({
  feel: [null, 0, 1, 3, 4, 6, 7, 8, 10].map((s) => feelWord(s)),
  options: FEEL_OPTIONS.map((o) => `${o.label}=${o.score}`),
  severity: [null, 0, 2, 5, 8, 10].map((s) => severityLabel(s)),
  titles: ["喉咙痛，昨晚开始的", "头痛", "医生你好，我这两天肚子一直痛"].map(provisionalTitle),
  related: [fresh, seen, checkup, resolved, resolvedSeen].map((e) => toRelatedContext(e)),
  summaryText: summaryToText(summary, profile, fresh),
  annualText: annualToText(annual, profile, facts),
});

/* What the rule engine writes. It is stored, shown to the doctor and sent to the model, so it is Chinese in both languages. */
const fiveDays = episode(4);
const sore = episode(0, { title: "喉咙痛", tags: [], entries: [] }, false);
const chatReq = (messages: ChatRequest["messages"], kind: ChatRequest["kind"], e: Episode = fresh): ChatRequest => ({ kind, profile, episode: e, related: [], messages });
const tracked = (text: string, kind: ChatRequest["kind"] = "followup") =>
  chatReq([{ role: "user", content: "肚子痛，昨天开始的，现在大概 5 分。" }, { role: "assistant", content: "记下了。" }, { role: "user", content: text }], kind);
const yearFacts: AnnualFacts = {
  periodStart: iso(365),
  periodEnd: iso(0),
  hba1c: [{ at: iso(300), value: 8.5 }, { at: iso(40), value: 6.8 }],
  fbgMonthly: [{ month: "2025-11", label: "11月", count: 7, avg: 9.7, min: 9.6, max: 9.9 }, { month: "2026-09", label: "9月", count: 13, avg: 6.5, min: 6.1, max: 6.9 }],
  weight: [{ at: iso(300), value: 72 }, { at: iso(5), value: 67.2 }],
  bp: [{ at: iso(200), value: 150, value2: 95 }, { at: iso(10), value: 132, value2: 84 }],
  lows: [{ at: iso(100), value: 3.6, note: "散步后" }],
  insights: [],
  followUps: [{ id: "f1", date: "2026-01-12", reason: "3 个月复查", findings: "糖化 7.6%", plan: "二甲双胍加量", recordedAt: iso(260) }],
  episodes: [
    { title: "脚麻", status: "active", startedAt: iso(24), firstNote: "双脚发麻", lastNote: "夜里更明显", peakSeverity: 4, lastSeverity: 4, hint: "请在复诊时告诉医生", visit: null },
    { title: "感冒", status: "resolved", startedAt: iso(120), resolvedAt: iso(112), firstNote: "发烧咳嗽", lastNote: "好了", peakSeverity: 6, lastSeverity: 1, visit: { date: "2026-06-06", diagnosis: "上呼吸道感染", treatment: "布洛芬" } },
  ],
};
const ruleEngine = () => ({
  summary: fallbackSummary({ profile, episode: fresh, related: [] }).summary,
  summaryFiveDays: fallbackSummary({ profile, episode: fiveDays, related: [], vitals: ["最近血压 148/92（10月3日）"] }).summary,
  summarySeen: fallbackSummary({ profile, episode: seen, related: [toRelatedContext(resolvedSeen)] }).summary,
  summaryUnsaid: fallbackSummary({ profile, episode: episode(2, {}, false), related: [] }).summary,
  summaryAfterTap: fallbackSummary({ profile, episode: answerCheckIn(fresh, "better", now).episode, related: [] }).summary,
  timeline: recordedTimeline(fiveDays),
  annual: fallbackAnnual({ profile, facts: yearFacts }).summary,
  after: fallbackAfter({ profile, episode: fresh, text: "医生说是急性咽炎，开了头孢和布洛芬，让多喝水，三天不退烧再去。" }).result,
  afterVague: fallbackAfter({ profile, episode: null, text: "医生看了看说没什么事" }).result,
  parsed: fallbackProfile("有高血压，对青霉素过敏，每天吃一片降压药"),
  first: fallbackChat(chatReq([{ role: "user", content: "喉咙痛，昨晚开始的" }], "intake", sore)),
  worse: fallbackChat(tracked("更严重了")),
  fever: fallbackChat(tracked("【定时记录】现在 7 分：烧到38.5度，开始咳嗽了", "checkin")),
  alarm: fallbackChat(tracked("胸口很闷，喘不上气。")),
  closing: fallbackChat(chatReq([{ role: "user", content: "喉咙痛，昨晚开始的，有点难受，没有别的不舒服，没吃药。" }], "intake", sore)),
  hints: [ruleHints(tracked("更严重了")), ruleHints(tracked("烧到 38.6 度了")), ruleHints(tracked("非常难受")), ruleHints(chatReq([{ role: "user", content: "肚子痛" }, { role: "assistant", content: "记下了。" }, { role: "user", content: "更严重了" }], "followup", seen))],
  must: [mustAsk(chatReq([{ role: "user", content: "头痛" }], "intake", sore)), mustAsk(chatReq([{ role: "user", content: "头痛，今天下午开始的，比较难受" }], "intake", sore))],
  missing: [missingBasics("头痛"), missingBasics("吃了海鲜之后肚子持续隐痛", true)],
  urgent: ["胸口闷，喘不上气", "胸口痛", "今天早上大便是黑色的，像柏油一样", "烧到 39.5 度", "说话有点口齿不清，右边半边身子无力", "没有胸痛"].map(detectUrgent),
  alerts: ["测了血糖 3.4", "血压 185/110", "胸口痛，喘不上气", "喉咙痛，昨晚开始的"].map(instantAlert),
});
/** every piece of text in a result, without the field names */
const wording = (v: unknown): string[] => (typeof v === "string" ? [v] : v && typeof v === "object" ? Object.values(v).flatMap(wording) : []);
/** how the date helpers write in English: "Oct 1", "about 2 days", "less than a day", "3 hours ago" */
const ENGLISH_DATE = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b|\b(about|less than|ago|just now)\b|\b(hours?|days?|weeks?|months?)\b/;

/* ---------- Chinese: exactly what it was before English existed ---------- */
check("the checks start in Chinese", getLang() === "zh");
check("zh: today's question", checkInQuestion(fresh, now) === "「肚子痛」今天怎么样了？", checkInQuestion(fresh, now));
check("zh: this week's question for a symptom that drags on", checkInQuestion(longRunning, now) === "「肚子痛」这周怎么样了？", checkInQuestion(longRunning, now));
check("zh: the question after a visit", checkInQuestion(seen, now) === "看完医生后，「肚子痛」好些了吗？", checkInQuestion(seen, now));
check("zh: weeks after a visit it is the weekly question again", checkInQuestion(seenLong, now) === "「肚子痛」这周怎么样了？", checkInQuestion(seenLong, now));
const DAYS_ZH: [string, Episode, string][] = [
  ["started today", episode(0), "今天开始的"],
  ["noted today", episode(0, {}, false), "今天记的"],
  ["started yesterday", episode(1), "昨天开始的"],
  ["noted yesterday", episode(1, {}, false), "昨天记的"],
  ["day 3", episode(2), "第 3 天"],
  ["noted for 3 days", episode(2, {}, false), "记了 3 天"],
  ["day 15", episode(14), "第 15 天"],
  ["week 4", episode(24), "第 4 周"],
  ["week 4, start never said", episode(24, {}, false), "第 4 周"],
  ["3 months", episode(90), "3 个月了"],
];
for (const [name, e, want] of DAYS_ZH) check(`zh: day label, ${name}`, dayLabel(e, now) === want, dayLabel(e, now));
check("zh: the three answers", JSON.stringify(CHECKIN_ANSWERS) === '[{"key":"better","label":"好多了"},{"key":"same","label":"差不多"},{"key":"worse","label":"更严重了"}]', CHECKIN_ANSWERS);
check("zh: the buttons say what is stored", KEYS.map(answerLabel).join() === "好多了,差不多,更严重了", KEYS.map(answerLabel));
check("zh: a recorded answer is shown as it is", showAnswer("好多了") === "好多了" && showAnswer("差不多：早上稍缓解") === "差不多：早上稍缓解");
check("zh: status", statusLabel("active") === "跟踪中" && statusLabel("resolved") === "已好了");
check("zh: one line per record", episodeLine(seen) === "看过医生：急性胃炎" && episodeLine(fresh) === "还在跟踪" && episodeLine(resolved) === "自己好了，没有看医生" && episodeLine(checkup) === "看过医生：没有新的诊断", [episodeLine(seen), episodeLine(fresh), episodeLine(resolved), episodeLine(checkup)]);
check("zh: how an earlier record ended", outcomeLine(seen) === "诊断：急性胃炎；处理：奥美拉唑（每日一次）" && outcomeLine(resolved) === "当时没有就医，自行好转" && outcomeLine(fresh) === "还在跟踪中" && outcomeLine(checkup) === "诊断：没有新的诊断；处理：没有开药", [outcomeLine(seen), outcomeLine(resolved), outcomeLine(fresh), outcomeLine(checkup)]);
check("zh: who the patient is", profileLine(profile) === `李明 · 男 · ${ageOf(1990)} 岁 · 175 厘米 · 70 公斤 · A 型` && profileLine(bare) === `王秀兰 · 女 · ${ageOf(1962)} 岁`, [profileLine(profile), profileLine(bare)]);
check("zh: a diagnosis and a treatment are shown as stored", showDiagnosis(NO_DIAGNOSIS) === "没有新的诊断" && showDiagnosis("急性胃炎") === "急性胃炎" && showTreatment("没有开药") === "没有开药" && showTreatment("奥美拉唑") === "奥美拉唑");
const zhAnswers = answersIn();
const zhKept = keptChinese();
const zhWorse = answerCheckIn(fresh, "worse", now);
check("zh: 更严重了 is stored and answered in Chinese", zhWorse.episode.entries.at(-1)?.note === "更严重了" && zhWorse.episode.messages.at(-2)?.content === "【定时记录】更严重了" && zhWorse.reply === "比上次重了，建议今天去看医生。去之前点「给医生看」，我把记录整理好。", zhWorse.reply);
check("zh: the text for the doctor names the patient in Chinese", zhKept.summaryText.includes(`患者：李明 · 男 · ${ageOf(1990)} 岁 · 175 厘米 · 70 公斤 · A 型`) && zhKept.summaryText.startsWith("【医伴 · 就医摘要】") && zhKept.annualText.startsWith("【医伴 · 年度摘要】"), zhKept.summaryText.slice(0, 80));
const zhRules = ruleEngine();
check("zh: the first screen for the doctor", JSON.stringify(zhRules.summary.glance) === '["肚子痛约 2 天，目前比较难受","起初（10月1日）：晚饭后隐痛"]', zhRules.summary.glance);
check("zh: the history of this illness quotes the record with its date", zhRules.summary.presentIllness === "患者于 2026年10月1日前后出现肚子痛。10月1日记录：“晚饭后隐痛”。", zhRules.summary.presentIllness);
check("zh: the timeline and the latest state carry the time of the record", JSON.stringify(zhRules.summary.timeline) === '[{"time":"10月1日 09:00","event":"晚饭后隐痛"}]' && zhRules.summary.currentStatus === "最近一次记录（10月1日 09:00）：比较难受。", [zhRules.summary.timeline, zhRules.summary.currentStatus]);
check("zh: five days without a visit is pointed out to the doctor", zhRules.summaryFiveDays.glance[0] === "肚子痛约 4 天，目前比较难受" && zhRules.summaryFiveDays.hints[0]?.text === "已经持续 4 天，记录里还没有就诊。" && zhRules.timeline[0]?.time === "9月29日 09:00", [zhRules.summaryFiveDays.glance, zhRules.summaryFiveDays.hints, zhRules.timeline]);
check("zh: a start that was never said is not claimed", zhRules.summaryUnsaid.chiefComplaint === "肚子痛，10月1日第一次记录", zhRules.summaryUnsaid.chiefComplaint);
check("zh: after a one-tap answer the first screen quotes it", zhRules.summaryAfterTap.glance[0] === "肚子痛约 2 天，最近说「好多了」", zhRules.summaryAfterTap.glance);
check("zh: the year", zhRules.annual.glance[0] === "目前：「脚麻」已经约 3 周" && zhRules.annual.medicationChanges[0]?.time === "2026年1月12日" && zhRules.annual.headline === "过去一年：糖化血红蛋白由 8.5% 变为 6.8%，目前「脚麻」正在跟踪", [zhRules.annual.glance, zhRules.annual.medicationChanges, zhRules.annual.headline]);
check("zh: what the doctor said, organised", zhRules.after.diagnosis === "急性咽炎" && zhRules.after.date === "2026-10-03" && zhRules.after.summary.startsWith("患者因「肚子痛」约 2 天就诊。医生诊断：急性咽炎。"), zhRules.after);
check("zh: the first question and its quick answers", zhRules.first.reply === "记下了。现在有多难受？" && zhRules.first.suggestedReplies.join() === "有点难受,比较难受,非常难受" && zhRules.first.title === "喉咙痛" && zhRules.first.onsetHoursAgo === 13.5, zhRules.first);
check("zh: 更严重了 is answered with 建议今天去看医生", zhRules.worse.hint?.level === "warn" && zhRules.worse.hint.text === "比上次重了，建议今天去看医生。去之前点「给医生看」，我把记录整理好。", zhRules.worse.hint);
check("zh: a low glucose typed on the home screen", zhRules.alerts[0]?.level === "urgent" && zhRules.alerts[0].text.startsWith("血糖 3.4 属于低血糖。请现在吃 15 克左右的糖") && zhRules.alerts[3] === null, zhRules.alerts);
check("zh: chest tightness with breathlessness", zhRules.urgent[0]?.text === "胸口不舒服加上喘不上气是危险信号。请立即拨打 120 或去急诊，不要自己开车。" && zhRules.urgent[5] === null, zhRules.urgent);
check("zh: what is still to be asked", zhRules.must[0]?.question === "是什么时候开始的？" && zhRules.must[1]?.question === "吃过什么药吗？" && zhRules.missing[0].map((m) => m.key).join() === "onset,severity,measures", [zhRules.must, zhRules.missing]);

/* ---------- English: what is shown is English, what is stored is still Chinese ---------- */
setLang("en");
try {
  check("en: the fixtures really are read in English", dayLabel(fresh, now) === "Day 3" && getLang() === "en");

  /* the rule engine: however it is called, it writes what it writes in Chinese */
  const enRules = ruleEngine();
  check("en: the first screen for the doctor is the Chinese one, to the letter", JSON.stringify(enRules.summary.glance) === JSON.stringify(zhRules.summary.glance) && enRules.summary.glance[0] === "肚子痛约 2 天，目前比较难受", enRules.summary.glance);
  // in English the description the patient reads is written in English (what was recorded stays as it was said)
  check("en: the patient's description is put together in English", (enRules.summary.narrative ?? "").startsWith("I'm ") && /Since \d+ \w+, /.test(enRules.summary.narrative ?? ""), enRules.summary.narrative);
  check("zh: the patient's description stays Chinese", (zhRules.summary.narrative ?? "").startsWith("我"), zhRules.summary.narrative);
  check("en: the timeline is the Chinese one, with Chinese dates", JSON.stringify(enRules.summary.timeline) === JSON.stringify(zhRules.summary.timeline) && enRules.summary.timeline[0]?.time === "10月1日 09:00" && JSON.stringify(enRules.timeline) === JSON.stringify(zhRules.timeline), [enRules.summary.timeline, enRules.timeline]);
  check("en: no English date or duration in the first screen, the history or the timeline", !ENGLISH_DATE.test(wording([enRules.summary.glance, enRules.summary.presentIllness, enRules.summary.timeline, enRules.summary.chiefComplaint, enRules.summary.currentStatus]).join("\n")), wording([enRules.summary.glance, enRules.summary.presentIllness, enRules.summary.timeline]));
  for (const key of ["summary", "summaryFiveDays", "summarySeen", "summaryUnsaid", "summaryAfterTap"] as const) {
    // apart from the description the patient reads (narrative, chiefComplaint, presentIllness), which is English
    const doctorPart = (x: object) => JSON.stringify({ ...x, narrative: undefined, chiefComplaint: undefined, presentIllness: undefined });
    check(`en: page for the doctor (${key}) is the same as in Chinese`, doctorPart(enRules[key]) === doctorPart(zhRules[key]), enRules[key]);
  }
  check("en: the yearly summary is the same as in Chinese", JSON.stringify(enRules.annual) === JSON.stringify(zhRules.annual) && enRules.annual.glance[0] === "目前：「脚麻」已经约 3 周" && enRules.annual.medicationChanges[0]?.time === "2026年1月12日", enRules.annual);
  check("en: what the doctor said is organised the same as in Chinese", JSON.stringify([enRules.after, enRules.afterVague, enRules.parsed]) === JSON.stringify([zhRules.after, zhRules.afterVague, zhRules.parsed]), enRules.after);
  // in English the conversation is held in English: without a model, the rules ask in English too
  check("en: the conversation by rule asks in English", !hasChinese(enRules.first.reply) && /\?$/.test(enRules.first.reply) && enRules.first.suggestedReplies.length > 0 && enRules.first.suggestedReplies.every((x) => !hasChinese(x)), enRules.first);
  check("zh: the conversation by rule is unchanged", zhRules.first.reply === "记下了。现在有多难受？" && zhRules.first.suggestedReplies.join() === "有点难受,比较难受,非常难受" && zhRules.worse.hint?.text.includes("建议今天去看医生") === true, zhRules.first);
  check("en: when to see a doctor, what to ask next and what is missing are the same as in Chinese", JSON.stringify([enRules.hints, enRules.must, enRules.missing]) === JSON.stringify([zhRules.hints, zhRules.must, zhRules.missing]), [enRules.hints, enRules.must, enRules.missing]);
  check("en: danger signals are raised the same as in Chinese", JSON.stringify([enRules.urgent, enRules.alerts]) === JSON.stringify([zhRules.urgent, zhRules.alerts]) && enRules.urgent.filter(Boolean).length === 5 && enRules.alerts.filter(Boolean).length === 3, [enRules.urgent, enRules.alerts]);
  const low = instantAlert("测了血糖 3.4");
  check("en: the alarm for a glucose of 3.4 is in Chinese", low?.level === "urgent" && hasChinese(low.text) && !/[A-Za-z]{2,}/.test(low.text) && low.text.includes("低血糖") && low.text.includes("15 克") && low.text.includes("120"), low);
  check("zh: nothing the rule engine writes in Chinese carries an English date, duration or sentence", !ENGLISH_DATE.test(wording(zhRules).join("\n")) && !/[A-Za-z]{2,} [a-z]{2,}/.test(wording(zhRules).filter((x) => x !== "fallback").join("\n")), wording(zhRules).filter((x) => ENGLISH_DATE.test(x) || /[A-Za-z]{2,} [a-z]{2,}/.test(x)));
  check("en: after the rule engine has run, the interface is still in English", getLang() === "en" && dayLabel(fresh, now) === "Day 3" && checkInQuestion(fresh, now) === 'How is "肚子痛" today?');

  check("en: today's question keeps the symptom as written", checkInQuestion(fresh, now) === 'How is "肚子痛" today?', checkInQuestion(fresh, now));
  check("en: this week's question", checkInQuestion(longRunning, now) === 'How is "肚子痛" this week?', checkInQuestion(longRunning, now));
  check("en: the question after a visit", checkInQuestion(seen, now) === 'Since seeing the doctor, is "肚子痛" any better?', checkInQuestion(seen, now));
  check("en: weeks after a visit it is the weekly question again", checkInQuestion(seenLong, now) === 'How is "肚子痛" this week?', checkInQuestion(seenLong, now));
  const DAYS_EN = ["Started today", "Noted today", "Started yesterday", "Noted yesterday", "Day 3", "Noted for 3 days", "Day 15", "Week 4", "Week 4", "3 months now"];
  DAYS_ZH.forEach(([name, e], i) => check(`en: day label, ${name}`, dayLabel(e, now) === DAYS_EN[i], dayLabel(e, now)));

  check("en: the buttons say Much better / About the same / Worse", KEYS.map(answerLabel).join("|") === "Much better|About the same|Worse", KEYS.map(answerLabel));
  check("en: what a tap stores is still the Chinese answer", CHECKIN_ANSWERS.map((a) => a.label).join() === "好多了,差不多,更严重了", CHECKIN_ANSWERS);
  check("en: a recorded one-tap answer can be shown in English, a note in the user's words is left alone", showAnswer("好多了") === "Much better" && showAnswer("差不多") === "About the same" && showAnswer("更严重了") === "Worse" && showAnswer("差不多：早上稍缓解") === "差不多：早上稍缓解" && showAnswer("晚饭后隐痛") === "晚饭后隐痛");

  // the three answers, in every scene: the record, the conversation, the reply and the advice are what they are in Chinese
  const enAnswers = answersIn();
  check("en: tapping an answer works in every scene", enAnswers.length === 21 && zhAnswers.length === 21, enAnswers.length);
  for (const key of KEYS) {
    const out = answerCheckIn(fresh, key, now);
    const label = CHECKIN_ANSWERS.find((a) => a.key === key)!.label;
    const note = out.episode.entries.at(-1);
    const said = out.episode.messages.at(-2);
    check(`en: ${key} is stored as ${label}`, note?.note === label && note.source === "checkin" && said?.content === `【定时记录】${label}` && said.kind === "checkin", { note, said });
    check(`en: the reply to ${key} is English`, !hasChinese(out.reply) && out.episode.messages.at(-1)?.content === out.reply, out.reply);
  }
  const worse = answerCheckIn(fresh, "worse", now);
  check("en: Worse still says to see a doctor today", worse.suggestVisit && worse.hint?.level === "warn" && /see a doctor today/i.test(worse.reply) && zhWorse.reply.includes("建议今天去看医生"), worse.reply);
  check("en: advice that says 今天 is still gone the next day", currentHint(worse.episode, now)?.level === "warn" && currentHint(worse.episode, now + 20 * 3_600_000) === null);

  check("en: status", statusLabel("active") === "Tracking" && statusLabel("resolved") === "Well now", [statusLabel("active"), statusLabel("resolved")]);
  check("en: one line per record, the diagnosis as the doctor's record has it", episodeLine(seen) === "seen a doctor: 急性胃炎" && episodeLine(fresh) === "still tracking" && episodeLine(resolved) === "got better without seeing a doctor", [episodeLine(seen), episodeLine(fresh), episodeLine(resolved)]);
  check("en: a visit without a new diagnosis is put into words", episodeLine(checkup) === "seen a doctor, no new diagnosis", episodeLine(checkup));
  check("en: how an earlier record ended", outcomeLine(seen) === "Diagnosis: 急性胃炎; treatment: 奥美拉唑（每日一次）" && outcomeLine(resolved) === "Got better without seeing a doctor" && outcomeLine(fresh) === "Still tracking" && outcomeLine(checkup) === "Diagnosis: No new diagnosis; treatment: No medicine prescribed", [outcomeLine(seen), outcomeLine(resolved), outcomeLine(fresh), outcomeLine(checkup)]);
  check("en: who the patient is", profileLine(profile) === `李明 · Male · ${ageOf(1990)} years old · 175 cm · 70 kg · blood type A` && profileLine(bare) === `王秀兰 · Female · ${ageOf(1962)} years old`, [profileLine(profile), profileLine(bare)]);
  check("en: the fixed values of a visit are shown in English, anything else as stored", showDiagnosis(NO_DIAGNOSIS) === "No new diagnosis" && showDiagnosis("急性胃炎") === "急性胃炎" && showTreatment("没有开药") === "No medicine prescribed" && showTreatment("奥美拉唑") === "奥美拉唑");
  check("en: the stored value for 'no new diagnosis' has not changed", NO_DIAGNOSIS === "没有新的诊断" && checkup.visit?.diagnosis === "没有新的诊断");

  // generated text that is stored or sent to the model: the same as in Chinese, to the letter
  const enKept = keptChinese();
  check("en: 有点难受 / 比较难受 / 非常难受 stay as they are", JSON.stringify(enKept.feel) === JSON.stringify(zhKept.feel) && JSON.stringify(enKept.options) === JSON.stringify(zhKept.options) && enKept.options.join() === "有点难受=3,比较难受=6,非常难受=8", enKept.options);
  check("en: the severity words stay as they are", JSON.stringify(enKept.severity) === JSON.stringify(zhKept.severity), enKept.severity);
  check("en: a working title is still read from Chinese words", JSON.stringify(enKept.titles) === '["喉咙痛","头痛","肚子痛"]', enKept.titles);
  check("en: an earlier record handed to the model is the same as in Chinese", JSON.stringify(enKept.related) === JSON.stringify(zhKept.related), enKept.related);
  check("en: its date and outcome are Chinese", enKept.related[0].date === "2026年10月1日" && enKept.related[3].outcome?.startsWith("已好转（") === true && !/[A-Za-z]{3,}/.test(enKept.related.flatMap((r) => Object.values(r)).join(" ")), enKept.related);
  check("en: the text copied for the doctor is the same as in Chinese", enKept.summaryText === zhKept.summaryText, enKept.summaryText);
  check("en: the yearly text copied for the doctor is the same as in Chinese", enKept.annualText === zhKept.annualText, enKept.annualText);
  check("en: neither carries an English date or an English patient line", !/years old|Male|Oct|Jan/.test(enKept.summaryText + enKept.annualText), enKept.summaryText.slice(0, 120));

  // the helper that keeps generated text Chinese hands the interface language back, even on an error
  check("there is one inChinese: utils passes on the one in lang.ts", inChinese === inChineseOfLang);
  check("en: inside inChinese the app speaks Chinese", inChinese(() => getLang()) === "zh" && inChinese(() => inChinese(() => dayLabel(fresh, now))) === "第 3 天");
  let threw = false;
  try {
    inChinese(() => {
      throw new Error("boom");
    });
  } catch {
    threw = true;
  }
  check("en: afterwards the interface language is back, also after an error", threw && getLang() === "en" && dayLabel(fresh, now) === "Day 3");
} finally {
  // the language is global: hand it back, or every check after this one would run in English
  setLang("zh");
}

/* ---------- back in Chinese: nothing has moved ---------- */
check("the language is Chinese again", getLang() === "zh");
check("zh again: question, day label and buttons", checkInQuestion(fresh, now) === "「肚子痛」今天怎么样了？" && dayLabel(fresh, now) === "第 3 天" && KEYS.map(answerLabel).join() === "好多了,差不多,更严重了");
check("zh again: the lines", statusLabel("active") === "跟踪中" && episodeLine(seen) === "看过医生：急性胃炎" && outcomeLine(resolved) === "当时没有就医，自行好转" && profileLine(bare) === `王秀兰 · 女 · ${ageOf(1962)} 岁`);
check("zh again: the three answers record what they did before", JSON.stringify(answersIn()) === JSON.stringify(zhAnswers));
check("zh again: generated text is unchanged", JSON.stringify(keptChinese()) === JSON.stringify(zhKept));
check("zh again: the rule engine writes what it wrote before", JSON.stringify(ruleEngine()) === JSON.stringify(zhRules));
check("zh: inChinese changes nothing", inChinese(() => dayLabel(fresh, now)) === "第 3 天" && getLang() === "zh");

finish("rules-en");
