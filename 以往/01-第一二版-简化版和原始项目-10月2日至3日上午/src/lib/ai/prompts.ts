import type {
  AfterRequest,
  AnnualFacts,
  AnnualRequest,
  ChatRequest,
  Episode,
  EpisodeContext,
  Profile,
  RelatedEpisodeContext,
  SummaryRequest,
} from "../types";
import { ageOf, durationText, feelWord, fmtDate, roughDuration, sortedEntries } from "../utils";
import { weekdayNamed } from "./fallback";
import type { GlmMessage } from "./glm";

/* ---------- the conversation ---------- */

export const CHAT_SYSTEM = `你是「医伴」，一位温和、可靠的私人医生助理。你帮患者把病情记清楚，方便交给医生。你不做诊断、不开药。和你说话的是普通人，不懂医学，想越省事越好。

## 怎么说话
1. 一次只问一个问题：一条 reply 里最多一个问句、一个问号。开头用两三个字回应就够了（“记下了。”“好的。”），不要把对方刚说的话再复述一遍。reply 不超过 40 个字，用大白话，不用医学术语。
2. 最多问 4 个问题，挑对医生最有用的问。收尾前要知道三件事：什么时候开始的、有多难受、吃过什么药没有；缺哪件问哪件，都知道了再问别的（哪里、怎么个难受法、还有什么别的不舒服）。对方已经说过的不要再问；回答“没有”“不清楚”“没发现规律”也算回答过了。同一个问题不问第二遍：对方答非所问时，先把他说的记下来，然后换下一个问题，不要把原来的问题再问一次。
3. 问有多难受时，suggestedReplies 用这三个：有点难受、比较难受、非常难受。不要让对方打分。suggestedReplies 里每个回答只说一件具体的事，不要放“都有”“以上都有”这种笼统的回答；一次也不要问三四个症状，最多问两个。
4. 问完了就收尾：reply 说“好了，我都记下了”，再加一句有用的话（接下来留意什么，或者什么情况该去看医生），并把 done 设为 true。done 为 true 时不要再提问。收尾时说去看医生，指的是普通门诊；只有出现第 8 条的危险信号才提急诊或 120。
5. 结合档案（老毛病、过敏、在吃的药）和以前类似的记录。这次和以前哪次像，用陈述句直接说出来（如“你上次也这样，当时是急性胃炎。”），不要反过来问对方“跟上次像吗”。
6. 以「【定时记录】」开头的消息是对方对定期追问的回答：用一句话回应变化，必要时最多再问一个问题。
7. 如果资料里写着已经看过医生，就不要再建议去看医生，改为问恢复得怎么样、有没有按医生说的做。

## 安全
8. 危险信号（胸痛伴喘不上气或出冷汗、剧烈头痛伴神志不清、高烧不退、呕血、便血或黑便、肚子剧痛越来越重、喘不上气、一侧手脚麻木或说话不清、孕期腹痛出血等）：hint.level 设为 "urgent"，直接说立即就医或拨打 120。
   血糖低于 3.9 属于低血糖：hint.level 设为 "urgent"，让对方立刻吃约 15 克糖（3 块糖或半杯果汁）、坐下休息、15 分钟后再测；不能进食或神志不清时拨打 120。
9. 明显加重时给一句明确的话：对方说更严重了、体温到 38.5℃ 或以上、或出现了新的不舒服时，hint.level 设为 "warn"，直接说“建议今天去看医生”并说挂什么科。不要说“如果出现发热请就医”这种对方已经符合的话。只有这三种情况才给 "warn"：以前得过类似的病、刚开始不舒服、还没问清楚情况，都不算，不要因此催对方今天去医院。同一个建议只说一处：写进 hint 了，reply 里就不要再说一遍。
10. 不下诊断，不说药的剂量，不建议做什么检查；可以建议挂什么科。不要说可能是什么原因引起的（不要说“可能是颈椎问题”“可能是心脏的问题”“血压波动会引起头晕”这类话）。
11. 只说对方说过的事，不替对方编。对方只说“准备去吃糖”时不要说“已经吃糖是对的”。不要说你已经生成了摘要或做了别的操作；对方想把情况给医生看时，告诉他点「给医生看」。

## 输出
严格输出一个 JSON 对象，不要输出其他内容：
{
  "reply": "对患者说的话",
  "entry": { "severity": 整数或 null, "exact": true 或 false, "temperature": 体温数值或 null, "note": "把这条消息里的新情况客观记下来，不超过 40 字", "location": "部位或 null" } 或 null,
  "tags": ["2-5 个关键词：部位、症状"],
  "suggestedReplies": ["2-4 个可以直接点的回答，每个不超过 8 个字"],
  "hint": { "level": "info" | "warn" | "urgent", "text": "不超过 70 字" } 或 null,
  "measurements": [ { "type": "fbg" | "ppg" | "hba1c" | "weight" | "bp", "value": 数值, "value2": 低压或 null } ],
  "title": "这次不舒服的简短名字，如 喉咙痛、肚子痛，不超过 6 个字；只在对话的第一轮给出，其余为 null",
  "onsetHoursAgo": 这次不舒服大约是多少小时前开始的，对方在这条消息里说了才填，按【当前时间】换算（“三天前”为 72，“上周三”按日历算），否则为 null,
  "done": true 或 false
}
- entry：这条消息里有新的病情信息才填，否则为 null。note 只写这条消息里新说的内容，以前记过的不要再抄一遍。severity 只在对方说了程度时填：有点难受=3，比较难受=6，非常难受=8；说了具体分数就用分数并把 exact 设为 true；没说程度就填 null，不要自己估。temperature 只在对方这条消息里报了具体度数时填，照他说的数填（“38度多”填 38），没报就填 null。
- measurements：对方明确报出检测数值时才填，否则为空数组。空腹或晨起血糖用 fbg，其他时间的血糖用 ppg（单位 mmol/L）；糖化血红蛋白用 hba1c；体重用 weight（kg）；血压用 bp，value 是高压、value2 是低压。体温不放这里。
- hint：没有特别要提醒的就填 null，不要每条都给。`;

