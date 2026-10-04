"use client";

import { useState } from "react";
import { ChevronRight, MessageCircleQuestion, Pill } from "lucide-react";
import type { ThreadItem } from "@/lib/types";
import { explainPart } from "@/lib/reminders";
import { cn } from "@/lib/utils";
import { Button, Card, IconTile, Spinner, inputCls } from "@/components/ui";

/* 医嘱 b: pick the part to be explained, or just say what is unclear. */

export function ExplainCard({ item }: { item: Extract<ThreadItem, { kind: "explain" }> }) {
  const [working, setWorking] = useState<string | null>(null);
  const [text, setText] = useState("");

  const go = async (part: string) => {
    if (working || !part.trim()) return;
    setWorking(part);
    try {
      await explainPart(item.ordersItemId, part.trim());
    } finally {
      setWorking(null);
    }
  };

  return (
    <Card tone="raised" className="animate-pop p-5">
      <h2 className="t-heading flex items-center gap-3 text-ink">
        <IconTile>
          <MessageCircleQuestion />
        </IconTile>
        想弄明白哪一部分？
      </h2>
      <p className="t-body mt-2 text-ink-2">点一个，我用大白话讲。也可以在下面直接问。</p>
      {/* the parts as rows of a list, the way Settings lists things that open: tile, name, chevron */}
      <div className="mt-5 grid gap-2">
        {item.parts.map((p) => (
          <button
            key={p}
            type="button"
            disabled={working != null}
            onClick={() => void go(p)}
            className={cn(
              "press material flex min-h-14 w-full items-center gap-3 rounded-2xl border border-line/70 py-2 pr-4 pl-2 text-left text-lg font-medium text-ink transition duration-200 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-60",
              working === p && "border-brand-200 bg-brand-50 text-brand-800 opacity-100",
            )}
          >
            <IconTile size="sm">
              <Pill />
            </IconTile>
            <span className="min-w-0 flex-1">{p}</span>
            {working === p ? <Spinner className="h-5 w-5" /> : <ChevronRight className="h-5 w-5 shrink-0 text-ink-3" />}
          </button>
        ))}
      </div>
      <form
        className="mt-5 flex gap-2 border-t border-line pt-5"
        onSubmit={(e) => {
          e.preventDefault();
          const q = text;
          setText("");
          void go(q);
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="比如：这个药能和降压药一起吃吗"
          aria-label="想问的"
          className={cn(inputCls, "material min-h-13 min-w-0 flex-1 rounded-full border-line/80")}
        />
        <Button type="submit" size="lg" className="px-6" disabled={working != null || !text.trim()}>
          问
        </Button>
      </form>
      {working && (
        <p className="mt-4 flex items-center gap-2.5 text-base text-ink-2" role="status">
          <Spinner className="h-5 w-5" />
          正在讲解，稍等
        </p>
      )}
    </Card>
  );
}
