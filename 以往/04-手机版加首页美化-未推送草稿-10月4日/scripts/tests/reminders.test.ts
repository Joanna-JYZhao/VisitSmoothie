import type { AfterResult, Reminder } from "../../src/lib/types";
import { adviceItems, buildTodos, dueReminders, dueSlot, explainLine, explainParts, explainQuestion, fireDue, homeTodos, medicineTimes, reminderMessage, suggestedTodoQuestions } from "../../src/lib/reminders";
import { check, finish } from "./_check";

const base: AfterResult = {
  date: "2026-10-03",
  hospital: "市一院",
  department: "骨科",
  diagnosis: "膝关节扭伤",
  findings: [],
  procedures: [],
  medications: [],
  advice: null,
  followUpDays: null,
  followUpNote: null,
  readings: [],
  summary: "",
  unclear: [],
};
const med = (name: string, usage: string) => ({ name, usage, longTerm: false });

// times guessed from how a medicine is taken
check("每日一次 08:00", medicineTimes("每日一次，每次1片").join() === "08:00", medicineTimes("每日一次"));
check("每日两次 08:00/20:00", medicineTimes("一天两次").join() === "08:00,20:00", medicineTimes("一天两次"));
check("每日三次 08/12/18", medicineTimes("每日3次").join() === "08:00,12:00,18:00", medicineTimes("每日3次"));
check("饭后往后推半小时", medicineTimes("每日三次，饭后").join() === "08:30,12:30,18:30", medicineTimes("每日三次，饭后"));
check("睡前 21:30", medicineTimes("每晚睡前一片").join() === "21:30", medicineTimes("每晚睡前一片"));

const r1 = buildTodos({
  ...base,
  medications: [med("洛索洛芬钠片", "每日三次，饭后"), med("氨氯地平", "每日一次"), med("布洛芬", "疼痛时服用")],
  procedures: ["复位", "每两天换药一次"],
  advice: "每天做股四头肌锻炼，冰敷15分钟。避免剧烈运动；如果疼痛加重，及时就医",
  followUpDays: 7,
  followUpNote: "一周后复查",
});
const meds = r1.filter((t) => t.kind === "medicine");
check("每种药一条", meds.length === 3, meds);
check("药默认每次提醒", meds[0].remind && meds[0].frequency === "each" && meds[0].times?.join() === "08:30,12:30,18:30", meds[0]);
check("药的文字带用法", meds[0].text === "洛索洛芬钠片（每日三次，饭后）", meds[0].text);
check("需要时吃的药默认不提醒", !meds[2].remind && meds[2].frequency === "none", meds[2]);
const care = r1.filter((t) => t.kind === "care").map((t) => t.text);
check("其他治疗：锻炼、冰敷、换药", care.includes("每天做股四头肌锻炼") && care.includes("冰敷15分钟") && care.includes("每两天换药一次"), care);
check("当场的处理不算待办", !r1.some((t) => t.text === "复位"), r1);
check("其他治疗默认每天 09:00 不提醒", r1.filter((t) => t.kind === "care").every((t) => !t.remind && t.frequency === "daily" && t.times?.[0] === "09:00"));
const caution = r1.filter((t) => t.kind === "caution").map((t) => t.text);
check("注意事项：避免剧烈运动、如果…及时就医", caution.includes("避免剧烈运动") && caution.includes("如果疼痛加重，及时就医"), caution);
check("注意事项默认不提醒", r1.filter((t) => t.kind === "caution").every((t) => !t.remind));
const fu = r1.find((t) => t.kind === "followup");
const fuAt = fu?.at ? new Date(fu.at) : null;
check("复诊：一周后那天上午 9 点、只提醒一次", Boolean(fu?.remind && fu.frequency === "once" && fuAt && fuAt.getDate() === 10 && fuAt.getHours() === 9), fu);

