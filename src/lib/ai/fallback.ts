import type {
  AfterMedication,
  AfterRequest,
  AfterResponse,
  AnnualRequest,
  AnnualResponse,
  ChatMeasurement,
  ChatRequest,
  ChatResponse,
  Episode,
  Hint,
  ProfileParseResponse,
  SummaryRequest,
  SummaryResponse,
} from "../types";
import { inChinese } from "../lang";
import { confirmQuestion, confirmedNote, findColloquial, termAsked } from "../colloquial";
import { evaluateMeasurement } from "../metrics";
import {
  NO_DIAGNOSIS,
  autoTags,
  calendarDays,
  clampSeverity,
  clipText,
  detectSymptoms,
  extractLocation,
  feelWord,
  fmtDate,
  fmtISODate,
  hoursBetween,
  latestSeverityEntry,
  mentions,
  provisionalTitle,
  roughDuration,
  sortedEntries,
  stripOpening,
  textOverlap,
  uniq,
} from "../utils";

/*
 * The built-in rule engine. It answers when no API key is configured or the model cannot be
 * reached, and it also supplies the safety checks that must not depend on a model.
 *
 * For now it speaks Chinese only. What it writes is stored, shown to the doctor and checked by
 * filters that read Chinese, so every exported function that produces wording runs inside
 * inChinese(): however it is called, no English date or duration ends up in a Chinese sentence.
 * The functions that only read a sentence (extractOnsetHours and the like) produce no wording.
 */

/* ---------- danger signals ---------- */

const CHEST = /胸痛|胸闷|胸口.{0,4}(痛|疼|闷|压|紧)|心口.{0,3}(痛|疼)|心前区/;
const BREATH = /呼吸困难|喘不上气|喘不过气|上不来气|透不过气|憋得慌|窒息|嘴唇发紫/;

const URGENT: { re: RegExp; text: string }[] = [
  {
    re: CHEST,
    text: "胸口痛、胸口闷不能拖。如果还喘不上气、出冷汗，或者痛到左胳膊、下巴，请立即拨打 120 或去急诊。",
  },
  {
    re: BREATH,
    text: "喘不上气是危险信号，请立即就医或拨打 120。",
  },
  {
    re: /昏迷|晕倒|晕过去|昏过去|意识不清|意识模糊|神志不清|叫不醒|抽搐/,
    text: "神志不清或抽搐是急症，请立即拨打 120。",
  },
  {
    re: /呕血|吐血|咳血|便血|黑便|柏油|血尿|大出血|大便.{0,8}(黑|血)|拉.{0,2}血|吐.{0,4}血/,
    text: "吐血、便血或大便发黑是危险信号，请立即去急诊。",
  },
  {
    re: /剧烈|撕裂|刀割|无法忍受|受不了|痛得打滚|疼得打滚/,
    text: "痛得受不了的时候不要硬扛，建议尽快去急诊。",
  },
  {
    re: /(39|40|41)(\.\d)?\s*(度|℃|°)|高热不退|高烧不退|烧到 ?(39|40|41)/,
    text: "烧到 39 度以上请尽快就医，路上注意多喝水。",
  },
  {
    re: /口齿不清|说话不清|嘴歪|口角歪|半边.{0,4}(麻|无力|不能动)|一侧.{0,4}(麻|无力)|看东西重影/,
    text: "一侧手脚发麻无力、说话不清或看东西重影是危险信号，请立即拨打 120。",
  },
  {
    re: /喉咙.{0,4}(肿|发紧)|嘴唇.{0,3}肿|过敏.{0,8}(喘|呼吸)|全身.{0,4}(皮疹|起疹|风团)/,
    text: "嘴唇或喉咙肿、全身起疹子是危险信号。如果喉咙发紧或者喘不上气，请立即就医或拨打 120。",
  },
  { re: /怀孕.*(出血|腹痛|肚子痛)|孕.*(出血|腹痛)/, text: "怀孕期间肚子痛或出血，请立即去产科急诊。" },
];

export function detectUrgent(text: string): Hint | null {
  return inChinese(() => urgentIn(text));
}

function urgentIn(text: string): Hint | null {
  // the two together are the classic emergency: say so plainly instead of "if you also..."
  const chest = text.match(CHEST);
  const breath = text.match(BREATH);
  if (chest && breath && mentions(text, chest[0]) && mentions(text, breath[0])) {
    return { level: "urgent", text: "胸口不舒服加上喘不上气是危险信号。请立即拨打 120 或去急诊，不要自己开车。" };
  }
  for (const u of URGENT) {
    const m = text.match(u.re);
    // "没有胸痛" / "不发烧" must not raise an alarm
    if (m && mentions(text, m[0])) return { level: "urgent", text: u.text };
  }
  return null;
}

/**
 * Checks one sentence for anything that needs a reaction right now: a danger signal, or a
 * reading in the dangerous range. Runs in the browser before any model is asked.
 */
export function instantAlert(text: string): Hint | null {
  return inChinese(() => alertIn(text));
}

function alertIn(text: string): Hint | null {
  const reading = extractMeasurements(text)
    .map((m) => evaluateMeasurement(m))
    .find((h): h is Hint => h != null && h.level === "urgent");
  return reading ?? detectUrgent(text);
}

/* ---------- reading things out of a sentence ---------- */

const WORDS_TO_SCORE: [RegExp, number][] = [
  [/非常难受|特别难受|很严重|难受极了/, 8],
  [/比较难受|挺难受|很难受/, 6],
  [/有点难受|有一点难受|轻微|不太难受/, 3],
];

/**
 * Reads how bad it is. An explicit "N 分" always wins and is marked exact. Words such as
 * "比较难受" map to a rough score. Relative words ("好多了" / "更严重了") only count in short
 * answers, because in longer sentences they usually describe a trigger ("吃完饭更痛").
 */
export function extractSeverity(text: string, prev: number | null): { severity: number | null; exact: boolean } {
  const m = text.match(/(\d{1,2})\s*(分|级|\/\s*10)/);
  if (m) return { severity: clampSeverity(m[1]), exact: true };
  for (const [re, score] of WORDS_TO_SCORE) if (re.test(text)) return { severity: score, exact: false };
  if (prev == null || text.length > 14) return { severity: null, exact: false };
  if (/好多了|明显缓解|基本不|好一些|好一点|轻多了|好转/.test(text)) return { severity: Math.max(0, prev - 2), exact: false };
  if (/更严重|加重了|更痛了|厉害了|恶化|更难受/.test(text)) return { severity: Math.min(10, prev + 2), exact: false };
  if (/差不多|还是一样|跟之前一样|和之前一样|没变化|没什么变化|还是这样/.test(text)) return { severity: prev, exact: false };
  return { severity: null, exact: false };
}

const CN_DIGIT: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
/** 38.5度, 38度5 */
const TEMP_WITH_UNIT = /(?<![\d.])(3[5-9]|4[0-2])(?:\.(\d))?\s*(?:度|℃|°)(\d(?![\d天次个小周片粒点]))?/g;
/** 体温 37.8, 烧到38: no unit, but the words before say it is a temperature */
const TEMP_AFTER_WORD = /(?:体温|烧到|发烧到?|量了)[^\d]{0,4}(3[5-9]|4[0-2])(?:\.(\d))?/g;
/** 现在 38.2, 今天早上37.5: only with a decimal, and only where the talk is of a fever */
const TEMP_IN_PASSING = /(?:现在|早上|晚上|下午|最高|降到|退到|升到|又到)[^\d]{0,3}(3[5-9]|4[0-2])\.(\d)(?![\d\/])/g;
/** 三十八度五, 三十九度, 三十八点五度: speech sometimes arrives as words */
const TEMP_SPOKEN = /(三十[五六七八九]|四十[一二]?)(?:点([一二三四五六七八九])度?|度(?:([一二三四五六七八九])|(半))?)/g;

/**
 * Every body temperature stated in the text. Ones said with a unit come first, in the order they
 * were said: "最高烧到39.2度，今天早上37.5" gives [39.2, 37.5].
 */
export function extractTemperatures(text: string): number[] {
  const withUnit = [...text.matchAll(TEMP_WITH_UNIT)].map((m) => Number(`${m[1]}.${m[2] ?? m[3] ?? 0}`));
  const afterWord = [...text.matchAll(TEMP_AFTER_WORD)].map((m) => Number(`${m[1]}.${m[2] ?? 0}`));
  const spoken = [...text.matchAll(TEMP_SPOKEN)].map((m) => {
    const whole = m[1].startsWith("四十") ? 40 + (m[1][2] ? CN_DIGIT[m[1][2]] : 0) : 30 + CN_DIGIT[m[1][2]];
    const tenth = m[2] ?? m[3];
    return whole + (tenth ? CN_DIGIT[tenth] / 10 : m[4] ? 0.5 : 0);
  });
  const inPassing = /烧|体温|发热/.test(text) ? [...text.matchAll(TEMP_IN_PASSING)].map((m) => Number(`${m[1]}.${m[2]}`)) : [];
  return uniq([...withUnit, ...afterWord, ...spoken, ...inPassing]);
}

/** A body temperature stated in the text, e.g. "烧到38.5度". */
export function extractTemperature(text: string): number | null {
  return extractTemperatures(text)[0] ?? null;
}

/* ---------- when it began ---------- */

const CN_NUM: Record<string, number> = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 半: 0.5 };
const num = (s: string) => (s in CN_NUM ? CN_NUM[s] : Number(s));

/** "3", "三", "十二", "二十", "半", "几" (taken as three), "两三" (the larger of the two). NaN when it is no number. */
function spokenNumber(s: string): number {
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s === "几" || s === "好几") return 3;
  if (s === "十几") return 15;
  const tens = s.match(/^([一二两三四五六七八九])?十([一二三四五六七八九])?$/);
  if (tens) return (tens[1] ? CN_DIGIT[tens[1]] : 1) * 10 + (tens[2] ? CN_DIGIT[tens[2]] : 0);
  if (s.length === 2 && s[0] in CN_DIGIT && s[1] in CN_DIGIT) return CN_DIGIT[s[1]];
  return s in CN_NUM ? CN_NUM[s] : NaN;
}

const CLAUSE_SPLIT = /[，,。；;！!？?\n]/;
/** the clause itself says this is when it began */
const ONSET_MARK = /开始|突然|出现|发作|犯了|又犯|以来|到现在|至今|就(觉得|感觉|有点|有些|不舒服|难受|疼|痛|晕|咳|吐|拉|烧)/;
/** it eased then: not a beginning */
const BETTER = /好一点|好一些|好多了|好些|好转|缓解|减轻|轻了|退了|退下|退烧|消了|不疼了|不痛了|不烧了|不晕了|没事了|正常了/;
/** taking something or seeing someone has a time of its own */
const TOOK = /(吃|喝|服|用|涂|贴|擦|抹|喷|滴|打|输|挂|敷)(了|过|完)|吃药|服药|用药|上药|换药/;
const WENT =
  /去(了|过)?(医院|诊所|门诊|急诊|社区|药店)|看(了|过)?(医生|大夫|急诊|门诊)|挂(了)?号|做(了|过)?(检查|胃镜|肠镜|B超|彩超|CT|核磁|心电图|手术|化验)|拍(了)?片|抽(了)?血|住院|出院|复查|复诊|体检/i;
/** so has taking a reading: "今天早上量体温 37.8" says when it was measured */
const MEASURED = /量|测|体温|血压|血糖|心率|脉搏/;
/** How long a standing condition has been there is the history, not this complaint. */
const BACKGROUND =
  /高血压|糖尿病|高血脂|高尿酸|冠心病|心脏病|心梗|脑梗|中风|哮喘|慢阻肺|痛风|甲亢|甲减|肝炎|乙肝|脂肪肝|肾炎|肾病|胃炎|胃溃疡|肠炎|鼻炎|咽炎|支气管炎|关节炎|颈椎病|腰椎间盘|肿瘤|癌|结石|贫血|抑郁症|焦虑症|癫痫|慢性病|基础病|老毛病|病史|手术|确诊|查出|得过|做过|退休|绝经|怀孕|戒烟|戒酒/;
/** "三天", "一个多星期", "两个半月", "一年半": 1 number, 2 个, 3 半, 4 unit, 5 半 */
const DURATION =
  /(?<![第每隔\d.])(\d+(?:\.\d+)?|十几|好几|几|[一二两三四五六七八九十]{1,3}|半)(?:来|多)?\s*(个)?(半)?多?\s*(小时|钟头|天|周|星期|礼拜|月|年)(半)?多?/g;
