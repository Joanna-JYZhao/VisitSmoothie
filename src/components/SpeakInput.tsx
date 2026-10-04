"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { L } from "@/lib/lang";
import { cn } from "@/lib/utils";
import { MicButton } from "./MicButton";

/**
 * The one way to tell the assistant something: type a sentence or say it, then send.
 * Speech lands in the box as text first, so it can be checked before it is sent.
 */
export function SpeakInput({
  placeholder,
  onSubmit,
  disabled = false,
  autoFocus = false,
  className,
  ariaLabel,
}: {
  placeholder: string;
  onSubmit: (text: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  // grow with the text, up to about five lines
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 170)}px`;
  }, [text]);

  const submit = () => {
    const t = text.trim();
    if (!t || disabled) return;
    onSubmit(t);
    setText("");
  };

  return (
    <div
      className={cn(
        "material flex items-end gap-2 rounded-[30px] border border-line/80 bg-surface p-2 transition duration-200 focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-100",
        className,
      )}
    >
      <textarea
        ref={ref}
        rows={1}
        value={text}
        autoFocus={autoFocus}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.nativeEvent as KeyboardEvent).isComposing) return;
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="min-h-12 flex-1 resize-none bg-transparent px-3 py-2.5 text-lg leading-relaxed text-ink outline-none placeholder:text-ink-3"
      />
      <MicButton onText={(t) => setText((x) => (x ? `${x}${t}` : t))} disabled={disabled} />
      <button
        type="button"
        onClick={submit}
        disabled={disabled || !text.trim()}
        aria-label={L("发送", "Send")}
        className="press flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-linear-to-b from-brand-600 to-brand-650 text-white shadow-btn transition duration-200 hover:from-brand-650 hover:to-brand-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:bg-line-strong disabled:bg-none disabled:shadow-none"
      >
        <ArrowUp className="h-6 w-6" strokeWidth={2.4} />
      </button>
    </div>
  );
}
