/* Unit checks for the emergency page (应急手册) rules in src/lib/sos.ts. Run with: npx tsx scripts/tests/sos.test.ts */
import { check, finish } from "./_check";
import { buildWangXiulanState } from "../fixtures/demo-wang";
import { buildDemoState } from "../fixtures/demo-liming";
import { GLUCOSE_LOW, evaluateMeasurement } from "../../src/lib/metrics";
import { COLLAPSE, GENERAL_SIGNS, NOT_SURE, bloodThinners, buildSos, dialable, notSure, sosFlags, sosToText, type SosPlan } from "../../src/lib/sos";
import { setLang } from "../../src/lib/lang";
import { metadata } from "../../src/app/sos/layout";
import type { Profile } from "../../src/lib/types";

const ANCHOR = new Date(2026, 9, 2, 9, 0, 0);

/** The demo builders type the profile as nullable; both always set it. */
function present<T>(x: T | null | undefined, what: string): T {
  if (x == null) throw new Error(`${what} is missing`);
  return x;
}
const WANG = present(buildWangXiulanState(ANCHOR).profile, "王秀兰's profile");
const LI = present(buildDemoState().profile, "李明's profile");

const keys = (p: SosPlan) => p.blocks.map((b) => b.key);
const selfKeys = (p: SosPlan) => p.self.map((g) => g.key);
const block = (p: SosPlan, key: string) => p.blocks.find((b) => b.key === key);
const group = (p: SosPlan, key: string) => p.self.find((g) => g.key === key);
/** The general signs at the end of the part for oneself. */
const general = (p: SosPlan) => p.self.slice(-GENERAL_SIGNS.length);
const generalUnchanged = (p: SosPlan) => JSON.stringify(general(p)) === JSON.stringify(GENERAL_SIGNS);
/** Only what the rules wrote: titles, background, steps and items. Not the person's own lists. */
const ruleText = (p: SosPlan) =>
  [...p.blocks.flatMap((b) => [b.title, b.why ?? "", ...b.steps]), ...p.self.flatMap((g) => [g.title, ...g.items])].join("\n");
// the Chinese screen has no English: the AED is called 自动体外除颤器（除颤仪）
const AED_USE = "除颤仪拿来了就打开，照它说的做。";

/** Someone with nothing on file, to build the other cases from. */
const blank: Profile = {
  name: "测试",
  gender: "男",
  birthYear: 1980,
  bloodType: null,
  conditions: [],
  allergies: [],
  medications: [],
  surgeries: [],
  familyHistory: [],
  notes: "",
  emergencyContact: null,
  createdAt: ANCHOR.toISOString(),
  updatedAt: ANCHOR.toISOString(),
};
const person = (p: Partial<Profile>): Profile => ({ ...blank, ...p });

/* ---------- 王秀兰: high blood pressure, type 2 diabetes, allergic to sulfonamides ---------- */
{
  const plan = buildSos(WANG);
  check("Wang: who line has her name, gender and age", plan.who.startsWith("王秀兰，女，") && plan.who.endsWith(" 岁"), plan.who);
  check("Wang: collapse steps first, then diabetes, pressure, allergy", keys(plan).join() === "collapse,diabetes,pressure,allergy", keys(plan));
  check("Wang: the collapse block is the shared one", block(plan, "collapse") === COLLAPSE);
  const d = block(plan, "diabetes");
  check("Wang: diabetes block uses her own word", d?.title === "我有糖尿病", d?.title);
  check("Wang: diabetes block says it may be blood sugar that is too low", /可能是血糖太低/.test(d?.why ?? ""), d?.why);
  check("Wang: awake and able to swallow -> give sugar", !!d?.steps.some((s) => /清醒/.test(s) && /能咽/.test(s) && /给我吃糖/.test(s)), d?.steps);
  check(
    "Wang: cannot be woken -> nothing in the mouth, call 120",
    !!d?.steps.some((s) => /叫不醒/.test(s) && /不要往我嘴里放任何东西/.test(s) && /拨打 120/.test(s)),
    d?.steps,
  );
  check("Wang: no insulin from a bystander", !!d?.steps.some((s) => /不要给我打胰岛素/.test(s)), d?.steps);
  const bp = block(plan, "pressure");
  check("Wang: pressure block uses her own word", bp?.title === "我有高血压", bp?.title);
  check("Wang: pressure block sends sudden weakness or slurred speech to 120", !!bp?.steps.some((s) => /嘴歪/.test(s) && /拨打 120/.test(s)), bp?.steps);
  check("Wang: allergy block names what she is allergic to", block(plan, "allergy")?.title === "我对磺胺类药物过敏", block(plan, "allergy")?.title);
  check("Wang: self part is diabetes, pressure, then the general signs", selfKeys(plan).join() === "diabetes,pressure,call,er", selfKeys(plan));
  check("Wang: general signs come last, unchanged", generalUnchanged(plan));
  check("Wang: own diabetes items include the low-sugar line", !!group(plan, "diabetes")?.items.some((x) => /血糖低于/.test(x)));
  check("Wang: own pressure items include the very-high line", !!group(plan, "pressure")?.items.some((x) => /180/.test(x) && /110/.test(x)));
  check("Wang: no heart, epilepsy, breathing or blood-thinner block", !keys(plan).some((k) => ["heart", "epilepsy", "asthma", "thinner"].includes(k)), keys(plan));
  check("Wang: not pregnant", !plan.pregnant && !group(plan, "pregnant"));
  check("Wang: contact is her daughter with a number", plan.contact?.name === "陈静" && plan.contact.relation === "女儿" && plan.contact.phone === "138 0000 0002", plan.contact);
  check("Wang: her two medicines are carried over", plan.medications.length === 2, plan.medications);
}

