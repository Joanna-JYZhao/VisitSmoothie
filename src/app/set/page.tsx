"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Settings } from "lucide-react";
import { reloadAccount, useStore } from "@/lib/store";
import { logoutHere } from "@/lib/accounts";
import { ageOf, cn } from "@/lib/utils";
import { ageFromBirthDate } from "@/app/me/profile-data";
import { DevSwitch } from "@/components/DevSwitch";
import { Card, PageHeader, RowLink, focusRing } from "@/components/ui";

/**
 * set, laid out like iOS Settings: who I am (the way into 我的档案) on top, then the settings,
 * the developer switch, and the way out in red at the foot.
 */
export default function SetPage() {
  const { state } = useStore();
  const router = useRouter();
  const profile = state.profile;
  if (!profile) return null;
  const age = (profile.birthDate ? ageFromBirthDate(profile.birthDate) : null) ?? ageOf(profile.birthYear);

  return (
    <div className="space-y-6 pb-2">
      <PageHeader title="set" />

      {/* the person: one tap opens the whole 我的档案 */}
      <Card tone="raised" className="animate-pop overflow-hidden">
        <Link href="/me" className={cn("lift flex min-h-22 items-center gap-4 px-4 py-3.5", focusRing)}>
          <span
            aria-hidden="true"
            className="flex h-15 w-15 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[1.6rem] leading-none font-semibold text-white"
          >
            {Array.from(profile.name.trim())[0] ?? ""}
          </span>
          <span className="min-w-0 flex-1">
            <span className="name-title block text-ink">{profile.name}</span>
            <span className="t-body mt-0.5 block text-ink-2">
              {[profile.gender, `${age} 岁`].filter(Boolean).join(" · ")}
              <span className="mx-1.5 text-ink-3">·</span>
              我的档案
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-ink-3" aria-hidden="true" />
        </Link>
      </Card>

      <Card tone="raised" className="rise-1 overflow-hidden">
        <RowLink href="/me/settings" title="设置" icon={<Settings />} iconTone="neutral" className="press" />
      </Card>

      {/* 开发者开关: the same switch as before, now a settings row of its own */}
      <Card tone="raised" className="rise-2 overflow-hidden">
        <DevSwitch />
      </Card>

      <Card tone="raised" className="rise-3 overflow-hidden">
        <button
          type="button"
          onClick={() => {
            logoutHere();
            reloadAccount();
            router.replace("/welcome");
          }}
          className={cn(
            "press flex min-h-14 w-full items-center justify-center px-4 py-3 text-center text-lg font-semibold text-danger transition hover:bg-danger-bg/60",
            focusRing,
          )}
        >
          退出登录
        </button>
      </Card>
    </div>
  );
}
