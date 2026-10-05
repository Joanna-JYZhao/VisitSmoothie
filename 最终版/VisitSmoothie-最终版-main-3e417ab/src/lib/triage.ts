import type { Episode, Profile, Triage } from "./types";
import { extractTemperatures, instantAlert } from "./ai/fallback";
import { CHECKIN_ANSWERS } from "./checkin";
import { calendarDays, latestSeverityEntry, mentions, previousSeverityEntry } from "./utils";
import { L, getLang } from "./lang";

/*
 * 初步分诊: once the questions are answered, one card says whether to see a doctor, how soon, and
 * where to register. It is decided by rule from the record alone, with the judgements the rest of
 * the app already uses (danger signals, 38.5, "it got worse", three days without getting better).
 * It never names an illness and never guesses at a cause: it only says what to do.
 */

const time = (iso: string) => new Date(iso).getTime();

/** The first place `re` (a global one) matches without a negation right before it: "没有头晕" is no dizziness. */
function firstMention(text: string, re: RegExp): { at: number; length: number } | null {
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (mentions(text.slice(Math.max(0, at - 4), at + m[0].length), m[0])) return { at, length: m[0].length };
  }
  return null;
}

/* ---------- which department ---------- */

/** 头痛, 头有点晕: not 头孢 (a medicine) or 头发 */
const HEAD = "头(?![孢发])[^，。；、\\s]{0,3}?(?:痛|疼|晕|昏)";

/**
 * Where to register, by the words of the complaint. A word that points nowhere in particular
 * ("腿疼", "没力气", "睡不着") is left out on purpose: no department is better than a guessed one.
 */
const DEPARTMENTS: [string, RegExp][] = [
  ["神经内科", new RegExp(`${HEAD}|偏头|眩晕|天旋地转|脑袋.{0,2}(?:痛|疼|晕)`, "g")],
  ["心内科", /胸闷|胸口|心口|心慌|心悸|心跳/g],
  ["呼吸内科", /咳|嗓子|喉咙|咽|发烧|发热|低烧|高烧|感冒|气短|气喘|有痰/g],
  // 空腹 is when a reading was taken, not where it hurts
  ["消化内科", /肚子|肚脐|胃|(?<!空)腹|恶心|呕吐|想吐|吐了|反酸|烧心|便秘|打嗝|胀气/g],
  ["骨科", /膝|腰|肩|关节|扭|摔|脖子|颈椎|脚踝|手腕|骨头/g],
  ["皮肤科", /疹|痒|皮肤|风团|起包/g],
  ["内分泌科", /血糖|糖化|口渴|多尿|尿多|多饮/g],
  // 糖尿病 is a condition the patient has and 尿酸 a blood test, not a complaint about passing water
  ["泌尿外科", /(?<!糖)尿(?!病|酸)|小便/g],
  ["眼科", /眼睛|[左右双两]眼|眼.{0,2}(?:痛|疼|红|花|干|涩|痒|肿|屎)|视力|看不清/g],
  ["耳鼻喉科", /耳朵|耳鸣|耳.{0,2}(?:痛|疼|聋|闷)|听不清|鼻/g],
  ["口腔科", /牙|口腔|舌头|口疮/g],
];

/** The same departments by English words, for a conversation held in English. */
const DEPARTMENTS_EN: [string, RegExp][] = [
  ["神经内科", /\b(headache|head (hurts|aches|pain)|migraine|dizz|vertigo|spinning)\b/gi],
  ["心内科", /\b(chest|heart|palpitation|racing heart)\b/gi],
  ["呼吸内科", /\b(cough|throat|fever|cold|flu|breath|phlegm|wheez)\b/gi],
  ["消化内科", /\b(stomach|belly|abdomen|abdominal|tummy|nausea|vomit|heartburn|acid|constipat|diarrh|bloat)\b/gi],
  ["骨科", /\b(knee|back|lower back|shoulder|joint|sprain|fall|fell|neck|ankle|wrist|bone|hip)\b/gi],
  ["皮肤科", /\b(rash|itch|skin|hives|spots)\b/gi],
  ["内分泌科", /\b(blood sugar|glucose|thirst|thirsty)\b/gi],
  ["泌尿外科", /\b(urine|urinat|pee|bladder)\b/gi],
  ["眼科", /\b(eye|eyes|vision|blurr)\b/gi],
  ["耳鼻喉科", /\b(ear|ears|hearing|nose|sinus|tinnitus)\b/gi],
  ["口腔科", /\b(tooth|teeth|gum|mouth ulcer|tongue)\b/gi],
];
/** What a department is called on screen. */
const DEPARTMENT_EN: Record<string, string> = {
  神经内科: "Neurology", 心内科: "Cardiology", 呼吸内科: "Respiratory medicine", 消化内科: "Gastroenterology", 骨科: "Orthopaedics",
  皮肤科: "Dermatology", 内分泌科: "Endocrinology", 泌尿外科: "Urology", 眼科: "Ophthalmology", 耳鼻喉科: "ENT (ear, nose and throat)",
  口腔科: "Dentistry", 急诊: "Emergency department", 发热门诊: "Fever clinic",
};
const deptShown = (d: string | null) => (d ? L(d, DEPARTMENT_EN[d] ?? d) : d);