/* ---------- 李明: chronic gastritis, allergic to penicillin; his father has high blood pressure ---------- */
{
  const plan = buildSos(LI);
  check("Li: the collapse steps and the allergy block only", keys(plan).join() === "collapse,allergy", keys(plan));
  check("Li: no diabetes or pressure items for himself", selfKeys(plan).join() === "call,er", selfKeys(plan));
  check("Li: allergy block names penicillin", block(plan, "allergy")?.title === "我对青霉素过敏");
  check("Li: his father's high blood pressure (family history) is not his", !sosFlags(LI).hypertension);
  check("Li: who line and blood type", plan.who.startsWith("李明，男，") && plan.bloodType === "A 型", [plan.who, plan.bloodType]);
}

/* ---------- nothing on file ---------- */
{
  const plan = buildSos(blank);
  check("nothing on file: only the collapse steps", keys(plan).join() === "collapse", keys(plan));
  check("nothing on file: only the general signs for oneself", JSON.stringify(plan.self) === JSON.stringify(GENERAL_SIGNS));
  check("nothing on file: no contact, not pregnant", plan.contact === null && !plan.pregnant);
  const empty = buildSos(person({ conditions: ["无"], allergies: ["无", "没有过敏"], medications: ["没有"] }));
  check("'无' and '没有过敏' typed into the lists are not things to show", keys(empty).join() === "collapse" && !empty.conditions.length && !empty.allergies.length && !empty.medications.length, empty);
}

/* ---------- each condition brings its own part ---------- */
{
  const cases: Array<[string, Partial<Profile>, string | null, string | null]> = [
    ["冠心病", { conditions: ["冠心病"] }, "heart", "heart"],
    ["房颤", { conditions: ["房颤"] }, "heart", "heart"],
    ["癫痫", { conditions: ["癫痫"] }, "epilepsy", "epilepsy"],
    ["哮喘", { conditions: ["支气管哮喘"] }, "asthma", "asthma"],
    ["慢阻肺", { conditions: ["慢阻肺"] }, "asthma", "asthma"],
    ["阿司匹林", { medications: ["阿司匹林肠溶片 100mg 每日一次"] }, "thinner", null],
    ["华法林", { medications: ["华法林（3mg 每晚）"] }, "thinner", null],
    ["脑梗", { conditions: ["脑梗（2022 年）"] }, "pressure", null],
    ["怀孕（备注）", { notes: "怀孕 20 周" }, null, "pregnant"],
  ];
  for (const [label, p, b, s] of cases) {
    const plan = buildSos(person(p));
    if (b) check(`${label}: bystander block "${b}"`, keys(plan).includes(b), keys(plan));
    if (s) check(`${label}: own group "${s}"`, selfKeys(plan).includes(s), selfKeys(plan));
    check(`${label}: general signs still last`, selfKeys(plan).slice(-2).join() === "call,er", selfKeys(plan));
  }
  const heart = buildSos(person({ conditions: ["冠心病"] }));
  check("heart: titled 我有心脏病 when the person said so", block(heart, "heart")?.title === "我有心脏病" && group(heart, "heart")?.title === "因为我有心脏病");
  check("heart: chest pain -> 120, do not walk to hospital", !!block(heart, "heart")?.steps.some((s) => /拨打 120/.test(s) && /不要让我自己走去医院/.test(s)));
  const fits = buildSos(person({ conditions: ["癫痫"] }));
  check("epilepsy: do not hold down, nothing in the mouth", !!block(fits, "epilepsy")?.steps.some((s) => /不要按住我/.test(s) && /不要往我嘴里塞任何东西/.test(s)));
  check("epilepsy: 5 minutes -> 120", !!block(fits, "epilepsy")?.steps.some((s) => /5 分钟/.test(s) && /拨打 120/.test(s)));
  const breath = buildSos(person({ conditions: ["哮喘"] }));
  check("asthma: sit up, find the inhaler", !!block(breath, "asthma")?.steps.some((s) => /坐直/.test(s)) && !!block(breath, "asthma")?.steps.some((s) => /吸入药/.test(s)));
  const both = buildSos(person({ medications: ["华法林（3mg 每晚）", "阿司匹林肠溶片 100mg 每日一次", "缬沙坦"] }));
  check("blood thinners: named without the dose (the full list is shown on its own)", block(both, "thinner")?.steps[0].startsWith("我在吃华法林、阿司匹林肠溶片。") === true, block(both, "thinner")?.steps);
  check("bloodThinners picks only the thinners", JSON.stringify(bloodThinners(["华法林（3mg）", "缬沙坦", "氯吡格雷"])) === JSON.stringify(["华法林", "氯吡格雷"]));
  const brands = bloodThinners(["拜阿司匹灵 100mg", "波立维 75mg 每日一次", "利伐沙班20mg", "100mg 阿司匹林"]);
  check("bloodThinners: brand names on the box count; a name is never left empty", JSON.stringify(brands) === JSON.stringify(["拜阿司匹灵", "波立维", "利伐沙班", "100mg 阿司匹林"]), brands);
  const stroke = buildSos(person({ conditions: ["脑梗（2022 年）"] }));
  check("stroke without high blood pressure: titled by the stroke", block(stroke, "pressure")?.title === "我以前有过脑血管的病", block(stroke, "pressure")?.title);
  check("stroke without high blood pressure: no blood-pressure numbers for oneself", !group(stroke, "pressure"));
  const pregnant = buildSos(person({ notes: "怀孕 20 周" }));
  check("pregnant: own group says obstetric emergency", !!group(pregnant, "pregnant")?.items.some((x) => /产科急诊/.test(x)));
  const all = buildSos(person({ conditions: ["2 型糖尿病", "高血压", "冠心病", "癫痫", "哮喘"], allergies: ["青霉素"], medications: ["阿司匹林 100mg"], notes: "怀孕 12 周" }));
  check("everything at once: epilepsy, collapse, then the rest in a fixed order", keys(all).join() === "epilepsy,collapse,diabetes,pressure,heart,asthma,allergy,thinner", keys(all));
  check("everything at once: own groups keep their order, general signs last", selfKeys(all).join() === "diabetes,pressure,heart,epilepsy,asthma,pregnant,call,er", selfKeys(all));
}

