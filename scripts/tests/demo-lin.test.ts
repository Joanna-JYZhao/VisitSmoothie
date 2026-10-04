/*
 * 演示病人林叔：和队友的剧本（虚构患者资料_中英双语.docx）对得上。
 * Run with: npx tsx scripts/tests/demo-lin.test.ts
 */
import { check, finish } from "./_check";
import { buildLinState } from "../../src/lib/demo-lin";
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

const [knee, may] = s.episodes;
check("旧记录：5 月 12 日左膝不适，已缓解", may.title === "左膝不适" && may.startedAt.startsWith("2026-05-1") && may.status === "resolved");
check("旧记录没有明确诊断、没有用药记录", /没有明确诊断/.test(may.visit!.diagnosis) && /没有可核对的用药/.test(may.visit!.treatment));
check("旧记录没有编轻重", may.entries.every((e) => e.severity === null));
check("这次：左膝疼痛，三天前开始，引用了旧记录", knee.title === "左膝疼痛" && knee.relatedEpisodeIds.includes(may.id) && new Date(knee.startedAt).getDate() === 1);
check("4 分是他自己说的", knee.entries[0].severity === 4 && knee.entries[0].exact === true);
check("保留他的原话「像扭着疼」，没改成「绞痛」", knee.messages[0].content.includes("像扭着疼") && !JSON.stringify(knee).includes("绞痛"));
check("医嘱：骨科，原因待查，不加药，不做检查", knee.visit!.department === "骨科" && /原因待查/.test(knee.visit!.diagnosis) && /未新增药物/.test(knee.visit!.treatment) && /未开具检查/.test(knee.visit!.treatment));
const fu = new Date(knee.visit!.followUpAt!);
check("复诊 10 月 11 日 09:30", fu.getMonth() === 9 && fu.getDate() === 11 && fu.getHours() === 9 && fu.getMinutes() === 30);
check("看完医生继续跟踪", knee.status === "active");

check("两个提醒，都是单次", s.reminders.length === 2 && s.reminders.every((r) => r.frequency === "once" && r.enabled));
const r1 = new Date(s.reminders[0].at!);
const r2 = new Date(s.reminders[1].at!);
check("10 月 10 日 20:00 准备病历和药盒", s.reminders[0].text === "准备病历和药盒" && r1.getDate() === 10 && r1.getHours() === 20);
check("10 月 11 日 08:30 复诊准备", /复诊准备/.test(s.reminders[1].text) && r2.getDate() === 11 && r2.getHours() === 8 && r2.getMinutes() === 30);
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

finish("demo-lin");
