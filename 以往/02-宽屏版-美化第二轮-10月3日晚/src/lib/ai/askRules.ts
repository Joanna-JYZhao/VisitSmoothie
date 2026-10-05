import type { AskRecord, AskRequest, AskResponse, Hint } from "../types";
import { NO_DIAGNOSIS, fmtDate } from "../utils";
import { inChinese } from "../lang";
import { instantAlert } from "./fallback";

/*
 * 问医伴 without a model. Questions that only ask for something on file ("上次医生说了什么")
 * are answered here by quoting the record, word for word: nothing can be misremembered and the
 * answer is instant. The same rules answer everything they can when no model is available.
 */

/**
 * A date in Chinese, whatever language the interface is in. For now 问医伴 answers in Chinese
 * only, and a Chinese sentence with "Jul 2" in the middle of it reads like a fault.
 */
export function zhDate(...args: Parameters<typeof fmtDate>): string {
  return inChinese(() => fmtDate(...args));
}

const time = (iso: string) => new Date(iso).getTime() || 0;
const day = (iso: string) => (iso ? zhDate(iso.length <= 10 ? `${iso}T12:00:00` : iso, { year: new Date(iso).getFullYear() !== new Date().getFullYear() }) : "");
const stop = (s: string) => s.replace(/[。.；;，,\s]+$/, "");
const newestFirst = (a: AskRecord, b: AskRecord) => time(b.date) - time(a.date);
const isVisit = (r: AskRecord) => r.kind === "visit" || r.kind === "followup";
/** "7月2日（约 3 个月前）": the date of a record, with how long ago that was when the device worked it out. */
const dated = (r: AskRecord) => `${day(r.date)}${r.fields?.ago ? `（${r.fields.ago}）` : ""}`;

/** The newest doctor visit on file, whichever way it was recorded. */
export function latestVisit(records: AskRecord[]): AskRecord | null {
  return records.filter(isVisit).sort(newestFirst)[0] ?? null;
}

/** What the doctor said at one visit, quoted from the record. */
export function visitAnswer(r: AskRecord): string {
  const f = r.fields ?? {};
  const L: string[] = [`最近一次看医生是 ${dated(r)}${f.where ? `，在${f.where}` : ""}${f.reason ? `（${f.reason}）` : ""}。`];
  if (f.diagnosis && f.diagnosis !== NO_DIAGNOSIS) L.push(`医生的诊断：${stop(f.diagnosis)}。`);
  // what is saved when a visit had no test results to speak of (see after.ts)
  if (f.findings && f.findings !== "没有记录检查结果") L.push(`检查结果：${stop(f.findings)}。`);
  L.push(f.treatment && f.treatment !== "没有开药" ? `开的药和处理：${stop(f.treatment)}。` : "这次没有开药。");
  if (f.advice) L.push(`医生叮嘱：${stop(f.advice)}。`);
  if (f.followUp) L.push(`复查：${stop(f.followUp)}。`);
  return L.join("\n");
}

/* ---------- medicines ---------- */

/**
 * The name of a medicine without how it is taken: "二甲双胍缓释片 1.5g 每日一次" gives
 * "二甲双胍缓释片". Records are written the way people talk, so the name may sit behind a verb
 * ("维持二甲双胍缓释片") or behind the medicine it replaced ("二甲双胍片改为二甲双胍缓释片").
 */
