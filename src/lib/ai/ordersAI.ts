import type { AfterResult, AskRecord, Profile } from "../types";
import type { GlmMessage } from "./glm";
import { previousBlock, profileContext } from "./prompts";
import { ASK_BEFORE_STOPPING, guardAnswer } from "./askAI";
import type { AfterMedication } from "../types";
import { getLang } from "../lang";

// the same wording as after.ts (which reads the store and so is not imported on the server)
const medicationLine = (m: AfterMedication) => {
  const usage = m.usage.replace(/[（(]/g, "，").replace(/[）)]/g, "").replace(/[。.]$/, "");
  return usage ? `${m.name}（${usage}）` : m.name;
};
const treatmentText = (r: Pick<AfterResult, "medications" | "procedures">) => [...r.procedures, ...r.medications.map(medicationLine)].join("；") || "没有开药";

/*
 * 医嘱 b: explaining one part of the doctor's orders in plain words. The model explains; the
 * same filters as 问医伴 (guardAnswer) take out guesses at illnesses, new doses and advice to change medicines.
 */

export const EXPLAIN_SYSTEM = `你是「问诊奶昔」，患者的私人医生助理。患者刚看完医生，下面是整理好的【这次的医嘱】。患者想弄明白其中的一部分，请给他讲清楚。讲得多深、用不用医学名词，按资料最后的【讲解方式】来。

## 怎么讲
1. 第一句直接回答。称呼对方用“你”。不用小标题。长短和用词照【讲解方式】。
2. 讲诊断：说这个词一般指什么，平时要留意什么。只讲医生写的这个诊断，不猜还有别的病，不猜是什么原因引起的，不评价轻重。
3. 讲药：按药品说明书上的一般内容讲它是干什么用的、在这次的病里一般起什么作用，再讲为什么要按医嘱写的这样吃（比如为什么饭后吃、为什么一天几次、为什么要吃满疗程），最后提一句常见的不舒服。说明书上的内容用“说明书上一般会写”开头。一次吃多少、一天几次，只能照抄医嘱里写的，医嘱里没有就让他看药盒或问医生、药师，不要自己给数字。
4. 讲副作用：只讲说明书上常见的、和出现了要怎么办：写“先联系医生或药师，问要不要调整”，严重的马上就医；不要写“停下来”“停药”“先别吃了”这类话（会被当成自己停药）。不吓人。
5. 讲注意事项和其他治疗（如锻炼、热敷、少吃辛辣）：结合这次的诊断讲为什么这个病一般需要这样做、不做会怎样、日常怎么做到；医嘱里没写的具体次数和时长不要自己补。没有写诊断时，就按医嘱本身讲一般的道理。
5b. 讲复诊：为什么一般要回去复诊，去之前准备什么（病历、在吃的药、这段时间的变化）。
5c. 只讲患者问的这一条：问的是某个药就只讲这个药，问的是某条叮嘱就只讲这条，不要顺带讲别的药、别的叮嘱或复诊。
6. 不评价医生的方案（不说“开得对”“没必要”），不建议加药、减药、停药、换药，不建议做检查。
7. 最后一句说明：这是一般情况，你自己的情况以医生说的为准。

## 输出
严格输出一个 JSON 对象，不要输出其他内容：
{ "answer": "对患者说的话" }`;

/**
 * How the explanation is pitched, from the patient's education and age (学历 is asked at sign-up for
 * this alone and never shown to a doctor). Up to 高中/中专: plain words and everyday comparisons. 大专:
 * plain, with the proper name of a thing said once and explained. 本科及以上: the medical terms and how
 * it works (the mechanism, why it helps this illness), more like a doctor would explain to a colleague's
 * family. Seventy and over: short sentences, the one thing to remember said again at the end.
 */
