/* 体检报告建档: what the vision model's copy of a report turns into, and what is filed afterwards. */
import { check, finish } from "./_check";
import { CHECKUP_PROMPT, checkupIsEmpty, normalizeCheckup, notACheckup, tidy } from "../../src/lib/ai/checkupAI";
import { SAMPLE_CHECKUP, checkupBackground, checkupReadingsAt, readingText, saveCheckup } from "../../src/lib/checkup";
import { setLang } from "../../src/lib/lang";
import { pendingRetest } from "../../src/lib/metrics";
import { getState, storeActions } from "../../src/lib/store";
import type { Checkup } from "../../src/lib/types";

// Fixed "today" so nothing depends on when this runs: 3 Oct 2026, 10:00 local time.
const today = new Date(2026, 9, 3, 10, 0, 0);
const json = (v: unknown) => JSON.stringify(v);
const read = (raw: unknown) => normalizeCheckup(raw, today);

/* What the vision model actually answered for public/demo/checkup-sample.jpg (one real run, kept as is). */
const SAMPLE_ANSWER = {
  isCheckup: true,
  name: "陈建华",
  gender: "男",
  birthYear: 1968,
  age: 58,
  date: "2026-09-20",
  reportDate: "2026-09-22",
  institution: "安和健康体检中心",
  heightCm: 172,
  weightKg: 78.5,
  bloodType: "A",
  bloodPressure: "148/92",
  fastingGlucose: 7.8,
  postMealGlucose: null,
  hba1c: 7.2,
  conditions: ["高血压（8年）", "2型糖尿病（3年）"],
  allergies: ["青霉素"],
  medications: ["苯磺酸氨氯地平片 5mg 每日一次", "盐酸二甲双胍片 0.5g 每日两次"],
  surgeries: ["胆囊切除术（2012年）"],
  familyHistory: ["父亲 高血压", "母亲 2型糖尿病"],
  rows: [
    ["身高", "172 cm", "", "", ""],
    ["体重", "78.5 kg", "", "", ""],
    ["体重指数（BMI）", "26.5", "", "18.5 - 23.9", "↑"],
    ["血压", "148/92 mmHg", "", "<140/90", "↑"],
    ["脉搏", "76 次/分", "", "60 - 100", ""],
    ["空腹血糖", "7.8 mmol/L", "", "3.9 - 6.1", "↑"],
    ["糖化血红蛋白", "7.2 %", "", "4.0 - 6.0", "↑"],
    ["总胆固醇", "5.9 mmol/L", "", "<5.2", "↑"],
    ["甘油三酯", "2.3 mmol/L", "", "<1.7", "↑"],
    ["低密度脂蛋白胆固醇", "3.8 mmol/L", "", "<3.4", "↑"],
    ["尿酸", "452 μmol/L", "", "208 - 428", "↑"],
    ["谷丙转氨酶", "38 U/L", "", "9 - 50", ""],
    ["肌酐", "82 μmol/L", "", "57 - 97", ""],
    ["血红蛋白", "148 g/L", "", "130 - 175", ""],
    ["血型", "A型（Rh阳性）", "", "", ""],
  ],
  findings: ["腹部超声：脂肪肝（轻度）"],
  summary: [],
  advice: [
    "血压偏高（148/92 mmHg）：建议心内科随诊，按医嘱服药，每日监测血压。",
    "空腹血糖、糖化血红蛋白高于参考范围：建议内分泌科复诊。",
    "血脂偏高、轻度脂肪肝：低脂饮食，适量运动，3至6个月后复查。",
    "尿酸偏高：少吃动物内脏和海鲜，多饮水，3个月后复查。",
  ],
  unclear: [],
};

/* ---------- the sample report ---------- */

