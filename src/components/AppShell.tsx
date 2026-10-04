"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, FileText, LogOut, Siren, UserRound } from "lucide-react";
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
        <LogoMark className="h-12 w-12" />
        <span className="t-lead font-medium">{L("医伴", "Yiban")}</span>
        <span className="spinner-ring h-6 w-6" aria-hidden="true" />
      </div>
    </div>
  );
}

/** Emergency remains available on every signed-in screen. */
function SosLink() {
  return (
    <Link href="/sos" data-guide="sos" className={cn("nav-row text-danger", focusRing)}>
      <span className="nav-icon bg-danger"><Siren className="h-4 w-4" aria-hidden="true" /></span>
      应急
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

  // A quiet list rail on desktop; the same destinations fit a compact toolbar on phones.
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col md:flex-row">
      <aside className="app-rail no-print flex shrink-0 flex-wrap items-center gap-x-1 border-b border-line px-3 py-1.5 md:sticky md:top-0 md:h-screen md:w-56 md:flex-col md:items-stretch md:gap-1 md:border-r md:border-b-0 md:px-4 md:py-6 md:pb-20">
        <Link href="/" className={cn("app-brand mb-6 hidden rounded-lg md:flex", focusRing)} aria-label="VisitSmoothie">
          <BrandLogo />
        </Link>
        <Link href="/me" data-guide="profile" aria-current={pathname.startsWith("/me") ? "page" : undefined} className={cn("nav-row", focusRing)}>
          <span className="nav-icon bg-[#7056bf]"><UserRound className="h-4 w-4" aria-hidden="true" /></span>
          profile
        </Link>
        <Link href="/report" data-guide="report" aria-current={pathname.startsWith("/report") ? "page" : undefined} className={cn("nav-row", focusRing)}>
          <span className="nav-icon bg-brand-600"><FileText className="h-4 w-4" aria-hidden="true" /></span>
          report
        </Link>
        <div className="ml-auto flex items-center gap-1 md:mt-auto md:ml-0 md:flex-col md:items-stretch md:gap-1">
          <SosLink />
          <button
            type="button"
            onClick={() => {
              logoutHere();
              reloadAccount();
              router.replace("/welcome");
            }}
            className={cn("nav-row text-ink-2", focusRing)}
          >
            <LogOut className="hidden h-5 w-5 md:block" aria-hidden="true" />
            退出登录
          </button>
        </div>
      </aside>
      <div className="min-w-0 flex-1 px-4 pt-3 pb-12 sm:px-7 md:px-9 md:pt-6 lg:px-12">
        <header className={cn("no-print mb-5 flex min-h-11 items-center justify-between gap-3 md:mb-6", home && "md:hidden")}>
          <Link href="/" className={cn("app-brand inline-flex rounded-lg md:hidden", focusRing)} aria-label="VisitSmoothie">
            <BrandLogo />
          </Link>
          {!home && (
            <Link href="/" className={cn("inline-flex min-h-11 items-center rounded-lg text-base font-medium text-brand-600", focusRing)}>
              <ChevronLeft className="h-5 w-5" />
              回首页
            </Link>
          )}
        </header>
        <main key={pathname} className="page-enter">{children}</main>
      </div>
    </div>
  );
}
