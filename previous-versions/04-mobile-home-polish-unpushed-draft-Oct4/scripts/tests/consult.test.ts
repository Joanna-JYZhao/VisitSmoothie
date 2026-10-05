/* 问诊的「脑子」：八类追问、上限、口语确认、关联、身体图。Run with: npx tsx scripts/tests/consult.test.ts */
import { check, finish } from "./_check";
import type { ChatRequest, ChatResponse, Profile, RelatedEpisodeContext } from "../../src/lib/types";
import { COLLOQUIAL, confirmQuestion, findColloquial } from "../../src/lib/colloquial";
import { MAX_QUESTIONS, consultPlan, fallbackChat, fallbackSummary, linksFor } from "../../src/lib/ai/fallback";
import type { Episode } from "../../src/lib/types";
import { normalizeChat, salvageChat, withoutTestAdvice } from "../../src/lib/ai/normalize";
import { guardAnswer, stopsOnOwn } from "../../src/lib/ai/askAI";
import { fallbackExplain } from "../../src/lib/ai/ordersAI";

const profile = (conditions: string[] = []): Profile => ({
  name: "测试",
  gender: "男",
  birthYear: 1970,
  conditions,
  allergies: [],
  medications: [],
  surgeries: [],
  familyHistory: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});
const now = new Date().toISOString();
const req = (messages: ChatRequest["messages"], opts: { title?: string; conditions?: string[]; related?: RelatedEpisodeContext[] } = {}): ChatRequest => ({
  kind: messages.filter((m) => m.role === "user").length <= 1 ? "intake" : "followup",
  profile: profile(opts.conditions),
  episode: { title: opts.title ?? "不舒服", tags: [], status: "active", startedAt: now, createdAt: now, entries: [] },
  related: opts.related ?? [],
  messages,
});

/** 规则引擎自己问到底：每次点第一个可点的回答，身体图就点「右膝内侧」。 */
function runByRule(first: string, opts: Parameters<typeof req>[1] = {}, answer?: (r: ChatResponse) => string) {
  const messages: ChatRequest["messages"] = [{ role: "user", content: first }];
  const replies: ChatResponse[] = [];
  for (let i = 0; i < 12; i++) {
    const r = fallbackChat(req(messages, opts));
    replies.push(r);
    messages.push({ role: "assistant", content: r.reply });
    if (r.done) break;
    messages.push({ role: "user", content: answer?.(r) ?? (r.widget === "bodymap" ? "部位：右膝内侧" : (r.suggestedReplies[0] ?? "不清楚")) });
  }
  return { replies, messages, questions: replies.filter((r) => /[?？]/.test(r.reply)).length };
}

/* 口语对照 */
check("the table has at least 25 everyday words", COLLOQUIAL.length >= 25, COLLOQUIAL.length);
check("拧着疼 is 绞痛", findColloquial("肚子拧着疼，一阵一阵的")[0]?.term === "绞痛");
check("林叔: 扭着疼 is kept as he said it, not turned into 绞痛", findColloquial("上楼时像扭着疼").every((c) => c.term !== "绞痛"));
check("一跳一跳 / 火辣辣 / 像针扎 / 拉稀 / 心里发慌", ["一跳一跳地疼", "胃里火辣辣的", "像针扎一样", "拉稀三次", "心里发慌"].map((t) => findColloquial(t)[0]?.term).join() === "搏动性疼痛,烧灼感,刺痛,腹泻,心悸");
check("a negated everyday word does not count", findColloquial("不是针扎那种").length === 0 || findColloquial("没有拉稀").length === 0);
check("the confirmation names the doctor's word", confirmQuestion(findColloquial("拧着疼")[0]) === "是一阵一阵拧着的那种疼吗？医生管这个叫『绞痛』。");