const UNIT_HOURS: Record<string, number> = { 小时: 1, 钟头: 1, 天: 24, 周: 168, 星期: 168, 礼拜: 168, 月: 720, 年: 8760 };
/** how long something else lasted: a medicine taken for three days, two days off work */
const OTHER_SPAN = /(吃|喝|服|用|涂|贴|擦|抹|打|输|挂|住|等|睡|停|忍|歇|休息|请假|走|跑|站|坐|管|隔)了$/;
/** what may surround a bare answer such as "大概三天吧" */
const AROUND_AN_ANSWER = /[了有已经都快大概大约差不多约吧啊呢嘛的左右前才刚是就，,。.\s]/g;
/** 上周三, 周一, 这个星期五: 1 which week, 2 the day */
const WEEKDAY = /(?<![一二两三四五六七八九十几\d])(上上|上|这|本|下|每)?个?(?:周|星期|礼拜)([一二三四五六日天])(?![次回个天周月年半])/;
const WEEKDAY_NUM: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };

/** How many days back the weekday named was: "上周三" said on a Saturday is ten days ago. Null for a day still to come. */
function weekdayDaysAgo(m: RegExpMatchArray, now: number): number | null {
  if (m[1] === "下" || m[1] === "每") return null;
  const d = new Date(now).getDay();
  const today = d === 0 ? 7 : d;
  const day = WEEKDAY_NUM[m[2]];
  if (m[1] === "上上") return today + 14 - day;
  if (m[1] === "上") return today + 7 - day;
  // this week's, or last week's when that day has not come round yet
  return today >= day ? today - day : today + 7 - day;
}

/** The weekday a text names and how many days back it was: "上周三" said on a Saturday is 10. */
export function weekdayNamed(text: string, now: number = Date.now()): { words: string; daysAgo: number } | null {
  const m = text.match(WEEKDAY);
  const daysAgo = m ? weekdayDaysAgo(m, now) : null;
  return m && daysAgo != null ? { words: m[0], daysAgo } : null;
}

/** The day a clause names, in days before `now` ("昨天" is 1), or null when it names none. */
export function daysAgoNamed(clause: string, now: number = Date.now()): number | null {
  if (/大前天/.test(clause)) return 3;
  if (/前天/.test(clause)) return 2;
  if (/昨天|昨晚|昨夜|昨早/.test(clause)) return 1;
  if (/今天|今早|今晨|今晚|刚才|刚刚/.test(clause)) return 0;
  const weekday = clause.match(WEEKDAY);
  return weekday ? weekdayDaysAgo(weekday, now) : null;
}

/**
 * Roughly how many hours ago it started, when the text says so. Words like 昨晚 and 上周三 depend
 * on what day and time it is now, so this is worked out against the clock (the reader's local time).
 *
 * A spoken description names many times: when it began, when a reading was taken, when a medicine
 * was tried, how long a standing condition has been there. Each clause is read on its own, the
 * times that belong to something else are left out, and of what remains the earliest is the start.
 */
export function extractOnsetHours(text: string, now: number = Date.now()): number | null {
  /** hours since `hour` o'clock, `daysAgo` days back */
  const since = (daysAgo: number, hour: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour, 0, 0, 0);
    return (now - d.getTime()) / 3_600_000;
  };
  /** hours since the last time the clock showed `hour`: today if that has passed, otherwise yesterday */
  const last = (hour: number) => (since(0, hour) >= 0.5 ? since(0, hour) : since(1, hour));
  const round = (h: number) => Math.round(h * 2) / 2;
  /** the hour a part of the day stands for when it is named together with the day */
  const partHour = (part: string | undefined, otherwise: number) =>
    !part ? otherwise : /晚|夜/.test(part) ? 21 : /早|晨|上午/.test(part) ? 8 : part === "中午" ? 12 : 15;

  const whole = text.trim();
  const found: number[] = [];
  let afterBackground = false;

  for (const raw of whole.split(CLAUSE_SPLIT)) {
    const clause = raw.trim();
    if (!clause) continue;
    const marked = ONSET_MARK.test(clause);
    const background = BACKGROUND.test(clause);
    const carried = afterBackground;
    afterBackground = background;
    if (BETTER.test(clause)) continue;
    // a time in a sentence about a medicine or a visit belongs to that, unless the sentence says this is when it began
    const aside = !marked && (TOOK.test(clause) || WENT.test(clause));
    let rest = clause;
    /** reads one kind of time out of the clause, so the same words are not read a second time */
    const take = (re: RegExp, hours: (m: RegExpMatchArray) => number | null, ok: boolean) => {
      const m = rest.match(re);
      if (!m) return;
      rest = rest.replace(m[0], "＿");
      const h = hours(m);
      if (ok && h != null) found.push(h);
    };

    /* lengths of time: "三天了", "一个多星期", "这两天", "有小半年了", "已经第三天" */
    const span = !aside && !background;
    take(/(小|大)半年/, (m) => (m[1] === "小" ? 150 : 240) * 24, span);
    take(/(?:已经|今天|现在)是?第\s*(\d+|[一二两三四五六七八九十]{1,3})\s*天|第\s*(\d+|[一二两三四五六七八九十]{1,3})\s*天了/, (m) => {
      const n = spokenNumber(m[1] ?? m[2]);
      return Number.isFinite(n) && n >= 1 ? Math.max(0.5, (n - 1) * 24) : null;
    }, span);
    take(/一整?(晚上|夜|宿)|整(晚|夜)/, () => round(last(21)), span);
    take(/一(上午|下午)/, (m) => round(last(m[1] === "上午" ? 8 : 13)), span);
    for (const m of rest.matchAll(DURATION)) {
      const unit = m[4];
      const n = spokenNumber(m[1]);
      if (!Number.isFinite(n)) continue;
      // "三月" is March; a length of time is "三个月"
      if (unit === "月" && !m[2]) continue;
      const count = n + (m[3] || m[5] ? 0.5 : 0);
      // "2023年" is a year, not a number of years
      if (unit === "年" && count > 80) continue;
      const before = rest.slice(0, m.index);
      const after = rest.slice((m.index ?? 0) + m[0].length);
      // a time still to come, or how often: "三天后复查", "一天三次"
      if (/^(后|以后|之后|内|以内|之内|[一二两三四五六七八九十\d]+\s*(次|回|片|粒|颗|顿|趟))/.test(after)) continue;
      if (OTHER_SPAN.test(before)) continue;
      const alone = whole.replace(m[0], "").replace(AROUND_AN_ANSWER, "").length === 0;
      const said =
        /^(了|前|以前|之前|以来|来(?![回不])|以上|左右|上下)/.test(after) ||
        /(持续了?|已经|有|快|都|近|最近|这|大概|大约|差不多|约|[一-龥]了)$/.test(before) ||
        alone;
      if (!said) continue;
      // "有一天晚上" is one evening, not a day long
      if (m[1] === "一" && unit === "天" && /有$/.test(before) && !/^了/.test(after)) continue;
      const hours = count * UNIT_HOURS[unit];
      if (aside) continue;
      // "我有高血压，十几年了": the length of the history, unless the clause says the condition flared up
      const onlyThis = rest.replace(m[0], "").replace(AROUND_AN_ANSWER, "").length === 0;
      if ((background || (carried && onlyThis)) && !(marked && hours < 8760)) continue;
      found.push(hours);
    }

    /* named days and times: "昨晚", "大前天", "上周三", "9月28号" */
    const feverless = /(?<![\d.\/])(3[5-9]|4[0-2])(\.\d)?(?![\d\/])/.test(clause) && !/烧|热/.test(clause);
    const point = !aside && !background && !(MEASURED.test(clause) && !marked) && !feverless;
    const part = "(早上|早晨|上午|中午|下午|晚上|夜里)?";
    take(new RegExp(`大前天${part}`), (m) => round(since(3, partHour(m[1], 12))), point);
    take(new RegExp(`前天${part}`), (m) => round(since(2, partHour(m[1], 12))), point);
    take(/昨晚|昨夜|昨天(晚上|夜里|半夜)/, () => round(since(1, 21)), point);
    take(/昨早|昨天(早上|早晨|上午)/, () => round(since(1, 8)), point);
    take(/昨天(中午|下午)?/, () => round(since(1, 14)), point);
    take(/今天?(凌晨|半夜|夜里)/, () => round(last(2)), point);
    take(/今早|今晨|今天(早上|早晨|起床)/, () => round(last(7)), point);
    take(/今天上午/, () => round(last(10)), point);
    take(/今天中午/, () => round(last(12)), point);
    take(/今天下午/, () => round(last(15)), point);
    take(/今晚|今天(晚上|傍晚)/, () => round(last(19)), point);
    take(/今天/, () => round(Math.max(0.5, Math.min(since(0, 8), 12))), point);
    take(/刚刚|刚才/, () => 0.5, point);
    take(WEEKDAY, (m) => {
      const days = weekdayDaysAgo(m, now);
      return days == null ? null : round(Math.max(0.5, since(days, 12)));
    }, point);
    take(/(上上|上)个?(?:周|星期|礼拜)(?![一二三四五六日天末])/, (m) => round(since(m[1] === "上上" ? 14 : 7, 12)), point);
    take(/上个?月(初|中|底)?/, (m) => {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1, m[1] === "初" ? 3 : m[1] === "中" ? 15 : m[1] === "底" ? 28 : Math.min(d.getDate(), 28));
      d.setHours(12, 0, 0, 0);
      return round((now - d.getTime()) / 3_600_000);
    }, point);
    // a date is only read as the start when the clause says so: "9月28号开始咳嗽", not "约了5号的号"
    take(/(\d{1,2})月(\d{1,2})[号日]/, (m) => {
      const today = new Date(now);
      let day = new Date(today.getFullYear(), Number(m[1]) - 1, Number(m[2]), 12);
      if (day.getTime() > now) day = new Date(today.getFullYear() - 1, Number(m[1]) - 1, Number(m[2]), 12);
      return round(Math.max(0.5, (now - day.getTime()) / 3_600_000));
    }, point && marked);
    take(/(?<![\d月])(\d{1,2})[号日](?![楼线床])/, (m) => {
      const today = new Date(now);
      let day = new Date(today.getFullYear(), today.getMonth(), Number(m[1]), 12);
      if (day.getTime() > now) day = new Date(today.getFullYear(), today.getMonth() - 1, Number(m[1]), 12);
      return round(Math.max(0.5, (now - day.getTime()) / 3_600_000));
    }, point && marked);

    /*
     * A time of day with no day named ("晚上咳得厉害", "早上起来眼屎很多") is, in a longer description,
     * usually when it is at its worst. It is only read as the start when the clause says so or when
     * there is little else ("下午开始的").
     */
    const bare = point && (marked || whole.length <= 20) && !/每|一到|到了|有时|经常|常常|总是|老是|那天|当天|天天/.test(rest);
    take(/凌晨|半夜|夜里/, () => round(last(2)), bare);
    take(/早上|早晨|起床/, () => round(last(7)), bare);
    take(/上午/, () => round(last(10)), bare);
    take(/中午/, () => round(last(12)), bare);
    take(/下午/, () => round(last(15)), bare);
    take(/晚上|傍晚/, () => round(last(19)), bare);
  }
  return found.length ? Math.max(...found) : null;
}

/** Readings the user states outright, e.g. "测了血糖 3.6" or "血压 150/95". */
export function extractMeasurements(text: string): ChatMeasurement[] {
  const out: ChatMeasurement[] = [];
  const glucose = text.match(/血糖[^\d]{0,8}(\d{1,2}(?:\.\d)?)/);
  if (glucose) {
    const value = Number(glucose[1]);
    if (value >= 1 && value <= 35) {
      const fasting = /空腹|晨起|早上起来|早晨|起床后/.test(text) && !/餐后|饭后|散步|运动/.test(text);
      out.push({ type: fasting ? "fbg" : "ppg", value, value2: null });
    }
  }
  const a1c = text.match(/糖化[^\d]{0,10}(\d{1,2}(?:\.\d)?)/);
  if (a1c) {
    const value = Number(a1c[1]);
    if (value >= 3 && value <= 20) out.push({ type: "hba1c", value, value2: null });
  }
  const bp = text.match(/血压[^\d]{0,8}(\d{2,3})\s*[\/／]\s*(\d{2,3})/);
  if (bp) {
    const sys = Number(bp[1]);
    const dia = Number(bp[2]);
    if (sys >= 60 && sys <= 260 && dia >= 30 && dia <= 160) out.push({ type: "bp", value: sys, value2: dia });
  }
  return out;
}

