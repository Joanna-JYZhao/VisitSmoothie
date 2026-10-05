import { NextResponse } from "next/server";
import { accountBySession, SESSION_COOKIE } from "@/lib/server/secure-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`))?.[1];
  const account = accountBySession(token);
  if (!account) return NextResponse.json({ account: null }, { status: 401 });
  return NextResponse.json({ account });
}
