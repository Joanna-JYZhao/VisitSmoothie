/*
 * 演示病人林叔的英文版：和剧本的英文那一半对得上，而且和中文版是同一个故事、同一套 id。
 * Run with: npx tsx scripts/tests/demo-lin-en.test.ts
 */
import { check, finish } from "./_check";
import { buildLinState } from "../../src/lib/demo-lin";
import { fallbackSummary as summaryForEn } from "../../src/lib/ai/fallback";
import { ageFromBirthDate, EDUCATION_OPTIONS } from "../../src/app/me/profile-data";

const now = new Date(2026, 9, 4, 9, 0);
const s = buildLinState(now, "en");
const zh = buildLinState(now, "zh");
const p = s.profile!;
const all = JSON.stringify(s);

check("name Uncle Lin", p.name === "Uncle Lin");
check("born 1980-03-18, 46 on 2026-10-04", p.birthDate === "1980-03-18" && p.birthYear === 1980 && ageFromBirthDate(p.birthDate, now) === 46);
check("male; education is the stored option value", p.gender === "男" && p.education === "高中/中专" && (EDUCATION_OPTIONS as readonly string[]).includes(p.education!));
const cond = p.conditions.join(" ");
check("high blood pressure since 2022, medicine to be checked against the box", /high blood pressure/i.test(cond) && cond.includes("2022") && /medicine box/.test(cond), cond);
check("no medicine name or dose invented", p.medications.length === 0 && !/\d+\s?mg/i.test(all));
const dated = p.conditions.filter((c) => /^\d{4}-\d\d-\d\d /.test(c));
check("past history: ten dated lines, 2022-08-16 to 2026-10-03", dated.length === 10 && dated[0].startsWith("2022-08-16") && dated[9].startsWith("2026-10-03") && /early left knee osteoarthritis/.test(dated[9]), dated);
check("past history: same dates as the Chinese lines", dated.map((c) => c.slice(0, 10)).join() === zh.profile!.conditions.filter((c) => /^\d{4}-\d\d-\d\d /.test(c)).map((c) => c.slice(0, 10)).join());
check("past history: smoking about 20 years, about 10 a day", p.conditions.some((c) => /Smoker for about 20 years/.test(c) && /about 10 cigarettes a day/.test(c)));
check("surgery: 2008-06 appendectomy", p.surgeries.length === 1 && /^2008-06 Appendectomy/.test(p.surgeries[0]));
const fam = p.familyHistory.join(" | ");
check("family: father high blood pressure, mother type 2 diabetes, no inherited disease", /Father: high blood pressure/.test(fam) && /Mother: type 2 diabetes/.test(fam) && /No confirmed inherited/.test(fam), fam);
const alg = p.allergies.join(" ");
check("allergies: shrimp, itching and hives, no test, no drug allergy", /shrimp/.test(alg) && /hives/.test(alg) && /itch/i.test(alg) && /never had an allergy test/.test(alg) && /no drug allergy/.test(alg), alg);

