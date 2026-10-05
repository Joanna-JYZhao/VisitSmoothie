"use client";

import { Trash2 } from "lucide-react";
import type { Entry, Episode } from "@/lib/types";
import { useStore } from "@/lib/store";
import { cn, feelWord, fmtDate, severityTone, sortedEntries } from "@/lib/utils";
import { useToast } from "./Toast";

const SOURCE_LABEL: Record<Entry["source"], string> = { user: "自己说的", checkin: "回答追问", ai: "对话里记下" };
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
    toast.show("已删掉这一条", "neutral", { label: "撤销", onClick: () => restoreEpisode(snapshot) });
  };
  if (!entries.length) return <p className="py-4 text-lg text-ink-2">还没有记录。</p>;
  return (
    <ol className="relative ml-2 space-y-5 border-l-2 border-line pl-5">
      {entries.map((e) => {
        const facts = [
          e.temp != null ? `体温 ${e.temp}℃` : "",
          // the estimate behind a one-tap answer is for the chart only; the answer already says it
          e.severity != null && e.source !== "checkin" ? (e.exact ? `自己打的分：${e.severity}/10` : feelWord(e.severity)) : "",
          e.location ?? "",
        ].filter(Boolean);
        return (
          <li key={e.id} className="relative">
            <span className={cn("absolute top-2 -left-[29px] h-3.5 w-3.5 rounded-full border-2 border-surface", DOT[severityTone(e.severity)])} />
            <div className="text-base text-ink-2">
              <span className="tabular-nums">{fmtDate(e.at, { time: true })}</span>
              <span aria-hidden="true"> · </span>
              {SOURCE_LABEL[e.source]}
            </div>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="mt-0.5 text-lg leading-relaxed text-ink">{e.note}</p>
                {facts.length > 0 && <p className="mt-0.5 text-base text-ink-2">{facts.join(" · ")}</p>}
              </div>
              {entries.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(e)}
                  aria-label={`删掉这一条：${e.note}`}
                  className="-mt-1 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-3 transition hover:bg-danger-bg hover:text-danger focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
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
