"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, FileText, Siren, UserRound } from "lucide-react";
import { reloadAccount, useStore } from "@/lib/store";
import { logoutHere } from "@/lib/accounts";
import { L } from "@/lib/lang";
import { cn } from "@/lib/utils";
import { BrandLogo, LogoMark } from "./Logo";
import { focusRing } from "./ui";

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex animate-fade-up flex-col items-center gap-4 text-ink-2">
        <LogoMark className="h-16 w-16 animate-breathe drop-shadow-[0_12px_24px_rgba(36,106,87,0.35)]" />
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
    <Link href="/sos" data-guide="sos" className={cn("press inline-flex min-h-11 items-center rounded-full", focusRing)}>
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
  "lift press material flex min-h-11 flex-col items-center justify-center gap-1.5 rounded-full border border-line/80 px-3.5 text-base font-semibold whitespace-nowrap text-ink hover:border-brand-200 hover:text-brand-800 md:px-0";

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
  // The bar is a column you keep for the whole session, so it is sized to be read, not to fill the
  // screen: 170px wide on a desktop, and its two doors are 96×96 and 96×85 rather than 128s.
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col md:flex-row">
      <div className="min-w-0 flex-1 px-4 pt-3 pb-12 sm:px-8 sm:pt-5 lg:px-12">
        {/* the title and the line under it, the way the wireframe draws them */}
        <header className="no-print mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-ink/15 pb-2.5 sm:mb-6 sm:pb-3">
          <Link href="/" className={cn("app-brand rounded-lg", focusRing)} aria-label="VisitSmoothie">
            <BrandLogo />
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
      <aside className="app-rail no-print order-first flex shrink-0 flex-wrap items-center justify-between gap-1.5 border-b border-line px-2 py-1.5 sm:gap-2 sm:px-3 md:sticky md:top-0 md:z-30 md:order-none md:h-screen md:w-40 md:flex-col md:flex-nowrap md:justify-start md:gap-5 md:border-b-0 md:border-l md:border-ink/15 md:px-0 md:py-0 md:pt-7">
        <Link href="/me" data-guide="profile" className={cn(doorCls, "md:h-24 md:w-24 md:rounded-full", focusRing)}>
          <span className="tile-brand hidden h-10 w-10 items-center justify-center rounded-[12px] text-white md:flex">
            <UserRound className="h-5 w-5" />
          </span>
          profile
        </Link>
        <Link href="/report" data-guide="report" className={cn(doorCls, "md:h-20 md:w-24 md:rounded-[20px]", focusRing)}>
          <span className="tile-ink hidden h-10 w-10 items-center justify-center rounded-[12px] text-white md:flex">
            <FileText className="h-5 w-5" />
          </span>
          report
        </Link>
        <div aria-hidden="true" className="hidden flex-1 items-center justify-center self-stretch select-none md:flex">
          <BrandLogo className="rail-watermark" preload={false} />
        </div>
        <div className="flex items-center gap-1 md:mb-6 md:flex-col md:gap-2.5">
          <SosLink />
          {/* log out: this account's records stay saved for the next login */}
          <button
            type="button"
            onClick={() => {
              logoutHere();
              reloadAccount();
              router.replace("/welcome");
            }}
            className={cn("press min-h-11 rounded-full px-2 text-base font-medium whitespace-nowrap text-ink-2 underline decoration-line-strong underline-offset-4 transition hover:text-ink sm:px-3", focusRing)}
          >
            退出登录
          </button>
        </div>
      </aside>
    </div>
  );
}