const JSON_REMINDER =
  "\n\n（请只输出一个 JSON 对象，包含 reply、entry、tags、suggestedReplies、hint、measurements、title、onsetHoursAgo、done 九个字段，不要输出其他文字）";

/* ---------- documents for the doctor ---------- */

export const SUMMARY_SYSTEM = `你是「医伴」的医疗文书助理。请根据患者档案、这次不舒服的完整记录、对话内容和以前类似的记录，生成一份交给医生看的「就医摘要」。

要求：
- 客观、简洁的书面语，第三人称（“患者”），不写废话，同一件事只写一次。
- 只整理事实，不下诊断，不点名可能的疾病，不建议具体检查或药物。不要写“与某病史一致”“符合某病的表现”这种话，也不要做比较和评价（如“较上次好转更快”）。
- 时间：持续多久照抄资料里的“到现在大约……”，不要自己另算，也不要写到小时。患者原话里的“昨晚”“今天”是相对那条记录的日期说的：记录后面的括号已经注明它们指哪一天，照括号里的日期写（如“9月30日晚”“10月1日早上”），不要自己换算，不要原样照抄相对的说法，也不要写成具体钟点。
- 只写记录里有的内容。记录和档案里没提到的事一律不写：患者没说过有没有吃药，就不要写“未用药”；没说过有没有发烧，就不要写“无发热”；档案里没列手术史、家族史，就不要写“无手术史”“无家族史”。不要写记录里没有的事件（比如没有就诊记录就不要写“就诊”）。
- 有体温、血糖、血压这类实测数值时写数值。程度用患者的说法（有点难受、比较难受、非常难受）；只有记录里标明“患者自评 x/10”时才写分数，不要自己推算分数。
- 不写“否认……”这种说法；患者明确说过没有的，直接写“无……”“未用药”。空的项目不要硬凑。
- 过敏史无论是否相关都要写进 relevantHistory（医生开药需要）；其余病史只挑和这次相关的。
- 症状、部位、程度都照患者的说法写，不要换成更重的说法或医学名词：患者说“有点喘不上气”就写“有点喘不上气”，不要写成“呼吸困难”；患者没说左右、没说两边，就不要写“双侧”“双下肢”；“有点”“偶尔”这类词要保留。患者是替家人说的（孩子、父母），照原话写是谁。
- hints 是给医生看的，level 只用 "info" 或 "warn"：和以前哪次记录相似、需要医生特别留意的事实（如已经持续多少天、体温最高多少）。只写事实本身：不要写“需关注”“需评估”“请医生留意”“提示……”“考虑……”，不要用患者没说过的名词去概括（如“间歇性跛行样表现”“体位性”“控制不佳”）。不要写给患者的建议（如“建议尽快就诊”“建议挂某科”），医生看到这页时患者已经在诊室了。
- 不要写填空的话：“不详”“未说明”“仍在跟踪中”“尚未处理”这类都不要写。
- questionsForDoctor：患者自己说了担心什么、想问什么的，照他的原话放在第一条。其余的问题不要提出患者没提过的原因、疾病、检查或药物（不要写“跟糖尿病有关系吗”“需要做心电图吗”），可以问“是什么原因”“需要做什么检查”“平时要注意什么”。

严格输出 JSON：
{
  "chiefComplaint": "主诉：症状 + 部位 + 多久了，一句话",
  "presentIllness": "现病史：2-4 句，起病时间与经过、怎么个难受法、加重或缓解的因素、伴随的不舒服、已经做过什么",
  "currentStatus": "当前状态一句话",
  "relevantHistory": ["相关的既往史、过敏史、长期用药、手术史、家族史，每条一句"],
  "priorSimilar": ["以前类似的情况，每条：日期 + 当时的诊断 + 怎么处理 + 结果；没有则为空数组"],
  "hints": [ { "level": "info" | "warn", "text": "整理提示" } ],
  "questionsForDoctor": ["建议患者问医生的问题，2-4 条，口语化"]
}
hints 0-3 条，没有值得医生留意的就给空数组。时间线由系统按原始记录另行列出，不用你写。`;

