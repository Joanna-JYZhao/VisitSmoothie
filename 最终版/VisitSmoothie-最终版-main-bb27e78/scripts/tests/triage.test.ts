/*
 * 初步分诊: whether to see a doctor, how soon, and where to register. Decided by rule.
 * Run with: npx tsx scripts/tests/triage.test.ts
 */
import { check, finish } from "./_check";
import type { Episode, Profile, Triage } from "../../src/lib/types";
import { triageFor } from "../../src/lib/triage";
import { answerCheckIn } from "../../src/lib/checkin";
import { instantAlert } from "../../src/lib/ai/fallback";
import { autoTags, findSimilarEpisodes, provisionalTitle } from "../../src/lib/utils";
import { buildDemoState } from "../fixtures/demo-liming";
import { buildWangXiulanState } from "../fixtures/demo-wang";

// A fixed "now": Saturday 3 Oct 2026, 10:30 local time. Li Ming's demo is built from the clock, so
// for this file (it runs in a process of its own) the clock stands still at that moment.
const NOW = new Date(2026, 9, 3, 10, 30, 0).getTime();
const RealDate = Date;
class FixedDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(NOW);
    else super(...(args as [number]));
  }
  static now(): number {
    return NOW;
  }
}
(globalThis as { Date: DateConstructor }).Date = FixedDate as unknown as DateConstructor;

const iso = (daysAgo: number, hour = 9) => new Date(2026, 9, 3 - daysAgo, hour, 0, 0).toISOString();
const DAY = 86_400_000;

const li = buildDemoState("zh");
const wang = buildWangXiulanState(new Date(NOW), "zh");
const plain: Profile = { name: "张敏", gender: "女", birthYear: 1988, conditions: [], allergies: [], medications: [], surgeries: [], familyHistory: [], createdAt: iso(100), updatedAt: iso(100) };
/** 王秀兰: 高血压 and 2 型糖尿病 on file */
const chronic = wang.profile!;

let serial = 0;
/**
 * A complaint as the app records it from one sentence: named and tagged by the same rules as the
 * store uses. `recorded`: days ago it was written down. `began`: days ago it started, when the patient said so.
 */
function ep(text: string, o: { recorded?: number; began?: number; severity?: number; temp?: number; title?: string; tags?: string[]; status?: Episode["status"] } = {}): Episode {
  const at = iso(o.recorded ?? o.began ?? 0, 9);
  return {
    id: `t${++serial}`,
    title: o.title ?? provisionalTitle(text),
    tags: o.tags ?? autoTags(text),
    status: o.status ?? "active",
    startedAt: o.began != null ? iso(o.began, 8) : at,
    createdAt: at,
    updatedAt: at,
    lastCheckInAt: at,
    entries: [{ id: "n0", at, severity: o.severity ?? null, temp: o.temp ?? null, note: text, location: null, source: "user" }],
    messages: [{ id: "m0", role: "user", content: text, at, kind: "intake" }],
    relatedEpisodeIds: [],
  };
}
/** One more thing the patient said later on. `noted: false` leaves it in the conversation only. */
function later(e: Episode, text: string, daysAgo: number, o: { hour?: number; severity?: number; temp?: number; noted?: boolean } = {}): Episode {
  const at = iso(daysAgo, o.hour ?? 10);
  return {
    ...e,
    messages: [...e.messages, { id: `m${e.messages.length}`, role: "user", content: text, at, kind: "followup" }],
    entries: o.noted === false ? e.entries : [...e.entries, { id: `n${e.entries.length}`, at, severity: o.severity ?? null, temp: o.temp ?? null, note: text, location: null, source: "user" }],
  };
}
/** The same complaint after a visit to the doctor, recorded `daysAgo` days ago. The diagnosis is on file; the card must never repeat it. */
const seenDoctor = (e: Episode, daysAgo: number, hour = 8): Episode => ({
  ...e,
  visit: { date: iso(daysAgo).slice(0, 10), diagnosis: "急性胃炎", treatment: "奥美拉唑（每日一次）", recordedAt: iso(daysAgo, hour) },
});

const all: { name: string; t: Triage }[] = [];
/** Every result goes through here, so the checks at the end see all of them. */
function triage(name: string, e: Episode, profile: Profile = plain, opts: { related?: Episode[]; now?: number } = {}): Triage {
  const t = triageFor(e, profile, { now: NOW, ...opts });
  all.push({ name, t });
  return t;
}

