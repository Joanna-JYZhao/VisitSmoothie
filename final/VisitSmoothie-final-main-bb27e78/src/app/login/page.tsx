"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ChevronLeft } from "lucide-react";
import { reloadAccount, useStore } from "@/lib/store";
import { lastAuthError, loginHere } from "@/lib/accounts";
import { isDev } from "@/lib/dev";
import { SmoothieAppMark, SmoothieFooter, SmoothieHeader } from "@/components/Smoothie";
import "../welcome/smoothie.css";
import { L } from "@/lib/lang";

/** 登录: the teammate's "欢迎回来" card. Name and password, checked in this browser. */
export default function LoginPage() {
  const { state, ready } = useStore();
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && state.profile && !busy) router.replace("/");
  }, [ready, state.profile, busy, router]);

  if (!ready) return null;

  const submit = async () => {
    // 开发者开关开着：密码可以空着（开关开着时注册的账号没有密码）
    if (!name.trim() || (!password && !isDev())) return setError(L("请输入姓名和密码。", "Please enter your name and password."));
    setBusy(true);
    const ok = await loginHere(name, password);
    if (!ok) {
      setBusy(false);
      return setError(lastAuthError() ?? L("姓名或密码不对，请再试一次。", "Name or password is wrong. Please try again."));
    }
    reloadAccount();
    router.replace("/");
  };

  return (
    <div className="onboarding-shell">
      <SmoothieHeader />
      <main className="onboarding-main is-register">
        <Link href="/welcome" className="onboarding-back">
          <ChevronLeft className="h-5 w-5" />
          {L("返回", "Back")}
        </Link>
        <div className="login-layout">
          <SmoothieAppMark />
          <section className="registration-card login-card" aria-labelledby="login-heading">
            <header className="registration-card-header">
              <div>
                <p className="registration-eyebrow">{L("欢迎回来", "WELCOME BACK")}</p>
                <h1 id="login-heading">{L("欢迎回来。", "Welcome back.")}</h1>
                <p className="guide-description">{L("使用姓名和密码，打开你的个人档案。", "Use your name and password to open your profile.")}</p>
              </div>
            </header>
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <div className="field">
                <label htmlFor="login-name">{L("姓名（用户名）", "Name (user name)")}</label>
                <input
                  id="login-name"
                  autoComplete="username"
                  maxLength={120}
                  placeholder={L("请输入注册时的姓名", "The name you signed up with")}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError(null);
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="login-password">{L("密码", "Password")}</label>
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  maxLength={128}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                />
              </div>
              {error && (
                <p role="alert" className="smoothie-alert">
                  <AlertCircle aria-hidden="true" />
                  <span>{error}</span>
                </p>
              )}
              <button className="smoothie-button" type="submit" disabled={busy}>
                {busy ? L("正在登录…", "Signing in…") : L("登录", "Sign in")}
                <span aria-hidden="true">→</span>
              </button>
            </form>
            <p className="login-register">
              {L("还没有账号？", "No account yet?")}
              <Link href="/onboarding" className="text-button">
                {L("建立个人档案", "Make a profile")}
              </Link>
            </p>
            <p className="login-register">
              {L("看演示（不用密码）：", "See a demo (no password):")}
              <Link href="/demo/lin" className="text-button">
                {L("林叔", "Uncle Lin")}
              </Link>
            </p>
          </section>
        </div>
      </main>
      <SmoothieFooter />
    </div>
  );
}
