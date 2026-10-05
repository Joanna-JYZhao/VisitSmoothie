/* 离开时问保存还是放弃: which cards are still unsaved. Run with: npx tsx scripts/tests/drafts.test.ts */
import { check, finish } from "./_check";
import type { AfterResult, Episode, ThreadItem } from "../../src/lib/types";
import { draftPrompt, isDraftPrompt, unsavedCards } from "../../src/lib/drafts";

const at = new Date(2026, 9, 3, 9, 0, 0).toISOString();
const ep = (id: string, title: string) => ({ id, title }) as Episode;
const result: AfterResult = {
  date: null, hospital: null, department: null, diagnosis: "急性胃炎", findings: [], procedures: [], medications: [],
  advice: null, followUpDays: null, followUpNote: null, readings: [], summary: "", unclear: [],
};
const desc = (id: string, episodeId: string, state: "draft" | "saved" | "discarded"): ThreadItem => ({ id, at, kind: "description", episodeId, state });
const orders = (id: string, state: "draft" | "saved" | "discarded"): ThreadItem => ({ id, at, kind: "orders", result, mode: "glm", episodeId: null, state });
const episodes = [ep("e1", "肚子痛"), ep("e2", "头痛")];

check("nothing unsaved in an empty conversation", unsavedCards([], episodes).length === 0);
check("a draft description is unsaved", unsavedCards([desc("d1", "e1", "draft")], episodes).map((x) => x.id).join() === "d1");
check("saved and discarded ones are not", unsavedCards([desc("d1", "e1", "saved"), desc("d2", "e2", "discarded"), orders("o1", "saved")], episodes).length === 0);
check("a draft whose complaint was deleted is not", unsavedCards([desc("d1", "e9", "draft")], episodes).length === 0);
check("only the newest card of one complaint counts", unsavedCards([desc("d1", "e1", "draft"), desc("d2", "e1", "saved")], episodes).length === 0);
check("draft orders are unsaved", unsavedCards([orders("o1", "draft")], episodes).map((x) => x.id).join() === "o1");

const [d] = unsavedCards([desc("d1", "e1", "draft")], episodes);
check("the question names the complaint", draftPrompt(d, episodes) === "上次的「肚子痛的病情描述」还没保存，要保存、放弃，还是接着改？", draftPrompt(d, episodes));
const [o] = unsavedCards([orders("o1", "draft")], episodes);
check("the question names the orders by their diagnosis", draftPrompt(o, episodes) === "上次的「急性胃炎的医嘱」还没保存，要保存、放弃，还是接着改？", draftPrompt(o, episodes));
const prompt: ThreadItem = { id: "a1", at, kind: "ai", text: draftPrompt(d, episodes), chips: ["保存", "放弃", "接着改"] };
check("the question is recognised with its three answers", isDraftPrompt(prompt));
check("another question is not", !isDraftPrompt({ ...prompt, text: "「肚子痛」今天怎么样了？", chips: ["好多了", "差不多", "更严重了"] }));
check("nor the same words without the answers", !isDraftPrompt({ ...prompt, chips: undefined }));

finish("drafts");