/* 口语确认：下一轮先确认，「是」写成「绞痛（患者原话：拧着疼）」 */
const belly1 = fallbackChat(req([{ role: "user", content: "肚子拧着疼" }], { title: "肚子痛" }));
check("an everyday word is confirmed first", belly1.reply.includes("『绞痛』") && belly1.suggestedReplies.join() === "是,不是", belly1);
const belly2 = fallbackChat(req([{ role: "user", content: "肚子拧着疼" }, { role: "assistant", content: belly1.reply }, { role: "user", content: "是" }], { title: "肚子痛" }));
check("yes is written as 绞痛（患者原话：拧着疼）", belly2.entry?.note === "绞痛（患者原话：拧着疼）", belly2.entry);
check("after the confirmation the next thing is asked, not the same again", !belly2.reply.includes("『绞痛』") && /[?？]/.test(belly2.reply), belly2.reply);
const modelSkips = normalizeChat({ reply: "记下了。什么时候开始的？", done: false, suggestedReplies: ["今天"] }, req([{ role: "user", content: "肚子拧着疼" }], { title: "肚子痛" }));
check("the model is made to confirm when it skips it", modelSkips.reply.includes("『绞痛』") && modelSkips.suggestedReplies.join() === "是,不是", modelSkips);
const modelConfirms = normalizeChat({ reply: "是一阵一阵拧着疼吗？医生叫它『绞痛』。", done: false }, req([{ role: "user", content: "肚子拧着疼" }], { title: "肚子痛" }));
check("the model's own confirmation is kept, with 是 / 不是", modelConfirms.reply.startsWith("是一阵一阵拧着疼吗") && modelConfirms.suggestedReplies.join() === "是,不是", modelConfirms);
const yes = normalizeChat({ reply: "好的。什么时候开始的？", entry: { note: "患者确认绞痛" } }, req([{ role: "user", content: "肚子拧着疼" }, { role: "assistant", content: belly1.reply }, { role: "user", content: "是的" }], { title: "肚子痛" }));
check("the model's version also writes the doctor's word with the patient's", yes.entry?.note === "绞痛（患者原话：拧着疼）", yes.entry);

/* 身体图 */
const knee = fallbackChat(req([{ role: "user", content: "膝盖疼，三天了，比较难受，没吃药" }], { title: "膝盖疼" }));
check("knee pain without a precise place asks with the body map", knee.widget === "bodymap" && /哪个位置/.test(knee.reply), knee);
const kneeKnown = fallbackChat(req([{ role: "user", content: "右膝内侧疼，三天了，比较难受，没吃药" }], { title: "膝盖疼" }));
check("a precise place needs no body map", kneeKnown.widget !== "bodymap", kneeKnown);
const cough = fallbackChat(req([{ role: "user", content: "咳嗽发烧，昨天开始的，比较难受，没吃药" }], { title: "咳嗽" }));
check("no body map for a cough", cough.widget !== "bodymap", cough);
const head = fallbackChat(req([{ role: "user", content: "头痛，今天上午开始的，比较难受，没吃药" }], { title: "头痛" }));
check("a headache asks where with options, not the body map", head.widget !== "bodymap" && head.suggestedReplies.includes("太阳穴"), head);
const picked = fallbackChat(req([{ role: "user", content: "膝盖疼，三天了，比较难受，没吃药" }, { role: "assistant", content: knee.reply }, { role: "user", content: "部位：右膝内侧" }], { title: "膝盖疼" }));
check("部位：右膝内侧 is the place, on the record", picked.entry?.location === "右膝内侧" && picked.entry.note === "部位：右膝内侧" && !/哪个位置/.test(picked.reply), picked);
const modelKnee = normalizeChat({ reply: "好的。是怎么个疼法？", done: false }, req([{ role: "user", content: "膝盖疼，三天了，比较难受，没吃药" }], { title: "膝盖疼" }));
check("the body map is asked for by rule, whatever the model asked", modelKnee.widget === "bodymap" && /哪个位置/.test(modelKnee.reply), modelKnee);
const modelKnee2 = normalizeChat({ reply: "好的。具体是膝盖哪个位置疼？", done: false }, req([{ role: "user", content: "膝盖疼，三天了，比较难受，没吃药" }], { title: "膝盖疼" }));
check("the model's own wording of where keeps the body map", modelKnee2.widget === "bodymap" && modelKnee2.reply === "好的。具体是膝盖哪个位置疼？", modelKnee2);

