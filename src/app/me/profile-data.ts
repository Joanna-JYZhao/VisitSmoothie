/*
 * 注册和「我的资料」用到的纯逻辑：不碰界面，测试直接引入。
 * Run the tests with: npx tsx scripts/tests/profile.test.ts
 */
import type { Gender, Profile } from "../../lib/types";
import { isDev } from "@/lib/dev";
import { L } from "@/lib/lang";

export const EDUCATION_OPTIONS = ["小学", "初中", "高中/中专", "大专", "本科及以上"] as const;

/** How a saved education value reads on screen. The saved value itself stays as it is (Chinese). */
export function educationLabel(e: string): string {
  switch (e) {
    case "小学":
    case "小学及以下":
      return L(e, "Primary school");
    case "初中":
      return L(e, "Middle school");
    case "高中/中专":
    case "高中或中专":
      return L(e, "High school");
    case "大专":
      return L(e, "College");
    case "本科及以上":
      return L(e, "University");
    default:
      return e;
  }
}

/** How a saved gender reads on screen; the saved value stays 男 / 女. */
export function genderLabel(g: string): string {
  if (g === "男") return L(g, "Male");
  if (g === "女") return L(g, "Female");
  return g;
}

/** "62 岁" / "62 years old". */
export const ageLabel = (age: number | string) => L(`${age} 岁`, `${age}\u00a0years\u00a0old`); // kept on one line when it wraps

/** Values saved by the earlier form, mapped onto today's options. */
const LEGACY_EDUCATION: Record<string, string> = { 小学及以下: "小学", 高中或中专: "高中/中专" };

const pad = (n: number) => String(n).padStart(2, "0");
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "1968-05-12" as a real calendar date, or null. */
function parseDay(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return { y, m: mo, d };
}

/** Full years since the birth date, on `today`. Null for a date that is not real or lies in the future. */
export function ageFromBirthDate(birthDate: string, today: Date = new Date()): number | null {
  const b = parseDay(birthDate);
  if (!b) return null;
  let age = today.getFullYear() - b.y;
  const m = today.getMonth() + 1;
  if (m < b.m || (m === b.m && today.getDate() < b.d)) age -= 1;
  return age < 0 ? null : age;
}

/**
 * "高血压、糖尿病\n青霉素" into items. Splits on 、，,；; and new lines, but not inside brackets:
 * "高血压（十年，每天吃药）" stays one item. Leading list marks ("1.", "-", "·") are dropped.
 */
export function splitList(text: string): string[] {
  // Written as sentences ("父亲有高血压，母亲有2型糖尿病。") or as long clauses, a line stays whole:
  // splitting at its commas would break it into fragments. Short items ("高血压，糖尿病") are split.
  const parts = text.split(/[、，,;；\n\r]/).map((x) => x.trim()).filter(Boolean);
  const sentences = /[。！!]/.test(text) || parts.some((x) => [...x].length > 12);
  const out: string[] = [];
  let cur = "";
  let depth = 0;
  for (const ch of text) {
    if (ch === "（" || ch === "(") depth++;
    if ((ch === "）" || ch === ")") && depth > 0) depth--;
    if (depth === 0 && (sentences ? /[;；\n\r]/ : /[、，,;；\n\r]/).test(ch)) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  const items = out.map((x) => x.replace(/^\s*(?:\d+[.、)）]|[-·•*])\s*/, "").trim()).filter(Boolean);
  return [...new Set(items)];
}

/** 没有、无 alone mean nothing to record. */
const NONE = /^(没有|无|暂无|不清楚|不知道|否认)$/;
const listOf = (text: string) => splitList(text).filter((x) => !NONE.test(x));

/** The seven things asked when signing up, as the form holds them. */
export interface RegisterDraft {
  name: string;
  /** YYYY-MM-DD, from the date picker */
  birthDate: string;
  gender: "" | "男" | "女";
  education: string;
  /** multi-line text, split into items on save */
  conditions: string;
  familyHistory: string;
  allergies: string;
}

