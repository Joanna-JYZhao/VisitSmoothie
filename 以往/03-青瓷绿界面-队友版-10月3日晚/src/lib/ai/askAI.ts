import type { AskRequest, AskResponse } from "../types";
import { fmtDate, uniq } from "../utils";
import { inChinese } from "../lang";
import type { GlmMessage } from "./glm";
import { profileContext } from "./prompts";
import { str, strList } from "./normalize";
import { askAlert, medicinesOnFile } from "./askRules";

/*
 * 问医伴 with a model: the prompt, and the filters every answer goes through before it is shown.
 * The rule-only side (answers quoted from the record, and the keyless fallback) is in askRules.ts.
 */

/* ---------- the prompt ---------- */

export const ASK_SYSTEM = `你是「医伴」，患者的私人医生助理。患者会问关于他自己健康的问题：记不清的事、医生说过的话、药怎么吃。请只根据下面的【资料】回答。和你说话的是普通人，不懂医学。

## 怎么回答
1. 第一句直接回答问题。用大白话，称呼对方用“你”。一般不超过 150 字，不用小标题，不用医学术语。
2. 资料里有的，照资料说，并说明是哪天的记录（如“9月30日看医生时”）。日期、数值、药名、医生的话一律照抄资料，不要改写成别的数，不要自己加减换算。每条资料后面括号里的“约 3 个月前”是算好的，可以直接用。
3. 资料里没有他问的东西（某次手术、某项检查、体检、某个药、某个数），第一句就说“记录里没有……”。只能说记录里没有，不能说成“没做过”“医生没开过”。可以接着说资料里相近的内容，但要说清那是什么（复查不是体检）。不要猜，不要编。
4. 不替医生加话：资料里没写的评价（“控制得不错”“问题不大”“情况挺好”）和理由，不要说成是医生说的，你自己也不要下这种结论。
5. 说到血糖、血压、体重这些数：照抄资料里的数和日期；只说“在一般范围内”或“比一般范围高（低）”，并说明一般范围是通用标准，他自己的目标听医生的。不说“正常”“达标”“控制得好”。
6. 用到了哪几条资料，把编号放进 sources（如 ["R1","P"]）。没用到就给空数组。answer 里不要出现编号。
7. 对方接着上一句问（如“那饭前还是饭后？”），按前面的对话理解他指的是什么。
8. 复查提醒只在和问题有关时才提。你在这里不能替他记录新内容：要补充或修改档案，让他去「我的档案」；他说的是现在的不舒服、资料里又没有这次的记录，提醒他回到「今天」说一句，把它记下来，方便给医生看。

## 问到吃药
9. 先说医生当时是怎么开的，照抄资料里的写法，并说明是哪天开的。同一个药开过几次的，以最近一次为准。资料里没有这个药，先说记录里没有，再按第 11 条讲说明书上的一般用法。
10. 档案“长期在吃的药”里有的药，是他一直在吃的，照最近一次的开法说就行。别的药是针对那一次看病开的：那次的不舒服已经好了，或者早就过了医生说的疗程，要说明这是哪天、为哪次不舒服开的；现在要不要再吃、吃多久，让他问医生，不要让他照着以前的开法接着吃。
11. 可以补充药品说明书上一般会写的用法常识：饭前还是饭后、要不要整片吞、常见的注意事项和常见的不舒服。这类常识用“说明书上一般会写”开头，让他分得清哪句是医生开的、哪句是说明书上的。讲到怎么吃药的回答，最后加一句“具体以药盒里的说明书和医生的话为准”。
12. 一次吃多少、一天吃几次这类数字，只能复述资料里医生开的；资料里没有就不要给数字，也不要自己换算成几片，让他看药盒说明书或问医生、药师。
13. 不替他做用药的决定：不建议加量、减量、停药、换药；漏吃了只讲说明书上的一般原则，不替他判断现在该不该补；他问能不能吃某个药，可以讲说明书上的注意事项，并指出档案里和它有关的事（对它过敏、有相关的老毛病、正在吃的药），能不能吃让他问医生或药师。吃药后不舒服，说“先联系医生或药师，问要不要调整”，不要说“停下来”“先停”“先别吃了”，这些会被当成让他自己停药。

## 不做的事
14. 不做诊断：不说“可能是某某病”，不猜不舒服是什么原因引起的，也不说“不是某某引起的”。他问“我这是不是某某病”“是什么原因”时，第一句告诉他这要医生判断，再把资料里相关的记录告诉他，建议带着记录去问医生。可以说挂什么科。
15. 不建议做检查：不说“查一下血脂”“做个胃镜”。资料里医生说过要做的检查可以照抄。他问要不要做某项检查，告诉他这由医生决定。
16. 一般的健康常识可以简单讲（比如一个医学名词是什么意思、低血糖时先吃糖），但要说明这是一般情况，他自己的情况听医生的。
17. 和他的健康无关的问题（天气、写文章、算账等），只用一句话说明你只帮他管健康上的事。
18. 危险信号（胸痛伴喘不上气或出冷汗、神志不清、一侧手脚无力或说话不清、呕血或黑便、喘不上气、嘴唇喉咙肿等）：第一句就让他立即就医或拨打 120。之后最多再说一两句，只说和这次危险直接有关的；不说可能是什么病，不教急救操作，不提别的事。

## 输出
严格输出一个 JSON 对象，不要输出其他内容：
{ "answer": "对患者说的话", "sources": ["用到的资料编号"] }`;

