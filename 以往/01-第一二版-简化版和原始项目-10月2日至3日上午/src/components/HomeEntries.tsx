"use client";

import Link from "next/link";
import { ArrowRight, ChevronRight, MessageCircleQuestion, Siren, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
import { TileLink, focusRing } from "./ui";

/** Keeps a phrase together, so a narrow phone breaks the sentence between phrases and not inside one. */
function Phrase({ children }: { children: React.ReactNode }) {
  return <span className="inline-block">{children}</span>;
}

/**
 * 去看医生: the way into "say it once, get the page for the doctor". It is the loudest thing on
 * the home screen.
 *
 * `compact`: there are cards below it (a symptom being tracked, today's number), so it is one
 * short bar and today's question stays on the first screen.
 * `quiet`: another card already holds today's main button, so it steps back to an outline. Two
 * solid buttons never compete.
 */
export function VisitEntry({ compact = false, quiet = false }: { compact?: boolean; quiet?: boolean }) {
  const small = compact || quiet;
  return (
    <Link
      href="/visit"
      className={cn(
        "flex items-center rounded-card transition active:scale-[0.99]",
        focusRing,
        small ? "gap-2.5 px-3.5 py-3" : "gap-3 px-4 py-[1.125rem]",
        quiet
          ? "border-2 border-brand-600 bg-surface shadow-edge hover:bg-brand-50"
          : "bg-linear-to-br from-brand-600 to-brand-700 text-white shadow-hero hover:from-brand-700 hover:to-brand-700",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
          quiet ? "bg-brand-50 text-brand-700" : "bg-white/15 text-white ring-1 ring-white/25",
        )}
      >
        <Stethoscope className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block leading-tight font-semibold", small ? "text-xl" : "text-2xl", quiet ? "text-brand-800" : "text-white")}>
          去看医生
        </span>
        {/* full white, not a faded white: on the lighter end of the gradient anything less drops below 4.5:1 */}
        <span className={cn("mt-0.5 block text-base leading-snug text-balance", quiet ? "text-ink-2" : "text-white")}>
          {small ? (
            <>
              <Phrase>说一遍，</Phrase>
              <Phrase>整理成一页给医生</Phrase>
            </>
          ) : (
            // two even lines on a phone: the question, then what happens
            "要去医院了？说一遍，我整理成一页交给医生"
          )}
        </span>
      </span>
      {small ? (
        <ChevronRight aria-hidden="true" className={cn("h-5 w-5 shrink-0", quiet ? "text-brand-700" : "text-white")} />
      ) : (
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-brand-700 shadow-edge">
          <ArrowRight className="h-5 w-5" />
        </span>
      )}
    </Link>
  );
}

/** The two quieter ways in, side by side under 去看医生. */
export function QuickEntries() {
  return (
    <div className="grid grid-cols-2 gap-3">
      <TileLink
        href="/ask"
        icon={<MessageCircleQuestion className="h-5 w-5" />}
        title="问医伴"
        detail={
          <>
            <Phrase>记不清的，</Phrase>
            <Phrase>问我</Phrase>
          </>
        }
      />
      {/* red on the icon only: it has to be found in a hurry, not noticed every day */}
      <TileLink
        href="/sos"
        icon={<Siren className="h-5 w-5" />}
        iconTone="danger"
        title="应急手册"
        detail={
          <>
            <Phrase>突发状况时</Phrase>
            <Phrase>打开</Phrase>
          </>
        }
      />
    </div>
  );
}
