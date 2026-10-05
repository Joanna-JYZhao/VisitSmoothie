"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useStore, type DemoPersona } from "@/lib/store";
import { LogoMark } from "@/components/Logo";
import { Button, Card, LinkButton } from "@/components/ui";

const PERSONAS: Record<DemoPersona, { name: string; blurb: string }> = {
  liming: { name: "李明", blurb: "一次还没好的肚子痛，加上以前的三次记录。" },
  wang: { name: "王秀兰", blurb: "确诊糖尿病后一年的血糖、用药变化，今天要去年度复诊。" },
};

/**
 * /demo/wang and /demo/liming: open the link and the demo is loaded.
 * If this browser holds a profile the user created themselves, the page asks before replacing it;
 * add ?replace=1 to skip that question.
 */
export default function DemoLinkPage() {
  const params = useParams<{ persona: string }>();
  const { state, ready, loadDemo } = useStore();
  const router = useRouter();
  const persona = (params.persona in PERSONAS ? params.persona : null) as DemoPersona | null;
  const decided = useRef(false);
  const [force] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("replace") === "1",
  );
  // Never silently replace a profile the user created themselves: ask first, unless the link says otherwise.
  const needsConfirm = ready && Boolean(state.profile) && !state.demo && !force;

  useEffect(() => {
    if (!ready || decided.current || !persona || needsConfirm) return;
    decided.current = true;
    loadDemo(persona);
    router.replace("/");
  }, [ready, persona, needsConfirm, loadDemo, router]);

  if (!persona) {
    return (
      <div className="flex min-h-screen items-center justify-center px-5">
        <Card className="w-full max-w-md p-7 text-center">
          <LogoMark className="mx-auto h-12 w-12" />
          <h1 className="mt-4 text-2xl font-semibold text-ink">没有这个演示</h1>
          <p className="mt-1.5 text-lg text-ink-2">可以打开的演示是 /demo/wang 和 /demo/liming。</p>
          <LinkButton href="/" className="mt-5">
            回到首页
          </LinkButton>
        </Card>
      </div>
    );
  }

  if (!needsConfirm) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-ink-2">
          <LogoMark className="h-14 w-14 animate-pulse" />
          <span className="text-lg">正在打开{PERSONAS[persona].name}的演示</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <Card className="w-full max-w-md p-7">
        <LogoMark className="h-12 w-12" />
        <h1 className="mt-4 text-2xl font-semibold text-ink">换成{PERSONAS[persona].name}的演示？</h1>
        <p className="mt-1.5 text-lg leading-relaxed text-ink-2">{PERSONAS[persona].blurb}</p>
        <p className="mt-3 rounded-2xl bg-warn-bg px-4 py-3 text-lg leading-relaxed text-ink">
          这台设备上已经有「{state.profile?.name}」的档案。打开演示会把它换掉。想留着的话，先到「我的档案」的设置里下载备份。
        </p>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <LinkButton href="/" variant="ghost">
            不换了
          </LinkButton>
          <Button
            onClick={() => {
              decided.current = true;
              loadDemo(persona);
              router.replace("/");
            }}
          >
            换成演示
          </Button>
        </div>
      </Card>
    </div>
  );
}