const ASK_REMINDER = "\n\n（请只输出一个 JSON 对象，包含 answer 和 sources 两个字段，不要输出其他文字）";

export function askContext(req: AskRequest): string {
  // the prompt is Chinese; what it is given stays Chinese whatever the interface shows
  return inChinese(() => {
    const L: string[] = [profileContext(req.profile), ""];
    L.push("【资料】（方括号里是编号，从新到旧）");
    if (req.records.length) {
      for (const r of req.records) L.push(`[${r.id}] ${r.text}`);
    } else L.push("除了档案，还没有别的记录。");
    L.push("", `【当前时间】${req.localTime ?? fmtDate(new Date(), { year: true, weekday: true, time: true })}`);
    return L.join("\n");
  });
}

export function buildAskMessages(req: AskRequest): GlmMessage[] {
  const history: GlmMessage[] = [];
  for (const t of req.history.slice(-3)) {
    history.push({ role: "user", content: t.question });
    history.push({ role: "assistant", content: t.answer });
  }
  return [
    { role: "system", content: `${ASK_SYSTEM}\n\n---\n\n${askContext(req)}` },
    ...history,
    { role: "user", content: `${req.question}${ASK_REMINDER}` },
  ];
}

/* ---------- doses and how often ---------- */

const DIGIT: Record<string, number> = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const PLACE: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };

/** "20" / "1.50" / "半" / "两" / "十二" as one plain number, so "一片" and "1 片" are the same dose. */
function numeral(s: string): string {
  if (/^\d/.test(s)) return String(Number(s));
  if (s === "半") return "0.5";
  let total = 0;
  let current = 0;
  for (const ch of s) {
    if (PLACE[ch]) {
      total += (current || 1) * PLACE[ch];
      current = 0;
    } else current = DIGIT[ch] ?? 0;
  }
  return String(total + current);
}

const NUM = "(?:\\d+(?:\\.\\d+)?|[半一两二三四五六七八九十百千]+)";
/** A number, or a span of two ("1～2", "一到两"): both ends count. */
const SPAN = `(${NUM})(?:\\s*[~～\\-—–至到]\\s*(${NUM}))?`;
const UNIT: Record<string, string> = { 毫克: "mg", 克: "g", 毫升: "ml", 微克: "ug", μg: "ug", mcg: "ug", iu: "u", 单位: "u", 颗: "粒", 包: "袋" };
const DOSE = new RegExp(`${SPAN}\\s*(mg|毫克|μg|ug|mcg|微克|ml|毫升|iu|单位|g|克|片|粒|颗|袋|包|支|丸|滴|贴|喷|吸|揿|枚)`, "gi");
const PER_DAY = new RegExp(`(?:一天|每天|每日|一日|每晚|每早|24\\s*小时)(?:之?内)?([^，。；、！？\\n]{0,8}?)${SPAN}\\s*(次|回|顿)`, "g");
const EVERY_HOURS = new RegExp(`(?:每|隔|间隔)(?:至少|大约|约)?\\s*${SPAN}\\s*个?(?:小时|钟头)`, "g");
const HOURS_APART = new RegExp(`${SPAN}\\s*个?小时(?:吃|服|用|喷|滴)?[一1]次`, "g");
const AT_EACH = /(早晚|早中晚|三餐|每餐|每顿)[前后]?各(?![测量记查])/g;

/** "每天测一次血糖" and "每天 2-3 次稀便" count things, but not doses. */
const COUNTS_SOMETHING_ELSE = /测|量|查|记|锻炼|运动|散步|走|拉|吐|起夜|发作|洗|泡|敷|喝水|饮水|厕所|大便|小便|排便/;
const COUNTED_AFTER = /^的?\s*(血糖|血压|体温|体重|稀便|大便|小便|夜尿|腹泻|呕吐|发作|复查|检查)/;