const sample = read(SAMPLE_ANSWER);
check("the model's copy of the sample report comes out as SAMPLE_CHECKUP, word for word", json(sample) === json(SAMPLE_CHECKUP), sample);
check("SAMPLE_CHECKUP goes through normalizeCheckup unchanged", json(read(SAMPLE_CHECKUP)) === json(SAMPLE_CHECKUP), read(SAMPLE_CHECKUP));
check("all four readings of the sample are there, HbA1c included", json(sample.readings.map((r) => r.type)) === json(["bp", "fbg", "hba1c", "weight"]), sample.readings);
check("nine items are flagged on the sample, in the order printed", sample.abnormal.length === 9 && sample.abnormal[0] === "体重指数（BMI）26.5 偏高" && sample.abnormal[8] === "腹部超声：脂肪肝（轻度）", sample.abnormal);
check("normal rows of the sample are not flagged", !sample.abnormal.some((a) => /谷丙转氨酶|肌酐|脉搏|血红蛋白 148|身高|体重 /.test(a)), sample.abnormal);
check("conditions come from the history only: two, as printed", json(sample.conditions) === json(["高血压（8 年）", "2 型糖尿病（3 年）"]), sample.conditions);
check("the institution is never kept, even when the model gives one", sample.institution === null && read({ institution: "安和健康体检中心", heightCm: 170 }).institution === null);
check("the advice keeps one line per item", sample.advice?.split("\n").length === 4, sample.advice);

/* ---------- who the person is ---------- */

const ageOnly = read({ name: "周晓梅", gender: "女", birthYear: null, age: 45, date: "2025年11月08日", heightCm: 160 });
check("an age is counted back from the day of the check-up", ageOnly.birthYear === 1980 && ageOnly.date === "2025-11-08", ageOnly);
check(
  "a birth year worked out from an age is said to be approximate",
  ageOnly.unclear[0] === "报告上只印了年龄（45 岁），出生年份 1980 是按这个算的，可能差一年。",
  ageOnly.unclear,
);
check("without a date the age is counted back from today", read({ age: "45 岁", heightCm: 160 }).birthYear === 1981, read({ age: "45 岁", heightCm: 160 }).birthYear);
const both = read({ birthYear: "1968-03-12", age: 58, heightCm: 172 });
check("a printed birth date wins over the age, and needs no note", both.birthYear === 1968 && both.unclear.length === 0, both);
check("a name written with spaces is closed up", read({ name: "陈 建 华", heightCm: 172 }).name === "陈建华");
check("sex is read from 男性 / F, and left empty when not given", read({ gender: "男性" }).gender === "男" && read({ gender: "F" }).gender === "女" && read({ gender: "未知" }).gender === null);

const blood = (v: string) => read({ bloodType: v, heightCm: 170 }).bloodType;
check(
  "blood groups are reduced to A / B / AB / O",
  blood("A型（Rh阳性）") === "A" && blood("ab") === "AB" && blood("O 型") === "O" && blood("B型") === "B" && blood("不详") === null && blood("Rh阳性") === null,
  [blood("A型（Rh阳性）"), blood("ab"), blood("O 型"), blood("B型"), blood("不详"), blood("Rh阳性")],
);
check("the blood group is taken from the table when it is only there", read({ bloodType: null, rows: [["血型", "O型（Rh阳性）", "", "", ""]] }).bloodType === "O");

/* ---------- history lists ---------- */