/**
 * Readings stated in a longer description, each with the day it was taken when the speaker named
 * one. The day last named carries on: "前天晚上…吃完饭头晕，量了一下血压 165/98" is about that evening.
 */
export function statedReadings(text: string, now: number = Date.now()): (ChatMeasurement & { daysAgo: number | null })[] {
  const out: (ChatMeasurement & { daysAgo: number | null })[] = [];
  let day: number | null = null;
  for (const clause of text.split(CLAUSE_SPLIT)) {
    day = daysAgoNamed(clause, now) ?? day;
    for (const r of extractMeasurements(clause)) {
      if (!out.some((x) => x.type === r.type)) out.push({ ...r, daysAgo: day });
    }
  }
  return out;
}

/* ---------- the scripted conversation ---------- */

interface Step {
  key: string;
  /** the user has already told us this */
  test: (all: string) => boolean;
  /** an earlier assistant turn already asked about it, however it was phrased */
  asked: RegExp;
  question: string;
  quick: string[];
}

// At most four questions, the ones a doctor asks first.
const STEPS: Step[] = [
  {
    key: "onset",
    test: (t) => extractOnsetHours(t) != null || /开始|突然|持续|一阵/.test(t),
    asked: /什么时候开始|多久了|哪天开始|几天了|多长时间/,
    question: "是什么时候开始的？",
    quick: ["今天", "昨天", "两三天了", "一周以上"],
  },
  {
    key: "severity",
    test: (t) => /\d+\s*(分|级)|难受|轻微|剧烈|受不了|严重/.test(t),
    asked: /有多难受|多严重|几分|难受还是|有多(疼|痛)|厉害吗/,
    question: "现在有多难受？",
    quick: ["有点难受", "比较难受", "非常难受"],
  },
  {
    key: "associated",
    test: (t) => /发烧|发热|恶心|吐|泻|晕|汗|没有其他|没有别的|没别的|其他症状|同时|还有点|也有|咳|怕冷|度/.test(t),
    asked: /别的不舒服|其他.*(症状|不舒服)|一起出现/,
    question: "还有别的不舒服吗？比如发烧、恶心、头晕？",
    quick: ["没有别的", "有发烧", "有点恶心", "有点头晕"],
  },
  {
    key: "measures",
    // "吃了蒙脱石散没用" names no 药 but answers the question all the same
    test: (t) => /药|热敷|冰敷|没吃|吃了|吃过|喝了|服了|用了|涂了|擦了|按摩|贴|输液|打针|没管|没处理/.test(t),
    asked: /吃过.*药|有没有吃药|用过.*药|做过什么处理|吃.{0,4}药(没|了吗)|吃(了)?什么药/,
    question: "吃过什么药吗？",
    quick: ["没吃药", "吃了药"],
  },
];

/**
 * The three things a doctor asks first: when it began, how bad it is, and what has been taken.
 * Returns the first of them the conversation has not covered yet, or null. Used to stop the
 * model from wrapping up before it has asked (it tends to close after two questions).
 */
export function mustAsk(req: ChatRequest): { question: string; quick: string[] } | null {
  return inChinese(() => nextBasic(req));
}

function nextBasic(req: ChatRequest): { question: string; quick: string[] } | null {
  const users = req.messages.filter((m) => m.role === "user").map((m) => m.content);
  const assistants = req.messages.filter((m) => m.role === "assistant").map((m) => m.content);
  const all = [req.episode.title, ...users].join("\n");
  const step = STEPS.filter((s) => s.key !== "associated").find(
    (s) => !s.test(all) && !assistants.some((a) => s.asked.test(a) || a.includes(s.question)),
  );
  return step ? { question: step.question, quick: step.quick } : null;
}

const SAID_HOW_BAD = /\d+\s*(分|级)|难受|轻微|剧烈|受不了|严重|厉害|(特别|非常|很|好|挺|太|有点|不太|不怎么)(疼|痛|晕|痒|胀|麻)|(疼|痛|咳|晕|痒|烧)得/;
/** eating and drinking that is not taking a medicine: "吃了海鲜之后", "吃完饭更难受", "多喝水" */
const FOOD_AND_DRINK =
  /吃(了|完|过)?(海鲜|火锅|烧烤|外卖|东西|饭|早饭|午饭|晚饭|夜宵|冰的|辣的|凉的|剩饭|剩菜|水果|[^，,。；;]{0,3}(饭|菜|肉|鱼|虾|蟹|奶|蛋|果|面|粉|饺|糕|串))|喝(了|完|过)?(酒|水|粥|汤|奶|茶|咖啡|饮料)|吃不下|吃什么|吃东西/g;
const SAID_WHAT_WAS_TAKEN = /药|热敷|冰敷|没吃|吃了|吃过|喝了|服了|用了|涂了|擦了|按摩|贴|输液|打针|挂水|没管|没处理/;

/**
 * Which of those three things are not in what the patient has said. Used on the page for the
 * doctor after a one-go description: nothing is asked there, the gaps are only pointed out. So
 * the reading is stricter than in the conversation, where the point is not to ask twice: "持续隐痛"
 * does not say when it began, and "吃了海鲜之后" does not say what was taken for it.
 */
export function missingBasics(said: string, onsetKnown = false): { key: string; ask: string }[] {
  return inChinese(() => basicsMissingFrom(said, onsetKnown));
}

function basicsMissingFrom(said: string, onsetKnown: boolean): { key: string; ask: string }[] {
  const covered: Record<string, boolean> = {
    onset: onsetKnown || extractOnsetHours(said) != null,
    severity: SAID_HOW_BAD.test(said),
    measures: SAID_WHAT_WAS_TAKEN.test(said.replace(FOOD_AND_DRINK, "")),
  };
  return STEPS.filter((s) => s.key in covered && !covered[s.key]).map((s) => ({ key: s.key, ask: s.question }));
}

/**
 * When to say "see a doctor today", decided by rule so it is the same every time: a danger
 * signal, a temperature of 38.5 or more, "it got worse", or "非常难受". Nothing else counts.
 */
export function ruleHints(req: ChatRequest): { urgent: Hint | null; warn: Hint | null } {
  return inChinese(() => hintsByRule(req));
}

function hintsByRule(req: ChatRequest): { urgent: Hint | null; warn: Hint | null } {
  const users = req.messages.filter((m) => m.role === "user").map((m) => m.content);
  const cleaned = (users[users.length - 1] ?? "").replace(/^【定时记录】/, "").trim();
  const prev = latestSeverityEntry(req.episode)?.severity ?? null;
  const { severity: sev } = extractSeverity(cleaned, prev);
  const temp = extractTemperature(cleaned);
  const reading = extractMeasurements(cleaned)
    .map((m) => evaluateMeasurement(m))
    .find((h): h is Hint => h != null && h.level === "urgent");
  const urgent = reading ?? detectUrgent(cleaned);
  const seen = Boolean(req.episode.visit);
  const worse = (sev != null && prev != null && sev > prev) || (cleaned.length <= 20 && /更严重|加重了|更痛了|更难受|厉害了/.test(cleaned));
  const go = seen ? "建议再去看一次医生" : "建议今天去看医生";
  const warn: Hint | null =
    temp != null && temp >= 38.5
      ? { level: "warn", text: `体温到 ${temp}℃ 了，${go}，可以挂发热门诊。去之前点「给医生看」，我把记录整理好。` }
      : worse
        ? { level: "warn", text: `比上次重了，${go}。去之前点「给医生看」，我把记录整理好。` }
        : sev != null && sev >= 8
          ? { level: "warn", text: `已经很难受了，一直不缓解的话，${go}。` }
          : null;
  return { urgent, warn };
}

/* ---------- 问诊：八类信息，一次问一个，最多 7 个问题 ---------- */

/*
 * 问诊按八类信息走：持续时间（开始时间）、部位、疼痛方式、伴随症状、病史、接触的药物、
 * 什么时候会不舒服、特定情境。后两类意思相近，合成一个问题问。另外还有三样由规则触发：
 * 口语词的确认、疼痛部位的身体图、和以前记录或老毛病的关联追问。
 * 有模型时，下一步问什么由这里定、模型来措辞；没有模型时，规则引擎照这里一个个问完。
 */

/**
 * No limit on how many questions: they go on until everything a doctor needs is known and every
 * everyday word has been put into the doctor's words. This only stops a runaway conversation.
 */
export const MAX_QUESTIONS = 30;

export type ConsultKey = "confirm" | "onset" | "severity" | "measures" | "location" | "link" | "quality" | "associated" | "pattern" | "relief" | "history";

export interface ConsultStep {
  key: ConsultKey;
  /** 规则版的问法，模型没问到时就用它 */
  question: string;
  quick: string[];
  widget?: "bodymap";
  /** 模型想收尾时，这一步还缺就必须补问 */
  required: boolean;
  /** 给模型的说明：这一步要问清什么 */
  label: string;
}

export const CONSULT_LABELS: Record<ConsultKey, string> = {
  confirm: "确认口语说法",
  onset: "什么时候开始的（持续多久）",
  severity: "有多难受",
  measures: "吃过或用过什么药",
  location: "具体部位",
  link: "和以前的记录或老毛病的关联",
  quality: "怎么个疼法",
  associated: "伴随的其他不舒服",
  pattern: "什么时候、什么情况下会不舒服或更重",
  relief: "做什么会减轻",
  history: "以前有没有过",
};

type Region = "knee" | "shoulder" | "back" | "belly" | "head" | "chest" | "throat" | "limb" | "other";

function regionOf(text: string): Region | null {
  if (/膝/.test(text)) return "knee";
  if (/肩/.test(text)) return "shoulder";
  if (/腰|背/.test(text)) return "back";
  if (/肚|腹|胃|肚脐|心窝/.test(text)) return "belly";
  if (/头(?!晕|昏)|太阳穴|后脑|额头/.test(text)) return "head";
  if (/胸|心口/.test(text)) return "chest";
  if (/喉咙|嗓子|咽|牙|眼|耳|鼻/.test(text)) return "throat";
  if (/腿|脚|手|胳膊|踝|腕|肘|臂|髋|屁股/.test(text)) return "limb";
  return null;
}

/** 这个部位说到多细才算「具体」 */
const SPECIFIC: Record<Region, RegExp> = {
  knee: /内侧|外侧|前面|前侧|后面|后侧|膝盖骨|髌骨|腘窝|膝盖?(上|下)方/,
  shoulder: /(左|右|两)/,
  back: /上背|下背|肩胛|腰.{0,2}(左|右|正中|中间|两侧|两边)|(左|右)(边|侧)?腰|后背.{0,2}(左|右|正中|中间)/,
  belly: /上腹|下腹|小腹|肚脐|胃|左上|右上|左下|右下|心窝|剑突|两肋/,
  head: /额头|前额|太阳穴|后脑|头顶|整个头|满头|一侧|半边|偏头|眉/,
  chest: /左|右|正中|中间|胸口|心口/,
  throat: /./,
  limb: /(左|右|两)/,
  other: /./,
};

const LOCATION_ASKED = /哪个位置|哪个部位|哪里(疼|痛|不舒服|难受)|哪边|具体位置|哪一侧|哪只|哪条|图上|哪块/;
/** 「部位：右膝内侧」是在身体图上点出来的 */
const PICKED = /部位[：:]\s*([^，。,；;\s]+)/;

const QUALITY_WORDS = /绞痛|刺痛|胀痛|酸痛|隐痛|闷痛|钝痛|灼|烧|跳|扎|胀|酸|闷|拧|绞|撕|压|抽|隐隐|一阵一阵|刀割|针|木/;
const QUALITY_ASKED = /怎么个?(疼|痛)法|什么样的(疼|痛)|哪种(疼|痛)|疼法|痛法|怎么疼|怎么痛|是.{0,6}(疼|痛)还是/;
const QUALITY_QUICK: Record<Region, string[]> = {
  belly: ["拧着疼", "胀胀的", "像针扎", "隐隐的"],
  head: ["一跳一跳的", "胀胀的", "像针扎", "闷闷的"],
  knee: ["酸酸的", "像针扎", "胀胀的", "一动就疼"],
  shoulder: ["酸酸的", "像针扎", "扯着疼", "一动就疼"],
  back: ["酸酸的", "像针扎", "扯着疼", "胀胀的"],
  limb: ["酸酸的", "像针扎", "胀胀的", "一动就疼"],
  chest: ["闷闷的", "像针扎", "像被压着", "火辣辣"],
  throat: ["像针扎", "火辣辣", "干干的", "吞口水疼"],
  other: ["胀胀的", "像针扎", "酸酸的", "隐隐的"],
};

