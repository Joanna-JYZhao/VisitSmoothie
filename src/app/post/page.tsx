"use client";

import { useRef, useState } from "react";
import { Camera, ImageUp, X } from "lucide-react";
import type { AfterResult, AiMode, Episode } from "@/lib/types";
import { getState, useStore } from "@/lib/store";
import { PhotoError, organizeVisit } from "@/lib/ai/client";
import { saveAfter } from "@/lib/after";
import { buildTodos, setReminders } from "@/lib/reminders";
import { clipText, type LongTranscript } from "@/lib/audio";
import { compressImage } from "@/lib/image";
import { Recorder } from "@/components/post/Recorder";
import { VisitResult } from "@/components/post/VisitResult";
import { Questions } from "@/components/post/Questions";
import { filedLine } from "@/components/post/filed";
import { Button, Card, PageTitle, Spinner, TextButton } from "@/components/ui";

const MAX_PHOTOS = 6;
/** Prescriptions have small print: photos are sent larger than elsewhere. */
const PHOTO_SIDE = 2000;

/** The complaint being tracked most recently, which this visit is most likely about. */
const latestActive = (episodes: Episode[]) =>
  [...episodes].filter((e) => e.status === "active").sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] ?? null;

type Done = { result: AfterResult; mode: AiMode; line: string };

/** post: after seeing the doctor. Record the visit or photograph the papers; the rest is done here. */
export default function PostPage() {
  const { state } = useStore();
  const [photos, setPhotos] = useState<string[]>([]);
  const [transcript, setTranscript] = useState<LongTranscript | null>(null);
  const [recording, setRecording] = useState(false);
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  if (!state.profile) return null;

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const added = await Promise.all(Array.from(files).slice(0, MAX_PHOTOS - photos.length).map((f) => compressImage(f, PHOTO_SIDE)));
      setPhotos((p) => [...p, ...added].slice(0, MAX_PHOTOS));
      setProblem(null);
    } catch {
      setProblem("这张照片打不开，换一张试试。");
    }
  };

  const organize = async () => {
    const s = getState();
    if (!s.profile) return;
    const about = latestActive(s.episodes);
    const text = transcript?.text ? clipText(transcript.text, 4000) : "";
    setWorking(true);
    setProblem(null);
    try {
      const res = await organizeVisit({
        profile: s.profile,
        episode: about
          ? { title: about.title, tags: about.tags, status: about.status, startedAt: about.startedAt, createdAt: about.createdAt, entries: about.entries }
          : null,
        text: text || undefined,
        images: photos.length ? photos : undefined,
      });
      saveAfter(res.result, about?.id ?? null, res.mode, text);
      const set = setReminders(buildTodos(res.result), about?.id ?? null);
      setDone({ result: res.result, mode: res.mode, line: filedLine(set) });
      setPhotos([]);
      window.scrollTo({ top: 0 });
    } catch (err) {
      const reason = err instanceof PhotoError ? err.reason : "failed";
      setProblem(
        reason === "unavailable"
          ? "现在认不了照片。可以录音，或者稍后再试。"
          : reason === "unreadable"
            ? "照片上没认出病历或处方的内容。换一张清楚点的试试。"
            : "这次没整理成，再点一次试试。",
      );
    } finally {
      setWorking(false);
    }
  };

  if (done) {
    return (
      <div className="space-y-4">
        <PageTitle sub="从录音和照片里整理出来的，已经存进就诊记录。">这次看医生的结果</PageTitle>
        <p className="rounded-2xl border border-good/30 bg-good-bg px-4 py-3.5 text-lg font-medium text-ink">{done.line}</p>
        <VisitResult result={done.result} />
        <Questions result={done.result} />
      </div>
    );
  }

  if (working) {
    return (
      <Card className="flex flex-col items-center gap-3 px-5 py-12 text-center" role="status">
        <Spinner className="h-10 w-10" />
        <p className="text-xl font-semibold text-ink">正在整理医生说的和单子上写的</p>
        <p className="text-lg text-ink-2">大约半分钟到一分钟，请等一下。</p>
      </Card>
    );
  }

  const ready = photos.length > 0 || Boolean(transcript?.text);
  return (
    <div className="space-y-4">
      <PageTitle sub="看病时录音，或者拍下病历、处方、医嘱。两样做一样就行。">看完医生了</PageTitle>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void addPhotos(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={albumRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        data-testid="post-album-input"
        onChange={(e) => {
          void addPhotos(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Recorder
          onBusy={setRecording}
          onText={(t) => {
            setTranscript(t);
            setProblem(null);
          }}
        />
        <div>
          <button
            type="button"
            disabled={recording || photos.length >= MAX_PHOTOS}
            onClick={() => cameraRef.current?.click()}
            className="flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-brand-300 bg-brand-50 px-4 py-5 text-center text-brand-800 transition hover:border-brand-500 hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-60"
          >
            <Camera className="h-9 w-9" />
            <span className="text-xl font-semibold">上传</span>
          </button>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2">
            <TextButton onClick={() => albumRef.current?.click()} disabled={recording || photos.length >= MAX_PHOTOS}>
              <ImageUp className="h-5 w-5" /> 从相册选
            </TextButton>
            <span className="text-base text-ink">最多 {MAX_PHOTOS} 张，照片认完就丢</span>
          </div>
        </div>
      </div>

      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photos.map((src, i) => (
            <div key={i} className="relative h-24 w-20 overflow-hidden rounded-xl border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`第 ${i + 1} 张`} className="h-full w-full object-cover" />
              <button
                type="button"
                aria-label={`去掉第 ${i + 1} 张`}
                onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                className="absolute top-0.5 right-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-ink/70 text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {transcript?.text && (
        <Card className="p-5">
          <p className="text-lg font-semibold text-ink">录音转成了 {transcript.text.length} 字</p>
          {transcript.failed > 0 && <p className="mt-1 text-lg text-ink">有 {transcript.failed} 段（共 {transcript.total} 段）没听清，已跳过。</p>}
          {transcript.text.length > 4000 && <p className="mt-1 text-lg text-ink">太长了，整理时只用开头和结尾各一半。</p>}
          <details className="mt-2">
            <summary className="min-h-11 cursor-pointer py-2 text-lg font-medium text-brand-700">看转出来的字</summary>
            <p className="max-h-64 overflow-y-auto text-lg leading-relaxed whitespace-pre-line text-ink">{transcript.text}</p>
          </details>
          <TextButton className="-ml-2" onClick={() => setTranscript(null)}>
            不要这段录音
          </TextButton>
        </Card>
      )}

      {problem && (
        <p role="alert" className="rounded-2xl border border-warn/30 bg-warn-bg px-4 py-3.5 text-lg text-ink">
          {problem}
        </p>
      )}

      <Button size="lg" className="w-full" disabled={!ready || recording} onClick={() => void organize()}>
        开始整理
      </Button>
      {!ready && <p className="text-center text-lg text-ink-2">录一段音或者传一张照片，就能开始整理。</p>}
    </div>
  );
}