const none = read({ conditions: ["无"], allergies: ["否认药物过敏史"], medications: ["未服药"], surgeries: ["无手术史"], familyHistory: ["否认"], heightCm: 160 });
check(
  "无 / 否认 / 未服药 never become list items",
  !none.conditions.length && !none.allergies.length && !none.medications.length && !none.surgeries.length && !none.familyHistory.length,
  none,
);
const more = read({ conditions: ["无特殊", "体健", "—", "/", "未见异常", "无脉症"], heightCm: 160 });
check("other ways of writing nothing are dropped, a real name starting with 无 is kept", json(more.conditions) === json(["无脉症"]), more.conditions);
const split = read({
  conditions: ["高血压、糖尿病"],
  allergies: ["磺胺类药物；海鲜"],
  medications: ["氨氯地平片 5mg，每日一次；二甲双胍 0.5g 每日两次"],
  surgeries: ["胆囊切除术（2012 年；腹腔镜）"],
  familyHistory: ["父亲 高血压、糖尿病"],
  heightCm: 170,
});
check("several conditions on one line are split", json(split.conditions) === json(["高血压", "糖尿病"]), split.conditions);
check("two allergies joined by a semicolon are two", json(split.allergies) === json(["磺胺类药物", "海鲜"]), split.allergies);
check("medicines split on semicolons only: the comma belongs to how it is taken", json(split.medications) === json(["氨氯地平片 5mg，每日一次", "二甲双胍 0.5g 每日两次"]), split.medications);
check("nothing is split inside brackets", json(split.surgeries) === json(["胆囊切除术（2012 年；腹腔镜）"]), split.surgeries);
check("one relative with two conditions stays one item", json(split.familyHistory) === json(["父亲 高血压、糖尿病"]), split.familyHistory);

/* ---------- numbers ---------- */

const absurd = read({ birthYear: 1068, heightCm: 1720, weightKg: 785, bloodPressure: "1480/92", fastingGlucose: 78, hba1c: 72, date: "2031-01-01", conditions: ["高血压"] });
check(
  "numbers out of any plausible range are dropped, not kept as a guess",
  absurd.birthYear === null && absurd.heightCm === null && absurd.weightKg === null && absurd.readings.length === 0 && absurd.date === null,
  absurd,
);
const weightOnly = read({ weightKg: 55 });
check("the weight is added to the readings by itself", json(weightOnly.readings) === json([{ type: "weight", value: 55, value2: null }]) && weightOnly.weightKg === 55, weightOnly.readings);
const glu = read({ rows: [["葡萄糖（GLU）", "5.4", "mmol/L", "3.9 - 6.1", ""], ["尿葡萄糖", "阴性", "", "阴性", ""], ["血红蛋白", "152", "g/L", "130 - 175", ""]] });
check("葡萄糖（GLU）in a check-up table is the fasting glucose; urine glucose and haemoglobin are not readings", json(glu.readings) === json([{ type: "fbg", value: 5.4, value2: null }]), glu.readings);
const twoRows = read({ rows: [["收缩压", "150", "mmHg", "90-139", "↑"], ["舒张压", "95", "mmHg", "60-89", "↑"]] });
check("收缩压 and 舒张压 on two rows make one blood pressure", json(twoRows.readings) === json([{ type: "bp", value: 150, value2: 95 }]), twoRows.readings);
const disputed = read({ bloodPressure: "148/92", rows: [["血压", "143/92 mmHg", "", "<140/90", "↑"], ["尿酸", "452 μmol/L", "", "208 - 428", "↑"]] });
check(
  "a number read two ways is neither filed nor listed, and the user is told",
  !disputed.readings.some((r) => r.type === "bp") &&
    json(disputed.abnormal) === json(["尿酸 452 μmol/L 偏高"]) &&
    disputed.unclear[0] === "血压认出了两个不一样的数（148/92、143/92），没有记进档案，请对照报告看一眼。",
  disputed,
);

/* ---------- which rows count as abnormal ---------- */