/** The department whose word comes first in the text; of two at the same place, the longer word. */
function departmentIn(text: string): string | null {
  let best: { name: string; at: number; length: number } | null = null;
  for (const [name, re] of [...DEPARTMENTS, ...(getLang() === "en" ? DEPARTMENTS_EN : [])]) {
    const found = firstMention(text, re);
    if (found && (!best || found.at < best.at || (found.at === best.at && found.length > best.length))) best = { name, ...found };
  }
  return best ? best.name : null;
}

/**
 * A keyword the tagging rules put on because a word merely contains its character: 泌尿 from the
 * 尿 in 糖尿病 or 尿酸. When the only such words in what was said are those, the keyword says nothing.
 */
const MISREAD: Record<string, { source: RegExp; not: RegExp }> = {
  泌尿: { source: /尿|小便/, not: /糖尿病|尿酸/g },
};
function misread(tag: string, words: string): boolean {
  const rule = MISREAD[tag];
  return rule != null && rule.source.test(words) && !rule.source.test(words.replace(rule.not, ""));
}

/**
 * The name of the complaint decides; then what the patient said, in the order it was said; then
 * the keywords. The keyword 四肢关节 is put on anything about an arm or a leg, so it says nothing here.
 */
function departmentFor(episode: Episode, said: string[]): string | null {
  const words = [episode.title, ...said].join("\n");
  const tags = episode.tags.filter((t) => t !== "四肢关节" && !misread(t, words)).join(" ");
  return departmentIn(episode.title) ?? departmentIn(said.join("\n")) ?? departmentIn(tags);
}

/* ---------- a standing condition that makes this complaint worth showing a doctor ---------- */

const STANDING: { condition: RegExp; complaint: RegExp }[] = [
  { condition: /糖尿病|血糖/, complaint: /脚|足[部底背跟趾尖弓]|[双两手]足|伤口|麻(?![烦将醉辣])/g },
  { condition: /高血压|血压高|心脏病|冠心病|心梗|心衰|房颤|心律|心肌/, complaint: new RegExp(`${HEAD}|胸闷|心慌|心悸`, "g") },
];

function touchesStanding(profile: Profile, about: string): boolean {
  return STANDING.some((s) => profile.conditions.some((c) => s.condition.test(c)) && firstMention(about, s.complaint) != null);
}

/* ---------- the wording: what to do, nothing else ---------- */

const BEFORE_GOING_BOTH = [
  "去之前把这次的情况给医生看。要是突然加重，或者出现喘不上气、神志不清，马上去急诊。",
  " Show the doctor what was written up. If it suddenly gets worse, or you have trouble breathing or feel confused, go to the emergency department right away.",
] as const;
/** as the rules for the conversation word it: a short answer that says it got worse */
const SAYS_WORSE = /更严重|加重了|更痛了|更难受|厉害了|\b(worse|getting worse)\b/i;
const WORSE_TAP = CHECKIN_ANSWERS.find((a) => a.key === "worse")?.label ?? "更严重了";

export function triageFor(episode: Episode, profile: Profile, opts: { related?: Episode[]; now?: number } = {}): Triage {
  const t = triageByRule(episode, profile, opts);
  // the department is decided by its Chinese name; it is shown in the language of the interface
  return { ...t, department: deptShown(t.department) };
}

