import { NextResponse } from "next/server";
import { accountBySession, readPatientData, SESSION_COOKIE, writePatientData } from "@/lib/server/secure-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function caller(req: Request) {
  const token = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`))?.[1];
  return accountBySession(token);
}

/** 读当前登录患者自己的数据。没有任何 id 参数——你只能读到你自己。 */
export async function GET(req: Request) {
  const account = caller(req);
  if (!account) return NextResponse.json({ error: "未登录。" }, { status: 401 });
  const { state, version } = readPatientData(account.id);
  return NextResponse.json({ state, version });
}

/** 写当前登录患者自己的数据（整体替换，带乐观并发版本号）。 */
export async function PUT(req: Request) {
  const account = caller(req);
  if (!account) return NextResponse.json({ error: "未登录。" }, { status: 401 });
  let body: { state?: unknown; baseVersion?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式不对。" }, { status: 400 });
  }
  const baseVersion = typeof body.baseVersion === "number" ? body.baseVersion : -1;
  if (baseVersion < 0) return NextResponse.json({ error: "缺少 baseVersion。" }, { status: 400 });
  const res = writePatientData(account.id, body.state ?? null, baseVersion);
  if (!res.ok) {
    const cur = readPatientData(account.id);
    return NextResponse.json({ error: "conflict", version: cur.version, state: cur.state }, { status: 409 });
  }
  return NextResponse.json({ ok: true, version: res.version });
}