const ASSOCIATED_SAID = /发烧|发热|恶心|吐|泻|晕|汗|没有其他|没有别的|没别的|其他症状|同时|还有点|也有|咳|怕冷|度|肿|红|痰|流鼻涕|鼻塞|拉肚子|麻|模糊|心慌|乏力|没劲/;
const ASSOCIATED_ASKED = /别的不舒服|其他.*(症状|不舒服)|一起出现|还有.{0,8}(吗|没有)[？?]/;
const ASSOCIATED_QUICK: Record<Region, string[]> = {
  belly: ["没有别的", "恶心", "拉肚子", "发烧"],
  head: ["没有别的", "恶心想吐", "看东西模糊", "发烧"],
  knee: ["没有别的", "肿了", "发红发热", "走路受影响"],
  shoulder: ["没有别的", "手发麻", "抬不起来", "肿了"],
  back: ["没有别的", "腿发麻", "小便不舒服", "发烧"],
  limb: ["没有别的", "肿了", "发麻", "发红发热"],
  chest: ["没有别的", "心慌", "出汗", "咳嗽"],
  throat: ["没有别的", "发烧", "咳嗽", "流鼻涕"],
  other: ["没有别的", "发烧", "恶心", "头晕"],
};

const PATTERN_SAID =
  /一直|一阵|阵发|早上|晚上|夜里|半夜|饭后|饭前|空腹|吃完|吃东西|活动|走路|走久|上下楼|爬楼|蹲|站|坐久|躺|弯腰|咳嗽时|受凉|吹风|累|没睡好|情绪|生气|没发现|没规律|说不清|的时候|之后|以后|规律|一动|动一下/;
const PATTERN_ASKED = /什么时候(会|更|比较)|什么情况下|规律|一般在|会更(难受|疼|痛|厉害)|做什么的时候/;
const PATTERN_QUICK: Record<Region, string[]> = {
  belly: ["吃完饭", "空腹的时候", "一直都有", "没发现规律"],
  head: ["累了没睡好", "早上起来", "一直都有", "没发现规律"],
  knee: ["上下楼", "走久了", "蹲下站起", "没发现规律"],
  shoulder: ["抬胳膊", "夜里睡觉", "一直都有", "没发现规律"],
  back: ["弯腰", "久坐久站", "早上起床", "没发现规律"],
  limb: ["走路", "活动后", "夜里", "没发现规律"],
  chest: ["活动后", "生气着急", "躺下", "没发现规律"],
  throat: ["吞东西", "早上起来", "说话多了", "没发现规律"],
  other: ["活动后", "吃完饭", "夜里", "没发现规律"],
};

const RELIEF_SAID = /好一点|好些|好点|减轻|缓解|轻一点|舒服点|舒服些|没那么(疼|痛)|就不(疼|痛)了|休息.{0,4}(好|轻)|怎么都不(好|减轻)|没什么能/;
const RELIEF_ASKED = /好一点|减轻|缓解|舒服(一)?些|好受/;
const RELIEF_QUICK = ["休息一下", "热敷", "吃了药", "没发现"];

const HISTORY_SAID = /以前|第一次|老毛病|又犯|上次|从来没|头一回|之前也/;
const HISTORY_ASKED = /以前.{0,6}(有过|这样|也)|第一次|头一回/;

/** 只回一个「嗯」，等于没回答 */
const FILLER = /^(嗯+|哦+|噢+|啊+|额+|呃+|好+|行|好的|ok|嗯嗯)[。.!！~～]*$/i;

/* 和老毛病、以前记录的关联：可以扩展的规则表。只问，不下结论，不点名新的病。 */
interface LinkRule {
  id: string;
  /** 档案里的老毛病或以前记录的诊断 */
  history: RegExp;
  /** 这次说的不舒服 */
  complaint: RegExp;
  questions: { q: (name: string) => string; quick: string[]; asked: RegExp }[];
}

export const LINK_RULES: LinkRule[] = [
  {
    id: "diabetes-limb",
    history: /糖尿病|血糖高/,
    complaint: /脚.{0,4}(麻|疼|痛|凉|木|肿)|手.{0,4}(麻|木)|麻木|伤口|破了|溃/,
    questions: [
      { q: () => "你档案里有糖尿病。这几天血糖测过吗，大概多少？", quick: ["没测", "测了，正常", "测了，偏高"], asked: /血糖.{0,4}(测|量|多少)/ },
      { q: () => "脚上有没有伤口、破皮，或者颜色变了？", quick: ["没有", "有个小伤口", "颜色有点变"], asked: /伤口|破皮|颜色/ },
    ],
  },
  {
    id: "diabetes-general",
    history: /糖尿病|血糖高/,
    complaint: /晕|心慌|出汗|手抖|乏力|没劲|口渴|看不清|模糊/,
    questions: [{ q: () => "你档案里有糖尿病。这几天血糖测过吗，大概多少？", quick: ["没测", "测了，正常", "测了，偏低", "测了，偏高"], asked: /血糖.{0,4}(测|量|多少)/ }],
  },
  {
    id: "hypertension",
    history: /高血压|血压高/,
    complaint: /晕|头.{0,3}(痛|疼|胀|沉)|眼花|看不清|模糊|心慌|耳鸣/,
    questions: [{ q: () => "你档案里有高血压。这两天量过血压吗，多少？", quick: ["没量", "量了，正常", "量了，偏高"], asked: /血压.{0,4}(测|量|多少)|量过血压/ }],
  },
  {
    id: "heart",
    history: /冠心病|心脏病|心梗|心绞痛|心律不齐|房颤|支架/,
    complaint: /胸|心慌|心悸|气短|喘|憋|乏力/,
    questions: [{ q: (n) => `你档案里有${n}，这次和以前犯病时像吗？`, quick: ["很像", "不太一样", "说不清"], asked: /以前犯病|像吗/ }],
  },
  {
    id: "stomach",
    history: /胃炎|胃溃疡|胃病|十二指肠|反流/,
    complaint: /胃|上腹|心窝|反酸|烧心|(?<!拉)肚子.{0,6}(痛|疼|胀|不舒服)|腹.{0,2}(痛|疼|胀)/,
    questions: [{ q: (n) => `你以前有${n}，这次和以前那样难受的时候像吗？`, quick: ["很像", "不太一样", "说不清"], asked: /像吗|那次|以前那样/ }],
  },
  {
    id: "asthma",
    history: /哮喘|慢阻肺|支气管炎/,
    complaint: /咳|喘|气短|憋|痰/,
    questions: [{ q: (n) => `你以前有${n}，这次和以前发作时像吗？`, quick: ["很像", "不太一样", "说不清"], asked: /发作时|像吗/ }],
  },
  {
    id: "gout",
    history: /痛风|尿酸高|高尿酸/,
    complaint: /关节|脚趾|脚踝|膝|踝|肿/,
    questions: [{ q: (n) => `你以前有${n}，这次和以前发作时像吗？`, quick: ["很像", "不太一样", "说不清"], asked: /发作时|像吗/ }],
  },
  {
    id: "spine",
    history: /颈椎|腰椎|椎间盘/,
    complaint: /脖子|颈|肩|手.{0,3}麻|腰|腿.{0,3}麻|头晕/,
    questions: [{ q: (n) => `你以前有${n}，这次和以前犯的时候像吗？`, quick: ["很像", "不太一样", "说不清"], asked: /犯的时候|像吗/ }],
  },
  {
    id: "stone",
    history: /结石/,
    complaint: /腰|肚子|腹|小便|尿/,
    questions: [{ q: (n) => `你以前有${n}，这次和以前犯的时候像吗？`, quick: ["很像", "不太一样", "说不清"], asked: /犯的时候|像吗/ }],
  },
  {
    id: "migraine",
    history: /偏头痛/,
    complaint: /头/,
    questions: [{ q: (n) => `你以前有${n}，这次和以前发作时像吗？`, quick: ["很像", "不太一样", "说不清"], asked: /发作时|像吗/ }],
  },
];

interface LinkHit {
  rule: string;
  name: string;
  questions: { q: string; quick: string[]; asked: RegExp }[];
}

/** 身体部位：一次以往病史和这次说的是不是同一个地方 */
const BODY_PARTS = [/膝/, /肩/, /腰/, /颈|脖子/, /头(?!晕)/, /胸/, /胃|肚子|腹/, /眼/, /耳/, /喉|嗓子/, /牙/, /脚|足/, /踝/, /腿/, /手(?!术)/, /背/];