const r2 = buildTodos({ ...base, medications: [med("奥美拉唑", "每日两次，饭前")] });
check("没有复诊就没有复诊待办", !r2.some((t) => t.kind === "followup"), r2);
check("饭前往前推半小时", r2[0].times?.join() === "07:30,19:30", r2[0].times);
const r3 = buildTodos({ ...base, followUpNote: "不适随诊" });
check("复诊没定日子：列出但不提醒", r3.length === 1 && r3[0].kind === "followup" && !r3[0].remind, r3);
check("建议拆分保留条件句", adviceItems("如出现发热，立即就诊。多休息").join("|") === "如出现发热，立即就诊|多休息", adviceItems("如出现发热，立即就诊。多休息"));

// the parts that can be explained
const parts = explainParts({
  ...base,
  medications: [med("洛索洛芬钠片", "每日三次"), med("氨氯地平", "每日一次")],
  advice: "冰敷15分钟，避免剧烈运动",
  followUpDays: 7,
});
check("可解释的部分", ["诊断「膝关节扭伤」是什么意思", "洛索洛芬钠片是干什么的", "氨氯地平是干什么的", "这些药常见的副作用", "注意事项为什么要注意", "其他治疗怎么做", "复诊要准备什么"].every((p) => parts.includes(p)), parts);
check("没开药就不列副作用", !explainParts(base).includes("这些药常见的副作用"), explainParts(base));

// when reminders go off
const at = (h: number, m = 0, day = 5) => new Date(2026, 9, day, h, m).getTime();
const rem = (over: Partial<Reminder>): Reminder => ({
  id: "r",
  todoId: "t",
  episodeId: null,
  text: "洛索洛芬钠片（每日三次，饭后）",
  kind: "medicine",
  frequency: "each",
  times: ["08:30", "12:30", "18:30"],
  at: null,
  enabled: true,
  createdAt: new Date(2026, 9, 1).toISOString(),
  lastFiredAt: null,
  ...over,
});
const r = rem({});
check("没到点不提醒", dueReminders([r], at(12, 29)).length === 0);
check("到点就提醒", dueReminders([r], at(12, 31)).length === 1);
check("这个时段提醒过就不再提醒", dueReminders([rem({ lastFiredAt: new Date(at(12, 31)).toISOString() })], at(12, 45)).length === 0);
check("下一个时段再提醒", dueReminders([rem({ lastFiredAt: new Date(at(12, 31)).toISOString() })], at(18, 31)).length === 1);
check("过了两个小时的时段不补", dueReminders([r], at(15, 0)).length === 0);
check("关掉的不提醒", dueReminders([rem({ enabled: false })], at(12, 31)).length === 0);
check("每天一次只看第一个时间", dueReminders([rem({ frequency: "daily" })], at(12, 31)).length === 0 && dueReminders([rem({ frequency: "daily" })], at(8, 31)).length === 1);
check("设之前的时段不算", dueReminders([rem({ createdAt: new Date(at(12, 40)).toISOString() })], at(12, 45)).length === 0);
const slot = dueSlot(r, at(12, 31));
check("提醒的话：该吃…了（午饭后）", slot != null && reminderMessage(r, slot) === "该吃洛索洛芬钠片了（午饭后）", slot && reminderMessage(r, slot));
const visit = rem({ kind: "followup", text: "复诊：一周后复查", frequency: "once", times: undefined, at: new Date(at(9, 0, 10)).toISOString() });
const before = dueSlot(visit, at(9, 5, 9));
check("复诊前一天提醒", before?.dayBefore === true && reminderMessage(visit, before).startsWith("明天要去复诊"), before);
const fired = { ...visit, lastFiredAt: new Date(at(9, 5, 9)).toISOString() };
check("前一天提醒过，当天还提醒", dueSlot(fired, at(9, 1, 10))?.dayBefore === false);
check("当天提醒过就不再提醒", dueSlot({ ...visit, lastFiredAt: new Date(at(9, 1, 10)).toISOString() }, at(10, 0, 10)) === null);