/* 八类，没有模型也能问完，最多 7 个问题 */
const kneeRun = runByRule("膝盖疼", { title: "膝盖疼" });
check("knee: the rule engine finishes", kneeRun.replies.at(-1)?.done === true, kneeRun.messages);
check(`knee: at most ${MAX_QUESTIONS} questions`, kneeRun.questions <= MAX_QUESTIONS, kneeRun.questions);
const kneeAsked = kneeRun.messages.filter((m) => m.role === "assistant").map((m) => m.content).join("\n");
check("knee: asks onset, severity, medicine, place, how it hurts, what else, when", [/什么时候开始/, /多难受/, /药/, /哪个位置/, /疼法/, /别的不舒服/, /什么时候、做什么/].every((re) => re.test(kneeAsked)), kneeAsked);
check("knee: no question twice", new Set(kneeRun.messages.filter((m) => m.role === "assistant").map((m) => m.content)).size === kneeRun.replies.length);
const plain = runByRule("头晕", { title: "头晕" });
check("dizziness: finishes and asks whether it happened before", plain.replies.at(-1)?.done === true && /以前也这样过/.test(plain.messages.map((m) => m.content).join()), plain.messages);
const allSaid = fallbackChat(
  req([{ role: "user", content: "右膝内侧胀痛三天了，比较难受，上下楼的时候更疼，休息一下会好一点，没有肿也没有别的不舒服，贴了膏药，以前没这样过" }], { title: "膝盖疼" }),
);
check("everything said at once: closes straight away", allSaid.done === true && !/[?？]/.test(allSaid.reply), allSaid);
const allPlan = consultPlan(req([{ role: "user", content: "右膝内侧胀痛三天了，比较难受，上下楼的时候更疼，休息一下会好一点，没有肿也没有别的不舒服，贴了膏药，以前没这样过" }], { title: "膝盖疼" }));
check("everything said at once: all nine are known", allPlan.next === null && allPlan.missing.length === 0, allPlan);
const nothing = runByRule("不舒服", {}, () => "嗯");
check("only 嗯 for answers: every question is still asked once, then it closes", nothing.questions >= 7 && nothing.replies.at(-1)?.done === true && new Set(nothing.messages.filter((m) => m.role === "assistant").map((m) => m.content)).size === nothing.replies.length, nothing.questions);
const stopped = runByRule("膝盖疼", { title: "膝盖疼" }, () => "就这些吧");
check("就这些 closes the round at once", stopped.questions === 1 && stopped.replies.at(-1)?.done === true, stopped.messages);
const unsure = runByRule("膝盖疼", { title: "膝盖疼" }, (r) => (r.widget === "bodymap" ? "说不太清" : "不清楚"));
check("不清楚 counts as an answer: nothing is asked twice", unsure.replies.at(-1)?.done === true && unsure.questions <= MAX_QUESTIONS, unsure.messages);
const forced = normalizeChat({ reply: "好了，我都记下了。", done: true }, req([{ role: "user", content: "膝盖疼，三天了，比较难受，没吃药" }], { title: "膝盖疼" }));
check("the model may not close before the body map", forced.done === false && forced.widget === "bodymap", forced);

/* 关联：老毛病、以前的记录 */
const sugar = fallbackChat(req([{ role: "user", content: "脚麻，一周了，有点难受，没吃药" }], { title: "脚麻", conditions: ["2型糖尿病（10年）"] }));
check("diabetes + numb feet: asks about glucose", /糖尿病/.test(sugar.reply) && /血糖/.test(sugar.reply), sugar.reply);
const sugarRun = runByRule("脚麻，一周了，有点难受，没吃药", { title: "脚麻", conditions: ["2型糖尿病"] });
check("diabetes + numb feet: then about wounds", /伤口/.test(sugarRun.messages.map((m) => m.content).join()), sugarRun.messages);
const gastritis = linksFor(req([{ role: "user", content: "上腹痛" }], { title: "上腹痛", related: [{ title: "胃痛", date: "2026年7月1日", diagnosis: "急性胃炎" }] }));
check("an earlier visit for the same complaint: asks what is the same and what is different this time", gastritis[0]?.questions[0].q === "你2026年7月1日看过「急性胃炎」，这次和那次比，哪里一样、哪里不一样？", gastritis);
const bp = fallbackChat(req([{ role: "user", content: "头晕，今天早上开始的，比较难受，没吃药" }], { title: "头晕", conditions: ["高血压"] }));
check("high blood pressure + dizziness: asks about blood pressure", /血压/.test(bp.reply), bp.reply);
check("no link for an unrelated complaint", linksFor(req([{ role: "user", content: "膝盖疼" }], { title: "膝盖疼", conditions: ["高血压"] })).length === 0);
check("the link question draws no conclusion", !/可能是|引起|导致/.test(sugar.reply + bp.reply));