const GO_NOW = "请现在就去急诊，或拨打 120";
const GO_TODAY = "建议今天去看医生";
const GO_SOON = "建议这几天去看医生";
const WAIT = "可以先观察";
const WAIT_NOTE = "两三天不见好，或者加重了，就去看医生。";
const BEFORE_GOING = "去之前把这次的情况给医生看。要是突然加重，或者出现喘不上气、神志不清，马上去急诊。";

/* ---------- emergency: a danger signal in anything the patient said ---------- */
let t = triage("chest pain with breathlessness", ep("胸口痛，喘不上气"));
check("chest pain with breathlessness is an emergency", t.level === "emergency" && t.title === GO_NOW && t.department === "急诊", t);
check("the note is the rule's own alarm, word for word", t.note === instantAlert("胸口痛，喘不上气")?.text && t.note.includes("120"), t.note);
t = triage("low glucose", ep("刚才散步回来手抖出汗，测了血糖 3.4"));
check("a glucose of 3.4 said in passing is an emergency, with what to do right now", t.level === "emergency" && t.department === "急诊" && t.note.includes("15 克"), t);
t = triage("danger said later", later(ep("肚子痛，昨晚开始的", { began: 1 }), "现在痛得受不了", 0));
check("a danger signal in a later sentence counts too", t.level === "emergency" && t.note.includes("急诊"), t);
t = triage("convulsion", ep("孩子刚才抽搐了一下"));
check("a convulsion is an emergency", t.level === "emergency" && t.note.includes("120"), t);
t = triage("black stool on record only", { ...ep("肚子不舒服"), entries: [{ id: "n0", at: iso(0), severity: null, note: "今天早上大便是黑色的，像柏油一样", location: null, source: "ai" }] });
check("a danger signal that is only in the notes on record counts too", t.level === "emergency", t);
t = triage("negated danger", ep("没有胸痛，也不发烧，就是肚子不舒服"));
check("a danger signal that was denied raises nothing", t.level === "watch" && t.department === "消化内科", t);

/* ---------- today: 38.5 or more, worse than last time, 非常难受 ---------- */
t = triage("fever 38.6", ep("发烧，昨天开始的，烧到38.6度", { began: 1, temp: 38.6 }));
check("a temperature of 38.6 means today, at the fever clinic", t.level === "today" && t.title === GO_TODAY && t.department === "发热门诊" && t.note === `体温到过 38.6℃。${BEFORE_GOING}`, t);
t = triage("fever only in the words", ep("拉肚子，今天量体温38.6度"));
check("a temperature that is only in the patient's words counts", t.level === "today" && t.department === "发热门诊", t);
t = triage("fever 38.2", ep("发烧，昨天开始的，烧到38.2度", { began: 1, temp: 38.2 }));
check("38.2 does not", t.level === "watch" && t.department === "呼吸内科", t);
const belly = ep("肚子痛，昨天开始的，比较难受", { began: 1, severity: 6 });
t = triage("calm second day", belly);
check("the second day of a stomach ache is watched", t.level === "watch" && t.title === WAIT && t.note === WAIT_NOTE && t.department === "消化内科", t);
const tappedWorse = answerCheckIn(belly, "worse", NOW).episode;
t = triage("tapped worse", tappedWorse);
check("a one-tap 更严重了 means today", t.level === "today" && t.title === GO_TODAY && t.note === `比上一次重了。${BEFORE_GOING}`, t);
t = triage("tapped worse, nothing scored", answerCheckIn(ep("肚子痛"), "worse", NOW).episode);
check("更严重了 counts when no degree was ever said", t.level === "today", t);
t = triage("typed worse", later(ep("肚子痛，昨天开始的", { began: 1 }), "比昨天更严重了", 0, { noted: false }));
check("a short typed 'it got worse' means today", t.level === "today", t);
t = triage("trigger wording", later(ep("肚子痛，昨天开始的", { began: 1 }), "吃完饭更痛，比之前厉害了一些还伴有反酸，想问问要不要注意饮食", 0, { noted: false }));
check("a long sentence about what sets it off is not 'worse'", t.level === "watch", t);
t = triage("scored higher", later(ep("头痛，昨天开始的，有点难受", { began: 1, severity: 3 }), "今天比较难受", 0, { severity: 6 }));
check("a higher estimate than last time means today", t.level === "today" && t.department === "神经内科", t);
t = triage("better after worse", answerCheckIn(tappedWorse, "better", NOW + DAY).episode, plain, { now: NOW + DAY });
check("好多了 after 更严重了 is no longer 'today'", t.level === "watch", t);
t = triage("very unwell", ep("头晕，今天早上开始的，非常难受", { began: 0, severity: 8 }));
check("非常难受 means today", t.level === "today" && t.note === `你说现在很难受。${BEFORE_GOING}` && t.department === "神经内科", t);

