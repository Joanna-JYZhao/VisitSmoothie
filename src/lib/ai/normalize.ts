import type {
  AfterMedication,
  AfterRequest,
  AfterResult,
  AnnualRequest,
  AnnualSummaryBody,
  ChatMeasurement,
  ChatRequest,
  ChatResponse,
  DoctorSummaryBody,
  Hint,
  MetricType,
  ProfileParseResponse,
  SummaryRequest,
} from "../types";
import { clampSeverity, provisionalTitle, textOverlap, uniq } from "../utils";
import { termAsked } from "../colloquial";
import {
  extractMeasurements,
  extractOnsetHours,
  extractTemperature,
  fallbackAfter,
  fallbackAnnual,
  fallbackChat,
  fallbackSummary,
  MAX_QUESTIONS,
  answerEntry,
  consultPlan,
  evasive,
  type ConsultStep,
  ownQuestions,
  ruleHints,
} from "./fallback";

export const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
export const strList = (v: unknown, max: number): string[] =>
  Array.isArray(v) ? uniq(v.map(str).filter(Boolean)).slice(0, max) : [];
const hasQuestion = (s: string) => /[?？]/.test(s);

export function normalizeHint(v: unknown): Hint | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const text = str(o.text);
  if (!text) return null;
  const level: Hint["level"] = o.level === "urgent" || o.level === "warn" ? o.level : "info";
  return { level, text };
}

/** Summaries are read at the appointment, so nothing in them is an emergency alert: cap at "warn". */
function documentHint(v: unknown): Hint | null {
  const h = normalizeHint(v);
  return h && h.level === "urgent" ? { ...h, level: "warn" } : h;
}

/** How many questions the assistant has asked since it last finished a round. */
export function askedInRound(messages: { role: string; content: string }[]): number {
  let n = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    if (!hasQuestion(m.content)) break;
    n++;
  }
  return n;
}

/* ---------- "don't ask me the same thing twice" ---------- */

/** The question a reply ends on, if any. */
export function questionOf(text: string): string | null {
  const sentences = text.split(/(?<=[。！!？?])/).map((x) => x.trim());
  const q = [...sentences].reverse().find((x) => /[？?]$/.test(x));
  return q ?? null;
}