/* 描述里有问到的东西 */
const at = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const ep: Episode = {
  id: "k", title: "膝盖疼", tags: [], status: "active", startedAt: at(4000), createdAt: at(10), updatedAt: at(1), lastCheckInAt: at(1), relatedEpisodeIds: [], messages: [],
  entries: ["膝盖疼，三天了", "部位：右膝内侧", "疼法：酸痛（患者原话：酸酸的）", "其他不舒服：没有别的", "什么时候更重：上下楼", "用药：贴了膏药"].map((note, i) => ({ id: `e${i}`, at: at(10 - i), severity: null, note, source: i ? "ai" as const : "user" as const })),
};
const desc = fallbackSummary({ profile: profile(["高血压"]), episode: ep, related: [] }).summary;
check("the description has place, how it hurts, when worse, what else, medicine", ["右膝内侧", "酸痛（患者原话：酸酸的）", "上下楼", "没有别的", "贴了膏药"].every((w) => desc.presentIllness.includes(w)), desc.presentIllness);
check("the description keeps the history from the profile", desc.relevantHistory.some((x) => x.includes("高血压")), desc.relevantHistory);

/* 不建议做检查：去掉建议句，留下问句和「去看医生」 */
const SUGGESTS = /查一下|做个|去做|测一下|建议检查|顺便查/;
check("顺便查一下血糖 goes, the visit stays", withoutTestAdvice("好了，我都记下了。走路时脚麻加重，建议去普通门诊看看，顺便查一下血糖。") === "好了，我都记下了。走路时脚麻加重，建议去普通门诊看看。");
check("建议做个心电图 goes", withoutTestAdvice("记下了。建议做个心电图。") === "记下了。");
check("去医院做个B超 goes, the rest stays", withoutTestAdvice("记下了。可以去医院做个B超看看。头痛加重就去看神经内科。") === "记下了。头痛加重就去看神经内科。");
check("门诊检查 means seeing a doctor and is kept as that", withoutTestAdvice("建议尽快到普通门诊检查。") === "建议尽快到普通门诊看看。");
check("asking whether glucose was measured stays", withoutTestAdvice("记下了。最近测过血糖吗？") === "记下了。最近测过血糖吗？");
check("a doctor's own order stays", withoutTestAdvice("医生让你一周后复查血糖。") === "医生让你一周后复查血糖。");
check("re-testing after a low reading stays", withoutTestAdvice("15 分钟后再测一下血糖。") === "15 分钟后再测一下血糖。");
check("which department to see stays", withoutTestAdvice("建议今天去看心内科。") === "建议今天去看心内科。");
const sugarClose = normalizeChat(
  { reply: "好了，我都记下了。走路时脚麻加重，建议去普通门诊看看，顺便查一下血糖。", done: true, hint: { level: "info", text: "有糖尿病史出现脚麻，建议尽快到普通门诊检查，同时查一下糖化血红蛋白。" } },
  req([{ role: "user", content: "脚麻" }, { role: "assistant", content: "好的。一般什么时候更难受？" }, { role: "user", content: "走路" }, { role: "assistant", content: "好了，我都记下了。" }, { role: "user", content: "还是麻" }], { title: "脚麻", conditions: ["糖尿病"] }),
);
check("the chat reply and its note suggest no test", !SUGGESTS.test(sugarClose.reply) && !SUGGESTS.test(sugarClose.hint?.text ?? "") && /门诊/.test(sugarClose.reply), sugarClose);
const ruleTexts = [kneeRun, plain, sugarRun, unsure].flatMap((r) => r.replies.flatMap((x) => [x.reply, x.hint?.text ?? ""]));
check("the rule engine's own replies suggest no test", ruleTexts.every((t) => !SUGGESTS.test(t) || /[？?]/.test(t)), ruleTexts.filter((t) => SUGGESTS.test(t)));

