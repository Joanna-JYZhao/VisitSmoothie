import Link from "next/link";

/* The Visit Smoothie header and footer, shared by the welcome screen and the registration screen. */

const brand = (
  <Link className="smoothie-brand" href="/welcome" aria-label="Visit Smoothie">
    <span className="smoothie-mark" aria-hidden="true">
      v<span>●</span>
    </span>
    <span>Visit Smoothie</span>
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

/** The wordmark's mark on its own, as an app icon above the login card. */
export function SmoothieAppMark() {
  return (
    <span className="login-mark" aria-hidden="true">
      v<span>●</span>
    </span>
  );
}
