import type { ChatMeasurement, CheckupResult, Gender, MetricType } from "../types";
import { L } from "../lang";
import { METRICS } from "../metrics";
import { normalizeMeasurements, nullable, str, strList } from "./normalize";

/* 体检报告建档 with the vision model: the prompt, and what its answer goes through before it is used. */

/**
 * One photo per request, and the model only copies what is printed. Which rows count as abnormal
 * is decided by rule further down. Asked to pick the abnormal rows itself, the model listed rows
 * the report had not flagged, and on a tilted photo paired a name with the number printed one row
 * below; copying every row in order, it got the same pages right.
 */
export const CHECKUP_PROMPT = `这是用户拍的一张照片，应该是体检报告的其中一页。请把纸上印着的内容照原样抄下来，用来给这个人建立健康档案。你只负责抄写：不判断，不总结，不翻译，不补充纸上没有的字。纸上是什么文字就抄什么文字。

要求：
- 只抄照片上看得清的字。看不清、被遮住、反光或拿不准的不要猜：这一项填 null 或留空，并在 unclear 里用一句话说明是哪里。
- isCheckup：这张照片是不是体检报告、体检表，或者体检里的化验单、检查单。不是（处方、门诊病历、出院小结、药盒、账单、风景、人像等）就填 false，其余字段留空。
- date 填体检日期（检查日期）。纸上只有报告日期、打印日期时，date 填 null，把它填进 reportDate。
- 纸上有出生日期就把年份填进 birthYear；只有年龄就填 age，birthYear 填 null，不要自己用年龄去算。
- conditions 只抄“既往史”“病史”一栏里写明的病，连同年数（如“高血压（8 年）”）。不要根据检查结果自己下结论：血糖高不等于糖尿病，血压高不等于高血压。这次体检新查出来的问题不算既往病史。
- allergies、medications、surgeries、familyHistory 同样只抄纸上写明的，一项一条；写着“无”“否认”“未提供”，或者纸上没有这一栏，就给空数组。medications 连同用法照抄（如“氨氯地平片 5mg 每日一次”）。
- heightCm、weightKg、bloodPressure、fastingGlucose、postMealGlucose、hba1c：纸上有就填，没有就填 null。化验单上的“葡萄糖”“GLU”按空腹血糖填。
- rows：把结果表格（一般检查、化验、检验）里的每一行都抄下来，正常的行也抄，不要挑。每一行是正好五个字符串：["项目","结果","单位","参考范围","提示"]。纸上哪一栏是空的，或者表格没有这一栏，就写空字符串 ""。提示栏照抄纸上的符号（↑、↓、H、L、阳性、+ 等），空着就写 ""，不要自己判断高低。抄每一行时只抄这一行自己的字，不要串到上一行或下一行。
- findings：超声、心电图、X 线、CT 和各科检查里查出了问题的结论，写成“检查名：结论”，照抄。写着“未见异常”“正常”、没有查出问题的不要抄。
- summary：纸上如果有“异常结果汇总”“阳性发现”一类的清单，一条一条照抄；没有就给空数组。
- advice：报告最后的结论和建议，一条一条照抄，最多 8 条；没有就给空数组。

严格输出 JSON：
{
  "isCheckup": true 或 false,
  "name": "姓名或 null",
  "gender": "男" | "女" | null,
  "birthYear": 四位数年份或 null,
  "age": 年龄或 null,
  "date": "体检日期 YYYY-MM-DD 或 null",
  "reportDate": "报告日期 YYYY-MM-DD 或 null",
  "heightCm": 身高或 null,
  "weightKg": 体重或 null,
  "bloodType": "A" | "B" | "AB" | "O" | null,
  "bloodPressure": "高压/低压，如 128/82，或 null",
  "fastingGlucose": 空腹血糖或 null,
  "postMealGlucose": 餐后 2 小时血糖或 null,
  "hba1c": 糖化血红蛋白或 null,
  "conditions": ["既往史里写明的病"],
  "allergies": ["过敏史"],
  "medications": ["正在用的药，连同用法"],
  "surgeries": ["手术史"],
  "familyHistory": ["家族史，如 父亲 高血压"],
  "rows": [["项目", "结果", "单位", "参考范围", "提示"]],
  "findings": ["检查名：查出的问题"],
  "summary": ["异常结果汇总里的一条"],
  "advice": ["结论和建议里的一条"],
  "unclear": ["拿不准的地方，每条一句"]
}`;

