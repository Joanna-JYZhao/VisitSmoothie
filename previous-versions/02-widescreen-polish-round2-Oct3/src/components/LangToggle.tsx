"use client";

import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useToast } from "./Toast";

/**
 * 中 / EN. The button shows the language it switches to. The choice is saved with the rest of the
 * settings. English is newer than Chinese here, and says so once when it is turned on.
 */
export function LangToggle({ className }: { className?: string }) {
  const { state, setLanguage } = useStore();
  const toast = useToast();
  const english = state.settings.lang === "en";
  return (
    <button
      type="button"
      onClick={() => {
        setLanguage(english ? "zh" : "en");
        if (!english) toast.show("English is a trial version. What you recorded yourself stays as you wrote it.");
      }}
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
