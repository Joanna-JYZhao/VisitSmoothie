"use client";

import type { Gender, Profile } from "@/lib/types";
import { nowISO } from "@/lib/utils";
import { ChipsInput } from "./ChipsInput";
import { Field, Input, Segmented, Select, Textarea } from "./ui";

export interface ProfileDraft {
  name: string;
  gender: Gender;
  birthYear: string;
  heightCm: string;
  weightKg: string;
  bloodType: string;
  conditions: string[];
  allergies: string[];
  medications: string[];
  surgeries: string[];
  familyHistory: string[];
  notes: string;
  contactName: string;
  contactRelation: string;
  contactPhone: string;
}

export const emptyDraft = (): ProfileDraft => ({
  name: "",
  gender: "男",
  birthYear: "1990",
  heightCm: "",
  weightKg: "",
  bloodType: "",
  conditions: [],
  allergies: [],
  medications: [],
  surgeries: [],
  familyHistory: [],
  notes: "",
  contactName: "",
  contactRelation: "",
  contactPhone: "",
});

export function draftFromProfile(p: Profile): ProfileDraft {
  return {
    name: p.name,
    gender: p.gender,
    birthYear: String(p.birthYear),
    heightCm: p.heightCm ? String(p.heightCm) : "",
    weightKg: p.weightKg ? String(p.weightKg) : "",
    bloodType: p.bloodType ?? "",
    conditions: p.conditions,
    allergies: p.allergies,
    medications: p.medications,
    surgeries: p.surgeries,
    familyHistory: p.familyHistory,
    notes: p.notes ?? "",
    contactName: p.emergencyContact?.name ?? "",
    contactRelation: p.emergencyContact?.relation ?? "",
    contactPhone: p.emergencyContact?.phone ?? "",
  };
}

export function profileFromDraft(d: ProfileDraft, prev?: Profile | null): Profile {
  const num = (s: string) => {
    const n = Number(s);
    return s.trim() && Number.isFinite(n) && n > 0 ? n : null;
  };
  return {
    name: d.name.trim(),
    gender: d.gender,
    birthYear: Number(d.birthYear),
    heightCm: num(d.heightCm),
    weightKg: num(d.weightKg),
    bloodType: d.bloodType || null,
    conditions: d.conditions,
    allergies: d.allergies,
    medications: d.medications,
    surgeries: d.surgeries,
    familyHistory: d.familyHistory,
    notes: d.notes.trim(),
    // a contact only counts with a number to call
    emergencyContact: d.contactPhone.trim()
      ? { name: d.contactName.trim() || "家人", relation: d.contactRelation.trim(), phone: d.contactPhone.trim() }
      : null,
    createdAt: prev?.createdAt ?? nowISO(),
    updatedAt: nowISO(),
  };
}

export function validateBasics(d: ProfileDraft): string | null {
  if (!d.name.trim()) return "请填一下怎么称呼你";
  const y = Number(d.birthYear);
  const thisYear = new Date().getFullYear();
  if (!Number.isInteger(y) || y < thisYear - 110 || y > thisYear) return "出生年份好像不对，请再看一眼";
  if (d.contactPhone.trim() && d.contactPhone.replace(/\D/g, "").length < 7) return "紧急联系人的电话好像不完整，请再看一眼";
  return null;
}

const SUGGEST = {
  conditions: ["高血压", "糖尿病", "哮喘", "慢性胃炎", "过敏性鼻炎", "甲状腺疾病", "高血脂", "偏头痛", "腰椎间盘突出"],
  allergies: ["青霉素", "头孢", "磺胺", "阿司匹林", "海鲜", "花生", "花粉", "尘螨"],
  medications: ["降压药", "二甲双胍", "阿司匹林", "他汀类", "左甲状腺素", "抗过敏药"],
  surgeries: ["阑尾切除", "剖宫产", "扁桃体切除", "骨折手术", "胆囊切除"],
  familyHistory: ["高血压", "糖尿病", "心脏病", "脑卒中", "癌症", "哮喘"],
};

