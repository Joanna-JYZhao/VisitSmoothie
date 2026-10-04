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
      <div className="flex min-h-dvh items-center justify-center px-4 py-10">
        <Card tone="raised" className="w-full animate-pop rounded-[20px] px-5 py-12 text-center">
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

  /* the demo is being opened: the app icon inside a turning ring, above the shape of the home page */
  return (
    <div className="flex min-h-dvh flex-col justify-center px-4 py-10">
      <div className="w-full animate-fade-up">
        <div className="flex flex-col items-center gap-5 text-center text-ink-2">
          <span className="relative flex h-28 w-28 items-center justify-center">
            <Spinner className="absolute inset-0 h-28 w-28 border-[3px]" />
            <LogoMark className="h-[4.5rem] w-[4.5rem]" />
          </span>
          <span className="t-lead font-medium text-ink">正在打开{PERSONAS[persona].name}的演示</span>
        </div>
        {/* the two halves of the home page, still empty */}
        <div className="mt-10 space-y-3" aria-hidden="true">
          <Card className="space-y-4 rounded-[1.1rem] p-4">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-9 max-w-9 shrink-0 rounded-[11px]" />
              <Skeleton className="h-5 max-w-[40%]" />
            </div>
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-3 border-t border-line pt-4">
                <Skeleton className="h-7 max-w-7 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 max-w-[55%]" />
                  <Skeleton className="h-5 max-w-[75%]" />
                </div>
              </div>
            ))}
          </Card>
          <Card className="space-y-4 rounded-[1.1rem] p-4">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-9 max-w-9 shrink-0 rounded-[11px]" />
              <Skeleton className="h-5 max-w-[25%]" />
            </div>
            <Skeleton className="h-14 w-full rounded-2xl" />
          </Card>
        </div>
      </div>
    </div>
  );
}