/* 「停下来问医生」不能被读成自己停药 */
check("停下来问医生 counts as stopping on one's own", stopsOnOwn("如果出现这些情况可以停下来问医生或药师。") && stopsOnOwn("胃不舒服就先别吃了。") && stopsOnOwn("出现皮疹先停药。"));
check("不要自己停药 is kept", !stopsOnOwn("不要自己停药，先问医生。") && !stopsOnOwn("医生说吃完这盒就停药。") && !stopsOnOwn("不建议自己减量或停药。"));
const asked = { profile: profile(), records: [], question: "洛索洛芬钠片吃了胃不舒服怎么办" };
const guarded = guardAnswer("洛索洛芬钠片常见的不舒服是胃不舒服。如果出现这些情况可以停下来问医生或药师。很难受的话马上去医院。", asked);
check("the guard rewrites 停下来 into asking first", !/停下来/.test(guarded) && /先联系医生或药师，问要不要调整/.test(guarded), guarded);
check("the guard keeps 不要自己停药", guardAnswer("不要自己停药，先问医生或药师。", asked).includes("不要自己停药"));
const orders = { date: null, hospital: null, department: null, diagnosis: "急性胃炎", findings: [], procedures: [], medications: [{ name: "洛索洛芬钠片", usage: "每日三次，饭后", longTerm: false }], advice: null, followUpDays: null, followUpNote: null, readings: [], summary: "", unclear: [] };
const ruleExplain = fallbackExplain(orders, "副作用");
check("the rules' own explanation of side effects says to ask, not to stop", !/停下来|先停|先别吃/.test(ruleExplain) && /先联系医生或药师/.test(ruleExplain), ruleExplain);

const tapped = normalizeChat(
  { reply: "是一阵一阵跳着疼吗？医生管这个叫『搏动性痛』。", done: false, suggestedReplies: ["是", "不是"] },
  req([{ role: "user", content: "头痛，今天开始，比较难受，没吃药" }, { role: "assistant", content: "好的。具体是哪个位置疼？" }, { role: "user", content: "额头" }, { role: "assistant", content: "好的。是怎么个疼法？" }, { role: "user", content: "一跳一跳的" }], { title: "头痛" }),
);
check("a tapped answer is not confirmed again by the model", !/『/.test(tapped.reply) && /别的不舒服/.test(tapped.reply) && tapped.entry?.note === "疼法：搏动性疼痛（患者原话：一跳一跳）", tapped);
const misnamed = normalizeChat({ reply: "是一跳一跳地疼吗？医生管这个叫『搏动性痛』。", done: false }, req([{ role: "user", content: "头一跳一跳地疼" }], { title: "头痛" }));
check("a confirmation is asked with the table's word", misnamed.reply.includes("『搏动性疼痛』"), misnamed.reply);

const seven = [{ role: "user" as const, content: "头痛" }, ...Array.from({ length: 7 }, (_, i) => [{ role: "assistant" as const, content: `问题 ${i + 1}？` }, { role: "user" as const, content: "不清楚" }]).flat()];
const salvaged = salvageChat("好的，以前有过类似头疼吗？", req(seven, { title: "头痛" }));
check("seven questions are no limit: a plain-text question still goes through", salvaged.done === false && /[?？]/.test(salvaged.reply), salvaged);
const enough = [...seven.slice(0, -1), { role: "user" as const, content: "就这些，不想说了" }];
const closed = salvageChat("好的，以前有过类似头疼吗？", req(enough, { title: "头痛" }));
check("就这些 closes a plain-text answer too", closed.done === true && !/[?？]/.test(closed.reply), closed);

/* 答非所问：标签按实际说的那一类贴 */
const kneeOpen = "膝盖疼，三天了，比较难受，没吃药";
const after = (question: string, answer: string) =>
  fallbackChat(req([{ role: "user", content: kneeOpen }, { role: "assistant", content: "好的。具体是哪个位置疼？在下面的图上点一下就行。" }, { role: "user", content: "部位：右膝内侧" }, { role: "assistant", content: question }, { role: "user", content: answer }], { title: "膝盖疼" })).entry?.note;