/* ---------- 1. AED: sent for as soon as 120 is called, used as soon as it arrives ---------- */
{
  const steps = COLLAPSE.steps;
  const fetch = steps.findIndex((s) => /去找自动体外除颤器/.test(s));
  const press = steps.findIndex((s) => /胸外按压/.test(s));
  check(
    "collapse step 2: call 120, say where, and at the same time send someone for the AED",
    steps[1] === "没有反应：马上拨打 120，说清楚在哪里，同时请旁边的人去找自动体外除颤器（除颤仪）。",
    steps[1],
  );
  check("collapse: the AED is sent for before compressions start", fetch === 1 && press === 3, [fetch, press]);
  check("collapse step 4: only about pressing, ending with using the AED", !/去找自动体外除颤器/.test(steps[3]) && /每分钟 100 到 120 次，不要停/.test(steps[3]) && steps[3].endsWith(AED_USE), steps[3]);
  const heart = block(buildSos(person({ conditions: ["冠心病"] })), "heart")?.steps[2] ?? "";
  check("heart step 3: compressions, then use the AED when it comes", /胸外按压/.test(heart) && heart.endsWith(AED_USE), heart);
  check("heart plan: both compression steps say how to use the AED", ruleText(buildSos(person({ conditions: ["冠心病"] }))).match(/除颤仪拿来了就打开，照它说的做/g)?.length === 2);
}

/* ---------- 2. epilepsy: their block leads, and seizures leave the general list ---------- */
{
  const fits = buildSos(person({ conditions: ["癫痫"] }));
  check("epilepsy: their block comes before the collapse steps", keys(fits).join() === "epilepsy,collapse", keys(fits));
  check("epilepsy: the first step starts by noting the time", (block(fits, "epilepsy")?.steps[0] ?? "").startsWith("我抽搐的时候：记下是几点开始抽的。"), block(fits, "epilepsy")?.steps[0]);
  const call = group(fits, "call")?.items ?? [];
  check("epilepsy: the general 120 list says 神志不清、晕倒", call.includes("神志不清、晕倒") && !call.includes("神志不清、晕倒、抽搐"), call);
  check("epilepsy: no general item mentions seizures (their own group does)", !general(fits).some((g) => g.items.some((x) => /抽搐/.test(x))), general(fits));
  const restored = general(fits).map((g) => g.items.map((x) => (x === "神志不清、晕倒" ? "神志不清、晕倒、抽搐" : x)));
  check("epilepsy: that is the only difference from the general list", JSON.stringify(restored) === JSON.stringify(GENERAL_SIGNS.map((g) => g.items)), restored);
  const t = sosToText(fits);
  check("epilepsy: the copied text has their block before the collapse steps", t.indexOf("\n我有癫痫\n") > 0 && t.indexOf("\n我有癫痫\n") < t.indexOf(`\n${COLLAPSE.title}\n`));
  check("epilepsy: the copied text has the shortened general item", t.includes("- 神志不清、晕倒\n") && !t.includes("神志不清、晕倒、抽搐"));
  const others: Array<[string, SosPlan]> = [
    ["王秀兰", buildSos(WANG)],
    ["nothing on file", buildSos(blank)],
    ["heart", buildSos(person({ conditions: ["冠心病"] }))],
  ];
  for (const [label, p] of others) {
    check(`${label}: the collapse steps come first`, keys(p)[0] === "collapse", keys(p));
    check(`${label}: the general 120 list keeps 神志不清、晕倒、抽搐`, !!group(p, "call")?.items.includes("神志不清、晕倒、抽搐"));
  }
  check("the shared list (no profile) still has 抽搐 after an epilepsy plan was built", GENERAL_SIGNS[0].items.includes("神志不清、晕倒、抽搐"));
}

/* ---------- 3. pregnancy goes on the first screen ---------- */
{
  const p = buildSos(person({ notes: "怀孕 20 周" }));
  check("pregnant (note): marked for the first screen", p.pregnant === true);
  const lines = sosToText(p).split("\n");
  check("pregnant: the copied text says 我怀孕了 right under who", lines[1].startsWith("我是：") && lines[2] === "我怀孕了", lines.slice(0, 4));
  check("not pregnant: no such line", !buildSos(WANG).pregnant && !sosToText(buildSos(WANG)).includes("我怀孕了"));
  check("'没有怀孕' in the note: not on the first screen", buildSos(person({ notes: "没有怀孕" })).pregnant === false);
  check("only the note counts: 孕期糖尿病 among the conditions does not", buildSos(person({ conditions: ["孕期糖尿病（2019 年）"] })).pregnant === false);
}

