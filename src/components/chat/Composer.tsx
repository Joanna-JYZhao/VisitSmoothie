"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, Camera, Keyboard, Mic } from "lucide-react";
import { MicButton } from "@/components/MicButton";
import { useAiAvailable } from "@/components/AiStatus";

/** Typing instead of speaking: one box that grows with the text, and a button to send it. */
function TypeBox({ onSend, disabled }: { onSend: (text: string) => void; disabled?: boolean }) {
  const [text, setText] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, [text]);
  const send = () => {
    const said = text.trim();
    if (!said || disabled) return;
    onSend(said);
    setText("");
  };
  return (
    <div className="flex items-end gap-1.5 rounded-2xl border-2 border-line-strong bg-surface p-1.5 transition focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100">
      <textarea
        ref={box}
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.nativeEvent as KeyboardEvent).isComposing) return;
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        placeholder="在这里打字"
        aria-label="对医伴说"
        className="min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-lg leading-relaxed text-ink outline-none placeholder:text-ink-3"
      />
      <button
        type="button"
        onClick={send}
        disabled={disabled || !text.trim()}
        aria-label="发送"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:bg-line-strong"
      >
        <ArrowUp className="h-6 w-6" />
      </button>
    </div>
  );
}

const side =
  "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-line-strong bg-surface text-ink-2 transition hover:border-brand-400 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-50";

/** The three things a patient asks for most, said for them with one tap. */
export function QuickOptions({ onPick, disabled }: { onPick: (which: "visit" | "history" | "export") => void; disabled?: boolean }) {
  const options = [
    { key: "visit", label: "去看医生" },
    { key: "history", label: "讲解病史" },
    { key: "export", label: "导出" },
  ] as const;
  return (
    <div className="grid grid-cols-3 gap-2" aria-label="快捷选项">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          disabled={disabled}
          onClick={() => onPick(o.key)}
          className="min-h-12 rounded-2xl bg-brand-50 px-2 text-lg font-medium text-brand-800 transition hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-50"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The input bar: speak (the big button in the middle), type (the keyboard on the left) or
 * take a photo (on the right). Whatever is said is sent at once.
 */
export function Composer({
  onSend,
  onPhotos,
  disabled,
}: {
  onSend: (text: string) => void;
  onPhotos: (files: File[]) => void;
  disabled?: boolean;
}) {
  const canSpeak = useAiAvailable();
  const [typing, setTyping] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  // without a way to listen there is only the keyboard
  const keyboard = typing || !canSpeak;

  return (
    <div className="flex items-end gap-2">
      {canSpeak && (
        <button type="button" className={side} onClick={() => setTyping((t) => !t)} aria-label={keyboard ? "改用说的" : "改用打字"}>
          {keyboard ? <Mic className="h-6 w-6" /> : <Keyboard className="h-6 w-6" />}
        </button>
      )}
      <div className="min-w-0 flex-1">
        {keyboard ? (
          <TypeBox onSend={onSend} disabled={disabled} />
        ) : (
          <MicButton big label="按一下，开始说" maxSeconds={180} onText={onSend} disabled={disabled} />
        )}
      </div>
      <button type="button" className={side} onClick={() => file.current?.click()} disabled={disabled} aria-label="拍照或从相册选">
        <Camera className="h-6 w-6" />
      </button>
      <input
        ref={file}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (picked.length) onPhotos(picked);
        }}
      />
    </div>
  );
}