/** Food, drink and blood are measured in grams, millilitres, slices and drops too ("15 克糖", "一杯 200 毫升的水"). */
const FOOD = "(?:含糖饮料|葡萄糖|果汁|饮料|蜂蜜|糖|盐|油|开水|水|牛奶|酸奶|豆浆|粥|米饭|饭|主食|蔬菜|水果|面包|饼干|馒头|肉|鸡蛋|蛋|酒精|酒|茶|咖啡|血|尿|碳水|蛋白质|脂肪|纤维)";
const FOOD_AFTER = new RegExp(`^\\s*(?:左右|上下|以上|以下|以内|多)?的?\\s*(?:含糖的?|[温凉白淡热冷清])?${FOOD}`);
// only when the food itself is what is measured: "盐每天不超过 6 克", not "用温水送服 2 片"
const FOOD_BEFORE = new RegExp(`${FOOD}(?:量|摄入量?|每天|每日|一天|不超过|控制在|保持在|大约|约|至少|最多|在|是|为|\\s)*$`);

/** Every dose and frequency stated in a text, in one normal form ("0.5g", "x2", "h8"). Amounts of food are left out. */
export function doseTokens(text: string): string[] {
  const out: string[] = [];
  const both = (a: string, b: string | undefined, make: (n: string) => string) => {
    out.push(make(numeral(a)));
    if (b) out.push(make(numeral(b)));
  };
  for (const m of text.matchAll(DOSE)) {
    const at = m.index ?? 0;
    if (FOOD_AFTER.test(text.slice(at + m[0].length)) || FOOD_BEFORE.test(text.slice(0, at))) continue;
    const unit = m[3].toLowerCase();
    both(m[1], m[2], (n) => `${n}${UNIT[unit] ?? unit}`);
  }
  for (const m of text.matchAll(PER_DAY)) {
    const after = text.slice((m.index ?? 0) + m[0].length);
    if (COUNTS_SOMETHING_ELSE.test(m[1]) || COUNTED_AFTER.test(after) || (m[4] === "顿" && /^饭/.test(after))) continue;
    both(m[2], m[3], (n) => `x${n}`);
  }
  const counted: [number, number][] = [];
  for (const m of text.matchAll(EVERY_HOURS)) {
    counted.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
    both(m[1], m[2], (n) => `h${n}`);
  }
  for (const m of text.matchAll(HOURS_APART)) {
    // "每 8 小时一次" has been read as "每 8 小时" already
    const at = m.index ?? 0;
    if (!counted.some(([from, to]) => at >= from && at < to)) both(m[1], m[2], (n) => `h${n}`);
  }
  for (const m of text.matchAll(AT_EACH)) out.push(`${m[1]}各`);
  return out;
}

/* ---------- what an answer may and may not contain ---------- */

const CLAUSE = "[^，。；！？\\n]";
/** A doctor or a document said it: the sentence is passing that on, not judging for itself. */
const QUOTES_DOCTOR = /(医生|大夫|医嘱|处方|病历|报告|诊断书)[^。！？\n]{0,24}?(说|讲|叮嘱|交代|嘱咐|建议|判断|认为|考虑|诊断|怀疑|提到|写|开|让|要求|安排|给|把|帮)|(记录|档案)[里上]?(写|记|说)/;
/** "当时医生怀疑是…": the doctor is the one guessing, and the sentence reports it. */
const DOCTOR_IS_SUBJECT = /(医生|大夫)(当时|那时|那次|曾经|一度|初步|[也曾就还都])*$/;
/** About a medicine, where "可能引起…" is what a label says and not a guess about this person. */
const MEDICINE_TALK = /药|说明书|服用|副作用|不良反应|喝酒|饮酒|酒精/;
/** Says what a word means. */
const DEFINES = /是一种|是指|指的是|的意思是|是用来|是检查|是反映|是衡量|是看|就是说/;

/** An illness, as opposed to 病情 / 病历 / 症状 / 看病, which name none. */
const ILLNESS =
  "(?:(?<![看生])病(?![情历史人假房区例程毒])|炎|症(?![状候])|综合征|感染|结石|肿瘤|癌|瘤|梗|中风|卒中|溃疡|衰竭|心衰|硬化|血栓|贫血|高血压|低血压|房颤|心律失常|哮喘|结核|甲亢|甲减|痛风|骨折|脱水|中毒|休克)";
const HEDGE = "很可能|有可能|可能|大概|多半|估计|说不定|也许|或许|恐怕|不排除";
/**
 * "可能是胃炎", "像是胃炎": says what the illness is (`is` or `flat` is set). "可能引起胃炎" and
 * "可能有…的风险" say what something may bring about; the words in between tell the two apart.
 */