/* ---------- these few days: not getting better, needed a doctor before, a standing condition ---------- */
t = triage("three days", ep("嗓子疼了三天了，咽东西的时候特别疼", { began: 3 }));
check("three days without getting better means these few days", t.level === "soon" && t.title === GO_SOON && t.note === `已经 3 天了还没见好。${BEFORE_GOING}` && t.department === "呼吸内科", t);
t = triage("two days", ep("嗓子疼了两天了，咽东西的时候特别疼", { began: 2 }));
check("two days is still watched", t.level === "watch", t);
t = triage("start never said, recorded 4 days ago", ep("腰疼，弯腰的时候更疼", { recorded: 4 }));
check("with no start given, the days since it was written down count, and are called that", t.level === "soon" && t.note === `记下来已经 4 天了，还没见好。${BEFORE_GOING}` && t.department === "骨科", t);
t = triage("resolved", ep("咳嗽，五天了", { began: 5, status: "resolved" }));
check("a complaint that is over is not 'still not better'", t.level === "watch", t);
const fresh = ep("胃不舒服，反酸");
const earlierSeen = seenDoctor(ep("胃痛", { began: 90, status: "resolved" }), 88);
const earlierUnseen = ep("胃痛", { began: 90, status: "resolved" });
t = triage("needed a doctor before", fresh, plain, { related: [earlierSeen] });
check("something similar that needed a doctor before means these few days", t.level === "soon" && t.note === `以前有过类似的情况，那次去看了医生。${BEFORE_GOING}`, t);
check("the earlier diagnosis is not repeated", !t.note.includes("胃炎") && !t.title.includes("胃炎"), t);
t = triage("similar before, no doctor then", fresh, plain, { related: [earlierUnseen] });
check("something similar that went away by itself changes nothing", t.level === "watch", t);
t = triage("diabetes and a foot", ep("脚上有个伤口，今天发现的"), chronic);
check("with diabetes on file, a wound on the foot means these few days", t.level === "soon" && t.note === `结合你档案里的情况，这类不舒服早点让医生看看。${BEFORE_GOING}`, t);
t = triage("a foot, nothing on file", ep("脚上有个伤口，今天发现的"));
check("without it, the same wound is watched", t.level === "watch", t);
t = triage("high blood pressure and dizziness", ep("头晕，今天早上开始的"), chronic);
check("with high blood pressure on file, dizziness means these few days", t.level === "soon" && t.department === "神经内科", t);
t = triage("high blood pressure and a sore throat", ep("喉咙痛，昨晚开始的", { began: 1 }), chronic);
check("a sore throat has nothing to do with either", t.level === "watch", t);
t = triage("麻烦 is not 麻", ep("嗓子疼，麻烦帮我记一下"), chronic);
check("麻烦 is not numbness", t.level === "watch", t);
t = triage("denied dizziness", ep("喉咙痛，没有头晕"), chronic);
check("dizziness that was denied does not count", t.level === "watch", t);

/* ---------- wait and see ---------- */
t = triage("sore throat since last night", ep("喉咙痛，昨晚开始的", { began: 1 }));
check("a sore throat since last night is watched", t.level === "watch" && t.title === WAIT && t.note === WAIT_NOTE && t.department === "呼吸内科", t);
t = triage("a headache", ep("头痛"));
check("a headache just noted is watched", t.level === "watch" && t.department === "神经内科", t);

