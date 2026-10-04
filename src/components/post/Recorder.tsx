"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, TriangleAlert } from "lucide-react";
import { VISIT_MAX_SECONDS, canRecord, clockText, progressText, startRecording, transcribeLong, type ActiveRecording, type LongTranscript } from "@/lib/audio";
import { cn } from "@/lib/utils";
import { IconTile, Spinner } from "@/components/ui";

type Phase = { kind: "idle" } | { kind: "recording"; seconds: number } | { kind: "working"; done: number; total: number };

/** Compact, flat entry rows shared by recording and uploading. */
export const bigTileCls =
  "press lift group relative flex min-h-20 w-full items-center gap-3 overflow-hidden rounded-card border border-line/60 px-4 py-3 text-left text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:pointer-events-none disabled:opacity-60";

/** The sound bars beside the clock while recording: a visual pulse only, there is no meter behind it. */
function SoundBars() {
  return (
    <span aria-hidden="true" className="flex h-8 items-end gap-1">
      <style>{`@keyframes rec-bar{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}`}</style>
      {[0.9, 0.55, 1, 0.7, 0.45].map((d, i) => (
        <span
          key={i}
          className="block w-1.5 origin-bottom rounded-full bg-danger"
          style={{ height: `${8 + i * 2 + (i === 2 ? 14 : i === 1 || i === 3 ? 10 : 6)}px`, animation: `rec-bar ${d}s ease-in-out ${i * 0.1}s infinite` }}
        />
      ))}
    </span>
  );
}

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
  const working = phase.kind === "working";
  return (
    <div>
      <button
        type="button"
        disabled={disabled || phase.kind === "working"}
        onClick={() => void (recording ? stop() : start())}
        aria-pressed={recording}
        className={cn(bigTileCls, recording ? "border-danger/30 bg-danger-bg text-danger" : "bg-surface")}
      >
        {/* the tile: the brand icon at rest, a red square with rings while recording, the spinner while transcribing */}
        <span aria-hidden="true" className="relative flex shrink-0 items-center justify-center">
          {recording && (
            <>
              <span className="absolute -inset-2.5 animate-pulse rounded-[26px] bg-danger/10" />
              <span className="absolute -inset-1.5 rounded-[24px] border border-danger/25" />
            </>
          )}
          {working ? (
            <IconTile tone="brand" size="md">
              <Spinner className="h-8 w-8" />
            </IconTile>
          ) : recording ? (
            <IconTile tone="solidDanger" size="md" className="relative">
              <Square className="fill-current" />
            </IconTile>
          ) : (
            <IconTile tone="solid" size="md" className="animate-breathe transition-transform duration-300 group-hover:scale-105">
              <Mic strokeWidth={2.2} />
            </IconTile>
          )}
        </span>

        {working ? (
          <span className="t-heading text-brand-800 tabular-nums">{progressText(phase.done, phase.total)}</span>
        ) : recording ? (
          <span className="flex min-w-0 flex-col items-start gap-1 sm:items-center">
            <span className="text-base leading-snug font-medium text-danger">录音中</span>
            <span className="flex items-center gap-3">
              <span className="t-number text-danger">{clockText(phase.seconds)}</span>
              <SoundBars />
            </span>
            <span className="text-lg leading-snug font-medium text-ink">点一下停止</span>
          </span>
        ) : (
          <span className="t-heading">录音</span>
        )}
      </button>
      <p className="mt-3 px-1 text-base leading-relaxed text-ink-2">录医生说话前，请先征得医生同意。最长 60 分钟，录音不保存，只留整理出的文字。</p>
      {problem && (
        <div role="alert" className="mt-3 flex animate-fade-up items-start gap-3.5 rounded-card border border-warn/20 bg-warn-bg px-5 py-4">
          <IconTile tone="warn" size="sm" className="mt-0.5 bg-surface shadow-edge">
            <TriangleAlert className="h-5 w-5" />
          </IconTile>
          <p className="min-w-0 flex-1 text-lg leading-relaxed text-ink">{problem}</p>
        </div>
      )}
    </div>
  );
}
