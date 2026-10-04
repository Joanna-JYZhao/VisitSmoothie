"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";
import { useStore } from "@/lib/store";
import { SmoothieFooter, SmoothieHeader } from "@/components/Smoothie";
import "./smoothie.css";

/*
 * 登录界面: the teammate's Visit Smoothie welcome screen (TriMedManagement, branch
 * codex/visit-smoothie-onboarding), rebuilt here with the same look. Shown only when nobody is
 * logged in: register (开始我的健康旅程) or log in (登录).
 */

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
        <section className="welcome-panel">
          <div className="welcome-intro">
            <p className="welcome-eyebrow">
              <span />
              你的健康故事，从这里开始
            </p>
            <h1>
              Visit
              <br />
              <em>Smoothie</em>
              <span className="welcome-period">.</span>
            </h1>
            <p className="welcome-description">
              从认识你开始，
              <br />
              为下一次就诊，少一点重复，多一点从容。
            </p>
            <Link href="/onboarding" className="smoothie-button">
              开始我的健康旅程
              <span aria-hidden="true">↗</span>
            </Link>
            <p className="welcome-login">
              已有账号？
              <Link href="/login" className="text-button">
                登录
              </Link>
            </p>
            <div className="welcome-handnote">
              <svg className="journey-arrow" viewBox="0 0 170 92" fill="none" aria-hidden="true">
                <path d="M15 6C-3 70 70 87 144 45M126 44l24-4-6 23" />
              </svg>
              <span>
                让健康旅程，
                <br />
                顺畅一点。
              </span>
            </div>
          </div>
          <div className="welcome-margin" aria-hidden="true">
            <span>HELLO, YOU.</span>
            <span>☺</span>
          </div>
          <div className="welcome-footnote">
            <UserRound />
            <span>首次使用，先建立一份属于你的个人档案。</span>
          </div>
        </section>
      </main>
      <SmoothieFooter />
    </div>
  );
}