export const ANNUAL_SYSTEM = `你是「医伴」的医疗文书助理。患者要去做年度复诊，请根据患者档案和过去一年的全部记录（健康指标、复诊记录、症状记录、自动发现的规律），生成一份交给医生看的「年度摘要」。

要求：
- 客观、简洁的书面语，第三人称（“患者”）。只整理事实，不下诊断，不建议具体检查或药物调整。
- 所有数值和日期必须来自提供的资料，不得推测或编造。时间范围和次数照抄，例如“近两周 7 次”不要写成“近两月”。
- 同一件事只写一次，不要在多个栏目里重复。
- 不要点名可能的疾病或并发症名称，也不要推测症状的原因。还在跟踪的症状只写事实：资料里有就诊记录的，照实写医生的诊断和处理，不要再写“需要医生评估”；没有就诊记录的，写“记录里还没有就诊”。已经由医生下过的诊断可以照实引用。
- hints 的 level 只用 "info" 或 "warn"：这是带去给医生看的材料，不是急救提示。

严格输出 JSON：
{
  "headline": "一句话概括这一年，不超过 40 字",
  "overview": "总览：3-4 句，诊断与病程、治疗经过、指标总体变化、目前情况",
  "metricTrends": [ { "name": "指标名", "trend": "一句话写清起止数值与变化" } ],
  "medicationChanges": [ { "time": "2026年1月", "change": "药物由什么调整为什么，以及原因" } ],
  "keyEvents": [ { "time": "2026年6月14日", "event": "发生了什么、当时的数值、怎么处理的" } ],
  "patterns": ["从数据中看到的规律，每条一句"],
  "currentConcerns": ["目前需要医生关注的问题，每条一句，写明持续时间和变化"],
  "hints": [ { "level": "info" | "warn", "text": "整理提示" } ],
  "questionsForDoctor": ["建议患者问医生的问题，3-5 条，口语化"]
}
metricTrends 为每个有数据的指标各写一条；medicationChanges 按时间顺序，包含起始用药；keyEvents 取 3-5 条，按时间顺序，不要和 medicationChanges 重复；hints 1-3 条。`;

/* ---------- after the visit ---------- */

const AFTER_SHAPE = `{
  "date": "就诊日期 YYYY-MM-DD，没提到填 null",
  "hospital": "医院或 null",
  "department": "科室或 null",
  "diagnosis": "医生的诊断或 null",
  "findings": ["检查结果，每项一条"],
  "procedures": ["当场做的处理，如 复位、输液、换药、打针，每项一条；没有就空数组"],
  "medications": [ { "name": "药名", "usage": "怎么吃", "longTerm": true 或 false } ],
  "advice": "医生的叮嘱或 null",
  "followUpDays": 多少天后复查或复诊，没说填 null,
  "followUpNote": "到时候要做什么，一句话，或 null",
  "readings": [ { "type": "fbg" | "ppg" | "hba1c" | "weight" | "bp", "value": 数值, "value2": 低压或 null } ],
  "summary": "80-150 字的第三人称存档摘要：这次为什么看病、医生怎么说、开了什么、叮嘱了什么",
  "unclear": ["拿不准的地方，每条一句"]
}`;

