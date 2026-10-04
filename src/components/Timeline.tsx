"use client";

import { Trash2 } from "lucide-react";
import type { Entry, Episode } from "@/lib/types";
import { useStore } from "@/lib/store";
import { cn, feelWord, fmtDate, severityTone, sortedEntries } from "@/lib/utils";
import { L } from "@/lib/lang";
import { useToast } from "./Toast";
import { focusRing } from "./ui";

const SOURCE_ZH: Record<Entry["source"], string> = { user: "自己说的", checkin: "回答追问", ai: "对话里记下" };
const SOURCE_EN: Record<Entry["source"], string> = { user: "In my words", checkin: "Check-in answer", ai: "From the chat" };
const sourceLabel = (s: Entry["source"]) => L(SOURCE_ZH[s], SOURCE_EN[s]);
/** The patient's own words for how bad it was, as shown (the Chinese is the rule's word). */
const feelShown = (s: number) =>
  L(feelWord(s), s === 0 ? "Feeling fine" : s <= 3 ? "A little unwell" : s <= 6 ? "Quite unwell" : "Very unwell");
const DOT: Record<ReturnType<typeof severityTone>, string> = {
  neutral: "bg-ink-3",
  good: "bg-good",
  warn: "bg-warn",
  serious: "bg-serious",
  danger: "bg-danger",
};

/** Everything recorded about one symptom, newest first, in the user's own words. */
export function Timeline({ episode }: { episode: Episode }) {
  const { updateEpisode, restoreEpisode } = useStore();
  const toast = useToast();
  const entries = sortedEntries(episode, "desc");
  // A line that is wrong ("呕吐" that never happened) can be taken out, so it never reaches the doctor.
  const remove = (entry: Entry) => {
    const snapshot = episode;
    updateEpisode(episode.id, (e) => ({ ...e, entries: e.entries.filter((x) => x.id !== entry.id) }));
    toast.show(L("已删掉这一条", "Removed"), "neutral", { label: L("撤销", "Undo"), onClick: () => restoreEpisode(snapshot) });
  };
  if (!entries.length) return <p className="t-body rounded-2xl bg-surface-2/70 px-5 py-8 text-center text-ink-2">{L("还没有记录。", "No records yet.")}</p>;
  return (
    // a hairline spine down the left; each entry hangs off it by a dot in the colour of how bad it was
    <ol className="relative ml-[7px] space-y-7 border-l border-line-strong pl-7">
      {entries.map((e, i) => {
        const facts = [
          e.temp != null ? L(`体温 ${e.temp}℃`, `Temp ${e.temp}℃`) : "",
          // the estimate behind a one-tap answer is for the chart only; the answer already says it
          e.severity != null && e.source !== "checkin" ? (e.exact ? L(`自己打的分：${e.severity}/10`, `My score: ${e.severity}/10`) : feelShown(e.severity)) : "",
          e.location ?? "",
        ].filter(Boolean);
        return (
          <li key={e.id} className="relative animate-fade-up" style={{ animationDelay: `${Math.min(i, 6) * 50}ms` }}>
            <span
              aria-hidden="true"
              className={cn("absolute top-[0.3rem] -left-[calc(2.25rem+0.5px)] h-4 w-4 rounded-full ring-4 ring-surface", DOT[severityTone(e.severity)])}
            />
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-base font-medium text-ink-2">
                  <span className="tabular">{fmtDate(e.at, { time: true })}</span>
                  <span aria-hidden="true"> · </span>
                  {sourceLabel(e.source)}
                </p>
                <p className="mt-1.5 text-lg leading-relaxed text-ink">{e.note}</p>
                {facts.length > 0 && (
                  <p className="mt-2 flex flex-wrap gap-2">
                    {facts.map((f) => (
                      <span key={f} className="inline-flex min-h-8 items-center rounded-full bg-surface-2 px-3 text-base font-medium text-ink-2 tabular">
                        {f}
                      </span>
                    ))}
                  </p>
                )}
              </div>
              {entries.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(e)}
                  aria-label={L(`删掉这一条：${e.note}`, `Remove this: ${e.note}`)}
                  className={cn(
                    "press -mt-1.5 -mr-3 flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-ink-3 transition duration-200 hover:bg-danger-bg hover:text-danger",
                    focusRing,
                  )}
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
