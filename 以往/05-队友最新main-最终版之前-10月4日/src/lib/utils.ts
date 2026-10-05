import type { AnnualFacts, AnnualSummary, DoctorSummary, Entry, Episode, Profile, RelatedEpisodeContext } from "./types";
import { L, getLang, inChinese } from "./lang";

// The one implementation lives in lang.ts. It is passed on here so that code which takes it from utils keeps working.
export { inChinese };

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const nowISO = () => new Date().toISOString();
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

export function hoursBetween(a: string | number | Date, b: string | number | Date = Date.now()) {
  return (new Date(b).getTime() - new Date(a).getTime()) / HOUR;
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const en = () => getLang() === "en";
const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
const pad = (n: number) => String(n).padStart(2, "0");

export function fmtDate(
  iso: string | Date,
  opts: { time?: boolean; year?: boolean; weekday?: boolean } = {},
) {
  const d = new Date(iso);
  const now = new Date();
  const { time = false, year = d.getFullYear() !== now.getFullYear(), weekday = false } = opts;
  if (getLang() === "en") {
    // "Sat, Oct 3, 2026 14:05": the parts appear only when asked for, as in Chinese
    let e = `${weekday ? `${WEEKDAYS_EN[d.getDay()]}, ` : ""}${MONTHS_EN[d.getMonth()]} ${d.getDate()}${year ? `, ${d.getFullYear()}` : ""}`;
    if (time) e += ` ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return e;
  }
  let s = `${year ? d.getFullYear() + "年" : ""}${d.getMonth() + 1}月${d.getDate()}日`;
  if (weekday) s += ` ${WEEKDAYS[d.getDay()]}`;
  if (time) s += ` ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return s;
}

export function fmtTime(iso: string | Date) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtISODate(iso: string | Date) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toLocalInputValue(iso: string | Date) {
  const d = new Date(iso);
  return `${fmtISODate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function relativeTime(iso: string, now: number = Date.now()) {
  const diff = now - new Date(iso).getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1) return en() ? "just now" : "刚刚";
  if (m < 60) return en() ? `${m} min ago` : `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return en() ? `${plural(h, "hour")} ago` : `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return en() ? `${plural(d, "day")} ago` : `${d} 天前`;
  return fmtDate(iso);
}

export function durationText(startIso: string, endIso?: string | null) {
  const h = hoursBetween(startIso, endIso ?? Date.now());
  if (h < 1) return en() ? "less than an hour" : "不到 1 小时";
  if (h < 24) return en() ? plural(Math.floor(h), "hour") : `${Math.floor(h)} 小时`;
  const d = Math.floor(h / 24);
  const rh = Math.floor(h - d * 24);
  if (en()) return rh > 0 && d < 7 ? `${plural(d, "day")} ${plural(rh, "hour")}` : plural(d, "day");
  return rh > 0 && d < 7 ? `${d} 天 ${rh} 小时` : `${d} 天`;
}

/** What a visit record says when the doctor gave no new diagnosis (a routine check-up, for instance). */
export const NO_DIAGNOSIS = "没有新的诊断";
/** What a visit record says under treatment when nothing was prescribed (written by treatmentText). */
const NO_MEDICINE = "没有开药";

/** A diagnosis as shown on screen. The stored value is data (it is compared in several places) and never changes. */
export function showDiagnosis(value: string): string {
  return value === NO_DIAGNOSIS ? L(NO_DIAGNOSIS, "No new diagnosis") : value;
}

/** The treatment line of a visit as shown on screen. As with the diagnosis, only the fixed value is put into words. */
export function showTreatment(value: string): string {
  return value === NO_MEDICINE ? L(NO_MEDICINE, "No medicine prescribed") : value;
}

/**
 * Whole calendar days from one moment to another (0 = the same day). Every "N 天" on every screen
 * is counted this way, so the card's "第 5 天", the reply's "已经 4 天了" and the doctor's
 * "约 4 天" always agree.
 */
export function calendarDays(startIso: string | number | Date, end: string | number | Date = Date.now()): number {
  const a = new Date(startIso);
  const b = new Date(end);
  return Math.round(
    (new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime() -
      new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()) /
      DAY,
  );
}

/** "不到 1 天" / "约 2 天" / "约 3 周": how long, without false precision. Used in what the doctor reads. */
export function roughDuration(startIso: string, endIso?: string | null) {
  const end = endIso ?? Date.now();
  // "今天下午开始的" is not "约 8 小时": under a day there is no honest number of hours to give
  if (hoursBetween(startIso, end) < 24) return en() ? "less than a day" : "不到 1 天";
  const d = Math.max(1, calendarDays(startIso, end));
  if (d < 14) return en() ? `about ${plural(d, "day")}` : `约 ${d} 天`;
  if (d < 60) return en() ? `about ${plural(Math.round(d / 7), "week")}` : `约 ${Math.round(d / 7)} 周`;
  return en() ? `about ${plural(Math.round(d / 30), "month")}` : `约 ${Math.round(d / 30)} 个月`;
}

/** Shortens a sentence for a one-line summary without cutting a number or a word in half. */
export function clipText(text: string, max = 24): string {
  const t = text.trim().replace(/[。.]$/, "");
  if (t.length <= max) return t;
  // prefer to stop at a comma that keeps most of the sentence
  const upTo = t.slice(0, max + 1);
  const comma = Math.max(upTo.lastIndexOf("，"), upTo.lastIndexOf("、"), upTo.lastIndexOf("；"), upTo.lastIndexOf(","));
  if (comma >= Math.floor(max / 2)) return `${t.slice(0, comma)}…`;
  // otherwise cut at the limit, but never inside a number ("37.8")
  let end = max;
  while (end < t.length && /[\d.]/.test(t[end]) && /[\d.]/.test(t[end - 1])) end++;
  return `${t.slice(0, end)}…`;
}

/** Bigram overlap of two short texts, 0 to 1. Good enough to tell "this says the same thing again". */
export function textOverlap(a: string, b: string): number {
  const grams = (x: string) => {
    const c = x.replace(/[，。、；：！？,.;:!?\s「」“”"]/g, "");
    const out = new Set<string>();
    for (let i = 0; i < c.length - 1; i++) out.add(c.slice(i, i + 2));
    return out;
  };
  const A = grams(a);
  const B = grams(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const x of A) if (B.has(x)) shared++;
  return shared / Math.min(A.size, B.size);
}

export function ageOf(birthYear: number) {
  return Math.max(0, new Date().getFullYear() - birthYear);
}

export function greeting(d = new Date()) {
  const h = d.getHours();
  if (en()) return h < 6 ? "It's late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  if (h < 6) return "夜深了";
  if (h < 11) return "早上好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

export type Tone = "neutral" | "good" | "warn" | "serious" | "danger";

/** How the user would say it. Used on patient-facing screens instead of a 0-10 number. */
export function feelWord(s: number | null | undefined): string {
  if (s == null) return "";
  if (s === 0) return "不难受了";
  if (s <= 3) return "有点难受";
  if (s <= 6) return "比较难受";
  return "非常难受";
}

/** The three answers offered when the assistant needs to know how bad it is. */
export const FEEL_OPTIONS: { label: string; score: number }[] = [
  { label: "有点难受", score: 3 },
  { label: "比较难受", score: 6 },
  { label: "非常难受", score: 8 },
];

const NEGATION_BEFORE = /(没有|没|无|不|未|别)[^，。；、\s]{0,2}$/;
/** where it is */
const PART =
  "偏头|头|肚子|肚脐|胃|小腹|腹部|胸口|胸|腰|后背|背|喉咙|嗓子|牙龈|牙|脖子|肩膀|肩|膝盖|关节|小腿|大腿|腿|脚踝|脚|手腕|手指|手|胳膊|眼睛|眼|耳朵|鼻子|舌头|嘴|脸|全身|浑身|身上";
/** words that sit between the place and the feeling: "肚子一直隐隐作痛", "腿有点发麻", "脸也肿了" */
const BETWEEN = "一直|总是|老是|还是|又|也|都|就|有点|有些|很|好|太|挺|特别|比较|非常|隐隐(?:作|地)?|一阵一阵地?|发|开始";
/** how it feels */
const FEEL = "绞痛|刺痛|胀痛|酸痛|隐痛|痛|疼|酸|麻|胀|肿|痒|晕|红|抖|僵|不舒服|难受";
const COMPLAINT = new RegExp(
  `(${PART})(?:里面?|这里|这儿|这块|那里)?(?:${BETWEEN}){0,3}(${FEEL})` +
    "|头晕|头昏|发烧|发热(?!门诊)|低烧|高烧|咳嗽|拉肚子|腹泻|恶心|呕吐|想吐|胸闷|心慌|心悸|心跳得?(?:很|特别|好)?快|失眠|睡不着|起疹子|皮疹|瘙痒|过敏|便秘|反酸|烧心|鼻塞|流鼻涕|流鼻血|打喷嚏|乏力|没力气|没劲|气短|气喘|喘不上气|喘不过气|尿频|尿急|尿痛|水肿|浮肿|耳鸣|看不清|眼花|口干|口渴|打嗝|胀气|没胃口|出冷汗|盗汗|怕冷|发冷|抽筋|痛经|嗓子哑|声音哑|便血|黑便",
  "g",
);
/** A place and, a little further on, that it hurts: "肩膀啊，抬不起来，一抬就疼". Only places that cannot be read as another word. */
const COMPLAINT_APART =
  /(肩膀|膝盖|脖子|肚子|嗓子|喉咙|眼睛|耳朵|后背|胸口|手腕|脚踝|小腿|大腿|胳膊|牙龈|腿|腰|脚|胃)[^。！？!?\n]{0,14}?(痛|疼|麻|肿|痒|胀)/g;

const negated = (text: string, at: number) => NEGATION_BEFORE.test(text.slice(Math.max(0, at - 4), at));
/** body part + how it feels, without the words in between; 疼 and 痛 are the same word here */
const partAndFeel = (part: string, feel: string) => `${part === "眼" ? "眼睛" : part}${feel === "疼" ? "痛" : feel}`;

/** The first complaint named in a sentence and not negated: "这两天肚子很痛" gives "肚子痛". */
export function firstComplaint(text: string): string | null {
  for (const m of text.matchAll(COMPLAINT)) {
    const at = m.index ?? 0;
    if (negated(text, at)) continue;
    // "对青霉素过敏" is part of the history, not what is wrong now
    if (m[0] === "过敏" && /对[^，,。；;]{1,10}$/.test(text.slice(Math.max(0, at - 12), at))) continue;
    if (m[1]) return partAndFeel(m[1], m[2]);
    return m[0].startsWith("心跳") ? "心跳快" : m[0];
  }
  for (const m of text.matchAll(COMPLAINT_APART)) {
    const feelAt = (m.index ?? 0) + m[0].length - 1;
    if (negated(text, m.index ?? 0) || negated(text, feelAt)) continue;
    return partAndFeel(m[1], m[2]);
  }
  return null;
}

const CLAUSE_BREAK = /[，,。！!？?；;\s]/;
/** A clause made of nothing but greetings and fillers: "医生你好", "哎呀医生啊", "我跟你说", "就是那个". */
const ONLY_FILLER =
  /^(哎呀?|哎哟|唉|嗯+|呃+|喂|那个|就是|这个|是这样的?|医生|大夫|你好|您好|请问|我跟你说|跟你说|我想问一下|我想问问|我想咨询一下|我想说一下|我说一下|麻烦你|麻烦您|帮我看看|帮我看一下|啊|呀|呢|吧|嘛|哈|哦)+$/;

/** What was said without the greeting it opened with: "医生你好，我这两天…" gives "我这两天…". */
export function stripOpening(text: string): string {
  let rest = text.trim();
  for (;;) {
    const cut = rest.search(CLAUSE_BREAK);
    if (cut < 0 || cut > 8 || !ONLY_FILLER.test(rest.slice(0, cut))) return rest;
    const next = rest.slice(cut).replace(/^[，,。！!？?；;\s]+/, "");
    if (!next) return rest;
    rest = next;
  }
}

/** An opening clause that cannot serve as a name: it is about someone, a time or a length of time, or trails off. */
const NOT_A_NAME =
  /^(没有?|不|无|我|你|他|她|这|那|就|还|又|也|最近|今天|昨天|前天|刚才|上周|从)|(不|没)(太|怎么|是很)?(疼|痛|酸|麻|胀|肿|痒|晕)|[\d一二两三四五六七八九十半几]+\s*个?多?(小时|天|周|星期|礼拜|月|年)|[了啊呀呢吧嘛]$/;

function nameFrom(text: string): { title: string; sure: boolean } {
  const clauses = stripOpening(text).split(CLAUSE_BREAK).filter(Boolean);
  const first = clauses[0] ?? "";
  // a short opening that is the complaint itself stays as it was said ("喉咙痛", "胃不舒服")
  if (first && first.length <= 6 && !NOT_A_NAME.test(first) && !ONLY_FILLER.test(first)) return { title: first, sure: true };
  const named = firstComplaint(text);
  if (named) return { title: named, sure: true };
  // nothing recognisable: the opening words, without "我这个…啊"
  const plain = first.replace(/^(我的?|我这个?|我家|这个|那个|就是|最近|这两天|这几天)+/, "").replace(/[了啊呀呢吧嘛]+$/, "");
  return { title: (plain || first).slice(0, 8) || "不舒服", sure: false };
}

/**
 * A working title for a new symptom, taken from the first thing the user said. A short opening
 * ("喉咙痛") is the title as it stands. A long spoken description rarely opens with the
 * complaint ("医生你好，我这两天…"), so there the first complaint named is used instead.
 */
export function provisionalTitle(text: string): string {
  return nameFrom(text).title;
}

/** True when no complaint could be picked out and the working title is only the opening words. */
export function titleIsGuess(text: string): boolean {
  return !nameFrom(text).sure;
}

export function severityLabel(s: number | null | undefined): string {
  if (s == null) return "未评分";
  if (s === 0) return "无不适";
  if (s <= 3) return "轻微";
  if (s <= 6) return "中等";
  if (s <= 8) return "严重";
  return "剧烈";
}

export function severityTone(s: number | null | undefined): Tone {
  if (s == null) return "neutral";
  if (s <= 3) return "good";
  if (s <= 6) return "warn";
  if (s <= 8) return "serious";
  return "danger";
}

export function clampSeverity(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.min(10, Math.max(0, Math.round(n)));
}

export function severitySeries(e: Pick<Episode, "entries">): Entry[] {
  return e.entries
    .filter((x) => x.severity != null)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

export function latestSeverityEntry(e: Pick<Episode, "entries">): Entry | null {
  const s = severitySeries(e);
  return s.length ? s[s.length - 1] : null;
}

export function previousSeverityEntry(e: Pick<Episode, "entries">): Entry | null {
  const s = severitySeries(e);
  return s.length > 1 ? s[s.length - 2] : null;
}

export function sortedEntries(e: Pick<Episode, "entries">, dir: "asc" | "desc" = "asc") {
  const arr = [...e.entries].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return dir === "asc" ? arr : arr.reverse();
}

/* ---------- keyword normalisation (body areas & symptom types) ---------- */

const AREA_KEYWORDS: Record<string, string[]> = {
  头部: ["头痛", "头疼", "头晕", "偏头", "脑袋", "头部", "头"],
  眼睛: ["眼睛", "眼", "视力"],
  耳鼻喉: ["耳朵", "耳", "鼻", "喉", "嗓子", "咽", "扁桃体"],
  口腔牙齿: ["牙", "口腔", "舌头", "口疮"],
  颈肩: ["脖子", "颈", "肩"],
  胸部: ["胸", "心口", "心慌", "心悸"],
  呼吸: ["咳", "喘", "痰", "呼吸", "气短", "憋气"],
  腹部: ["肚子", "腹", "胃", "肚", "肠", "肚脐"],
  消化: ["拉肚子", "腹泻", "恶心", "呕吐", "反酸", "烧心", "胀气", "便秘", "大便", "没胃口", "食欲"],
  腰背: ["腰", "背"],
  四肢关节: ["腿", "膝", "脚", "手", "胳膊", "手臂", "关节", "脚踝", "手腕"],
  皮肤: ["皮肤", "疹", "痒", "红肿", "起包", "荨麻"],
  发热: ["发烧", "发热", "高热", "低烧", "体温"],
  泌尿: ["尿", "小便"],
  睡眠情绪: ["失眠", "睡不着", "焦虑", "情绪", "乏力", "疲劳", "没精神"],
  过敏: ["过敏", "打喷嚏"],
  外伤: ["摔", "扭", "割伤", "撞"],
};

const SYMPTOM_KEYWORDS: Record<string, string[]> = {
  疼痛: ["痛", "疼"],
  头晕: ["晕"],
  咳嗽: ["咳"],
  发热: ["发烧", "发热", "高热", "低烧"],
  腹泻: ["拉肚子", "腹泻"],
  呕吐: ["吐"],
  恶心: ["恶心"],
  瘙痒: ["痒"],
  腹胀: ["胀"],
  乏力: ["乏力", "没力气", "疲劳"],
  失眠: ["失眠", "睡不着"],
  反酸: ["反酸", "烧心"],
  皮疹: ["疹", "起包"],
  鼻塞流涕: ["鼻塞", "流鼻涕"],
  咽痛: ["嗓子疼", "嗓子痛", "喉咙痛", "咽痛"],
  胸闷: ["胸闷", "憋"],
};

const NEGATION = /(没有|没|无|不|未|别)[^，。；、\s]{0,2}$/;

/** True when `word` appears in `text` at least once without a negation right before it ("没有吐" does not count). */
export function mentions(text: string, word: string): boolean {
  let from = 0;
  for (;;) {
    const i = text.indexOf(word, from);
    if (i < 0) return false;
    if (!NEGATION.test(text.slice(Math.max(0, i - 4), i))) return true;
    from = i + word.length;
  }
}

export function detectAreas(text: string): string[] {
  const out: string[] = [];
  for (const [area, words] of Object.entries(AREA_KEYWORDS)) {
    if (words.some((w) => mentions(text, w))) out.push(area);
  }
  return out;
}

export function detectSymptoms(text: string): string[] {
  const out: string[] = [];
  for (const [sym, words] of Object.entries(SYMPTOM_KEYWORDS)) {
    if (words.some((w) => mentions(text, w))) out.push(sym);
  }
  return out;
}

const LOCATION_PATTERNS: RegExp[] = [
  /肚脐(上|下|周围|旁边)?(方|面|边)?/,
  /(左|右)?(上|下)腹部?/,
  /(左|右)(胸|肩|腿|膝盖|脚踝|手腕|耳朵|眼睛|腰)/,
  /太阳穴|后脑勺?|额头|头顶|胸口|心口|后背|腰部?|胃部?|肚子|喉咙|嗓子|脖子|肩膀|膝盖|脚踝|手腕|小腿|大腿|牙/,
];

/** Picks a concrete body location out of free text, or null when none is named. */
export function extractLocation(text: string): string | null {
  for (const re of LOCATION_PATTERNS) {
    const m = text.match(re);
    if (m && mentions(text, m[0])) return m[0];
  }
  return null;
}

export function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export function autoTags(text: string, extra: string[] = []): string[] {
  return uniq([...detectAreas(text), ...detectSymptoms(text), ...extra]).filter(Boolean).slice(0, 6);
}

const STOP = new Set("的了有点很一些我不舒服一直还是感觉有些比较今天昨天最近又开始在是就都也和跟与痛疼".split(""));
/** Symptom-type tags that are too generic to link two episodes on their own. */
const GENERIC_TAGS = new Set(["疼痛", "乏力", "发热"]);
function charSet(s: string) {
  return new Set(s.split("").filter((c) => /[一-龥]/.test(c) && !STOP.has(c)));
}

export function similarityScore(
  a: { title: string; tags: string[] },
  b: { title: string; tags: string[] },
): number {
  const textA = `${a.title} ${a.tags.join(" ")}`;
  const textB = `${b.title} ${b.tags.join(" ")}`;
  const areasB = new Set(detectAreas(textB));
  const symptomsB = new Set(detectSymptoms(textB));
  const sharedAreas = detectAreas(textA).filter((x) => areasB.has(x)).length;
  const sharedSymptoms = detectSymptoms(textA).filter((x) => symptomsB.has(x)).length;
  let score = 0;
  // The same body area only counts together with the same kind of symptom:
  // shaky hands and numb feet are both "limbs" but are not the same problem.
  if (sharedAreas && sharedSymptoms) score += 3 * sharedAreas + 2 * sharedSymptoms;
  const bt = new Set(b.tags);
  for (const x of new Set(a.tags)) {
    if (bt.has(x) && !GENERIC_TAGS.has(x) && !areasB.has(x)) score += 2;
  }
  const ac = charSet(a.title);
  const bc = charSet(b.title);
  let common = 0;
  ac.forEach((c) => {
    if (bc.has(c)) common++;
  });
  if (common >= 2) score += 1;
  if (a.title && b.title && (a.title.includes(b.title) || b.title.includes(a.title))) score += 3;
  return score;
}

export function findSimilarEpisodes(
  episodes: Episode[],
  probe: { title: string; tags: string[] },
  excludeId?: string,
  limit = 3,
): Episode[] {
  return episodes
    .filter((e) => e.id !== excludeId)
    .map((e) => ({ e, s: similarityScore(probe, e) }))
    .filter((x) => x.s >= 3)
    .sort(
      (x, y) =>
        y.s - x.s || new Date(y.e.startedAt).getTime() - new Date(x.e.startedAt).getTime(),
    )
    .slice(0, limit)
    .map((x) => x.e);
}

/** An earlier record as context for the model and for the doctor's page. Generated text: Chinese whatever the interface says. */
export function toRelatedContext(e: Episode): RelatedEpisodeContext {
  // in English the page for the doctor is English, dates included; in Chinese it is built in Chinese as before
  return getLang() === "en" ? relatedContextOf(e) : inChinese(() => relatedContextOf(e));
}

function relatedContextOf(e: Episode): RelatedEpisodeContext {
  const first = sortedEntries(e)[0];
  const outcome =
    e.status === "resolved"
      ? L(`已好转${e.resolvedAt ? `（${fmtDate(e.resolvedAt)}）` : ""}`, `got better${e.resolvedAt ? ` (${fmtDate(e.resolvedAt)})` : ""}`)
      : e.visit
        ? L("已就医，还在跟踪中", "seen a doctor, still being followed")
        : L("还在跟踪中，尚未结束", "still being followed");
  const sep = L("。", ". ");
  return {
    title: e.title,
    date: fmtDate(e.startedAt, { year: true }),
    diagnosis: e.visit?.diagnosis,
    treatment: e.visit?.treatment,
    outcome: e.visit?.archiveSummary ? `${outcome}${sep}${e.visit.archiveSummary}` : `${outcome}${first ? `${sep}${L("主要表现：", "Mainly: ")}${first.note}` : ""}`,
  };
}

export function statusLabel(s: Episode["status"]) {
  return s === "active" ? L("跟踪中", "Tracking") : L("已好了", "Well now");
}

/**
 * One line for lists: what an episode came to. Only shown, and always after a date or a comma
 * ("6月30日 · 看过医生：…"), so the English starts in lower case.
 */
export function episodeLine(e: Episode): string {
  if (e.visit) {
    const noNew = e.visit.diagnosis === NO_DIAGNOSIS;
    return L(`看过医生：${e.visit.diagnosis}`, noNew ? "seen a doctor, no new diagnosis" : `seen a doctor: ${e.visit.diagnosis}`);
  }
  return e.status === "active" ? L("还在跟踪", "still tracking") : L("自己好了，没有看医生", "got better without seeing a doctor");
}

/** Who the patient is, on one line. Only shown; the texts that are copied out for the doctor ask for it in Chinese. */
export function profileLine(p: Profile) {
  if (getLang() === "en") {
    // the stored gender is data ("男" / "女" / "其他"); only what is shown is put into English
    const gender = p.gender === "男" ? "Male" : p.gender === "女" ? "Female" : p.gender === "其他" ? "Other" : p.gender;
    const shown = [p.name, gender, `${ageOf(p.birthYear)} years old`];
    if (p.heightCm) shown.push(`${p.heightCm} cm`);
    if (p.weightKg) shown.push(`${p.weightKg} kg`);
    if (p.bloodType) shown.push(`blood type ${p.bloodType}`);
    return shown.join(" · ");
  }
  const bits = [p.name, p.gender, `${ageOf(p.birthYear)} 岁`];
  if (p.heightCm) bits.push(`${p.heightCm} 厘米`);
  if (p.weightKg) bits.push(`${p.weightKg} 公斤`);
  if (p.bloodType) bits.push(`${p.bloodType} 型`);
  return bits.join(" · ");
}

/** The page for the doctor as plain text to copy, in the language of the interface (as the page itself is). */
export function summaryToText(summary: DoctorSummary, profile: Profile, episode: Episode) {
  if (getLang() === "en") return summaryTextEn(summary, profile, episode);
  return inChinese(() => summaryText(summary, profile, episode));
}

function summaryTextEn(summary: DoctorSummary, profile: Profile, episode: Episode) {
  const L: string[] = [];
  const level = (l: string) => (l === "urgent" ? "Urgent" : l === "warn" ? "Note" : "Info");
  const list = (items: string[], none: string) => (items.length ? items : [none]).forEach((x) => L.push(`- ${x}`));
  L.push("[VisitSmoothie · Summary for the doctor]");
  L.push(`Patient: ${profileLine(profile)}`);
  L.push(`Problem: ${episode.title} (since ${fmtDate(episode.startedAt, { year: true, time: true })})`);
  L.push(`Written: ${fmtDate(summary.generatedAt, { year: true, time: true })}`);
  if (summary.narrative) L.push("", "In the patient's words", summary.narrative);
  if (summary.glance?.length) {
    L.push("", "Read these first");
    summary.glance.forEach((g) => L.push(`- ${g}`));
  }
  L.push("", "1. Main complaint", summary.chiefComplaint);
  L.push("", "2. How it has gone", summary.presentIllness);
  L.push("", "3. Timeline");
  summary.timeline.forEach((t) => L.push(`- ${t.time}  ${t.event}`));
  L.push("", "4. How it is now", summary.currentStatus);
  L.push("", "5. History / allergies / medicines");
  list(summary.relevantHistory, "Nothing notable");
  L.push("", "6. Similar problems before");
  list(summary.priorSimilar, "None");
  L.push("", "7. Noted while organising (not a diagnosis)");
  summary.hints.forEach((h) => L.push(`- [${level(h.level)}] ${h.text}`));
  L.push("", "8. Questions for the doctor");
  summary.questionsForDoctor.forEach((q) => L.push(`- ${q}`));
  L.push("", "— Recorded by the patient and organised by VisitSmoothie. For the doctor's reference only; not a diagnosis.");
  return L.join("\n");
}

function summaryText(summary: DoctorSummary, profile: Profile, episode: Episode) {
  const L: string[] = [];
  const levelLabel = (l: string) => (l === "urgent" ? "紧急" : l === "warn" ? "注意" : "提示");
  L.push("【医伴 · 就医摘要】");
  L.push(`患者：${profileLine(profile)}`);
  L.push(`症状：${episode.title}（开始于 ${fmtDate(episode.startedAt, { year: true, time: true })}）`);
  L.push(`生成时间：${fmtDate(summary.generatedAt, { year: true, time: true })}`);
  if (summary.narrative) {
    L.push("");
    L.push("患者自述");
    L.push(summary.narrative);
  }
  if (summary.glance?.length) {
    L.push("");
    L.push("医生先看这几条");
    summary.glance.forEach((g) => L.push(`- ${g}`));
  }
  L.push("");
  L.push("一、主诉");
  L.push(summary.chiefComplaint);
  L.push("");
  L.push("二、现病史");
  L.push(summary.presentIllness);
  L.push("");
  L.push("三、症状时间线");
  summary.timeline.forEach((t) => L.push(`- ${t.time}  ${t.event}`));
  L.push("");
  L.push("四、当前状态");
  L.push(summary.currentStatus);
  L.push("");
  L.push("五、相关病史 / 过敏 / 用药");
  (summary.relevantHistory.length ? summary.relevantHistory : ["无特殊"]).forEach((h) => L.push(`- ${h}`));
  L.push("");
  L.push("六、既往类似记录");
  (summary.priorSimilar.length ? summary.priorSimilar : ["无"]).forEach((h) => L.push(`- ${h}`));
  L.push("");
  L.push("七、整理提示（非诊断）");
  summary.hints.forEach((h) => L.push(`- [${levelLabel(h.level)}] ${h.text}`));
  L.push("");
  L.push("八、建议向医生确认");
  summary.questionsForDoctor.forEach((q) => L.push(`- ${q}`));
  L.push("");
  L.push("—— 本摘要由患者本人记录、医伴 AI 整理，仅供医生参考，不构成诊断。");
  return L.join("\n");
}

/** Copies text to the clipboard, falling back to a hidden textarea when the async API is unavailable. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** The yearly summary as plain text to copy. Chinese whatever the interface says, like the single-illness one. */
export function annualToText(summary: AnnualSummary, profile: Profile, facts: AnnualFacts) {
  return inChinese(() => annualText(summary, profile, facts));
}

function annualText(summary: AnnualSummary, profile: Profile, facts: AnnualFacts) {
  const L: string[] = [];
  const levelLabel = (l: string) => (l === "urgent" ? "紧急" : l === "warn" ? "注意" : "提示");
  const list = (items: string[], empty = "无") => (items.length ? items : [empty]).forEach((x) => L.push(`- ${x}`));
  L.push("【医伴 · 年度摘要】");
  L.push(`患者：${profileLine(profile)}`);
  if (profile.conditions.length) L.push(`既往病史：${profile.conditions.join("、")}`);
  L.push(`过敏史：${profile.allergies.length ? profile.allergies.join("、") : "无"}`);
  if (profile.medications.length) L.push(`长期用药：${profile.medications.join("、")}`);
  L.push(`统计区间：${fmtDate(summary.periodStart, { year: true })} 至 ${fmtDate(summary.periodEnd, { year: true })}`);
  L.push(`生成时间：${fmtDate(summary.generatedAt, { year: true, time: true })}`);
  if (summary.glance?.length) {
    L.push("", "医生先看这几条");
    summary.glance.forEach((g) => L.push(`- ${g}`));
  }
  L.push("", "一、概括", summary.headline, summary.overview);
  L.push("", "二、目前需要医生关注");
  list(summary.currentConcerns);
  summary.hints.forEach((h) => L.push(`- [${levelLabel(h.level)}] ${h.text}`));
  L.push("", "三、指标趋势");
  list(summary.metricTrends.map((m) => `${m.name}：${m.trend}`));
  L.push("", "四、用药变化");
  list(summary.medicationChanges.map((m) => `${m.time}  ${m.change}`));
  L.push("", "五、重要事件");
  list(summary.keyEvents.map((m) => `${m.time}  ${m.event}`));
  L.push("", "六、规律与观察");
  list(summary.patterns);
  L.push("", "七、复诊记录");
  list(
    facts.followUps.map(
      (f) => `${f.date} ${[f.hospital, f.department].filter(Boolean).join(" ")}（${f.reason}）：${f.findings}；调整：${f.plan}`,
    ),
  );
  L.push("", "八、建议向医生确认");
  list(summary.questionsForDoctor);
  L.push("", "—— 本摘要由患者本人记录、医伴 AI 整理，仅供医生参考，不构成诊断。");
  return L.join("\n");
}

/** One line about how an earlier episode ended, for "similar records" lists. */
export function outcomeLine(e: Episode): string {
  if (e.visit) {
    return L(
      `诊断：${e.visit.diagnosis}；处理：${e.visit.treatment}`,
      `Diagnosis: ${showDiagnosis(e.visit.diagnosis)}; treatment: ${showTreatment(e.visit.treatment)}`,
    );
  }
  if (e.status === "resolved") return L("当时没有就医，自行好转", "Got better without seeing a doctor");
  return L("还在跟踪中", "Still tracking");
}
