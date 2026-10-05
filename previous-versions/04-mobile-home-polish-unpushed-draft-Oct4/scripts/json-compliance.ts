/* Measures how often GLM answers a chat turn with plain text instead of JSON, for three prompt variants. */
import fs from "node:fs";
import { buildChatMessages } from "../src/lib/ai/prompts";
import type { ChatRequest } from "../src/lib/types";

const KEY = fs.readFileSync(".env.local", "utf8").match(/GLM_API_KEY=(.+)/)![1].trim();
const iso = (h: number) => new Date(Date.now() - h * 3600e3).toISOString();

const req: ChatRequest = {
  kind: "followup",
  profile: { name: "陈浩", gender: "男", birthYear: 1998, conditions: [], allergies: [], medications: [], surgeries: [], familyHistory: [], createdAt: iso(1), updatedAt: iso(1) },
  episode: { title: "喉咙痛", tags: ["耳鼻喉", "咽痛"], status: "active", startedAt: iso(20), entries: [{ id: "1", at: iso(1), severity: 5, note: "喉咙痛，昨晚开始，低烧 37.8", location: null, source: "user" }] },
  related: [],
  messages: [
    { role: "user", content: "喉咙痛，昨天开始的，现在大概 5 分。早上量了 37.8 度，浑身没劲。" },
    { role: "assistant", content: "喉咙痛加低烧确实难受，我帮你记下来。吞口水的时候会更痛吗？" },
    { role: "user", content: "吞口水疼" },
    { role: "assistant", content: "记下了，吞咽时疼。有没有咳嗽、鼻塞或者流鼻涕？" },
    { role: "user", content: "没有咳嗽" },
    { role: "assistant", content: "好的，没有咳嗽。到现在有没有吃过什么药？" },
    { role: "user", content: "没吃药，有点怕冷" },
    { role: "assistant", content: "怕冷加上低烧，我都记下了。以前有没有过类似的情况？" },
    { role: "user", content: "以前有过" },
    { role: "assistant", content: "好的，以前也发作过类似的。这些我都记录好了，有变化随时告诉我。" },
    { role: "user", content: "【定时记录】现在 7 分：烧到38.5度，开始咳嗽了" },
    { role: "assistant", content: "比之前加重了，发烧和咳嗽都记下了。还有其他新的不舒服吗？" },
    { role: "user", content: process.env.LAST || "没有其他症状" },
  ],
};

const base = buildChatMessages(req);
const variants: Record<string, typeof base> = {
  "A current": base,
  "B reminder after last user turn": base.map((m, i) => (i === base.length - 1 ? { ...m, content: `${m.content}\n\n（请只输出一个 JSON 对象，不要输出其他文字）` } : m)),
};

async function once(messages: typeof base) {
  const res = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "glm-5", messages, temperature: 0.5, max_tokens: 700, thinking: { type: "disabled" }, response_format: { type: "json_object" } }),
  });
  const j = await res.json();
  const content: string = j?.choices?.[0]?.message?.content ?? "";
  try {
    const s = content.trim();
    const o = JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1));
    return { ok: true, keys: Object.keys(o).join(","), hasEntry: o.entry != null, content };
  } catch {
    return { ok: false, keys: "", hasEntry: false, content };
  }
}

async function main() {
  const N = Number(process.env.N || 8);
  for (const [name, messages] of Object.entries(variants)) {
    const results = [];
    for (let i = 0; i < N; i += 4) results.push(...(await Promise.all(Array.from({ length: Math.min(4, N - i) }, () => once(messages)))));
    const ok = results.filter((r) => r.ok);
    const full = ok.filter((r) => r.keys.includes("entry") && r.keys.includes("suggestedReplies"));
    console.log(`\n${name}: JSON ${ok.length}/${N}, with full schema ${full.length}/${N}, with a non-null entry ${ok.filter((r) => r.hasEntry).length}/${N}`);
    const bad = results.find((r) => !r.ok);
    if (bad) console.log(`  plain-text example: ${bad.content.slice(0, 70)}`);
    const partial = ok.find((r) => !full.includes(r));
    if (partial) console.log(`  partial-schema example keys: ${partial.keys}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
