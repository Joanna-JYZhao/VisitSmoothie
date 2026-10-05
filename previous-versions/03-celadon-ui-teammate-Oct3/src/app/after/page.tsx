"use client";

import { Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, CalendarDays, Camera, CircleAlert, CircleCheck, ClipboardList, FileText, Info, Keyboard, MessageSquareText, Pill, Stethoscope, Syringe, TriangleAlert, X } from "lucide-react";
import type { AfterMedication, AfterResult, AiMode, Episode } from "@/lib/types";
import { useStore } from "@/lib/store";
import { PhotoError, organizeVisit } from "@/lib/ai/client";
import { followUpDate, medicationLine, newLongTermMedications, saveAfter } from "@/lib/after";
import { compressImage } from "@/lib/image";
import { cn, fmtDate, fmtISODate } from "@/lib/utils";
import { useAiAvailable } from "@/components/AiStatus";
import { MicButton } from "@/components/MicButton";
import { useToast } from "@/components/Toast";
import { bigTileCls } from "@/components/post/Recorder";
import { Button, Card, Field, IconTile, Input, PageHeader, Skeleton, Spinner, TextButton, Textarea, focusRing, type IconTone } from "@/components/ui";

export default function AfterPage() {
  return (
    <Suspense fallback={null}>
      <After />
    </Suspense>
  );
}

type Stage =
  | { kind: "input" }
  | { kind: "working"; what: "photo" | "words" }
  | { kind: "review"; result: AfterResult; mode: AiMode }
  | { kind: "edit"; result: AfterResult; mode: AiMode }
  | { kind: "medicines"; result: AfterResult; names: AfterMedication[] }
  | { kind: "reminder"; result: AfterResult; at: string };

const MAX_PHOTOS = 4;