/** 这次说的不舒服和档案里的老毛病、以前的记录有没有医学上的关联。 */
export function linksFor(req: Pick<ChatRequest, "profile" | "related" | "episode" | "messages">): LinkHit[] {
  const said = [req.episode.title, ...req.messages.filter((m) => m.role === "user").map((m) => m.content)].join("\n");
  const out: LinkHit[] = [];
  // 以前记过的同类不舒服：问一句这次和那次哪里一样、哪里不一样（队友剧本的要求），不下结论。
  // 那次有医生写下的诊断就提诊断；「没有明确诊断」「原因待查」不是诊断，只提那次的名字。
  const before = req.related.find((r) => knownDiagnosis(r.diagnosis)) ?? req.related[0];
  if (before) {
    const which = knownDiagnosis(before.diagnosis) ? `看过「${before.diagnosis}」` : `记过一次「${before.title}」`;
    out.push({
      rule: "related",
      name: knownDiagnosis(before.diagnosis) ? (before.diagnosis as string) : before.title,
      questions: [
        { q: `你${before.date}${which}，这次和那次比，哪里一样、哪里不一样？`, quick: ["差不多一样", "不太一样", "说不清"], asked: /那次像|和那次|像吗|一样/ },
      ],
    });
  }
  // 没有以前的记录，但「补充以往病史」里写过同一个部位的一次（「2026年5月12日 左膝走路后不适…」）：也问一句
  if (!before) {
    const parts = BODY_PARTS.filter((x) => x.test(said));
    const past = req.profile.conditions.find((c) => /\d+\s*年|\d+\s*月|那次|一次/.test(c) && parts.some((x) => x.test(c)));
    if (past) {
      const shown = clipText(past.replace(/[，,。].*$/, ""), 24);
      out.push({
        rule: "related",
        name: shown,
        questions: [{ q: `你档案里写着「${shown}」，这次和那次比，哪里一样、哪里不一样？`, quick: ["差不多一样", "不太一样", "说不清"], asked: /那次像|和那次|像吗|一样/ }],
      });
    }
  }
  for (const rule of LINK_RULES) {
    const name = req.profile.conditions.find((c) => rule.history.test(c));
    if (!name || !rule.complaint.test(said)) continue;
    if (out.some((x) => x.questions.some((q) => rule.questions.some((r) => r.asked.source === q.asked.source)))) continue;
    const plain = name.replace(/[（(].*$/, "");
    out.push({ rule: rule.id, name: plain, questions: rule.questions.map((x) => ({ q: x.q(plain), quick: x.quick, asked: x.asked })) });
    break;
  }
  return out.slice(0, 2);
}

const userTexts = (req: Pick<ChatRequest, "messages">) => req.messages.filter((m) => m.role === "user").map((m) => m.content.replace(/^【定时记录】/, "").trim());
const assistantTexts = (req: Pick<ChatRequest, "messages">) => req.messages.filter((m) => m.role === "assistant").map((m) => m.content);

/** 这段对话里一共问了几个问题 */
export function questionsAsked(messages: { role: string; content: string }[]): number {
  return messages.filter((m) => m.role === "assistant" && /[?？]/.test(m.content)).length;
}

/** 患者自己说不想再答了 */
const WANTS_TO_STOP = /就这些|就这样吧?$|不想(说|答|回答)了|够了|别问了|不用(再)?问了|先这样/;

/** 对方说了「就这些」「不想说了」：收尾。只回「嗯」不算，问题照样问完。 */
export function evasive(messages: { role: string; content: string }[]): boolean {
  const last = [...messages].reverse().find((m) => m.role === "user")?.content.trim() ?? "";
  return WANTS_TO_STOP.test(last);
}

export function isPainComplaint(text: string): boolean {
  return mentions(text, "痛") || mentions(text, "疼");
}

/** 身体图上点的部位，或患者自己说清楚的具体部位 */
export function pickedArea(text: string): string | null {
  return text.match(PICKED)?.[1] ?? null;
}

/** 口语确认：上一轮问的是哪个说法，这一轮的回答算不算「是」 */
export function confirmAnswer(req: Pick<ChatRequest, "messages">): { note: string; yes: boolean } | null {
  const msgs = req.messages;
  const last = msgs[msgs.length - 1];
  const prev = [...msgs.slice(0, -1)].reverse().find((m) => m.role === "assistant");
  if (!last || last.role !== "user" || !prev) return null;
  const term = termAsked(prev.content);
  if (!term) return null;
  const said = userTexts({ messages: msgs.slice(0, -1) })
    .flatMap((u) => findColloquial(u))
    .find((h) => h.term === term)?.said;
  if (!said) return null;
  const answer = last.content.trim();
  if (/^(不是|不对|不太|不像|没有|不)/.test(answer)) return { yes: false, note: `患者原话：${said}（不是医生说的“${term}”）` };
  if (/^(是|对|嗯|没错|就是|差不多|有点像|像)/.test(answer)) return { yes: true, note: confirmedNote({ term, said }) };
  return null;
}

/**
 * 下一步该问什么。按顺序：口语确认、开始时间、轻重、用药、具体部位（疼痛类用身体图）、
 * 和老毛病或以前记录的关联、疼法、伴随症状、什么时候或什么情况下更重、以前有没有过。
 * 已经说过的、已经问过的都跳过；回答「没有」「不清楚」也算问过了。
 */
export function consultPlan(req: ChatRequest): { next: ConsultStep | null; missing: ConsultKey[]; known: ConsultKey[] } {
  return inChinese(() => planOf(req));
}

function planOf(req: ChatRequest): { next: ConsultStep | null; missing: ConsultKey[]; known: ConsultKey[] } {
  const users = userTexts(req);
  const assistants = assistantTexts(req);
  const all = [req.episode.title, ...users].join("\n");
  const askedAny = (re: RegExp, q?: string) => assistants.some((a) => re.test(a) || (q != null && a.includes(q)));
  // the name of the complaint says where it is first; what was said later only fills in
  const regionNamed = regionOf(req.episode.title) ?? regionOf(all);
  const region = regionNamed ?? "other";
  const pain = isPainComplaint(`${req.episode.title}\n${users[0] ?? ""}`);
  const steps: ConsultStep[] = [];
  const known: ConsultKey[] = [];
  const add = (step: Omit<ConsultStep, "label">) => steps.push({ ...step, label: CONSULT_LABELS[step.key] });

  // 1. 口语确认：说过的每个口语词都要换成医生的说法，确认完才收尾。
  // 回答疼法时点的、说的口语选项已经直接写成医生的说法，不再确认。
  const confirmed = assistants.map(termAsked).filter(Boolean) as string[];
  for (let i = 0, prev = ""; i < req.messages.length; i++) {
    const m = req.messages[i];
    if (m.role === "assistant") {
      prev = m.content;
      continue;
    }
    if (QUALITY_ASKED.test(prev)) continue;
    for (const hit of findColloquial(m.content.replace(/^【定时记录】/, ""))) {
      if (confirmed.includes(hit.term) || steps.some((s) => s.key === "confirm" && s.question === confirmQuestion(hit))) continue;
      add({ key: "confirm", question: confirmQuestion(hit), quick: ["是", "不是"], required: true });
    }
  }
  // the newest word first: it is the one just said
  steps.reverse();

  // 2-4. 医生最先问的三件事
  for (const s of STEPS.filter((x) => x.key !== "associated")) {
    if (s.test(all) || askedAny(s.asked, s.question)) known.push(s.key as ConsultKey);
    else add({ key: s.key as ConsultKey, question: s.question, quick: s.quick, required: true });
  }

  // 5. 具体部位：疼痛类还说不清在哪时，用身体图
  const picked = users.some((u) => PICKED.test(u));
  const specific = picked || (regionNamed != null && SPECIFIC[regionNamed].test(all.replace(/[，,。]/g, "")));
  if (pain && !specific && !askedAny(LOCATION_ASKED)) {
    if (regionNamed === "head") {
      add({ key: "location", question: "具体是哪个位置疼？", quick: ["额头", "太阳穴", "后脑勺", "整个头"], required: true });
    } else if (regionNamed !== "throat" && regionNamed !== "chest") {
      add({ key: "location", question: "具体是哪个位置疼？在下面的图上点一下就行。", quick: ["说不太清"], widget: "bodymap", required: true });
    }
  } else if (pain || picked) known.push("location");

  // 6. 和老毛病、以前记录的关联
  for (const link of linksFor(req)) {
    for (const q of link.questions) {
      if (!askedAny(q.asked, q.q)) add({ key: "link", question: q.q, quick: q.quick, required: true });
    }
  }

  // 7. 疼法
  if (pain) {
    const said = QUALITY_WORDS.test(all) || users.some((u) => findColloquial(u).some((h) => h.quality));
    if (said || askedAny(QUALITY_ASKED)) known.push("quality");
    else add({ key: "quality", question: "是怎么个疼法？", quick: QUALITY_QUICK[region], required: true });
  }

  // 8. 伴随症状
  // the first sentence names the complaint itself: it only answers this when it names two kinds of trouble
  const associatedSaid = ASSOCIATED_SAID.test(users.slice(1).join("\n")) || detectSymptoms(users[0] ?? "").length >= 2 || /没有?(别的|其他)/.test(users[0] ?? "");
  if (associatedSaid || askedAny(ASSOCIATED_ASKED)) known.push("associated");
  else add({ key: "associated", question: "还有别的不舒服吗？", quick: ASSOCIATED_QUICK[region], required: true });

  // 9. 什么时候、什么情况下更重
  if (PATTERN_SAID.test(users.join("\n")) || askedAny(PATTERN_ASKED)) known.push("pattern");
  else add({ key: "pattern", question: "一般什么时候、做什么的时候更难受？", quick: PATTERN_QUICK[region], required: true });

  // 9b. 怎么会减轻
  if (RELIEF_SAID.test(users.join("\n")) || askedAny(RELIEF_ASKED)) known.push("relief");
  else add({ key: "relief", question: "做什么会好一点？", quick: RELIEF_QUICK, required: true });

  // 10. 病史：档案和以前的记录里有的直接用，没有才问一句这次相关的
  const onFile = req.profile.conditions.length > 0 || req.related.length > 0 || steps.some((s) => s.key === "link") || assistants.some((a) => /像吗/.test(a));
  if (onFile || HISTORY_SAID.test(users.join("\n")) || askedAny(HISTORY_ASKED)) known.push("history");
  else add({ key: "history", question: "以前也这样过吗？", quick: ["第一次", "以前有过"], required: true });

  const missing = steps.map((s) => s.key);
  const over = questionsAsked(req.messages) >= MAX_QUESTIONS || evasive(req.messages);
  return { next: over ? null : (steps[0] ?? null), missing, known };
}

/** 问的是什么，回答就记成「什么：回答」。顺序要紧：更具体的在前。 */
const ANSWER_LABELS: [RegExp, string][] = [
  [/血糖.{0,4}(测|量|多少)/, "最近血糖"],
  [/血压.{0,4}(测|量|多少)|量过血压/, "最近血压"],
  [/伤口|破皮/, "伤口"],
  [/像吗/, "和以前比"],
  [/什么时候开始|多久了|哪天开始/, "开始时间"],
  [/吃过.*药|有没有吃药|用过.*药|吃(了)?什么药/, "用药"],
  [LOCATION_ASKED, "部位"],
  [ASSOCIATED_ASKED, "其他不舒服"],
  [PATTERN_ASKED, "什么时候更重"],
  [RELIEF_ASKED, "怎么会减轻"],
  [HISTORY_ASKED, "以前有没有过"],
];

/** 一句短答，问什么都算答了：「没有」「不清楚」「很像」 */
const ANY_ANSWER = /^(没有?|没测|没量|没注意|不清楚|说不清|说不太清|不知道|记不清了?|不太清楚|很像|不太一样|不像|有|有过|有的|第一次|以前有过|是|不是|对|偏高|偏低|正常|还好)[。！!，,]?$/;
const ALL_OPTIONS = new Set([...Object.values(QUALITY_QUICK), ...Object.values(PATTERN_QUICK), ...Object.values(ASSOCIATED_QUICK)].flat());
const SAID_SYMPTOM = /没有?(别的|其他|其它)|还有|也有|同时|恶心|吐|发烧|发热|头晕|拉肚子|咳|肿|麻|心慌|出汗|乏力|没劲|怕冷|流鼻涕|模糊/;
const SAID_TAKEN = /药|没吃|吃了|吃过|贴了|贴膏|喷了|涂了|擦了|抹了|输液|打针|热敷|冰敷|没处理|没管/;

/** 这句回答像不像在答这一类 */
function answerFits(label: string, answer: string): boolean {
  if (ANY_ANSWER.test(answer)) return true;
  switch (label) {
    case "疼法":
      return QUALITY_WORDS.test(answer) || findColloquial(answer).some((h) => h.quality) || Object.values(QUALITY_QUICK).flat().includes(answer);
    case "其他不舒服":
      return SAID_SYMPTOM.test(answer) || detectSymptoms(answer).length > 0 || ALL_OPTIONS.has(answer);
    case "用药":
      return SAID_TAKEN.test(answer);
    case "开始时间":
      return extractOnsetHours(answer) != null || /开始|天|周|星期|礼拜|月|年|小时|今天|昨天|前天|早上|晚上/.test(answer);
    case "什么时候更重":
      return PATTERN_SAID.test(answer) || ALL_OPTIONS.has(answer);
    case "以前有没有过":
      return HISTORY_SAID.test(answer) || /有过|没有过|第一次/.test(answer);
    case "怎么会减轻":
      return true;
    case "部位":
      return regionOf(answer) != null || extractLocation(answer) != null;
    case "最近血糖":
    case "最近血压":
      return /\d|测|量|高|低|正常/.test(answer);
    case "伤口":
      return /伤口|破|颜色|红|紫|黑|没有/.test(answer);
    case "和以前比":
      return /像|一样|不同|差不多/.test(answer);
    default:
      return true;
  }
}

/** 答非所问时，这句话实际在说哪一类；认不出就是 null */
function answerKind(answer: string): string | null {
  if (/没有?(别的|其他|其它)/.test(answer)) return "其他不舒服";
  if (SAID_TAKEN.test(answer)) return "用药";
  if (QUALITY_WORDS.test(answer) || findColloquial(answer).some((h) => h.quality)) return "疼法";
  if (extractOnsetHours(answer) != null) return "开始时间";
  if (PATTERN_SAID.test(answer)) return "什么时候更重";
  if (HISTORY_SAID.test(answer)) return "以前有没有过";
  if (SAID_SYMPTOM.test(answer) || detectSymptoms(answer).length > 0) return "其他不舒服";
  return null;
}

/** A note that is an answer to one of the questions, written as "部位：右膝内侧" or "绞痛（患者原话：拧着疼）". */
export function isConsultPoint(note: string): boolean {
  return /^(部位|疼法|最近血糖|最近血压|伤口|和以前比|开始时间|用药|其他不舒服|什么时候更重|怎么会减轻|以前有没有过|对生活工作的影响|想请医生)：/.test(note) || /（患者原话：/.test(note) || /^患者原话：/.test(note);
}

/** 一句回答写进记录时的样子：确认过的口语、身体图点的部位都写成医生看得懂的说法。 */
export function answerEntry(req: ChatRequest): { note: string; location: string | null } | null {
  return inChinese(() => {
    const users = userTexts(req);
    const last = users[users.length - 1] ?? "";
    const area = pickedArea(last);
    if (area) return { note: `部位：${area}`, location: area };
    const confirm = confirmAnswer(req);
    if (confirm) return { note: confirm.note, location: null };
    // 刚问了疼法，点的是口语选项：直接写成医生的说法
    const assistants = assistantTexts(req);
    const asked = assistants[assistants.length - 1] ?? "";
    if (!/[?？]/.test(asked) || !last || FILLER.test(last)) return null;
    const hit = findColloquial(last).find((h) => h.quality);
    // 其他问题的回答带上问的是什么，给医生的描述里才看得懂「没有别的」「上下楼」是在说什么。
    // 答非所问时（问疼法，答「没有别的不舒服」）按它实际说的那一类记，认不出就原样记。
    const askedLabel = QUALITY_ASKED.test(asked) ? "疼法" : ANSWER_LABELS.find(([re]) => re.test(asked))?.[1];
    if (!askedLabel) return null;
    const label = answerFits(askedLabel, last) ? askedLabel : answerKind(last);
    if (!label) return { note: last.slice(0, 80), location: null };
    if (label === "疼法" && hit) return { note: `疼法：${confirmedNote(hit)}`, location: null };
    return { note: `${label}：${last}`.slice(0, 80), location: label === "部位" ? last : null };
  });
}

const CHANGE_WORDS = /痛|疼|晕|吐|泻|烧|咳|痒|胀|麻|缓解|加重|反酸|恶心|难受|好多|好一|严重|度|分/;

export function fallbackChat(req: ChatRequest): ChatResponse {
  return inChinese(() => chatByRule(req));
}

function chatByRule(req: ChatRequest): ChatResponse {
  const { episode, related, kind } = req;
  const users = req.messages.filter((m) => m.role === "user").map((m) => m.content);
  const assistants = req.messages.filter((m) => m.role === "assistant").map((m) => m.content);
  const lastAssistant = assistants[assistants.length - 1] ?? "";
  const last = users[users.length - 1] ?? "";
  const all = [episode.title, ...users].join("\n");
  const prev = latestSeverityEntry(episode)?.severity ?? null;
  const cleaned = last.replace(/^【定时记录】/, "").trim();
  const { severity: sev, exact } = extractSeverity(cleaned, prev);
  const temp = extractTemperature(cleaned);
  const measurements = extractMeasurements(cleaned);
  const { urgent, warn: escalate } = ruleHints(req);
  const tags = uniq([...episode.tags, ...autoTags(all)]).slice(0, 6);
  const first = kind === "intake" || users.length <= 1;

  // Only keep a timeline entry when the message says something about the symptom itself.
  const substantive =
    sev != null || temp != null || measurements.length > 0 || (cleaned.length >= 5 && CHANGE_WORDS.test(cleaned));
  // a confirmed everyday word, or a place picked on the body map, is written the way a doctor reads it
  const answered = first ? null : answerEntry(req);
  const entry: ChatResponse["entry"] = answered
    ? { severity: sev, exact, temperature: temp, note: answered.note, location: answered.location ?? extractLocation(cleaned) }
    : substantive
      ? { severity: sev, exact, temperature: temp, note: cleaned.slice(0, 80), location: extractLocation(cleaned) }
      : null;

  const ack =
    temp != null ? `记下了，体温 ${temp}℃。` : measurements.length ? "记下了，数值已经存好。" : substantive || answered ? "记下了。" : "好的。";
  const base = {
    mode: "fallback" as const,
    entry,
    tags,
    measurements,
    title: first ? provisionalTitle(users[0] ?? episode.title) : null,
    // when it began: said in the first sentence, or in the answer to "什么时候开始的"
    onsetHoursAgo: first
      ? extractOnsetHours(users[0] ?? "")
      : /什么时候开始|多久了|哪天开始/.test(lastAssistant)
        ? extractOnsetHours(cleaned)
        : null,
  };

  if (urgent) {
    // the instructions are in the red card right below; the reply itself stays short
    return { ...base, reply: "记下了。这个情况要马上处理，请看下面红色的提示。", suggestedReplies: ["我现在去就医", "已经缓解了"], hint: urgent, done: false };
  }

  // A glucose check is being discussed but no number was given yet.
  if (!measurements.length && /复测|测了|量了/.test(cleaned) && /血糖|复测/.test(`${cleaned}${lastAssistant}`)) {
    return { ...base, entry: null, reply: "好的。测出来的血糖是多少？", suggestedReplies: [], hint: null, done: false };
  }

  if (kind === "checkin") {
    let trend = "";
    if (sev != null && prev != null) trend = sev < prev ? "比上次好一些了。" : sev > prev ? "比上次重了一些。" : "和上次差不多。";
    const reply = escalate
      ? `${ack}${trend}${escalate.text}`
      : sev === 0
        ? `${ack}听起来已经好了。确实好了的话，点「我好了」就可以结束这次记录。`
        : `${ack}${trend}我会继续跟着，有变化随时告诉我。`;
    return { ...base, reply, suggestedReplies: [], hint: escalate, done: true };
  }

  // Never ask the same thing twice: a step is done once it was answered or already asked.
  // Asked in the first round only; at most seven questions, fewer when the answers are only "嗯".
  const firstRound = !assistants.some((a) => !/[?？]/.test(a));
  const step = firstRound ? consultPlan(req).next : null;
  if (step) {
    return { ...base, reply: `${ack}${step.question}`, suggestedReplies: step.quick, hint: escalate, done: false, widget: step.widget ?? null };
  }

  const relatedHint: Hint | null = related.length
    ? {
        level: "info",
        text: `这次和你 ${related[0].date} 记的「${related[0].title}」比较像${related[0].diagnosis ? `（当时是${related[0].diagnosis}）` : ""}，看医生时可以一起告诉医生。`,
      }
    : null;
  return {
    ...base,
    reply: `${ack === "好的。" ? "" : ack}好了，我都记下了，之后会定期来问问你。${
      escalate ? escalate.text : "如果明显加重，或者喘不上气、神志不清，请立即就医。"
    }`,
    suggestedReplies: [],
    hint: escalate ?? relatedHint,
    done: true,
  };
}

/* ---------- doctor summary ---------- */

/**
 * The timeline handed to the doctor is always built here, straight from what was recorded:
 * one line per distinct moment, each with the time it was recorded. Nothing in it can be invented.
 */
export function recordedTimeline(episode: Pick<Episode, "entries">, max = 12): { time: string; event: string }[] {
  return inChinese(() => timelineOf(episode, max));
}

function timelineOf(episode: Pick<Episode, "entries">, max: number): { time: string; event: string }[] {
  const timeline: { time: string; event: string }[] = [];
  let lastStamp = 0;
  for (const e of sortedEntries(episode)) {
    const t = new Date(e.at).getTime();
    // the temperature is only put in front when the note does not already say it
    const note = e.note.replace(/[。]$/, "");
    const event = `${e.temp != null && !note.includes(String(e.temp)) ? `体温 ${e.temp}℃，` : ""}${note}`;
    if (timeline.length && t - lastStamp < 3_600_000) {
      // several things said in one sitting are one line
      const prevLine = timeline[timeline.length - 1];
      if (!prevLine.event.includes(note)) prevLine.event = `${prevLine.event}；${event}`;
    } else {
      timeline.push({ time: fmtDate(e.at, { time: true }), event });
    }
    lastStamp = t;
  }
  // a long history keeps its beginning and its most recent part
  return timeline.length > max ? [...timeline.slice(0, 2), ...timeline.slice(-(max - 2))] : timeline;
}

const ASKING = /是不是|会不会|要不要|能不能|用不用|需不需要|有没有|可不可以|(.)不\1|吗$|怎么|什么|为什么|多久|哪/;

/**
 * What the patient said they are worried about or want to ask, as questions in their own words:
 * "我最担心是不是吃坏了东西" gives "是不是吃坏了东西？". These go first on the list for the doctor.
 */
export function ownQuestions(said: string): string[] {
  const out: string[] = [];
  for (const raw of said.split(CLAUSE_SPLIT)) {
    const clause = raw.trim().replace(/[啊呀呢吧嘛哈]+$/, "");
    if (clause.length < 4 || clause.length > 40) continue;
    let q: string | null = null;
    const worry = clause.match(/(担心|怕是|就怕|想问问?|想知道|想了解|想请教|不知道)(?:一下)?(?:医生|大夫)?(?:的就是|的是)?(.{2,28})$/);
    if (worry) {
      const rest = worry[2].replace(/^[，,：:]/, "");
      // "不知道该怎么跟医生说" is what this page is for, not a question for the doctor
      if (/怎么(跟|和|给|对|向)?(医生|大夫)?(说|讲|描述)/.test(rest)) q = null;
      else if (ASKING.test(rest) && rest.length >= 4) q = rest;
      else if (/担心|怕/.test(worry[1]) && rest.length >= 2) q = `担心${rest}，要紧吗`;
    } else if (/^(你说|医生|大夫)?(这|这个|到底)?是?怎么回事$/.test(clause)) {
      q = "这是怎么回事";
    } else if (clause.length <= 20 && /是不是|会不会|要不要|能不能|用不用|需不需要|吗$/.test(clause)) {
      q = clause.replace(/^(我|你说|医生|大夫|那)+/, "");
    }
    if (!q) continue;
    q = `${q.replace(/[？?。.]+$/, "")}？`;
    if (!out.some((x) => textOverlap(x, q as string) >= 0.6)) out.push(q);
    if (out.length === 2) break;
  }
  return out;
}

const READING_NAME: Record<ChatMeasurement["type"], string> = { bp: "血压", fbg: "空腹血糖", ppg: "血糖", hba1c: "糖化血红蛋白", weight: "体重" };

export function fallbackSummary(req: SummaryRequest): SummaryResponse {
  return inChinese(() => summaryByRule(req));
}

/** A diagnosis worth naming: not empty, and not a note that there was none. */
function knownDiagnosis(d: string | null | undefined): boolean {
  return Boolean(d && d !== NO_DIAGNOSIS && !/没有(明确|新的)?诊断|无明确诊断|原因待查/.test(d));
}

/**
 * The description in the patient's own voice, put together by rule: 我46岁，从9月27日起左膝内侧酸痛。…
 * Only what is on record: the answers to the questions, the history on file, what they want to ask.
 */
function narrativeByRule(req: SummaryRequest, points: string[], onsetKnown: boolean): string {
  const { profile, episode } = req;
  // "绞痛（患者原话：拧着疼）" is said the patient's way with the doctor's word after it: "拧着疼（绞痛）"
  const spoken = (v: string) => v.replace(/([^，。；：（]+)（患者原话：([^）]+)）/g, "$2（$1）");
  const answer = (label: string) => spoken(points.find((p) => p.startsWith(`${label}：`))?.slice(label.length + 1).trim() ?? "");
  const none = (v: string) => /^(没有?|没有别的|没别的|无|不清楚|说不清|说不太清|没发现规律|没发现)/.test(v);
  // picked on the body map at the start, or answered later
  const where = answer("部位") || sortedEntries(episode)[0]?.location || "";
  const lines: string[] = [];
  const age = profile.birthYear ? new Date().getFullYear() - profile.birthYear : null;
  lines.push(
    `我${age != null ? `${age}岁，` : ""}${onsetKnown ? `从${fmtDate(episode.startedAt)}起` : "最近"}${where && !episode.title.includes(where) ? `${where}` : ""}${episode.title}${answer("疼法") ? `，感觉是${answer("疼法")}` : ""}。`,
  );
  // other everyday words that were confirmed: "头晕眼花（头晕伴视物模糊）"
  const confirmedWords = points.filter((p) => /^[^：]+（患者原话：/.test(p)).map(spoken);
  if (confirmedWords.length) lines.push(`我说的${confirmedWords.join("、")}。`);
  const worse = answer("什么时候更重");
  if (worse && !none(worse)) lines.push(`${worse}的时候更明显。`);
  const relief = answer("怎么会减轻");
  if (relief) lines.push(none(relief) ? "没发现做什么能减轻。" : `${relief}会减轻一些。`);
  const other = answer("其他不舒服");
  if (other) lines.push(none(other) ? "没有注意到别的不舒服。" : `同时还有${other}。`);
  const before = answer("以前有没有过");
  if (before) lines.push(/第一次|没有/.test(before) ? "以前没有这样过。" : `${before.startsWith("以前") ? before : `以前${before}`}类似的情况。`);
  const compared = answer("和以前比");
  if (compared) lines.push(`和以前那次比：${compared}。`);
  const taken = answer("用药");
  if (taken) lines.push(/没吃|没用|没有|没处理|没管/.test(taken) ? "这次还没有用药。" : `这次用药：${taken}。`);
  const impact = answer("对生活工作的影响");
  if (impact) lines.push(/没什么|没有|不影响/.test(impact) ? "对生活工作没什么影响。" : `已经${impact.replace(/^已经/, "")}。`);
  for (const label of ["最近血压", "最近血糖"]) if (answer(label)) lines.push(`${label}${answer(label)}。`);
  if (profile.conditions.length) lines.push(`我有${profile.conditions.join("、")}。`);
  if (profile.medications.length) lines.push(`长期在用${profile.medications.join("、")}。`);
  if (profile.allergies.length) lines.push(`对${profile.allergies.join("、")}过敏。`);
  const wish = answer("想请医生");
  const own = ownQuestions(episode.entries.filter((e) => e.source === "user").map((e) => e.note).join("\n"));
  if (wish && !/没有特别/.test(wish)) lines.push(`想请医生帮我看看${wish.replace(/^(帮我)?看看/, "")}。`);
  else lines.push(own.length ? `想问医生：${own.join("")}` : "想请医生看看需要怎么处理。");
  return lines.join("");
}

function summaryByRule(req: SummaryRequest): SummaryResponse {
  const { profile, episode, related } = req;
  const entries = sortedEntries(episode);
  const first = entries[0];
  const last = entries[entries.length - 1];
  const temps = entries.filter((e) => e.temp != null);
  const ownWords = entries.filter((e) => e.source === "user");
  // When the patient never said when it began, the record only knows when it was first written down.
  const onsetKnown = episode.startedAt !== episode.createdAt;
  const duration = onsetKnown
    ? roughDuration(episode.startedAt, episode.resolvedAt ?? undefined)
    : `，${fmtDate(episode.createdAt)}第一次记录`;
  // "目前比较难受" is only said when the patient said so themselves, and recently: an estimate
  // behind a one-tap answer, or a remark from days ago, is not how they feel now.
  const felt = latestSeverityEntry(episode);
  const recentFeel = felt && last && felt.source !== "checkin" && hoursBetween(felt.at, last.at) <= 12 ? felt : null;
  // a number the patient gave themselves is kept as their number, not turned into a word
  const lastFeel = recentFeel
    ? recentFeel.exact && recentFeel.severity != null
      ? `自评 ${recentFeel.severity}/10`
      : feelWord(recentFeel.severity)
    : "";
  const ownScore = Boolean(recentFeel?.exact);

  const chiefComplaint = `${episode.title}${duration}`;
  // What the patient said is quoted with the date it was said on, so "昨晚" and "今天早上" can still be read later.
  // answers to the questions, already in "部位：右膝内侧" form, go together as one line of what was asked
  const points = uniq(entries.filter((e) => e.source !== "checkin" && isConsultPoint(e.note)).map((e) => e.note.replace(/[。]$/, "")));
  const quotes = entries
    .filter((e) => e.source !== "checkin" && e.note.length > 3 && !isConsultPoint(e.note))
    .slice(0, 4)
    .map((e) => `${fmtDate(e.at)}记录：“${e.note.replace(/[。]$/, "")}”`);
  const presentIllness = [
    onsetKnown
      ? `患者于 ${fmtDate(episode.startedAt, { year: true })}前后出现${episode.title}。`
      : `患者 ${fmtDate(episode.createdAt, { year: true })}第一次记录${episode.title}，没有说是什么时候开始的。`,
    quotes.length ? `${quotes.join("；")}。` : "",
    points.length ? `问诊补充：${points.join("；")}。` : "",
    temps.length ? `体温记录：${temps.map((e) => `${fmtDate(e.at)} ${e.temp}℃`).join("，")}。` : "",
    episode.visit ? `已于 ${episode.visit.date} 就诊，诊断 ${episode.visit.diagnosis}，治疗 ${episode.visit.treatment}。` : "",
  ]
    .filter(Boolean)
    .join("");

  // A one-tap answer ("好多了") is the user's own word for how they are now; the estimate behind it is not.
  const answered = last?.source === "checkin";
  const oneTap = answered && last != null && last.note.length <= 6;
  const currentStatus = last
    ? `最近一次记录（${fmtDate(last.at, { time: true })}）：${last.temp != null ? `体温 ${last.temp}℃，` : ""}${answered ? last.note : lastFeel || clipText(stripOpening(last.note), 56)}。`
    : "暂无记录。";

  const relevantHistory: string[] = [];
  if (profile.conditions.length) relevantHistory.push(`既往史：${profile.conditions.join("、")}`);
  relevantHistory.push(`过敏史：${profile.allergies.length ? profile.allergies.join("、") : "档案里没有记录过敏"}`);
  if (profile.medications.length) relevantHistory.push(`长期用药：${profile.medications.join("、")}`);
  if (profile.surgeries.length) relevantHistory.push(`手术史：${profile.surgeries.join("、")}`);
  if (profile.familyHistory.length) relevantHistory.push(`家族史：${profile.familyHistory.join("、")}`);
  // what the latest check-up report flagged, quoted as printed
  relevantHistory.push(...(req.background ?? []));

  const priorSimilar = related.map(
    (r) =>
      `${r.date}「${r.title}」${r.diagnosis ? `，诊断：${r.diagnosis}` : ""}${r.treatment ? `，处理：${r.treatment}` : ""}${r.outcome ? `，结果：${r.outcome}` : ""}`,
  );

  // Notes for the doctor are facts worth a second look, never advice to the patient.
  const hints: Hint[] = [];
  const days = calendarDays(episode.startedAt);
  if (onsetKnown && days >= 3 && episode.status === "active" && !episode.visit) {
    hints.push({ level: "warn", text: `已经持续 ${days} 天，记录里还没有就诊。` });
  }
  // one description can hold several readings ("最高烧到39.2度，今天早上37.5"): the highest is the one to show
  const allTemps = uniq([...temps.map((e) => e.temp as number), ...ownWords.flatMap((e) => extractTemperatures(e.note))]);
  const maxTemp = allTemps.length ? Math.max(...allTemps) : null;
  if (maxTemp != null && maxTemp >= 38.5) hints.push({ level: "warn", text: `体温最高 ${maxTemp}℃。` });
  if (related.length) {
    hints.push({
      level: "info",
      text: `和 ${related[0].date}「${related[0].title}」的记录相似${related[0].diagnosis ? `（当时诊断：${related[0].diagnosis}）` : ""}。`,
    });
  }

  // The header of the sheet already shows history, allergies and medicines, so these lines are about this illness only.
  const lastWords = [...entries].reverse().find((e) => e.note.length > 6 && e !== first);
  // Blood pressure or glucose the patient reported in their own words, with the day when they named one.
  const reported: string[] = [];
  for (const e of ownWords) {
    const at = new Date(e.at).getTime();
    for (const r of statedReadings(e.note, at)) {
      const value = r.type === "bp" ? `${r.value}/${r.value2}` : `${r.value}${r.type === "hba1c" ? "%" : ""}`;
      // the same number may already be on the screen as the latest reading on file
      if ((req.vitals ?? []).some((v) => v.includes(value)) || reported.some((x) => x.includes(value))) continue;
      const day = r.daysAgo != null ? `，${fmtDate(new Date(at - r.daysAgo * 86_400_000))}` : "";
      reported.push(`${READING_NAME[r.type]} ${value}（自述${day}）`);
    }
  }
  // A description given in one go opens with a greeting and runs long: the greeting is dropped and
  // more of it is quoted, since it is all there is. A first sentence in a conversation stays short.
  const opening = first ? stripOpening(first.note) : "";
  const inOneGo = opening.length > 30;
  const glance = [
    `${episode.title}${duration}${oneTap && last ? `，最近说「${last.note}」` : lastFeel ? `，${ownScore ? "" : "目前"}${lastFeel}` : ""}`,
    maxTemp != null ? `${allTemps.length > 1 ? "体温最高" : "体温"} ${maxTemp}℃` : "",
    ...reported.slice(0, 2),
    // a first note that only repeats the name ("头痛") says nothing
    first && !episode.title.includes(first.note.replace(/[。\s]/g, ""))
      ? `${inOneGo ? "自述" : "起初"}（${fmtDate(first.at)}）：${clipText(opening, inOneGo ? 56 : 24)}`
      : "",
    lastWords ? `最近（${fmtDate(lastWords.at)}）：${clipText(lastWords.note)}` : "",
    episode.visit
      ? episode.visit.diagnosis === NO_DIAGNOSIS
        ? `${episode.visit.date} 已就诊`
        : `已就诊：${clipText(episode.visit.diagnosis, 20)}`
      : "",
    // the earlier similar time stays on the first screen after this one was seen by a doctor
    related[0] ? `以前有过类似情况：${related[0].date}「${clipText(related[0].title, 10)}」${knownDiagnosis(related[0].diagnosis) ? `，当时是${clipText(related[0].diagnosis!, 12)}` : ""}` : "",
    // recent readings of someone who tracks them belong on the first screen too
    ...(req.vitals ?? []),
  ].filter(Boolean);

  const narrative = narrativeByRule(req, points, onsetKnown);

  const questionsForDoctor = ["这次需要做哪些检查？", "吃的喝的有什么要注意的？", "什么情况下要再来，或者去急诊？"];
  if (related[0])
    questionsForDoctor.unshift(
      knownDiagnosis(related[0].diagnosis) ? `这次和上次的「${related[0].diagnosis}」有关系吗？` : `这次和 ${related[0].date}那次「${related[0].title}」是不是同一个问题？`,
    );
  // what the patient said they want to know comes first, in their own words
  questionsForDoctor.unshift(...ownQuestions(ownWords.map((e) => e.note).join("\n")));

  return {
    mode: "fallback",
    summary: {
      glance: glance.slice(0, 5),
      narrative,
      chiefComplaint,
      presentIllness,
      timeline: recordedTimeline(episode),
      currentStatus,
      relevantHistory,
      priorSimilar,
      hints: hints.slice(0, 3),
      questionsForDoctor: questionsForDoctor.slice(0, 4),
    },
  };
}

/* ---------- yearly summary ---------- */

export function fallbackAnnual(req: AnnualRequest): AnnualResponse {
  return inChinese(() => annualByRule(req));
}

function annualByRule(req: AnnualRequest): AnnualResponse {
  const { profile, facts } = req;
  const ymd = (iso: string) => fmtDate(iso, { year: true });
  const active = facts.episodes.filter((e) => e.status === "active");
  const a1c = facts.hba1c;
  const fbg = facts.fbgMonthly;

  const metricTrends: AnnualResponse["summary"]["metricTrends"] = [];
  if (a1c.length) {
    const first = a1c[0];
    const last = a1c[a1c.length - 1];
    metricTrends.push({
      name: "糖化血红蛋白",
      trend:
        a1c.length > 1
          ? `${ymd(first.at)} ${first.value.toFixed(1)}%，${ymd(last.at)} ${last.value.toFixed(1)}%，共 ${a1c.length} 次检查。`
          : `${ymd(first.at)} ${first.value.toFixed(1)}%。`,
    });
  }
  if (fbg.length) {
    const first = fbg[0];
    const last = fbg[fbg.length - 1];
    metricTrends.push({
      name: "空腹血糖",
      trend: `月均值由 ${first.label}的 ${first.avg.toFixed(1)} mmol/L 变为 ${last.label}的 ${last.avg.toFixed(1)} mmol/L。`,
    });
  }
  if (facts.weight.length > 1) {
    const first = facts.weight[0];
    const last = facts.weight[facts.weight.length - 1];
    metricTrends.push({ name: "体重", trend: `由 ${first.value.toFixed(1)} kg 变为 ${last.value.toFixed(1)} kg。` });
  }
  if (facts.bp.length > 1) {
    const first = facts.bp[0];
    const last = facts.bp[facts.bp.length - 1];
    metricTrends.push({ name: "血压", trend: `由 ${first.value}/${first.value2} mmHg 变为 ${last.value}/${last.value2} mmHg，共 ${facts.bp.length} 次记录。` });
  }

  const dateLabel = (d: string) => ymd(`${d}T12:00:00`);
  // One visit can be on file twice: as a check-up of its own and under the complaint it also covered.
  // It is listed once.
  const meds: { at: string; time: string; change: string }[] = [];
  const listed = new Set<string>();
  for (const f of facts.followUps) {
    if (!f.plan || /^维持|^没有开药/.test(f.plan)) continue;
    listed.add(`${f.date}|${f.plan}`);
    meds.push({ at: f.date, time: dateLabel(f.date), change: f.plan });
  }
  for (const e of facts.episodes) {
    const v = e.visit;
    if (!v?.treatment || v.treatment === "没有开药" || listed.has(`${v.date}|${v.treatment}`)) continue;
    listed.add(`${v.date}|${v.treatment}`);
    meds.push({ at: v.date, time: dateLabel(v.date), change: v.diagnosis === NO_DIAGNOSIS ? v.treatment : `${v.treatment}（${v.diagnosis}）` });
  }
  meds.sort((a, b) => a.at.localeCompare(b.at));

  const events: { at: string; time: string; event: string }[] = [];
  for (const x of facts.lows) {
    // an episode recorded the same day that already quotes this reading covers it
    const covered = facts.episodes.some(
      (e) => ymd(e.startedAt) === ymd(x.at) && e.firstNote.includes(x.value.toFixed(1)),
    );
    if (covered) continue;
    events.push({ at: x.at, time: ymd(x.at), event: `低血糖 ${x.value.toFixed(1)} mmol/L${x.note ? `：${x.note}` : ""}` });
  }
  for (const i of facts.insights.filter((x) => x.kind === "streak" && x.at)) {
    events.push({ at: i.at as string, time: ymd(i.at as string), event: i.text });
  }
  for (const e of facts.episodes.filter((x) => x.status !== "active")) {
    events.push({
      at: e.startedAt,
      time: ymd(e.startedAt),
      event: `「${e.title}」：${e.firstNote}${e.visit ? `；诊断 ${e.visit.diagnosis}` : ""}${e.resolvedAt ? `；${ymd(e.resolvedAt)} 好转` : ""}`,
    });
  }
  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const currentConcerns = active.map((e) => `「${e.title}」已经${roughDuration(e.startedAt)}：${e.lastNote}`);

  const hints: Hint[] = [];
  for (const e of active) if (e.hint) hints.push({ level: "warn", text: e.hint });
  if (facts.lows.length) hints.push({ level: "info", text: `过去一年记录到 ${facts.lows.length} 次低血糖，请医生评估是否需要调整。` });
  if (profile.allergies.length) hints.push({ level: "info", text: `过敏史：${profile.allergies.join("、")}，用药需避开。` });
  if (!hints.length) hints.push({ level: "info", text: "以上是患者自己记录的内容，请医生结合检查判断。" });

  const headlineBits: string[] = [];
  if (a1c.length > 1) headlineBits.push(`糖化血红蛋白由 ${a1c[0].value.toFixed(1)}% 变为 ${a1c[a1c.length - 1].value.toFixed(1)}%`);
  else if (fbg.length > 1) headlineBits.push(`空腹血糖月均值由 ${fbg[0].avg.toFixed(1)} 变为 ${fbg[fbg.length - 1].avg.toFixed(1)}`);
  if (active.length) headlineBits.push(`目前「${active[0].title}」正在跟踪`);
  const headline = headlineBits.length ? `过去一年：${headlineBits.join("，")}` : "过去一年的健康记录整理";

  const overview = [
    profile.conditions.length ? `患者既往有${profile.conditions.join("、")}。` : "",
    metricTrends.length ? `过去一年共有 ${metricTrends.length} 项指标的记录：${metricTrends.map((m) => m.name).join("、")}。` : "",
    facts.followUps.length ? `期间复诊 ${facts.followUps.length} 次。` : "",
    facts.episodes.length ? `记录症状 ${facts.episodes.length} 次${active.length ? `，其中 ${active.length} 次仍在跟踪` : ""}。` : "",
  ]
    .filter(Boolean)
    .join("");

  // A month with only a reading or two is not an average worth quoting: use the latest month that has three.
  const solid = fbg.filter((m) => m.count >= 3);
  const fbgLine =
    solid.length > 1
      ? `空腹血糖月均值由 ${solid[0].avg.toFixed(1)}（${solid[0].label}）到 ${solid[solid.length - 1].avg.toFixed(1)}（${solid[solid.length - 1].label}）`
      : "";
  const bpLast = facts.bp[facts.bp.length - 1];
  const glance = [
    active[0]
      ? `目前：「${active[0].title}」已经${roughDuration(active[0].startedAt)}${
          active[0].visit ? (active[0].visit.diagnosis === NO_DIAGNOSIS ? "，已就诊" : `，已就诊：${clipText(active[0].visit.diagnosis, 14)}`) : ""
        }`
      : "",
    a1c.length > 1 ? `糖化血红蛋白由 ${a1c[0].value.toFixed(1)}% 到 ${a1c[a1c.length - 1].value.toFixed(1)}%` : "",
    fbgLine,
    bpLast ? `血压最近一次 ${bpLast.value}/${bpLast.value2}` : "",
    facts.lows.length ? `低血糖 ${facts.lows.length} 次，最近一次 ${fmtDate(facts.lows[facts.lows.length - 1].at)}` : "",
  ].filter(Boolean);

  const questions = ["现在的治疗需要调整吗？", "下次多久来复查，要查什么？", "平时自己记录，最该留意什么？"];
  if (active.length) questions.unshift(`「${active[0].title}」是怎么回事，要怎么办？`);
  if (facts.lows.length) questions.push("再低血糖时该怎么做，怎么预防？");

  return {
    mode: "fallback",
    summary: {
      glance: glance.slice(0, 5),
      headline,
      overview: overview || "过去一年的记录较少，以下为已有内容的整理。",
      metricTrends,
      medicationChanges: meds.map(({ time, change }) => ({ time, change })),
      keyEvents: events.slice(0, 5).map(({ time, event }) => ({ time, event })),
      patterns: facts.insights.filter((i) => i.kind === "streak" || i.kind === "recent").map((i) => i.text),
      currentConcerns,
      hints: hints.slice(0, 3),
      questionsForDoctor: questions.slice(0, 5),
    },
  };
}

/* ---------- after the visit: what the doctor said, from the user's own words ---------- */

const LONG_TERM_MEDS = /降压|降糖|二甲双胍|缬沙坦|氨氯地平|甲钴胺|他汀|阿司匹林|胰岛素|优甲乐|长期/;
/** where "how to take it" starts inside "头孢一天两次" */
const USAGE_START = /一天|每天|每日|每晚|每次|一次|早上|晚上|早晚|饭前|饭后|餐前|餐后|睡前|发烧时|烧的时候|疼的时候|痛的时候|痛时|必要时|需要时|\d/;
/** a clause that is advice, not a medicine */
const NOT_A_MEDICINE = /^(让|叫|嘱|叮嘱|要我|建议|说|多喝|注意|休息|复查|复诊|[一两二三四五六七八九十半\d]+\s*个?(天|周|星期|个月|月))/;

function splitMedications(clause: string): AfterMedication[] {
  // "头孢和布洛芬，让多喝水，三天不退烧再去": stop at the first clause that is no longer about medicines
  const kept: string[] = [];
  for (const part of clause.split(/[，,]/)) {
    if (NOT_A_MEDICINE.test(part.trim())) break;
    kept.push(part);
  }
  return kept
    .join("，")
    .split(/[、；;，,]|和|还有|再加|另外|以及/)
    .map((x) => x.trim().replace(/^(一个|一种|一些|一点|了|的药是?)/, ""))
    .filter((x) => x.length >= 2)
    .slice(0, 6)
    .map((piece) => {
      const at = piece.search(USAGE_START);
      const name = (at > 1 ? piece.slice(0, at) : piece).replace(/[（(\s].*$/, "").trim();
      const usage = at > 1 ? piece.slice(at).trim() : "";
      return { name, usage, longTerm: LONG_TERM_MEDS.test(piece) };
    })
    .filter((x) => x.name.length >= 2 && x.name.length <= 14);
}

function followUpDaysFrom(text: string): { days: number | null; note: string | null } {
  const m =
    text.match(/(\d+|[一两二三四五六七八九十半])\s*个?(天|周|星期|礼拜|个月|月)(?:后|以后|之后)?[^。；，,]{0,10}(复查|复诊|再来|再去|回来|再查)/) ??
    text.match(/(\d+|[一两二三四五六七八九十半])\s*个?(天|周|星期|礼拜|个月|月)[^。；，,]{0,10}(不退|不好|没好|不缓解)[^。；，,]{0,6}(再去|再来|复诊)/);
  if (!m) return { days: null, note: null };
  const n = num(m[1]);
  if (!Number.isFinite(n)) return { days: null, note: null };
  const unit = m[2];
  const days = unit === "天" ? n : unit === "周" || unit === "星期" || unit === "礼拜" ? n * 7 : n * 30;
  const clause = text.split(/[。；，,]/).find((c) => c.includes(m[0])) ?? m[0];
  return { days: Math.round(days), note: clause.trim() };
}

export function fallbackAfter(req: AfterRequest): AfterResponse {
  return inChinese(() => afterByRule(req));
}

function afterByRule(req: AfterRequest): AfterResponse {
  const text = (req.text ?? "").trim();
  const dx = text.match(/(?:诊断(?:是|为)?|确诊(?:是|为)?|医生说(?:我)?是|说是|是)[：:\s]*「?([^，。；,;」]{2,24})/);
  const diagnosis = dx ? dx[1].trim() : null;
  const medClause = text.match(/(?:开了|开的药是|给我开了|加了|加用|换成了?|改成了?)([^。；]+)/);
  const medications = medClause ? splitMedications(medClause[1]) : [];
  const adviceParts = [...text.matchAll(/(?:让我?|叫我|嘱咐我?|叮嘱我?|医嘱是?|要我|建议我?)([^。；]+)/g)].map((m) => m[1].trim());
  const follow = followUpDaysFrom(text);
  const readings = extractMeasurements(text);
  const findings = readings.map((r) =>
    r.type === "bp" ? `血压 ${r.value}/${r.value2}` : r.type === "hba1c" ? `糖化血红蛋白 ${r.value}%` : `血糖 ${r.value}`,
  );
  const advice = adviceParts.length ? adviceParts.join("；") : follow.note;
  const today = fmtISODate(new Date());

  const summary = [
    req.episode
      ? `患者因「${req.episode.title}」${roughDuration(req.episode.startedAt)}就诊。`
      : "患者复诊。",
    diagnosis ? `医生诊断：${diagnosis}。` : "",
    medications.length ? `用药：${medications.map((m) => `${m.name}${m.usage ? `（${m.usage}）` : ""}`).join("、")}。` : "",
    advice ? `叮嘱：${advice}。` : "",
    !diagnosis && !medications.length ? `患者原话：${text.slice(0, 100)}` : "",
  ]
    .filter(Boolean)
    .join("");

  return {
    mode: "fallback",
    result: {
      date: today,
      hospital: null,
      department: null,
      diagnosis,
      findings,
      procedures: [...text.matchAll(/(?:做了|打了|输了)([^，。；,;]{1,10})/g)].map((m) => m[0]).slice(0, 4),
      medications,
      advice: advice ?? null,
      followUpDays: follow.days,
      followUpNote: follow.note,
      readings,
      summary,
      unclear: diagnosis || medications.length ? [] : ["没能从这段话里分出诊断和用药，已按原话存档，你可以改一下"],
    },
  };
}

/* ---------- profile: one free sentence into fields ---------- */

export function fallbackProfile(text: string): ProfileParseResponse {
  return inChinese(() => profileByRule(text));
}

function profileByRule(text: string): ProfileParseResponse {
  const out: ProfileParseResponse = { mode: "fallback", conditions: [], allergies: [], medications: [], surgeries: [], familyHistory: [] };
  const t = text.trim();
  if (!t || /^(都)?没有?。?$|^无。?$|^都没有/.test(t)) return out;
  const clean = (s: string) => s.replace(/^(我|有|还有|另外|对|长期|一直|在吃|吃|服用|做过)+/, "").replace(/(的毛病|的病史|过敏|手术)$/, "").trim();
  for (const clause of t.split(/[，,。；;、\n]/).map((x) => x.trim()).filter(Boolean)) {
    if (/没有|无/.test(clause) && clause.length <= 8) continue;
    if (/过敏/.test(clause)) out.allergies.push(clean(clause.replace(/对/, "")) || clause);
    else if (/手术|切除|开刀/.test(clause)) out.surgeries.push(clause.replace(/^(我|做过)+/, ""));
    else if (/爸|妈|父|母|家里|哥|姐|弟|妹|爷|奶/.test(clause)) out.familyHistory.push(clause);
    else if (/吃|服|药|片|胶囊/.test(clause)) out.medications.push(clean(clause) || clause);
    else out.conditions.push(clean(clause) || clause);
  }
  return out;
}
