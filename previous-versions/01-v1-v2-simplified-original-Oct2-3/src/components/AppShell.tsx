"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Logo, LogoMark } from "./Logo";
import { focusRing } from "./ui";

/** The whole app has two places to be: today, and my records. */
const NAV = [
  { href: "/", label: "今天" },
  { href: "/me", label: "我的档案" },
];

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-ink-2">
        <LogoMark className="h-14 w-14 animate-pulse" />
        <span className="text-base">医伴</span>
      </div>
    </div>
  );
}

/* Whether the page has moved under the header. Read straight from the window, so there is no state to keep in step. */
function subscribeScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}
const isScrolled = () => window.scrollY > 4;
const notScrolled = () => false;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { state, ready } = useStore();
  const pathname = usePathname();
  const router = useRouter();
  const scrolled = useSyncExternalStore(subscribeScroll, isScrolled, notScrolled);
  // The emergency page stands on its own: no navigation around it, and it opens even without a profile.
  const bare = pathname.startsWith("/onboarding") || pathname.startsWith("/demo") || pathname.startsWith("/sos");

  useEffect(() => {
    if (ready && !state.profile && !bare) router.replace("/onboarding");
  }, [ready, state.profile, bare, router]);

  if (!ready) return <Splash />;
  if (bare) return <>{children}</>;
  if (!state.profile) return <Splash />;

  const inMe = pathname.startsWith("/me");

  // One narrow column on every screen size, the same on a phone and on a desktop.
  return (
    <div className="min-h-screen">
      {/* At the top the header is part of the page; once content slides under it, it becomes a sheet of frosted glass. */}
      <header
        className={cn(
          "no-print sticky top-0 z-30 border-b transition-[background-color,border-color,box-shadow] duration-200",
          scrolled ? "border-line bg-surface/90 shadow-header backdrop-blur-md" : "border-transparent",
        )}
      >
        <div className="mx-auto flex h-16 w-full max-w-[36rem] items-center justify-between px-4">
          <Link href="/" className={cn("rounded-xl", focusRing)} aria-label="医伴，回到今天">
            <Logo compact />
          </Link>
          <nav className="flex items-center gap-1 rounded-2xl bg-ink/5 p-1" aria-label="主导航">
            {NAV.map(({ href, label }) => {
              const active = href === "/me" ? inMe : !inMe;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-xl px-3.5 text-base font-medium transition",
                    focusRing,
                    active ? "bg-surface text-brand-800 shadow-pill" : "text-ink-2 hover:text-ink",
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[36rem] px-4 pt-4 pb-24">{children}</main>
    </div>
  );
}