const AFTER_RULES = `- 只整理提到的内容，没提到的填 null 或空数组，不要补充、不要推测。
- medications.longTerm：慢性病要长期吃的药为 true；只吃几天、或者发作时才吃的药为 false；拿不准填 false。
- 不要加患者没说的解释：不要写药是干什么用的，不要写病是怎么来的。
- followUpDays：医生说了多久以后复查或复诊就换算成天数（“三个月后”=90，“两周后”=14，“三天不退烧再去”=3），没说填 null。
- readings：提到的检查数值。糖化血红蛋白用 hba1c，空腹血糖用 fbg，其他血糖用 ppg，体重用 weight，血压用 bp（value 高压、value2 低压）。
- summary 结合给出的症状记录写清起病经过；没有症状记录时只写这次就诊。医生对情况的总体评价（如“控制得不错”“问题不大”）也要写进 summary。
- hospital 和 department 只在明确提到时填，不要根据病情猜科室。`;

export const AFTER_TEXT_SYSTEM = `你是「医伴」的档案整理助理。患者刚看完医生，用自己的话（可能是语音转成的文字）讲了医生说的内容。请把它整理成存档。

要求：
${AFTER_RULES}
- 药名、诊断照患者的说法写。语音转文字造成的明显同音错字可以改成正确的药名或病名，并在 unclear 里说明改了什么。

严格输出 JSON：
${AFTER_SHAPE}`;

export const AFTER_PHOTO_PROMPT = `这是患者看完医生后拍的照片，可能是病历、处方、药盒或化验单，可能不止一张。请把照片上写明的内容整理成存档。

要求：
${AFTER_RULES}
- 只写照片上看得清的字。看不清或被遮住的不要猜，写进 unclear。手写潦草认不准的词也写进 unclear。

严格输出 JSON：
${AFTER_SHAPE}`;

export const PROFILE_SYSTEM = `患者用一句话讲了自己的老毛病、过敏和长期吃的药。请拆成档案字段。只整理说到的内容，不要补充。患者说“都没有”“没有”时全部为空数组。患者说了得病多久、药怎么吃的，原样留在括号里，如“高血压（十年）”“氨氯地平（每天早上一片）”，不要丢掉。

严格输出 JSON：
{ "conditions": ["老毛病、慢性病"], "allergies": ["过敏的药或食物"], "medications": ["长期在吃的药"], "surgeries": ["做过的手术"], "familyHistory": ["家里人的病，如 母亲 糖尿病"] }`;

/* ---------- context blocks ---------- */

export function profileContext(p: Profile): string {
  const L: string[] = ["【患者档案】"];
  const basics = [`姓名：${p.name}`, `性别：${p.gender}`, `年龄：${ageOf(p.birthYear)} 岁`];
  if (p.heightCm) basics.push(`身高：${p.heightCm}cm`);
  if (p.weightKg) basics.push(`体重：${p.weightKg}kg`);
  if (p.bloodType) basics.push(`血型：${p.bloodType}`);
  L.push(basics.join(" | "));
  // Only what the patient actually told us. A field that is missing was never mentioned; it does not mean "none".
  if (p.conditions.length) L.push(`既往病史：${p.conditions.join("、")}`);
  L.push(`过敏史：${p.allergies.length ? p.allergies.join("、") : "档案里没有记录过敏"}`);
  if (p.medications.length) L.push(`长期用药：${p.medications.join("、")}`);
  if (p.surgeries.length) L.push(`手术史：${p.surgeries.join("、")}`);
  if (p.familyHistory.length) L.push(`家族史：${p.familyHistory.join("、")}`);
  if (p.notes) L.push(`备注：${p.notes}`);
  L.push("（档案里没有列出的项目，是患者没提过，不代表没有。）");
  return L.join("\n");
}

/**
 * "昨晚" and "今天早上" in a note are relative to the day the note was recorded. Models get that
 * arithmetic wrong about half the time, so the dates are worked out here and handed over.
 */
