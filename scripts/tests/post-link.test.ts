/* post: a visit linked to a pre record is one record with it; what was asked and explained is kept. Run with: npx tsx scripts/tests/post-link.test.ts */
import { check, finish } from "./_check";
import type { AfterResult, PostDraft } from "../../src/lib/types";
import { getState, storeActions } from "../../src/lib/store";
import { saveAfter } from "../../src/lib/after";
import { learnedOf, newPostDraft } from "../../src/components/post/ClinicalPlan";

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

finish("post-link");
