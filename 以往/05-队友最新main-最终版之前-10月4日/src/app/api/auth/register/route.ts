import { NextResponse } from "next/server";
import { createAccountServer, createSession, SESSION_COOKIE } from "@/lib/server/secure-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PASSWORD_MIN = 15;
const PASSWORD_MAX = 128;

export async function POST(req: Request) {
  let body: { name?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式不对。" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name : "";
  const password = typeof body.password === "string" ? body.password : "";
  const n = [...password].length;
  if (n < PASSWORD_MIN || n > PASSWORD_MAX) {
    return NextResponse.json({ error: `密码需要 ${PASSWORD_MIN}–${PASSWORD_MAX} 个字符。` }, { status: 400 });
  }
  const res = createAccountServer(name, password);
  if ("conflict" in res) {
    return NextResponse.json(
      { error: "这个姓名已经注册过了。是你的话请直接登录；不是的话，换一个能区分的姓名。" },
      { status: 409 },
    );
  }
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: 400 });

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
