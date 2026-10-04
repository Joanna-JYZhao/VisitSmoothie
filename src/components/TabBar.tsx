"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Camera, FileText, MessageCircle, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { SmoothieMark } from "./Logo";
import { focusRing } from "./ui";
import { L } from "@/lib/lang";

/*
 * The bar at the bottom of every signed-in screen: pre and post on the left, report and set on
 * the right, and in the middle the raised app icon that goes home. The labels are the ones the
 * human drew. It sits above the phone's home indicator (safe-area-inset-bottom, see .tab-bar).
 */

interface Tab {
  href: string;
  /** Chinese and English; picked when drawn, so the bar follows the language switch */
  label: [string, string];
  guide: string;
  Icon: typeof Camera;
}

const LEFT: Tab[] = [
  { href: "/pre", label: ["看病前", "pre"], guide: "pre", Icon: MessageCircle },
  { href: "/post", label: ["看病后", "post"], guide: "post", Icon: Camera },
];
const RIGHT: Tab[] = [
  { href: "/report", label: ["健康报告", "Record"], guide: "report", Icon: FileText },
  { href: "/set", label: ["设置", "set"], guide: "profile", Icon: Settings },
];

function TabItem({ tab, active }: { tab: Tab; active: boolean }) {
  return (
    <Link
      href={tab.href}
      data-guide={tab.guide}
      aria-current={active ? "page" : undefined}
      className={cn(
        "press flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl pt-1.5 pb-1 text-base font-medium transition-colors duration-200",
        active ? "text-brand-700" : "text-ink-2 hover:text-ink",
        focusRing,
      )}
    >
      <tab.Icon className="h-6 w-6" strokeWidth={active ? 2.3 : 1.9} aria-hidden="true" />
      <span className={cn("leading-tight", active && "font-semibold")}>{L(...tab.label)}</span>
    </Link>
  );
}

export function TabBar() {
  const pathname = usePathname();
  const home = pathname === "/";
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  return (
    <nav aria-label={L("主导航", "Main menu")} className="tab-bar phone-fixed no-print">
      <div className="grid grid-cols-[1fr_1fr_7.25rem_1fr_1fr] items-center px-2" style={{ height: "var(--tab-h)" }}>
        {LEFT.map((t) => (
          <TabItem key={t.href} tab={t} active={isActive(t.href)} />
        ))}
        {/* the app icon stands up out of the bar, its name under it; the middle column is wide enough for the name */}
        <div className="relative h-full">
          <Link href="/" aria-label={L("问诊奶昔首页", "VisitSmoothie home")} aria-current={home ? "page" : undefined} className={cn("tab-home press", focusRing)}>
            <SmoothieMark className="h-[3.6rem] w-[3.6rem]" />
            {/* the name under the icon, where the other tabs have their labels */}
            <span aria-hidden="true" className={cn("tab-home-name text-base leading-tight tracking-tight", home ? "font-semibold text-brand-700" : "font-medium text-ink-2")}>
              {L("问诊奶昔", "VisitSmoothie")}
            </span>
          </Link>
        </div>
        {RIGHT.map((t) => (
          <TabItem key={t.href} tab={t} active={isActive(t.href)} />
        ))}
      </div>
    </nav>
  );
}