export function explainStyle(profile: Pick<Profile, "education" | "birthYear">): string {
  const edu = profile.education ?? "";
  const age = profile.birthYear ? Math.max(0, new Date().getFullYear() - profile.birthYear) : null;
  const L: string[] = ["【讲解方式】"];
  if (/本科|硕士|博士|研究生/.test(edu)) {
    L.push(
      `对方学历：${edu}。可以讲得学术一些：用准确的医学名词（第一次出现时括号里用一句话解释），讲清楚机制，比如这个药通过什么起作用、这个病为什么需要这样锻炼或这样注意。条理清楚，可以分两三层讲。150 到 280 字。`,
    );
  } else if (/大专/.test(edu)) {
    L.push(`对方学历：${edu}。用平实的话讲，关键的医学名词可以说一次，马上用大白话解释；道理讲到为什么就够，不讲太深的机制。120 到 220 字。`);
  } else if (edu) {
    L.push(`对方学历：${edu}。讲得通俗易懂：不用医学名词，用生活里的比方（比如“关节像门轴，肌肉像门边的弹簧”），一句话只说一件事。100 到 180 字。`);
  } else {
    L.push("不知道对方学历：用大白话讲，不用医学名词；非用不可的词，马上用一句大白话解释。120 到 200 字。");
  }
  if (age != null && age >= 70) L.push(`对方 ${age} 岁：句子短一些，一次不要讲太多，最要紧的那一点在结尾再说一遍。`);
  else if (age != null && age < 18) L.push(`对方 ${age} 岁，是未成年人：用他能听懂的话讲，提醒他和家长一起按医生说的做。`);
  if (getLang() === "en") {
    // the lengths above are in Chinese characters: in English they are counted in words
    L.push("（用英文回答时，上面的字数换算成英文单词：100–180 字约 70–130 词，120–220 字约 90–160 词，150–280 字约 110–200 词。）");
  } else {
    L.push("（用中文回答，回答里不要夹英文单词；药名照医嘱里写的。）");
  }
  return L.join("\n");
}