const GUESSES_ILLNESS = new RegExp(
  `(?:(?:${HEDGE})就?(?<is>是|为|得了|患了?|属于|算是?)?|(?<flat>怀疑|疑似|像是|八成|看起来像|看上去像|应该就?是|考虑[是为]))(?<between>${CLAUSE}{0,14}?)${ILLNESS}`,
  "g",
);
const CAUSES = /引起|导致|造成|诱发|引发|增加|加重|出现|发生|带来|产生|伴/;
/** "可能有乳酸酸中毒的风险": a label naming a rare harm, not a guess about this person. */
const NAMES_A_RISK = /副作用|不良反应|常见的不舒服|风险|少数|个别|罕见|偶尔|偶见/;
/** "可能是吃得太少引起的", "可能和血压有关". */
const GUESSES_CAUSE = new RegExp(`(?:很可能|有可能|可能|大概|多半|估计|也许|或许|应该|恐怕|说不定)就?(?:是|跟|和|与|由|同|因为?)${CLAUSE}{0,16}(?:引起|导致|造成|有关|所致|诱发|的缘故)`);
/** "说明那次胃痛不是它引起的": working out a cause is guessing one. */
const DEDUCES_CAUSE = new RegExp(`(?:说明|表明|提示|意味着|证明|可见|看来)[^。；！？\\n]{0,24}?(?:不是|是|跟|和|与)[^。；！？\\n]{0,14}?(?:引起|导致|造成|有关|无关|所致)`);
const RULES_OUT_CAUSE = new RegExp(`(?:不是|并非|不像是?)${CLAUSE}{0,12}(?:引起|导致|造成|所致)`);
/** "头晕的原因有贫血、低血压…". "原因有很多，要医生判断" lists nothing and stays. */
const LISTS_CAUSES = /(?:原因|病因)(?:主要|一般|通常|常见的?|可能)*(?:有|包括|是)(?!很多|多种|许多|好多|什么|医生)[^。；！？\n]*[、或]/;
/** "…都可能引起头晕": what follows the verb is checked against the complaint in the question. */
const MAY_CAUSE = /(?:可能|会|容易|常常?|往往|都)会?(?:引起|导致|造成|诱发|引发)([^。；！？\n]*)/;
const COMPLAINT =
  /头晕|头痛|头疼|胸闷|胸痛|心慌|心悸|气短|咳嗽|发烧|发热|拉肚子|腹泻|恶心|呕吐|便秘|反酸|烧心|肚子[痛疼胀]|腹[痛胀]|胃[痛疼胀]|脚麻|手麻|发麻|麻木|乏力|没力气|出汗|手抖|口渴|尿多|尿频|水肿|浮肿|耳鸣|失眠|睡不着|皮疹|瘙痒|[晕痛疼麻肿痒]/g;

/**
 * Names a likely illness, or guesses what a complaint comes from. Asking a doctor is the answer to both.
 * `asksWhy`: the question is "why do I feel this", so even "这个药可能引起头晕" is an answer to it, and a guess.
 */
function guessesIllness(s: string, aboutMedicine: boolean, complaints: string[], asksWhy: boolean): boolean {
  const quoted = (index: number) => QUOTES_DOCTOR.test(s.slice(0, index)) || DOCTOR_IS_SUBJECT.test(s.slice(0, index));
  for (const m of s.matchAll(GUESSES_ILLNESS)) {
    if (quoted(m.index ?? 0)) continue;
    const { is, flat, between = "" } = m.groups ?? {};
    if (is || flat) return true;
    // "X 可能引起胃炎" is knowledge when X is a medicine or a term being explained; anything else is a guess
    const brings = CAUSES.test(between) || (between.startsWith("有") && NAMES_A_RISK.test(s));
    if (!brings || !(aboutMedicine || DEFINES.test(s))) return true;
  }
  for (const re of [GUESSES_CAUSE, DEDUCES_CAUSE]) {
    const m = re.exec(s);
    if (m && !quoted(m.index)) return true;
  }
  const out = RULES_OUT_CAUSE.exec(s);
  if (out && !aboutMedicine && !quoted(out.index)) return true;
  if (LISTS_CAUSES.test(s)) return true;
  const may = MAY_CAUSE.exec(s);
  return Boolean(may && (!aboutMedicine || asksWhy) && complaints.some((w) => may[1].includes(w)));
}

