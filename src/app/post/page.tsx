"use client";

import { useRef, useState } from "react";
import { AudioLines, Camera, ChevronDown, CircleCheck, ImageUp, TriangleAlert, X } from "lucide-react";
import type { AfterResult, AiMode, Episode } from "@/lib/types";
import { getState, useStore } from "@/lib/store";
import { PhotoError, organizeVisit } from "@/lib/ai/client";
import { saveAfter } from "@/lib/after";
import { buildTodos, setReminders } from "@/lib/reminders";
import { clipText, type LongTranscript } from "@/lib/audio";
import { compressImage } from "@/lib/image";
import { Recorder, bigTileCls } from "@/components/post/Recorder";
import { VisitResult } from "@/components/post/VisitResult";
import { Questions } from "@/components/post/Questions";
import { filedLine } from "@/components/post/filed";
import { L } from "@/lib/lang";
import { Button, Card, IconTile, PageTitle, Skeleton, Spinner, TextButton, focusRing } from "@/components/ui";
import { cn } from "@/lib/utils";

const MAX_PHOTOS = 6;
/** Prescriptions have small print: photos are sent larger than elsewhere. */
const PHOTO_SIDE = 2000;

/** The complaint being tracked most recently, which this visit is most likely about. */
const latestActive = (episodes: Episode[]) =>
  [...episodes].filter((e) => e.status === "active").sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] ?? null;

type Done = { result: AfterResult; mode: AiMode; line: string };