export function BasicFields({ draft, onChange }: { draft: ProfileDraft; onChange: (d: ProfileDraft) => void }) {
  const set = <K extends keyof ProfileDraft>(k: K, v: ProfileDraft[K]) => onChange({ ...draft, [k]: v });
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => thisYear - i);
  return (
    <div className="grid gap-5">
      <Field label="怎么称呼你" required>
        <Input value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="姓名或者昵称" />
      </Field>
      <Field label="性别">
        <Segmented
          options={[
            { value: "男", label: "男" },
            { value: "女", label: "女" },
            { value: "其他", label: "其他" },
          ]}
          value={draft.gender}
          onChange={(v) => set("gender", v)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="出生年份" required>
          <Select value={draft.birthYear} onChange={(e) => set("birthYear", e.target.value)}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y} 年
              </option>
            ))}
          </Select>
        </Field>
        <Field label="血型">
          <Select value={draft.bloodType} onChange={(e) => set("bloodType", e.target.value)}>
            <option value="">不清楚</option>
            {["A", "B", "AB", "O"].map((b) => (
              <option key={b} value={b}>
                {b} 型
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="身高（cm）">
          <Input
            type="number"
            inputMode="numeric"
            value={draft.heightCm}
            onChange={(e) => set("heightCm", e.target.value)}
            placeholder="可以不填"
          />
        </Field>
        <Field label="体重（kg）">
          <Input
            type="number"
            inputMode="decimal"
            value={draft.weightKg}
            onChange={(e) => set("weightKg", e.target.value)}
            placeholder="可以不填"
          />
        </Field>
      </div>
    </div>
  );
}

export function HistoryFields({ draft, onChange }: { draft: ProfileDraft; onChange: (d: ProfileDraft) => void }) {
  const set = <K extends keyof ProfileDraft>(k: K, v: ProfileDraft[K]) => onChange({ ...draft, [k]: v });
  return (
    <div className="grid gap-5">
      <Field label="老毛病、慢性病" hint="打完按回车，或者直接点下面常见的。">
        <ChipsInput
          value={draft.conditions}
          onChange={(v) => set("conditions", v)}
          placeholder="例如：高血压、慢性胃炎"
          suggestions={SUGGEST.conditions}
        />
      </Field>
      <Field label="对什么过敏" hint="药和吃的都算，医生开药时要看。">
        <ChipsInput
          value={draft.allergies}
          onChange={(v) => set("allergies", v)}
          placeholder="例如：青霉素、海鲜"
          suggestions={SUGGEST.allergies}
        />
      </Field>
      <Field label="长期吃的药">
        <ChipsInput
          value={draft.medications}
          onChange={(v) => set("medications", v)}
          placeholder="例如：降压药"
          suggestions={SUGGEST.medications}
        />
      </Field>
      <Field label="做过的手术">
        <ChipsInput
          value={draft.surgeries}
          onChange={(v) => set("surgeries", v)}
          placeholder="例如：阑尾切除（2015）"
          suggestions={SUGGEST.surgeries}
        />
      </Field>
      <Field label="家里人的病" hint="父母、兄弟姐妹有过的大病。">
        <ChipsInput
          value={draft.familyHistory}
          onChange={(v) => set("familyHistory", v)}
          placeholder="例如：父亲 高血压"
          suggestions={SUGGEST.familyHistory}
        />
      </Field>
      <Field label="还想让医生知道的">
        <Textarea
          value={draft.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="可以不填，比如：怀孕、抽烟喝酒的习惯"
          className="min-h-24"
        />
      </Field>
    </div>
  );
}

const RELATIONS = ["爱人", "女儿", "儿子", "父母", "兄弟姐妹", "朋友"];

/** Who to call when something happens. Optional, but the emergency page is much more useful with it. */
export function ContactFields({ draft, onChange }: { draft: ProfileDraft; onChange: (d: ProfileDraft) => void }) {
  const set = <K extends keyof ProfileDraft>(k: K, v: ProfileDraft[K]) => onChange({ ...draft, [k]: v });
  return (
    <div className="grid gap-5">
      <Field label="电话" hint="应急手册第一屏会显示这个号码，旁边的人一点就能拨。">
        <Input
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={draft.contactPhone}
          onChange={(e) => set("contactPhone", e.target.value)}
          placeholder="可以不填"
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="叫什么">
          <Input value={draft.contactName} onChange={(e) => set("contactName", e.target.value)} placeholder="姓名" autoComplete="off" />
        </Field>
        <Field label="是你的">
          <Input
            value={draft.contactRelation}
            onChange={(e) => set("contactRelation", e.target.value)}
            placeholder="比如：女儿"
            list="relation-options"
            autoComplete="off"
          />
          <datalist id="relation-options">
            {RELATIONS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </Field>
      </div>
    </div>
  );
}