/* ---------- after a visit to the doctor ---------- */
const worseBefore = later(ep("肚子痛，前天开始的，比较难受", { began: 2, severity: 5 }), "吃完饭更痛了", 1, { severity: 7 });
t = triage("worse, not seen", worseBefore);
check("worse than last time, before any visit: today", t.level === "today" && t.title === GO_TODAY, t);
const seen = seenDoctor(worseBefore, 0);
t = triage("seen this morning", seen);
check("what was said before the visit, the doctor has dealt with", t.level === "watch" && t.title === WAIT && t.note === "先按医生说的做。两三天不见好，或者加重了，就再去看医生。", t);
t = triage("worse after the visit", answerCheckIn(seen, "worse", NOW).episode);
check("worse after the visit: go back, not 'go today'", t.level === "today" && t.title === "建议再去看一次医生" && t.note.startsWith("比上一次重了。"), t);
t = triage("four days after the visit", seenDoctor(ep("咳嗽，一个星期了", { began: 7, recorded: 5 }), 4, 15));
check("four days after the visit and still not well: go back these few days", t.level === "soon" && t.title === "建议这几天再去看一次医生" && t.note === `看完医生 4 天了还没好。${BEFORE_GOING}` && t.department === "呼吸内科", t);
const feverSeen = seenDoctor(ep("发烧，前天开始的，烧到38.9度", { began: 2, temp: 38.9 }), 1, 15);
t = triage("fever before the visit", feverSeen);
check("a fever from before the visit does not send anyone back", t.level === "watch" && t.department === "呼吸内科", t);
t = triage("fever again after the visit", later(feverSeen, "又烧起来了，38.6度", 0, { temp: 38.6 }));
check("a fever after the visit does", t.level === "today" && t.title === "建议再去看一次医生" && t.department === "发热门诊" && t.note.startsWith("体温到过 38.6℃。"), t);
const painSeen = seenDoctor(ep("肚子痛，痛得受不了", { began: 1 }), 0);
t = triage("danger before the visit", painSeen);
check("a danger signal from before the visit is not raised again", t.level === "watch", t);
t = triage("danger after the visit", later(painSeen, "又痛得受不了了", 0));
check("a danger signal after the visit is an emergency", t.level === "emergency" && t.title === GO_NOW, t);

/* ---------- which department ---------- */
const DEPARTMENTS: [string, string | null][] = [
  ["头痛", "神经内科"],
  ["头有点晕，站起来的时候更晕", "神经内科"],
  ["心慌，心跳得很快", "心内科"],
  ["咳嗽两天了，有黄痰", "呼吸内科"],
  ["嗓子疼", "呼吸内科"],
  ["发烧，37.8", "呼吸内科"],
  ["发烧，烧到38.6度", "发热门诊"],
  ["肚子痛", "消化内科"],
  ["胃不舒服，反酸", "消化内科"],
  ["拉肚子", "消化内科"],
  ["恶心想吐", "消化内科"],
  ["右膝盖疼", "骨科"],
  ["腰疼", "骨科"],
  ["肩膀抬不起来", "骨科"],
  ["脚踝扭了一下", "骨科"],
  ["摔了一跤，手腕肿了", "骨科"],
  ["身上起疹子，很痒", "皮肤科"],
  ["尿频尿急", "泌尿外科"],
  ["右眼红了两天", "眼科"],
  ["耳朵疼", "耳鼻喉科"],
  ["鼻塞流鼻涕", "耳鼻喉科"],
  ["牙疼", "口腔科"],
  ["口渴，尿多，这两天血糖偏高", "内分泌科"],
  ["今天早上空腹血糖 9.8", "内分泌科"],
  // nothing to go by: no department is better than a guessed one
  ["浑身没力气", null],
  ["睡不着", null],
  ["腿疼，走多了就疼", null],
  // words that only look like a complaint
  ["吃了头孢还是疼", null],
  ["头发掉得厉害", null],
  ["我有糖尿病，这两天没精神", null],
  // what was denied does not decide
  ["没有头晕，就是咳嗽", "呼吸内科"],
  ["不发烧也不咳嗽，就是浑身没力气", null],
  // the complaint that was named first decides
  ["头痛，还有点恶心", "神经内科"],
  ["肚子痛，没有头晕", "消化内科"],
];
for (const [text, want] of DEPARTMENTS) {
  const got = triage(`department: ${text}`, ep(text));
  check(`「${text}」 goes to ${want ?? "no department"}`, got.department === want && got.level !== "emergency", got);
}
t = triage("keywords only", ep("不舒服", { tags: ["皮肤"] }));
check("when the words say nothing, the keywords on the record decide", t.department === "皮肤科", t);
t = triage("the limb keyword", ep("不舒服", { tags: ["四肢关节"] }));
check("the keyword put on every arm and leg decides nothing", t.department === null, t);