/* ---------- 4. a sudden, very bad headache is a 120 sign ---------- */
{
  const [call, er] = GENERAL_SIGNS;
  check("突然头痛得特别厉害 is under 马上拨打 120", call.key === "call" && call.items.includes("突然头痛得特别厉害"), call.items);
  check("... and no longer under 尽快去急诊", er.key === "er" && !er.items.some((x) => /头痛/.test(x)), er.items);
}

/* ---------- 5. lying on the side; the head is turned only when vomiting ---------- */
{
  const step3 = COLLAPSE.steps[2];
  check("collapse step 3: side position, loosen the collar, stay with me; nothing by mouth", step3.endsWith("有呼吸就让我侧躺，松开领口，守着我；不要喂水、喂药、喂吃的。"), step3);
  check("collapse step 3: no 头偏向一边", !/头偏向一边/.test(step3));
  const all = buildSos(person({ conditions: ["2 型糖尿病", "高血压", "冠心病", "癫痫", "哮喘"] }));
  const bp2 = block(all, "pressure")?.steps[1] ?? "";
  check(
    "pressure step 2: lie down or half lie; turn the head only if I vomit; nothing by mouth",
    bp2 === "等救护车的时候：让我躺下或半躺；如果我吐了，把我的头偏向一边；不要喂水、喂药、喂吃的。",
    bp2,
  );
  const text = ruleText(all);
  check("anywhere: 头偏向一边 only ever follows 如果我吐了", (text.match(/头偏向一边/g) ?? []).length === (text.match(/如果我吐了，把我的头偏向一边/g) ?? []).length);
}

/* ---------- 6. heart operations, and no more ureteral stents ---------- */
{
  const ops = ["心脏支架", "冠脉支架", "冠状动脉支架", "心脏搭桥", "冠脉搭桥", "搭桥手术", "起搏器", "心脏瓣膜", "换瓣", "心脏手术"];
  for (const op of ops) {
    const plan = buildSos(person({ surgeries: [`${op}（2020 年）`] }));
    check(
      `surgery "${op}": the heart block, titled by the operation`,
      block(plan, "heart")?.title === "我的心脏做过手术" && group(plan, "heart")?.title === "因为我的心脏做过手术",
      [block(plan, "heart")?.title, group(plan, "heart")?.title],
    );
  }
  const notHeart: Array<[string, Partial<Profile>]> = [
    ["输尿管支架 among the operations", { surgeries: ["输尿管支架（2021 年）"] }],
    ["输尿管支架 among the conditions", { conditions: ["输尿管支架术后"] }],
    ["胆道支架 among the operations", { surgeries: ["胆道支架"] }],
    ["a bare 支架 among the conditions", { conditions: ["放过两个支架"] }],
    ["a bare 搭桥 in the note", { notes: "做过搭桥" }],
  ];
  for (const [label, p] of notHeart) check(`${label}: no heart block`, !keys(buildSos(person(p))).includes("heart"), keys(buildSos(person(p))));
  const said = buildSos(person({ conditions: ["冠心病"], surgeries: ["心脏支架（2020 年）"] }));
  check("冠心病 said, and a stent: titled 我有心脏病", block(said, "heart")?.title === "我有心脏病", block(said, "heart")?.title);
  const cond = buildSos(person({ conditions: ["心脏支架术后"] }));
  check("a stent written among the conditions: the heart block, titled by the operation", block(cond, "heart")?.title === "我的心脏做过手术", block(cond, "heart")?.title);
  check("a profile saved before surgeries were read still works", sosFlags({ conditions: ["冠心病"], medications: [], notes: "" }).heart);
}

/* ---------- 7. how much sugar ---------- */
{
  const plan = buildSos(person({ conditions: ["2 型糖尿病"] }));
  const give = block(plan, "diabetes")?.steps[0] ?? "";
  const own = group(plan, "diabetes")?.items[0] ?? "";
  check("bystander: 四五块糖，或者半杯果汁、含糖饮料", give.includes("给我吃糖。四五块糖，或者半杯果汁、含糖饮料都行。过 15 分钟没好转，再吃一次。"), give);
  check("oneself: 15 克 with the same example, then 15 分钟", own.includes("马上吃 15 克糖（四五块糖，或者半杯果汁、含糖饮料），15 分钟后再测。"), own);
  check("the old '3 到 4 块糖' is gone", !/3 到 4/.test(ruleText(plan)));
}

/* ---------- 8. the page's own name ---------- */
check("the page title is 应急手册, without the app's suffix", JSON.stringify(metadata.title) === JSON.stringify({ absolute: "应急手册" }), metadata.title);

/* ---------- known only from a medicine: the part appears, titled by the medicine ---------- */
{
  const met = buildSos(person({ medications: ["二甲双胍 0.5g 每日两次"] }));
  check("metformin only: the diabetes block appears", keys(met).includes("diabetes"), keys(met));
  check("metformin only: titled by the medicine, not by a diagnosis never given", block(met, "diabetes")?.title === "我在用降糖药", block(met, "diabetes")?.title);
  check("metformin only: own group too", group(met, "diabetes")?.title === "因为我在用降糖药", group(met, "diabetes")?.title);
  check("insulin only: the diabetes block appears", keys(buildSos(person({ medications: ["胰岛素 早晚各一次"] }))).includes("diabetes"));
  check("an insulin written by its brand counts", block(buildSos(person({ medications: ["诺和锐 早晚餐前 12 单位"] })), "diabetes")?.title === "我在用降糖药");
  const aml = buildSos(person({ medications: ["氨氯地平 5mg 每日一次"] }));
  check("amlodipine only: the pressure block, titled by the medicine", block(aml, "pressure")?.title === "我在吃降压药" && group(aml, "pressure")?.title === "因为我在吃降压药", block(aml, "pressure")?.title);
  check("'血糖高' in their own words is kept as said", block(buildSos(person({ conditions: ["血糖高"] })), "diabetes")?.title === "我血糖高");
}

