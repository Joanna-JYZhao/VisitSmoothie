"use client";

import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useToast } from "./Toast";
import { L } from "@/lib/lang";

const TRIAL = "English is a trial version. What you recorded yourself stays as you wrote it.";

/**
 * 中 / EN. The button shows the language it switches to. The choice is saved with the rest of the
 * settings. English is newer than Chinese here, and says so once when it is turned on.
 *
 * `segmented`: both languages side by side in one small pill, the one in use filled in, each half
 * its own 48px target. Used on the way in (welcome, login) and on the set page, where it sits beside other things
 * and should say at a glance which language is on.
 */
export function LangToggle({ className, segmented = false }: { className?: string; segmented?: boolean }) {
  const { state, setLanguage } = useStore();
  const toast = useToast();
  const english = state.settings.lang === "en";
  const choose = (lang: "zh" | "en") => {
    if ((lang === "en") === english) return;
    setLanguage(lang);
    if (lang === "en") toast.show(TRIAL);
  };

  if (segmented) {
    const half = (lang: "zh" | "en", label: string, aria: string) => {
      const on = (lang === "en") === english;
      return (
        <button
          type="button"
          aria-pressed={on}
          aria-label={aria}
          lang={lang === "en" ? "en" : "zh-CN"}
          onClick={() => choose(lang)}
          className={cn(
            "press inline-flex min-h-12 min-w-12 items-center justify-center rounded-full px-2.5 text-base font-semibold whitespace-nowrap transition duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200",
            // the one in use: a white tab standing up out of the pill (as an iOS segmented control), quieter than the red SOS beside it
            on ? "bg-surface text-brand-800 shadow-pill ring-1 ring-brand-600/40 ring-inset" : "text-ink-2 hover:text-brand-800",
          )}
        >
          {label}
        </button>
      );
    };
    return (
      <div
        role="group"
        aria-label={L("语言", "Language")}
        className={cn("no-print inline-flex shrink-0 items-center rounded-full bg-surface-2 ring-1 ring-line/80", className)}
      >
        {half("zh", "中", "中文")}
        {half("en", "EN", "English")}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => choose(english ? "zh" : "en")}
      aria-label={english ? "切换到中文" : "Switch to English"}
      title={english ? "切换到中文" : "Switch to English"}
      className={cn(
        // as tall as the two places beside it, and quiet: it is used once, not every day
        "press no-print material inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-full border border-line/80 px-4 text-base font-semibold tracking-[0.01em] whitespace-nowrap text-ink-2 transition duration-200 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200",
        className,
      )}
    >
      {english ? "中文" : "EN"}
    </button>
  );
}
