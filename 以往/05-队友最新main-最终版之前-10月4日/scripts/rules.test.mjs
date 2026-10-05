// Assertions for the keyless rule engine, exercised through the real /api routes.
// Start a server without a key first:  GLM_API_KEY= npx next start -p 3001
const base = process.env.BASE || "http://localhost:3001";
const iso = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const profile = { name: "李明", gender: "男", birthYear: 1990, conditions: ["慢性胃炎"], allergies: ["青霉素"], medications: [], surgeries: [], familyHistory: [], createdAt: iso(100), updatedAt: iso(100) };
const entries = [{ id: "e1", at: iso(30), severity: 5, note: "晚饭后隐痛", location: null, source: "user" }];
const episode = { title: "肚子痛", tags: ["腹部", "疼痛"], status: "active", startedAt: iso(31), entries };
const post = async (path, body) => {
  const res = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};
const talk = async (messages, kind = "followup", ep = episode) => (await post("/api/chat", { kind, profile, episode: ep, related: [], messages })).body;
const chat = (text, kind = "followup") =>
  talk([{ role: "user", content: "肚子痛，昨天开始的，现在大概 5 分。" }, { role: "assistant", content: "记下了。" }, { role: "user", content: text }], kind);

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  -> " + JSON.stringify(detail)}`);
};

/* ---------- danger signals ---------- */
let r = await chat("今天早上大便是黑色的，像柏油一样，而且有点头晕。");
check("black stool raises an urgent hint", r.mode === "fallback" && r.hint?.level === "urgent", r.hint);
check("black stool does not invent a score", r.entry?.severity == null, r.entry);

r = await chat("有一点反酸，没有吐。吃完饭更痛。");
check("trigger wording is not read as a severity change", r.entry?.severity == null, r.entry);
check("negated vomiting is not tagged", !r.tags.includes("呕吐"), r.tags);
check("reflux is tagged", r.tags.includes("反酸"), r.tags);
check("no alarm for an ordinary update", r.hint == null, r.hint);

r = await chat("没有胸痛，也不发烧，就是肚子不舒服。");
check("negated chest pain does not raise an alarm", r.hint?.level !== "urgent", r.hint);

r = await chat("胸口很闷，喘不上气。");
check("chest tightness with breathlessness is urgent", r.hint?.level === "urgent", r.hint);

r = await chat("说话有点口齿不清，右边半边身子无力");
check("stroke signs are urgent", r.hint?.level === "urgent", r.hint);

r = await chat("吃了海鲜之后嘴唇肿了，全身起疹子");
check("allergic reaction is urgent", r.hint?.level === "urgent", r.hint);

/* ---------- how bad it is: only what the user said ---------- */
r = await chat("好多了");
check("short relative answer lowers the estimate", r.entry?.severity === 3 && r.entry.exact === false, r.entry);

r = await chat("更严重了");
check("short relative answer raises the estimate", r.entry?.severity === 7, r.entry);
check("更严重了 gets a clear 'see a doctor today'", r.hint?.level === "warn" && r.hint.text.includes("今天去看医生"), r.hint);

r = await chat("【定时记录】现在 9 分：痛得受不了", "checkin");
check("a stated 9 is urgent and marked as the user's own score", r.hint?.level === "urgent" && r.entry?.severity === 9 && r.entry.exact === true, { hint: r.hint, entry: r.entry });

r = await chat("肚脐上面一点隐隐作痛，大概 6 分");
check("explicit score is read", r.entry?.severity === 6 && r.entry.exact === true, r.entry);
check("concrete location is extracted", typeof r.entry?.location === "string" && r.entry.location.startsWith("肚脐"), r.entry);

r = await chat("比较难受");
check("a three-level answer is understood without a number", r.entry?.severity === 6 && r.entry.exact === false, r.entry);

/* ---------- readings said in the conversation ---------- */
r = await chat("今天早上空腹血糖 6.2，血压 126/78，脚还是麻。");
check("stated fasting glucose and blood pressure are captured", JSON.stringify(r.measurements) === JSON.stringify([{ type: "fbg", value: 6.2, value2: null }, { type: "bp", value: 126, value2: 78 }]), r.measurements);
check("in-range readings raise no alarm", r.hint?.level !== "urgent", r.hint);

