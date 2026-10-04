import Link from "next/link";
import { BrandLogo } from "./Logo";

/* The Visit Smoothie header and footer, shared by the welcome screen and the registration screen. */

/* The user's own logo, in the same link to the same place, with the same accessible name as before. */
const brand = (
  <Link className="smoothie-brand" href="/welcome" aria-label="Visit Smoothie">
    <BrandLogo />
  </Link>
);

export function SmoothieHeader({ right }: { right?: React.ReactNode }) {
  return (
    <header className="onboarding-header">
      {brand}
      <span className="onboarding-header-note">让每一次就诊，更从容一点。</span>
      {right}
    </header>
  );
}

export function SmoothieFooter() {
  return (
    <footer className="onboarding-footer">
      <span>Visit Smoothie</span>
      <span>档案保存在这台电脑上。</span>
    </footer>
  );
}
