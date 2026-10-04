"use client";

import { useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { SearchX } from "lucide-react";
import { reloadAccount, useStore, type DemoPersona } from "@/lib/store";
import { enterDemo } from "@/lib/accounts";
import { LogoMark } from "@/components/Logo";
import { Card, IconTile, LinkButton, Skeleton, Spinner } from "@/components/ui";

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
      <div className="flex min-h-screen items-center justify-center px-5 py-10">
        <Card tone="raised" className="w-full max-w-md animate-pop px-6 py-12 text-center">
          <IconTile tone="neutral" size="xl" className="mx-auto mb-5">
            <SearchX />
          </IconTile>
          <h1 className="t-title text-ink">没有这个演示</h1>
          <p className="t-body mx-auto mt-2 max-w-sm text-ink-2">可以打开的演示是 /demo/lin。</p>
          <div className="mt-8 flex justify-center">
            <LinkButton href="/welcome" size="lg">
              回到登录
            </LinkButton>
          </div>
        </Card>
      </div>
    );
  }

  /* the demo is being opened: the app icon breathing above the shape of the home page */
  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-md animate-fade-up">
        <div className="flex flex-col items-center gap-5 text-center text-ink-2">
          <span className="relative flex h-24 w-24 items-center justify-center">
            <Spinner className="absolute inset-0 h-24 w-24 border-4" />
            <span className="inline-block rounded-[18px] shadow-glow">
              <LogoMark className="h-16 w-16 animate-breathe" />
            </span>
          </span>
          <span className="t-lead font-medium text-ink">正在打开{PERSONAS[persona].name}的演示</span>
        </div>
        <Card className="mt-10 space-y-5 p-6" aria-hidden="true">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 max-w-10 shrink-0 rounded-[12px]" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 max-w-[40%]" />
              <Skeleton className="h-4 max-w-[80%]" />
            </div>
          </div>
          <Skeleton className="h-12 w-full rounded-full" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-16 w-full rounded-card" />
            <Skeleton className="h-16 w-full rounded-card" />
          </div>
        </Card>
      </div>
    </div>
  );
}