const table = read({
  rows: [
    ["项目", "结果", "单位", "参考范围", "提示"],
    ["身高", "175 cm", "", "", ""],
    ["体重", "82.0 kg", "", "", "↑"],
    ["脉搏", "58 次/分", "", "60-100", "↓"],
    ["总胆固醇（TC）", "5.10", "mmol/L", "<5.20", ""],
    ["尿酸（UA）", "498", "μmol/L", "208–428", "H"],
    ["高密度脂蛋白胆固醇（HDL-C）", "0.85", "mmol/L", ">1.04", "L"],
    ["低密度脂蛋白胆固醇（LDL-C）", "3.20", "mmol/L", "<3.40", "H"],
    ["尿蛋白", "阳性", "", "阴性", ""],
    ["乙肝表面抗原", "阴性", "", "阴性", ""],
    ["乙肝表面抗体", "阳性", "", "", ""],
    ["某项", "12.3", "U/L", "", "↑"],
    ["另一项", "8", "", "", "*"],
  ],
});
check(
  "flagged rows outside their range are listed with 偏高 / 偏低 worked out from the numbers",
  json(table.abnormal) === json(["脉搏 58 次/分 偏低", "尿酸（UA）498 μmol/L 偏高", "高密度脂蛋白胆固醇（HDL-C）0.85 mmol/L 偏低", "尿蛋白 阳性", "某项 12.3 U/L 偏高", "另一项 8 异常"]),
  table.abnormal,
);
check("a row inside its range with no flag is normal", !table.abnormal.some((a) => a.includes("总胆固醇")));
check("an arrow next to height or weight belongs to another row", !table.abnormal.some((a) => /身高|体重/.test(a)));
check("a row flagged although it is inside its range is left out and pointed out", !table.abnormal.some((a) => a.includes("低密度")) && table.unclear.some((u) => u.includes("低密度脂蛋白胆固醇（LDL-C）3.20") && u.includes("对不上")), table.unclear);
check("阴性 is normal, and 阳性 with nothing to compare it to is not flagged by us", !table.abnormal.some((a) => a.includes("乙肝")));
check("the table's own heading is not a row", !table.abnormal.some((a) => a.includes("项目")));

const noFlags = read({ rows: [["尿酸", "498", "μmol/L", "208-428", ""], ["肌酐", "88", "μmol/L", "57-97", ""]] });
check("on a page without a flag column, the printed range alone decides", json(noFlags.abnormal) === json(["尿酸 498 μmol/L 偏高"]), noFlags.abnormal);
const arrowInResult = read({ rows: [["空腹血糖", "7.4 ↑", "mmol/L", "3.9-6.1"]] });
check("an arrow printed after the number is the flag", json(arrowInResult.abnormal) === json(["空腹血糖 7.4 mmol/L 偏高"]) && arrowInResult.readings[0]?.value === 7.4, arrowInResult);
const bySex = (gender: string) => read({ gender, rows: [["血红蛋白", "125", "g/L", "男 130-175 女 115-150", "↓"], ["尿酸", "498", "μmol/L", "208-428", "↑"]] }).abnormal;
check("a range given per sex is applied by the person's sex", bySex("男").includes("血红蛋白 125 g/L 偏低") && !bySex("女").some((a) => a.includes("血红蛋白")), [bySex("男"), bySex("女")]);
const pipes = read({ rows: ["尿酸（UA）|498|μmol/L|208 - 428|H", "体重指数（BMI）|26.5|18.5 - 23.9|↑|", "尿蛋白（PRO）|阴性|阴性|"] });
check("rows copied as text with bars are read the same way", json(pipes.abnormal) === json(["尿酸（UA）498 μmol/L 偏高", "体重指数（BMI）26.5 偏高"]), pipes.abnormal);

const rescued = read({
  rows: [["血红蛋白", "102", "g/L", "115-150", ""], ["空腹血糖", "7.4", "mmol/L", "3.9-6.1", "↑"]],
  summary: ["3. 血红蛋白 102 g/L ↓"],
});
check(
  "one row whose flag was lost still counts when the report's own summary names it, and is listed once",
  json(rescued.abnormal) === json(["血红蛋白 102 g/L 偏低", "空腹血糖 7.4 mmol/L 偏高"]) && rescued.unclear.length === 0,
  rescued,
);

/* ---------- a page that does not add up ---------- */

