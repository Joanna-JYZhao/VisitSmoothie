"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { canRecord, startRecording, transcribeRecording, type ActiveRecording } from "@/lib/audio";
import { cn } from "@/lib/utils";
import { useAiAvailable } from "./AiStatus";
import { useToast } from "./Toast";

type Phase = "idle" | "recording" | "working";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * Tap to speak, tap again to stop. What was said comes back as text through `onText`.
 * `big` is the full-width version used where speaking is the main thing to do.
 */
export function MicButton({
  onText,
  maxSeconds = 120,
  big = false,
  label = "说给我听",
  className,
  disabled,
}: {
  onText: (text: string) => void;
  maxSeconds?: number;
  big?: boolean;
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  const toast = useToast();
  const available = useAiAvailable();
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const recording = useRef<ActiveRecording | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);

  const clearTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const finish = useCallback(async () => {
    const rec = recording.current;
    if (!rec) return;
    recording.current = null;
    clearTimer();
    setPhase("working");
    try {
      const text = await transcribeRecording(await rec.stop());
      if (text) onText(text);
      else toast.show("没听清，再说一遍试试");
    } catch (err) {
      console.warn("[医伴] 语音识别失败", err);
      toast.show("这次没听出来，可以再试一次，或者直接打字", "danger");
    } finally {
      setPhase("idle");
      setSeconds(0);
    }
  }, [onText, toast]);

  const begin = async () => {
    try {
      recording.current = await startRecording();
    } catch (err) {
      const denied = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError");
      toast.show(denied ? "没有拿到麦克风权限。请在浏览器里允许使用麦克风，或者直接打字" : "这台设备暂时录不了音，可以直接打字", "danger");
      return;
    }
    startedAt.current = Date.now();
    setSeconds(0);
    setPhase("recording");
    timer.current = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt.current) / 1000);
      setSeconds(s);
      if (s >= maxSeconds) void finish();
    }, 250);
  };

  // leaving the page while recording throws the recording away and frees the microphone
  useEffect(
    () => () => {
      clearTimer();
      recording.current?.cancel();
      recording.current = null;
    },
    [],
  );

  if (!available || !canRecord()) return null;

  const onClick = () => {
    if (phase === "idle") void begin();
    else if (phase === "recording") void finish();
  };

  if (big) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || phase === "working"}
        aria-label={phase === "recording" ? "说完了，停止录音" : label}
        className={cn(
          "flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-card border-2 px-4 py-5 text-center transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 active:scale-[0.99] disabled:opacity-60",
          phase === "recording"
            ? "border-danger bg-danger-bg text-danger"
            : "border-brand-300 bg-brand-50 text-brand-800 hover:border-brand-500 hover:bg-brand-100",
          className,
        )}
      >
        {phase === "working" ? (
          <>
            <Loader2 className="h-9 w-9 animate-spin" />
            <span className="text-xl font-semibold">正在听写</span>
          </>
        ) : phase === "recording" ? (
          <>
            <span className="relative flex h-10 w-10 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-danger/30" />
              <Square className="relative h-7 w-7 fill-current" />
            </span>
            <span className="text-xl font-semibold tabular-nums">正在听 {clock(seconds)}</span>
            <span className="text-base text-ink">说完了点这里</span>
          </>
        ) : (
          <>
            <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-surface text-brand-700 shadow-pill">
              <Mic className="h-7 w-7" />
            </span>
            <span className="text-xl font-semibold">{label}</span>
          </>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || phase === "working"}
      aria-label={phase === "recording" ? "说完了，停止录音" : phase === "working" ? "正在听写" : "用说的"}
      title={phase === "recording" ? "说完了点这里" : "用说的"}
      className={cn(
        "relative flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-xl transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-60",
        phase === "recording" ? "bg-danger px-3.5 text-white" : "w-12 bg-brand-50 text-brand-700 hover:bg-brand-100",
        className,
      )}
    >
      {phase === "working" ? (
        <Loader2 className="h-6 w-6 animate-spin" />
      ) : phase === "recording" ? (
        <>
          <Square className="h-5 w-5 fill-current" />
          <span className="text-base font-semibold tabular-nums">{clock(seconds)}</span>
        </>
      ) : (
        <Mic className="h-6 w-6" />
      )}
    </button>
  );
}