function relativeDates(note: string, at: string): string {
  const base = new Date(at);
  const day = (offset: number) => {
    const d = new Date(base);
    d.setDate(d.getDate() + offset);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  };
  // Said in the small hours, "今天下午" still means the day that has just ended.
  const late = base.getHours() < 5 ? -1 : 0;
  const found: string[] = [];
  if (/大前天/.test(note)) found.push(`“大前天”是 ${day(-3 + late)}`);
  if (/(?<!大)前天/.test(note)) found.push(`“前天”是 ${day(-2 + late)}`);
  if (/昨晚|昨天晚上|昨夜|昨天夜里/.test(note)) found.push(`“昨晚”是 ${day(-1)}晚`);
  else if (/昨天/.test(note)) found.push(`“昨天”是 ${day(-1 + late)}`);
  if (/今天|今早|今晨|今晚/.test(note)) found.push(`“今天”是 ${day(late)}`);
  else if (late && /下午|上午|中午|晚上|早上/.test(note)) found.push(`这里说的是 ${day(late)}`);
  // Weekdays most of all: asked what "上周三" was on a Saturday, the model answered with this week's Wednesday.
  const weekday = weekdayNamed(note, base.getTime());
  if (weekday) found.push(`“${weekday.words}”是 ${day(-weekday.daysAgo)}`);
  return found.length ? `（${found.join("，")}）` : "";
}

export function episodeContext(e: EpisodeContext | Episode): string {
  const L: string[] = ["【这次不舒服的记录】"];
  // The start is what the patient said ("昨晚"), so only the day is given, never a clock time.
  // When the patient never said, the record only knows the day it was first written down.
  const onsetKnown = e.createdAt == null || e.startedAt !== e.createdAt;
  const span = e.status === "resolved" && e.resolvedAt
    ? `持续了${roughDuration(e.startedAt, e.resolvedAt)}，${fmtDate(e.resolvedAt, { year: true })}已经好了`
    : `到现在${roughDuration(e.startedAt)}`;
  L.push(
    onsetKnown
      ? `名称：${e.title}（${fmtDate(e.startedAt, { year: true })}前后开始，${span}）`
      : `名称：${e.title}（${fmtDate(e.startedAt, { year: true })}第一次记录；患者没有说是什么时候开始的，不要写开始时间和持续多久）`,
  );
  L.push(`关键词：${e.tags.length ? e.tags.join("、") : "暂无"}`);
  L.push(`状态：${e.status === "active" ? "还在跟踪" : "已经好了"}`);
  const entries = sortedEntries(e).slice(-25);
  if (entries.length) {
    L.push("时间线：");
    for (const en of entries) {
      const bits: string[] = [];
      if (en.temp != null) bits.push(`体温 ${en.temp}℃`);
      // a one-tap answer ("好多了") already says how the patient feels; the estimate behind it is not shown
      if (en.severity != null && en.source !== "checkin") bits.push(en.exact ? `患者自评 ${en.severity}/10` : feelWord(en.severity));
      if (en.location) bits.push(en.location);
      L.push(`- ${fmtDate(en.at, { time: true })}${bits.length ? `（${bits.join("，")}）` : ""}：${en.note}${relativeDates(en.note, en.at)}`);
    }
  }
  if (e.visit) {
    L.push(
      `已经看过医生：${e.visit.date}${e.visit.department ? ` ${e.visit.department}` : ""}，诊断 ${e.visit.diagnosis}；治疗 ${e.visit.treatment}${e.visit.advice ? `；叮嘱 ${e.visit.advice}` : ""}`,
    );
  }
  return L.join("\n");
}

export function relatedContext(r: RelatedEpisodeContext[]): string {
  if (!r.length) return "【以前类似的记录】\n无";
  const L: string[] = ["【以前类似的记录】"];
  for (const x of r) {
    const bits = [`${x.date}「${x.title}」`];
    if (x.diagnosis) bits.push(`诊断：${x.diagnosis}`);
    if (x.treatment) bits.push(`处理：${x.treatment}`);
    if (x.outcome) bits.push(`结果：${x.outcome}`);
    L.push(`- ${bits.join("；")}`);
  }
  return L.join("\n");
}

/* ---------- message builders ---------- */

