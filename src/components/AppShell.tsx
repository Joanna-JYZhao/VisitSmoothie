"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, FileText, Siren, UserRound } from "lucide-react";
import { reloadAccount, useStore } from "@/lib/store";
import { logoutHere } from "@/lib/accounts";
import { L } from "@/lib/lang";
import { cn } from "@/lib/utils";
import { LogoMark } from "./Logo";
import { focusRing } from "./ui";

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex animate-fade-up flex-col items-center gap-4 text-ink-2">
        <LogoMark className="h-16 w-16 animate-breathe drop-shadow-[0_12px_24px_rgba(22,116,147,0.35)]" />
        <span className="t-lead font-medium">{L("医伴", "Yiban")}</span>
        <span className="spinner-ring h-6 w-6" aria-hidden="true" />
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
    <Link href="/sos" className={cn("press inline-flex min-h-12 items-center rounded-full", focusRing)}>
      <span className="tile-danger inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-base font-semibold whitespace-nowrap text-white transition duration-200 hover:brightness-110">
        <Siren className="h-4.5 w-4.5" aria-hidden="true" />
        应急
      </span>
    </Link>
  );
}

/*
 * The two doors in the bar on the right: a sheet of white lit from above, hairline edge, soft depth;
 * they lift to the hand. On a phone they are small pills in a row above the title.
 */
const doorCls =
  "lift press material flex min-h-12 flex-col items-center justify-center gap-1.5 rounded-full border border-line/80 px-3.5 text-base font-semibold whitespace-nowrap text-ink hover:border-brand-200 hover:text-brand-800 md:px-0";

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
  // On a phone the bar is a compact row above the title; the reading order stays the same.
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col md:flex-row">
      <div className="min-w-0 flex-1 px-4 pt-4 pb-16 sm:px-8 sm:pt-7 lg:px-12">
        {/* the title and the line under it, the way the wireframe draws them */}
        <header className="no-print mb-7 flex items-end justify-between gap-4 border-b border-ink/15 pb-3 sm:mb-10">
          <Link href="/" className={cn("wordmark rounded-lg text-[1.75rem] leading-none sm:text-[2rem]", focusRing)} aria-label="VisitSmoothie">
            <span className="wordmark-mark text-[1.45em]" aria-hidden="true">
              v<span>●</span>
            </span>
            <span>VisitSmoothie</span>
          </Link>
          {!home && (
            <Link
              href="/"
              className={cn("press -mr-2 inline-flex min-h-12 items-center rounded-full pr-4 pl-2 text-base font-medium text-brand-700 transition hover:bg-brand-50", focusRing)}
            >
              <ChevronLeft className="h-5 w-5" />
              回首页
            </Link>
          )}
        </header>
        {/* a new page settles into place */}
        <main key={pathname} className="page-enter">
          {children}
        </main>
      </div>
      {/* the bar on the right: a composed column — the two doors at the top, the mark resting in the middle, the way out at the foot */}
      <aside className="no-print order-first flex shrink-0 items-center justify-between gap-1.5 border-b border-line px-2 py-2 sm:gap-2 sm:px-3 md:sticky md:top-0 md:z-30 md:order-none md:h-screen md:w-56 md:flex-col md:justify-start md:gap-7 md:border-b-0 md:border-l md:border-ink/15 md:px-0 md:py-0 md:pt-10">
        <Link href="/me" className={cn(doorCls, "md:h-32 md:w-32 md:rounded-full", focusRing)}>
          <span className="tile-brand hidden h-11 w-11 items-center justify-center rounded-[13px] text-white md:flex">
            <UserRound className="h-6 w-6" />
          </span>
          profile
        </Link>
        <Link href="/report" className={cn(doorCls, "md:h-28 md:w-32 md:rounded-[24px]", focusRing)}>
          <span className="tile-ink hidden h-11 w-11 items-center justify-center rounded-[13px] text-white md:flex">
            <FileText className="h-6 w-6" />
          </span>
          report
        </Link>
        <div aria-hidden="true" className="hidden flex-1 items-center justify-center self-stretch select-none md:flex">
          <span className="wordmark-mark faint text-[7.5rem]">
            v<span>●</span>
          </span>
        </div>
        <div className="flex items-center gap-1 md:mb-8 md:flex-col md:gap-3">
          <SosLink />
          {/* log out: this account's records stay saved for the next login */}
          <button
            type="button"
            onClick={() => {
              logoutHere();
              reloadAccount();
              router.replace("/welcome");
            }}
            className={cn("press min-h-12 rounded-full px-2 text-base font-medium whitespace-nowrap text-ink-2 underline decoration-line-strong underline-offset-4 transition hover:text-ink sm:px-3", focusRing)}
          >
            退出登录
          </button>
        </div>
      </aside>
    </div>
  );
}
