/*
 * 演示病人林叔：和队友的剧本（虚构患者资料_中英双语.docx）对得上。
 * Run with: npx tsx scripts/tests/demo-lin.test.ts
 */
import { check, finish } from "./_check";
import { buildLinState } from "../../src/lib/demo-lin";
import { askRequestFor } from "../../src/lib/ask";
import { fallbackAsk } from "../../src/lib/ai/askRules";
import { ageFromBirthDate, splitList } from "../../src/app/me/profile-data";
import { fallbackSummary, linksFor, ownQuestions } from "../../src/lib/ai/fallback";
import { buildTodos } from "../../src/lib/reminders";
import type { AfterResult } from "../../src/lib/types";

const now = new Date(2026, 9, 4, 9, 0);
const s = buildLinState(now);
const p = s.profile!;

check("姓名 林叔", p.name === "林叔");
check("出生日期 1980-03-18，按 2026-10-04 算 46 岁", p.birthDate === "1980-03-18" && ageFromBirthDate(p.birthDate, now) === 46);
check("男，高中/中专", p.gender === "男" && p.education === "高中/中专");
check("基础病：高血压，药名剂量待核对", /高血压/.test(p.conditions.join()) && /药盒/.test(p.conditions.join()));
check("家族史：父亲高血压、母亲 2 型糖尿病", /父亲 高血压/.test(p.familyHistory.join()) && /母亲 2 型糖尿病/.test(p.familyHistory.join()));
check("过敏：虾，风团", /虾/.test(p.allergies.join()) && /风团/.test(p.allergies.join()));
check("长期药没核对，不替他写", p.medications.length === 0);
// 队友更新版的「既往病史」十条和他自己补的两条，一行一条，日期照原文
const dated = p.conditions.filter((c) => /^\d{4}-\d\d-\d\d /.test(c));
check("以往病史：十条带日期，从 2022-08-16 到 2026-10-03", dated.length === 10 && dated[0].startsWith("2022-08-16") && dated[9].startsWith("2026-10-03") && /骨关节炎（早期）/.test(dated[9]), dated);
check("以往病史：9 月 22 日写明缬沙坦、新增氨氯地平", p.conditions.some((c) => c.startsWith("2026-09-22") && /缬沙坦/.test(c) && /氨氯地平/.test(c)));
check("以往病史：吸烟约 20 年，每天约 10 支（自己添加）", p.conditions.some((c) => /吸烟约 20 年/.test(c) && /每天约 10 支/.test(c) && /2026-09-15/.test(c)));
check("手术：2008-06 阑尾切除术（自己添加）", p.surgeries.length === 1 && /^2008-06 阑尾切除术/.test(p.surgeries[0]) && /2026-09-15/.test(p.surgeries[0]));

// 旧剧本的两条膝盖记录已由 R002（5 月）和 R010（10 月 3 日骨科）取代
check("旧剧本的两条记录不在了", !s.episodes.some((e) => e.id === "lin-knee" || e.id === "lin-may"));
check("就诊记录正好十条：R001–R010", s.episodes.length === 10 && s.episodes.every((e) => /^lin-r0(0[1-9]|10)$/.test(e.id)));
check("两个提醒照文件：R008 的复诊准备、R010 的骨科复诊", s.reminders[0].episodeId === "lin-r008" && s.reminders[1].episodeId === "lin-r010");