// one follow-up visit, one reminder
const twin = { ...visit, id: "r2", episodeId: "e1", text: "复诊：复查膝盖" };
check("同一天的两条复诊提醒只出一条", dueReminders([visit, twin], at(9, 5, 9)).length === 1);
const plan = fireDue([visit, twin], at(9, 5, 9));
check("出一条，两条都记为已提醒", plan.fire.length === 1 && plan.mark.length === 2, plan);
const marked = [visit, twin].map((x) => ({ ...x, lastFiredAt: new Date(at(9, 5, 9)).toISOString() }));
check("记过之后同一时段不再出", fireDue(marked, at(9, 30, 9)).fire.length === 0);
check("当天再出一条", fireDue(marked, at(9, 1, 10)).fire.length === 1);
const otherDay = { ...twin, at: new Date(at(9, 0, 17)).toISOString() };
check("不同日子的复诊各算各的", homeTodos({ reminders: [visit, otherDay], episodes: [], nextVisit: null }, at(8, 0, 5)).filter((t) => t.kind === "followup").length === 2);

// the home list
const list = homeTodos(
  {
    reminders: [r, visit, twin],
    episodes: [],
    nextVisit: { at: new Date(at(10, 0, 10)).toISOString(), note: "复查" },
  },
  at(8, 0, 5),
);
check("主页：药一行，写出时间和饭后", list[0].title === "洛索洛芬钠片" && list[0].detail === "08:30 12:30 18:30 · 饭后", list[0]);
check("主页：复诊只显示一次（提醒、另一条提醒、nextVisit 同一天）", list.filter((t) => t.kind === "followup").length === 1, list);
check("主页：复诊写出日期", /10月10日/.test(list.find((t) => t.kind === "followup")?.title ?? ""), list);
check("主页：没有提醒的复诊日期也列出", homeTodos({ reminders: [], episodes: [], nextVisit: { at: new Date(at(10, 0, 10)).toISOString(), note: "复查" } }, at(8, 0, 5)).length === 1);
check("主页：过去的复诊不列", homeTodos({ reminders: [visit], episodes: [], nextVisit: null }, at(9, 0, 12)).length === 0);
check("建议问题按药和复诊生成", suggestedTodoQuestions(list).join("|") === "洛索洛芬钠片饭前还是饭后吃？|下次复诊要带什么？|洛索洛芬钠片漏吃了一次怎么办？", suggestedTodoQuestions(list));

/* Clinical Plan：看不懂的那一条怎么问，解释跟着待办走 */
check("药：问作用和为什么这样吃", explainQuestion({ kind: "medicine", text: "洛索洛芬钠片（每日三次，饭后）" }, { diagnosis: "膝关节炎" }) === "洛索洛芬钠片（每日三次，饭后）：这个药是干什么用的，为什么要这样吃");
check("锻炼：问这个病为什么需要", explainQuestion({ kind: "care", text: "每天做直腿抬高锻炼" }, { diagnosis: "膝关节炎" }) === "医生让我「每天做直腿抬高锻炼」：为什么「膝关节炎」需要这样做，平时怎么做到");
check("没写诊断也能问", /这次的病/.test(explainQuestion({ kind: "caution", text: "避免爬山" }, { diagnosis: null })));
check("解释取第一句给提醒用", explainLine("消炎止痛的。饭后吃对胃好一些。") === "消炎止痛的。");
check("提醒带上一句为什么", slot != null && reminderMessage({ ...r, explain: "说明书上一般会写它能消炎止痛。饭后吃对胃好。" }, slot) === "该吃洛索洛芬钠片了（午饭后）\n说明书上一般会写它能消炎止痛。");
check("主页待办带着解释", homeTodos({ reminders: [{ ...r, explain: "为什么" }], episodes: [], nextVisit: null }, at(8, 0, 5))[0]?.explain === "为什么");

finish("reminders");
