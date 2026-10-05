"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Mic, RotateCcw, Square, TriangleAlert } from "lucide-react";
import { VISIT_MAX_SECONDS, canRecord, clockText, progressText, startRecording, transcribeLong, type ActiveRecording, type LongTranscript } from "@/lib/audio";
import { cn } from "@/lib/utils";
import { L } from "@/lib/lang";
import { canBrowserListen, checkServerSpeech, markServerSpeechBroken, serverSpeechKnown, startListening, type ListenError, type Listening } from "@/lib/speech";
import { listenProblemText } from "@/components/MicButton";
import { Button, IconTile, Spinner } from "@/components/ui";

type Phase = { kind: "idle" } | { kind: "recording"; seconds: number } | { kind: "working"; done: number; total: number };

/** The big entry buttons shared by recording and uploading: a full-width white sheet, a large tile in front, the name in title type. */
export const bigTileCls =
  "press lift group relative flex min-h-24 w-full items-center gap-4 overflow-hidden rounded-card border border-line/60 px-5 py-4 text-left text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:pointer-events-none disabled:opacity-60";

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
  // what the browser hears, shown as it is said
  const [live, setLive] = useState("");
  // the whole text after stopping: read it over, fix words, then confirm
  const [draft, setDraft] = useState<string | null>(null);
  const liveBox = useRef<HTMLDivElement | null>(null);
  const draftBox = useRef<HTMLDivElement | null>(null);
  // the draft would sit under the button bar at the bottom: bring it into view
  useEffect(() => {
    if (draft != null) draftBox.current?.scrollIntoView({ block: "center" });
  }, [draft != null]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (liveBox.current) liveBox.current.scrollTop = liveBox.current.scrollHeight;
  }, [live]);
  const rec = useRef<ActiveRecording | null>(null);
  // the browser listening by itself, when the speech service can't be used
  const lis = useRef<Listening | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);

  // the answer is needed at the tap: Safari only lets listening start straight from a tap
  useEffect(() => {
    void checkServerSpeech();
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      rec.current?.cancel();
      lis.current?.cancel();
    },
    [],
  );

  const stop = async () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    const r = rec.current;
    const l = lis.current;
    rec.current = null;
    lis.current = null;
    if (!r && !l) return;
    setPhase({ kind: "working", done: 0, total: 0 });
    if (l) {
      try {
        const text = (await l.stop()) || live.trim();
        setLive("");
        if (text) setDraft(text);
        else setProblem(L("没听出说话的内容。可以再录一次，或者拍医嘱上传。", "No speech was heard. Record again, or upload a photo of the doctor's orders."));
      } catch (err) {
        setProblem(listenProblemText((err as ListenError).code ?? ""));
      } finally {
        setPhase({ kind: "idle" });
        onBusy?.(false);
      }
      return;
    }
    try {
      const blob = await r!.stop();
      const result = await transcribeLong(blob, (done, total) => setPhase({ kind: "working", done, total }));
      if (result.total > 0 && result.failed === result.total) {
        // the speech service turned down every part: from now on the browser listens by itself
        markServerSpeechBroken();
        setProblem(
          canBrowserListen()
            ? L("这段录音没转成文字。请再点「录音」录一次，这次会边录边转成文字。", "This recording couldn't be turned into text. Tap Record again: this time it is written down as you go.")
            : L("这段录音没转成文字。可以拍医嘱上传，或者直接打字。", "This recording couldn't be turned into text. Upload a photo of the doctor's orders, or type instead."),
        );
      } else if (!result.text) setProblem(
          result.total
            ? L("录音里没听出说话的内容。可以再录一次，或者拍医嘱上传。", "No speech was heard in the recording. Record again, or upload a photo of the doctor's orders.")
            : L("录音太短了，再录一次试试。", "The recording is too short. Please record again."),
        );
      else onText(result);
    } catch {
      setProblem(L("这段录音没处理成，可以再录一次，或者拍医嘱上传。", "This recording didn't work. Record again, or upload a photo of the doctor's orders."));
    } finally {
      setPhase({ kind: "idle" });
      onBusy?.(false);
    }
  };

  const begin = () => {
    onBusy?.(true);
    startedAt.current = Date.now();
    setPhase({ kind: "recording", seconds: 0 });
    timer.current = setInterval(() => {
      const seconds = (Date.now() - startedAt.current) / 1000;
      if (seconds >= VISIT_MAX_SECONDS) void stop();
      else setPhase({ kind: "recording", seconds });
    }, 1000);
  };

  const start = async () => {
    setProblem(null);
    setDraft(null);
    setLive("");
    // the speech service works (or may, while still being checked and the browser can't listen): record the whole visit
    const server = serverSpeechKnown();
    const useServer = canRecord() && (server === true || (server == null && !canBrowserListen()));
    if (!useServer) {
      if (!canBrowserListen())
        return setProblem(L("这台设备用不了语音，可以拍医嘱上传，或者直接打字。", "Voice doesn't work on this device. Upload a photo of the doctor's orders, or type instead."));
      try {
        lis.current = startListening((err) => {
          if (!lis.current) return;
          lis.current.cancel();
          lis.current = null;
          if (timer.current) clearInterval(timer.current);
          timer.current = null;
          setPhase({ kind: "idle" });
          onBusy?.(false);
          setProblem(listenProblemText(err.code));
        }, setLive);
      } catch (err) {
        return setProblem(listenProblemText((err as ListenError).code ?? ""));
      }
      return begin();
    }
    try {
      rec.current = await startRecording();
    } catch {
      return setProblem(L("没拿到麦克风。请在浏览器里允许使用麦克风，或者拍医嘱上传。", "Can't use the microphone. Allow it in your browser, or upload a photo of the doctor's orders."));
    }
    begin();
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
              <span className="absolute -inset-2.5 animate-pulse rounded-[28px] bg-danger/10" />
              <span className="absolute -inset-1.5 rounded-[24px] border border-danger/25" />
            </>
          )}
          {working ? (
            <IconTile tone="brand" size="xl">
              <Spinner className="h-8 w-8" />
            </IconTile>
          ) : recording ? (
            <IconTile tone="solidDanger" size="xl" className="relative">
              <Square className="fill-current" />
            </IconTile>
          ) : (
            <IconTile tone="solid" size="xl" className="animate-breathe transition-transform duration-300 group-hover:scale-105">
              <Mic strokeWidth={2.2} />
            </IconTile>
          )}
        </span>

        {working ? (
          <span className="t-heading text-brand-800 tabular-nums">{L(progressText(phase.done, phase.total), phase.total > 0 ? `Writing it down ${Math.min(phase.done, phase.total)}/${phase.total}` : "Getting the recording ready")}</span>
        ) : recording ? (
          <span className="flex min-w-0 flex-col items-start gap-1">
            <span className="text-base leading-snug font-medium text-danger">{L("录音中", "Recording")}</span>
            <span className="flex items-center gap-3">
              <span className="t-number text-danger">{clockText(phase.seconds)}</span>
              <SoundBars />
            </span>
            <span className="text-lg leading-snug font-medium text-ink">{L("点一下停止", "Tap to stop")}</span>
          </span>
        ) : (
          <span className="t-title">{L("录音", "Record")}</span>
        )}
      </button>
      {recording && (
        <div ref={liveBox} aria-live="polite" className="scroll-thin mt-3 max-h-48 overflow-y-auto rounded-2xl border border-line bg-surface px-4 py-3 text-lg leading-relaxed text-ink">
          {live || <span className="text-ink-2">{L("正在听，说的话会显示在这里……", "Listening. What is said shows up here…")}</span>}
        </div>
      )}
      {draft != null && !recording && (
        <div ref={draftBox} className="mt-3 animate-fade-up scroll-mb-40 space-y-3 rounded-card border border-brand-200 bg-surface p-4">
          <p className="text-lg font-medium text-ink">{L("看一遍，有错字可以直接改", "Read it over. You can fix any words here.")}</p>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            aria-label={L("录音转出的文字", "Text from the recording")}
            className="scroll-thin w-full resize-y rounded-2xl border border-line bg-surface-2 px-4 py-3 text-lg leading-relaxed text-ink outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
          />
          <div className="flex flex-wrap gap-3">
            <Button
              size="lg"
              className="press flex-1"
              disabled={!draft.trim()}
              onClick={() => {
                onText({ text: draft.trim(), failed: 0, total: 1 });
                setDraft(null);
              }}
            >
              <Check className="h-5 w-5" /> {L("确认保存", "Confirm and save")}
            </Button>
            <Button size="lg" variant="secondary" className="press" onClick={() => setDraft(null)}>
              <RotateCcw className="h-5 w-5" /> {L("不要这段", "Discard")}
            </Button>
          </div>
        </div>
      )}
      <p className="mt-2.5 px-1 text-base leading-relaxed text-ink-2">
        {L(
          "录医生说话前，请先征得医生同意。最长 60 分钟，录音不保存，只留整理出的文字。",
          "Ask the doctor before you record. Up to 60 minutes. The recording is not kept, only the text taken from it.",
        )}
      </p>
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
