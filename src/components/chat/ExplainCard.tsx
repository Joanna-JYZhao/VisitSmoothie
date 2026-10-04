"use client";

import { useState } from "react";
import type { ThreadItem } from "@/lib/types";
import { explainPart } from "@/lib/reminders";
import { Button, Card, Spinner } from "@/components/ui";

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
    <Card className="p-5">
      <h2 className="text-lg font-semibold text-brand-800">想弄明白哪一部分？</h2>
      <p className="mt-1 text-base text-ink">点一个，我用大白话讲。也可以在下面直接问。</p>
      <div className="mt-3 grid gap-2">
        {item.parts.map((p) => (
          <Button key={p} variant="secondary" size="lg" className="justify-start text-left" disabled={working != null} onClick={() => void go(p)}>
            {working === p && <Spinner className="h-5 w-5" />}
            {p}
          </Button>
        ))}
      </div>
      <form
        className="mt-3 flex gap-2"
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
          className="min-h-12 min-w-0 flex-1 rounded-xl border-2 border-line-strong bg-surface px-3 text-lg text-ink placeholder:text-ink-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
        />
        <Button type="submit" disabled={working != null || !text.trim()}>
          问
        </Button>
      </form>
      {working && (
        <p className="mt-2 flex items-center gap-2 text-base text-ink" role="status">
          <Spinner className="h-5 w-5" />
          正在讲解，稍等
        </p>
      )}
    </Card>
  );
}
