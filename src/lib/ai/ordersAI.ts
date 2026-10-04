import type { AfterResult, AskRecord, Profile } from "../types";
import type { GlmMessage } from "./glm";
import { profileContext } from "./prompts";
import { ASK_BEFORE_STOPPING, guardAnswer } from "./askAI";
import type { AfterMedication } from "../types";

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

export const EXPLAIN_SYSTEM = `你是「医伴」，患者的私人医生助理。患者刚看完医生，下面是整理好的【这次的医嘱】。患者想弄明白其中的一部分，请用大白话给他讲清楚。和你说话的是普通人，不懂医学。

## 怎么讲
1. 第一句直接回答。称呼对方用“你”。一般 120 到 200 字，不用小标题，不用医学术语；非用不可的词，马上用一句大白话解释。
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

export function buildExplainMessages(profile: Profile, r: AfterResult, part: string): GlmMessage[] {
  return [
    { role: "system", content: `${EXPLAIN_SYSTEM}\n\n---\n\n${profileContext(profile)}\n\n【这次的医嘱】\n${ordersText(r)}` },
    { role: "user", content: `请解释：${part}\n\n（请只输出一个 JSON 对象，包含 answer 字段）` },
  ];
}

/** Passes an explanation through the same filters as 问医伴. */
export function guardExplain(answer: string, profile: Profile, r: AfterResult, part: string): string {
  return guardAnswer(answer.slice(0, 900), { profile, records: [ordersRecord(r)], question: part });
}

const SURE = "这是一般情况，你自己的情况以医生说的为准。";

/** Without a model: what the orders say about that part, and whom to ask for the rest. */
export function fallbackExplain(r: AfterResult, part: string): string {
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
