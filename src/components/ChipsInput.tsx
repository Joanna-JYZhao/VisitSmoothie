"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function ChipsInput({
  value,
  onChange,
  placeholder,
  suggestions = [],
  id,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  id?: string;
}) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const v = raw.trim().replace(/[,，]$/, "");
    setText("");
    if (!v || value.includes(v)) return;
    onChange([...value, v]);
  };
  return (
    <div>
      <div
        className={cn(
          "flex min-h-13 flex-wrap items-center gap-2 rounded-2xl border-2 border-line-strong bg-surface p-2 transition",
          "focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100",
        )}
      >
        {value.map((v) => (
          <span
            key={v}
            className="inline-flex min-h-11 items-center rounded-full bg-brand-50 pl-3.5 text-base text-brand-800"
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== v))}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-brand-700 transition hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
              aria-label={`移除 ${v}`}
            >
              <X className="h-5 w-5" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.nativeEvent as KeyboardEvent).isComposing) return;
            if (e.key === "Enter" || e.key === "," || e.key === "，") {
              e.preventDefault();
              add(text);
            } else if (e.key === "Backspace" && !text && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => text && add(text)}
          placeholder={value.length ? "继续添加…" : placeholder}
          className="h-11 min-w-[140px] flex-1 bg-transparent px-1.5 text-lg outline-none placeholder:text-ink-3"
        />
      </div>
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {suggestions
            .filter((s) => !value.includes(s))
            .map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => add(s)}
                className="min-h-11 rounded-full border border-line-strong bg-surface px-3.5 text-base text-ink-2 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
              >
                + {s}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