const TESTS =
  "(?:胃镜|肠镜|喉镜|CT|核磁|磁共振|B超|彩超|超声|心电图|脑电图|肌电图|X光|胸片|拍片|造影|活检|穿刺|血常规|尿常规|血脂|胆固醇|肝功能?|肾功能?|甲功|化验|抽血|验血|骨密度|呼气试验|眼底检查|足部检查|尿微量白蛋白|糖耐量|动态血压|动态心电图|基因检测|肿瘤标志物)";
const SUGGESTS_TEST = new RegExp(
  `(?<![不别])(建议|可以|最好|应该|不妨|记得|趁|需要)${CLAUSE}{0,14}?(?:查|做|拍|验|照|测|抽)(?:一下|个|一个|一次|下)?${CLAUSE}{0,6}?(${TESTS})|[去再](?:查|做|拍|验|抽)(?:一下|个|一个|一次)${CLAUSE}{0,6}?(${TESTS})`,
  "gi",
);
/** "要不要做胃镜由医生决定" leaves the decision where it belongs. */
const WHETHER = /要不要|需不需要|是不是|是否|用不用|该不该|有没有必要|能不能|可不可以/;

/** Recommends a test. What a doctor ordered may be repeated; so may "需要做…" when the record itself names the test. */
function suggestsTest(s: string, onFile: string): boolean {
  if (WHETHER.test(s)) return false;
  for (const m of s.matchAll(SUGGESTS_TEST)) {
    if (QUOTES_DOCTOR.test(s.slice(0, m.index ?? 0))) continue;
    if (m[1] === "需要" && onFile.includes(m[2])) continue;
    return true;
  }
  return false;
}

const CHANGE = /加量|减量|加倍|减半|停药|停用|停掉|停吃|停一|换成|改成|改为|改吃|增加(?:剂量|药量|用量)|减少(?:剂量|药量|用量)|多吃一|少吃一|加一[片粒]|减一[片粒]|加到|减到/g;
const REFUSES_OR_ASKS = /不|别|勿|没|是否|吗|想|打算|如果|要是|万一/;
const URGES = /可以|建议|不妨|最好|试着|试试/;
const MAY_URGE = /应该|需要|先|就|你/;
/** "减量、停药这些事" and "停药要问医生" talk about a change without advising one. */
const NAMED_NOT_ADVISED = /^(的话|之?[前后]|以[前后]|时|期间|这些|这类|这种|与否|还是|[、或和都要得]|需要|必须|应该)/;

/** Tells someone to change a prescription. Refusing to ("不要自己停药") and reporting what a doctor did are fine. */
function changesPrescription(s: string): boolean {
  for (const m of s.matchAll(CHANGE)) {
    const at = m.index ?? 0;
    // the clause the word sits in, up to the word itself
    const before = s.slice(0, at).split(/[，；：,;:]/).pop() ?? "";
    if (REFUSES_OR_ASKS.test(before) || /医生|大夫|医嘱|处方/.test(before)) continue;
    if (URGES.test(before)) return true;
    if (MAY_URGE.test(before) && !NAMED_NOT_ADVISED.test(s.slice(at + m[0].length))) return true;
  }
  return false;
}

/**
 * "停下来问医生" reads as "stop taking it, then ask". Any clause that could be read as stopping a
 * medicine on one's own goes; one that refuses it ("不要自己停药") or reports a doctor's order stays.
 */
const STOPS = /停下来|先停|停掉|停一停|停一下|暂停|停药|停用|停服|停吃|先别吃|别吃了|不要吃了|先不吃|不吃了|先不要吃|别再吃/g;
const ADVICE_WORDS = /^(停下来|先停|停一停|停一下|先别吃|别吃了|不要吃了|先不吃|不吃了|先不要吃|别再吃)$/;
const REFUSED = /(不要|不能|不可以|别|勿|切勿|千万别|千万不要|不得|不应|不该)[^，；：,;:]{0,6}$/;

export function stopsOnOwn(s: string): boolean {
  for (const m of s.matchAll(STOPS)) {
    const at = m.index ?? 0;
    const before = s.slice(0, at).split(/[，；：,;:]/).pop() ?? "";
    // a doctor's order reported, unless the clause is about going to ask one
    if (/医生|大夫|医嘱|处方|说明书/.test(before) && !/问|联系|找/.test(before)) continue;
    if (ADVICE_WORDS.test(m[0])) {
      // "停下来", "先别吃了" are advice in themselves: only an outright "不要" in front takes it back
      if (REFUSED.test(before)) continue;
      return true;
    }
    // "停药" and the like, as for any change of prescription: refused, asked about or only named is fine
    if (/不|别|勿|没|是否|吗|想|打算/.test(before)) continue;
    if (NAMED_NOT_ADVISED.test(s.slice(at + m[0].length))) continue;
    return true;
  }
  return false;
}

