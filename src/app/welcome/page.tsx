"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";
import { useStore } from "@/lib/store";
import { SmoothieFooter, SmoothieHeader } from "@/components/Smoothie";
import { SmoothieMark } from "@/components/Logo";
import "./smoothie.css";

/* A calm welcome sheet for the phone column: the app icon, the name, one big way in, and the login. */

export default function WelcomePage() {
  const { state, ready } = useStore();
  const router = useRouter();

  // whoever is logged in goes straight to their records
  useEffect(() => {
    if (ready && state.profile) router.replace("/");
  }, [ready, state.profile, router]);

  if (!ready || state.profile) return null;

  return (
    <div className="onboarding-shell">
      <SmoothieHeader
        right={
          <Link href="/login" className="onboarding-language">
            登录
          </Link>
        }
      />
      <main className="onboarding-main is-welcome">
        <section className="welcome-stage">
          <div className="welcome-intro">
            <SmoothieMark className="welcome-icon" />
            <p className="welcome-eyebrow">
              <span />
              你的健康故事，从这里开始
            </p>
            <h1>
              Visit<em>Smoothie</em>
              <span className="welcome-period">.</span>
            </h1>
            <p className="welcome-description">
              从认识你开始，
              <br />
              为下一次就诊，少一点重复，多一点从容。
            </p>
            <Link href="/onboarding" className="smoothie-button smoothie-button-hero">
              开始我的健康旅程
              <span aria-hidden="true">↗</span>
            </Link>
            <p className="welcome-login">
              已有账号？
              <Link href="/login" className="text-button">
                登录
              </Link>
            </p>
          </div>
          <div className="welcome-footnote">
            <span aria-hidden="true">
              <UserRound />
            </span>
            <span>首次使用，先建立一份属于你的个人档案。</span>
          </div>
        </section>
      </main>
      <SmoothieFooter />
    </div>
  );
}