function triageByRule(episode: Episode, profile: Profile, opts: { related?: Episode[]; now?: number } = {}): Triage {
  const BEFORE_GOING = L(...BEFORE_GOING_BOTH);
  const now = opts.now ?? Date.now();
  const visit = episode.visit ?? null;
  const seen = visit != null;

  // Everything the patient said about this complaint and everything noted down, oldest first.
  const items = [
    ...episode.messages.filter((m) => m.role === "user").map((m) => ({ at: time(m.at), text: m.content.replace(/^【定时记录】/, "").trim() })),
    ...episode.entries.map((e) => ({ at: time(e.at), text: e.note.trim() })),
  ]
    .filter((x) => x.text)
    .sort((a, b) => a.at - b.at);
  const all = Array.from(new Set(items.map((x) => x.text)));
  // What was said before a visit, the doctor has dealt with: after one, only what came since counts
  // towards "go now" and "go today" (the home card counts its days from the visit in the same way).
  const from = visit ? time(visit.recordedAt) : -Infinity;
  const since = Array.from(new Set(items.filter((x) => x.at >= from).map((x) => x.text)));

  /* 1. A danger signal in anything the patient said or anything on record: the rule's own words. */
  for (const text of [...since].reverse().concat(seen ? [] : [episode.title])) {
    const alarm = instantAlert(text);
    if (alarm) return { level: "emergency", title: L("请现在就去急诊，或拨打 120", "Go to the emergency department now, or call 120"), department: "急诊", note: alarm.text };
  }

  const temps = [
    ...episode.entries.filter((e) => time(e.at) >= from && e.temp != null).map((e) => e.temp as number),
    ...since.flatMap((t) => extractTemperatures(t)),
  ];
  const fever = temps.length ? Math.max(...temps) : null;
  const highFever = fever != null && fever >= 38.5;
  // with a temperature like that the fever clinic is where to go, whatever else is wrong (the conversation says the same)
  const department = highFever ? "发热门诊" : departmentFor(episode, all);

  /* 2. Today: 38.5 or more, worse than last time, or 非常难受. The same three things the conversation goes by. */
  const scored = latestSeverityEntry(episode);
  const latest = scored && time(scored.at) >= from ? scored : null;
  const before = previousSeverityEntry(episode);
  const lastTap = [...episode.entries].sort((a, b) => time(a.at) - time(b.at)).reverse().find((e) => e.source === "checkin" && time(e.at) >= from);
  const newest = since[since.length - 1] ?? "";
  const worse =
    (latest != null && before != null && (latest.severity ?? 0) > (before.severity ?? 0)) ||
    // a one-tap 更严重了 carries no score when there was none before it
    (lastTap != null && lastTap.note.startsWith(WORSE_TAP) && (scored == null || time(lastTap.at) >= time(scored.at))) ||
    newest.startsWith(WORSE_TAP) ||
    (newest.length <= 20 && SAYS_WORSE.test(newest));
  const veryUnwell = latest != null && (latest.severity ?? 0) >= 8;
  if (highFever || worse || veryUnwell) {
    const why = highFever
      ? L(`体温到过 ${fever}℃。`, `Your temperature reached ${fever} °C.`)
      : worse
        ? L("比上一次重了。", "It's worse than last time.")
        : L("你说现在很难受。", "You said it feels very bad now.");
    return { level: "today", title: seen ? L("建议再去看一次医生", "See a doctor again") : L("建议今天去看医生", "See a doctor today"), department, note: `${why}${BEFORE_GOING}` };
  }

  /* 3. These few days: it is not getting better, it needed a doctor before, or a standing condition makes it worth a look. */
  const active = episode.status === "active";
  if (visit) {
    const days = calendarDays(visit.recordedAt, now);
    if (active && days >= 3) {
      return {
        level: "soon",
        title: L("建议这几天再去看一次医生", "See a doctor again in the next few days"),
        department,
        note: L(`看完医生 ${days} 天了还没好。${BEFORE_GOING}`, `${days} days since the doctor and not better yet.${BEFORE_GOING}`),
      };
    }
    return { level: "watch", title: L("可以先观察", "You can wait and see"), department, note: L("先按医生说的做。两三天不见好，或者加重了，就再去看医生。", "Follow what the doctor said for now. If it's no better in two or three days, or gets worse, see the doctor again.") };
  }
  const days = calendarDays(episode.startedAt, now);
  // When the patient never said when it began, the day it was written down is the least it can be.
  const told = episode.startedAt !== episode.createdAt;
  const about = [episode.title, ...all, episode.tags.join(" ")].join("\n");
  const why =
    active && days >= 3
      ? told
        ? L(`已经 ${days} 天了还没见好。`, `${days} days now and not getting better.`)
        : L(`记下来已经 ${days} 天了，还没见好。`, `Noted ${days} days ago and not getting better.`)
      : (opts.related ?? []).some((r) => r.visit)
        ? L("以前有过类似的情况，那次去看了医生。", "Something like this happened before, and you saw a doctor then.")
        : touchesStanding(profile, about)
          ? L("结合你档案里的情况，这类不舒服早点让医生看看。", "With what's in your profile, it's best to have this looked at early.")
          : null;
  if (why) return { level: "soon", title: L("建议这几天去看医生", "See a doctor in the next few days"), department, note: `${why}${BEFORE_GOING}` };

  /* 4. Otherwise: wait and see. */
  return { level: "watch", title: L("可以先观察", "You can wait and see"), department, note: L("两三天不见好，或者加重了，就去看医生。", "If it's no better in two or three days, or gets worse, see a doctor.") };
}