/* ---------- small helpers ---------- */

const MAX_ABNORMAL = 20;
const MAX_ADVICE = 8;
const MAX_UNCLEAR = 8;

const NOTHING_WRITTEN =
  /^(无|没有|都没有|暂无|均无|none|null|n\/?a|不详|不清楚|未知|未提供|未填写?|未诉|未述|未见|未发现|否|[—–\-\/\\]+|无特殊.*|(未见|未发现|无)(明显)?异常|否认.*|无.{0,8}史|无(药物|食物)?过敏|无(长期|规律)?(用药|服药)|未(用药|服药)|无手术|无外伤|(既往)?体健)$/i;

const uniqBy = <T,>(xs: T[], key: (x: T) => string): T[] => {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};
const squeeze = (s: string) => s.replace(/\s+/g, "");

/**
 * One way of writing the same thing. The model copies "高血压（8年）" on one run and "高血压（8 年）"
 * on the next; the words are the report's, the spacing is ours.
 */
export function tidy(text: string): string {
  return text
    .replace(/\s+/g, " ")
    // brackets around or right after Chinese text are written the Chinese way: "高血压(8年)" -> "高血压（8 年）"
    .replace(/([\u4e00-\u9fff]?) ?\(([^()]*)\)/g, (m, before: string, inner: string) =>
      before || /[\u4e00-\u9fff]/.test(inner) ? `${before}（${inner}）` : m,
    )
    .replace(/([\u4e00-\u9fff])([A-Za-z0-9\u2160-\u216b])/g, "$1 $2")
    .replace(/([A-Za-z0-9%\u2160-\u216b])([\u4e00-\u9fff])/g, "$1 $2")
    .replace(/(\d)\s+%/g, "$1%")
    .replace(/\s*([（）])\s*/g, "$1")
    .replace(/\s+([，。；：、])/g, "$1")
    .trim();
}

/** "1. " / "2、" / "（3）" / "④" in front of a copied list item. */
const unnumbered = (s: string) => s.replace(/^\s*(?:[（(]\d{1,2}[)）]|\d{1,2}\s*[.、．)）](?!\d)|[①-⑳])\s*/, "");

/** Splits on the given separators, but never inside brackets: "胆囊切除术（2012 年；腹腔镜）" stays whole. */
function splitOutside(text: string, seps: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if ("（([【".includes(ch)) depth++;
    else if ("）)]】".includes(ch)) depth = Math.max(0, depth - 1);
    if (depth === 0 && seps.includes(ch)) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);

/** Items of a history list: split where the report listed several on one line, minus the ways of writing "none". */
function historyList(v: unknown, seps: string, max: number, len: number): string[] {
  const raw = Array.isArray(v) ? strList(v, 24) : typeof v === "string" ? [v] : [];
  const items = raw
    .flatMap((x) => splitOutside(x, seps))
    .map((x) => tidy(unnumbered(x)).replace(/[。.；;，,、\s]+$/, ""))
    .filter((x) => x && !NOTHING_WRITTEN.test(x))
    .map((x) => clip(x, len));
  return uniqBy(items, squeeze).slice(0, max);
}

