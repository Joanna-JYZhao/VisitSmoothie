/* post: a visit linked to a pre record is one record with it; what was asked and explained is kept. Run with: npx tsx scripts/tests/post-link.test.ts */
import { check, finish } from "./_check";
import type { AfterResult, PostDraft } from "../../src/lib/types";
import { getState, storeActions } from "../../src/lib/store";
import { saveAfter } from "../../src/lib/after";
import { learnedOf, newPostDraft } from "../../src/components/post/ClinicalPlan";
import { allRecords, courseDays, nextVisitFrom, planFrom, planStatus, previousContext } from "../../src/lib/records";

const result: AfterResult = {
  date: "2026-10-04",
  hospital: null,
  department: "骨科",
  diagnosis: "膝骨关节炎",
  findings: [],
  procedures: [],
  medications: [{ name: "塞来昔布胶囊", usage: "每日一次，饭后", longTerm: false }],
  advice: "每天做直腿抬高锻炼",
  followUpDays: 14,
  followUpNote: "两周后复查",
  readings: [],
  summary: "",
  unclear: [],
};

// a pre record, then the visit linked to it, with two lines asked about (one with a follow-up question)
const pre = storeActions.createEpisode({ text: "左膝内侧酸痛" });
const draft: PostDraft = newPostDraft(result, "glm", "", pre.id);
const med = draft.todos.find((t) => t.kind === "medicine")!;
const care = draft.todos.find((t) => t.kind === "care")!;
draft.turns = {
  [med.id]: [
    { q: "塞来昔布是干什么的", a: "消炎止痛。" },
    { q: "漏吃了怎么办", a: "想起来就补，快到下一次就跳过。" },
  ],
  [care.id]: [{ q: "为什么要锻炼", a: "练大腿肌肉，减轻膝盖负担。" }],
};
const learned = learnedOf(draft);
check("what was asked is one item per line asked about", learned.length === 2 && learned[0].about.startsWith("塞来昔布胶囊") && learned[1].about === "每天做直腿抬高锻炼", learned);
check("a follow-up question is kept with its line", learned[0].text.includes("消炎止痛") && learned[0].text.includes("问：漏吃了怎么办") && learned[0].text.includes("答：想起来就补"), learned[0].text);

const before = { episodes: getState().episodes.length, followUps: getState().followUps.length };
saveAfter(result, pre.id, "glm", "", learned);
const after = getState();
const linked = after.episodes.find((e) => e.id === pre.id);
check("linked: no second record", after.episodes.length === before.episodes && after.followUps.length === before.followUps, [after.episodes.length, after.followUps.length]);
check("linked: the visit is in the pre record", linked?.visit?.diagnosis === "膝骨关节炎", linked?.visit);
check("linked: what was learned is in the same record", linked?.visit?.learned?.length === 2 && linked.visit.learned[1].text.includes("减轻膝盖负担"), linked?.visit?.learned);

// not linked, nothing asked: a visit record of its own, with nothing learned on it
saveAfter(result, null, "glm", "");
const alone = getState().followUps.at(-1);
check("not linked: a record of its own", getState().followUps.length === before.followUps + 1 && alone?.learned === undefined, alone);

/* 存进 Record 的治疗计划：每条的状态、下次复诊、复诊关联、给 AI 的上一次记录 */
const DAYMS = 86_400_000;
check("疗程：吃两周是 14 天", courseDays("塞来昔布胶囊（每日一次，饭后，吃两周）") === 14);
check("疗程：连用7天", courseDays("连用7天") === 7);
check("一日三次不是疗程", courseDays("布洛芬（一日三次）") === null && courseDays("每天热敷") === null);
check("course in English", courseDays("Celecoxib (once a day, for 2 weeks)") === 14);
const day0 = new Date(Date.now() - 20 * DAYMS).toISOString();
const followAt = new Date(Date.now() + 5 * DAYMS).toISOString();
const items = planFrom(
  [
    { id: "t1", kind: "medicine", text: "塞来昔布胶囊（每日一次，吃两周）", remind: true, frequency: "each" },
    { id: "t2", kind: "care", text: "每天做直腿抬高锻炼", remind: false, frequency: "daily" },
    { id: "t3", kind: "followup", text: "复诊：一个月后复查", remind: true, frequency: "once", at: followAt },
  ],
  day0,
  followAt,
);
check("两周的药 20 天后已结束 6 天", planStatus(items[0]).label === "已结束 6 天" && !planStatus(items[0]).ongoing, planStatus(items[0]));
check("没写疗程的锻炼一直进行到复诊", planStatus(items[1]).ongoing && planStatus(items[1]).label.startsWith("正在进行 · 第 21 天"), planStatus(items[1]));
check("复诊那一条说还有几天", planStatus(items[2]).ongoing && planStatus(items[2]).label.startsWith("还有 5 天"), planStatus(items[2]));
check("手动结束", !planStatus({ ...items[1], endedAt: new Date().toISOString() }).ongoing);
const nv = nextVisitFrom({ followUpNote: "一个月后复查", advice: null, adviceItems: ["复查时携带病历和正在吃的药", "少吃辛辣"] }, [], followAt);
check("下次复诊：要带的东西挑出来", nv?.note === "一个月后复查" && nv.prepare.join("|") === "复查时携带病历和正在吃的药", nv);

// 复诊：只用 post，关联上一次的记录 → 新的一条，标注是它的复诊，计划和下次复诊存在上面
saveAfter(result, null, "glm", "", [], { planItems: items, next: nv, followUpOf: pre.id });
const fu = getState().followUps.at(-1);
check("复诊是新的一条，标注关联", fu?.followUpOf === pre.id && fu.planItems?.length === 3 && fu.next?.note === "一个月后复查", fu);
const refs = allRecords(getState());
check("Record 里能看到它是谁的复诊", refs.find((r) => r.id === fu!.id)?.followUpOf === pre.id && refs.find((r) => r.id === pre.id)?.hasVisit === true);
storeActions.endPlanItem(fu!.id, fu!.planItems![1].id);
check("手动结束存下来了", getState().followUps.at(-1)?.planItems?.[1].endedAt != null);
const ctx = previousContext(getState(), pre.id) ?? "";
check("给 AI 的上一次记录：诊断、问过的问题", ctx.includes("膝骨关节炎") && ctx.includes("上次问过、已经讲过的") && ctx.includes("塞来昔布"), ctx);

finish("post-link");
