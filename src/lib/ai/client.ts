import type {
  AfterRequest,
  AfterResponse,
  AnnualRequest,
  AnnualResponse,
  AskRequest,
  AskResponse,
  ChatRequest,
  ChatResponse,
  CheckupResponse,
  ProfileParseResponse,
  SummaryRequest,
  SummaryResponse,
} from "../types";
import { fallbackAfter, fallbackAnnual, fallbackChat, fallbackProfile, fallbackSummary } from "./fallback";
import { fallbackAsk } from "./askRules";
import { getLang, inChinese } from "../lang";
import type { Lang } from "../types";

/**
 * The language the server is asked to answer in: the language of the interface. In English the
 * assistant asks, answers and writes everything in English, and what it writes is stored in English;
 * the danger-signal checks have an English set (fallbackEn.ts) so the safety net stays in place.
 */
function serverLang(): Lang {
  return getLang();
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...(body as object), lang: serverLang() }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function askAI(req: ChatRequest): Promise<ChatResponse> {
  try {
    return await post<ChatResponse>("/api/chat", req);
  } catch (err) {
    console.warn("[医伴] /api/chat 不可用，使用本地规则引擎", err);
    // the rules answer in the language of the interface (fallbackChat picks the English ones itself)
    return { ...fallbackChat(req), error: String(err) };
  }
}

export async function generateSummary(req: SummaryRequest): Promise<SummaryResponse> {
  try {
    return await post<SummaryResponse>("/api/summary", req);
  } catch (err) {
    console.warn("[医伴] /api/summary 不可用，使用本地规则引擎", err);
    return { ...fallbackSummary(req), error: String(err) };
  }
}

export async function generateAnnual(req: AnnualRequest): Promise<AnnualResponse> {
  try {
    return await post<AnnualResponse>("/api/annual", req);
  } catch (err) {
    console.warn("[医伴] /api/annual 不可用，使用本地规则引擎", err);
    return { ...inChinese(() => fallbackAnnual(req)), error: String(err) };
  }
}

/** 问医伴: one question about the person's own health, answered from their records. */
export async function askQuestion(req: AskRequest): Promise<AskResponse> {
  try {
    return await post<AskResponse>("/api/ask", req);
  } catch (err) {
    console.warn("[医伴] /api/ask 不可用，使用本地规则引擎", err);
    return { ...inChinese(() => fallbackAsk(req)), error: String(err) };
  }
}

/** Thrown when photos could not be read. There is no rule-based way to read a picture. */
export class PhotoError extends Error {
  constructor(public readonly reason: "unavailable" | "unreadable" | "failed") {
    super(`photo-${reason}`);
    this.name = "PhotoError";
  }
}

/** Turns what the doctor said (told in words, or photographed) into an archive record. */
export async function organizeVisit(req: AfterRequest): Promise<AfterResponse> {
  const photos = Boolean(req.images?.length);
  try {
    const res = await fetch("/api/after", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...req, lang: serverLang() }),
    });
    const data = (await res.json()) as AfterResponse & { reason?: PhotoError["reason"] };
    if (!res.ok) {
      if (photos) throw new PhotoError(data.reason ?? "failed");
      throw new Error(`HTTP ${res.status}`);
    }
    return data;
  } catch (err) {
    if (err instanceof PhotoError) throw err;
    if (photos && !req.text) throw new PhotoError("failed");
    console.warn("[医伴] /api/after 不可用，使用本地规则引擎", err);
    return { ...inChinese(() => fallbackAfter(req)), error: String(err) };
  }
}

/** Reads photos of a check-up report into profile fields. Throws PhotoError when it cannot. */
export async function readCheckup(images: string[]): Promise<CheckupResponse> {
  try {
    const res = await fetch("/api/checkup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images, lang: serverLang() }),
    });
    const data = (await res.json()) as CheckupResponse & { reason?: PhotoError["reason"] };
    if (!res.ok) throw new PhotoError(data.reason ?? "failed");
    return data;
  } catch (err) {
    if (err instanceof PhotoError) throw err;
    console.warn("[医伴] /api/checkup 不可用", err);
    throw new PhotoError("failed");
  }
}

export async function parseProfile(text: string): Promise<ProfileParseResponse> {
  try {
    return await post<ProfileParseResponse>("/api/profile", { text });
  } catch (err) {
    console.warn("[医伴] /api/profile 不可用，使用本地规则引擎", err);
    return { ...inChinese(() => fallbackProfile(text)), error: String(err) };
  }
}

/** Speech to text for one clip of at most 30 seconds (16 kHz mono WAV). */
export async function transcribeClip(wav: Blob): Promise<string> {
  const form = new FormData();
  form.append("file", wav, "speech.wav");
  const res = await fetch("/api/transcribe", { method: "POST", body: form });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}

export interface AiHealth {
  configured: boolean;
  model: string;
  visionModel?: string;
  speechModel?: string;
  ok?: boolean;
  latencyMs?: number;
  error?: string;
}

export async function aiHealth(ping = false): Promise<AiHealth> {
  try {
    const res = await fetch(`/api/health${ping ? "?ping=1" : ""}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as AiHealth;
  } catch (err) {
    return { configured: false, model: "", error: String(err) };
  }
}
