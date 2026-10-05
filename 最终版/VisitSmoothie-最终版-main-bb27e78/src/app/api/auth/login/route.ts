import { NextResponse } from "next/server";
import { createSession, SESSION_COOKIE, verifyLogin } from "@/lib/server/secure-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 姓名或密码错了，给的是同一句话，不暴露到底是哪个错了。
const FAIL_MSG = "姓名或密码不对，请再试一次。";

export async function POST(req: Request) {
  let body: { name?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式不对。" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name : "";
  const password = typeof body.password === "string" ? body.password : "";
  const res = verifyLogin(name, password);
  if (res && "lockedForMs" in res) {
    return NextResponse.json(
      { error: `尝试次数太多，请 ${Math.ceil(res.lockedForMs / 1000)} 秒后再试。` },
      { status: 429 },
    );
  }
  if (!res) return NextResponse.json({ error: FAIL_MSG }, { status: 401 });

  const { token, expires } = createSession(res.account.id);
  const out = NextResponse.json({ account: res.account });
  out.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires,
  });
  return out;
}
