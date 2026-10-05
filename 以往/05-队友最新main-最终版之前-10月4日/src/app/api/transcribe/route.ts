import { NextResponse } from "next/server";
import { glmAsrConfigured, glmTranscribe } from "@/lib/ai/glm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 30 seconds of 16 kHz mono 16-bit audio is about 1 MB.
const MAX_BYTES = 3_000_000;

/** Speech to text for one short clip. The browser sends 16 kHz mono WAV, at most 30 seconds. */
export async function POST(req: Request) {
  if (!glmAsrConfigured()) return NextResponse.json({ error: "语音识别需要先配置 AI" }, { status: 503 });
  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    file = f instanceof File ? f : null;
  } catch {
    return NextResponse.json({ error: "请求体不是合法的表单" }, { status: 400 });
  }
  if (!file || file.size === 0) return NextResponse.json({ error: "缺少录音" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "录音太长" }, { status: 413 });
  try {
    const text = await glmTranscribe(file, "speech.wav");
    return NextResponse.json({ text });
  } catch (err) {
    console.error("[医伴] 语音识别失败：", err);
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