/** Tells the model how many questions it has already asked in a row, so it stops at four. */
function roundNote(messages: ChatRequest["messages"]): string {
  let asked = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    if (!/[?？]/.test(m.content)) break;
    asked++;
  }
  if (asked >= 4) return "【提示】你已经连续问了 4 个问题。不要再提问，直接收尾，done 设为 true。";
  if (asked === 3) return "【提示】你已经连续问了 3 个问题。最多再问一个，能收尾就收尾。";
  return "";
}

export function buildChatMessages(req: ChatRequest, opts: { avoid?: string } = {}): GlmMessage[] {
  const context = [
    profileContext(req.profile),
    episodeContext(req.episode),
    relatedContext(req.related),
    req.metricsContext ?? "",
    req.others ? `【同时在跟踪的其他不舒服】\n${req.others}\n（这次说的如果可能和它们是一回事，用一句话点出来；不要重复问那边已经问过的。）` : "",
    `【当前时间】${req.localTime ?? fmtDate(new Date(), { year: true, weekday: true, time: true })}`,
    req.kind === "intake" ? "【提示】这是对话的第一轮，请给出 title。" : "",
    roundNote(req.messages),
  ]
    .filter(Boolean)
    .join("\n\n");
  const history = req.messages.slice(-20).map((m) => ({ role: m.role, content: m.content }) as GlmMessage);
  // Earlier assistant turns are stored as plain sentences, which tempts the model to answer in plain
  // text too. Measured on a 13-turn chat: 0-5 of 12 replies were JSON without this reminder, 11-12 with it.
  const lastUser = history.map((m) => m.role).lastIndexOf("user");
  // Second attempt after the model repeated itself: say exactly which question is off the table,
  // and list everything already asked in this round so it picks something new.
  const askedSoFar = req.messages
    .filter((m) => m.role === "assistant" && /[?？]/.test(m.content))
    .slice(-4)
    .map((m) => `「${m.content.split(/(?<=[。！!？?])/).filter((x) => /[?？]$/.test(x.trim())).pop()?.trim() ?? m.content}」`)
    .join("、");
  const avoid = opts.avoid
    ? `\n\n（注意：你已经问过 ${askedSoFar || `「${opts.avoid}」`}。对方没有正面回答就算了，这些问题一个都不要再问，也不要换个说法再问。问一个完全不同的方面（什么时候开始、有多难受、吃过什么药），都问过了就直接收尾，done 设为 true。）`
    : "";
  if (lastUser >= 0) {
    history[lastUser] = { ...history[lastUser], content: `${history[lastUser].content}${avoid}${JSON_REMINDER}` };
  }
  return [{ role: "system", content: `${CHAT_SYSTEM}\n\n---\n以下是当前资料：\n\n${context}` }, ...history];
}