/** The first number in a value that may come as 172, "172 cm" or "约 172"; null when out of the plausible range. */
function inRange(v: unknown, lo: number, hi: number): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).match(/\d+(?:\.\d+)?/)?.[0] ?? NaN);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A date as printed ("2025年11月08日", "2025/11/8", "2025-11-08") as YYYY-MM-DD, if it is a real day that has already happened. */
function dateIn(v: unknown, today: Date): string | null {
  const m = str(v).match(/((?:19|20)\d{2})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const at = new Date(y, mo - 1, d, 12);
  if (at.getFullYear() !== y || at.getMonth() !== mo - 1 || at.getDate() !== d) return null;
  // a report cannot be from the future; a day of slack covers time zones
  if (at.getTime() > today.getTime() + 36 * 3_600_000 || y < 1990) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

/* ---------- result tables: rows, reference ranges, flags ---------- */

interface Row {
  name: string;
  result: string;
  unit: string;
  range: string;
  flag: string;
}

const BLANK = /^[\s—–\-\/\\.·]*$/;
const FLAG = /^(↑+|↓+|↗|↘|H{1,2}|L{1,2}|\++|＋+|\*+|阳性|弱阳性|偏高|偏低|升高|降低|增高|减低|高|低|异常)$/i;
const looksLikeRange = (s: string) => (/\d/.test(s) && /[-–—~～<>＜＞≤≥至]/.test(s)) || /^(阴性|正常|未见|无)/.test(s);

/**
 * One table row as copied by the model. Tables differ (some have no unit column, some no flag
 * column) and the model does not always keep five fields, so everything after the name and the
 * result is placed by what it looks like rather than by where it stands.
 */
function readRow(v: unknown): Row | null {
  let cells: string[];
  if (Array.isArray(v)) cells = v.map((x) => (typeof x === "string" || typeof x === "number" ? String(x).trim() : ""));
  else if (typeof v === "string") cells = v.split("|").map((x) => x.trim());
  else if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    cells = [o.item ?? o.name, o.result ?? o.value, o.unit, o.range, o.flag].map((x) => (x == null ? "" : String(x).trim()));
  } else return null;
  const name = tidy(cells[0] ?? "");
  let result = cells[1] ?? "";
  // nothing in the result cell, or the table's own heading copied as a row
  if (!name || BLANK.test(result) || /^(项目|检查项目|项目名称)$/.test(name)) return null;
  let unit = "";
  let range = "";
  let flag = "";
  const rest = cells.slice(2);
  rest.forEach((cell, i) => {
    if (BLANK.test(cell)) return;
    const last = i === rest.length - 1;
    // "阳性" is a flag in the last column and a reference value anywhere else
    if (FLAG.test(cell) && !(/阳性/.test(cell) && !last && !range)) flag = flag || cell;
    else if (looksLikeRange(cell) || /^阳性/.test(cell)) range = range || cell;
    else unit = unit || cell;
  });
  // some reports print the arrow right after the number
  const tail = result.match(/\s*(↑+|↓+)\s*$/);
  if (tail) {
    flag = flag || tail[1];
    result = result.slice(0, tail.index).trim();
  }
  return { name, result, unit, range, flag };
}

interface Bounds {
  lo: number | null;
  hi: number | null;
  /** the bound itself is already outside: "<5.2" excludes 5.2, "3.9–6.1" includes both ends */
  loOpen: boolean;
  hiOpen: boolean;
}

const NUM = "(\\d+(?:\\.\\d+)?)";
/** The number a result starts with: "7.8 mmol/L" is 7.8, "阳性" and "<0.5" are not numbers. */
const leadingNumber = (text: string): number | null => {
  const m = text.match(new RegExp(`^${NUM}`));
  return m ? Number(m[1]) : null;
};

function parseBounds(text: string, gender: Gender | null): Bounds | null {
  let s = text.replace(/[＜]/g, "<").replace(/[＞]/g, ">").replace(/\s+/g, "");
  // "男 130–175 女 115–150": only usable when we know which half applies
  if (/[男女]/.test(s)) {
    if (gender !== "男" && gender !== "女") return null;
    const part = s.match(new RegExp(`${gender}[^\\d<>≤≥]*([<>≤≥]?=?[\\d.]+(?:[-–—~～至]+[\\d.]+)?)`));
    if (!part) return null;
    s = part[1];
  }
  // "×10^9/L" is a unit, not two more numbers
  s = s.replace(/[×xX*]?10(?:\^|E|e)?\d{1,2}\/[A-Za-zμ]+/g, "").replace(/[×xX*]?10[⁰¹²³⁴-⁹]+\/[A-Za-zμ]+/g, "");
  let m = s.match(new RegExp(`^(<=?|≤)${NUM}`));
  if (m) return { lo: null, hi: Number(m[2]), loOpen: false, hiOpen: m[1] === "<" };
  m = s.match(new RegExp(`^(>=?|≥)${NUM}`));
  if (m) return { lo: Number(m[2]), hi: null, loOpen: m[1] === ">", hiOpen: false };
  m = s.match(new RegExp(`${NUM}[-–—~～至]+${NUM}`));
  if (m && Number(m[1]) <= Number(m[2])) return { lo: Number(m[1]), hi: Number(m[2]), loOpen: false, hiOpen: false };
  return null;
}

function outside(value: number, b: Bounds): "high" | "low" | null {
  if (b.hi != null && (b.hiOpen ? value >= b.hi : value > b.hi)) return "high";
  if (b.lo != null && (b.loOpen ? value <= b.lo : value < b.lo)) return "low";
  return null;
}

const BP_VALUE = /(?<!\d)(\d{2,3})\s*[/／]\s*(\d{2,3})(?!\d)/;

/**
 * Where a row's result stands against the range printed beside it; "unknown" when the two cannot
 * be compared. "positive" is a 阳性 result where the report expects 阴性.
 */
function againstRange(row: Row, gender: Gender | null): "high" | "low" | "within" | "positive" | "unknown" {
  if (!row.range) return "unknown";
  const bp = row.result.match(BP_VALUE);
  if (bp) {
    const parts = row.range.replace(/\s+/g, "").split(/[/／]/);
    if (parts.length !== 2) return "unknown";
    const sys = parseBounds(parts[0], gender);
    // "<140/90": the sign belongs to both numbers
    const dia = parseBounds(/^[<>≤≥＜＞]/.test(parts[1]) ? parts[1] : `${parts[0].match(/^[<>≤≥＜＞]=?/)?.[0] ?? ""}${parts[1]}`, gender);
    if (!sys || !dia) return "unknown";
    const a = outside(Number(bp[1]), sys);
    const b = outside(Number(bp[2]), dia);
    return a === "high" || b === "high" ? "high" : a === "low" || b === "low" ? "low" : "within";
  }
  const positive = /阳性|^[+＋]|[（(][+＋]+[)）]|\d\+/.test(row.result) && !/阴性/.test(row.result);
  const negative = /阴性|^[-—–]$|[（(][-—–][)）]/.test(row.result);
  if (positive || negative) {
    if (!/阴性/.test(row.range)) return "unknown";
    return positive ? "positive" : "within";
  }
  const value = leadingNumber(row.result);
  if (value == null) return "unknown";
  const bounds = parseBounds(row.range, gender);
  if (!bounds) return "unknown";
  return outside(value, bounds) ?? "within";
}

const bareName = (name: string) => squeeze(name.replace(/[（(][^（()）]*[)）]/g, ""));

/** "尿酸 452 μmol/L 偏高": a row the way it is said. */
function rowText(row: Row, word: string): string {
  const value = tidy(`${row.result}${row.unit && !row.result.includes(row.unit) ? ` ${row.unit}` : ""}`);
  return tidy(`${row.name}${/[）)]$/.test(row.name) ? "" : " "}${value}${word ? ` ${word}` : ""}`);
}

const NORMAL_CLAUSE = /未见(明显)?异常|未发现(明显)?异常|无(明显)?异常|未见明显|(?<!不)正常|阴性|^窦性心律$|^无$|^未见$/;
/** "窦性心律，正常心电图" says nothing was found; "窦性心动过缓，其余正常" does not. */
const nothingFound = (part: string) => splitOutside(part, "，,").every((clause) => !clause.trim() || NORMAL_CLAUSE.test(clause.trim()));

/** "腹部超声：脂肪肝（轻度）；肝内未见异常" keeps only the part where something was found. */
function findingText(v: string): string | null {
  const line = tidy(unnumbered(v)).replace(/[。.；;\s]+$/, "");
  const at = line.search(/[：:]/);
  const head = at > 0 ? line.slice(0, at).trim() : "";
  const body = at > 0 ? line.slice(at + 1) : line;
  const parts = splitOutside(body, "；;")
    .map((x) => x.trim())
    .filter((x) => x && !nothingFound(x));
  if (!parts.length) return null;
  return head ? `${head}：${parts.join("；")}` : parts.join("；");
}

/* ---------- one page ---------- */

interface Page {
  name: string | null;
  gender: Gender | null;
  birthYear: number | null;
  age: number | null;
  date: string | null;
  reportDate: string | null;
  heightCm: number | null;
  weightKg: number | null;
  bloodType: string | null;
  conditions: string[];
  allergies: string[];
  medications: string[];
  surgeries: string[];
  familyHistory: string[];
  /** readings stated outright, and the same ones as they stand in the copied rows */
  stated: ChatMeasurement[];
  rows: Row[];
  findings: string[];
  summary: string[];
  /** lines already judged abnormal: a result that is being read a second time */
  given: string[];
  advice: string[];
  unclear: string[];
}

const READING_ROWS: { type: MetricType; name: RegExp; not?: RegExp }[] = [
  { type: "bp", name: /^(血压|BP\b)/i },
  { type: "hba1c", name: /糖化血红蛋白|HbA1c/i },
  { type: "ppg", name: /餐后.*(血糖|葡萄糖)|2\s*h.*(血糖|葡萄糖|PG)/i },
  { type: "fbg", name: /空腹血糖|空腹葡萄糖|^(血清)?葡萄糖|^血糖|^GLU\b|FPG|FBG/i, not: /尿|餐后|2\s*h|糖化|耐量/i },
  { type: "weight", name: /^体重(?!指数)/ },
];

function readingOfRow(row: Row): ChatMeasurement | null {
  const kind = READING_ROWS.find((k) => k.name.test(row.name) && !(k.not && k.not.test(row.name)));
  if (!kind) return null;
  const bp = row.result.match(BP_VALUE);
  if (kind.type === "bp") return bp ? { type: "bp", value: Number(bp[1]), value2: Number(bp[2]) } : null;
  const value = leadingNumber(row.result);
  return value != null ? { type: kind.type, value, value2: null } : null;
}

/** The readings that stand in a page's rows. Some reports print 收缩压 and 舒张压 on two rows. */
function readingsOfRows(rows: Row[]): ChatMeasurement[] {
  const out = rows.map(readingOfRow).filter((r): r is ChatMeasurement => r != null);
  if (!out.some((r) => r.type === "bp")) {
    const sys = rows.find((r) => /^收缩压/.test(r.name));
    const dia = rows.find((r) => /^舒张压/.test(r.name));
    const a = sys ? leadingNumber(sys.result) : null;
    const b = dia ? leadingNumber(dia.result) : null;
    if (a != null && b != null) out.push({ type: "bp", value: a, value2: b });
  }
  return out;
}

function readPage(raw: unknown, today: Date): Page {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const g = str(o.gender);
  const gender: Gender | null = g.includes("男") || /^m(ale)?$/i.test(g) ? "男" : g.includes("女") || /^f(emale)?$/i.test(g) ? "女" : null;
  const thisYear = today.getFullYear();
  const year = Number(String(o.birthYear ?? "").match(/(?:19|20)\d{2}/)?.[0] ?? NaN);
  const name = nullable(o.name)?.replace(/([\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, "$1") ?? null;
  const rows = (Array.isArray(o.rows) ? o.rows : []).map(readRow).filter((r): r is Row => r != null).slice(0, 120);
  // the blood group is sometimes only in the table: "血型 | A 型（Rh 阳性）"
  const bloodText = str(o.bloodType) || (rows.find((r) => /^(ABO)?血型/.test(r.name))?.result ?? "");
  const blood = bloodText.toUpperCase().match(/^(AB|A|B|O)(?![A-Z])/);
  const weightKg = inRange(o.weightKg, 20, 250);

  const bp = str(o.bloodPressure).match(BP_VALUE);
  const stated = normalizeMeasurements([
    ...(Array.isArray(o.readings) ? o.readings : []),
    bp ? { type: "bp", value: Number(bp[1]), value2: Number(bp[2]) } : null,
    { type: "fbg", value: inRange(o.fastingGlucose, 0, 1000) },
    { type: "ppg", value: inRange(o.postMealGlucose, 0, 1000) },
    { type: "hba1c", value: inRange(o.hba1c, 0, 1000) },
  ]);

  const lines = (v: unknown, max: number, len: number) =>
    uniqBy(
      (Array.isArray(v) ? strList(v, 40) : typeof v === "string" ? v.split(/\n+/) : [])
        .map((x) => tidy(unnumbered(x)))
        .filter((x) => x && !NOTHING_WRITTEN.test(x.replace(/[。.]$/, "")))
        .map((x) => clip(x, len)),
      squeeze,
    ).slice(0, max);

  // an "abnormal" list of plain strings means this is a finished result, not the model's copy
  const abnormal = Array.isArray(o.abnormal) ? o.abnormal : [];
  return {
    name: name && name.length <= 20 ? name : null,
    gender,
    birthYear: Number.isFinite(year) && year >= thisYear - 110 && year <= thisYear ? year : null,
    age: inRange(o.age, 0, 110),
    date: dateIn(o.date, today),
    reportDate: dateIn(o.reportDate, today),
    heightCm: inRange(o.heightCm, 50, 250),
    weightKg,
    bloodType: blood ? blood[1] : null,
    conditions: historyList(o.conditions, "；;、", 10, 60),
    allergies: historyList(o.allergies, "；;、", 10, 40),
    // a comma inside a medicine line separates the name from how it is taken
    medications: historyList(o.medications, "；;", 10, 60),
    surgeries: historyList(o.surgeries, "；;、", 10, 60),
    familyHistory: historyList(o.familyHistory, "；;", 10, 40),
    stated,
    rows,
    findings: (Array.isArray(o.findings) ? strList(o.findings, 30) : []).map(findingText).filter((x): x is string => x != null),
    summary: lines(o.summary, 20, 80),
    given: lines(
      abnormal.filter((x) => typeof x === "string"),
      MAX_ABNORMAL,
      80,
    ),
    advice: lines(o.advice, MAX_ADVICE, 160),
    unclear: strList(o.unclear, 6).map(tidy),
  };
}

/* ---------- the whole report ---------- */

const READING_ORDER: MetricType[] = ["bp", "fbg", "ppg", "hba1c", "weight"];
const same = (a: ChatMeasurement, b: ChatMeasurement) => Math.abs(a.value - b.value) < 0.05 && Math.abs((a.value2 ?? 0) - (b.value2 ?? 0)) < 0.05;
const shown = (r: ChatMeasurement) => (r.type === "bp" ? `${r.value}/${r.value2}` : String(r.value));

/** The model itself said this photo is something else (a prescription, a bill, a landscape). */
export function notACheckup(raw: unknown): boolean {
  return Boolean(raw && typeof raw === "object" && (raw as Record<string, unknown>).isCheckup === false);
}

interface Found {
  text: string;
  key: string;
  row: Row;
}

/** What one page's table says is out of range, judged by the report's own flag and its own reference range. */
function judgeRows(p: Page, gender: Gender | null, said: string): { found: Found[]; odd: string[]; mismatches: number } {
  const usesFlags = p.rows.some((r) => r.flag);
  const found: Found[] = [];
  const odd: string[] = [];
  let mismatches = 0;
  for (const row of p.rows) {
    // a report gives no reference range for height or weight: an arrow there belongs to another row
    if (/^(身高|体重)(?!指数)/.test(row.name)) continue;
    const stand = againstRange(row, gender);
    const flagged = Boolean(row.flag);
    const key = bareName(row.name);
    let is: boolean;
    // 阳性 where 阴性 is expected needs no arrow: the result is its own mark
    if (stand === "positive") is = true;
    else if (stand === "unknown") is = flagged;
    else if (stand !== "within" && (flagged || !usesFlags)) is = true;
    else if (stand === "within" && !flagged) is = false;
    else {
      // flag and range disagree: believe neither, unless the report's own summary names the item
      mismatches++;
      is = key.length >= 2 && said.includes(key);
      if (!is) odd.push(tidy(`${row.name} ${row.result}`));
    }
    if (!is) continue;
    const word =
      stand === "positive" ? "" : stand === "high" ? "偏高" : stand === "low" ? "偏低" : /↑|H|高/i.test(row.flag) ? "偏高" : /↓|L|低/i.test(row.flag) ? "偏低" : /阳性|[+＋]/.test(row.result) ? "" : "异常";
    found.push({ text: rowText(row, word), key, row });
  }
  return { found, odd, mismatches };
}

/**
 * A check-up report as read by the vision model, cut down to what can go into a profile.
 * Takes the model's answer for one photo, or a list of answers, one per photo (null for a photo
 * that could not be read). Numbers out of a plausible range are dropped rather than kept as a
 * guess, a row only counts as abnormal when the report's own flag and its own reference range
 * agree, and a page whose table does not add up is not believed row by row.
 */
export function normalizeCheckup(raw: unknown, today: Date = new Date()): CheckupResult {
  const answers = Array.isArray(raw) ? raw : [raw];
  const many = answers.length > 1;
  const photo = (i: number) => (many ? L(`第 ${i + 1} 张照片`, `Photo ${i + 1}`) : L("照片", "The photo"));
  const notes: string[] = [];
  const pages: { index: number; page: Page }[] = [];
  answers.forEach((answer, index) => {
    // a photo that was not used is said out loud, so nobody assumes it was read
    if (answer == null) {
      if (many) notes.push(L(`${photo(index)}没认出来，上面的内容没有算进去。`, `${photo(index)} could not be read. What is on it was left out.`));
    } else if (notACheckup(answer)) {
      if (many) notes.push(L(`${photo(index)}不像体检报告，没有用它。`, `${photo(index)} does not look like a check-up report, so it was not used.`));
    } else pages.push({ index, page: readPage(answer, today) });
  });
  const first = <T,>(pick: (p: Page) => T | null): T | null => {
    for (const { page } of pages) {
      const v = pick(page);
      if (v != null) return v;
    }
    return null;
  };
  const all = <T,>(pick: (p: Page) => T[]): T[] => pages.flatMap(({ page }) => pick(page));

  const names = uniqBy(
    pages.map(({ page }) => page.name).filter((n): n is string => n != null),
    (n) => n,
  );
  if (names.length > 1) {
    notes.push(
      L(
        `几张照片上的姓名不一样（${names.join("、")}），请确认是不是同一个人的报告。`,
        `The photos show different names (${names.join(", ")}). Please check they are from the same person's report.`,
      ),
    );
  }
  const gender = first((p) => p.gender);
  const date = first((p) => p.date) ?? first((p) => p.reportDate);

  // an age is as of the day of the check-up
  let birthYear = first((p) => p.birthYear);
  const age = first((p) => p.age);
  if (birthYear == null && age != null) {
    const years = Math.round(age);
    birthYear = (date ? Number(date.slice(0, 4)) : today.getFullYear()) - years;
    notes.push(
      L(
        `报告上只印了年龄（${years} 岁），出生年份 ${birthYear} 是按这个算的，可能差一年。`,
        `The report only gives an age (${years}), so the birth year ${birthYear} is worked out from it and may be a year off.`,
      ),
    );
  }

  /* the tables: a row counts when the report's flag and the report's range agree */
  const said = squeeze(all((p) => [...p.summary, ...p.advice]).join("\n"));
  const judged = pages.map(({ index, page }) => ({ index, ...judgeRows(page, gender, said) }));
  // Several rows whose number and range do not belong together: the photo was taken at an angle
  // and the model paired cells of neighbouring rows. Nothing in that table is believed.
  const tilted = new Set(judged.filter((j) => j.mismatches >= 2).map((j) => j.index));

  /* readings: what was stated outright against what stands in the copied rows */
  const perType = new Map<MetricType, ChatMeasurement>();
  const disputed = new Set<MetricType>();
  let heightCm: number | null = null;
  for (const { index, page } of pages) {
    const inRows = normalizeMeasurements(readingsOfRows(page.rows).slice(0, 6));
    const stated = page.weightKg != null && !page.stated.some((r) => r.type === "weight") ? [...page.stated, { type: "weight" as const, value: page.weightKg, value2: null }] : page.stated;
    for (const type of READING_ORDER) {
      if (perType.has(type) || disputed.has(type)) continue;
      const a = stated.find((r) => r.type === type) ?? null;
      const b = inRows.find((r) => r.type === type) ?? null;
      if (a && b && !same(a, b)) {
        // the same number read twice and not the same: neither is worth filing
        disputed.add(type);
        notes.push(
          L(
            `${METRICS[type].label}认出了两个不一样的数（${shown(a)}、${shown(b)}），没有记进档案，请对照报告看一眼。`,
            `${METRICS[type].label}: two different numbers were read (${shown(a)}, ${shown(b)}), so neither was saved. Please check the report.`,
          ),
        );
        continue;
      }
      // on a page that does not add up, a number read only once is not kept
      const r = tilted.has(index) ? (a && b ? a : null) : (a ?? b);
      if (r) perType.set(type, { type, value: r.value, value2: type === "bp" ? r.value2 : null });
    }
    if (heightCm == null) {
      const row = page.rows.find((r) => /^身高/.test(r.name));
      const fromRow = row ? inRange(row.result, 50, 250) : null;
      const agree = page.heightCm == null || fromRow == null || Math.abs(page.heightCm - fromRow) < 0.05;
      if (agree && !(tilted.has(index) && (page.heightCm == null || fromRow == null))) heightCm = page.heightCm ?? fromRow;
    }
  }
  const readings = READING_ORDER.flatMap((type) => perType.get(type) ?? []);

  /* what the report flagged, in the order it is printed: tables, then findings, then its own summary */
  const abnormal: string[] = [];
  const covered: string[] = [];
  const odd: string[] = [];
  for (const j of judged) {
    if (tilted.has(j.index)) {
      notes.push(
        L(
          `${photo(j.index)}可能拍歪了：表格里有的数和参考范围对不上，所以这张表格里的异常项没有算进去。把纸放平、对正再拍一次会更准。`,
          `${photo(j.index)} may have been taken at an angle: some numbers in its table do not match their normal ranges, so the out-of-range results in that table were left out. Lay the page flat and photograph it straight on for a better read.`,
        ),
      );
      continue;
    }
    for (const f of j.found) {
      // a number that was read two ways is not listed either way
      const kind = readingOfRow(f.row)?.type;
      if (kind && disputed.has(kind)) continue;
      abnormal.push(f.text);
      covered.push(f.key);
    }
    odd.push(...j.odd);
  }
  for (const f of all((p) => p.findings)) {
    abnormal.push(f);
    const at = f.indexOf("：");
    if (at > 0) covered.push(squeeze(f.slice(0, at)));
  }
  // the report's own list of problems, for whatever the rows above did not already say
  for (const line of all((p) => p.summary)) {
    const flat = squeeze(line);
    if (covered.some((k) => k.length >= 2 && flat.includes(k))) continue;
    if (/^(未见|无)(明显)?异常/.test(line)) continue;
    abnormal.push(line.replace(/[。.；;\s]+$/, ""));
  }
  abnormal.push(...all((p) => p.given));
  if (odd.length) {
    const items = uniqBy(odd, squeeze).slice(0, 6);
    notes.push(
      L(
        `这几项的数和报告上的标记对不上，没有算进要留意的：${items.join("、")}。请对照报告看一眼。`,
        `These results do not match the marks printed beside them, so they were left out: ${items.join(", ")}. Please check the report.`,
      ),
    );
  }

  const merge = (pick: (p: Page) => string[], max: number) => uniqBy(all(pick), squeeze).slice(0, max);
  const advice = merge((p) => p.advice, MAX_ADVICE);

  return {
    name: names[0] ?? null,
    gender,
    birthYear,
    date,
    // Never read from the photo. Asked for it, the model wrote the name of a well-known chain
    // in place of a small clinic's name printed on the page; a missing field does less harm.
    institution: null,
    heightCm,
    weightKg: perType.get("weight")?.value ?? null,
    bloodType: first((p) => p.bloodType),
    conditions: merge((p) => p.conditions, 10),
    allergies: merge((p) => p.allergies, 10),
    medications: merge((p) => p.medications, 10),
    surgeries: merge((p) => p.surgeries, 10),
    familyHistory: merge((p) => p.familyHistory, 10),
    readings,
    abnormal: uniqBy(abnormal, squeeze).slice(0, MAX_ABNORMAL),
    advice: advice.length ? advice.join("\n") : null,
    unclear: uniqBy([...notes, ...all((p) => p.unclear)], squeeze).slice(0, MAX_UNCLEAR),
  };
}

/**
 * True when nothing about the person's health was read. A name alone does not make a check-up
 * report: an electricity bill has one too.
 */
export function checkupIsEmpty(r: CheckupResult): boolean {
  return (
    r.heightCm == null &&
    r.weightKg == null &&
    !r.bloodType &&
    !r.readings.length &&
    !r.abnormal.length &&
    !r.conditions.length &&
    !r.allergies.length &&
    !r.medications.length &&
    !r.surgeries.length &&
    !r.familyHistory.length &&
    !r.advice
  );
}
