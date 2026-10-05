/*
 * Danger signs are decided by rule and must not be missed, whatever the interface language:
 * English phrasings of the same signs as the Chinese list, and Chinese typed while the interface is English.
 * Run with: npx tsx scripts/tests/danger-en.test.ts
 */
import { check, finish } from "./_check";
import { setLang } from "../../src/lib/lang";
import { detectUrgent, fallbackChat, instantAlert, urgentZhInEnglish } from "../../src/lib/ai/fallback";
import { urgentEn } from "../../src/lib/ai/fallbackEn";

const urgent = (h: { level: string } | null) => h?.level === "urgent";
const zh = (h: { text: string } | null) => /[一-鿿]/.test(h?.text ?? "");

// English wordings
for (const s of [
  "My stool was black like tar this morning and I feel dizzy.",
  "black, tarry poo since last night",
  "My poop is black.",
  "I have tar-like stools.",
  "I threw up blood.",
  "There is blood in my vomit.",
  "bloody diarrhoea all day",
  "I'm passing blood when I go to the toilet.",
  "bleeding won't stop",
  "I have chest pain.",
  "My chest feels tight and heavy.",
  "crushing chest pain and I can't catch my breath",
  "My lips are turning blue.",
  "He collapsed and blacked out.",
  "My mouth is drooping on one side.",
  "I can't lift my left arm.",
  "fever of 103 F",
  "the pain is like a knife",
  "swelling of my tongue after the pill",
]) check(`en: "${s}" is a danger sign`, urgent(urgentEn(s)), urgentEn(s));

// negations stay quiet
for (const s of ["No chest pain.", "I don't have black stool.", "never vomited blood", "not short of breath"]) {
  check(`en: "${s}" is not raised`, !urgent(urgentEn(s)), urgentEn(s));
}
check("en: an ordinary headache is not raised", !urgent(urgentEn("I have had a mild headache since yesterday.")));

// Chinese typed while the interface is English: still caught, said in English
setLang("en");
for (const s of ["胸口压着痛，喘不上气", "早上大便是黑色的，像柏油", "今天吐血了", "半边身子麻，说话不清"]) {
  const h = instantAlert(s);
  check(`en UI, Chinese input "${s}": raised, in English`, urgent(h) && !zh(h), h);
  const d = detectUrgent(s);
  check(`en UI, Chinese input "${s}": the server check too`, urgent(d) && !zh(d), d);
}
check("en UI, Chinese negation 「没有胸痛」 not raised", !urgent(instantAlert("没有胸痛，就是有点累")));
const iso = (h: number) => new Date(Date.now() - h * 3600e3).toISOString();
const profile = { name: "T", gender: "男" as const, birthYear: 1960, conditions: [], allergies: [], medications: [], surgeries: [], familyHistory: [], createdAt: iso(9), updatedAt: iso(9) };
const episode = { title: "Pain", tags: [], status: "active" as const, startedAt: iso(3), entries: [] };
const reply = fallbackChat({ kind: "intake", profile, episode, related: [], messages: [{ role: "user", content: "大便是黑色的，像柏油一样" }] } as never);
check("en UI, rule chat: Chinese danger sign gives the red note in English", urgent(reply.hint) && !zh(reply.hint) && reply.done === false, reply);
const reply2 = fallbackChat({ kind: "intake", profile, episode, related: [], messages: [{ role: "user", content: "My stool was black like tar this morning." }] } as never);
check("en UI, rule chat: English black stool gives the red note", urgent(reply2.hint), reply2.hint);
check("urgentZhInEnglish: every Chinese sign has English", urgent(urgentZhInEnglish("怀孕三个月，今天出血了")) && !zh(urgentZhInEnglish("怀孕三个月，今天出血了")));

// Chinese interface: unchanged, Chinese warning
setLang("zh");
const zhAlert = instantAlert("胸口压着痛，喘不上气");
check("zh UI: unchanged, Chinese warning", urgent(zhAlert) && zh(zhAlert), zhAlert);
check("zh UI: English input still caught", urgent(instantAlert("I vomited blood")), instantAlert("I vomited blood"));

finish("danger-en");