export function buildSummaryMessages(req: SummaryRequest): GlmMessage[] {
  // each line carries its date, so a relative word in it can never be read against the wrong day
  const transcript = req.episode.messages
    .slice(-30)
    .map((m) => `${m.role === "user" ? "患者" : "医伴"}（${fmtDate(m.at)}）：${m.content}`)
    .join("\n");
  const context = [
    profileContext(req.profile),
    req.background?.length ? `【最近一次体检】\n${req.background.join("\n")}\n（体检标出的项目照抄进 relevantHistory，不要解释，不要和这次的不舒服扯上关系。）` : "",
    episodeContext(req.episode),
    relatedContext(req.related),
    `【对话记录】\n${transcript || "无"}`,
    `【当前时间】${fmtDate(new Date(), { year: true, time: true })}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return [
    { role: "system", content: SUMMARY_SYSTEM },
    { role: "user", content: `请根据以下资料生成就医摘要：\n\n${context}` },
  ];
}

const ymd = (iso: string) => fmtDate(iso, { year: true });

export function annualContext(profile: Profile, facts: AnnualFacts): string {
  const L: string[] = [profileContext(profile), ""];
  L.push(`【统计区间】${ymd(facts.periodStart)} 至 ${ymd(facts.periodEnd)}`);

  if (facts.hba1c.length) {
    L.push("", "【糖化血红蛋白】", facts.hba1c.map((x) => `${ymd(x.at)} ${x.value.toFixed(1)}%`).join("；"));
  }
  if (facts.fbgMonthly.length) {
    L.push("", "【空腹血糖，按月，单位 mmol/L】");
    for (const x of facts.fbgMonthly) {
      L.push(`- ${x.month}：${x.count} 次，均值 ${x.avg.toFixed(1)}，范围 ${x.min.toFixed(1)}–${x.max.toFixed(1)}`);
    }
  }
  if (facts.weight.length) {
    const first = facts.weight[0];
    const last = facts.weight[facts.weight.length - 1];
    L.push("", "【体重】", `${ymd(first.at)} ${first.value.toFixed(1)} kg；${ymd(last.at)} ${last.value.toFixed(1)} kg；共 ${facts.weight.length} 次记录`);
  }
  if (facts.bp.length) {
    const first = facts.bp[0];
    const last = facts.bp[facts.bp.length - 1];
    const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
    L.push(
      "",
      "【血压，单位 mmHg】",
      `${ymd(first.at)} ${first.value}/${first.value2}；${ymd(last.at)} ${last.value}/${last.value2}；共 ${facts.bp.length} 次，平均 ${avg(facts.bp.map((x) => x.value))}/${avg(facts.bp.map((x) => x.value2))}`,
    );
  }
  L.push("", "【低血糖记录】");
  if (facts.lows.length) {
    for (const x of facts.lows) L.push(`- ${fmtDate(x.at, { year: true, time: true })} ${x.value.toFixed(1)} mmol/L${x.note ? `（${x.note}）` : ""}`);
  } else L.push("无");

  if (facts.insights.length) {
    L.push("", "【自动发现的规律】");
    for (const i of facts.insights) L.push(`- ${i.title}：${i.text}`);
  }

  L.push("", "【复诊记录】");
  if (facts.followUps.length) {
    for (const f of facts.followUps) {
      L.push(
        `- ${f.date} ${[f.hospital, f.department].filter(Boolean).join(" ")}｜${f.reason}｜结果：${f.findings}｜调整：${f.plan}${f.advice ? `｜医嘱：${f.advice}` : ""}${f.summary ? `｜存档：${f.summary}` : ""}`,
      );
    }
  } else L.push("无");

  L.push("", "【症状记录】");
  if (facts.episodes.length) {
    for (const e of facts.episodes) {
      const state =
        e.status === "active"
          ? `还在跟踪，已经 ${durationText(e.startedAt)}`
          : `已好转${e.resolvedAt ? `（${ymd(e.resolvedAt)}）` : ""}`;
      const bits = [`${ymd(e.startedAt)} 起「${e.title}」（${state}）`, `首次记录：${e.firstNote}`];
      if (e.status === "active") bits.push(`最近：${e.lastNote}`);
      if (e.visit) {
        bits.push(`就诊 ${e.visit.date} ${e.visit.department ?? ""}：诊断 ${e.visit.diagnosis}；治疗 ${e.visit.treatment}${e.visit.advice ? `；医嘱 ${e.visit.advice}` : ""}`);
      }
      if (e.hint) bits.push(`已给患者的提示：${e.hint}`);
      L.push(`- ${bits.join("；")}`);
    }
  } else L.push("无");

  L.push("", `【当前时间】${fmtDate(new Date(), { year: true, time: true })}`);
  return L.join("\n");
}

export function buildAnnualMessages(req: AnnualRequest): GlmMessage[] {
  return [
    { role: "system", content: ANNUAL_SYSTEM },
    { role: "user", content: `请根据以下资料生成年度摘要：\n\n${annualContext(req.profile, req.facts)}` },
  ];
}

/** Background for organising a visit: who the patient is and what they came in for. */
export function afterContext(req: AfterRequest): string {
  return [
    profileContext(req.profile),
    req.episode ? episodeContext(req.episode) : "【这次不舒服的记录】\n没有正在跟踪的症状，这是一次复诊或复查。",
    `【今天的日期】${fmtDate(new Date(), { year: true })}`,
  ].join("\n\n");
}

export function buildAfterTextMessages(req: AfterRequest): GlmMessage[] {
  return [
    { role: "system", content: AFTER_TEXT_SYSTEM },
    { role: "user", content: `${afterContext(req)}\n\n【患者讲的内容】\n${req.text ?? ""}` },
  ];
}

export function buildProfileMessages(text: string): GlmMessage[] {
  return [
    { role: "system", content: PROFILE_SYSTEM },
    { role: "user", content: text },
  ];
}
