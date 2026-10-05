"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { canRecord, startRecording, transcribeRecording, type ActiveRecording } from "@/lib/audio";
import { L } from "@/lib/lang";
import { canBrowserListen, checkServerSpeech, markServerSpeechBroken, serverSpeechKnown, startListening, type ListenError, type Listening } from "@/lib/speech";
import { cn } from "@/lib/utils";
import { useToast } from "./Toast";

/** What to say when the browser's own listening failed. */
export function listenProblemText(code: string): string {
  if (code === "not-allowed" || code === "service-not-allowed")
    return L(
      "没有拿到麦克风或语音识别的权限。请在浏览器里允许（iPhone 还要在设置里打开「Siri 与听写」），或者直接打字。",
      "I can't use the microphone or speech recognition. Allow it in your browser (on iPhone, also turn on Siri & Dictation in Settings), or type instead.",
    );
  return L("这台设备暂时用不了语音输入，请打字。", "Voice input isn't working on this device right now. Please type instead.");
}

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
  pill = false,
  label = L("说给我听", "Speak to me"),
  className,
  disabled,
}: {
  onText: (text: string) => void;
  maxSeconds?: number;
  big?: boolean;
  /** with `big`: a filled capsule, the height of the round buttons beside it (the chat's input bar) */
  pill?: boolean;
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const recording = useRef<ActiveRecording | null>(null);
  // the browser listening by itself, when the speech service can't be used
  const listening = useRef<Listening | null>(null);

  // the answer is needed at the tap: Safari only lets listening start straight from a tap
  useEffect(() => {
    void checkServerSpeech();
  }, []);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);

  const clearTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const finish = useCallback(async () => {
    const rec = recording.current;
    const lis = listening.current;
    if (!rec && !lis) return;
    recording.current = null;
    listening.current = null;
    clearTimer();
    setPhase("working");
    try {
      if (lis) {
        const text = await lis.stop();
        if (text) onText(text);
        else toast.show(L("没听清，再说一遍试试", "I didn't catch that. Please say it again."));
        return;
      }
      const text = await transcribeRecording(await rec!.stop());
      if (text) onText(text);
      else toast.show(L("没听清，再说一遍试试", "I didn't catch that. Please say it again."));
    } catch (err) {
      console.warn("[医伴] 语音识别失败", err);
      if (lis) toast.show(listenProblemText((err as ListenError).code ?? ""), "danger");
      else {
        // the speech service failed: from now on the browser listens by itself
        markServerSpeechBroken();
        toast.show(
          canBrowserListen()
            ? L("刚才没转成文字。请再点一次话筒，重新说一遍。", "That didn't go through. Tap the microphone and say it once more.")
            : L("语音没转成文字，请直接打字。", "Your speech couldn't be turned into text. Please type instead."),
          "danger",
        );
      }
    } finally {
      setPhase("idle");
      setSeconds(0);
    }
  }, [onText, toast]);

  const startTimer = () => {
    startedAt.current = Date.now();
    setSeconds(0);
    setPhase("recording");
    timer.current = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt.current) / 1000);
      setSeconds(s);
      if (s >= maxSeconds) void finish();
    }, 250);
  };

  const begin = async () => {
    // the speech service works (or may work, while still being checked and the browser can't listen): record
    const server = serverSpeechKnown();
    const useServer = canRecord() && (server === true || (server == null && !canBrowserListen()));
    if (!useServer) {
      if (!canBrowserListen()) {
        toast.show(L("这台设备用不了语音输入，请打字。", "Voice input doesn't work on this device. Please type instead."), "danger");
        return;
      }
      try {
        listening.current = startListening((err) => {
          // permission refused or no service: stop and say so
          if (!listening.current) return;
          listening.current.cancel();
          listening.current = null;
          clearTimer();
          setPhase("idle");
          setSeconds(0);
          toast.show(listenProblemText(err.code), "danger");
        });
      } catch (err) {
        toast.show(listenProblemText((err as ListenError).code ?? ""), "danger");
        return;
      }
      startTimer();
      return;
    }
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
    startTimer();
  };

  // leaving the page while recording throws the recording away and frees the microphone
  useEffect(
    () => () => {
      clearTimer();
      recording.current?.cancel();
      recording.current = null;
      listening.current?.cancel();
      listening.current = null;
    },
    [],
  );

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
          "press relative flex w-full flex-wrap items-center justify-center gap-2 overflow-hidden text-center transition duration-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200",
          pill ? "min-h-12 rounded-full px-3 py-1.5" : "min-h-14 rounded-xl border px-3 py-2",
          pill
            ? phase === "recording"
              ? "bg-danger-bg"
              : "bg-surface-2 hover:bg-brand-50"
            : phase === "recording"
              ? "border-danger/20 bg-danger-bg"
              : "material border-line/70 bg-surface hover:border-brand-200",
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