/** What a question is about, with the filler that every question shares taken out. */
function questionCore(q: string): string {
  return q.replace(/[，。、；：！？,.;:!?\s「」“”"]/g, "").replace(/有没有|是不是|会不会|能不能|吗|呢|呀|现在|还|你|请问/g, "");
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

/** Questions that can only be asked once: however they are worded, they ask for the same single answer. */
function questionTopic(q: string): string | null {
  if (/多难受|难受还是|多严重|严重吗|厉害吗|有多(疼|痛)|几分|(有点|比较|非常)难受/.test(q)) return "severity";
  if (/什么时候开始|哪天开始|多久了|几天了|多长时间|开始多久/.test(q)) return "onset";
  if (/吃.{0,6}药|用.{0,4}药|服.{0,4}药/.test(q)) return "medicine";
  if (/哪个位置|哪个部位|哪里(疼|痛|不舒服)|哪边|具体位置/.test(q)) return "location";
  return null;
}

/** Is `now` the question `earlier` again, in the same or other words, or a narrower piece of it? */
function sameQuestion(now: string, earlier: string): boolean {
  const topic = questionTopic(now);
  if (topic && topic === questionTopic(earlier)) return true;
  const before = questionCore(earlier);
  // "记下了，有没有发烧？": the part after the last comma is the question itself
  const candidates = [now, now.split(/[，,]/).pop() ?? now];
  for (const c of candidates) {
    const core = questionCore(c);
    if (core.length < 2) continue;
    if (core === before) return true;
    // asking again about one part of what was already asked ("有没有发烧" after "有没有发烧或者别的难受")
    if (core.length < before.length && before.includes(core)) return true;
    const A = bigrams(core);
    const B = bigrams(before);
    if (A.size < 2 || B.size < 2) continue;
    let shared = 0;
    for (const x of A) if (B.has(x)) shared++;
    if (shared / Math.min(A.size, B.size) >= 0.5) return true;
  }
  return false;
}

/**
 * If the reply asks something the assistant already asked in this round of questions, returns the
 * earlier wording. People who answer off the point were being asked the same thing again and again.
 */
export function repeatedQuestion(reply: string, messages: { role: string; content: string }[]): string | null {
  const q = questionOf(reply);
  if (!q) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    const earlier = questionOf(m.content);
    if (!earlier) break; // the previous round ended there
    if (sameQuestion(q, earlier)) return earlier;
  }
  return null;
}

/** Last resort when the model insists on repeating itself: keep what it acknowledged, drop the question. */
export function withoutQuestion(res: ChatResponse): ChatResponse {
  const kept = res.reply
    .split(/(?<=[。！!？?])/)
    .map((x) => x.trim())
    .filter((x) => x && !/[？?]$/.test(x))
    .join("");
  return { ...res, reply: kept || "好，这些我先记下。", suggestedReplies: [], done: true, widget: null };
}

const lastUserText = (req: ChatRequest) =>
  ([...req.messages].reverse().find((m) => m.role === "user")?.content ?? "").replace(/^【定时记录】/, "").trim();
const firstUserText = (req: ChatRequest) => req.messages.find((m) => m.role === "user")?.content ?? "";

/**
 * The model answered in plain words instead of JSON. Its answer is usually exactly right, so keep it
 * as the reply and recover the structured parts (readings, danger signals, tags) by rule.
 */
export function salvageChat(text: string, req: ChatRequest): ChatResponse {
  const ruled = fallbackChat(req);
  let reply = withoutTestAdvice(withoutSpeculation(text.trim().slice(0, 400))) || "记下了。";
  // the question limit holds here too
  if (hasQuestion(reply) && (askedInRound(req.messages) >= MAX_QUESTIONS || evasive(req.messages))) {
    reply = `${withoutQuestion({ reply } as ChatResponse).reply.replace(/^好，这些我先记下。$/, "")}好了，我都记下了。`.replace(/(好了，我都记下了。)+/, "好了，我都记下了。");
  }
  return {
    mode: "glm",
    reply,
    entry: ruled.entry,
    tags: ruled.tags,
    suggestedReplies: [],
    hint: ruled.hint && ruled.hint.level !== "info" ? ruled.hint : null,
    measurements: ruled.measurements,
    title: ruled.title,
    onsetHoursAgo: ruled.onsetHoursAgo,
    done: !hasQuestion(reply),
  };
}

/**
 * Guessing at causes ("可能是颈椎问题", "血压波动会引起头晕") is diagnosis by another name.
 * Such sentences are taken out of what the assistant says; the question it asks is left alone.
 */
const SPECULATION = /可能(是|跟|和|与|为|由|因)|都可能|会引起|引起的|导致的|造成的|有关系|有关(。|，|$)/;

export function withoutSpeculation(text: string): string {
  const kept = text
    .split(/(?<=[。！!？?])/)
    .map((x) => x.trim())
    .filter((x) => x && (/[？?]$/.test(x) || !SPECULATION.test(x)));
  return kept.join("");
}

function plainHint(h: Hint | null): Hint | null {
  if (!h) return null;
  const text = withoutTestAdvice(withoutSpeculation(h.text));
  return text ? { ...h, text } : null;
}

/*
 * Suggesting a test ("顺便查一下血糖", "建议做个心电图") is the doctor's call, not ours. A question
 * about one ("最近测过血糖吗？") stays, and so does what a doctor already ordered ("医生让你复查血糖").
 * Advice to see a doctor or which department to go to is kept: only the clause with the test goes.
 */
const CHECK_ITEMS =
  "(?:血糖|血压|糖化|血常规|尿常规|血脂|尿酸|肝功能?|肾功能?|甲功|B超|彩超|超声|CT|核磁|磁共振|胃镜|肠镜|喉镜|心电图|脑电图|X光|胸片|拍片|片子|化验|抽血|验血|检查|体检)";
const CHECK_ADVICE = new RegExp(
  `(?<![不别没无])(?:查一下|查查|查个|查一查|做个|做一下|做一个|去做|去查|测一下|测测|测个|量一下|量量|检查一下|化验一下|拍个|拍一下|验一下|验个|抽个|建议(?:做|查|测|去)?|需要(?:做|查)|最好(?:做|查|测|去)?)[^，,。；;！!]{0,8}?${CHECK_ITEMS}|(?<![不别没无])(?:做|去|到医院)(?:个|一下|一次)?检查`,
  "i",
);
const RETEST = /再测|复测|分钟后/;
/** a doctor's own order, reported */
const DOCTOR_ORDERED = /(医生|大夫|医嘱)(说|让|叮嘱|交代|嘱咐|开了?|要求)/;

/** Takes clauses that suggest a test out of what the assistant says. Questions are left alone. */
export function withoutTestAdvice(text: string): string {
  if (!text) return text;
  // "去门诊检查" means seeing a doctor: said that way, it is kept as such
  const out = text
    .replace(/(门诊|医院|[^，,。\s]{1,4}科)(?:做个|做一下|做)?(?:检查|查查|查一下)(?:一下)?/g, "$1看看")
    .split(/(?<=[。！!？?])/)
    .map((sentence) => {
      if (/[？?]\s*$/.test(sentence) || !CHECK_ADVICE.test(sentence) || DOCTOR_ORDERED.test(sentence)) return sentence;
      // re-testing after a low reading is first aid, not a test to have done
      const clauses = sentence.split(/(?<=[，,；;])/).filter((c) => !CHECK_ADVICE.test(c) || RETEST.test(c));
      return tidySeams(clauses.join(""), sentence).replace(/^[，,；;]+/, "");
    })
    .filter((x) => x.trim() && !/^[。！!]+$/.test(x.trim()));
  return out.join("").replace(/^(同时|顺便|另外|再)[，,]?/, "");
}

/** Adds "没有" to the answers of a yes-or-no question that offers no way to say no. */
function finalNo(reply: string, answers: string[]): void {
  const q = questionOf(reply);
  if (!q || !answers.length || answers.length >= 4) return;
  if (!/有没有|吗[？?]$|过.{0,6}没/.test(q)) return;
  if (answers.some((a) => /没|不|无/.test(a))) return;
  answers.unshift(/药/.test(q) ? "没吃药" : "没有");
}

/** Words that make a title a diagnosis instead of a complaint. */
const NAMES_A_DISEASE = /炎|癌|瘤|综合征|感冒|流感|中风|脑梗|心梗|结石|溃疡|感染|骨折|扭伤|痛风|糖尿病|高血压|冠心病|哮喘|湿疹|荨麻疹|疱疹|过敏/;

export function normalizeChat(raw: unknown, req: ChatRequest): ChatResponse {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const reply = withoutTestAdvice(withoutSpeculation(str(o.reply))) || "记下了。";
  const said = lastUserText(req);
  const first = req.kind === "intake";

  // What the user stated outright is read by rule as well, so a slip of the model cannot lose it.
  const ruledTemp = extractTemperature(said);
  let entry: ChatResponse["entry"] = null;
  if (o.entry && typeof o.entry === "object") {
    const e = o.entry as Record<string, unknown>;
    const severity = clampSeverity(e.severity);
    const note = str(e.note);
    // A temperature is recorded only as the user said it: "38度多" is 38, never a guessed 38.5.
    const t = Number(e.temperature);
    const spoken = /三十[五六七八九]|四十/.test(said);
    const temperature = ruledTemp ?? (e.temperature != null && Number.isFinite(t) && t >= 34 && t <= 43 && spoken ? t : null);
    if (note || severity != null || temperature != null) {
      entry = {
        severity,
        // a score only counts as the user's own when a number is actually in what they said
        exact: severity != null && e.exact === true && /\d\s*(分|级|\/\s*10)/.test(said),
        temperature,
        note: note || said.slice(0, 40),
        location: str(e.location) || null,
      };
    }
  } else if (ruledTemp != null) {
    entry = { severity: null, exact: false, temperature: ruledTemp, note: said.slice(0, 40), location: null };
  }

  const tags = uniq([...strList(o.tags, 6), ...req.episode.tags]).slice(0, 6);
  // the model occasionally names this field "suggestedAnswers"
  // "都有" as an answer to "恶心、呕吐或者怕光？" records a symptom the user never had: no catch-all answers
  const suggestedReplies = strList(o.suggestedReplies ?? o.suggestedAnswers, 5)
    .filter((s) => s.length <= 12 && !/^(以上)?(全|都)+(有|是)$/.test(s))
    .slice(0, 4);
  const stated = normalizeMeasurements(o.measurements);
  const measurements = stated.length ? stated : extractMeasurements(said);

  // When it began: from the model if it heard one, otherwise by rule from the first sentence.
  const onsetRaw = Number(o.onsetHoursAgo);
  const onset =
    o.onsetHoursAgo != null && Number.isFinite(onsetRaw) && onsetRaw >= 0 && onsetRaw <= 24 * 365 * 3
      ? onsetRaw
      : first
        ? extractOnsetHours(firstUserText(req))
        : null;
  // A name for the complaint, never for a disease: "感冒" or "肠胃炎" is only kept when the user said it.
  const named = str(o.title).replace(/[。，,.]/g, "").slice(0, 8);
  const disease = named.match(NAMES_A_DISEASE)?.[0];
  const title = disease && !firstUserText(req).includes(disease) ? "" : named;

  // The assistant may ask at most seven questions in a row, four when the answers are only "嗯";
  // after that the round is closed for it.
  const asked = askedInRound(req.messages);
  const spent = asked >= MAX_QUESTIONS || evasive(req.messages);
  let done = o.done === true || !hasQuestion(reply) || spent;
  let finalReply = reply;
  let quick = done && !hasQuestion(reply) ? [] : suggestedReplies;
  // out of questions: whatever the model asked last is dropped, and the round is wrapped up
  if (spent && hasQuestion(reply)) {
    finalReply = withoutQuestion({ reply } as ChatResponse).reply.replace(/^好，这些我先记下。$/, "") || "好了，我都记下了。";
    if (!/记下了/.test(finalReply)) finalReply = `${finalReply}好了，我都记下了。`;
    quick = [];
  }

  // Whether to say "see a doctor today" is decided by rule, the same way every time. The model
  // may word it, but it cannot raise a warning the rules do not back: it used to urge a visit
  // after two answers, or just because a similar illness was on file.
  const modelHint = plainHint(normalizeHint(o.hint));
  const rules = ruleHints(req);
  let hint: Hint | null;
  // An alarm raised by the rules keeps the rules' own wording: it is already on the user's screen,
  // and a second version arriving three seconds later ("或去急诊" then "不要自行前往医院") is worse than none.
  if (rules.urgent) hint = rules.urgent;
  else if (modelHint?.level === "urgent") hint = modelHint;
  else if (rules.warn) hint = modelHint?.level === "warn" ? modelHint : rules.warn;
  else hint = modelHint ? { ...modelHint, level: "info" } : null;

  // A yes-or-no question always comes with a way to say no.
  finalNo(reply, suggestedReplies);

  // What to ask next is decided by rule (consultPlan); the model words it. In the first round the
  // conversation does not close while a step the rules insist on is missing: when it began, how bad
  // it is, what has been taken, an everyday word to confirm, where it hurts, a link to an old illness,
  // and how it hurts. The model tends to stop after two.
  const firstRound = req.kind !== "checkin" && !req.messages.some((m) => m.role === "assistant" && !hasQuestion(m.content));
  const step = firstRound && !spent && hint?.level !== "urgent" ? consultPlan(req).next : null;
  let widget: ChatResponse["widget"] = null;
  if (step) {
    if (done && !hasQuestion(reply)) {
      if (step.required) {
        finalReply = `记下了。${step.question}`;
        quick = step.quick;
        done = false;
      }
    } else if (
      !done &&
      ((OVERRIDE.has(step.key) && !askedAbout(step, questionOf(reply) ?? "", reply)) ||
        // the model confirming a word the rules did not ask about (a tapped answer, or the doctor's word misnamed)
        (step.key !== "confirm" && termAsked(reply) != null))
    ) {
      // confirming a word, the body map and a link to an old illness are asked in the rules' words
      // when the model asked about something else
      const kept = reply
        .split(/(?<=[。！!？?])/)
        .map((x) => x.trim())
        .filter((x) => x && !/[？?]$/.test(x) && !/『/.test(x))
        .join("");
      finalReply = `${kept || "记下了。"}${step.question}`;
      quick = step.quick;
    } else if (!done && (step.key === "confirm" || !quick.length)) {
      quick = step.quick;
    }
    if (!done && step.widget && finalReply.includes(step.question.split("？")[0])) widget = step.widget;
    if (!done && step.widget && LOCATION_ASKED_BY_MODEL.test(questionOf(finalReply) ?? "")) widget = step.widget;
  }
  // a confirmed everyday word, or a place picked on the body map, goes on the record the way a doctor reads it
  const answered = first ? null : answerEntry(req);
  if (answered) {
    entry = {
      severity: entry?.severity ?? null,
      exact: entry?.exact ?? false,
      temperature: entry?.temperature ?? null,
      note: answered.note,
      location: answered.location ?? entry?.location ?? null,
    };
  }

  return {
    mode: "glm",
    reply: finalReply,
    entry,
    tags,
    suggestedReplies: quick,
    hint,
    measurements,
    title: first ? title || provisionalTitle(firstUserText(req)) : null,
    onsetHoursAgo: onset,
    done,
    widget,
  };
}

/** steps asked in the rules' own words when the model asks something else instead */
const OVERRIDE = new Set<ConsultStep["key"]>(["confirm", "location", "link"]);
const LOCATION_ASKED_BY_MODEL = /哪个位置|哪个部位|哪里(疼|痛|不舒服)|哪边|具体位置|哪一侧|图上/;

/** Does the model's question ask what this step is about? */
function askedAbout(step: ConsultStep, q: string, whole = q): boolean {
  if (!q) return false;
  switch (step.key) {
    case "confirm": {
      const term = termAsked(step.question);
      // the doctor's word may come after the question: "是拧着疼吗？医生叫它『绞痛』。"
      return term != null && whole.includes(term.replace(/（.*$/, ""));
    }
    case "location":
      return LOCATION_ASKED_BY_MODEL.test(q);
    case "link":
      return /像|血糖|血压|伤口|破皮/.test(q);
    default:
      return true;
  }
}

const METRIC_LIMITS: Record<MetricType, [number, number]> = {
  fbg: [1, 35],
  ppg: [1, 35],
  hba1c: [3, 20],
  weight: [20, 250],
  bp: [60, 260],
};

export function normalizeMeasurements(v: unknown): ChatMeasurement[] {
  if (!Array.isArray(v)) return [];
  const out: ChatMeasurement[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const x = item as Record<string, unknown>;
    const type = x.type as MetricType;
    if (!(type in METRIC_LIMITS)) continue;
    const value = Number(x.value);
    const [lo, hi] = METRIC_LIMITS[type];
    if (!Number.isFinite(value) || value < lo || value > hi) continue;
    const value2 = x.value2 == null ? null : Number(x.value2);
    if (type === "bp" && (value2 == null || !Number.isFinite(value2) || value2 < 30 || value2 > 160)) continue;
    out.push({ type, value, value2: type === "bp" ? value2 : null });
  }
  return out.slice(0, 6);
}

/* ---------- nothing the patient did not say ---------- */

/**
 * Negative statements the model likes to add although nobody said them ("未用药", "无发热",
 * "无手术史"). Each is dropped unless the patient's own words back it up.
 */
const UNSTATED: { claim: RegExp; said: RegExp | null }[] = [
  { claim: /(尚|暂|均)?未(服|用|予)(任何)?药(物)?|没有?(服|用)药|未(自行)?(用药|服药)|未予(任何)?(药物)?(治疗|处理)|未(经|做|作)?(任何|特殊)?(治疗|处理|处置|诊治|干预)/, said: /没(有)?(吃|用|服)(过)?(任何|什么)?药|未用药|不吃药|没管它|没处理/ },
  { claim: /无(明显)?发热|无发烧|未发热|未发烧|体温正常|不伴发热/, said: /没(有)?发烧|不发烧|没烧|不烧|没有发热|体温正常/ },
  { claim: /无(其他|其它)(明显)?(不适|伴随症状|症状)|不伴(其他|其它)/, said: /没有?(别的|其他|其它)|没别的/ },
  { claim: /(尚|暂)?未就(医|诊)|未(去)?看医生/, said: /没(去)?看(过)?医生|没去(过)?医院|还没看/ },
  { claim: /无手术史|手术史[：:]?无|否认手术史/, said: null },
  { claim: /无(特殊)?家族史|家族史[：:]?无|家族史无特殊|否认家族史/, said: null },
  { claim: /无(长期|慢性)(用药|服药)(史)?|无长期用药|无(慢性病|基础病|既往病)史?|既往体健/, said: null },
  // an allergy list nobody filled in is not "no allergies"
  { claim: /无(已知)?(药物|食物)?过敏史?(记录)?|过敏史[：:]?无|否认(药物|食物)?过敏/, said: /没有?过敏|不过敏|没过敏/ },
];

/** After clauses were cut: no comma left dangling before a full stop or at the end. */
function tidySeams(out: string, original: string): string {
  let text = out.replace(/[，,；;]+(?=[。])/g, "").replace(/[，,；;]+$/g, "");
  if (text && /[。.！？]$/.test(original) && !/[。.！？]$/.test(text)) text += "。";
  return text.trim();
}

/** Removes unbacked negative clauses from one sentence or paragraph. */
export function stripUnstated(text: string, said: string): string {
  if (!text) return text;
  const pieces = text.split(/(?<=[，,；;。])/);
  const kept = pieces.filter((piece) => {
    for (const u of UNSTATED) {
      if (u.claim.test(piece) && !(u.said && u.said.test(said))) return false;
    }
    return true;
  });
  return tidySeams(kept.join(""), text);
}

/*
 * What a page for the doctor must not carry, however the model words it. Each kind was seen in
 * real output. They are cut out clause by clause, so the facts in the same sentence stay.
 */
/** telling the doctor (or the patient) what to do: "需优先评估", "请医生留意", "建议…" */
const DIRECTIVE =
  /需(要)?(优先|尽快|及时|进一步|密切|重点|特别|引起)?(评估|关注|留意|警惕|排查|排除|干预|处理|重视|注意|完善|检查|随访|监测|复查|就诊|就医)|(请|需|望|由|供)(医生|医师|临床)(留意|关注|注意|评估|判断|结合|参考)|建议|应(当|该|予|尽快|及时|注意)|务必|值得(关注|注意|警惕)/;
/** reading something into the facts: "提示血糖控制不佳", "间歇性跛行样表现", "体位性" */
const INTERPRETATION =
  /提示|考虑|样(表现|改变|症状|发作|疼痛)|疑似|疑为|怀疑为|倾向于?|不排除|待排|可能(是|为|与|和|跟|由|系|存在|有)|或与.{0,12}有关|控制(不佳|欠佳|不良|不理想|较差)|依从性|体位性|典型|诱发|所致|引起的|导致的/;
/** saying that something is unknown is filler, not a finding: "具体剂量不详" */
const PLACEHOLDER = /不详|未说明|未提及|未诉|未述|未描述|未提供|未告知|待补充|暂无(记录|信息|数据)|没有说/;
/** the app's own state means nothing to a doctor: "症状仍在跟踪中" */
const APP_SPEAK = /跟踪中|(仍|还|尚)在跟踪|(持续|继续)跟踪/;
/** what the patient thinks, or what a doctor already said, is theirs to say and stays */
const SOMEONE_SAID =
  /^(患者|病人|患儿|家属|本人)?(自己)?(自述|自诉|自觉|认为|觉得|担心|怀疑|害怕|想知道|询问|表示)|(医生|医师|大夫|医嘱|医院)(说|让|建议|嘱|叮嘱|诊断|考虑|开)/;

/** Takes the model's instructions, readings-into and filler out of a sentence or paragraph. */
export function factsOnly(text: string): string {
  if (!text) return text;
  const kept = text.split(/(?<=[，,；;。])/).filter((piece) => {
    const p = piece.trim();
    if (SOMEONE_SAID.test(p)) return true;
    return !(DIRECTIVE.test(p) || INTERPRETATION.test(p) || PLACEHOLDER.test(p) || APP_SPEAK.test(p));
  });
  return tidySeams(kept.join(""), text);
}

/** "双下肢", "双侧": written although the patient spoke of one leg, or never said which */
const BOTH_SIDES = /双侧|双(?=下肢|上肢|腿|脚|手|眼|耳|膝|肩|足|踝|腕)/g;
const SAID_BOTH = /两(条|只|边|侧|个|腿|脚|手|眼|耳|膝)|双|左右|全身|浑身|都(疼|痛|麻|肿|痒|酸|有)/;

/** A field as the model sometimes returns it: with its own label in front, or a stray quote mark. */
const bare = (s: string) =>
  s
    .replace(/^[\s：:，,。；;"“”'‘’]+/, "")
    .replace(/^(主诉|现病史|当前状态)\s*[：:]\s*/, "")
    .replace(/["“”'‘’\s]+$/, "");

/** Everything the patient said about this illness, in their own words and as it was noted down. */
function saidIn(req: SummaryRequest): string {
  return [
    ...req.episode.messages.filter((m) => m.role === "user").map((m) => m.content),
    ...req.episode.entries.map((e) => e.note),
  ].join("\n");
}

/** A note for the doctor must be a fact, not advice to a patient who is already in the room. */
const ADVICE = /^建议|建议(尽快|及时|今天|立即)?(就诊|就医|去看|挂)|尽快就(诊|医)|及时就(诊|医)|去看医生/;
/** Saying the symptoms "fit" a disease is a diagnosis in all but name, and so is comparing how fast two bouts cleared. */
const OVERREACH = /(与|和|跟).{0,24}(病史|诊断|表现|特点).{0,6}(一致|相符|吻合|符合)|符合.{0,12}(表现|特点|特征)|考虑为|可能是|可能为|提示.{0,8}(可能|为)|较上次.{0,6}(更快|更慢|更重|更轻)/;

/**
 * A question that puts forward a cause the patient never mentioned is a guess at the cause in
 * disguise: "跟糖尿病有关系吗" when the patient only spoke of a sore leg. `known` is what the
 * patient said plus the earlier records the page itself points to.
 */
export function guessesCause(question: string, known: string): boolean {
  const m =
    question.match(/(?:跟|和|与|同)(.{1,14}?)(?:有没有|是否有|有)关(?:系|联)?/) ??
    question.match(/(?:是不是|是否|会不会是?|有没有可能是?)(?:因为|由于|跟|和|与)?(.{1,14}?)(?:引起|导致|造成|所致|的问题|的原因|的毛病|有关)/);
  if (!m) return false;
  const cause = m[1].replace(/^(我的?|这个|那个|之前的?|以前的?|上次的?|前几天的?)/, "");
  for (let i = 0; i + 2 <= cause.length; i++) if (known.includes(cause.slice(i, i + 2))) return false;
  return true;
}

/** A question that names a particular test is a suggestion to have it done. */
const A_TEST = /心电图|CT|核磁|磁共振|B超|彩超|超声|胃镜|肠镜|X光|拍片|造影|血常规|尿常规|活检|穿刺|验血|抽血|化验/i;

export function normalizeSummary(raw: unknown, req: SummaryRequest): DoctorSummaryBody {
  const base = fallbackSummary(req).summary;
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const said = saidIn(req);
  const sides = (text: string) => (SAID_BOTH.test(said) ? text : text.replace(BOTH_SIDES, ""));
  const clean = (v: unknown) =>
    factsOnly(stripUnstated(sides(bare(str(v))), said))
      .split(/(?<=[。])/)
      .filter((sentence) => !OVERREACH.test(sentence))
      .join("");
  const cleanList = (v: unknown, max: number) =>
    strList(v, max)
      .map((x) => stripUnstated(x, said))
      .filter(Boolean);
  // facts for the doctor only: advice to the patient is dropped, and an empty list is fine
  const hints = Array.isArray(o.hints)
    ? o.hints
        .map(documentHint)
        .filter((h): h is Hint => Boolean(h))
        .filter((h) => !ADVICE.test(h.text) && !OVERREACH.test(h.text))
        .map((h) => ({ ...h, text: factsOnly(stripUnstated(sides(h.text), said)) }))
        .filter((h) => h.text.length >= 4)
        .slice(0, 3)
    : base.hints;
  // the check-up line is quoted from the report; it is added here as printed, whatever the model made of it
  const background = req.background ?? [];
  const history = [...cleanList(o.relevantHistory, 10).filter((x) => !/体检/.test(x)), ...background];
  const relevantHistory = history.length > background.length ? history : base.relevantHistory;
  // the doctor needs the allergy line to prescribe: it is there whatever the model chose to list
  if (!relevantHistory.some((x) => /过敏/.test(x))) {
    const allergy = base.relevantHistory.find((x) => x.startsWith("过敏史"));
    if (allergy) relevantHistory.splice(relevantHistory.length - background.length, 0, allergy);
  }
  // Questions: what the patient said they want to know comes first, in their words. The model's
  // may not smuggle in a cause or a test the patient never mentioned.
  const own = ownQuestions(req.episode.entries.filter((e) => e.source === "user").map((e) => e.note).join("\n"));
  const known = [said, ...req.related.map((r) => `${r.title}${r.diagnosis ?? ""}`), req.episode.visit?.diagnosis ?? ""].join("\n");
  const asked = strList(o.questionsForDoctor, 6).filter((q) => {
    const test = q.match(A_TEST)?.[0];
    return !guessesCause(q, known) && !(test && !said.toLowerCase().includes(test.toLowerCase()));
  });
  const questions = [...own, ...asked.filter((q) => !own.some((x) => textOverlap(x, q) >= 0.5))].slice(0, 5);
  return {
    // The first screen is built from the records by rule. It is on screen at once, every line can be
    // traced to something recorded, and it does not change when the model's version arrives.
    glance: base.glance,
    narrative: clean(o.narrative) || base.narrative,
    chiefComplaint: clean(o.chiefComplaint) || base.chiefComplaint,
    presentIllness: clean(o.presentIllness) || base.presentIllness,
    // The timeline is never the model's: it is the recorded entries themselves, so nothing in it can be made up.
    timeline: base.timeline,
    currentStatus: clean(o.currentStatus) || base.currentStatus,
    relevantHistory,
    priorSimilar: Array.isArray(o.priorSimilar) ? strList(o.priorSimilar, 5).map(factsOnly).filter(Boolean) : base.priorSimilar,
    hints,
    questionsForDoctor: asked.length ? questions : base.questionsForDoctor,
  };
}

function pairs<A extends string, B extends string>(v: unknown, a: A, b: B, max: number): Record<A | B, string>[] {
  if (!Array.isArray(v)) return [];
  const out: Record<A | B, string>[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const x = item as Record<string, unknown>;
    const first = str(x[a]);
    const second = str(x[b]);
    if (first && second) out.push({ [a]: first, [b]: second } as Record<A | B, string>);
  }
  return out.slice(0, max);
}

export function normalizeAnnual(raw: unknown, req: AnnualRequest): AnnualSummaryBody {
  const base = fallbackAnnual(req).summary;
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const metricTrends = pairs(o.metricTrends, "name", "trend", 8);
  const medicationChanges = pairs(o.medicationChanges, "time", "change", 12);
  const keyEvents = pairs(o.keyEvents, "time", "event", 8);
  const hints = Array.isArray(o.hints)
    ? o.hints.map(documentHint).filter((h): h is Hint => Boolean(h)).slice(0, 4)
    : [];
  const sober = (text: string) =>
    text
      .split(/(?<=[。])/)
      .filter((sentence) => !SPECULATION.test(sentence) && !OVERREACH.test(sentence))
      .join("");
  const soberList = (v: unknown, max: number) =>
    strList(v, max)
      .map(sober)
      .filter(Boolean);
  return {
    // as for a single illness: the first screen is rule-built and stable
    glance: base.glance,
    headline: str(o.headline) || base.headline,
    overview: sober(str(o.overview)) || base.overview,
    metricTrends: metricTrends.length ? metricTrends : base.metricTrends,
    // Medicine changes come straight from the visit records. A condensed retelling dropped a step
    // ("每天三次") once, and this is the one list where a missing step matters.
    medicationChanges: base.medicationChanges.length ? base.medicationChanges : medicationChanges,
    keyEvents: keyEvents.length ? keyEvents : base.keyEvents,
    patterns: Array.isArray(o.patterns) ? soberList(o.patterns, 6) : base.patterns,
    currentConcerns: Array.isArray(o.currentConcerns) ? soberList(o.currentConcerns, 6) : base.currentConcerns,
    hints: hints.length ? hints.filter((h) => !SPECULATION.test(h.text) && !OVERREACH.test(h.text) && !ADVICE.test(h.text)) : base.hints,
    questionsForDoctor: strList(o.questionsForDoctor, 6).length ? strList(o.questionsForDoctor, 6) : base.questionsForDoctor,
  };
}

/* ---------- after the visit ---------- */

export const nullable = (v: unknown): string | null => {
  const s = str(v);
  return s && !/^(null|无|未提及|未提到|不详|没有|没提到)$/i.test(s) ? s : null;
};

export function validDate(v: unknown): string | null {
  const s = str(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = new Date(`${s}T12:00:00`).getTime();
  if (!Number.isFinite(t)) return null;
  // a visit cannot be in the future, and anything older than ten years is a misread
  const now = Date.now();
  return t <= now + 36 * 3_600_000 && t >= now - 3650 * 86_400_000 ? s : null;
}

function normalizeMedications(v: unknown): AfterMedication[] {
  if (!Array.isArray(v)) return [];
  const out: AfterMedication[] = [];
  for (const item of v) {
    if (typeof item === "string" && item.trim()) {
      out.push({ name: item.trim(), usage: "", longTerm: false });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const x = item as Record<string, unknown>;
    const name = str(x.name);
    if (!name) continue;
    out.push({ name, usage: nullable(x.usage) ?? "", longTerm: x.longTerm === true });
  }
  return out.slice(0, 10);
}

export function normalizeAfter(raw: unknown, req: AfterRequest, fromPhoto = false): AfterResult {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const base = req.text ? fallbackAfter(req).result : null;
  const words = req.text ?? "";
  const spoken = (v: string | null) => (v == null || fromPhoto || words.includes(v.replace(/科$/, "")) ? v : null);
  const medications = normalizeMedications(o.medications);
  const days = Number(o.followUpDays);
  const diagnosis = nullable(o.diagnosis) ?? base?.diagnosis ?? null;
  const advice = nullable(o.advice) ?? base?.advice ?? null;
  const meds = medications.length ? medications : (base?.medications ?? []);
  const summary =
    str(o.summary) ||
    base?.summary ||
    [diagnosis ? `诊断：${diagnosis}。` : "", meds.length ? `用药：${meds.map((m) => m.name).join("、")}。` : "", advice ? `叮嘱：${advice}。` : ""].join("");
  return {
    date: validDate(o.date),
    // From a photo these are read off the page. From speech they count only if the patient said them:
    // the model likes to fill in a likely department ("耳鼻喉科") that nobody mentioned.
    hospital: spoken(nullable(o.hospital)),
    department: spoken(nullable(o.department)),
    diagnosis,
    findings: strList(o.findings, 12),
    procedures: strList(o.procedures, 6),
    medications: meds,
    advice,
    followUpDays: o.followUpDays != null && Number.isFinite(days) && days >= 1 && days <= 730 ? Math.round(days) : (base?.followUpDays ?? null),
    followUpNote: (nullable(o.followUpNote) ?? base?.followUpNote ?? null)?.replace(/[。.；;，,\s]+$/, "") ?? null,
    readings: normalizeMeasurements(o.readings),
    summary,
    unclear: strList(o.unclear, 6),
  };
}

/** True when nothing useful could be read, e.g. a photo that is not a medical document. */
export function afterIsEmpty(r: AfterResult): boolean {
  return !r.diagnosis && !r.medications.length && !r.findings.length && !r.procedures.length && !r.advice && !r.readings.length;
}

export function normalizeProfile(raw: unknown): Omit<ProfileParseResponse, "mode"> {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = (v: unknown) => strList(v, 10).filter((s) => !/^(无|没有|都没有|none|null)$/i.test(s));
  return {
    conditions: list(o.conditions),
    allergies: list(o.allergies),
    medications: list(o.medications),
    surgeries: list(o.surgeries),
    familyHistory: list(o.familyHistory),
  };
}
