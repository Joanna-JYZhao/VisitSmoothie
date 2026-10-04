/*
 * 注册七项和「补充以往病史」的纯逻辑。
 * Run with: npx tsx scripts/tests/profile.test.ts
 */
import { check, finish } from "./_check";
import type { Profile } from "../../src/lib/types";
import {
  addPastHistory,
  ageFromBirthDate,
  emptyRegister,
  missingFields,
  profileFromRegister,
  registerFromProfile,
  splitList,
  validateRegister,
} from "../../src/app/me/profile-data";

const today = new Date(2026, 9, 3);

// age from the birth date, either side of the birthday
check("生日已过：58 岁", ageFromBirthDate("1968-05-12", today) === 58, ageFromBirthDate("1968-05-12", today));
check("生日当天：58 岁", ageFromBirthDate("1968-10-03", today) === 58);
check("生日还没到：57 岁", ageFromBirthDate("1968-10-04", today) === 57);
check("生日还没到（下个月）：57 岁", ageFromBirthDate("1968-12-01", today) === 57);
check("不存在的日期", ageFromBirthDate("1968-02-30", today) === null);
check("将来的日期", ageFromBirthDate("2027-01-01", today) === null);
check("格式不对", ageFromBirthDate("1968/05/12", today) === null);

// splitting multi-line text
check("顿号、逗号、换行都拆", JSON.stringify(splitList("高血压、糖尿病，哮喘\n痛风")) === JSON.stringify(["高血压", "糖尿病", "哮喘", "痛风"]), splitList("高血压、糖尿病，哮喘\n痛风"));
check("括号里的逗号不拆", JSON.stringify(splitList("高血压（十年，每天吃药）、胃炎")) === JSON.stringify(["高血压（十年，每天吃药）", "胃炎"]), splitList("高血压（十年，每天吃药）、胃炎"));
check("空行和重复去掉，列表符号去掉", JSON.stringify(splitList("1. 青霉素\n\n- 海鲜\n青霉素")) === JSON.stringify(["青霉素", "海鲜"]), splitList("1. 青霉素\n\n- 海鲜\n青霉素"));

// required items
const empty = emptyRegister();
check("空表缺四项", JSON.stringify(missingFields(empty)) === JSON.stringify(["name", "birthDate", "gender", "education"]));
check("缺项提示说出名字", validateRegister({ ...empty, name: "老王", gender: "男" }, today) === "还差：出生日期、学历。填上就能保存。", validateRegister({ ...empty, name: "老王", gender: "男" }, today));
const filled = { ...empty, name: " 老王 ", birthDate: "1968-05-12", gender: "男" as const, education: "初中" };
check("必填项都有就能保存（选填全空）", validateRegister(filled, today) === null);
check("出生日期不对", validateRegister({ ...filled, birthDate: "2030-01-01" }, today) !== null);

// draft to profile
const p = profileFromRegister({ ...filled, conditions: "高血压、糖尿病", familyHistory: "母亲 糖尿病", allergies: "没有" }, null, "2026-10-03T02:00:00.000Z");
check("昵称去空格", p.name === "老王");
check("出生日期和出生年份一起存", p.birthDate === "1968-05-12" && p.birthYear === 1968);
check("学历存下", p.education === "初中");
check("基础病拆成多条", JSON.stringify(p.conditions) === JSON.stringify(["高血压", "糖尿病"]));
check("家族遗传病", JSON.stringify(p.familyHistory) === JSON.stringify(["母亲 糖尿病"]));
check("写「没有」不记成一条过敏", p.allergies.length === 0, p.allergies);
check("跳过的项是空的，别的字段有默认值", p.medications.length === 0 && p.surgeries.length === 0 && p.emergencyContact === null);
const skipped = profileFromRegister(filled);
check("基础病跳过：空列表", skipped.conditions.length === 0);

// editing keeps what the seven items do not cover
const prev: Profile = { ...p, medications: ["二甲双胍"], surgeries: ["阑尾切除（2015）"], heightCm: 170, createdAt: "2026-01-01T00:00:00.000Z" };
const back = registerFromProfile(prev);
check("档案回到表单：列表一行一条", back.conditions === "高血压\n糖尿病" && back.birthDate === "1968-05-12");
const again = profileFromRegister({ ...back, allergies: "青霉素" }, prev);
check("修改后保留用药、手术、身高、建档时间", again.medications[0] === "二甲双胍" && again.surgeries[0] === "阑尾切除（2015）" && again.heightCm === 170 && again.createdAt === prev.createdAt);
check("修改后过敏史更新", JSON.stringify(again.allergies) === JSON.stringify(["青霉素"]));
check("旧学历选项换成新的", registerFromProfile({ ...prev, education: "高中或中专" }).education === "高中/中专");

// 补充以往病史
const added = addPastHistory(prev, "2015 年阑尾切除\n2024 年右膝扭伤\n高血压");
check("手术进 surgeries", JSON.stringify(added.surgeries) === JSON.stringify(["2015 年阑尾切除"]), added);
check("其余进 conditions，已有的不重复", JSON.stringify(added.conditions) === JSON.stringify(["2024 年右膝扭伤"]), added);
check("档案里两处都加上", added.profile.surgeries.includes("2015 年阑尾切除") && added.profile.conditions.includes("2024 年右膝扭伤") && added.profile.conditions.length === 3);

finish("profile");
