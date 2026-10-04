"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, UserRound } from "lucide-react";
import { reloadAccount, useStore } from "@/lib/store";
import { logoutHere } from "@/lib/accounts";
import { L } from "@/lib/lang";
import { cn } from "@/lib/utils";
import { LogoMark } from "./Logo";
import { focusRing } from "./ui";

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-ink-2">
        <LogoMark className="h-14 w-14 animate-pulse" />
        <span className="text-base">{L("医伴", "Yiban")}</span>
      </div>
    </div>
  );
}


/**
 * 应急: the one fixed way out, in the same corner of every page. Red so it is found at once, small
 * so it does not shout over the conversation. The link is taller than the red part: easy to hit.
 */
function SosLink() {
  return (
    <Link href="/sos" className={cn("inline-flex min-h-11 items-center rounded-full", focusRing)}>
      <span className="inline-flex min-h-9 items-center rounded-full bg-danger px-4 text-base font-semibold text-white shadow-edge transition hover:bg-[#a92d33]">
        应急
      </span>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { state, ready } = useStore();
  const pathname = usePathname();
  const router = useRouter();
  // The emergency page stands on its own: no bar around it, and it opens even without a profile.
  const bare = pathname.startsWith("/onboarding") || pathname.startsWith("/welcome") || pathname.startsWith("/login") || pathname.startsWith("/demo") || pathname.startsWith("/sos");

  useEffect(() => {
    if (ready && !state.profile && !bare) router.replace("/welcome");
  }, [ready, state.profile, bare, router]);

  // screen readers and the browser's own translation offer go by this attribute
  const lang = state.settings.lang === "en" ? "en" : "zh-CN";
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // Inside the phone drawn on a computer (see PhoneShell): tell the window around us where we are,
  // so its address bar follows and a reload comes back to this page.
  useEffect(() => {
    if (window.parent === window) return;
    const href = window.location.pathname + window.location.search + window.location.hash;
    window.parent.postMessage({ type: "yiban:location", href }, window.location.origin);
  }, [pathname]);

  if (!ready) return <Splash />;
  if (bare) return <>{children}</>;
  if (!state.profile) return <Splash />;

  const home = pathname === "/";

  // The wireframe: the title and a line across the top of the main area, and a bar on the right
  // with profile (round) and report (square). 应急 stays, small, at the bottom of that bar.
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl">
      <div className="min-w-0 flex-1 px-8 pt-6 pb-10">
        <header className="no-print mb-6 flex items-end justify-between gap-4 border-b-2 border-ink pb-2">
          <Link href="/" className={cn("text-3xl font-bold tracking-tight text-ink", focusRing)}>
            VisitSmoothie
          </Link>
          {!home && (
            <Link href="/" className={cn("inline-flex items-center text-base font-medium text-brand-700", focusRing)}>
              <ChevronLeft className="h-5 w-5" />
              回首页
            </Link>
          )}
        </header>
        <main>{children}</main>
      </div>
      <aside className="no-print sticky top-0 flex h-screen w-44 shrink-0 flex-col items-center gap-6 border-l-2 border-ink pt-10">
        <Link
          href="/me"
          className={cn("flex h-28 w-28 flex-col items-center justify-center rounded-full border-2 border-brand-600 bg-surface text-lg font-semibold text-ink hover:bg-brand-50", focusRing)}
        >
          <UserRound className="h-7 w-7 text-brand-700" />
          profile
        </Link>
        <Link
          href="/report"
          className={cn("flex h-24 w-28 items-center justify-center rounded-lg border-2 border-brand-600 bg-surface text-lg font-semibold text-ink hover:bg-brand-50", focusRing)}
        >
          report
        </Link>
        <div className="mt-auto mb-8 flex flex-col items-center gap-4">
          <SosLink />
          {/* log out: this account's records stay saved for the next login */}
          <button
            type="button"
            onClick={() => {
              logoutHere();
              reloadAccount();
              router.replace("/welcome");
            }}
            className={cn("min-h-12 text-base font-medium text-ink-2 underline underline-offset-4 hover:text-ink", focusRing)}
          >
            退出登录
          </button>
        </div>
      </aside>
    </div>
  );
}