/** A problem, in a quiet amber card with a tile in front, the same wherever one appears on this page. */
function Problem({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="flex animate-fade-up items-start gap-3.5 rounded-card border border-warn/20 bg-warn-bg px-4 py-4">
      <IconTile tone="warn" size="sm" className="mt-0.5 bg-surface shadow-edge">
        <TriangleAlert className="h-5 w-5" />
      </IconTile>
      <p className="min-w-0 flex-1 text-lg leading-relaxed text-ink">{children}</p>
    </div>
  );
}

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
      setProblem(L("这张照片打不开，换一张试试。", "This photo won't open. Try another one."));
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
          ? L("现在认不了照片。可以录音，或者稍后再试。", "Photos can't be read right now. You can record instead, or try again later.")
          : reason === "unreadable"
            ? L("照片上没认出病历或处方的内容。换一张清楚点的试试。", "No medical record or prescription was found in the photo. Try a clearer one.")
            : L("这次没整理成，再点一次试试。", "That didn't work. Please tap again."),
      );
    } finally {
      setWorking(false);
    }
  };

  if (done) {
    return (
      <div className="space-y-6">
        <PageTitle sub={L("从录音和照片里整理出来的，已经存进就诊记录。", "Taken from your recording and photos, and saved to your visit records.")}>
          {L("这次看医生的结果", "Results of this visit")}
        </PageTitle>
        <div className="rise-1 flex items-center gap-4 rounded-card border border-good/15 bg-good-bg px-4 py-4">
          <IconTile tone="good" size="lg" className="bg-surface shadow-edge">
            <CircleCheck />
          </IconTile>
          <p className="min-w-0 flex-1 text-lg leading-relaxed font-medium text-ink">{done.line}</p>
        </div>
        <div className="rise-2">
          <VisitResult result={done.result} />
        </div>
        <div className="rise-3">
          <Questions result={done.result} />
        </div>
      </div>
    );
  }

  if (working) {
    // the sheet taking shape: a spinner on top, and the outline of the result shimmering under it
    return (
      <div className="space-y-6">
        <Card tone="raised" className="flex animate-fade-up flex-col items-center gap-4 px-5 py-10 text-center" role="status">
          <IconTile tone="brand" size="xl" className="mb-1 bg-surface shadow-glow">
            <Spinner className="h-8 w-8" />
          </IconTile>
          <p className="t-heading text-balance text-ink">{L("正在整理医生说的和单子上写的", "Sorting out what the doctor said and wrote")}</p>
          <p className="t-body text-ink-2">{L("大约半分钟到一分钟，请等一下。", "This takes about half a minute to a minute. Please wait.")}</p>
        </Card>
        <Card aria-hidden="true" className="divide-y divide-line overflow-hidden">
          <div className="space-y-4 px-5 pt-6 pb-5">
            <Skeleton className="h-4 max-w-40" />
            <Skeleton className="h-9 max-w-[60%]" />
          </div>
          <div className="space-y-3 px-5 py-5">
            <Skeleton className="h-4 max-w-24" />
            <div className="flex items-center gap-4 pt-1">
              <Skeleton className="h-10 max-w-10 shrink-0" />
              <Skeleton className="h-5 max-w-[50%]" />
            </div>
            <div className="flex items-center gap-4">
              <Skeleton className="h-10 max-w-10 shrink-0" />
              <Skeleton className="h-5 max-w-[40%]" />
            </div>
          </div>
          <div className="space-y-3 px-5 py-5">
            <Skeleton className="h-4 max-w-20" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 max-w-[80%]" />
          </div>
        </Card>
      </div>
    );
  }

  const ready = photos.length > 0 || Boolean(transcript?.text);
  return (
    <div className="flex flex-1 flex-col">
      <PageTitle sub={L("看病时录音，或者拍下病历、处方、医嘱。两样做一样就行。", "Record the visit, or take photos of the notes, prescription or doctor's orders. Either one is enough.")}>
        {L("看完医生了", "I've seen the doctor")}
      </PageTitle>

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

      <div className="space-y-6">
        {/* the two doors, one above the other: record, or photograph */}
        <div className="space-y-5">
          <div className="rise-1">
            <Recorder
              onBusy={setRecording}
              onText={(t) => {
                setTranscript(t);
                setProblem(null);
              }}
            />
          </div>
          <div className="rise-2">
            <button type="button" disabled={recording || photos.length >= MAX_PHOTOS} onClick={() => cameraRef.current?.click()} className={cn(bigTileCls, "bg-surface")}>
              <IconTile tone="solid" size="xl">
                <Camera strokeWidth={2.2} />
              </IconTile>
              <span className="t-title">{L("上传", "Upload")}</span>
            </button>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 px-1">
              <TextButton className="-ml-2" onClick={() => albumRef.current?.click()} disabled={recording || photos.length >= MAX_PHOTOS}>
                <ImageUp className="mr-1 h-5 w-5" /> {L("从相册选", "Choose from photos")}
              </TextButton>
              <span className="text-base leading-relaxed text-ink-2">{L(`最多 ${MAX_PHOTOS} 张，照片认完就丢`, `Up to ${MAX_PHOTOS}. Photos are deleted once read.`)}</span>
            </div>
          </div>
        </div>

        {photos.length > 0 && (
          <ul className="grid grid-cols-3 gap-3">
            {photos.map((src, i) => (
              <li key={i} className="relative aspect-[3/4] animate-pop overflow-hidden rounded-2xl bg-surface-2 shadow-card ring-1 ring-line/80">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={L(`第 ${i + 1} 张`, `Photo ${i + 1}`)} className="h-full w-full object-cover" />
                <button
                  type="button"
                  aria-label={L(`去掉第 ${i + 1} 张`, `Remove photo ${i + 1}`)}
                  onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                  className={cn(
                    "press absolute top-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-ink/65 text-white shadow-edge backdrop-blur-md transition hover:bg-ink/85 after:absolute after:-inset-2",
                    focusRing,
                  )}
                >
                  <X className="h-5 w-5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {transcript?.text && (
          <Card className="animate-rise overflow-hidden">
            <div className="flex items-start gap-4 px-5 pt-5 pb-4">
              <IconTile tone="brand" size="lg">
                <AudioLines />
              </IconTile>
              <div className="min-w-0 flex-1 pt-1">
                <p className="t-heading text-ink tabular-nums">{L(`录音转成了 ${transcript.text.length} 字`, `Recording turned into text (${transcript.text.length} characters)`)}</p>
                {transcript.failed > 0 && (
                  <p className="t-body mt-2 text-ink">
                    {L(`有 ${transcript.failed} 段（共 ${transcript.total} 段）没听清，已跳过。`, `${transcript.failed} of ${transcript.total} parts could not be heard and were skipped.`)}
                  </p>
                )}
                {transcript.text.length > 4000 && (
                  <p className="t-body mt-2 text-ink">{L("太长了，整理时只用开头和结尾各一半。", "It is long, so only the beginning and the end will be used.")}</p>
                )}
              </div>
            </div>
            <details className="group border-t border-line">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-lg font-medium text-brand-700 transition hover:bg-surface-2/70 [&::-webkit-details-marker]:hidden">
                {L("看转出来的字", "See the text")}
                <ChevronDown className="h-5 w-5 shrink-0 text-ink-3 transition-transform duration-300 group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p className="scroll-thin mx-5 mb-5 max-h-64 overflow-y-auto rounded-2xl bg-surface-2 px-4 py-3 text-lg leading-relaxed whitespace-pre-line text-ink">
                {transcript.text}
              </p>
            </details>
            <div className="border-t border-line px-4 py-1">
              <TextButton onClick={() => setTranscript(null)}>{L("不要这段录音", "Remove this recording")}</TextButton>
            </div>
          </Card>
        )}
      </div>

      {/* the one thing to do next, at the bottom of the screen right on the tab bar (-mb-4 takes back the room <main> keeps;
          the deeper bottom padding keeps the tab bar's raised round mark clear of it) */}
      <div className="sticky z-20 -mx-4 mt-auto -mb-4 space-y-3 bg-linear-to-t from-canvas from-70% to-canvas/0 px-4 pt-6 pb-8" style={{ bottom: "var(--tab-bar)" }}>
        {/* a problem stands right above the button, so it is seen where the next tap goes */}
        {problem && <Problem>{problem}</Problem>}
        <Button size="lg" className="press w-full" disabled={!ready || recording} onClick={() => void organize()}>
          {L("开始整理", "Sort it out")}
        </Button>
        {!ready && <p className="t-body text-center text-ink-2">{L("录一段音或者传一张照片，就能开始整理。", "Record the visit or upload a photo to begin.")}</p>}
      </div>
    </div>
  );
}
