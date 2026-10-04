import { Activity, CalendarClock, TrendingDown, TriangleAlert } from "lucide-react";
import type { Insight } from "@/lib/types";
import { cn } from "@/lib/utils";
import { IconTile } from "./ui";

const ICON = { low: TriangleAlert, streak: Activity, recent: Activity, trend: TrendingDown, overdue: CalendarClock } as const;

/** What the readings say, one row each: a tile for the kind of thing, the finding, and a line about it. */
export function InsightList({ insights, className }: { insights: Insight[]; className?: string }) {
  if (!insights.length) return null;
  return (
    <ul className={cn("divide-y divide-line", className)}>
      {insights.map((i, idx) => {
        const Icon = ICON[i.kind];
        const attention = i.level !== "info";
        return (
          <li key={idx} className="flex animate-fade-up gap-4 py-4 first:pt-0 last:pb-0" style={{ animationDelay: `${idx * 50}ms` }}>
            <IconTile tone={attention ? "warn" : "brand"}>
              <Icon />
            </IconTile>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="text-lg leading-snug font-semibold tracking-[-0.005em] text-ink">
                {i.title}
                {attention && <span className="ml-2 text-base font-medium text-warn">最近的，值得留意</span>}
              </div>
              <p className="t-body mt-1 text-ink-2">{i.text}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