r = await chat("刚才散步回来手抖出汗，测了血糖 3.4。");
check("a stated glucose of 3.4 is captured as a non-fasting reading", r.measurements?.[0]?.type === "ppg" && r.measurements?.[0]?.value === 3.4, r.measurements);
check("low glucose in chat is urgent and says to eat sugar", r.hint?.level === "urgent" && r.hint.text.includes("15 克"), r.hint);

r = await chat("脚麻大概 4 分，没什么变化。");
check("a severity score is not mistaken for a reading", Array.isArray(r.measurements) && r.measurements.length === 0, r.measurements);

r = await chat("【定时记录】现在 7 分：烧到38.5度，开始咳嗽了", "checkin");
check("a fever of 38.5 gets a clear 'see a doctor today'", r.hint?.level === "warn" && r.hint.text.includes("今天去看医生") && r.reply.includes("38.5"), { reply: r.reply, hint: r.hint });
check("the temperature is recorded as a temperature", r.entry?.temperature === 38.5, r.entry);
check("it does not ask whether there is a fever right after being told", !/有没有.*发烧/.test(r.reply), r.reply);
check("it never tells a user who has a fever to come back 'if a fever appears'", !/如果.*出现发热/.test(r.reply + (r.hint?.text ?? "")), r.reply);

r = await talk([
  { role: "user", content: "散步回来手抖出冷汗，测了血糖 3.5。" },
  { role: "assistant", content: "血糖 3.5 属于低血糖，请现在吃糖，15 分钟后复测。" },
  { role: "user", content: "复测了血糖" },
]);
check("after a low reading, 'I re-tested' is followed by asking for the number", /多少/.test(r.reply) && !/隐痛|绞痛/.test(r.reply), r.reply);

/* ---------- the conversation: one question at a time, until missing information is covered ---------- */
const sore = { title: "喉咙痛", tags: [], status: "active", startedAt: iso(0), entries: [] };
r = await talk([{ role: "user", content: "喉咙痛，昨晚开始的，吞口水疼" }], "intake", sore);
check("the first turn names the symptom and when it began", r.title === "喉咙痛" && r.onsetHoursAgo >= 2 && r.onsetHoursAgo <= 27, { title: r.title, onset: r.onsetHoursAgo });
check("the first turn asks one question and is not done", r.done === false && (r.reply.match(/[?？]/g) ?? []).length === 1, r.reply);
check("the first question is not about when it began", !/什么时候开始/.test(r.reply), r.reply);
const ASSOCIATED = "还有别的不舒服吗？比如发烧、恶心、头晕？";
r = await talk(
  [
    { role: "user", content: "喉咙痛，昨晚开始的，吞口水疼，有点难受。" },
    { role: "assistant", content: `记下了。${ASSOCIATED}` },
    { role: "user", content: "没有别的" },
  ],
  "followup",
  sore,
);
check("a question that was already asked is not asked again", !r.reply.includes(ASSOCIATED), r.reply);
check("'nothing else' is retained as the patient's answer without invented readings", r.entry?.note === "其他不舒服：没有别的" && r.entry.severity == null && r.entry.temperature == null && r.entry.location == null, r.entry);

r = await talk(
  [
    { role: "user", content: "右膝内侧胀痛三天了，比较难受，上下楼的时候更疼，休息一下会好一点，没有肿也没有别的不舒服，贴了膏药，以前没这样过" },
  ],
  "intake",
  { ...sore, title: "膝盖疼" },
);
check("when everything was said in one sentence, nothing more is asked", r.done === true && !/[?？]/.test(r.reply), r.reply);

const four = [1, 2, 3, 4].flatMap((i) => [{ role: "assistant", content: `问题 ${i}？` }, { role: "user", content: "嗯" }]);
r = await talk([{ role: "user", content: "头晕" }, ...four], "followup", sore);
check("missing information is still asked after four questions", r.done === false && (r.reply.match(/[?？]/g) ?? []).length === 1, r.reply);

const uncertain = [{ role: "user", content: "膝盖疼" }];
const knee = { ...sore, title: "膝盖疼" };
const asked = [];
for (let turn = 0; turn < 12; turn++) {
  r = await talk(uncertain, turn === 0 ? "intake" : "followup", knee);
  if (r.done) break;
  asked.push(r.reply);
  uncertain.push({ role: "assistant", content: r.reply }, { role: "user", content: "不清楚" });
}
check("uncertain answers reach a completed account without repeating a question", r.done === true && asked.length >= 7 && new Set(asked).size === asked.length, { done: r.done, asked });

