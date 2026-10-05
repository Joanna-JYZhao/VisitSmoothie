/* Unit checks for the data layer, the rule engine and both demo datasets. Run with: npm run test:unit */
import { buildWangXiulanState } from "./fixtures/demo-wang";
import { autoTags, clipText, feelWord, findSimilarEpisodes, provisionalTitle, roughDuration } from "../src/lib/utils";
import type { ChatRequest, Episode, Profile } from "../src/lib/types";
import { buildDemoState } from "./fixtures/demo-liming";
import {
  buildAnnualFacts,
  detectInsights,
  dueMetrics,
  hasYearOfData,
  evaluateMeasurement,
  findHighStreaks,
  latestOf,
  measurementsOf,
  looksMistyped,
  metricsContextText,
  pendingRetest,
  plainConclusion,
} from "../src/lib/metrics";
import { answerCheckIn, checkInIntervalHours, checkInQuestion, currentHint, dayLabel, dueEpisodes, isCheckInDue, recheckDue } from "../src/lib/checkin";
import { episodesCoveredBy, followUpDate, treatmentText } from "../src/lib/after";
import { relatedEpisodesOf } from "../src/lib/episodeAI";
import {
  extractOnsetHours,
  extractSeverity,
  fallbackAfter,
  fallbackAnnual,
  fallbackChat,
  fallbackProfile,
  fallbackSummary,
  instantAlert,
} from "../src/lib/ai/fallback";
import { askedInRound, normalizeAfter, normalizeChat, normalizeProfile, normalizeSummary, repeatedQuestion, stripUnstated, withoutQuestion, withoutSpeculation } from "../src/lib/ai/normalize";
import { encodeWav, normalizeVolume, splitAtQuiet } from "../src/lib/audio";
import { migrate } from "../src/lib/store";

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail?: unknown) => {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  -> " + JSON.stringify(detail)}`);
};