const tilted = read({
  bloodPressure: "150/95",
  fastingGlucose: 7.4,
  hba1c: 5.6,
  rows: [
    ["体重指数", "21.5", "", "18.5-23.9", "↑"],
    ["糖化血红蛋白", "5.6", "%", "4.0-6.0", "↓"],
    ["空腹血糖", "7.4", "mmol/L", "3.9-6.1", "↑"],
    ["肌酐", "6.80", "mIU/L", "0.27-4.20", "↑"],
  ],
  findings: ["乳腺超声：双侧乳腺增生"],
  summary: ["空腹血糖 7.4 mmol/L ↑", "血压 150/95 mmHg，高于正常范围", "乳腺超声：双侧乳腺增生"],
});
check(
  "two rows that contradict themselves mean the table was misread: none of its rows is listed",
  json(tilted.abnormal) === json(["乳腺超声：双侧乳腺增生", "空腹血糖 7.4 mmol/L ↑", "血压 150/95 mmHg，高于正常范围"]),
  tilted.abnormal,
);
check(
  "the user is told the photo was probably taken at an angle",
  tilted.unclear.length === 1 && tilted.unclear[0] === "照片可能拍歪了：表格里有的数和参考范围对不上，所以这张表格里的异常项没有算进去。把纸放平、对正再拍一次会更准。",
  tilted.unclear,
);
check("on such a page only numbers read twice the same way are kept", json(tilted.readings.map((r) => [r.type, r.value])) === json([["fbg", 7.4], ["hba1c", 5.6]]), tilted.readings);

/* ---------- findings and the report's own summary ---------- */

const found = read({
  findings: ["心电图：窦性心律，正常心电图", "胸部X线：未见明显异常", "腹部超声：脂肪肝（中度）；肝内胆管未见异常；胆囊息肉（0.4cm）", "心电图：窦性心动过缓，其余正常", "外科：未见异常"],
});
check(
  "findings that say nothing was found are dropped, part by part",
  json(found.abnormal) === json(["腹部超声：脂肪肝（中度）；胆囊息肉（0.4cm）", "心电图：窦性心动过缓，其余正常"]),
  found.abnormal,
);
const summed = read({
  rows: [["血压", "150/95 mmHg", "", "<140/90", "↑"]],
  findings: ["甲状腺超声：甲状腺右叶结节（TI-RADS 3类）"],
  summary: ["1. 血压 150/95 mmHg，高于正常范围", "5. 甲状腺超声：甲状腺右叶结节（TI-RADS 3 类）", "7. C13 呼气试验：幽门螺杆菌阳性"],
});
check(
  "the report's summary adds only what the rows and findings did not already say",
  json(summed.abnormal) === json(["血压 150/95 mmHg 偏高", "甲状腺超声：甲状腺右叶结节（TI-RADS 3 类）", "C13 呼气试验：幽门螺杆菌阳性"]),
  summed.abnormal,
);
const summaryOnly = read({ name: "周晓梅", summary: ["1. 血压 150/95 mmHg，高于正常范围", "2. 空腹血糖 7.4 mmol/L ↑"], advice: ["1. 血压偏高：建议复测。", "2、空腹血糖偏高：建议复查。"] });
check(
  "a photo of the summary page alone still gives the list, without its numbering",
  json(summaryOnly.abnormal) === json(["血压 150/95 mmHg，高于正常范围", "空腹血糖 7.4 mmol/L ↑"]) && summaryOnly.advice === "血压偏高：建议复测。\n空腹血糖偏高：建议复查。",
  summaryOnly,
);
check(
  "nothing in the conditions is made up from a flagged number",
  read({ conditions: [], rows: [["血压", "150/95 mmHg", "", "<140/90", "↑"], ["空腹血糖", "7.4", "mmol/L", "3.9-6.1", "↑"]] }).conditions.length === 0,
);

/* ---------- several photos ---------- */

