"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { reloadAccount, useStore } from "@/lib/store";
import { lastAuthError, loginHere } from "@/lib/accounts";
import { isDev } from "@/lib/dev";
import { SmoothieFooter, SmoothieHeader } from "@/components/Smoothie";
import "../welcome/smoothie.css";

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
    if (!name.trim() || (!password && !isDev())) return setError("请输入姓名和密码。");
    setBusy(true);
    const ok = await loginHere(name, password);
    if (!ok) {
      setBusy(false);
      return setError(lastAuthError() ?? "姓名或密码不对，请再试一次。");
    }
    reloadAccount();
    router.replace("/");
  };

  return (
    <div className="onboarding-shell">
      <SmoothieHeader />
      <main className="onboarding-main is-register">
        <Link href="/welcome" className="onboarding-back">
          <ChevronLeft className="h-4 w-4" />
          返回
        </Link>
        <div className="login-layout">
          <section className="registration-card login-card" aria-labelledby="login-heading">
            <header className="registration-card-header">
              <div>
                <p className="registration-eyebrow">WELCOME BACK</p>
                <h1 id="login-heading">欢迎回来。</h1>
                <p className="guide-description">使用姓名和密码，打开你的个人档案。</p>
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
                <label htmlFor="login-name">姓名（用户名）</label>
                <input
                  id="login-name"
                  autoComplete="username"
                  maxLength={120}
                  placeholder="请输入注册时的姓名"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError(null);
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="login-password">密码</label>
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
                  {error}
                </p>
              )}
              <button className="smoothie-button" type="submit" disabled={busy}>
                {busy ? "正在登录…" : "登录"}
                <span aria-hidden="true">→</span>
              </button>
            </form>
            <p className="login-register">
              还没有账号？
              <Link href="/onboarding" className="text-button">
                建立个人档案
              </Link>
            </p>
            <p className="login-register">
              看演示（不用密码）：
              <Link href="/demo/lin" className="text-button">
                林叔
              </Link>
            </p>
          </section>
        </div>
      </main>
      <SmoothieFooter />
    </div>
  );
}
