import type { Lang } from "./types";

/*
 * Which language the app speaks. One module-level value, kept in step with the saved setting by
 * the store (in the browser) and set from the request by each API route (on the server). Code
 * anywhere can then say L("中文", "English") without threading a parameter through every call.
 *
 * Chinese is the default and the reference: with the language left alone, every sentence the
 * app produces is exactly what it was before English existed.
 */

let current: Lang = "zh";

export function getLang(): Lang {
  return current;
}

/** Anything other than "en" means Chinese, so a missing or odd value can never break a page. */
export function setLang(lang: unknown): void {
  current = lang === "en" ? "en" : "zh";
}

/** The wording for the current language. Chinese first, English second, always in that order. */
export function L(zh: string, en: string): string {
  return current === "en" ? en : zh;
}

/** The same choice for things that are not plain strings (lists, objects, functions). */
export function pick<T>(zh: T, en: T): T {
  return current === "en" ? en : zh;
}

/**
 * Runs `fn` with the language forced to Chinese, whatever the interface shows. For now the
 * assistant, the server and everything that checks them work in Chinese only, so whatever is
 * sent to the server, and any document the server will later regenerate (the page for the
 * doctor, the yearly summary), is built in Chinese. Without this an English date would end up
 * inside a Chinese sentence, and the doctor's page would change wording when the server's
 * version replaced the one built in the browser. Synchronous code only.
 */
export function inChinese<T>(fn: () => T): T {
  const before = current;
  current = "zh";
  try {
    return fn();
  } finally {
    current = before;
  }
}

/**
 * Added to every model request while the app is in English. The prompts themselves stay in
 * Chinese (they are tuned and tested that way); only the language of what comes back changes.
 */
export const ENGLISH_OUTPUT =
  "IMPORTANT: the reader uses English. Write every piece of text that a person will read (replies, answers, notes, titles, summaries, hints, suggested replies, questions for the doctor) in plain, simple English. Keep the JSON keys and the fixed enum values exactly as specified above. Copy medicine names, hospital names and anything quoted from the records as they are written there, without translating or changing numbers.";