const page1 = { name: "赵国强", gender: "男", birthYear: 1975, date: "2026-08-15", heightCm: 175, weightKg: 82, bloodPressure: "128/82", conditions: ["痛风（5年）"], allergies: ["磺胺类药物；海鲜"], rows: [["血压", "128/82 mmHg", "", "<140/90", ""], ["腰围", "92 cm", "", "<90", "↑"]] };
const page2 = { name: "赵国强", reportDate: "2026-08-18", bloodType: "O型（Rh阳性）", rows: [["葡萄糖（GLU）", "5.4", "mmol/L", "3.9 - 6.1", ""], ["尿酸（UA）", "498", "μmol/L", "208 - 428", "H"]], advice: ["1. 尿酸偏高：低嘌呤饮食。"] };
const pages = read([page1, null, { isCheckup: false, name: "王小明" }, page2]);
check("pages are put together: who and when from the first, the tables from both", pages.name === "赵国强" && pages.date === "2026-08-15" && pages.bloodType === "O" && json(pages.abnormal) === json(["腰围 92 cm 偏高", "尿酸（UA）498 μmol/L 偏高"]), pages);
check("readings are collected across the pages", json(pages.readings.map((r) => r.type)) === json(["bp", "fbg", "weight"]), pages.readings);
check(
  "a photo that could not be read, and one that is something else, are named",
  pages.unclear[0] === "第 2 张照片没认出来，上面的内容没有算进去。" && pages.unclear[1] === "第 3 张照片不像体检报告，没有用它。" && pages.unclear.length === 2,
  pages.unclear,
);
check("the date of the report stands in when the day of the check-up is not printed", read([page2]).date === "2026-08-18");
const twoPeople = read([page1, { ...page2, name: "赵国华" }]);
check("two different names across the photos are pointed out", twoPeople.name === "赵国强" && twoPeople.unclear[0] === "几张照片上的姓名不一样（赵国强、赵国华），请确认是不是同一个人的报告。", twoPeople.unclear);
const tiltedSecond = read([page1, { rows: [["体重指数", "21.5", "", "18.5-23.9", "↑"], ["糖化血红蛋白", "5.6", "%", "4.0-6.0", "↓"]] }]);
check("with several photos, the one taken at an angle is named by its number", tiltedSecond.unclear[0].startsWith("第 2 张照片可能拍歪了") && json(tiltedSecond.abnormal) === json(["腰围 92 cm 偏高"]), tiltedSecond);

/* ---------- not a check-up report ---------- */

check("the model saying it is something else is taken at its word", notACheckup({ isCheckup: false }) && !notACheckup({ isCheckup: true }) && !notACheckup({}) && !notACheckup(null));
check("a name alone is not a check-up report (an electricity bill has one too)", checkupIsEmpty(read({ name: "王小明" })));
check("a photo the model called something else reads as empty whatever else it says", checkupIsEmpty(read({ isCheckup: false, name: "王秀兰", heightCm: 160, conditions: ["2 型糖尿病"] })));
check("nothing at all reads as empty", checkupIsEmpty(read(null)) && checkupIsEmpty(read({})) && checkupIsEmpty(read("乱码")));
check("one reading, or one item of history, is enough", !checkupIsEmpty(read({ weightKg: 60 })) && !checkupIsEmpty(read({ allergies: ["青霉素"] })) && !checkupIsEmpty(SAMPLE_CHECKUP));

/* ---------- spelling ---------- */

check(
  "the same thing is written one way",
  tidy("高血压(8年)") === "高血压（8 年）" &&
    tidy("胸部X线") === "胸部 X 线" &&
    tidy("7.2 %") === "7.2%" &&
    tidy("牙结石（Ⅱ度）") === "牙结石（Ⅱ 度）" &&
    tidy("促甲状腺激素 (TSH)") === "促甲状腺激素（TSH）" &&
    tidy("mL/(min·1.73m²)") === "mL/(min·1.73m²)",
  [tidy("高血压(8年)"), tidy("胸部X线"), tidy("7.2 %"), tidy("牙结石（Ⅱ度）"), tidy("促甲状腺激素 (TSH)"), tidy("mL/(min·1.73m²)")],
);
check("the prompt asks for a copy, not a translation, and no longer asks for the institution", CHECKUP_PROMPT.includes("不翻译") && !CHECKUP_PROMPT.includes("机构"));

/* ---------- saying a reading ---------- */