const seen = { ...episode, visit: { date: "2026-10-01", department: "消化内科", diagnosis: "急性胃炎", treatment: "奥美拉唑" } };
r = await talk([{ role: "user", content: "肚子痛" }, { role: "assistant", content: "记下了。" }, { role: "user", content: "更严重了" }], "followup", seen);
check("someone who has seen a doctor is told to go back, not to go 'today'", r.hint?.text.includes("再去看一次医生"), r.hint);

/* ---------- what is handed to the doctor ---------- */
const full = { ...episode, id: "x", createdAt: iso(31), updatedAt: iso(1), lastCheckInAt: iso(1), messages: [{ id: "m1", role: "user", content: "肚子痛，昨天开始的", at: iso(30), kind: "intake" }], relatedEpisodeIds: [] };
let s = await post("/api/summary", { profile, episode: full, related: [] });
check("a summary is produced without a key, with lines for the first screen", s.body.mode === "fallback" && Array.isArray(s.body.summary.glance) && s.body.summary.glance.length >= 2 && s.body.summary.glance[0].includes("肚子痛"), s.body.summary?.glance);
check("the summary always carries the allergy", s.body.summary.relevantHistory.some((x) => x.includes("青霉素")), s.body.summary.relevantHistory);

const facts = { periodStart: iso(8760), periodEnd: iso(0), hba1c: [{ at: iso(8000), value: 8.5 }, { at: iso(2000), value: 6.8 }], fbgMonthly: [{ month: "2025-11", label: "11月", count: 7, avg: 9.7, min: 9.6, max: 9.9 }, { month: "2026-09", label: "9月", count: 13, avg: 6.5, min: 6.1, max: 6.9 }], weight: [{ at: iso(8000), value: 72 }, { at: iso(100), value: 67.2 }], bp: [], lows: [{ at: iso(2600), value: 3.6, note: "散步后" }], insights: [], followUps: [{ id: "f1", date: "2026-01-12", reason: "3 个月复查", findings: "糖化 7.6%", plan: "二甲双胍加量", recordedAt: iso(6000) }], episodes: [{ title: "脚麻", status: "active", startedAt: iso(576), firstNote: "双脚发麻", lastNote: "夜里更明显", peakSeverity: 4, lastSeverity: 4, hint: "请在复诊时告诉医生", visit: null }] };
const a = (await post("/api/annual", { profile, facts })).body;
check("yearly summary is produced without a key", a.mode === "fallback" && a.summary.headline.includes("8.5") && a.summary.headline.includes("6.8"), a.summary?.headline);
check("yearly summary has lines for the first screen", a.summary.glance.length >= 2 && a.summary.glance.some((g) => g.includes("脚麻")), a.summary.glance);
check("yearly summary lists the active symptom as a current concern", a.summary.currentConcerns.some((c) => c.includes("脚麻")), a.summary.currentConcerns);
check("yearly summary carries the medication change and the low reading", a.summary.medicationChanges.some((m) => m.change.includes("加量")) && a.summary.keyEvents.some((e) => e.event.includes("3.6")), { m: a.summary.medicationChanges, e: a.summary.keyEvents });
check("yearly summary rejects a request without facts", (await post("/api/annual", { profile })).status === 400);

/* ---------- after the visit ---------- */
let v = await post("/api/after", { profile, episode: sore, text: "医生说是急性咽炎，开了头孢和布洛芬，让多喝水，三天不退烧再去。" });
check("what the doctor said is organised without a key", v.body.mode === "fallback" && v.body.result.diagnosis === "急性咽炎" && v.body.result.medications.length === 2 && v.body.result.followUpDays === 3, v.body.result);
check("the archive paragraph names the symptom and the diagnosis", v.body.result.summary.includes("喉咙痛") && v.body.result.summary.includes("急性咽炎"), v.body.result?.summary);
v = await post("/api/after", { profile, episode: null, images: ["data:image/jpeg;base64,AAAA"] });
check("a photo without a key is refused with a reason the page can explain", v.status === 503 && v.body.reason === "unavailable", v);
v = await post("/api/after", { profile, episode: null });
check("an empty request is rejected", v.status === 400, v.status);
v = await post("/api/after", { profile, episode: null, images: ["javascript:alert(1)"] });
check("something that is not a photo is rejected", v.status === 400, v.status);