async function main() {
  // Fixed "today" so the checks do not depend on when they run: 2 Oct 2026, 21:00 local time.
  const anchor = new Date(2026, 9, 2, 21, 0, 0);
  const now = anchor.getTime();
  const wang = buildWangXiulanState(anchor);
  const ms = wang.measurements;

  /* ---------- Wang Xiulan: a year of metrics ---------- */
  check("no reading lies in the future", ms.every((m) => new Date(m.at).getTime() <= now));
  check("a full year of fasting glucose exists", measurementsOf(ms, "fbg").length > 120, measurementsOf(ms, "fbg").length);
  check("four HbA1c checks, 8.5 down to 6.8", JSON.stringify(measurementsOf(ms, "hba1c").map((m) => m.value)) === "[8.5,7.6,7,6.8]", measurementsOf(ms, "hba1c").map((m) => m.value));
  check("latest fasting glucose is two days old", Math.round((now - new Date(latestOf(ms, "fbg")!.at).getTime()) / 3600e3) >= 48, latestOf(ms, "fbg"));

  const streaks = findHighStreaks(ms);
  check("exactly one high streak against an in-range baseline", streaks.length === 1, streaks);
  check("the streak is the five days of the May holiday", streaks[0]?.days === 5 && streaks[0]?.holiday === "五一假期" && streaks[0]?.startKey === "2026-05-01", streaks[0]);
  check("the streak peaks at 8.9 and falls back afterwards", streaks[0]?.max === 8.9 && streaks[0]?.after === 6.9, streaks[0]);

  const insights = detectInsights(ms, now);
  const kinds = insights.map((i) => i.kind);
  check("insights include the low-glucose event", insights.some((i) => i.kind === "low" && i.text.includes("3.6")), insights);
  check("insights include the holiday pattern", insights.some((i) => i.kind === "streak" && i.title.includes("五一假期")), insights);
  check("insights include the two-week status", kinds.includes("recent"), kinds);
  check("insights include the HbA1c trend", insights.some((i) => i.title === "糖化血红蛋白" && i.text.includes("8.5") && i.text.includes("6.8")), insights);
  check("insights include the weight trend", insights.some((i) => i.title === "体重" && i.text.includes("下降")), insights);

  check("only fasting glucose is due for a reminder", JSON.stringify(dueMetrics(ms, wang.settings, now)) === '["fbg"]', dueMetrics(ms, wang.settings, now));
  check("reminders can be switched off", dueMetrics(ms, { ...wang.settings, metricReminderHours: 0 }, now).length === 0);
  const daily = { ...wang.settings, trackedMetrics: ["fbg" as const], metricReminderHours: 24 };
  const lateLastNight = [{ id: "x", type: "fbg" as const, value: 6.3, at: new Date(2026, 9, 1, 23, 30).toISOString(), source: "user" as const }];
  check("'every day' goes by the calendar: last night's reading does not cover today", dueMetrics(lateLastNight, daily, new Date(2026, 9, 2, 7, 0).getTime()).length === 1 && dueMetrics(lateLastNight, daily, new Date(2026, 9, 1, 23, 50).getTime()).length === 0);
  check("Wang's glucose row is due whatever the time of day", [1, 9, 15, 23].every((h) => { const a = new Date(2026, 9, 2, h, 0, 0); const st = buildWangXiulanState(a); return dueMetrics(st.measurements, st.settings, a.getTime()).includes("fbg"); }));

  const facts = buildAnnualFacts(wang, now);
  // The anchor is the 2nd of the month and the latest reading is two days old, so the current month has none yet.
  const lastMonth = facts.fbgMonthly[facts.fbgMonthly.length - 1];
  check("yearly facts cover every month that has readings", facts.fbgMonthly.length === 11 && facts.fbgMonthly[0].label === "11月" && lastMonth.label === "9月", facts.fbgMonthly.map((x) => x.label));
  check("monthly average falls from above 9 to under 7", facts.fbgMonthly[0].avg > 9 && lastMonth.avg < 7, [facts.fbgMonthly[0], lastMonth]);
  check("month two runs from 9.8 down to 8.1", facts.fbgMonthly[1].max === 9.8 && facts.fbgMonthly[1].min <= 8.1, facts.fbgMonthly[1]);
  check("yearly facts hold one low reading, three follow-ups, four episodes", facts.lows.length === 1 && facts.followUps.length === 3 && facts.episodes.length === 4, { lows: facts.lows.length, f: facts.followUps.length, e: facts.episodes.length });
  check("the active episode carries its hint into the facts", facts.episodes.some((e) => e.title === "脚麻" && e.status === "active" && Boolean(e.hint)));
  check("stable months stay within 6-7", facts.fbgMonthly.slice(-2).every((x) => x.min >= 6 && x.max <= 7), facts.fbgMonthly.slice(-2));

  check("3.6 is flagged as urgent low glucose", evaluateMeasurement({ type: "ppg", value: 3.6 })?.level === "urgent");
  check("6.5 fasting raises nothing", evaluateMeasurement({ type: "fbg", value: 6.5 }) === null);
  check("8.0 fasting is a gentle note", evaluateMeasurement({ type: "fbg", value: 8.0 })?.level === "info");
  check("18.0 is a warning", evaluateMeasurement({ type: "fbg", value: 18 })?.level === "warn");
  check("185/100 blood pressure is urgent", evaluateMeasurement({ type: "bp", value: 185, value2: 100 })?.level === "urgent");
  check("128/80 blood pressure raises nothing", evaluateMeasurement({ type: "bp", value: 128, value2: 80 }) === null);

  const ctx = metricsContextText(ms, now);
  check("chat context lists the latest readings", ctx.includes("空腹血糖") && ctx.includes("糖化血红蛋白") && ctx.includes("低血糖记录"), ctx);

  const li = buildDemoState();
  check("the acute demo has no metrics and no reminders", li.measurements.length === 0 && dueMetrics(li.measurements, li.settings, now).length === 0);
  check("no insights without data", detectInsights([], now).length === 0);

  // "Similar earlier records": same body area only counts together with the same kind of symptom.
  const ep = (title: string, tags: string[]) => ({ id: title, title, tags, startedAt: anchor.toISOString() }) as unknown as Episode;
  const similar = (a: string, aTags: string[], b: string, bTags: string[]) => findSimilarEpisodes([ep(b, bTags)], { title: a, tags: aTags }).length > 0;
  check("stomach ache matches an earlier gastritis episode", similar("肚子痛", autoTags("肚子痛"), "胃痛", ["腹部", "消化", "疼痛", "反酸"]));
  check("shaky hands do not match numb feet", !similar("散步后出冷汗、手抖", ["低血糖", "出汗", "手抖", "心慌"], "脚麻", ["四肢关节", "脚麻", "麻木"]));
  check("a headache does not match a stomach ache", !similar("头痛", autoTags("头痛"), "肚子痛", ["腹部", "疼痛"]));
  check("a sore throat matches an earlier sore throat", similar("喉咙痛", autoTags("喉咙痛"), "喉咙痛", ["耳鼻喉", "咽痛"]));
  check("a fever matches an earlier cold with fever", similar("发烧", autoTags("发烧"), "感冒发烧", ["发热", "呼吸", "咽痛", "咳嗽"]));

  /* ---------- the simplified flow ---------- */

  // long-term features: on for Wang, off for everyone else
  check("Wang's demo opens with long-term management on", wang.settings.longTerm === true && li.settings.longTerm === false);
  check("Wang's yearly appointment is today", wang.nextVisit != null && new Date(wang.nextVisit.at).toDateString() === anchor.toDateString(), wang.nextVisit);
  const conclusion = plainConclusion(ms, now);
  check("one plain sentence says how the glucose is doing", conclusion.includes("最近两周空腹血糖平均") && conclusion.includes("都在一般范围内") && conclusion.includes("从 8.5% 降到了 6.8%"), conclusion);
  check("no sentence without data", plainConclusion([], now) === "");

  // how often to ask
  const numb = wang.episodes.find((e) => e.title === "脚麻")!;
  check("a symptom that has dragged on for weeks is asked about weekly", checkInIntervalHours(numb, wang.settings, now) === 168);
  check("Wang's numb feet are due for their weekly question", isCheckInDue(numb, wang.settings, now) && checkInQuestion(numb, now).includes("这周"), checkInQuestion(numb, now));
  const liNow = Date.now();
  const belly = li.episodes.find((e) => e.status === "active")!;
  check("a new symptom is asked about daily", checkInIntervalHours(belly, li.settings, liNow) === 24);
  check("Li Ming's stomach ache is due for today's question", dueEpisodes(li, liNow).length === 1 && checkInQuestion(belly, liNow).includes("今天"), checkInQuestion(belly, liNow));
  check("the card says how long it has been going on", /^第 [34] 天$/.test(dayLabel(belly, liNow)) && dayLabel(numb, now) === "第 4 周", [dayLabel(belly, liNow), dayLabel(numb, now)]);
  const at = (d: number, h: number) => new Date(2026, 9, d, h).toISOString();
  check("a symptom from last night started 昨天, not 今天", dayLabel({ ...belly, startedAt: at(1, 21) }, new Date(2026, 9, 2, 9).getTime()) === "昨天开始的" && dayLabel({ ...belly, startedAt: at(2, 7) }, new Date(2026, 9, 2, 9).getTime()) === "今天开始的");

  // the three one-tap answers, with no model involved
  const worse = answerCheckIn(belly, "worse", liNow);
  check("更严重了 says plainly to see a doctor today", worse.suggestVisit && worse.hint?.level === "warn" && worse.reply.includes("建议今天去看医生"), worse.reply);
  check("更严重了 is recorded on the timeline and in the conversation", worse.episode.entries.length === belly.entries.length + 1 && worse.episode.messages.length === belly.messages.length + 2 && worse.episode.entries.at(-1)?.source === "checkin");
  check("after an answer the question is no longer due", !isCheckInDue(worse.episode, li.settings, liNow));
  const better = answerCheckIn(belly, "better", liNow);
  check("好多了 raises no warning and clears the old one", better.hint === null && !better.suggestVisit && better.episode.lastHint === null);
  check("好多了 lowers the estimate, never to zero", (better.episode.entries.at(-1)?.severity ?? 0) === 3, better.episode.entries.at(-1));
  // fixed clock: these count calendar days, so they must not depend on when the tests run
  const midday = new Date(2026, 9, 2, 12, 0, 0).getTime();
  const started = (daysAgo: number) => ({ ...belly, lastHint: null, startedAt: new Date(midday - daysAgo * 86400e3).toISOString() });
  const same = answerCheckIn(started(2), "same", midday);
  check("差不多 on day three stays calm", !same.suggestVisit && same.reply.includes("明天"), same.reply);
  const dragging = answerCheckIn(started(3), "same", midday);
  check("差不多 on day four suggests a doctor", dragging.suggestVisit && dragging.reply.includes("已经 3 天了还没见好，建议去看医生"), dragging.reply);
  const numbSame = answerCheckIn(numb, "same", now);
  check("差不多 on a weeks-old symptom keeps its advice and talks of next week", numbSame.suggestVisit && numbSame.reply.includes("下周") && numbSame.episode.lastHint?.text === numb.lastHint?.text, numbSame.reply);
  const numbBare = answerCheckIn({ ...numb, lastHint: null }, "same", now);
  check("without standing advice, 差不多 after weeks suggests a doctor", numbBare.suggestVisit && numbBare.reply.includes("找医生看一下"), numbBare.reply);
  const seen: Episode = { ...belly, visit: { date: "2026-10-01", diagnosis: "急性胃炎", treatment: "奥美拉唑", recordedAt: new Date(liNow - 3600e3).toISOString(), followUpAt: new Date(liNow - 60e3).toISOString(), followUp: "两周后复诊" } };
  check("seeing a doctor does not end the tracking", seen.status === "active" && checkInQuestion(seen, liNow).startsWith("看完医生后"));
  check("更严重了 after a visit says to go back", answerCheckIn(seen, "worse", liNow).reply.includes("再去看一次医生"));
  check("a passed follow-up date is flagged", recheckDue(seen, liNow) && !recheckDue(belly, liNow));

  // data saved by the earlier version
  const old = migrate({ profile: li.profile, episodes: [{ ...belly, status: "visited" }], settings: { checkInIntervalHours: 6, trackedMetrics: ["fbg"] } });
  check("an old 已就医 episode becomes one that is still tracked", old.episodes[0].status === "active");
  check("someone who already tracked metrics keeps seeing them", old.settings.longTerm === true && old.nextVisit === null);
  check("the old every-six-hours pace becomes once a day", old.settings.checkInIntervalHours === 24 && migrate({ settings: { checkInIntervalHours: 12 } }).settings.checkInIntervalHours === 12);
  check("a fresh profile starts with long-term management off", migrate({ profile: li.profile }).settings.longTerm === false);

  // reading a sentence
  const nine = new Date(2026, 9, 2, 9, 0, 0).getTime();
  check("昨晚, said at nine in the morning, is twelve hours ago", extractOnsetHours("喉咙痛，昨晚开始的", nine) === 12, extractOnsetHours("喉咙痛，昨晚开始的", nine));
  check("昨晚, said at nine in the evening, is a full day ago", extractOnsetHours("喉咙痛，昨晚开始的", now) === 24, extractOnsetHours("喉咙痛，昨晚开始的", now));
  check("今天下午, said in the evening, is this afternoon", extractOnsetHours("今天下午开始的", now) === 6);
  check("下午, said in the morning, is yesterday afternoon", extractOnsetHours("下午开始的", nine) === 18);
  check("两天了 is forty-eight hours", extractOnsetHours("咳嗽两天了", now) === 48);
  check("这两天 is two days, whatever time of day is mentioned with it", extractOnsetHours("这两天早上起床的时候头晕", now) === 48 && extractOnsetHours("这几天老是咳嗽", now) === 72);
  check("三天前 is seventy-two hours", extractOnsetHours("发烧，三天前开始的", now) === 72);
  check("a count per day is not a duration", extractOnsetHours("一天拉五次", now) === null, extractOnsetHours("一天拉五次", now));
  check("no onset when none is said", extractOnsetHours("头有点晕", now) === null);
  check("a stated score is exact", JSON.stringify(extractSeverity("大概 7 分", null)) === '{"severity":7,"exact":true}');
  check("比较难受 is an estimate, not a score", JSON.stringify(extractSeverity("比较难受", null)) === '{"severity":6,"exact":false}');
  check("nothing is invented when no degree is said", extractSeverity("喉咙痛，吞口水疼", null).severity === null);
  check("the three words map back from the estimate", feelWord(3) === "有点难受" && feelWord(6) === "比较难受" && feelWord(8) === "非常难受");
  check("a working title is taken from the first words", provisionalTitle("喉咙痛，昨晚开始的") === "喉咙痛" && provisionalTitle("头痛") === "头痛");

  // danger signals shown before any model answers
  check("low glucose typed on the home screen is caught at once", instantAlert("刚才手抖出汗，测了血糖 3.4")?.level === "urgent" && instantAlert("刚才手抖出汗，测了血糖 3.4")!.text.includes("15 克"));
  check("chest pain with breathlessness is caught at once", instantAlert("胸口痛，喘不上气")?.level === "urgent");
  check("chest tightness with breathlessness says to call 120 outright", instantAlert("胸口闷，喘不上气")!.text.includes("立即拨打 120") && !instantAlert("胸口闷，喘不上气")!.text.includes("如果"));
  check("chest tightness alone is urgent and worded as tightness", instantAlert("胸口闷了一下午")?.level === "urgent" && instantAlert("胸口闷了一下午")!.text.includes("胸口闷"));
  check("a negated breathlessness does not turn chest pain into the combined alarm", instantAlert("胸口有点痛，没有喘不上气")!.text.includes("如果"));
  check("an ordinary complaint raises nothing", instantAlert("喉咙痛，昨晚开始的") === null && instantAlert("没有胸痛") === null);

  // the conversation: at most four questions, then done
  const profile: Profile = li.profile!;
  const req = (messages: ChatRequest["messages"], kind: ChatRequest["kind"] = "followup"): ChatRequest => ({
    kind,
    profile,
    episode: { title: "喉咙痛", tags: [], status: "active", startedAt: new Date(liNow).toISOString(), entries: [] },
    related: [],
    messages,
  });
  const first = fallbackChat(req([{ role: "user", content: "喉咙痛，昨晚开始的" }], "intake"));
  check("the first turn names the symptom and when it began", first.title === "喉咙痛" && first.onsetHoursAgo != null && first.onsetHoursAgo >= 2 && first.onsetHoursAgo <= 27 && first.done === false, first);
  check("the first question offers the three one-tap degrees", JSON.stringify(first.suggestedReplies) === '["有点难受","比较难受","非常难受"]', first.suggestedReplies);
  const q = (n: number) => Array.from({ length: n }, (_, i) => [{ role: "assistant" as const, content: `问题 ${i + 1}？` }, { role: "user" as const, content: "嗯" }]).flat();
  check("questions asked in a row are counted", askedInRound([{ role: "user", content: "a" }, ...q(3)]) === 3);
  check("a finished round resets the count", askedInRound([{ role: "assistant", content: "问？" }, { role: "user", content: "嗯" }, { role: "assistant", content: "好了，我都记下了。" }, { role: "user", content: "又疼了" }]) === 0);
  const fifth = fallbackChat(req([{ role: "user", content: "喉咙痛" }, ...q(4)]));
  check("after four questions the rule engine wraps up", fifth.done === true && !/[?？]/.test(fifth.reply), fifth.reply);
  const forced = normalizeChat({ reply: "还有别的吗？", done: false, suggestedReplies: ["没有"] }, req([{ role: "user", content: "喉咙痛" }, ...q(4)]));
  check("a model that keeps asking is closed after four questions", forced.done === true);
  const told3 = [{ role: "user" as const, content: "喉咙痛，昨晚开始的，比较难受，没吃药" }];
  const closed = normalizeChat({ reply: "好了，我都记下了。多喝水。", done: true, suggestedReplies: ["好的"] }, req(told3));
  check("a closing reply carries no quick answers", closed.done === true && closed.suggestedReplies.length === 0, closed);
  // the three things a doctor asks first are known before the first round closes
  const early = normalizeChat({ reply: "好了，我都记下了。多休息。", done: true }, req([{ role: "user", content: "头痛" }, { role: "assistant", content: "记下了。头痛有多难受？" }, { role: "user", content: "比较难受" }], "followup"));
  check("the model may not close before asking when it began", early.done === false && early.reply === "记下了。是什么时候开始的？" && early.suggestedReplies.includes("昨天"), early);
  const early2 = normalizeChat({ reply: "好了，我都记下了。", done: true }, req([{ role: "user", content: "头痛，今天下午开始的，比较难受" }], "intake"));
  check("nor before asking what has been taken", early2.done === false && early2.reply.includes("吃过什么药"), early2);
  const toldAll = normalizeChat({ reply: "好的，我都记下了。建议今天去看消化内科。", done: true }, req([{ role: "user", content: "拉肚子两天了，一天五六次，今天量体温38.6度，非常难受，吃了蒙脱石散没用" }], "intake"));
  check("what was already said in the first sentence is not asked again", toldAll.done === true && !/[?？]/.test(toldAll.reply), toldAll.reply);
  const laterRound = normalizeChat({ reply: "记下了，多休息。", done: true }, req([{ role: "user", content: "头痛" }, { role: "assistant", content: "好了，我都记下了。" }, { role: "user", content: "今天又有点疼" }]));
  check("a later round may close at once", laterRound.done === true && laterRound.reply === "记下了，多休息。");
  // warnings are decided by rule; the model can word one but not raise one
  const pushy = normalizeChat({ reply: "记下了。", hint: { level: "warn", text: "建议今天去看神经内科。" }, done: false }, req([{ role: "user", content: "头痛，有点恶心，吃了布洛芬没用" }], "intake"));
  check("a warning the rules do not back is only a note", pushy.hint?.level === "info", pushy.hint);
  const backed = normalizeChat({ reply: "记下了。", hint: { level: "warn", text: "烧到 38.6 了，建议今天去发热门诊。" } }, req([{ role: "user", content: "烧到 38.6 度了" }]));
  check("a warning the rules do back keeps the model's wording", backed.hint?.level === "warn" && backed.hint.text.includes("发热门诊"), backed.hint);
  const missed = normalizeChat({ reply: "记下了。", hint: null }, req([{ role: "user", content: "更严重了" }]));
  check("a warning the model forgot is still given", missed.hint?.level === "warn" && missed.hint.text.includes("今天去看医生"), missed.hint);
  const alarm = normalizeChat({ reply: "记下了。", hint: null }, req([{ role: "user", content: "胸口闷，喘不上气" }]));
  check("a danger signal the model missed is still an alarm", alarm.hint?.level === "urgent", alarm.hint);
  const catchAll = normalizeChat({ reply: "有没有恶心或者怕光？", suggestedReplies: ["没有", "有恶心", "怕光", "都有"] }, req([{ role: "user", content: "头痛" }], "intake"));
  check("'都有' is never offered as an answer", JSON.stringify(catchAll.suggestedReplies) === '["没有","有恶心","怕光"]', catchAll.suggestedReplies);
  const guessed = normalizeChat({ reply: "记下了。", entry: { severity: 6, exact: true, note: "咽痛" } }, req([{ role: "user", content: "吞口水疼" }]));
  check("a score the user never said is not marked as theirs", guessed.entry?.exact === false, guessed.entry);
  const stated = normalizeChat({ reply: "记下了。", entry: { severity: 7, exact: true, note: "咽痛" } }, req([{ role: "user", content: "大概 7 分" }]));
  check("a score the user did say is marked as theirs", stated.entry?.exact === true);
  const fever = normalizeChat({ reply: "记下了。", entry: null }, req([{ role: "user", content: "烧到 38.6 度了" }]));
  check("a temperature the model missed is still recorded", fever.entry?.temperature === 38.6, fever.entry);
  const vagueTemp = normalizeChat({ reply: "记下了。", entry: { temperature: 38.5, note: "发烧38度多" } }, req([{ role: "user", content: "38度多" }]));
  check("38度多 is recorded as 38, not as a guessed 38.5", vagueTemp.entry?.temperature === 38, vagueTemp.entry);
  const noTemp = normalizeChat({ reply: "记下了。", entry: { temperature: 38.5, severity: 6, note: "比较难受" } }, req([{ role: "user", content: "比较难受" }]));
  check("a temperature is not repeated on a message that gave none", noTemp.entry?.temperature === null, noTemp.entry);
  const spokenTemp = normalizeChat({ reply: "记下了。", entry: { temperature: 38.5, note: "体温三十八度五" } }, req([{ role: "user", content: "量了三十八度五" }]));
  check("a temperature said in words is taken from the model", spokenTemp.entry?.temperature === 38.5, spokenTemp.entry);
  const named = normalizeChat({ reply: "多久了？", title: "咽喉疼痛。", onsetHoursAgo: 20 }, req([{ role: "user", content: "嗓子疼" }], "intake"));
  check("the model's title and onset are used on the first turn", named.title === "咽喉疼痛" && named.onsetHoursAgo === 20, named);

  // never the same question twice in one round
  const asked = (q: string, a = "嗯") => [{ role: "assistant", content: q }, { role: "user", content: a }];
  const round = [{ role: "user", content: "头痛" }, ...asked("头痛了，了解。是整个头都疼，还是某个地方特别疼？", "今天下午开始的")];
  check("the same question in other words is caught", repeatedQuestion("下午开始的，明白了。是整个头疼还是某个地方特别疼？", round) !== null);
  check("a reworded 'anything else' is caught", repeatedQuestion("比较难受，记下了。有没有发烧或者别的不舒服？", [{ role: "user", content: "喉咙痛" }, ...asked("记下了。有没有发烧或者别的难受？", "比较难受")]) !== null);
  check("a short repeat after an acknowledgement is caught", repeatedQuestion("记下了，有没有发烧？", [{ role: "user", content: "喉咙痛" }, ...asked("有没有发烧或者别的难受？")]) !== null);
  check("a different question is not a repeat", repeatedQuestion("没发烧，好的。这两天有没有吃过什么药？", [{ role: "user", content: "喉咙痛" }, ...asked("有没有发烧或者别的难受？", "没有")]) === null);
  check("asking how bad it is after asking where is not a repeat", repeatedQuestion("现在有多难受？", round) === null);
  check("a reply without a question is never a repeat", repeatedQuestion("好了，我都记下了。", round) === null);
  check("asking how bad it is twice is a repeat however it is worded", repeatedQuestion("好的。头痛是有点难受、比较难受还是非常难受？", [{ role: "user", content: "头痛" }, ...asked("记下了。头痛有多难受？", "我在上班")]) !== null);
  check("asking about medicine twice is a repeat", repeatedQuestion("这两天吃过什么药吗？", [{ role: "user", content: "头痛" }, ...asked("有没有吃药？", "还行")]) !== null);
  check("the same question on a later day is allowed", repeatedQuestion("今天有没有发烧？", [{ role: "user", content: "喉咙痛" }, ...asked("有没有发烧？", "没有"), { role: "assistant", content: "好了，我都记下了。" }, { role: "user", content: "又疼了" }]) === null);
  const dropped = withoutQuestion({ ...first, reply: "下午开始的，明白了。是整个头疼还是某个地方特别疼？", suggestedReplies: ["整个头疼"] });
  check("a stubborn repeat keeps the acknowledgement and drops the question", dropped.reply === "下午开始的，明白了。" && dropped.done && dropped.suggestedReplies.length === 0, dropped);

  // what is handed to the doctor
  const summary = fallbackSummary({ profile, episode: belly, related: [] }).summary;
  check("the rule-built summary has lines for the first screen", summary.glance.length >= 2 && summary.glance.length <= 4 && summary.glance[0].includes("肚子痛"), summary.glance);
  check("the first screen does not repeat the allergy line of the header", !summary.glance.some((g) => g.includes("过敏")), summary.glance);
  const afterBetter = fallbackSummary({ profile, episode: better.episode, related: [] }).summary;
  check("after 好多了 the summary quotes the answer, not the estimate behind it", afterBetter.glance[0].includes("最近说「好多了」") && afterBetter.currentStatus.includes("好多了") && !afterBetter.currentStatus.includes("难受"), [afterBetter.glance[0], afterBetter.currentStatus]);
  check("the summary never writes a score the user did not give", !/\d\/10/.test(JSON.stringify(summary)), summary);
  // nothing the patient did not say
  const modelSays = {
    glance: ["模型自己写的一条"],
    chiefComplaint: "肚子痛 2 天",
    presentIllness: "患者晚饭后出现肚脐上方隐痛，伴反酸，无发热，尚未就医，未用药。",
    currentStatus: "仍有隐痛，未用药。",
    timeline: [{ time: "10月3日 00:09", event: "记录就诊" }],
    relevantHistory: ["慢性胃炎", "青霉素过敏", "无手术史，无家族史"],
    hints: [{ level: "warn", text: "建议尽快就诊消化内科" }, { level: "info", text: "和 7 月的胃痛记录相似" }],
  };
  const cleaned = normalizeSummary(modelSays, { profile, episode: belly, related: [] });
  check("the first screen is always the rule-built one", JSON.stringify(cleaned.glance) === JSON.stringify(summary.glance) && !cleaned.glance.includes("模型自己写的一条"), cleaned.glance);
  check("the timeline is always the recorded entries, never the model's", JSON.stringify(cleaned.timeline) === JSON.stringify(summary.timeline) && !JSON.stringify(cleaned.timeline).includes("记录就诊"), cleaned.timeline);
  check("unstated negatives are removed from the model's text", cleaned.presentIllness === "患者晚饭后出现肚脐上方隐痛，伴反酸。" && cleaned.currentStatus === "仍有隐痛。", [cleaned.presentIllness, cleaned.currentStatus]);
  check("'无手术史，无家族史' is not invented from an empty profile field", JSON.stringify(cleaned.relevantHistory) === '["慢性胃炎","青霉素过敏"]', cleaned.relevantHistory);
  check("advice to the patient is kept out of the notes for the doctor", cleaned.hints.length === 1 && cleaned.hints[0].text.includes("相似"), cleaned.hints);
  check("a negative the patient did state is kept", stripUnstated("喉咙痛两天，未用药。", "没吃药") === "喉咙痛两天，未用药。" && stripUnstated("喉咙痛两天，未用药。", "喉咙痛") === "喉咙痛两天。");
  check("'无发热' survives only when the patient said so", stripUnstated("咳嗽，无发热。", "不发烧") === "咳嗽，无发热。" && stripUnstated("咳嗽，无发热。", "咳嗽") === "咳嗽。");
  check("durations for the doctor carry no false precision", roughDuration(new Date(now - 29 * 3600e3).toISOString(), new Date(now).toISOString()) === "约 1 天" && roughDuration(new Date(now - 10 * 3600e3).toISOString(), new Date(now).toISOString()) === "不到 1 天" && roughDuration(new Date(now - 24 * 86400e3).toISOString(), new Date(now).toISOString()) === "约 3 周");
  // when the patient never said when it began, nothing claims to know
  const unsaid = { ...belly, startedAt: belly.createdAt };
  const unsaidSummary = fallbackSummary({ profile, episode: unsaid, related: [] }).summary;
  check("no start time is claimed when none was given", unsaidSummary.chiefComplaint.includes("第一次记录") && !unsaidSummary.chiefComplaint.includes("约") && unsaidSummary.presentIllness.includes("没有说是什么时候开始的"), unsaidSummary.chiefComplaint);
  check("the card says 记的, not 开始的, until the user says when it began", /记/.test(dayLabel(unsaid, liNow)) && !/开始/.test(dayLabel(unsaid, liNow)), dayLabel(unsaid, liNow));
  const consistent = normalizeSummary({ presentIllness: "患者左侧头痛。较上次好转更快。", hints: [{ level: "info", text: "本次头痛特点与患者既往偏头痛病史一致。" }, { level: "info", text: "和 9 月 10 日的头痛记录相似。" }] }, { profile, episode: belly, related: [] });
  check("'consistent with a disease' and comparisons are kept out", consistent.hints.length === 1 && consistent.hints[0].text.includes("相似") && consistent.presentIllness === "患者左侧头痛。", consistent);
  check("a line is shortened without cutting a number in half", clipText("昨晚开始喉咙痛，吞口水疼，今天早上量体温 37.8", 24) === "昨晚开始喉咙痛，吞口水疼…" && clipText("今天早上起来量了一下体温是37.8度还挺难受", 16).endsWith("37.8…"), [clipText("昨晚开始喉咙痛，吞口水疼，今天早上量体温 37.8", 24), clipText("今天早上起来量了一下体温是37.8度还挺难受", 16)]);
  const rule = fallbackSummary({ profile, episode: belly, related: [] }).summary;
  check("the rule-built notes for the doctor contain no advice either", !rule.hints.some((h) => /建议/.test(h.text)), rule.hints);
  check("what the patient said is quoted with the day it was said", /\d+月\d+日记录：“/.test(rule.presentIllness), rule.presentIllness);
  const annual = fallbackAnnual({ profile: wang.profile!, facts }).summary;
  check("the yearly summary has lines for the first screen", annual.glance.length >= 2 && annual.glance.some((g) => g.includes("脚麻")) && annual.glance.some((g) => g.includes("8.5%")), annual.glance);
  check("the yearly first screen does not repeat the header's medicines or allergies", !annual.glance.some((g) => /在用|过敏/.test(g)), annual.glance);

  // after the visit, from the user's own words
  const told = fallbackAfter({ profile, episode: null, text: "医生说是急性咽炎，开了头孢和布洛芬，让多喝水，三天不退烧再去。" }).result;
  check("the diagnosis is picked out", told.diagnosis === "急性咽炎", told.diagnosis);
  check("the medicines are picked out, without the advice", JSON.stringify(told.medications.map((m) => m.name)) === '["头孢","布洛芬"]', told.medications);
  check("the advice is picked out", Boolean(told.advice?.includes("多喝水")), told.advice);
  check("the come-back time is picked out", told.followUpDays === 3 && told.followUpNote === "三天不退烧再去", [told.followUpDays, told.followUpNote]);
  const chronic = fallbackAfter({ profile, episode: null, text: "糖化 6.7，血压 128/82。医生说控制得不错，加了甲钴胺一天三次，三个月后复查。" }).result;
  check("readings said aloud become measurements", chronic.readings.some((r) => r.type === "hba1c" && r.value === 6.7) && chronic.readings.some((r) => r.type === "bp" && r.value === 128 && r.value2 === 82), chronic.readings);
  check("a long-term medicine is marked as such, with how to take it", chronic.medications[0]?.name === "甲钴胺" && chronic.medications[0]?.longTerm === true && chronic.medications[0]?.usage === "一天三次", chronic.medications);
  check("三个月后复查 is ninety days", chronic.followUpDays === 90);
  const vague = fallbackAfter({ profile, episode: null, text: "医生看了看说没什么事" }).result;
  check("words with no diagnosis or medicine are kept, and flagged", vague.unclear.length === 1 && vague.summary.includes("没什么事"), vague);
  const guessed2 = normalizeAfter({ diagnosis: "急性扁桃体炎", department: "耳鼻喉科", hospital: "市一医院" }, { profile, episode: null, text: "医生说是急性扁桃体炎，开了阿奇霉素" });
  check("a department nobody mentioned is not filled in", guessed2.department === null && guessed2.hospital === null, guessed2);
  const saidDept = normalizeAfter({ diagnosis: "耳石症", department: "耳鼻喉科" }, { profile, episode: null, text: "去耳鼻喉看的，医生说是耳石症" });
  check("a department the patient did mention is kept", saidDept.department === "耳鼻喉科");
  const fromPhoto = normalizeAfter({ diagnosis: "2型糖尿病", department: "内分泌科" }, { profile, episode: null }, true);
  check("a department printed on a photographed record is kept", fromPhoto.department === "内分泌科");
  const read = normalizeAfter({ date: "2031-01-01", diagnosis: "急性咽炎", medications: [{ name: "头孢克肟", usage: "每日两次", longTerm: false }, "布洛芬"], followUpDays: 3, readings: [{ type: "bp", value: 500 }], unclear: ["剂量看不清"] }, { profile, episode: null });
  check("a model's reading of a photo is cleaned up", read.date === null && read.medications.length === 2 && read.medications[1].name === "布洛芬" && read.readings.length === 0 && read.followUpDays === 3 && read.unclear.length === 1, read);

  // a visit recorded on its own is also filed under the complaint it was about
  const visitResult = { ...chronic, summary: "复诊，脚麻加用甲钴胺。" };
  check("a check-up that mentions the tracked complaint is linked to it", episodesCoveredBy(visitResult, "脚麻给我加了甲钴胺", wang.episodes).map((e) => e.title).join() === "脚麻");
  check("a check-up that does not mention it is not linked", episodesCoveredBy({ ...chronic, summary: "复诊，血糖控制良好。" }, "糖化 6.7，控制得不错", wang.episodes).length === 0);
  check("a distant reminder does not land on a public holiday", new Date(followUpDate({ ...chronic, date: "2026-10-03", followUpDays: 90 })!).toDateString() === new Date(2027, 0, 4).toDateString(), followUpDate({ ...chronic, date: "2026-10-03", followUpDays: 90 }));

  const noonOf = (daysAgo: number) => new Date(2026, 9, 2 - daysAgo, 12, 0, 0).getTime();
  // numbers: slips of the finger, re-tests, and advice that has gone stale
  check("16.5 against a usual 6.5 is asked about before saving", Boolean(looksMistyped({ type: "fbg", value: 16.5 }, ms)?.includes("16.5")) && looksMistyped({ type: "fbg", value: 7.4 }, ms) === null);
  check("a low reading is never held up by a question", looksMistyped({ type: "ppg", value: 3.5 }, ms) === null);
  check("a weight ten kilos off the last one is asked about", Boolean(looksMistyped({ type: "weight", value: 78 }, ms)) && looksMistyped({ type: "weight", value: 67.0 }, ms) === null);
  const lowNow = [...ms, { id: "low", type: "ppg" as const, value: 3.5, at: new Date(now - 20 * 60e3).toISOString(), source: "user" as const }];
  check("a low reading waits for its re-test", pendingRetest(lowNow, now)?.reading.value === 3.5 && pendingRetest(lowNow, now)?.kind === "glucose" && pendingRetest(ms, now) === null);
  const highBp = [...ms, { id: "hb", type: "bp" as const, value: 186, value2: 112, at: new Date(now - 5 * 60e3).toISOString(), source: "user" as const }];
  check("a very high blood pressure waits for its re-test too", pendingRetest(highBp, now)?.kind === "bp" && pendingRetest([...highBp, { id: "ok2", type: "bp" as const, value: 150, value2: 92, at: new Date(now - 60e3).toISOString(), source: "user" as const }], now) === null);
  check("248/92 is asked about before it is saved, even with no history", Boolean(looksMistyped({ type: "bp", value: 248, value2: 92 }, [])) && looksMistyped({ type: "bp", value: 186, value2: 112 }, []) === null);
  check("two readings are not a year", !hasYearOfData({ measurements: highBp.slice(-2), followUps: [] }) && hasYearOfData(wang));
  check("the same number of days on every screen", dayLabel({ ...belly, startedAt: new Date(noonOf(4)).toISOString(), createdAt: new Date(noonOf(4) + 3600e3).toISOString() }, noonOf(0)) === "第 5 天" && roughDuration(new Date(noonOf(4)).toISOString(), new Date(noonOf(0)).toISOString()) === "约 4 天" && answerCheckIn({ ...belly, startedAt: new Date(noonOf(4)).toISOString(), lastHint: null }, "same", noonOf(0)).reply.includes("已经 4 天了"));
  check("'一周后' is seven days later, weekend or not", new Date(followUpDate({ ...chronic, date: "2026-10-03", followUpDays: 7 })!).toDateString() === new Date(2026, 9, 10).toDateString());
  check("replies do not guess at causes", withoutSpeculation("记下了。血压波动或颈椎问题都可能引起头晕。有没有恶心？") === "记下了。有没有恶心？" && withoutSpeculation("胸闷伴喘不上气可能是心脏问题，你又有高血压。") === "");
  const sure = normalizeChat({ reply: "记下了。", hint: { level: "urgent", text: "请立即拨打120，不要自行前往医院。" } }, req([{ role: "user", content: "胸口闷，喘不上气" }]));
  check("an alarm the rules raised keeps the rules' wording", sure.hint?.text === instantAlert("胸口闷，喘不上气")?.text, sure.hint);
  const yesNo = normalizeChat({ reply: "有没有吃过什么药？", suggestedReplies: ["吃了降压药", "吃了止晕药"] }, req([{ role: "user", content: "头晕" }], "intake"));
  check("a yes-or-no question always offers a way to say no", yesNo.suggestedReplies[0] === "没吃药", yesNo.suggestedReplies);
  const doneAt = normalizeAfter({ diagnosis: "耳石症", procedures: ["手法复位"], medications: [{ name: "氨氯地平", usage: "不变（继续服用）" }], followUpNote: "一周后复查。" }, { profile, episode: null, text: "医生说是耳石症，做了复位" });
  check("what was done at the visit is kept, brackets do not nest, and no double full stop", treatmentText(doneAt) === "手法复位；氨氯地平（不变，继续服用）" && doneAt.followUpNote === "一周后复查", [treatmentText(doneAt), doneAt.followUpNote]);
  check("the re-test closes it", pendingRetest([...lowNow, { id: "ok", type: "ppg" as const, value: 5.2, at: new Date(now - 60e3).toISOString(), source: "user" as const }], now) === null);
  check("after three hours the re-test card goes away", pendingRetest(lowNow, now + 3.5 * 3600e3) === null);
  check("13.9 and above is a warning, not a gentle note", evaluateMeasurement({ type: "fbg", value: 16.5 })?.level === "warn" && evaluateMeasurement({ type: "fbg", value: 9 })?.level === "info");
  check("128/82 is not called high", evaluateMeasurement({ type: "bp", value: 128, value2: 82 }) === null && !plainConclusion([{ id: "b", type: "bp", value: 128, value2: 82, at: new Date(now).toISOString(), source: "visit" }], now).includes("高"));
  const noon = new Date(2026, 9, 2, 12, 0, 0).getTime();
  const fresh = { ...belly, startedAt: new Date(noon - 50 * 3600e3).toISOString(), lastHint: { level: "warn" as const, text: "建议今天去看医生" }, lastHintAt: new Date(noon - 2 * 3600e3).toISOString() };
  check("a fresh warning is shown on the card", currentHint(fresh, noon)?.level === "warn");
  check("'建议今天去看医生' is gone the next day", currentHint(fresh, noon + 20 * 3600e3) === null);
  const standing = { ...fresh, lastHint: { level: "warn" as const, text: "洗脚前先用手试水温" } };
  check("advice without a date in it stays for three days", currentHint(standing, noon + 48 * 3600e3)?.level === "warn" && currentHint(standing, noon + 100 * 3600e3) === null);
  check("on a weekly question the standing advice lasts until the next one", currentHint(numb, now)?.level === "warn" && currentHint(numb, now + 3 * 86400e3) === null, numb.lastHintAt);
  check("a plain note never sits on the home card", currentHint({ ...fresh, lastHint: { level: "info", text: "多喝水" } }, noon) === null);
  check("yesterday's alarm is not shown as if it were new", currentHint({ ...fresh, lastHint: { level: "urgent", text: "立即就医" }, lastHintAt: new Date(noon - 20 * 3600e3).toISOString() }, noon) === null);
  const keeps = answerCheckIn({ ...numb, lastHintAt: new Date(now - 8 * 3600e3).toISOString() }, "same", now);
  check("差不多 keeps specific standing advice instead of replacing it", keeps.episode.lastHint?.text === numb.lastHint?.text && keeps.reply.includes("下周"), keeps.reply);
  const later = { ...belly, id: "later", startedAt: new Date(liNow - 3600e3).toISOString(), relatedEpisodeIds: [] };
  const old1 = li.episodes.find((e) => e.title === "胃痛")!;
  check("only earlier records count as 'before'", relatedEpisodesOf(old1, [later, ...li.episodes]).every((e) => new Date(e.startedAt).getTime() < new Date(old1.startedAt).getTime()) && relatedEpisodesOf(later, [later, ...li.episodes]).some((e) => e.id === old1.id));

  // one sentence into a profile
  const parsed = fallbackProfile("有高血压，对青霉素过敏，每天吃一片降压药");
  check("one sentence is split into history, allergies and medicines", JSON.stringify([parsed.conditions, parsed.allergies, parsed.medications]) === '[["高血压"],["青霉素"],["每天吃一片降压药"]]', parsed);
  check("都没有 leaves the profile empty", JSON.stringify(Object.values(fallbackProfile("都没有")).filter(Array.isArray).flat()) === "[]");
  check("a model's 无 is not kept as an entry", normalizeProfile({ conditions: ["无"], allergies: ["青霉素"] }).conditions.length === 0);

  // speech: long recordings are cut into clips the service accepts
  const RATE = 16000;
  const speech = new Float32Array(70 * RATE).map((_, i) => (Math.floor(i / RATE) % 26 === 25 ? 0 : Math.sin(i / 20) * 0.3));
  const clips = splitAtQuiet(speech);
  check("a seventy-second recording becomes clips under thirty seconds", clips.length === 3 && clips.every((c) => c.length <= 28 * RATE) && clips.reduce((a, c) => a + c.length, 0) === speech.length, clips.map((c) => c.length / RATE));
  check("each cut falls in a quiet second", Math.floor(clips[0].length / RATE) === 25, clips[0].length / RATE);
  check("a tap is not speech", splitAtQuiet(new Float32Array(0.2 * RATE)).length === 0);
  const wav = encodeWav(clips[0]);
  const head = new DataView(await wav.arrayBuffer());
  check("clips are 16 kHz mono 16-bit WAV", wav.size === 44 + clips[0].length * 2 && head.getUint32(24, true) === RATE && head.getUint16(22, true) === 1 && head.getUint16(34, true) === 16);
  const quiet = normalizeVolume(new Float32Array([0.01, -0.02, 0.05]));
  check("quiet speech is turned up, loud speech is left alone", Math.abs(Math.max(...quiet) - 0.6) < 0.01 && normalizeVolume(new Float32Array([0.8]))[0] === new Float32Array([0.8])[0], Array.from(quiet));

  console.log("\nmonthly fasting averages:", facts.fbgMonthly.map((x) => `${x.label} ${x.avg}(${x.count})`).join("  "));
  console.log(`readings: fbg ${measurementsOf(ms, "fbg").length}, ppg ${measurementsOf(ms, "ppg").length}, hba1c ${measurementsOf(ms, "hba1c").length}, weight ${measurementsOf(ms, "weight").length}, bp ${measurementsOf(ms, "bp").length}`);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

void main();