// 规则引擎的几条老检查，用测试自己的两条记录（原来演示里的左膝，内容照旧）
const iso = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();
const may = {
  id: "t-may", title: "左膝不适", tags: ["膝盖"], status: "resolved", startedAt: new Date(2026, 4, 12, 8).toISOString(), createdAt: new Date(2026, 4, 12, 20).toISOString(),
  updatedAt: new Date(2026, 4, 12, 20).toISOString(), lastCheckInAt: new Date(2026, 4, 12, 20).toISOString(),
  entries: [{ id: "t-may-e1", at: new Date(2026, 4, 12, 20).toISOString(), severity: null, note: "走路后左膝不舒服", location: "左膝", source: "user" }],
  messages: [], done: true, relatedEpisodeIds: [],
  visit: { date: "2026-05-12", diagnosis: "没有明确诊断", treatment: "没有可核对的用药记录", recordedAt: new Date(2026, 4, 12, 20).toISOString() },
} as unknown as import("../../src/lib/types").Episode;
const knee = {
  id: "t-knee", title: "左膝疼痛", tags: ["膝盖"], status: "active", startedAt: iso(1, 9), createdAt: iso(4, 8, 10), updatedAt: iso(4, 12), lastCheckInAt: iso(4, 8, 30),
  entries: [{ id: "t-knee-e1", at: iso(4, 8, 30), severity: 4, exact: true, note: "左膝内侧（靠另一条腿那边），像被拉着的酸痛，上楼时像扭着疼", location: "左膝内侧", source: "user" }],
  messages: [{ id: "t-knee-m1", role: "user", content: "我左边膝盖这几天不太舒服，上楼时像扭着疼，坐下来会好一点。", at: iso(4, 8, 10), kind: "intake" }],
  done: true, relatedEpisodeIds: ["t-may"],
  visit: { date: "2026-10-04", department: "骨科", diagnosis: "左膝疼痛，原因待查", treatment: "本次未新增药物；本次未开具检查", recordedAt: iso(4, 12) },
} as unknown as import("../../src/lib/types").Episode;

check("两个提醒，都是单次", s.reminders.length === 2 && s.reminders.every((r) => r.frequency === "once" && r.enabled));
const r1 = new Date(s.reminders[0].at!);
const r2 = new Date(s.reminders[1].at!);
check("10 月 9 日 20:00 准备 10-10 复诊材料（全科，带血压记录和药盒）", /准备 10-10 复诊材料/.test(s.reminders[0].text) && /血压记录/.test(s.reminders[0].text) && r1.getDate() === 9 && r1.getHours() === 20);
check("10 月 29 日 20:00 提醒 10 月 31 日骨科复诊", s.reminders[1].text === "10 月 31 日骨科复诊" && r2.getMonth() === 9 && r2.getDate() === 29 && r2.getHours() === 20);
check("没有吃药提醒", s.reminders.every((r) => r.kind !== "medicine"));
check("没有编体温", !s.episodes.some((e) => e.entries.some((x) => x.temp != null)));

// 给医生看的第一屏（规则版）
const sum = fallbackSummary({
  profile: p,
  episode: knee,
  related: [{ title: may.title, date: "2026-05-12", diagnosis: may.visit!.diagnosis, treatment: may.visit!.treatment }],
}).summary;
check("第一屏：他自己说的 4 分照写，不改成「比较难受」", sum.glance[0].includes("自评 4/10") && !sum.glance[0].includes("难受"), sum.glance[0]);
check("第一屏：看过医生后仍写着 5 月那次", sum.glance.some((g) => g.includes("以前有过类似情况：2026-05-12「左膝不适」")), sum.glance);
check("第一屏：不把「没有明确诊断」当成上次的诊断", !sum.glance.some((g) => g.includes("当时是没有")), sum.glance);
check("问医生：这次和上次是不是同一个问题", sum.questionsForDoctor.some((q) => q.includes("是不是同一个问题")), sum.questionsForDoctor);
// 以往病史里有 9 月 26 日那次「上腹阵发性绞痛」（照原文，会进相关病史和自述里的「我有…」）；这次左膝本身的内容不能出现「绞痛」
check("这次左膝的描述不出现「绞痛」", !JSON.stringify({ ...sum, relevantHistory: [], narrative: "" }).includes("绞痛"));