/* ---------- the two demo records ---------- */
const liBelly = li.episodes.find((e) => e.status === "active")!;
t = triage("demo: 李明 肚子痛", liBelly, li.profile!, { related: findSimilarEpisodes(li.episodes, liBelly, liBelly.id) });
check("李明's stomach ache, worse at the last check-in: today, 消化内科", t.level === "today" && t.title === GO_TODAY && t.department === "消化内科", t);
const liCold = li.episodes.find((e) => e.title === "感冒发烧")!;
t = triage("demo: 李明 感冒发烧", liCold, li.profile!);
check("李明's old cold was seen by a doctor: its fever sends nobody back", liCold.visit != null && t.level !== "today" && t.level !== "emergency", t);
const numb = wang.episodes.find((e) => e.title === "脚麻")!;
t = triage("demo: 王秀兰 脚麻", numb, chronic);
check("王秀兰's numb feet, worse at the last check-in: today, and no department is guessed", t.level === "today" && t.department === null, t);
// the same record before that last answer
const numbBefore: Episode = { ...numb, entries: numb.entries.slice(0, -1), messages: numb.messages.filter((m) => !m.content.includes("更严重了")) };
t = triage("demo: 王秀兰 脚麻, before the last answer", numbBefore, chronic);
check("before it got worse they had gone on for weeks: these few days", t.level === "soon" && /^已经 \d+ 天了还没见好。/.test(t.note), t);
const thirst = wang.episodes.find((e) => e.title.includes("口渴"))!;
check("王秀兰's thirst a year ago goes to 内分泌科", triage("demo: 王秀兰 口渴", thirst, chronic).department === "内分泌科");
const bloated = wang.episodes.find((e) => e.title.includes("肚子胀"))!;
check("her bloating goes to 消化内科", triage("demo: 王秀兰 肚子胀", bloated, chronic).department === "消化内科");

/* ---------- every card: only what to do ---------- */
const LEVELS = ["emergency", "today", "soon", "watch"] as const;
for (const level of LEVELS) check(`at least two cards at level ${level}`, all.filter((x) => x.t.level === level).length >= 2, all.filter((x) => x.t.level === level).length);
const TITLES = new Set([GO_NOW, GO_TODAY, GO_SOON, WAIT, "建议再去看一次医生", "建议这几天再去看一次医生"]);
check("every title is one of the six fixed ones", all.every((x) => TITLES.has(x.t.title)), all.filter((x) => !TITLES.has(x.t.title)));
const ROOMS = new Set(["急诊", "发热门诊", "神经内科", "心内科", "呼吸内科", "消化内科", "骨科", "皮肤科", "内分泌科", "泌尿外科", "眼科", "耳鼻喉科", "口腔科"]);
check("every department is from the table, or left out", all.every((x) => x.t.department === null || ROOMS.has(x.t.department)), all.filter((x) => x.t.department !== null && !ROOMS.has(x.t.department)));
for (const room of ROOMS) check(`the table reaches ${room}`, all.some((x) => x.t.department === room));
check("emergency always says 急诊, and only emergency does", all.every((x) => (x.t.level === "emergency") === (x.t.department === "急诊")));
// 急诊 and 门诊 are places and 急症 is the rules' word for "urgent": none of them names an illness
const words = (x: Triage) => `${x.title}\n${x.note}`.replace(/急诊|门诊|急症/g, "");
const NAMES_AN_ILLNESS = /炎|病|症|综合征|感染|癌|瘤/;
check("no card names an illness", all.every((x) => !NAMES_AN_ILLNESS.test(words(x.t))), all.filter((x) => NAMES_AN_ILLNESS.test(words(x.t))));
const GUESSES = /可能|也许|大概是|引起|导致|造成|因为|所致/;
check("no card guesses at a cause", all.every((x) => !GUESSES.test(words(x.t))), all.filter((x) => GUESSES.test(words(x.t))));
check("apart from the rules' own alarms, a card is short", all.filter((x) => x.t.level !== "emergency").every((x) => x.t.title.length <= 12 && x.t.note.length <= 80), all.filter((x) => x.t.level !== "emergency" && x.t.note.length > 80));
check("a default clock is used when none is passed", triageFor(ep("头痛"), plain).level === "watch");

finish("triage");
