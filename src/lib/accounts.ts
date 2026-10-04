/*
 * 注册和登录（B 方案）: accounts kept in this browser, following the teammate's Visit Smoothie
 * flow (name is the username, password 15–128 characters). Each account's records are stored
 * under their own key. This keeps people apart on a shared demo computer; it is not real
 * security, since everything stays in this browser.
 */

import type { Profile } from "./types";
import { isDev } from "./dev";

export interface Account {
  id: string;
  /** the name as typed at registration; also the profile's name */
  name: string;
  /** the name normalised for comparing (case, full-width characters, spaces) */
  key: string;
  /** empty for the demo people, who are entered through their links and have no password */
  salt: string;
  hash: string;
  demo?: boolean;
  createdAt: string;
}

export const ACCOUNTS_KEY = "yiban.accounts";
export const SESSION_KEY = "yiban.session";
/** where the single profile lived before there were accounts */
export const LEGACY_KEY = "yiban.v1";
export const dataKey = (id: string) => `yiban.v1.${id}`;

export const PASSWORD_MIN = 15;
export const PASSWORD_MAX = 128;
const ITERATIONS = 120_000;

export const DEMO_ACCOUNTS: Record<"lin", { id: string; name: string }> = {
  lin: { id: "demo-lin", name: "林叔" },
};

/** Two names that differ only in case, full-width characters or spaces are the same name. */
export function nameKey(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

/** The sentence shown when the password cannot be used, or null when it can. */
export function passwordProblem(password: string, confirm: string): string | null {
  // 开发者开关开着：密码可以不设
  if (isDev()) return null;
  const n = [...password].length;
  if (!n) return "还差：密码。";
  if (n < PASSWORD_MIN) return `密码至少 ${PASSWORD_MIN} 个字，可以用一句好记的话。`;
  if (n > PASSWORD_MAX) return `密码最多 ${PASSWORD_MAX} 个字。`;
  if (password !== confirm) return "两次输入的密码不一样，请再输一次。";
  return null;
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: ITERATIONS },
    base,
    256,
  );
  return hex(bits);
}

const newId = () => crypto.randomUUID();
const newSalt = () => hex(crypto.getRandomValues(new Uint8Array(16)).buffer);

/** Registration on a list of accounts. Pure apart from the hashing, so it can be tested. */
export async function createAccount(
  list: Account[],
  name: string,
  password: string,
  confirm: string,
): Promise<{ account: Account } | { error: string }> {
  const key = nameKey(name);
  if (!key) return { error: "还差：姓名。" };
  if (list.some((a) => a.key === key)) return { error: "这个姓名已经注册过了。是你的话请直接登录；不是的话，换一个能区分的姓名。" };
  const bad = passwordProblem(password, confirm);
  if (bad) return { error: bad };
  const salt = newSalt();
  return {
    account: { id: newId(), name: name.normalize("NFKC").trim().replace(/\s+/g, " "), key, salt, hash: await hashPassword(password, salt), createdAt: new Date().toISOString() },
  };
}

/** The account this name and password open, or null. One message for both mistakes. */
export async function checkLogin(list: Account[], name: string, password: string): Promise<Account | null> {
  const a = list.find((x) => x.key === nameKey(name));
  if (!a || a.demo || !a.hash) return null;
  return (await hashPassword(password, a.salt)) === a.hash ? a : null;
}

/* ---------- this browser ---------- */

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function listAccounts(): Account[] {
  try {
    const raw = storage()?.getItem(ACCOUNTS_KEY);
    const list = raw ? (JSON.parse(raw) as Account[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveAccounts(list: Account[]) {
  storage()?.setItem(ACCOUNTS_KEY, JSON.stringify(list));
}

export function currentAccountId(): string | null {
  try {
    return storage()?.getItem(SESSION_KEY) || null;
  } catch {
    return null;
  }
}

export function currentAccount(): Account | null {
  const id = currentAccountId();
  return id ? (listAccounts().find((a) => a.id === id) ?? null) : null;
}

function setSession(id: string | null) {
  const s = storage();
  if (!s) return;
  if (id) s.setItem(SESSION_KEY, id);
  else s.removeItem(SESSION_KEY);
}

/** The profile kept here from before accounts existed, if any. */
export function legacyProfile(): Profile | null {
  try {
    const raw = storage()?.getItem(LEGACY_KEY);
    if (!raw) return null;
    const p = (JSON.parse(raw) as { profile?: Profile | null }).profile;
    return p && p.name ? p : null;
  } catch {
    return null;
  }
}

/**
 * Registers and logs in. With `takeLegacy`, the profile and records kept here from before
 * accounts existed move into the new account instead of being left behind.
 */
export async function registerHere(name: string, password: string, confirm: string, takeLegacy: boolean): Promise<string | null> {
  const list = listAccounts();
  const res = await createAccount(list, name, password, confirm);
  if ("error" in res) return res.error;
  saveAccounts([...list, res.account]);
  const s = storage();
  if (takeLegacy && s) {
    const raw = s.getItem(LEGACY_KEY);
    if (raw) {
      s.setItem(dataKey(res.account.id), raw);
      s.removeItem(LEGACY_KEY);
    }
  }
  setSession(res.account.id);
  return null;
}

export async function loginHere(name: string, password: string): Promise<boolean> {
  const a = await checkLogin(listAccounts(), name, password);
  if (!a) return false;
  setSession(a.id);
  return true;
}

export function logoutHere() {
  setSession(null);
}

/** Opens a demo person's account, creating it the first time. */
export function enterDemo(persona: "lin") {
  const d = DEMO_ACCOUNTS[persona];
  const list = listAccounts();
  if (!list.some((a) => a.id === d.id)) {
    saveAccounts([...list, { id: d.id, name: d.name, key: `demo:${persona}`, salt: "", hash: "", demo: true, createdAt: new Date().toISOString() }]);
  }
  setSession(d.id);
}