/* ---------- the free-text note: denials and relatives do not count ---------- */
{
  const notes: Array<[string, "pregnant" | "diabetes" | "hypertension" | "asthma", boolean]> = [
    ["怀孕 20 周", "pregnant", true],
    ["孕 12 周，孕吐厉害", "pregnant", true],
    ["现在怀孕了", "pregnant", true],
    ["没有怀孕", "pregnant", false],
    ["未怀孕", "pregnant", false],
    ["准备怀孕", "pregnant", false],
    ["备孕期间，不抽烟", "pregnant", false],
    ["妈妈有糖尿病", "diabetes", false],
    ["父亲高血压，我自己没有", "hypertension", false],
    ["否认高血压", "hypertension", false],
    ["没有高血压、糖尿病", "diabetes", false],
    ["不吃降压药", "hypertension", false],
    ["哮喘很多年了，最近没犯", "asthma", true],
    ["控制不住的高血压", "hypertension", true],
  ];
  for (const [note, flag, expected] of notes) {
    check(`note "${note}": ${flag} is ${expected}`, sosFlags(person({ notes: note }))[flag] === expected);
  }
  check("a past 孕期糖尿病 among the conditions is not a pregnancy now", !sosFlags(person({ conditions: ["孕期糖尿病（2019 年，产后已好）"] })).pregnant);
  check("a relative named in brackets does not hide the person's own condition", sosFlags(person({ conditions: ["2 型糖尿病（母亲也有）"] })).diabetes);
}

/* ---------- the emergency contact ---------- */
{
  const c = { name: "张强", relation: "儿子", phone: "139 1234 5678" };
  check("contact with a number counts", buildSos(person({ emergencyContact: c })).contact?.phone === "139 1234 5678");
  check("contact without a number does not count", buildSos(person({ emergencyContact: { ...c, phone: "  " } })).contact === null);
  check("no contact on file", buildSos(blank).contact === null);
  check("dialable: digits only", dialable("138 0000 0002") === "13800000002", dialable("138 0000 0002"));
  check("dialable: keeps a leading +", dialable("+86 138-0000-0002") === "+8613800000002", dialable("+86 138-0000-0002"));
  check("dialable: an extension is not run into the number", dialable("+86 139 0000 0004 转 8008") === "+8613900000004", dialable("+86 139 0000 0004 转 8008"));
  check("dialable: a landline with an extension", dialable("010-12345678转123") === "01012345678", dialable("010-12345678转123"));
  check("dialable: only the first of two numbers", dialable("138 0000 0002 / 139 0000 0003") === "13800000002", dialable("138 0000 0002 / 139 0000 0003"));
  check("dialable: a label before the number", dialable("手机：138 0000 0002") === "13800000002", dialable("手机：138 0000 0002"));
}

/* ---------- the numbers agree with the readings page (src/lib/metrics.ts) ---------- */
{
  const plan = buildSos(person({ conditions: ["2 型糖尿病", "高血压"] }));
  const text = ruleText(plan);
  const decimals = [...new Set(text.match(/\d+\.\d+/g) ?? [])].map(Number).sort((a, b) => a - b);
  check("the only decimals are the three blood-sugar lines", JSON.stringify(decimals) === JSON.stringify([3.9, 13.9, 16.7]), decimals);

  const low = Number(/血糖低于 (\d+(?:\.\d+)?)/.exec(text)?.[1]);
  check("low line is metrics' GLUCOSE_LOW (3.9)", low === GLUCOSE_LOW && low === 3.9, low);
  check("metrics: just under the low line is urgent", evaluateMeasurement({ type: "fbg", value: low - 0.1 })?.level === "urgent");
  check("metrics: the low line itself is not urgent", evaluateMeasurement({ type: "fbg", value: low })?.level !== "urgent");

  const veryHigh = Number(/血糖到 (\d+(?:\.\d+)?) 以上/.exec(text)?.[1]);
  check("very-high line is 16.7", veryHigh === 16.7, veryHigh);
  check("metrics: from 16.7 it is 明显偏高", /明显偏高/.test(evaluateMeasurement({ type: "fbg", value: veryHigh })?.text ?? ""));
  check("metrics: just under 16.7 it is not", !/明显偏高/.test(evaluateMeasurement({ type: "fbg", value: veryHigh - 0.1 })?.text ?? ""));

  const high = Number(/都在 (\d+(?:\.\d+)?) 以上/.exec(text)?.[1]);
  check("high line is 13.9", high === 13.9, high);
  check("metrics: from 13.9 it warns", evaluateMeasurement({ type: "fbg", value: high })?.level === "warn");
  check("metrics: just under 13.9 it does not warn", evaluateMeasurement({ type: "fbg", value: high - 0.1 })?.level !== "warn");

  const sys = Number(/高压到 (\d+) 以上/.exec(text)?.[1]);
  const dia = Number(/低压到 (\d+) 以上/.exec(text)?.[1]);
  check("blood-pressure lines are 180 and 110", sys === 180 && dia === 110, [sys, dia]);
  check("metrics: the top number alone at 180 is urgent", evaluateMeasurement({ type: "bp", value: sys, value2: 80 })?.level === "urgent");
  check("metrics: the bottom number alone at 110 is urgent", evaluateMeasurement({ type: "bp", value: 130, value2: dia })?.level === "urgent");
  check("metrics: just under both is not urgent", evaluateMeasurement({ type: "bp", value: sys - 1, value2: dia - 1 })?.level !== "urgent");

  const lowItem = group(plan, "diabetes")?.items.find((x) => /血糖低于/.test(x)) ?? "";
  const lowAdvice = evaluateMeasurement({ type: "fbg", value: 3.2 })?.text ?? "";
  check("same amount of sugar and the same wait as the readings page", /15 克/.test(lowItem) && /15 分钟/.test(lowItem) && /15 克/.test(lowAdvice) && /15 分钟/.test(lowAdvice), [lowItem, lowAdvice]);
  const bpItem = group(plan, "pressure")?.items.find((x) => /180/.test(x)) ?? "";
  const bpAdvice = evaluateMeasurement({ type: "bp", value: 185, value2: 95 })?.text ?? "";
  check("same rest before measuring again as the readings page", /休息 10 分钟/.test(bpItem) && /休息 10 分钟/.test(bpAdvice), [bpItem, bpAdvice]);
}

