/** Server-side client for the Zhipu GLM OpenAI-compatible chat API. */

export interface GlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function baseUrl() {
  return (process.env.GLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4").replace(/\/$/, "");
}

export function glmModel() {
  return process.env.GLM_MODEL || "glm-5";
}

export function glmConfigured() {
  return Boolean(process.env.GLM_API_KEY && process.env.GLM_API_KEY.trim());
}

/** The model answered, but not in JSON. `content` is what it said. */
export class GlmFormatError extends Error {
  readonly content: string;
  constructor(content: string) {
    super("GLM 返回的不是 JSON");
    this.name = "GlmFormatError";
    this.content = content;
  }
}

export function parseJSONContent<T>(content: string): T {
  let s = content.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  return JSON.parse(s) as T;
}

export async function glmJSON<T>(
  messages: GlmMessage[],
  opts: { temperature?: number; maxTokens?: number; timeoutMs?: number } = {},
): Promise<T> {
  const key = process.env.GLM_API_KEY;
  if (!key) throw new Error("GLM_API_KEY 未配置");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 90_000);
  try {
    const res = await fetch(`${baseUrl()}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: glmModel(),
        messages,
        temperature: opts.temperature ?? 0.5,
        max_tokens: opts.maxTokens ?? 800,
        thinking: { type: "disabled" },
        response_format: { type: "json_object" },
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GLM ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data?.choices?.[0]?.message?.content ?? "";
    if (!content) throw new Error("GLM 返回为空");
    try {
      return parseJSONContent<T>(content);
    } catch {
      throw new GlmFormatError(content);
    }
  } finally {
    clearTimeout(timer);
  }
}

/** For documents that must be structured: one more try when the model ignores the format. */
export async function glmJSONWithRetry<T>(
  messages: GlmMessage[],
  opts: { temperature?: number; maxTokens?: number; timeoutMs?: number } = {},
): Promise<T> {
  try {
    return await glmJSON<T>(messages, opts);
  } catch (err) {
    if (!(err instanceof GlmFormatError)) throw err;
    return glmJSON<T>(messages, opts);
  }
}

export async function glmPing(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    await glmJSON<{ ok: boolean }>(
      [
        { role: "system", content: '只输出 JSON：{"ok": true}' },
        { role: "user", content: "ping" },
      ],
      { maxTokens: 20, timeoutMs: 20_000 },
    );
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: String(err) };
  }
}

/* ---------- photos and speech ---------- */

export function glmVisionModel() {
  return process.env.GLM_VISION_MODEL || "glm-4.6v";
}

export function glmAsrModel() {
  return process.env.GLM_ASR_MODEL || "glm-asr-2512";
}

/** Reads one or more photos (data URLs) with the vision model and returns its JSON answer. */
export async function glmVisionJSON<T>(prompt: string, images: string[], opts: { maxTokens?: number } = {}): Promise<T> {
  const key = process.env.GLM_API_KEY;
  if (!key) throw new Error("GLM_API_KEY 未配置");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000);
  try {
    const res = await fetch(`${baseUrl()}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: glmVisionModel(),
        temperature: 0.1,
        max_tokens: opts.maxTokens ?? 1200,
        thinking: { type: "disabled" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              ...images.map((url) => ({ type: "image_url", image_url: { url } })),
            ],
          },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`GLM vision ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data?.choices?.[0]?.message?.content ?? "";
    if (!content) throw new Error("GLM vision 返回为空");
    try {
      return parseJSONContent<T>(content);
    } catch {
      throw new GlmFormatError(content);
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Speech to text. The service accepts WAV or MP3, at most 30 seconds per request. */
export async function glmTranscribe(file: Blob, filename = "speech.wav"): Promise<string> {
  const key = process.env.GLM_API_KEY;
  if (!key) throw new Error("GLM_API_KEY 未配置");
  const form = new FormData();
  form.append("model", glmAsrModel());
  form.append("stream", "false");
  form.append("file", file, filename);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const res = await fetch(`${baseUrl()}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`GLM asr ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { text?: string };
    return (data.text ?? "").trim();
  } finally {
    clearTimeout(timer);
  }
}
