"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, Camera, Keyboard, Mic } from "lucide-react";
import { MicButton } from "@/components/MicButton";
import { useAiAvailable } from "@/components/AiStatus";
import { L } from "@/lib/lang";

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
    <div className="flex items-end gap-1 rounded-[1.5rem] bg-surface-2 p-0.5 transition duration-200 focus-within:ring-2 focus-within:ring-brand-400">
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
        placeholder={L("在这里打字", "Type here")}
        aria-label={L("对医伴说", "Say it to VisitSmoothie")}
        className="min-h-11 min-w-0 flex-1 resize-none bg-transparent py-2 pr-1 pl-3.5 text-base leading-relaxed text-ink outline-none placeholder:text-ink-3"
      />
      <button
        type="button"
        onClick={send}
        disabled={disabled || !text.trim()}
        aria-label={L("发送", "Send")}
        className="press relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition duration-200 after:absolute after:-inset-1 hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:bg-line-strong disabled:bg-none disabled:shadow-none"
      >
        <ArrowUp className="h-6 w-6" strokeWidth={2.4} />
      </button>
    </div>
  );
}

/** the round controls either side of the box: the same quiet grey fill as the box, brand under the hand */
const side =
  "press flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2 transition duration-200 hover:bg-brand-50 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-50";

/** The three things a patient asks for most, said for them with one tap. */
export function QuickOptions({ onPick, disabled }: { onPick: (which: "visit" | "history" | "export") => void; disabled?: boolean }) {
  const options = [
    { key: "visit", label: L("去看医生", "See a doctor") },
    { key: "history", label: L("讲解病史", "My history") },
    { key: "export", label: L("导出", "Export") },
  ] as const;
  return (
    <div className="grid grid-cols-3 gap-2" aria-label={L("快捷选项", "Quick options")}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          disabled={disabled}
          onClick={() => onPick(o.key)}
          className="press material min-h-12 rounded-xl border border-line/70 px-2 text-base font-medium text-brand-800 transition duration-200 hover:border-brand-200 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-50"
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
        <button type="button" className={side} onClick={() => setTyping((t) => !t)} aria-label={keyboard ? L("改用说的", "Speak instead") : L("改用打字", "Type instead")}>
          {keyboard ? <Mic className="h-6 w-6" /> : <Keyboard className="h-6 w-6" />}
        </button>
      )}
      <div className="min-w-0 flex-1">
        {keyboard ? (
          <TypeBox onSend={onSend} disabled={disabled} />
        ) : (
          <MicButton big pill label={L("按一下，开始说", "Tap to speak")} maxSeconds={180} onText={onSend} disabled={disabled} />
        )}
      </div>
      <button type="button" className={side} onClick={() => file.current?.click()} disabled={disabled} aria-label={L("拍照或从相册选", "Take or choose a photo")}>
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