// 问诊引用旧记录：问哪里一样、哪里不一样，不把「没有明确诊断」当诊断
const links = linksFor({
  profile: p,
  related: [{ title: "左膝不适", date: "2026-05-12", diagnosis: "没有明确诊断" }],
  episode: { title: "左膝疼痛" } as never,
  messages: [{ role: "user", content: "左边膝盖这几天不舒服" }] as never,
});
const q = links[0]?.questions[0]?.q ?? "";
check("问诊：问这次和那次哪里一样、哪里不一样", q.includes("哪里一样、哪里不一样") && q.includes("「左膝不适」"), q);
check("问诊：不说「看过『没有明确诊断』」", !q.includes("没有明确诊断"), q);

// 剧本原话
check("「不知道该怎么跟医生说」不当成问医生的问题", ownQuestions("之前也疼过一次，我有点担心，不知道该怎么跟医生说。").every((q) => !q.includes("怎么跟医生说")));
check("剧本想问的问题照原话记下", ownQuestions("这次和上次是不是同一个问题？需要检查吗？").length === 2);
check("注册时写成句子的基础病不被逗号拆开", splitList("患者自述：2022年在门诊被医生告知患有高血压，平时按原处方服药。本次记不清药名和剂量，准备就诊时携带药盒核对。").length === 1);
check("家族史一句话不拆", splitList("父亲有高血压，母亲有2型糖尿病。").length === 1);
check("短的列表照样拆", splitList("高血压，糖尿病、哮喘").length === 3);
check("一行一条的以往病史不拆", splitList("2026年5月12日 左膝走路后不适，看过医生，医生建议观察变化").length === 1);

// 旧记录只写在「补充以往病史」里时也要问
const fromHistory = linksFor({
  profile: { ...p, conditions: [...p.conditions, "2026年5月12日 左膝走路后不适，看过医生，医生建议观察变化，没有明确诊断，此后缓解"] },
  related: [],
  episode: { title: "膝盖痛" } as never,
  messages: [{ role: "user", content: "我左边膝盖这几天不太舒服，上楼时像扭着疼" }] as never,
});
const q2 = fromHistory[0]?.questions[0]?.q ?? "";
check("以往病史里写过左膝：问这次和那次哪里一样、哪里不一样", q2.includes("2026年5月12日 左膝走路后不适") && q2.includes("哪里一样、哪里不一样"), q2);
check("以往病史是别的部位：不问", linksFor({ profile: { ...p, conditions: ["2024年 右肩扭伤"] }, related: [], episode: { title: "膝盖痛" } as never, messages: [{ role: "user", content: "膝盖疼" }] as never }).every((l) => l.rule !== "related"));

// 剧本的医嘱：不加药、不做检查、一周后复诊，带资料和药盒
const orders = {
  date: "2026-10-04", hospital: "虚构示范门诊", department: "骨科", diagnosis: "左膝疼痛，原因待查",
  medications: [], procedures: [], findings: [], readings: [],
  advice: "暂时减少会诱发疼痛的上下楼和久站，记录不适的变化；如症状明显加重，及时就医",
  followUpDays: 7, followUpNote: "复诊时携带既往就诊资料及正在使用的药盒", summary: "",
} as unknown as AfterResult;
const todos = buildTodos(orders).filter((x) => x.remind && x.frequency !== "none");
const eve = todos.find((x) => x.text === "准备病历和药盒");
check("医嘱：复诊前一晚 20:00 提醒准备病历和药盒", eve != null && new Date(eve.at!).getDate() === 10 && new Date(eve.at!).getHours() === 20, todos);
check("医嘱：复诊当天有提醒", todos.some((x) => x.kind === "followup" && new Date(x.at!).getDate() === 11));
check("医嘱：没加药就没有吃药提醒", todos.every((x) => x.kind !== "medicine"));