/** What to do when a medicine seems to disagree, in words that cannot be read as "stop it yourself". */
export const ASK_BEFORE_STOPPING = "吃药后觉得不舒服，先联系医生或药师，问要不要调整，不要自己停药；很难受的话马上去医院。";

/** Decides for the person whether to take a missed dose now. The label's general rule may be told; applying it is not ours. */
const DECIDES_MISSED_DOSE = new RegExp(
  `(?:建议|可以|应该|最好|不用|不要|别)${CLAUSE}{0,12}(?:现在|今晚|今天|这次)${CLAUSE}{0,10}(?:补吃|补服|补上|补|跳过|照常吃|按正常时间吃|正常吃)|(?:现在|今晚|今天)${CLAUSE}{0,8}(?:不用|不要|别|可以)${CLAUSE}{0,6}(?:补吃|补服|补上|补|跳过)`,
);

/** "建议去消化内科看看", "请立即拨打 120": the one part of a removed sentence that is still worth saying. */
const SEEKS_CARE = /120|急诊|就医|去医院|看医生|问医生|找医生|[挂去看].{0,8}科/;

/** What is left of a sentence that had to go: its advice to see someone, if it gave any. */
function careAdvice(sentence: string, bad: (clause: string) => boolean): string {
  const clauses = sentence.split(/(?<=[，,；;])/).filter((c) => SEEKS_CARE.test(c) && !bad(c));
  if (!clauses.length) return "";
  return `${clauses.join("").trim().replace(/[，,；;。]+$/, "")}。${sentence.match(/\n*$/)?.[0] ?? ""}`;
}

/** Sentences, each with the line break that follows it, so the paragraphs of an answer survive the filters. */
function sentencesOf(text: string): string[] {
  return text.match(/[^。！!？?\n]*[。！!？?]+[”’」』）)]*\n*|[^。！!？?\n]+\n*|\n+/g) ?? [];
}

/** "这是说明书上的一般说法": points back at what was just said. Followed by a colon it introduces what comes next instead. */
const POINTER = /(?:这些?|以上(?:这些)?|上面(?:这些)?)都?是(?:药品)?说明书上的(?:一般|通常|常见)(?:说法|写法)([，,：:。]?)[ \t]*/;
/** Words that mark general knowledge, as opposed to what this person's doctor wrote. */
const SOUNDS_GENERAL = /说明书|一般|通常|常见/;
/** Reports a line of the record: what the doctor prescribed or said, and when. "要问医生" reports nothing. */
const REPORTS_RECORD = /(?:医生|大夫)(?:当时|那次|给你|帮你|[把也还])*(?:开|写|说|叮嘱|交代|嘱咐|让|改|换|定|调)|开的|记录|档案|处方|当时|那次|\d+\s*月\s*\d+\s*日/;

/**
 * Takes "这是说明书上的一般说法" out when it has nothing general to point at: the sentence it
 * followed was removed, or what it follows is the doctor's own line. Left in, it would call a
 * prescription the wording of a label.
 */
function withoutLonePointer(text: string, previous: string | null): string {
  const m = POINTER.exec(text);
  if (!m || /[：:]/.test(m[1])) return text;
  const lead = text.slice(0, m.index);
  // what it points at: the words before it in the same sentence, or else the sentence before
  const pointsAt = lead.replace(/[\s，,、]/g, "").length >= 4 ? lead : previous;
  if (pointsAt != null && !(REPORTS_RECORD.test(pointsAt) && !SOUNDS_GENERAL.test(pointsAt))) return text;
  return `${lead}${text.slice(m.index + m[0].length)}`.replace(/[，,](\s*)$/, "。$1");
}