const [knee, may] = s.episodes;
check("May record: left knee discomfort on 12 May, eased", may.title === "Left knee discomfort" && may.startedAt.startsWith("2026-05-1") && may.status === "resolved");
check("May record: no clear diagnosis, no medicine record", /No clear diagnosis/.test(may.visit!.diagnosis) && /No medicine record/.test(may.visit!.treatment));
check("May record: severity not invented", may.entries.every((e) => e.severity === null));
check("this time: left knee pain, started three days ago, links the May record", knee.title === "Left knee pain" && knee.relatedEpisodeIds.includes(may.id) && new Date(knee.startedAt).getDate() === 1);
check("4/10 is his own number", knee.entries[0].severity === 4 && knee.entries[0].exact === true);
check("pulling ache on the inner left knee", /pulling ache/.test(knee.entries[0].note) && /inner/i.test(knee.entries[0].location ?? ""));
check("his words kept: twisting, not colic", knee.messages[0].content.includes("twisting pain") && !/colic/i.test(all));
check("no Chinese left in the English story", !/[一-龥]/.test(JSON.stringify({ ...s, profile: { ...p, gender: "", education: "" }, episodes: s.episodes.map((e) => ({ ...e, tags: [] })) })));
check("orders: orthopaedics, cause to be determined, no new medicine, no tests", knee.visit!.department === "Orthopaedics" && /cause to be determined/.test(knee.visit!.diagnosis) && /No new medicine/.test(knee.visit!.treatment) && /no tests/.test(knee.visit!.treatment));
check("orders: seen today at 10:00", knee.visit!.date === zh.episodes[0].visit!.date && /10:00/.test(knee.visit!.archiveSummary ?? ""));
const fu = new Date(knee.visit!.followUpAt!);
check("follow-up in 7 days, 11 Oct 09:30", fu.getMonth() === 9 && fu.getDate() === 11 && fu.getHours() === 9 && fu.getMinutes() === 30);
check("follow-up: bring previous records and medicine boxes", /previous records/.test(knee.visit!.followUp!) && /medicine boxes/.test(knee.visit!.followUp!));
check("still tracked after the visit", knee.status === "active");

check("two once reminders", s.reminders.length === 2 && s.reminders.every((r) => r.frequency === "once" && r.enabled));
const r1 = new Date(s.reminders[0].at!);
const r2 = new Date(s.reminders[1].at!);
check("10 Oct 20:00, the evening before: prepare records and medicine boxes", s.reminders[0].text === "Prepare records and medicine boxes" && r1.getDate() === 10 && r1.getHours() === 20 && r1.getMinutes() === 0);
check("11 Oct 08:30: follow-up prep", /^Follow-up prep/.test(s.reminders[1].text) && r2.getDate() === 11 && r2.getHours() === 8 && r2.getMinutes() === 30);
check("no medicine reminder", s.reminders.every((r) => r.kind !== "medicine"));
check("no temperature invented", !s.episodes.some((e) => e.entries.some((x) => x.temp != null)));

// the same story in both languages: ids, dates, numbers and structure match
const ids = (x: unknown) => (JSON.stringify(x).match(/"(id|todoId|episodeId)":"[^"]*"/g) ?? []).join();
check("ids identical between zh and en", ids(s) === ids(zh) && ids(s).length > 0 && s.episodes.map((e) => e.relatedEpisodeIds.join()).join() === zh.episodes.map((e) => e.relatedEpisodeIds.join()).join(), ids(s));
check("ids fixed across builds", ids(buildLinState(new Date(2026, 0, 1), "zh")) === ids(zh));
const shape = (x: typeof s) =>
  JSON.stringify(x, (k, v) => (typeof v === "string" && !/^\d{4}-\d\d-\d\d(T|$)/.test(v) && !/^lin-/.test(v) && !["role", "kind", "status", "source", "mode", "frequency", "demo"].includes(k) ? "" : v));
check("same structure, dates and times in both languages", shape(s) === shape(zh));
check("default language is Chinese", buildLinState(now).profile!.name === "林叔");


// 规则引擎（中文）读英文记录时，也不能把「No clear diagnosis」当成诊断
{
  const en = buildLinState(new Date(2026, 9, 4, 9, 0), "en");
  const knee = en.episodes.find((e) => e.id === "lin-knee")!;
  const may = en.episodes.find((e) => e.id === "lin-may")!;
  const sum = summaryForEn({ profile: en.profile!, episode: knee, related: [{ title: may.title, date: "2026-05-12", diagnosis: may.visit!.diagnosis }] }).summary;
  check("English record: 'No clear diagnosis' is not named as the earlier diagnosis", !sum.glance.some((g) => g.includes("当时是No")) && !sum.questionsForDoctor.some((q) => q.includes("「No clear diagnosis」")), [sum.glance, sum.questionsForDoctor]);
}
finish("demo-lin-en");