/* ---------- one sentence into a profile ---------- */
let p = await post("/api/profile", { text: "有高血压，对青霉素过敏，每天吃一片降压药" });
check("a profile sentence is split without a key", p.body.mode === "fallback" && p.body.conditions[0] === "高血压" && p.body.allergies[0] === "青霉素" && p.body.medications.length === 1, p.body);
check("an empty profile sentence is rejected", (await post("/api/profile", { text: " " })).status === 400);

/* ---------- speech ---------- */
const form = new FormData();
form.append("file", new Blob([new Uint8Array(64)], { type: "audio/wav" }), "speech.wav");
const t = await fetch(base + "/api/transcribe", { method: "POST", body: form });
check("speech without a key is refused, so the page hides the microphone", t.status === 503, t.status);
const h = await (await fetch(base + "/api/health")).json();
check("the health check reports no key", h.configured === false, h);

/* ---------- 问医伴 without a key ---------- */
const records = [
  { id: "R1", kind: "visit", label: "9月30日 看医生（肚子痛）", href: "/episodes/x/detail", date: "2026-09-30T12:00:00", text: "2026年9月30日 因为「肚子痛」看医生（市第一人民医院 消化内科）；诊断：急性胃炎；开的药和处理：奥美拉唑肠溶胶囊 20mg 每日一次，餐前服用；医生叮嘱：清淡饮食；复查：两周后复诊", fields: { reason: "因为「肚子痛」", where: "市第一人民医院 消化内科", diagnosis: "急性胃炎", treatment: "奥美拉唑肠溶胶囊 20mg 每日一次，餐前服用", advice: "清淡饮食", followUp: "两周后复诊" } },
  { id: "P", kind: "profile", label: "我的档案", href: "/me", date: "", text: "档案；老毛病：慢性胃炎；过敏：青霉素；长期在吃的药：没有写" },
];
const askIt = async (question, extra = {}) => (await post("/api/ask", { profile, question, history: [], records, ...extra })).body;
let q = await askIt("上次医生说了什么？");
check("'what did the doctor say' is answered by quoting the record", q.mode === "fallback" && q.answer.includes("急性胃炎") && q.answer.includes("奥美拉唑肠溶胶囊 20mg 每日一次") && q.answer.includes("清淡饮食") && JSON.stringify(q.sources) === '["R1"]', q);
q = await askIt("我对什么过敏？");
check("the allergy question quotes the profile", q.answer.includes("青霉素") && JSON.stringify(q.sources) === '["P"]', q);
q = await askIt("什么时候去复查？");
check("the follow-up question quotes what the doctor said about coming back", q.answer.includes("两周后复诊") && q.sources.includes("R1"), q);
q = await askIt("奥美拉唑怎么吃？");
check("a medicine question quotes the prescription and points to the label", q.answer.includes("20mg 每日一次") && q.answer.includes("说明书") && q.sources.includes("R1"), q);
q = await askIt("布洛芬怎么吃？");
check("a medicine that is not on file gets no made-up dose", !/\d+\s*(mg|毫克|片|粒)/.test(q.answer.replace("20mg", "")) || q.answer.includes("奥美拉唑"), q.answer);
q = await askIt("我现在胸口很闷，喘不上气，怎么办？");
check("a question that describes an emergency raises the alarm by rule", q.hint?.level === "urgent" && q.hint.text.includes("120"), q.hint);
q = await askIt("今天天气怎么样？");
check("an unmatched question asks for rephrasing without guessing", q.mode === "fallback" && q.sources.length === 0 && q.answer === "我还没理解你的意思，可以换一种说法，或补充一点具体情况吗？", q.answer);
check("an empty question is rejected", (await post("/api/ask", { profile, question: " ", records })).status === 400);

/* ---------- a check-up report without a key ---------- */
let c = await post("/api/checkup", { images: ["data:image/jpeg;base64,AAAA"] });
check("a check-up photo without a key is refused with a reason the page can explain", c.status === 503 && c.body.reason === "unavailable", c);
c = await post("/api/checkup", { images: [] });
check("a check-up request without photos is rejected", c.status === 400, c.status);
c = await post("/api/checkup", { images: ["javascript:alert(1)"] });
check("something that is not a photo is rejected for a check-up too", c.status === 400, c.status);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