/* ---------- it says what to do, and does not name what it might be ---------- */
{
  const plan = buildSos(
    person({ conditions: ["2 型糖尿病", "高血压", "冠心病", "癫痫", "哮喘", "脑梗"], allergies: ["青霉素"], medications: ["华法林"], surgeries: ["心脏支架"], notes: "怀孕 12 周" }),
  );
  const steps = [...plan.blocks.flatMap((b) => [b.why ?? "", ...b.steps]), ...plan.self.flatMap((g) => g.items)].join("\n");
  const named = steps.match(/中风|卒中|心梗|心肌梗|脑梗|脑出血|低血糖|高血糖|酮症|酸中毒|休克|心脏骤停|哮喘发作|癫痫发作|过敏反应/g);
  check("no step or item names an illness", !named, named);
  const maybes = [...plan.blocks, ...plan.self.map((g) => ({ key: g.key, why: "", steps: g.items }))]
    .filter((b) => [b.why ?? "", ...b.steps].some((s) => /可能/.test(s)))
    .map((b) => b.key);
  check("'可能' only where the person asked for it: low blood sugar with diabetes", JSON.stringify(maybes) === JSON.stringify(["diabetes"]), maybes);
}

/* ---------- the plain text copied for family ---------- */
{
  const plan = buildSos(WANG);
  const t = sosToText(plan);
  check("text: who", t.includes(`我是：${plan.who}`));
  check("text: conditions", t.includes("我有：高血压（5 年）、2 型糖尿病"));
  check("text: allergy", t.includes("过敏：磺胺类药物"));
  check("text: medicines", t.includes("长期在吃的药：缬沙坦 每日一次、二甲双胍缓释片 1.5g 每日一次"));
  check("text: contact with number", t.includes("紧急联系人：女儿 陈静 138 0000 0002"));
  check("text: every block title and background line", plan.blocks.every((b) => t.includes(`\n${b.title}\n`) && (!b.why || t.includes(b.why))));
  const order = plan.blocks.map((b) => t.indexOf(`\n${b.title}\n`));
  check("text: blocks in the same order as the page", order.every((x, i) => i === 0 || x > order[i - 1]), order);
  const steps = plan.blocks.flatMap((b) => b.steps.map((s, i) => `${i + 1}. ${s}`));
  const missing = steps.filter((s) => !t.includes(s));
  check("text: every numbered step of every block", missing.length === 0, missing);
  check("text: every item for oneself under its title", plan.self.every((g) => t.includes(`${g.title}：`) && g.items.every((x) => t.includes(`- ${x}`))));
  check("text: says where the part for oneself begins", t.includes("下面是给我自己看的"));
  check("text: the 120 line", t.includes(NOT_SURE));
  const li = sosToText(buildSos(LI));
  check("text: blood type in the who line", /^我是：李明，男，\d+ 岁，A 型血$/m.test(li), li.split("\n")[1]);
  check("text: no medicines line when none are on file", !li.includes("长期在吃的药"));
  check("text: no contact line without a contact", !sosToText(buildSos(blank)).includes("紧急联系人"));
  const none = sosToText(null);
  check("text without a profile: no who line", !none.includes("我是："));
  check("text without a profile: no claim about allergies", !none.includes("过敏："));
  check("text without a profile: collapse steps and general signs", COLLAPSE.steps.every((s) => none.includes(s)) && GENERAL_SIGNS.every((g) => g.items.every((x) => none.includes(x))));
}

