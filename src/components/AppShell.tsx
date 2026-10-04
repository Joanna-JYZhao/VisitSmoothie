"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Siren } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { BrandLogo, LogoMark } from "./Logo";
import { TabBar } from "./TabBar";
import { focusRing } from "./ui";
import { L } from "@/lib/lang";

function Splash() {
  return (
    <div className="phone-col flex items-center justify-center">
      <div className="flex animate-fade-up flex-col items-center gap-4 text-ink-2">
        <LogoMark className="h-[4.5rem] w-[4.5rem]" />
        <span className="t-lead font-semibold text-brand-ink">{L("问诊奶昔", "VisitSmoothie")}</span>
        <span className="spinner-ring h-6 w-6" aria-hidden="true" />
      </div>
    </div>
  );
}

/** Emergency: one small red pill at the top right of every signed-in screen, one tap away. */
function SosPill() {
  return (
    <Link
      href="/sos"
      data-guide="sos"
      aria-label={L("应急", "Emergency")}
      className={cn(
        "press inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-full bg-danger px-4 text-base font-semibold text-white shadow-[0_2px_8px_rgba(193,44,53,0.25)] transition hover:brightness-95",
        focusRing,
      )}
    >
      <Siren className="h-5 w-5" aria-hidden="true" />
      {/* "Emergency" would not fit beside the logo and the language switch on a phone; SOS is understood everywhere */}
      {L("应急", "SOS")}
    </Link>
  );
}

/*
 * The phone shell: one phone-wide column (centred on a wide screen, see .phone-col), a slim
 * header with the brand and the emergency pill, the page, and the tab bar fixed at the bottom.
 * Screens before signing in (welcome, login, onboarding, demo) and the emergency page are bare:
 * the column, nothing else.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { state, ready } = useStore();
  const pathname = usePathname();
  const router = useRouter();
  // The emergency page stands on its own: no bar around it, and it opens even without a profile.
  const bare =
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/welcome") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/demo") ||
    pathname.startsWith("/sos");

  useEffect(() => {
    if (ready && !state.profile && !bare) router.replace("/welcome");
  }, [ready, state.profile, bare, router]);

  // screen readers and the browser's own translation offer go by this attribute
  const lang = state.settings.lang === "en" ? "en" : "zh-CN";
  useEffect(() => {
    document.documentElement.lang = lang;
    // drawn inside a phone on a computer: the page around it follows the language too
    if (window.parent !== window) window.parent.postMessage({ type: "yiban:lang", lang: lang === "en" ? "en" : "zh" }, window.location.origin);
  }, [lang]);
  // the browser tab's name follows the language too (the page titles are written in Chinese)
  useEffect(() => {
    document.title = pathname.startsWith("/sos") ? L("应急手册", "Emergency card") : L("问诊奶昔 · 你的私人医生助理", "VisitSmoothie · Your personal doctor's assistant");
  }, [lang, pathname]);

  // Inside a frame (a phone drawn on a computer): tell the window around us where we are,
  // so its address bar follows and a reload comes back to this page.
  useEffect(() => {
    if (window.parent === window) return;
    const href = window.location.pathname + window.location.search + window.location.hash;
    window.parent.postMessage({ type: "yiban:location", href }, window.location.origin);
  }, [pathname]);

  if (!ready) return <Splash />;
  if (bare) return <div className="phone-col">{children}</div>;
  if (!state.profile) return <Splash />;

  return (
    <div className="phone-col flex flex-col">
      <header
        className="no-print glass sticky top-0 z-30 flex min-h-[3.75rem] items-center justify-between gap-3 px-4 pb-1.5 shadow-header"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.375rem)" }}
      >
        <Link href="/" className={cn("app-brand inline-flex rounded-lg", focusRing)} aria-label={L("问诊奶昔", "VisitSmoothie")}>
          <BrandLogo className="!w-[8rem]" />
        </Link>
        {/* the language is not switched from here, in the middle of pre or post: it is in 设置 */}
        <div className="flex shrink-0 items-center gap-2">
          <SosPill />
        </div>
      </header>
      <main key={pathname} className="page-enter flex min-w-0 flex-1 flex-col px-4 pt-3" style={{ paddingBottom: "calc(var(--tab-bar) + 2.25rem)" }}>
        {children}
      </main>
      <TabBar />
    </div>
  );
}
