"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";
import { useStore } from "@/lib/store";
import { SmoothieFooter, SmoothieHeader } from "@/components/Smoothie";
import "./smoothie.css";
import { L } from "@/lib/lang";

/*
 * The welcome screen, in the round-2 redesign look for the phone column: the name set like a
 * keynote title on a softly lit stage, one big pill button, the hand-written note under it with
 * its drawn arrow, and the first-time hint at the foot. The logo with its name is in the header.
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
            {L("登录", "Sign in")}
          </Link>
        }
      />
      <main className="onboarding-main is-welcome">
        <section className="welcome-stage">
          <div className="welcome-light" aria-hidden="true" />
          <div className="welcome-intro">
            <p className="welcome-eyebrow">
              <span />
              {L("你的健康故事，从这里开始", "Your health story starts here")}
            </p>
            {/* reads as one word, VisitSmoothie (问诊奶昔); set on two lines like the keynote title it was drawn as */}
            <h1>
              {L("问诊", "Visit")}
              <br />
              <em>{L("奶昔", "Smoothie")}</em>
              <span className="welcome-period">{L("。", ".")}</span>
            </h1>
            <p className="welcome-description">
              {L("从认识你开始，", "It starts with getting to know you, ")}
              <br />
              {L("为下一次就诊，少一点重复，多一点从容。", "so your next visit has less repeating and more calm.")}
            </p>
            <Link href="/onboarding" className="smoothie-button smoothie-button-hero">
              {L("开始我的健康旅程", "Start my health journey")}
              <span aria-hidden="true">↗</span>
            </Link>
            <p className="welcome-login">
              {L("已有账号？", "Have an account?")}
              <Link href="/login" className="text-button">
                {L("登录", "Sign in")}
              </Link>
            </p>
            <div className="welcome-handnote">
              <svg className="journey-arrow" viewBox="0 0 170 92" fill="none" aria-hidden="true">
                <path d="M15 6C-3 70 70 87 144 45M126 44l24-4-6 23" pathLength={1} />
              </svg>
              <span>
                {L("让健康旅程，", "A smoother")}
                <br />
                {L("顺畅一点。", "health journey.")}
              </span>
            </div>
          </div>
          <div className="welcome-footnote">
            <span aria-hidden="true">
              <UserRound />
            </span>
            <span>{L("首次使用，先建立一份属于你的个人档案。", "First time here? Start by making your own profile.")}</span>
          </div>
        </section>
      </main>
      <SmoothieFooter />
    </div>
  );
}
