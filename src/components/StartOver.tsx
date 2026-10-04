"use client";

import { RotateCcw } from "lucide-react";
import { L } from "@/lib/lang";
import { Button, TextButton } from "@/components/ui";

/**
 * 开新的: drops what is in progress (the conversation in pre, the Clinical Plan in post) and starts
 * again. Asked once more in place, never with a browser dialog: `what` says what would be lost.
 */
export function StartOver({
  confirming,
  onAsk,
  onCancel,
  onConfirm,
  what,
  compact,
}: {
  confirming: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  what: string;
  /** a small button for a header row */
  compact?: boolean;
}) {
  if (confirming) {
    return (
      <div role="alertdialog" aria-label={L("开新的", "Start a new one")} className="animate-fade-up rounded-card border border-warn/25 bg-warn-bg px-4 py-4">
        <p className="t-body text-ink">{what}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="secondary" className="press" onClick={onCancel}>
            {L("继续这一次", "Keep going")}
          </Button>
          <Button variant="dangerSoft" className="press" onClick={onConfirm}>
            {L("放弃，开新的", "Drop it, start new")}
          </Button>
        </div>
      </div>
    );
  }
  return compact ? (
    <TextButton className="shrink-0 gap-1" onClick={onAsk}>
      <RotateCcw aria-hidden="true" className="h-4.5 w-4.5" />
      {L("开新的", "Start new")}
    </TextButton>
  ) : (
    <Button variant="ghost" size="lg" className="press w-full gap-2" onClick={onAsk}>
      <RotateCcw aria-hidden="true" className="h-5 w-5" />
      {L("放弃这次，开新的", "Drop this one and start new")}
    </Button>
  );
}
