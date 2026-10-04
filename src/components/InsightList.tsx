import { Activity, CalendarClock, TrendingDown, TriangleAlert } from "lucide-react";
import type { Insight } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICON = { low: TriangleAlert, streak: Activity, recent: Activity, trend: TrendingDown, overdue: CalendarClock } as const;

export function InsightList({ insights, className }: { insights: Insight[]; className?: string }) {
  if (!insights.length) return null;
  return (
    <ul className={cn("divide-y divide-line", className)}>
      {insights.map((i, idx) => {
        const Icon = ICON[i.kind];
        const attention = i.level !== "info";
        return (
          <li key={idx} className="flex gap-3 py-3.5 first:pt-0 last:pb-0">
            <span
              className={cn(
                "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                attention ? "bg-warn-bg text-warn" : "bg-brand-50 text-brand-600",
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="text-lg font-medium text-ink">
                {i.title}
                {attention && <span className="ml-2 text-base font-medium text-warn">最近的，值得留意</span>}
              </div>
              <p className="mt-0.5 text-base leading-relaxed text-ink-2">{i.text}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