check("asked how it hurts, told 没有别的不舒服: noted as what else, not as how it hurts", after("记下了。是怎么个疼法？", "没有别的不舒服") === "其他不舒服：没有别的不舒服", after("记下了。是怎么个疼法？", "没有别的不舒服"));
check("asked how it hurts, told what was taken: noted as medicine", after("记下了。是怎么个疼法？", "贴了一贴膏药") === "用药：贴了一贴膏药", after("记下了。是怎么个疼法？", "贴了一贴膏药"));
check("asked how it hurts, told something unrecognised: kept as said", after("记下了。是怎么个疼法？", "我在上班呢") === "我在上班呢", after("记下了。是怎么个疼法？", "我在上班呢"));
check("asked how it hurts, a tapped option is still how it hurts", after("记下了。是怎么个疼法？", "一动就疼") === "疼法：一动就疼" && after("记下了。是怎么个疼法？", "像针扎") === "疼法：刺痛（患者原话：像针扎）");
check("asked how it hurts, 说不清 is still the answer to it", after("记下了。是怎么个疼法？", "说不清") === "疼法：说不清");
check("asked what else, told when it is worse: noted as when", after("好的。还有别的不舒服吗？", "上下楼的时候更厉害") === "什么时候更重：上下楼的时候更厉害", after("好的。还有别的不舒服吗？", "上下楼的时候更厉害"));
check("asked what else, 没有 is the answer to it", after("好的。还有别的不舒服吗？", "没有") === "其他不舒服：没有");
const modelOff = normalizeChat(
  { reply: "好的。还有别的不舒服吗？", entry: { note: "疼法：没有别的不舒服" } },
  req([{ role: "user", content: kneeOpen }, { role: "assistant", content: "记下了。是怎么个疼法？" }, { role: "user", content: "没有别的不舒服" }], { title: "膝盖疼" }),
);
check("the model's version gets the same label", modelOff.entry?.note === "其他不舒服：没有别的不舒服", modelOff.entry);
const offEp: Episode = { ...ep, entries: [...ep.entries.slice(0, 2), { id: "x", at: at(3), severity: null, note: "其他不舒服：没有别的不舒服", source: "ai" }] };
const offDesc = fallbackSummary({ profile: profile(), episode: offEp, related: [] }).summary;
check("the first screen does not call it how it hurts", !JSON.stringify(offDesc).includes("疼法：没有别的"), offDesc.glance);

/* 口语都要换成医生的说法：表里的规则确认，表外的模型自己确认 */
check("咚咚的疼 is 搏动性疼痛", findColloquial("头咚咚的疼")[0]?.term === "搏动性疼痛");
const earlier = consultPlan(
  req([{ role: "user", content: "肚子拧着疼，心里发慌" }, { role: "assistant", content: confirmQuestion(findColloquial("拧着疼")[0]) }, { role: "user", content: "是" }], { title: "肚子痛" }),
);
check("a second everyday word said earlier is still confirmed", earlier.next?.key === "confirm" && /心悸/.test(earlier.next.question), earlier.next);
const own = normalizeChat(
  { reply: "记下了。是那种闷闷的、头里面像有东西在敲的疼吗？医生管这个叫『搏动性头痛』。", done: false },
  req([{ role: "user", content: "头疼，今天开始" }, { role: "assistant", content: "好的。是怎么个疼法？" }, { role: "user", content: "就是一下一下敲着" }], { title: "头痛" }),
);
check("the model may confirm a word the table does not know", /『搏动性头痛』/.test(own.reply) && own.suggestedReplies.join() === "是,不是" && own.done === false, own);
const spokenEp: Episode = { ...ep, entries: [...ep.entries, { id: "w", at: at(2), severity: null, note: "心悸（患者原话：心里发慌）", source: "ai" }, { id: "r", at: at(1), severity: null, note: "怎么会减轻：休息一下", source: "ai" }] };
const spokenDesc = fallbackSummary({ profile: profile(), episode: spokenEp, related: [] }).summary.narrative ?? "";
check("the description says it the patient's way, the doctor's word after it", spokenDesc.includes("酸酸的（酸痛）") && spokenDesc.includes("心里发慌（心悸）") && spokenDesc.includes("休息一下会减轻"), spokenDesc);

finish("consult");
