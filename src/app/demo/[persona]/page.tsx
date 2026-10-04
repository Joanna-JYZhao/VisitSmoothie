"use client";

import { useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { reloadAccount, useStore, type DemoPersona } from "@/lib/store";
import { enterDemo } from "@/lib/accounts";
import { LogoMark } from "@/components/Logo";
import { Card, LinkButton } from "@/components/ui";

const PERSONAS: Record<DemoPersona, { name: string }> = {
  lin: { name: "林叔" },
};

/**
 * /demo/lin: the demo person (林叔, fictional) has their own account, entered by the link
 * without a password. Opening the link logs out whoever was logged in (their records stay
 * in their account) and loads the demo fresh. Nobody's own records are touched.
 */
export default function DemoLinkPage() {
  const params = useParams<{ persona: string }>();
  const { ready, loadDemo } = useStore();
  const router = useRouter();
  const persona = (params.persona in PERSONAS ? params.persona : null) as DemoPersona | null;
  const decided = useRef(false);

  useEffect(() => {
    if (!ready || decided.current || !persona) return;
    decided.current = true;
    enterDemo(persona);
    reloadAccount();
    loadDemo(persona);
    router.replace("/");
  }, [ready, persona, loadDemo, router]);

  if (!persona) {
    return (
      <div className="flex min-h-screen items-center justify-center px-5">
        <Card className="w-full max-w-md p-7 text-center">
          <LogoMark className="mx-auto h-12 w-12" />
          <h1 className="mt-4 text-2xl font-semibold text-ink">没有这个演示</h1>
          <p className="mt-1.5 text-lg text-ink-2">可以打开的演示是 /demo/lin。</p>
          <LinkButton href="/welcome" className="mt-5">
            回到登录
          </LinkButton>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-ink-2">
        <LogoMark className="h-14 w-14 animate-pulse" />
        <span className="text-lg">正在打开{PERSONAS[persona].name}的演示</span>
      </div>
    </div>
  );
}