/* ---------- English: the same handbook, sentence for sentence, with the same numbers ---------- */
{
  /** A plan read out in one language, so the shared blocks cannot change language under the comparison. */
  const snapshot = (p: Profile, lang: "zh" | "en") => {
    setLang(lang);
    const plan = buildSos(p);
    const out = { plan: JSON.parse(JSON.stringify(plan)) as SosPlan, text: sosToText(plan) };
    setLang("zh");
    return out;
  };
  const sentences = (p: SosPlan) => [...p.blocks.flatMap((b) => [b.why ?? "", ...b.steps]), ...p.self.flatMap((g) => [g.title, ...g.items])];
  // "四五块糖" is "4 or 5 sweets": the one place where the English spells a number the Chinese writes in words
  const numbers = (s: string) => (s.replace(/四五块/g, "4 5 块").match(/\d+(?:\.\d+)?/g) ?? []).join(" ");
  /** The English text with the person's own words taken out: what is left must be all English. */
  const withoutOwnWords = (s: string, p: Profile) =>
    [p.name, ...p.conditions, ...p.allergies, ...p.medications, ...bloodThinners(p.medications), p.emergencyContact?.relation ?? "", p.emergencyContact?.name === "家人" ? "" : (p.emergencyContact?.name ?? "")]
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
      .reduce((t, w) => t.split(w).join(""), s);
  const everyone = person({
    gender: "女",
    bloodType: "O",
    conditions: ["2 型糖尿病", "高血压", "冠心病", "癫痫", "哮喘"],
    allergies: ["青霉素"],
    medications: ["华法林（3mg）"],
    surgeries: ["心脏支架（2020 年）"],
    notes: "怀孕 20 周",
    emergencyContact: { name: "家人", relation: "", phone: "139 0000 0005" },
  });
  const cases: Array<[string, Profile]> = [
    ["王秀兰", WANG],
    ["李明", LI],
    ["nothing on file", blank],
    ["every condition", everyone],
    ["stroke only", person({ conditions: ["脑梗"] })],
    ["medicines only", person({ medications: ["二甲双胍", "氨氯地平"] })],
    ["a heart operation only", person({ surgeries: ["起搏器"] })],
    ["血压高 in their own words", person({ conditions: ["血压高"] })],
  ];
  for (const [label, p] of cases) {
    const zh = snapshot(p, "zh");
    const en = snapshot(p, "en");
    check(`en ${label}: the same blocks in the same order`, keys(zh.plan).join() === keys(en.plan).join(), [keys(zh.plan), keys(en.plan)]);
    check(
      `en ${label}: each block has as many steps, and a background line in both or in neither`,
      zh.plan.blocks.every((b, i) => b.steps.length === en.plan.blocks[i].steps.length && !!b.why === !!en.plan.blocks[i].why),
    );
    check(
      `en ${label}: the same groups for oneself, each with as many items`,
      selfKeys(zh.plan).join() === selfKeys(en.plan).join() && zh.plan.self.every((g, i) => g.items.length === en.plan.self[i].items.length),
    );
    const zhNums = sentences(zh.plan).map(numbers);
    const enNums = sentences(en.plan).map(numbers);
    const off = zhNums.map((n, i) => [n, enNums[i]]).filter(([a, b]) => a !== b);
    check(`en ${label}: every sentence carries the same numbers`, off.length === 0, off);
    const left = withoutOwnWords(sentences(en.plan).concat(en.plan.blocks.map((b) => b.title)).join("\n"), p);
    check(`en ${label}: no Chinese in the English apart from the person's own words`, !/[一-鿿]/.test(left), left.match(/.{0,15}[一-鿿]+.{0,15}/g));
    const text = withoutOwnWords(en.text, p);
    check(`en ${label}: the copied text has no Chinese apart from the person's own words`, !/[一-鿿]/.test(text), text.match(/.{0,15}[一-鿿]+.{0,15}/g));
    const lines = en.text.split("\n");
    check(`en ${label}: the copied text has every numbered step`, en.plan.blocks.every((b) => b.steps.every((s, i) => lines.includes(`${i + 1}. ${s}`))));
    check(`en ${label}: and every item for oneself`, en.plan.self.every((g) => lines.includes(`${g.title}:`) && g.items.every((x) => lines.includes(`- ${x}`))));
    check(`en ${label}: no exclamation marks`, !/[!！]/.test(sentences(en.plan).join("") + en.plan.blocks.map((b) => b.title).join("")));
  }

  setLang("en");
  check("en: the collapse steps follow the language", COLLAPSE.title === "If I collapse and you cannot wake me" && COLLAPSE.steps.length === 5, COLLAPSE.title);
  check("en: the AED is named so a stranger knows it", COLLAPSE.steps[1].includes("ask someone nearby to bring an AED (defibrillator)"), COLLAPSE.steps[1]);
  check("en: chest compressions in plain words", COLLAPSE.steps[3].includes("Press hard and fast on the centre of my chest, 100 to 120 times a minute."), COLLAPSE.steps[3]);
  check("en: lay me on my side", COLLAPSE.steps[2].includes("lay me on my side"), COLLAPSE.steps[2]);
  check("en: the general signs follow the language", GENERAL_SIGNS[0].title === "Call 120 now" && GENERAL_SIGNS[1].title === "Go to the emergency room soon");
  check("en: the closing line", notSure() === "If you are not sure, call 120 and ask. The operator will tell you what to do." && NOT_SURE.startsWith("拿不准"));
  const wang = buildSos(WANG);
  check("en: who, in English around the person's own name", /^王秀兰, female, \d+ years old$/.test(wang.who), wang.who);
  check("en: Wang's titles", JSON.stringify(wang.blocks.map((b) => b.title)) === JSON.stringify(["If I collapse and you cannot wake me", "I have diabetes", "I have high blood pressure", "I am allergic to 磺胺类药物"]), wang.blocks.map((b) => b.title));
  const sugarGive = block(wang, "diabetes")?.steps[0] ?? "";
  const sugarOwn = group(wang, "diabetes")?.items[0] ?? "";
  check("en: how much sugar, for a bystander", sugarGive.includes("4 or 5 sweets (candies), or half a glass of juice or a sugary drink") && sugarGive.includes("15 minutes"), sugarGive);
  check("en: how much sugar, for oneself", sugarOwn.includes("15 grams of sugar now, such as 4 or 5 sweets (candies), or half a glass of juice or a sugary drink") && sugarOwn.includes("after 15 minutes"), sugarOwn);
  const sugarText = ruleText(buildSos(person({ conditions: ["2 型糖尿病", "高血压"] })));
  const thresholds = [...sugarText.matchAll(/(\d+\.\d+)( mmol\/L)?/g)].map((m) => [m[1], !!m[2]]);
  check(
    "en: every blood-sugar line names its unit, mmol/L",
    JSON.stringify(thresholds) === JSON.stringify([["3.9", true], ["16.7", true], ["13.9", true]]),
    thresholds,
  );
  check("en: 'sweets (candies)' in both places", (sugarText.match(/4 or 5 sweets \(candies\)/g) ?? []).length === 2);
  check("en: blood pressure keeps plain numbers", sugarText.includes("Top number 180 or higher, or bottom number 110 or higher:") && !/mmHg/i.test(sugarText));
  check("en: nothing in the mouth when I cannot be woken", !!block(wang, "diabetes")?.steps.some((s) => s.includes("do not put anything in my mouth") && s.includes("call 120 now")));
  check("en: own groups say why", JSON.stringify(wang.self.map((g) => g.title)) === JSON.stringify(["Because I have diabetes", "Because I have high blood pressure", "Call 120 now", "Go to the emergency room soon"]), wang.self.map((g) => g.title));
  const allEn = ruleText(buildSos(everyone));
  const calls = [...allEn.matchAll(/(\S+)\s120\b/g)].map((m) => m[1].toLowerCase()).filter((w) => w !== "to");
  check("en: every 120 is something to call (apart from '100 to 120 times')", calls.length > 0 && calls.every((w) => w === "call"), calls);
  const maybes = [...buildSos(everyone).blocks, ...buildSos(everyone).self.map((g) => ({ key: g.key, why: "", steps: g.items }))]
    .filter((b) => [b.why ?? "", ...b.steps].some((s) => /\bmay\b|\bmight\b|could be/i.test(s)))
    .map((b) => b.key);
  check("en: 'may' only where the person asked for it, as in Chinese", JSON.stringify(maybes) === JSON.stringify(["diabetes"]), maybes);
  const named = [...buildSos(everyone).blocks.flatMap((b) => [b.why ?? "", ...b.steps]), ...buildSos(everyone).self.flatMap((g) => g.items)]
    .join("\n")
    .match(/\bstroke\b|heart attack|hypoglyc|hyperglyc|ketoacidosis|\bshock\b|cardiac arrest|anaphyla/gi);
  check("en: no step or item names an illness", !named, named);
  const fits = buildSos(person({ conditions: ["癫痫"] }));
  check("en epilepsy: their block leads", keys(fits).join() === "epilepsy,collapse", keys(fits));
  check("en epilepsy: the general list leaves seizures to their own group", !!group(fits, "call")?.items.includes("Confused or fainting") && !general(fits).some((g) => g.items.some((x) => /seizure/i.test(x))));
  check("en others: the general list keeps seizures", !!group(buildSos(WANG), "call")?.items.includes("Confused, fainting or having a seizure"));
  check("en: the headache is a 120 sign", GENERAL_SIGNS[0].items.includes("A sudden, very bad headache") && !GENERAL_SIGNS[1].items.some((x) => /headache/i.test(x)));
  const pregnantText = sosToText(buildSos(person({ notes: "怀孕 20 周" }))).split("\n");
  check("en: 'I am pregnant' right under who", pregnantText[1].startsWith("I am ") && pregnantText[2] === "I am pregnant", pregnantText.slice(0, 3));
  const liText = sosToText(buildSos(LI));
  check("en: blood type in the who line", /^I am 李明, male, \d+ years old, blood type A$/m.test(liText), liText.split("\n")[1]);
  const fam = sosToText(buildSos(everyone));
  check("en: the form's default contact name '家人' reads 'family'", fam.includes("Emergency contact: family 139 0000 0005"), fam.split("\n").find((l) => l.startsWith("Emergency contact")));
  const meds = buildSos(person({ medications: ["二甲双胍", "氨氯地平"] }));
  check("en: titled by the medicine", block(meds, "diabetes")?.title === "I take diabetes medicine" && block(meds, "pressure")?.title === "I take blood pressure medicine");
  check("en: 'My blood pressure is high' reads well after 'Because'", group(buildSos(person({ conditions: ["血压高"] })), "pressure")?.title === "Because my blood pressure is high");
  check("en: a heart operation only", block(buildSos(person({ surgeries: ["起搏器"] })), "heart")?.title === "I have had heart surgery");
  const none = sosToText(null);
  check("en without a profile: no who line, no claim about allergies", !none.split("\n").some((l) => l.startsWith("I am ")) && !none.includes("Allergies:") && none.startsWith("[Yiban · Emergency guide]"));
  check("en without a profile: the collapse steps and general signs, in English", COLLAPSE.steps.every((s) => none.includes(s)) && GENERAL_SIGNS.every((g) => g.items.every((x) => none.includes(x))) && !/[一-鿿]/.test(none));
  setLang("zh");
  const zhSugar = ruleText(buildSos(person({ conditions: ["2 型糖尿病", "高血压"] })));
  check("back in Chinese: no unit and no 'candies' added to the Chinese", !/mmol|candies/i.test(zhSugar) && zhSugar.includes("血糖低于 3.9：") && zhSugar.includes("四五块糖，或者半杯果汁、含糖饮料"));
  check("back in Chinese: the shared blocks are Chinese again", COLLAPSE.title === "如果我晕倒了、叫不醒" && GENERAL_SIGNS[0].title === "马上拨打 120" && notSure() === NOT_SURE);
}

finish("sos");
