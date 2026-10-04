"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { canRecord, startRecording, transcribeRecording, type ActiveRecording } from "@/lib/audio";
import { L } from "@/lib/lang";
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
  label = L("说给我听", "Speak to me"),
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
      else toast.show(L("没听清，再说一遍试试", "I didn't catch that. Please say it again."));
    } catch (err) {
      console.warn("[医伴] 语音识别失败", err);
      toast.show(L("这次没听出来，可以再试一次，或者直接打字", "I couldn't make that out. Try again, or type it."), "danger");
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
      toast.show(
        denied
          ? L("没有拿到麦克风权限。请在浏览器里允许使用麦克风，或者直接打字", "I can't use the microphone. Allow it in your browser, or type instead.")
          : L("这台设备暂时录不了音，可以直接打字", "This device can't record right now. You can type instead."),
        "danger",
      );
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
    /* Full-width speaking control, sized like the other input actions. */
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || phase === "working"}
        aria-label={phase === "recording" ? L("说完了，停止录音", "Done speaking, stop recording") : label}
        className={cn(
          "press relative flex min-h-14 w-full flex-wrap items-center justify-center gap-2 overflow-hidden rounded-xl border px-3 py-2 text-center transition duration-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200",
          phase === "recording" ? "border-danger/20 bg-danger-bg" : "material border-line/70 bg-surface hover:border-brand-200",
          phase !== "working" && "disabled:opacity-60",
          className,
        )}
      >
        {phase === "working" ? (
          <>
            <span aria-hidden="true" className="relative flex h-8 w-8 items-center justify-center">
              <span className="spinner-ring absolute inset-0 border-[3px]" />
              <Mic className="h-5 w-5 text-brand-700" />
            </span>
            <span className="text-base font-medium text-brand-800">{L("正在听写", "Writing it down")}</span>
          </>
        ) : phase === "recording" ? (
          <>
            <span aria-hidden="true" className="relative flex h-8 w-8 items-center justify-center">
              <span className="tile-danger relative flex h-8 w-8 items-center justify-center rounded-full text-white">
                <Square className="h-6 w-6 fill-current" />
              </span>
            </span>
            <span className="text-base font-medium tabular text-danger">{L(`正在听 ${clock(seconds)}`, `Listening ${clock(seconds)}`)}</span>
            <span className="text-base text-ink-2">{L("说完了点这里", "Tap here when done")}</span>
          </>
        ) : (
          <>
            <span aria-hidden="true" className="relative flex h-8 w-8 items-center justify-center">
              <span className="tile-brand relative flex h-8 w-8 items-center justify-center rounded-full text-white">
                <Mic className="h-5 w-5" />
              </span>
            </span>
            <span className="text-base font-medium text-brand-800">{label}</span>
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
      aria-label={
        phase === "recording"
          ? L("说完了，停止录音", "Done speaking, stop recording")
          : phase === "working"
            ? L("正在听写", "Writing it down")
            : L("用说的", "Speak")
      }
      title={phase === "recording" ? L("说完了点这里", "Tap here when done") : L("用说的", "Speak")}
      className={cn(
        "press relative flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-full transition duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-60",
        phase === "recording" ? "tile-danger px-4 text-white" : "w-12 bg-brand-50 text-brand-700 hover:bg-brand-100",
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