check(
  "a reading the way it is said",
  json(SAMPLE_CHECKUP.readings.map(readingText)) === json(["血压 148/92", "空腹血糖 7.8", "糖化血红蛋白 7.2%", "体重 78.5 kg"]) &&
    readingText({ type: "ppg", value: 9.1, value2: null }) === "饭后或其他时间的血糖 9.1",
  SAMPLE_CHECKUP.readings.map(readingText),
);

/* ---------- what goes on the page for the doctor ---------- */

const now = today.getTime();
const record = (date: string, abnormal: string[], extra: Partial<Checkup> = {}): Checkup => ({ id: date, date, abnormal, recordedAt: `${date}T12:00:00.000Z`, ...extra });
check("no check-up, nothing to say", checkupBackground({ checkups: [] }, now).length === 0);
check(
  "the latest check-up's flagged items, with its date",
  json(checkupBackground({ checkups: [record("2025-12-01", ["旧的一项"]), record("2026-09-20", ["血压 148/92 mmHg 偏高", "腹部超声：脂肪肝（轻度）"])] }, now)) ===
    json(["2026年9月20日体检报告标出：血压 148/92 mmHg 偏高、腹部超声：脂肪肝（轻度）"]),
  checkupBackground({ checkups: [record("2025-12-01", ["旧的一项"]), record("2026-09-20", ["血压 148/92 mmHg 偏高", "腹部超声：脂肪肝（轻度）"])] }, now),
);
const long = checkupBackground({ checkups: [record("2026-09-20", SAMPLE_CHECKUP.abnormal)] }, now)[0];
check("more than eight items are cut, and the total is said", long.endsWith("尿酸 452 μmol/L 偏高等 9 项") && !long.includes("脂肪肝"), long);
check("a latest check-up with nothing flagged says nothing, even if an older one had something", checkupBackground({ checkups: [record("2026-03-01", ["旧的一项"]), record("2026-09-20", [])] }, now).length === 0);
check("a check-up from more than a year ago is no longer mentioned", checkupBackground({ checkups: [record("2025-08-01", ["旧的一项"])] }, now).length === 0);
check("one from eleven months ago still is", checkupBackground({ checkups: [record("2025-11-08", ["血红蛋白 102 g/L 偏低"])] }, now)[0] === "2025年11月8日体检报告标出：血红蛋白 102 g/L 偏低");
check(
  "the day an undated report was filed is not passed off as the day of the check-up",
  checkupBackground({ checkups: [record("2026-10-03", ["尿酸 498 μmol/L 偏高"], { undated: true })] }, now)[0] === "体检报告（日期没认出来）标出：尿酸 498 μmol/L 偏高",
);

/* ---------- when the readings on a report were taken ---------- */

check("readings of a report without a date cannot be placed in time", checkupReadingsAt(null, today) === null && checkupReadingsAt("", today) === null && checkupReadingsAt("乱写", today) === null);
check("readings of an earlier day are placed at noon of that day", checkupReadingsAt("2026-09-20", today) === new Date(2026, 8, 20, 12).toISOString());
const afternoon = new Date(2026, 9, 3, 13, 0, 0);
check("readings of a report dated today are placed at the start of the day, never now", checkupReadingsAt("2026-10-03", afternoon) === new Date(2026, 9, 3, 0).toISOString());
check("a date that has not come yet is not used", checkupReadingsAt("2026-10-04", today) === null);
const veryHigh = { id: "x", type: "bp" as const, value: 190, value2: 120, source: "visit" as const, at: checkupReadingsAt("2026-10-03", afternoon) as string };
check("a very high pressure printed on today's report does not ask to be measured again in ten minutes", pendingRetest([veryHigh], afternoon.getTime()) === null);

/* ---------- filing ---------- */