// 队友更新版的十份报告 R001–R010（日期以 2026-10-04 12:00 为准，按打开那天整天平移）
{
  const at = (st: typeof s, id: string) => st.episodes.find((e) => e.id === id)!;
  const r = s.episodes.filter((e) => e.id.startsWith("lin-r"));
  const ymd = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  check("十份报告，id lin-r001…lin-r010", r.length === 10 && ["001", "002", "003", "004", "005", "006", "007", "008", "009", "010"].every((n) => r.some((e) => e.id === `lin-r${n}`)));
  check("R001 2025-11-19 起，2025-11-20 全科", ymd(at(s, "lin-r001").startedAt) === "2025-11-19" && at(s, "lin-r001").visit!.date === "2025-11-20" && at(s, "lin-r001").visit!.department === "全科");
  check("R002 5 月左膝：看过医生、当次医嘱没有保存（列表不会说「没有看医生」）", /左膝/.test(at(s, "lin-r002").title) && ymd(at(s, "lin-r002").startedAt) === "2026-5-9" && at(s, "lin-r002").visit?.diagnosis === "当次医嘱没有保存");
  check("R009 去过消化内科，单据没有上传", at(s, "lin-r009").visit?.department === "消化内科" && /单据没有上传/.test(at(s, "lin-r009").visit!.diagnosis));
  check("R005 只有就医前整理：不说「自己好了」，保持打开但不追问", at(s, "lin-r005").status === "active" && at(s, "lin-r005").visit == null && at(s, "lin-r005").snoozedUntil != null);
  check("R008 9 月 22 日全科，药名剂量照病历", at(s, "lin-r008").visit!.date === "2026-09-22" && /缬沙坦胶囊 80 mg/.test(at(s, "lin-r008").visit!.treatment) && /苯磺酸氨氯地平片 5 mg/.test(at(s, "lin-r008").visit!.treatment));
  check("R010 10 月 3 日骨科：左膝骨关节炎（早期）", at(s, "lin-r010").visit!.date === "2026-10-03" && at(s, "lin-r010").visit!.department === "骨科" && /左膝骨关节炎（早期）/.test(at(s, "lin-r010").visit!.diagnosis));
  check("R005（只有就医前整理）和 R008–R010 还在跟踪，其余已结束", r.filter((e) => e.status === "active").map((e) => e.id).sort().join() === "lin-r005,lin-r008,lin-r009,lin-r010");
  check("报告里没有编轻重和体温", r.every((e) => e.entries.every((x) => x.severity === null && x.temp == null)));
  const later = buildLinState(new Date(2026, 9, 7, 9, 0));
  check("10 月 7 日打开：日期整体后移 3 天，钟点不变", at(later, "lin-r010").visit!.date === "2026-10-06" && ymd(at(later, "lin-r001").startedAt) === "2025-11-22" && new Date(at(later, "lin-r001").startedAt).getHours() === 20);
  check("今天打开：今天开始跟踪的追问不会马上冒出来", r.filter((e) => e.status === "active").every((e) => new Date(e.lastCheckInAt).getTime() <= now.getTime() + 3 * 3600_000 + 1));
}


// 问一问「下次复诊要带什么？」：答出提醒和医嘱里的复诊，注明出处（规则版，没有 AI 时也一样）
{
  const at = new Date(2026, 9, 4, 12, 0);
  const st = buildLinState(at, "zh");
  const req = askRequestFor(st, "下次复诊要带什么？", at.getTime())!;
  const res = fallbackAsk(req);
  check("问复诊：答出 10 月 10 日全科复诊要带血压记录和药盒", /10-10|10 月 10 日/.test(res.answer) && /血压记录/.test(res.answer) && /药盒/.test(res.answer), res.answer);
  check("问复诊：也提到 10 月 31 日骨科复诊", /10 月 31 日骨科复诊/.test(res.answer), res.answer);
  check("问复诊：有出处", res.sources.length > 0, res.sources);
  check("问复诊：不再说「记录里没有提到复查」", !/没有提到复查/.test(res.answer), res.answer);
}
finish("demo-lin");
