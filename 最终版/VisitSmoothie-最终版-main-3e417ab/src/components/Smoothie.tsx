import Link from "next/link";
import { BrandLogo, LogoMark } from "./Logo";
import { LangToggle } from "./LangToggle";
import { L } from "@/lib/lang";

/* The Visit Smoothie header and footer, shared by the welcome screen and the registration screen. */

/* The user's own logo, in the same link to the same place, with the same accessible name as before. */
const brand = (
  <Link className="smoothie-brand" href="/welcome" aria-label={L("问诊奶昔", "VisitSmoothie")}>
    <BrandLogo />
  </Link>
);

export function SmoothieHeader({ right }: { right?: React.ReactNode }) {
  return (
    <header className="onboarding-header">
      {brand}
      <span className="onboarding-header-note">{L("让每一次就诊，更从容一点。", "Making every doctor's visit a little calmer.")}</span>
      {/* 中 / EN before signing in too, so the whole way in can be read in either language */}
      <span className="onboarding-header-right">
        <LangToggle segmented />
        {right}
      </span>
    </header>
  );
}

export function SmoothieFooter() {
  return (
    <footer className="onboarding-footer">
      <span>{L("问诊奶昔", "VisitSmoothie")}</span>
      <span>{L("档案保存在这台电脑上。", "Your profile is kept on this computer.")}</span>
    </footer>
  );
}

/**
 * The app's own mark above the login card: the same app icon as the home button in the tab bar,
 * rather than a second, different fragment of the wordmark on the same screen.
 */
export function SmoothieAppMark() {
  return (
    <div className="login-mark">
      <LogoMark className="login-mark-tile" />
      <span className="login-mark-name">{L("问诊奶昔", "VisitSmoothie")}</span>
    </div>
  );
}