// the store keeps its data in the browser; here a plain map stands in for it
const kept = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => kept.get(k) ?? null,
  setItem: (k: string, v: string) => void kept.set(k, v),
  removeItem: (k: string) => void kept.delete(k),
};
storeActions.resetAll();
saveCheckup(SAMPLE_CHECKUP);
let state = getState();
check(
  "a dated report is filed with what it flagged and advised, and without an institution",
  state.checkups.length === 1 &&
    state.checkups[0].date === "2026-09-20" &&
    state.checkups[0].undated === undefined &&
    state.checkups[0].institution === undefined &&
    state.checkups[0].abnormal.length === 9 &&
    state.checkups[0].advice === SAMPLE_CHECKUP.advice,
  state.checkups,
);
check(
  "its four readings are filed at noon of the day of the check-up",
  state.measurements.length === 4 &&
    state.measurements.every((m) => m.at === new Date(2026, 8, 20, 12).toISOString() && m.source === "visit" && m.note === "体检") &&
    json(state.measurements.map((m) => [m.type, m.value, m.value2])) === json([["bp", 148, 92], ["fbg", 7.8, null], ["hba1c", 7.2, null], ["weight", 78.5, null]]),
  state.measurements,
);
saveCheckup({ ...SAMPLE_CHECKUP, date: null });
state = getState();
check(
  "a report without a date is filed as undated, and none of its numbers are stored",
  state.checkups.length === 2 && state.checkups[1].undated === true && /^\d{4}-\d{2}-\d{2}$/.test(state.checkups[1].date) && state.measurements.length === 4,
  { checkups: state.checkups, measurements: state.measurements.length },
);
storeActions.resetAll();

/* ---------- English: only the app's own words change ---------- */

setLang("en");
const enAge = read({ age: 45, date: "2025-11-08", heightCm: 160 });
const enPages = read([page1, null]);
const enTilted = read({ rows: [["体重指数", "21.5", "", "18.5-23.9", "↑"], ["糖化血红蛋白", "5.6", "%", "4.0-6.0", "↓"]], weightKg: 55 });
const enSample = read(SAMPLE_ANSWER);
const enBackground = checkupBackground({ checkups: [record("2026-09-20", ["血压 148/92 mmHg 偏高", "腹部超声：脂肪肝（轻度）"])] }, now)[0];
const enUndated = checkupBackground({ checkups: [record("2026-10-03", SAMPLE_CHECKUP.abnormal, { undated: true })] }, now)[0];
const enReadings = SAMPLE_CHECKUP.readings.map(readingText);
setLang("zh");
check("in English the note about the birth year is in English", enAge.unclear[0] === "The report only gives an age (45), so the birth year 1980 is worked out from it and may be a year off.", enAge.unclear);
check("in English an unread photo is named in English", enPages.unclear[0] === "Photo 2 could not be read. What is on it was left out.", enPages.unclear);
check("in English the note about a tilted photo is in English", enTilted.unclear[0].startsWith("The photo may have been taken at an angle"), enTilted.unclear);
check(
  "in English what was copied from the report stays as printed",
  json(enSample.conditions) === json(SAMPLE_CHECKUP.conditions) && json(enSample.abnormal) === json(SAMPLE_CHECKUP.abnormal) && enSample.advice === SAMPLE_CHECKUP.advice,
  enSample,
);
check("in English the line for the doctor has English words around the report's own", enBackground === "Marked on the check-up report of Sep 20, 2026: 血压 148/92 mmHg 偏高, 腹部超声：脂肪肝（轻度）", enBackground);
check("in English an undated report says so, and gives the total when cut", enUndated.startsWith("Marked on a check-up report (its date could not be read): ") && enUndated.endsWith(" (9 in all)"), enUndated);
check("in English a reading is named in English", json(enReadings) === json(["Blood pressure 148/92", "Fasting glucose 7.8", "HbA1c 7.2%", "Weight 78.5 kg"]), enReadings);
check("back in Chinese, the same call gives Chinese again", read({ age: 45, date: "2025-11-08", heightCm: 160 }).unclear[0].startsWith("报告上只印了年龄"));

finish("checkup");