/** 看完医生了: photograph it or say it, check what was understood, save. No form to fill in. */
function After() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { state, addMedications, updateEpisode, setNextVisit } = useStore();
  const aiAvailable = useAiAvailable();
  const episodeId = params.get("episode");
  const fromReminder = params.get("visit") === "1";
  const episode: Episode | null = (episodeId && state.episodes.find((e) => e.id === episodeId)) || null;

  const [stage, setStage] = useState<Stage>({ kind: "input" });
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  // tracked complaints the visit was also filed under, so the closing message can say so
  const linked = useRef<string[]>([]);

  const profile = state.profile;
  if (!profile) return null;
  const back = "/";

  const organize = async (words: string, images: string[]) => {
    if (!words.trim() && !images.length) return;
    setProblem(null);
    setStage({ kind: "working", what: images.length ? "photo" : "words" });
    try {
      const res = await organizeVisit({
        profile,
        episode: episode
          ? {
              title: episode.title,
              tags: episode.tags,
              status: episode.status,
              startedAt: episode.startedAt,
              createdAt: episode.createdAt,
              entries: episode.entries,
            }
          : null,
        text: words.trim() || undefined,
        images: images.length ? images : undefined,
      });
      setStage({ kind: "review", result: res.result, mode: res.mode });
    } catch (err) {
      const reason = err instanceof PhotoError ? err.reason : "failed";
      setProblem(
        reason === "unavailable"
          ? "现在认不了照片。可以说给我听，或者打字。"
          : reason === "unreadable"
            ? "这张照片上没认出看病的内容。换个角度、光线亮一点再拍一张，或者说给我听。"
            : "照片没认出来。可以再拍一张，或者说给我听。",
      );
      setStage({ kind: "input" });
    }
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const added = await Promise.all(Array.from(files).slice(0, MAX_PHOTOS - photos.length).map((f) => compressImage(f)));
      const all = [...photos, ...added].slice(0, MAX_PHOTOS);
      setPhotos(all);
      void organize(text, all);
    } catch {
      setProblem("这张照片打不开，换一张试试。");
    }
  };

  /** After saving, at most two questions, one at a time. */
  const afterSave = (result: AfterResult, asked: { medicines?: boolean } = {}) => {
    const names = asked.medicines ? [] : newLongTermMedications(result);
    if (names.length) {
      setStage({ kind: "medicines", result, names });
      return;
    }
    const at = followUpDate(result);
    if (at) {
      setStage({ kind: "reminder", result, at });
      return;
    }
    finish();
  };

  const finish = (remindAt?: string) => {
    const where = episode
      ? `已存到「${episode.title}」的记录里`
      : linked.current.length
        ? `已存进我的档案，也记到「${linked.current.join("」「")}」下面了`
        : "已存进我的档案";
    toast.show(remindAt ? `${where}。${fmtDate(remindAt)}我会提醒你` : where, "good");
    router.replace("/");
  };

  const save = (result: AfterResult, mode: AiMode) => {
    linked.current = saveAfter(result, episode?.id ?? null, mode, text).linked;
    // the appointment this reminder was for has now happened
    if (fromReminder || (!episode && state.nextVisit)) setNextVisit(null);
    afterSave(result);
  };

  /* ---------- the two questions after saving ---------- */

  if (stage.kind === "medicines") {
    const { result, names } = stage;
    return (
      <Question
        title="已存档。"
        ask={`${names.map((m) => `「${m.name}」`).join("、")}是要长期吃的药吗？`}
        note="是的话我加进你的长期用药，以后每次给医生看的内容里都会带上。"
        yes="是，加进去"
        no="不是"
        onYes={() => {
          addMedications(names.map(medicationLine));
          afterSave(result, { medicines: true });
        }}
        onNo={() => afterSave(result, { medicines: true })}
      />
    );
  }

  if (stage.kind === "reminder") {
    const { result, at } = stage;
    return (
      <Question
        title="已存档。"
        ask={`医生让你 ${fmtDate(at, { weekday: true })} 前后再去${result.followUpNote ? `：${result.followUpNote.replace(/[。.；;，,\s]+$/, "")}` : "复查"}。到时候提醒你吗？`}
        yes="提醒我"
        no="不用"
        onYes={() => {
          if (episode) updateEpisode(episode.id, (e) => (e.visit ? { ...e, visit: { ...e.visit, followUpAt: at } } : e));
          else setNextVisit({ at, note: result.followUpNote ?? "复查" });
          finish(at);
        }}
        onNo={() => finish()}
      />
    );
  }

  /* ---------- checking what was understood ---------- */

  if (stage.kind === "edit") {
    return (
      <EditResult
        result={stage.result}
        onCancel={() => setStage({ kind: "review", result: stage.result, mode: stage.mode })}
        onDone={(r) => setStage({ kind: "review", result: r, mode: stage.mode })}
      />
    );
  }

  if (stage.kind === "review") {
    const r = stage.result;
    const at = followUpDate(r);
    const where = [r.hospital, r.department].filter(Boolean).join(" ");
    const short = (r.diagnosis?.length ?? 0) <= 12;
    return (
      <div className="space-y-8">
        <PageHeader back={{ href: back }} title="我整理成这样" sub="看一眼对不对，对就存档。" />

        {r.unclear.length > 0 && (
          <div className="flex animate-fade-up gap-4 rounded-card border border-warn/20 bg-warn-bg px-5 py-4">
            <IconTile tone="warn" size="md" className="bg-surface shadow-edge">
              <CircleAlert className="h-5 w-5" />
            </IconTile>
            <div className="min-w-0 flex-1 pt-1.5">
              <p className="text-lg leading-snug font-semibold text-ink">这几处我拿不准，请看一眼</p>
              <ul className="mt-2 space-y-1.5 text-lg leading-relaxed text-ink">
                {r.unclear.map((u, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden="true" className="text-warn">
                      ·
                    </span>
                    <span className="min-w-0 flex-1">{u}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* the visit as one typeset sheet: the diagnosis as its title, the medicines as hairline rows, the rest quieter */}
        <Card tone="raised" className="animate-rise divide-y divide-line overflow-hidden">
          <div className="px-6 pt-6 pb-6 sm:px-8 sm:pt-8 sm:pb-7">
            <p className="flex items-center gap-2.5 text-base leading-snug font-medium text-brand-700">
              <IconTile tone="brand" size="sm">
                <Stethoscope className={ic} />
              </IconTile>
              医生的诊断
            </p>
            {r.diagnosis ? (
              <h2 className={cn("mt-3 text-balance text-ink", short ? "t-display" : "t-title")}>{r.diagnosis}</h2>
            ) : (
              <p className="t-lead mt-3 text-ink-2">这次没有提到新的诊断</p>
            )}
          </div>
          {r.findings.length > 0 && (
            <Block label="检查结果" icon={<ClipboardList className={ic} />} tone="info">
              <ul className="space-y-1">
                {r.findings.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </Block>
          )}
          {r.procedures.length > 0 && (
            <Block label="当场做的处理" icon={<Syringe className={ic} />} tone="neutral">
              {r.procedures.join("；")}
            </Block>
          )}
          <Block label="开的药" icon={<Pill className={ic} />}>
            {r.medications.length ? (
              <ul className="-mx-2 divide-y divide-line">
                {r.medications.map((m, i) => (
                  <li key={i} className="flex items-start gap-4 px-2 py-3.5 first:pt-1 last:pb-1">
                    <IconTile tone="brand" size="md" className="mt-0.5">
                      <Pill className={ic} />
                    </IconTile>
                    <span className="min-w-0 flex-1 pt-0.5">
                      <span className="block text-lg leading-snug font-semibold text-ink">{m.name}</span>
                      {m.usage && <span className="mt-1 block text-base leading-relaxed text-ink-2">{m.usage}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-ink-2">没有开药</span>
            )}
          </Block>
          {r.advice && (
            <Block label="医生的叮嘱" icon={<MessageSquareText className={ic} />} tone="neutral">
              {r.advice}
            </Block>
          )}
          {(r.followUpDays || r.followUpNote) && (
            <Block label="复查" icon={<CalendarClock className={ic} />} className="bg-brand-50/50">
              <span className="text-lg leading-relaxed font-medium text-brand-800">{r.followUpNote ?? `${r.followUpDays} 天后`}</span>
              {at && <span className="text-ink-2">（{fmtDate(at)}前后）</span>}
            </Block>
          )}
          <Block label="哪天看的" icon={<CalendarDays className={ic} />} tone="neutral">
            {r.date ? fmtDate(`${r.date}T12:00:00`, { year: true }) : "今天"}
            {where && <span className="text-ink-2">　{where}</span>}
          </Block>
          {r.summary && (
            <Block label="存档时会这样写" icon={<FileText className={ic} />} tone="neutral" className="bg-surface-2/60">
              <span className="text-ink-2">{r.summary}</span>
            </Block>
          )}
        </Card>

        {r.medications.length > 0 && profile.allergies.length > 0 && (
          <div className="flex animate-fade-up gap-4 rounded-card border border-info/15 bg-info-bg px-5 py-4">
            <IconTile tone="info" size="md" className="bg-surface shadow-edge">
              <Info className="h-5 w-5" />
            </IconTile>
            <p className="min-w-0 flex-1 pt-1.5 text-lg leading-relaxed text-ink">
              你的档案里写着对{profile.allergies.join("、")}过敏。开新药的时候，记得让医生或药师知道。
            </p>
          </div>
        )}

        <div className="space-y-3">
          <Button size="lg" className="press w-full" onClick={() => save(r, stage.mode)}>
            对，存档
          </Button>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" className="press" onClick={() => setStage({ kind: "edit", result: r, mode: stage.mode })}>
              改一下
            </Button>
            <Button
              variant="secondary"
              className="press"
              onClick={() => {
                setPhotos([]);
                setStage({ kind: "input" });
              }}
            >
              重新来
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- saying or photographing it ---------- */

  const working = stage.kind === "working";

  return (
    <div className="space-y-8">
      <PageHeader
        back={{ href: back }}
        title="看完医生了"
        sub={`${episode ? `「${episode.title}」` : ""}医生怎么说的？${aiAvailable ? "拍下来，或者说给我听。" : "写下来就行，我来整理。"}`}
      />

      {problem && (
        <div role="alert" className="flex animate-fade-up items-start gap-3.5 rounded-card border border-warn/20 bg-warn-bg px-5 py-4">
          <IconTile tone="warn" size="sm" className="mt-0.5 bg-surface shadow-edge">
            <TriangleAlert className="h-5 w-5" />
          </IconTile>
          <p className="min-w-0 flex-1 text-lg leading-relaxed text-ink">{problem}</p>
        </div>
      )}

      {working ? (
        // the sheet taking shape: a spinner on top, the outline of the result shimmering under it
        <div className="space-y-6">
          <Card tone="raised" className="flex animate-fade-up flex-col items-center gap-4 px-6 py-12 text-center" role="status">
            <IconTile tone="brand" size="xl" className="mb-1 bg-surface shadow-glow">
              <Spinner className="h-8 w-8" />
            </IconTile>
            <p className="t-heading text-ink">{stage.what === "photo" ? "正在认照片上的字" : "正在整理"}</p>
            <p className="t-body text-ink-2">一般不到十秒。</p>
          </Card>
          <Card aria-hidden="true" className="divide-y divide-line overflow-hidden">
            <div className="space-y-4 px-6 pt-7 pb-6">
              <Skeleton className="h-4 max-w-28" />
              <Skeleton className="h-9 max-w-[60%]" />
            </div>
            <div className="space-y-3 px-6 py-6">
              <Skeleton className="h-4 max-w-20" />
              <div className="flex items-center gap-4 pt-1">
                <Skeleton className="h-10 max-w-10 shrink-0" />
                <Skeleton className="h-5 max-w-[50%]" />
              </div>
              <div className="flex items-center gap-4">
                <Skeleton className="h-10 max-w-10 shrink-0" />
                <Skeleton className="h-5 max-w-[40%]" />
              </div>
            </div>
            <div className="space-y-3 px-6 py-6">
              <Skeleton className="h-4 max-w-24" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 max-w-[80%]" />
            </div>
          </Card>
        </div>
      ) : (
        <>
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
            data-testid="album-input"
            onChange={(e) => {
              void addPhotos(e.target.files);
              e.target.value = "";
            }}
          />

          {aiAvailable && (
            <div className="rise-1">
              <button type="button" onClick={() => cameraRef.current?.click()} className={cn(bigTileCls, "sm:min-h-0")}>
                <IconTile tone="solid" size="xl" className="animate-breathe transition-transform duration-300 group-hover:scale-105">
                  <Camera strokeWidth={2.2} />
                </IconTile>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="t-heading">拍照</span>
                  <span className="text-base leading-snug text-ink-2">病历、处方、药盒、化验单都行</span>
                </span>
              </button>
              <div className="mt-1 flex justify-center">
                <TextButton onClick={() => albumRef.current?.click()}>已经拍好了，从相册选</TextButton>
              </div>
            </div>
          )}

          <div className="rise-2">
            <MicButton
              big
              label="说给我听"
              maxSeconds={180}
              onText={(t) => {
                const all = text ? `${text}${t}` : t;
                setText(all);
                void organize(all, photos);
              }}
            />
          </div>

          {photos.length > 0 && (
            <ul className="grid grid-cols-4 gap-3">
              {photos.map((src, i) => (
                <li key={i} className="relative aspect-square animate-pop overflow-hidden rounded-2xl bg-surface-2 shadow-card ring-1 ring-line/80">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`第 ${i + 1} 张照片`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    aria-label={`去掉第 ${i + 1} 张照片`}
                    onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                    className={cn(
                      // the dot is small so the photo stays visible; the area that takes the tap is 44px
                      "press absolute top-1.5 right-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-ink/65 text-white shadow-edge backdrop-blur-md transition hover:bg-ink/85 after:absolute after:-inset-2",
                      focusRing,
                    )}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {typing || text || !aiAvailable ? (
            <div className="rise-3">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="比如：医生说是急性咽炎，开了头孢和布洛芬，让多喝水，三天不退烧再去。"
                aria-label="医生怎么说的"
                autoFocus={typing && !text}
                className="shadow-card"
              />
              <Button size="lg" className="press mt-4 w-full" disabled={!text.trim() && !photos.length} onClick={() => void organize(text, photos)}>
                整理
              </Button>
            </div>
          ) : (
            <div className="rise-3">
              <Button variant="secondary" size="lg" className="press w-full" onClick={() => setTyping(true)}>
                <Keyboard className="h-6 w-6" />
                打字
              </Button>
            </div>
          )}

          {aiAvailable && (
            <p className="px-2 text-center text-base leading-relaxed text-ink-2">
              照片和录音只用来认字，认完就丢，不会保存。
            </p>
          )}
        </>
      )}
    </div>
  );
}

const ic = "h-5 w-5";

/** A block of the sheet: a quiet label with a small tile, then its content. */
function Block({
  label,
  icon,
  tone = "brand",
  className,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  tone?: IconTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("px-6 py-5 sm:px-8 sm:py-6", className)}>
      <p className="flex items-center gap-2.5 text-base leading-snug font-medium text-ink-2">
        <IconTile tone={tone} size="sm">
          {icon}
        </IconTile>
        {label}
      </p>
      <div className="t-body mt-3 text-ink">{children}</div>
    </section>
  );
}

function Question({
  title,
  ask,
  note,
  yes,
  no,
  onYes,
  onNo,
}: {
  title: string;
  ask: string;
  note?: string;
  yes: string;
  no: string;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div className="pt-4">
      <Card tone="raised" className="animate-pop p-6 sm:p-8">
        <p className="flex items-center gap-3 text-lg leading-snug font-semibold text-good">
          <IconTile tone="good" size="md">
            <CircleCheck className="h-5 w-5" />
          </IconTile>
          {title}
        </p>
        <h1 className="t-title mt-6 text-balance text-ink">{ask}</h1>
        {note && <p className="t-body mt-3 text-ink-2">{note}</p>}
        <div className="mt-8 grid grid-cols-2 gap-3">
          <Button size="lg" className="press" onClick={onYes}>
            {yes}
          </Button>
          <Button size="lg" variant="secondary" className="press" onClick={onNo}>
            {no}
          </Button>
        </div>
      </Card>
    </div>
  );
}

/** Fixing what was understood, in plain boxes. Only reached through 改一下. */
function EditResult({ result, onCancel, onDone }: { result: AfterResult; onCancel: () => void; onDone: (r: AfterResult) => void }) {
  const [diagnosis, setDiagnosis] = useState(result.diagnosis ?? "");
  const [meds, setMeds] = useState(result.medications.map((m) => `${m.name}${m.usage ? ` ${m.usage}` : ""}`).join("\n"));
  const [findings, setFindings] = useState(result.findings.join("\n"));
  const [advice, setAdvice] = useState(result.advice ?? "");
  const [days, setDays] = useState(result.followUpDays ? String(result.followUpDays) : "");
  const [date, setDate] = useState(result.date ?? fmtISODate(new Date()));

  const done = () => {
    const medications: AfterMedication[] = meds
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, ...rest] = line.split(/[\s，,]+/);
        const before = result.medications.find((m) => m.name === name);
        return { name, usage: rest.join(" "), longTerm: before?.longTerm ?? false };
      });
    const n = Number(days);
    const followUpDays = days.trim() && Number.isFinite(n) && n >= 1 && n <= 730 ? Math.round(n) : null;
    onDone({
      ...result,
      diagnosis: diagnosis.trim() || null,
      findings: findings
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
      medications,
      advice: advice.trim() || null,
      followUpDays,
      followUpNote: followUpDays ? (followUpDays === result.followUpDays ? result.followUpNote : `${followUpDays} 天后复查`) : null,
      date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : result.date,
      unclear: [],
    });
  };

  return (
    <div className="space-y-8">
      <PageHeader title="改一下" />
      <Card className="grid animate-fade-up gap-6 p-6">
        <Field label="医生的诊断">
          <Input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="比如：急性咽炎" />
        </Field>
        <Field label="检查结果" hint="一行写一项，没有就空着。">
          <Textarea value={findings} onChange={(e) => setFindings(e.target.value)} className="min-h-20" placeholder={"血压 128/82\n糖化血红蛋白 6.7%"} />
        </Field>
        <Field label="开的药" hint="一行写一种，药名后面空一格写怎么吃。">
          <Textarea value={meds} onChange={(e) => setMeds(e.target.value)} placeholder={"头孢克肟 一天两次\n布洛芬 发烧时吃"} />
        </Field>
        <Field label="医生的叮嘱">
          <Textarea value={advice} onChange={(e) => setAdvice(e.target.value)} className="min-h-24" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="几天后复查">
            <Input type="number" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} placeholder="不用就空着" />
          </Field>
          <Field label="哪天看的">
            <Input
              type="date"
              value={date}
              max={fmtISODate(new Date())}
              onChange={(e) => setDate(e.target.value)}
              className="[&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:transition hover:[&::-webkit-calendar-picker-indicator]:opacity-100"
            />
          </Field>
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" size="lg" className="press" onClick={onCancel}>
          不改了
        </Button>
        <Button size="lg" className="press" onClick={done}>
          改好了
        </Button>
      </div>
    </div>
  );
}