export function medicineName(line: string): string {
  // after a change, what is taken now is what comes last
  const now = line.trim().split(/改为|改成|换成|换为|改用|换用/).pop() ?? "";
  return now
    .replace(/^(继续|维持|加用|加了|开了|停用|停掉|停了|予以?|给予|口服|外用|服用|使用)+/, "")
    .split(/[\s，,（(：:、+]|由|从|每|一[天日]|\d|加量|减量|加到|减到|剂量|用量/)[0]
    .trim();
}

/** The medicine itself, without its dosage form: "二甲双胍缓释片" and "二甲双胍片" are both "二甲双胍". */
export function medicineCore(name: string): string {
  const core = name.replace(/(缓释|肠溶|分散|咀嚼|控释|泡腾|口崩)?(软胶囊|胶囊|颗粒|滴丸|片|丸|散|口服液|注射液)$/, "");
  return core.length >= 2 ? core : name;
}

const LOOKS_LIKE_MEDICINE =
  /片$|胶囊|颗粒|丸$|散$|口服液|糖浆|喷雾|软膏|乳膏|凝胶|滴眼液|滴剂|注射液|栓$|素|芬|唑|坦|地平|洛尔|普利|汀|胍|林$|酮$|头孢|沙星|替丁|胺$|定$|松$|灵$|宁$|酯$/;
/** Things done on the spot, tests and advice. Some of them contain 片 or 定 and are still not medicines. */
const NOT_MEDICINE =
  /拍.{0,3}片|[胸光]片|片子|切片|涂片|因素|毒素|尿素|色素|固定|稳定|复位|缝|包扎|输液|雾化|理疗|针灸|推拿|按摩|[热冷]敷|吸氧|洗胃|手术|拔牙|补牙|石膏|换药|清创|引流|抽血|化验|检查|观察|休息|饮水|喝水|饮食|锻炼|运动|散步|复查|复诊|随访|监测|测量|自测|方案/;

export interface MedicineOnFile {
  name: string;
  core: string;
  /** the line that says how the doctor wanted it taken, as written */
  line: string;
  source: AskRecord | null;
}

/** Every medicine on file with the line that says how the doctor wanted it taken, newest first. */
export function medicinesOnFile(req: Pick<AskRequest, "profile" | "records">): MedicineOnFile[] {
  const out: MedicineOnFile[] = [];
  const seen = new Set<string>();
  const profileRecord = req.records.find((r) => r.kind === "profile") ?? null;
  const add = (line: string, source: AskRecord | null, known: boolean) => {
    const name = medicineName(line);
    if (name.length < 2 || NOT_MEDICINE.test(name) || (!known && !LOOKS_LIKE_MEDICINE.test(name))) return;
    if (seen.has(`${name}|${source?.id ?? ""}`)) return;
    seen.add(`${name}|${source?.id ?? ""}`);
    out.push({ name, core: medicineCore(name), line: stop(line.trim()), source });
  };
  // newest prescription first: it is the one that applies now
  for (const r of req.records.filter((x) => isVisit(x) && x.fields?.treatment).sort(newestFirst)) {
    for (const piece of (r.fields?.treatment ?? "").split(/[；;]/)) add(piece, r, false);
  }
  // the profile's list is the person's own word that these are medicines
  for (const m of req.profile.medications) add(m, profileRecord, true);
  return out;
}

/** The medicines a text names, matched loosely ("二甲双胍" finds "二甲双胍缓释片"). */
export function medicineAsked(question: string, req: Pick<AskRequest, "profile" | "records">): MedicineOnFile[] {
  return medicinesOnFile(req).filter((m) => question.includes(m.name) || question.includes(m.core));
}

/* ---------- answers quoted from the record ---------- */

type Answer = Pick<AskResponse, "answer" | "sources">;
const ids = (records: (AskRecord | null | undefined)[]) => [...new Set(records.filter((r): r is AskRecord => r != null).map((r) => r.id))];

function lastVisitAnswer(req: AskRequest, lead = ""): Answer {
  const last = latestVisit(req.records);
  return last
    ? { answer: `${lead}${visitAnswer(last)}`, sources: [last.id] }
    : { answer: "记录里还没有看医生的记录。看完医生后点「看完医生了」，拍照或者说一遍，下次我就能告诉你。", sources: [] };
}

function allergyAnswer(req: AskRequest): Answer {
  const a = req.profile.allergies;
  const p = req.records.find((r) => r.kind === "profile");
  return {
    answer: a.length ? `档案里写着你对${a.join("、")}过敏。看病、开药的时候记得告诉医生和药师。` : "档案里没有记录过敏。如果你知道自己对什么过敏，可以在「我的档案」里加上。",
    sources: ids([p]),
  };
}

function followUpAnswer(req: AskRequest): Answer {
  const reminder = req.records.find((r) => r.kind === "reminder");
  if (reminder) return { answer: `${stop(reminder.text)}。`, sources: [reminder.id] };
  const withPlan = req.records.filter((r) => isVisit(r) && r.fields?.followUp).sort(newestFirst)[0];
  if (withPlan) {
    return { answer: `记录里没有定好日子的复查。${dated(withPlan)}看医生时，医生是这么说的：${stop(withPlan.fields?.followUp ?? "")}。`, sources: [withPlan.id] };
  }
  const last = latestVisit(req.records);
  return {
    answer: last ? `记录里没有提到复查。最近一次看医生是 ${dated(last)}，那次没有记下要不要复查。` : "记录里还没有看医生的记录，也没有约好的复查。",
    sources: ids([last]),
  };
}

function profileAnswer(req: AskRequest): Answer {
  const p = req.profile;
  const rec = req.records.find((r) => r.kind === "profile");
  if (!p.conditions.length && !p.medications.length && !p.allergies.length && !p.surgeries.length) {
    return { answer: "档案里还没有写老毛病、过敏和长期在吃的药。可以在「我的档案」里点「修改」补上。", sources: ids([rec]) };
  }
  const L = [
    `老毛病：${p.conditions.length ? p.conditions.join("、") : "档案里没有写"}。`,
    `长期在吃的药：${p.medications.length ? p.medications.join("、") : "档案里没有写"}。`,
    `过敏：${p.allergies.length ? p.allergies.join("、") : "档案里没有写"}。`,
  ];
  if (p.surgeries.length) L.push(`做过的手术：${p.surgeries.join("、")}。`);
  return { answer: L.join("\n"), sources: ids([rec]) };
}

const NO_LABEL = "说明书上的一般用法我现在查不了，具体看药盒里的说明书，或者问医生、药师。";

/** Where a line about a medicine was written: "4月14日（约 6 个月前）看医生时" or the profile. */
const writtenAt = (m: MedicineOnFile) => (m.source && m.source.kind !== "profile" ? `${dated(m.source)}看医生时` : "档案里");

/** One line for each medicine on file, taken from where it was last written down. */
function medicineList(all: MedicineOnFile[]): { lines: string[]; sources: string[] } {
  const seen = new Set<string>();
  const shown: MedicineOnFile[] = [];
  for (const m of all) {
    if (seen.has(m.core)) continue;
    seen.add(m.core);
    shown.push(m);
  }
  const where = (m: MedicineOnFile) => (m.source && m.source.kind !== "profile" ? [day(m.source.date), m.source.fields?.ago].filter(Boolean).join("，") : "档案里写的");
  return { lines: shown.slice(0, 6).map((m) => `· ${m.line}（${where(m)}）`), sources: ids(shown.slice(0, 6).map((m) => m.source)).slice(0, 4) };
}

/** The medicines being taken, as far as the record can say: the long-term list, and the last prescription with its date. */
function currentMedicinesAnswer(req: AskRequest): Answer {
  const all = medicinesOnFile(req);
  const p = req.profile.medications;
  const rec = req.records.find((r) => r.kind === "profile");
  const lastPrescribed = all.find((m) => m.source && m.source.kind !== "profile")?.source ?? null;
  if (!p.length && !lastPrescribed) {
    return { answer: "记录里没有你在吃的药。看完医生后在「看完医生了」里拍一下处方，我就记住了。", sources: ids([rec]) };
  }
  const L = [p.length ? `档案里「长期在吃的药」写的是：${p.join("、")}。` : "档案里没有写长期在吃的药。"];
  if (lastPrescribed) {
    L.push(`最近一次开药是 ${dated(lastPrescribed)}看医生时：${stop(lastPrescribed.fields?.treatment ?? "")}。`);
    if (!p.length) L.push("那是当时开的，现在还要不要吃，以医生说的为准。");
  }
  return { answer: L.join("\n"), sources: ids([rec, lastPrescribed]) };
}

const ASKS_ANY_MEDICINE = /(我的|这些|那些|所有|全部|现在的?|在吃的|开的|都有什么|有哪些|哪些|什么)药|药(都)?(怎么吃|有哪些|是什么)|吃(什么|哪些)药/;

function medicineAnswer(req: AskRequest): Answer {
  const all = medicinesOnFile(req);
  const asked = medicineAsked(req.question, req);
  if (asked.length) {
    const L: string[] = [];
    const used: (AskRecord | null)[] = [];
    let several = false;
    for (const core of [...new Set(asked.map((m) => m.core))].slice(0, 2)) {
      const mentions = asked.filter((m) => m.core === core);
      // newest first; older prescriptions are left out, because their doses may no longer hold
      const visits = mentions.filter((m) => m.source && m.source.kind !== "profile").slice(0, 2);
      const profile = mentions.find((m) => m.source?.kind === "profile");
      several ||= visits.length > 1;
      L.push(`记录里「${core}」是这样写的：`);
      visits.forEach((m, i) => L.push(`${i === 0 ? "最近一次" : "更早一次"}是 ${writtenAt(m)}：${m.line}。`));
      if (profile) L.push(`档案里「长期在吃的药」：${profile.line}。`);
      used.push(...visits.map((m) => m.source), profile?.source ?? null);
    }
    L.push(`${several ? "现在怎么吃，以最近一次医生说的为准。" : ""}${NO_LABEL}`);
    return { answer: L.join("\n"), sources: ids(used).slice(0, 4) };
  }
  if (!all.length) return { answer: `记录里没有你在吃的药。看完医生后在「看完医生了」里拍一下处方，我就记住了。\n${NO_LABEL}`, sources: [] };
  const specific = !ASKS_ANY_MEDICINE.test(req.question);
  const list = medicineList(all);
  return {
    answer: `${specific ? "记录里没有找到你问的这个药。记录里有的药是：" : "记录里有这些药："}\n${list.lines.join("\n")}\n${NO_LABEL}`,
    sources: list.sources,
  };
}

/** What a question calls a metric, and the lines of the metrics record that answer it. */
const METRIC_LABELS: [RegExp, string, string[]][] = [
  [/糖化/, "糖化血红蛋白", ["糖化血红蛋白"]],
  [/血糖/, "血糖", ["空腹血糖", "饭后或其他时间的血糖", "糖化血红蛋白", "低血糖记录"]],
  [/血压/, "血压", ["血压"]],
  [/体重/, "体重", ["体重"]],
];

/** The readings on file for the metric a question names, as the metrics record states them. */
function metricsAnswer(req: AskRequest): Answer | null {
  const m = req.records.find((r) => r.kind === "metrics");
  if (!m) return null;
  const parts = m.text.split("；").filter(Boolean);
  const want = METRIC_LABELS.find(([re]) => re.test(req.question));
  const picked = parts.filter((s) => (want ? want[2].some((label) => s.startsWith(`${label}：`)) : /^[^：]{2,12}：/.test(s)));
  if (!picked.length) {
    return { answer: `还没有记过${want ? want[1] : "这个数"}。可以在首页记一次，以后我就能告诉你。`, sources: [m.id] };
  }
  const note = parts.find((s) => s.startsWith("这些范围"));
  return { answer: [...picked, ...(note ? [note] : [])].map((s) => `${stop(s)}。`).join("\n"), sources: [m.id] };
}

function checkupAnswer(req: AskRequest): Answer {
  const c = req.records.filter((r) => r.kind === "checkup").sort(newestFirst)[0];
  if (!c) return { answer: "记录里没有体检报告。", sources: [] };
  const f = c.fields ?? {};
  const L = [`最近一次体检是 ${dated(c)}${f.where ? `，在${f.where}` : ""}。`];
  L.push(f.findings ? `报告上要留意的：${stop(f.findings)}。` : "报告上没有标出要留意的项目。");
  if (f.advice) L.push(`体检建议：${stop(f.advice)}。`);
  return { answer: L.join("\n"), sources: [c.id] };
}

/** An earlier complaint the question names ("上次胃痛是什么时候"), newest first. */
function episodeAsked(req: AskRequest): AskRecord | null {
  const q = req.question.replace(/疼/g, "痛");
  return (
    req.records
      .filter((r) => r.kind === "episode" && r.fields?.reason)
      .sort(newestFirst)
      .find((r) =>
        (r.fields?.reason ?? "")
          .replace(/疼/g, "痛")
          .split(/[、，,和\s]+/)
          .some((word) => word.length >= 2 && q.includes(word)),
      ) ?? null
  );
}

/* ---------- questions that ask for one thing on file, in so many words ---------- */

const POLITE = "(?:请问|麻烦问一?下|我想问一?下?|我想知道|帮我查一?下?|帮我看一?下?|你?告诉我)?";
const END = "(?:呢|呀|啊|吗)?[？?。！!]*$";
const WHEN = "(?:什么时候|啥时候|哪天|哪一天|几号|几月几号)";

const ASKS_LAST_VISIT = new RegExp(
  `^${POLITE}那?我?(?:上次|上回|上一次|最近一次|最近那次|前几天|那天)?我?去?(?:看病|看医生|去医院|在医院)?(?:的时候|时|那次)?[，,]?看?(?:医生|大夫)(?:上次|上回|那次)?[他她]?(?:跟我|和我|给我|对我)?(?:都|是|到底|又)?(?:怎么)?(?:说|讲|交代|叮嘱|嘱咐)[了过的]?[些点]?(?:什么|啥)?(?:了|来着)?${END}`,
);
const ASKS_FOLLOW_UP = new RegExp(
  [
    `^${POLITE}我?(?:下次|下一次|下回)?是?${WHEN}(?:要|该|得|需要|应该)?再?[去来]?(?:复查|复诊)${END}`,
    // "什么时候去医院" alone can also mean "how bad must it get": only "下次…" is a question about the appointment
    `^${POLITE}我?(?:下次|下一次|下回)是?${WHEN}(?:要|该|得|需要|应该)?再?去?(?:看医生|医院|看病)${END}`,
    `^${POLITE}我?还?(?:要不要|需不需要|用不用)再?去?(?:复查|复诊)${END}`,
    `^${POLITE}我?的?(?:下次|下一次|下回)?(?:复查|复诊)(?:是|在)?${WHEN}${END}`,
    `^${POLITE}我?的?(?:下次|下一次|下回)(?:看医生|看病|去医院)(?:是|在)?${WHEN}${END}`,
  ].join("|"),
);
const ASKS_ALLERGY = new RegExp(
  `^${POLITE}我?(?:对|有)?(?:什么|哪些|啥)(?:药物?|东西|食物)?过敏[的史]?${END}|^${POLITE}我(?:对什么|对哪些|有什么|有没有|有)(?:药物?|东西|食物)?过敏[的史]?${END}`,
);
const ASKS_PROFILE = new RegExp(
  `^${POLITE}我?都?有?(?:哪些|什么|啥)(?:老毛病|慢性病|病史|基础病)(?:和(?:在|长期)?吃的药)?${END}|^${POLITE}我?的?(?:老毛病|病史|档案)(?:有哪些|是什么|有什么|里都?[写记]了什么)${END}`,
);
const ASKS_MY_MEDICINES = new RegExp(`^${POLITE}我?(?:现在|目前|平时|长期)?都?在?[吃用](?:的是|着)?(?:哪些|什么|啥)药${END}|^${POLITE}我?(?:现在|目前|平时|长期)?(?:在吃|吃)的药?(?:有哪些|是什么|有什么)${END}`);
const ASKS_METRIC = new RegExp(
  `^${POLITE}我?(?:最近|近来|这段时间|现在|目前|上次|上一次|最近一次)?的?(?:空腹血糖|血糖|血压|体重|糖化血红蛋白|糖化)(?:控制得?|情况|水平)?(?:怎么样|如何|好不好|正常吗|正常不|高不高|高吗|低吗|是多少|多少|是几|几)了?${END}`,
);
const ASKS_CHECKUP = new RegExp(
  `^${POLITE}我?(?:上次|上一次|最近一次|最近)?的?体检(?:报告)?[上里]?都?有?(?:哪些|什么|啥)(?:要留意的?|要注意的?|问题|异常|不正常的?|毛病)${END}|^${POLITE}我?(?:上次|上一次|最近一次)?的?体检(?:报告|结果)?(?:怎么样|如何|说了什么)${END}`,
);

/**
 * Questions that ask for one thing on file, in so many words. These are answered by quoting the
 * record even when a model is available. Returns null for everything else.
 */
export function quickAnswer(req: AskRequest): Answer | null {
  // answers are Chinese for now, whatever the interface shows: nothing below may switch with it
  return inChinese(() => quoted(req));
}

function quoted(req: AskRequest): Answer | null {
  const q = req.question.trim().replace(/\s+/g, "");
  // "那医生怎么说" continues the turn before it and may mean another visit than the latest: not ours to guess
  if (/^那/.test(q) && req.history.length) return null;
  if (ASKS_LAST_VISIT.test(q)) return lastVisitAnswer(req);
  if (ASKS_FOLLOW_UP.test(q)) return followUpAnswer(req);
  if (ASKS_ALLERGY.test(q)) return allergyAnswer(req);
  if (ASKS_PROFILE.test(q)) return profileAnswer(req);
  if (ASKS_MY_MEDICINES.test(q)) return currentMedicinesAnswer(req);
  if (ASKS_CHECKUP.test(q)) return checkupAnswer(req);
  // without readings of their own, a visit may still have written the number down: leave that to a full answer
  if (ASKS_METRIC.test(q)) return metricsAnswer(req);
  return null;
}

/* ---------- danger signals ---------- */

/** Something in the past, or somebody's words: "上次…", "6 月那次…", "医生说…". */
const PAST_OR_QUOTED = /上次|上回|那次|那回|那天|以前|之前|当时|去年|前年|上个月|上周|上星期|\d+\s*月|(医生|大夫)(上次|上回)?(说|讲|叮嘱|交代|写)|记录里|病历上/;
/** The question ends by asking to have something looked up or explained. */
const ASKS_TO_LOOK_UP = /(什么意思|怎么回事|什么时候|什么时候的事|哪天|哪一天|多少|怎么处理的|怎么说的|说了什么)[？?。]*$/;
const HAPPENING_NOW = /现在|这会|刚|今天|今早|今晚|昨[天晚]|这[两几]天|这次|这回|最近(?!一次|那次)|目前|正在|又|还在|还是|一直|突然|忽然|怎么办|咋办|救/;

/**
 * What the question describes is an emergency, or a reading in the danger range. Decided by rule.
 *
 * A question may quote a danger signal without describing one: "上次医生说出现胸痛要复诊是什么意思",
 * "6 月那次血糖 3.6 是怎么回事". The alert is held back only when every part of the question that
 * would raise it is marked as past or quoted, the question asks for a look-up, and nothing in it
 * speaks of now. Anything short of that ("我胸痛，上次是什么时候") raises it.
 */
export function askAlert(question: string): Hint | null {
  // in Chinese like the answer it sits above, until 问医伴 answers in English too
  const alert = (text: string) => inChinese(() => instantAlert(text));
  const hint = alert(question);
  if (!hint) return null;
  const q = question.trim();
  if (!ASKS_TO_LOOK_UP.test(q) || HAPPENING_NOW.test(q)) return hint;
  const alarming = q.split(/[，。；！？,;!?]/).filter((clause) => alert(clause) != null);
  return alarming.length > 0 && alarming.every((clause) => PAST_OR_QUOTED.test(clause)) ? null : hint;
}

/* ---------- everything by rule ---------- */

/** The whole of 问医伴 by rule, for when no model can be reached. */
export function fallbackAsk(req: AskRequest): AskResponse {
  return inChinese(() => byRule(req));
}

function byRule(req: AskRequest): AskResponse {
  const hint = askAlert(req.question);
  const done = (a: Answer): AskResponse => ({ mode: "fallback", hint, ...a });
  const quick = quickAnswer(req);
  if (quick) return done(quick);
  const q = req.question;

  // The topic decides, most specific first. "上次" alone says nothing: "上次体检" is not "上次看医生".
  if (medicineAsked(q, req).length) return done(medicineAnswer(req));
  if (/过敏/.test(q)) return done(allergyAnswer(req));
  if (/血糖|血压|体重|糖化|指标/.test(q)) {
    return done(metricsAnswer(req) ?? { answer: "还没有记过血糖、血压这类数。在「我的档案」里打开「长期管理」，就可以在首页记了。", sources: [] });
  }
  if (/体检/.test(q)) return done(checkupAnswer(req));
  if (/复查|复诊|下次/.test(q)) return done(followUpAnswer(req));
  if (/药|怎么吃|怎么用|吃法|服用|剂量|饭前|饭后/.test(q)) return done(medicineAnswer(req));
  const episode = episodeAsked(req);
  if (episode) return done({ answer: `${episode.text.split("；").map(stop).filter(Boolean).join("。\n")}。`, sources: [episode.id] });
  if (/老毛病|病史|什么病|哪些病|档案|手术|家里人|家族|遗传/.test(q)) return done(profileAnswer(req));
  if (/医生|大夫|看病|医院|医嘱|诊断/.test(q) && latestVisit(req.records)) {
    return done(lastVisitAnswer(req, "这个问题我现在解释不了，先把最近一次看医生的记录念给你。\n"));
  }
  return done({
    answer: "这个问题我现在答不了。我能直接查到的是：上次医生说了什么、药是怎么开的、什么时候复查、对什么过敏、最近的血糖血压。可以换个问法试试。",
    sources: [],
  });
}