/** A dose may be repeated when the sentence says whose words it is repeating. */
const QUOTES_RECORD = /医生|大夫|记录|档案|处方|开的|当时|那次|\d+\s*月\s*\d+\s*日/;
/** What a label or a textbook says in general. A number given this way is nobody's prescription, even if the same number is on file. */
const LABEL_TALK = /说明书|通常|常规|常用|成人|成年人|儿童|一般(?:是|为|每|一[天次日]|从|用|吃|服|来说|情况)/;
/** The closing line itself mentions the label; it is not label talk. */
const CLOSING_LINE = /(?:具体)?以[^，。；]*说明书[^，。；]*为准|这是说明书上的一般说法/g;
const ASKS_USAGE = /怎么吃|怎么用|怎么服|吃法|用法|饭前|饭后|餐前|餐后|空腹|漏|忘了?吃|忘记吃|一起吃|同时吃|能不能吃|可以吃|能吃|喝酒|副作用|不良反应|注意什么|几片|几粒|几次|剂量|用量/;
/** A word that names a medicine, on file or not ("布洛芬", "阿司匹林", "降压药"). */
const MEDICINE_WORD = /药|片|胶囊|颗粒|丸|素|芬|唑|坦|地平|洛尔|普利|汀|胍|林|酮|头孢|沙星|替丁|胺/;
/** Says something a label would say, beyond repeating the doctor's own line. */
const TELLS_USAGE = /整片|整粒|嚼碎|掰开|漏服|漏吃|补服|补吃|副作用|不良反应|常见的不舒服|刺激胃|对胃/;
/** Passes a verdict on a reading: a metric, a number, and a word such as 正常. */
const JUDGES_READING = /(?:血糖|血压|糖化|体重)[^。！？\n]{0,30}\d[^。！？\n]{0,30}(?:一般范围|正常|达标|偏高|偏低|控制得)/;
const ASKS_FOR_DIAGNOSIS = /是不是|会不会|什么原因|怎么回事|为什么|什么病|严重吗|要紧吗|怎么了/;

/**
 * The answer already says the question is one for a doctor. "上次医生诊断是急性胃炎" does not: it
 * reports what a doctor found. Nor does "建议去消化内科看看", which leaves "是不是胃炎" unanswered.
 */
const LEAVES_IT_TO_A_DOCTOR = new RegExp(`(?:要|得|需要|应该|只能|只有|让|请|由|找|问|带给|交给|告诉)${CLAUSE}{0,6}(?:医生|大夫)|(?:医生|大夫)(?:来|才能)(?:判断|诊断|决定|看)`);

type GuardContext = Pick<AskRequest, "profile" | "records" | "question"> & Partial<Pick<AskRequest, "history">>;

/** Record numbers are for the page to turn into chips, never for the reader; and the app says 你. */
function tidy(answer: string): string {
  return answer
    .replace(/[（(\[【]\s*(?:R\d+|[PMN])(?:\s*[,，、]\s*(?:R\d+|[PMN]))*\s*[）)\]】]/g, "")
    .replace(/\bR\d+\b/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/您/g, "你")
    .trim();
}

/**
 * Keeps an answer inside what 问医伴 may say. Taken out, sentence by sentence: a guess at a
 * diagnosis or a cause, a recommendation to have a test, advice to change a prescription or to
 * take a missed dose now, and any dose or frequency that is not in this person's own records for
 * the medicine the sentence is about (the model's memory of a drug label is not a prescription).
 * What was taken out is replaced by one plain line saying whom to ask.
 */
