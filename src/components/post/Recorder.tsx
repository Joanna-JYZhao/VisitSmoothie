"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { VISIT_MAX_SECONDS, canRecord, clockText, progressText, startRecording, transcribeLong, type ActiveRecording, type LongTranscript } from "@/lib/audio";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui";

type Phase = { kind: "idle" } | { kind: "recording"; seconds: number } | { kind: "working"; done: number; total: number };

/**
 * 录音: the whole visit, up to an hour. Tap to start, tap again to stop. The recording is turned
 * into text and then thrown away; only the text is handed on.
 */
export function Recorder({ onText, onBusy, disabled }: { onText: (t: LongTranscript) => void; onBusy?: (busy: boolean) => void; disabled?: boolean }) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [problem, setProblem] = useState<string | null>(null);
  const rec = useRef<ActiveRecording | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      rec.current?.cancel();
    },
    [],
  );

  const stop = async () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    const r = rec.current;
    rec.current = null;
    if (!r) return;
    setPhase({ kind: "working", done: 0, total: 0 });
    try {
      const blob = await r.stop();
      const result = await transcribeLong(blob, (done, total) => setPhase({ kind: "working", done, total }));
      if (!result.text) setProblem(result.total ? "录音里没听出说话的内容。可以再录一次，或者拍医嘱上传。" : "录音太短了，再录一次试试。");
      else onText(result);
    } catch {
      setProblem("这段录音没处理成，可以再录一次，或者拍医嘱上传。");
    } finally {
      setPhase({ kind: "idle" });
      onBusy?.(false);
    }
  };

  const start = async () => {
    setProblem(null);
    if (!canRecord()) return setProblem("这台设备上录不了音。可以拍医嘱上传。");
    try {
      rec.current = await startRecording();
    } catch {
      return setProblem("没拿到麦克风。请在浏览器里允许使用麦克风，或者拍医嘱上传。");
    }
    onBusy?.(true);
    startedAt.current = Date.now();
    setPhase({ kind: "recording", seconds: 0 });
    timer.current = setInterval(() => {
      const seconds = (Date.now() - startedAt.current) / 1000;
      if (seconds >= VISIT_MAX_SECONDS) void stop();
      else setPhase({ kind: "recording", seconds });
    }, 1000);
  };

  const recording = phase.kind === "recording";
  return (
    <div>
      <button
        type="button"
        disabled={disabled || phase.kind === "working"}
        onClick={() => void (recording ? stop() : start())}
        aria-pressed={recording}
        className={cn(
          "flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-card border-2 px-4 py-5 text-center transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-60",
          recording ? "border-danger bg-danger-bg text-danger" : "border-brand-300 bg-brand-50 text-brand-800 hover:border-brand-500 hover:bg-brand-100",
        )}
      >
        {phase.kind === "working" ? <Spinner className="h-9 w-9" /> : recording ? <Square className="h-9 w-9" /> : <Mic className="h-9 w-9" />}
        <span className="text-xl font-semibold">
          {phase.kind === "working" ? progressText(phase.done, phase.total) : recording ? `录音中 ${clockText(phase.seconds)}，点一下停止` : "录音"}
        </span>
      </button>
      <p className="mt-2 text-base leading-relaxed text-ink">录医生说话前，请先征得医生同意。最长 60 分钟，录音不保存，只留整理出的文字。</p>
      {problem && (
        <p role="alert" className="mt-2 rounded-2xl border border-warn/30 bg-warn-bg px-4 py-3 text-lg text-ink">
          {problem}
        </p>
      )}
    </div>
  );
}