/** The orders as text, for the prompt and for the filters (doses may be repeated only when they are in here). */
export function ordersText(r: AfterResult): string {
  return [
    r.date || r.hospital || r.department ? `看病：${[r.date, r.hospital, r.department].filter(Boolean).join(" ")}` : "",
    r.diagnosis ? `诊断：${r.diagnosis}` : "诊断：没有写",
    r.findings.length ? `检查结果：${r.findings.join("、")}` : "",
    r.medications.length ? `开的药：${r.medications.map(medicationLine).join("；")}` : "没有开药",
    r.procedures.length ? `其他处理：${r.procedures.join("；")}` : "",
    r.advice ? `医生叮嘱：${r.advice}` : "",
    r.followUpNote ? `复诊：${r.followUpNote}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** The orders as one visit record, so guardAnswer knows which medicines and doses are on file. */
export function ordersRecord(r: AfterResult): AskRecord {
  return {
    id: "R1",
    kind: "visit",
    label: "这次看医生",
    href: "/",
    date: r.date ? `${r.date}T12:00:00` : new Date().toISOString(),
    fields: { diagnosis: r.diagnosis ?? undefined, treatment: treatmentText(r), advice: r.advice ?? undefined, followUp: r.followUpNote ?? undefined },
    text: ordersText(r).replace(/\n/g, "；"),
  };
}

/** A question asked about one line, and what was answered: earlier turns about the same line. */
export interface ExplainTurn {
  q: string;
  a: string;
}

/**
 * `history`: what was already asked and answered about this same line. The new `part` is then a
 * follow-up ("漏吃了一次怎么办"), answered about that line and without repeating what was said.
 */
export function buildExplainMessages(profile: Profile, r: AfterResult, part: string, history: ExplainTurn[] = [], previous?: string): GlmMessage[] {
  const earlier = history.flatMap((t, i) => [
    { role: "user" as const, content: i === 0 ? `请解释：${t.q}` : t.q },
    { role: "assistant" as const, content: JSON.stringify({ answer: t.a }) },
  ]);
  const ask = history.length
    ? `接着问上面这一条：${part}\n（只回答这个问题，前面讲过的不要重复；还是只讲这一条。）`
    : `请解释：${part}`;
  return [
    {
      role: "system",
      // 复诊: the earlier visit is part of the context, so the explanation says what is new or changed instead of repeating it
      content: `${EXPLAIN_SYSTEM}\n\n---\n\n${profileContext(profile)}\n\n【这次的医嘱】\n${ordersText(r)}${previous ? `\n\n${previousBlock(previous)}\n（讲的时候结合上一次：药或做法跟上次一样的就说“和上次一样，继续”，变了的说清楚变在哪；上次已经讲过的不再展开。）` : ""}\n\n${explainStyle(profile)}`,
    },
    ...earlier,
    { role: "user", content: `${ask}\n\n（请只输出一个 JSON 对象，包含 answer 字段）` },
  ];
}

/** Passes an explanation through the same filters as 问医伴. */
export function guardExplain(answer: string, profile: Profile, r: AfterResult, part: string): string {
  const en = getLang() === "en";
  // English takes about twice the characters for the same explanation
  let text = answer.slice(0, en ? 2000 : 900);
  // a Chinese explanation has no English in it: a stray word ("动作宜平稳 controlled") is taken out,
  // unless it is in the orders themselves (a medicine written in English, a unit)
  if (!en) {
    const orders = ordersText(r).toLowerCase();
    text = text.replace(/\s*\b[A-Za-z][A-Za-z-]{2,}\b\s*/g, (w) => (orders.includes(w.trim().toLowerCase()) ? w : ""));
  }
  return guardAnswer(text, { profile, records: [ordersRecord(r)], question: part });
}

const SURE = "这是一般情况，你自己的情况以医生说的为准。";

const SURE_EN = "This is the general picture; for your own case, what your doctor says comes first.";

/** Without a model, in English: what the orders say about that part, and whom to ask for the rest. */
function fallbackExplainEn(r: AfterResult, part: string): string {
  const med = r.medications.find((m) => part.includes(m.name));
  if (med) {
    return `The doctor prescribed ${med.name}${med.usage ? ` (${med.usage})` : ""}. What it is for, its common side effects and what to watch out for are all in the leaflet in the box; anything unclear, your doctor or pharmacist can explain best. ${SURE_EN}`;
  }
  const quoted = part.match(/“([^”]+)”/)?.[1];
  if (quoted && /follow-up/i.test(part)) return `The doctor's follow-up: ${quoted}. It lets the doctor check whether the treatment is working. Bring your records and the medicines you take, and think about what got better, what didn't, and any side effects.`;
  if (quoted && /^The doctor/i.test(part)) return `The doctor wrote “${quoted}”. Why ${r.diagnosis ? `“${r.diagnosis}”` : "this illness"} needs this, and exactly how and for how long, you can ask the hospital or the doctor at the follow-up; don't add amounts or times the doctor didn't give. ${SURE_EN}`;
  if (/diagnosis/i.test(part) && r.diagnosis) return `The doctor's diagnosis is “${r.diagnosis}”. What it means for you, ask the doctor to explain in plain words next time. ${SURE_EN}`;
  if (/test results/i.test(part) && r.findings.length) return `The test results: ${r.findings.join(", ")}. What they mean for you is for the doctor to explain; ask at the next visit.`;
  return "I can't explain this part right now. Please ask your doctor or pharmacist.";
}

/** Without a model: what the orders say about that part, and whom to ask for the rest. */
export function fallbackExplain(r: AfterResult, part: string): string {
  if (getLang() === "en") return fallbackExplainEn(r, part);
  const med = r.medications.find((m) => part.includes(m.name));
  if (med) {
    return `医生开的是${medicationLine(med)}。这个药是干什么用的、常见的不舒服和注意事项，药盒里的说明书上都有，可以对照着看；看不明白的，问医生或药师最清楚。${SURE}`;
  }
  // one line of the Clinical Plan: 医生让我「每天做直腿抬高锻炼」…
  const quoted = part.match(/「([^」]+)」/)?.[1];
  if (quoted && /^医生(让我|叮嘱)/.test(part)) {
    return `医生写的是「${quoted}」。为什么${r.diagnosis ? `「${r.diagnosis}」` : "这次的病"}需要这样做、具体怎么做、做多久，可以打电话问医院，或者复诊时请医生讲讲；医生没写的次数和时长不要自己加。${SURE}`;
  }
  if (quoted && /复诊/.test(part)) return `医生说的复诊：${quoted}。复诊是让医生看看治疗有没有效果、要不要调整。去的时候带上病历和在吃的药，想想这段时间哪里好了、哪里还不舒服、吃药后有没有不舒服，跟医生说清楚。`;
  if (/诊断/.test(part) && r.diagnosis) return `医生写的诊断是「${r.diagnosis}」。这个词具体是什么意思、你的情况怎么样，下次见医生时可以请他用大白话讲一下。${SURE}`;
  if (/副作用/.test(part)) return `这次开的药：${r.medications.map(medicationLine).join("；")}。每种药常见的不舒服，药盒里说明书的「不良反应」一栏都写着。${ASK_BEFORE_STOPPING}`;
  if (/注意/.test(part) && r.advice) return `医生叮嘱的是：${r.advice}。照着做能帮你好得更快、少出问题。为什么要这样做，复诊时可以请医生具体讲讲。${SURE}`;
  if (/治疗/.test(part)) return `医嘱里写的是：${[...r.procedures, r.advice].filter(Boolean).join("；") || "没有写别的治疗"}。具体怎么做、做多久，以医生说的为准；拿不准的地方可以打电话问一下医院。`;
  if (/复诊/.test(part)) return `医生说的复诊：${r.followUpNote ?? "到时候回医院复查"}。去的时候带上病历、在吃的药，想想这段时间哪里好了、哪里还不舒服、吃药后有没有不舒服，跟医生说清楚。`;
  if (/检查/.test(part) && r.findings.length) return `检查结果是：${r.findings.join("、")}。这些结果对你意味着什么，要医生来讲；下次见医生时可以请他解释一下。`;
  return `医嘱里和这个有关的内容，我现在讲不清楚。可以直接问医生或药师。`;
}