export const emptyRegister = (): RegisterDraft => ({
  name: "",
  birthDate: "",
  gender: "",
  education: "",
  conditions: "",
  familyHistory: "",
  allergies: "",
});

/** For editing: lists go one item per line, so nothing is split differently on the way back. */
export function registerFromProfile(p: Profile): RegisterDraft {
  const edu = p.education ?? "";
  return {
    name: p.name,
    birthDate: p.birthDate ?? "",
    gender: p.gender === "男" || p.gender === "女" ? p.gender : "",
    education: LEGACY_EDUCATION[edu] ?? edu,
    conditions: p.conditions.join("\n"),
    familyHistory: p.familyHistory.join("\n"),
    allergies: p.allergies.join("\n"),
  };
}

export type RequiredField = "name" | "birthDate" | "gender" | "education";
export const FIELD_NAME: Record<RequiredField, string> = {
  get name() {
    return L("姓名", "name");
  },
  get birthDate() {
    return L("出生日期", "date of birth");
  },
  get gender() {
    return L("性别", "gender");
  },
  get education() {
    return L("学历", "education");
  },
};

/** Which required items are still empty, in the order they appear on the form. */
export function missingFields(d: RegisterDraft): RequiredField[] {
  const out: RequiredField[] = [];
  if (!d.name.trim()) out.push("name");
  if (!d.birthDate.trim()) out.push("birthDate");
  if (!d.gender) out.push("gender");
  if (!d.education) out.push("education");
  return out;
}

/** The sentence shown when the form cannot be saved yet, or null when it can. */
export function validateRegister(d: RegisterDraft, today: Date = new Date()): string | null {
  // 开发者开关开着：必填都不必填
  if (isDev()) return null;
  const missing = missingFields(d);
  if (missing.length)
    return L(`还差：${missing.map((f) => FIELD_NAME[f]).join("、")}。填上就能保存。`, `Still missing: ${missing.map((f) => FIELD_NAME[f]).join(", ")}. Fill these in to save.`);
  const age = ageFromBirthDate(d.birthDate, today);
  if (age == null || age > 120) return L("出生日期好像不对，请再选一下。", "The date of birth doesn't look right. Please pick it again.");
  return null;
}

/**
 * The profile the form describes. Everything the form does not ask about (medicines, surgery,
 * height, the emergency contact…) is kept from `prev`.
 */
export function profileFromRegister(d: RegisterDraft, prev: Partial<Profile> | null = null, now = new Date().toISOString()): Profile {
  const b = parseDay(d.birthDate);
  return {
    heightCm: null,
    weightKg: null,
    bloodType: null,
    medications: [],
    surgeries: [],
    notes: "",
    emergencyContact: null,
    ...prev,
    name: d.name.trim(),
    gender: (d.gender || prev?.gender || "男") as Gender,
    birthDate: b ? d.birthDate.trim() : (prev?.birthDate ?? null),
    birthYear: b ? b.y : (prev?.birthYear ?? new Date(now).getFullYear()),
    education: d.education || null,
    conditions: listOf(d.conditions),
    familyHistory: listOf(d.familyHistory),
    allergies: listOf(d.allergies),
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  };
}

/* ---------- 补充以往病史 ---------- */

const SURGERY = /手术|切除|开刀|置换|摘除|搭桥|支架|缝合|剖宫产|剖腹产|移植|术后|术（|术\(|术$/;

/**
 * Past history typed by the user, one item per line. Operations go to `surgeries` (手术史), the
 * rest to `conditions` (既往病史). Both are read by profileContext, so they reach every consultation.
 */
export function addPastHistory(p: Profile, text: string): { profile: Profile; surgeries: string[]; conditions: string[] } {
  const items = listOf(text);
  const surgeries = items.filter((x) => SURGERY.test(x) && !p.surgeries.includes(x));
  const conditions = items.filter((x) => !SURGERY.test(x) && !p.conditions.includes(x));
  return {
    profile: { ...p, surgeries: [...p.surgeries, ...surgeries], conditions: [...p.conditions, ...conditions] },
    surgeries,
    conditions,
  };
}