export function guardAnswer(answer: string, req: GuardContext): string {
  // when the question itself is an emergency, the red box has said what to do: add nothing to it
  const urgent = askAlert(req.question) != null;
  const cores = uniq(medicinesOnFile(req).map((m) => m.core));
  const texts = [...req.records.map((r) => r.text), ...req.profile.medications];
  const pieces = texts.flatMap((t) => t.split(/[；;\n]/));
  const everyDose = new Set(pieces.flatMap(doseTokens));
  const dosesOf = (names: string[]) => new Set(pieces.filter((p) => names.some((c) => p.includes(c))).flatMap(doseTokens));
  const named = (text: string) => cores.filter((c) => text.includes(c));
  // the medicine being talked about: the one the question names, or the one asked about just before
  const lastAsked = req.history?.[req.history.length - 1]?.question ?? "";
  const topic = named(req.question).length ? named(req.question) : named(lastAsked);
  const complaints = uniq([...req.question.matchAll(COMPLAINT)].map((m) => m[0]));
  const onFile = texts.join("\n");

  const meds = medicinesOnFile(req);
  /** What is being taken now: the newest prescription that names the medicine, and the profile's own line. */
  const currentDosesOf = (names: string[]) =>
    new Set(
      names.flatMap((c) =>
        [meds.find((m) => m.core === c && m.source?.kind !== "profile"), meds.find((m) => m.core === c && m.source?.kind === "profile")].flatMap((m) => (m ? doseTokens(m.line) : [])),
      ),
    );
  const asksWhy = ASKS_FOR_DIAGNOSIS.test(req.question) && !topic.length && !/药/.test(req.question);

  const removed = { diagnosis: false, test: false, change: false, missed: false, dose: false, stop: false };
  const kept: string[] = [];
  const aboutMedicine = (text: string) => named(text).length > 0 || MEDICINE_TALK.test(text);
  const guess = (text: string) => guessesIllness(text, aboutMedicine(text), complaints, asksWhy);
  /** Whether a part states only doses that are on file for what it talks about. */
  const dosesOnFile = (part: string): boolean => {
    const doses = doseTokens(part);
    if (!doses.length) return true;
    const about = named(part);
    if (LABEL_TALK.test(part.replace(CLOSING_LINE, ""))) {
      // a label's number may stand only where it is also what this person takes now
      const subject = about.length ? about : topic;
      return subject.length > 0 && doses.every((t) => currentDosesOf(subject).has(t));
    }
    const allowed = about.length ? dosesOf(about) : QUOTES_RECORD.test(part) ? (topic.length ? dosesOf(topic) : everyDose) : new Set<string>();
    return doses.every((t) => allowed.has(t));
  };
  // the last thing that stayed; null at the start and right after something was taken out
  let previous: string | null = null;
  for (const sentence of sentencesOf(tidy(answer))) {
    if (!sentence.trim()) continue;
    if (guess(sentence)) {
      removed.diagnosis = true;
      const advice = careAdvice(sentence, guess);
      if (advice) kept.push(advice);
      previous = null;
    } else if (suggestsTest(sentence, onFile)) {
      removed.test = true;
      previous = null;
    } else if (stopsOnOwn(sentence)) {
      removed.stop = true;
      previous = null;
    } else if (changesPrescription(sentence)) {
      removed.change = true;
      previous = null;
    } else if (DECIDES_MISSED_DOSE.test(sentence)) {
      removed.missed = true;
      previous = null;
    } else {
      // doses are checked part by part, so a label's number does not take the doctor's own line down with it
      const fine: string[] = [];
      for (const raw of sentence.split(/(?<=[；;])/)) {
        const part = withoutLonePointer(raw, previous);
        if (!part.trim()) continue;
        if (dosesOnFile(part)) {
          fine.push(part);
          previous = part;
        } else {
          removed.dose = true;
          previous = null;
        }
      }
      if (fine.length) kept.push(fine.join("").replace(/[；;](\s*)$/, "。$1"));
    }
  }

  const body = kept.join("").trim();
  if (urgent) return body || "先照上面红框里说的做，不要等。";
  const notes: string[] = [];
  const defers = LEAVES_IT_TO_A_DOCTOR.test(body);
  if (removed.diagnosis && (!body || (ASKS_FOR_DIAGNOSIS.test(req.question) && !defers))) notes.push("是什么病、什么原因引起的，要医生来判断。可以把相关的记录带给医生看。");
  if (removed.test && !/医生(来|会)?(决定|判断|安排)/.test(body)) notes.push("要不要做检查、做哪些检查，由医生决定。");
  if (removed.dose) notes.push("具体一次吃多少、一天吃几次，以医生开的和药盒里的说明书为准。");
  if (removed.change) notes.push("要不要调药，请问医生或药师，不要自己改。");
  if (removed.stop && !/联系医生或药师/.test(body)) notes.push(ASK_BEFORE_STOPPING);
  if (removed.missed) notes.push("漏吃的那一次现在该不该补，按药盒说明书上写的做；拿不准就问医生或药师。");
  const usage = TELLS_USAGE.test(body) || (ASKS_USAGE.test(req.question) && (topic.length > 0 || MEDICINE_WORD.test(req.question)));
  if (usage && !removed.dose && !/说明书/.test(`${body}${notes.join("")}`)) notes.push("具体以药盒里的说明书和医生的话为准。");
  if (JUDGES_READING.test(body) && !/目标/.test(body)) notes.push("这里说的范围是一般标准，你自己的目标以医生说的为准。");
  return [body, ...notes].filter(Boolean).join("\n");
}

/** An answer cut off by the length limit ends at its last whole sentence. */
function whole(answer: string, max = 700): string {
  if (answer.length <= max) return answer;
  const cut = answer.slice(0, max);
  const end = Math.max(cut.lastIndexOf("。"), cut.lastIndexOf("！"), cut.lastIndexOf("？"), cut.lastIndexOf("\n"));
  return end > max / 2 ? cut.slice(0, end + 1) : cut;
}

export function normalizeAsk(raw: unknown, req: AskRequest): Pick<AskResponse, "answer" | "sources"> {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const known = new Set(req.records.map((r) => r.id));
  // usually a list; now and then one string such as "R1, P"
  const cited = Array.isArray(o.sources) ? strList(o.sources, 8) : str(o.sources).split(/[,，、\s]+/);
  const sources = uniq(cited.map((x) => x.replace(/[\[\]\s]/g, "").toUpperCase()))
    .filter((x) => known.has(x))
    .slice(0, 4);
  const answer = guardAnswer(whole(str(o.answer)), req);
  return { answer: answer || "这个问题我答不上来。可以换个问法，或者直接问医生。", sources };
}
