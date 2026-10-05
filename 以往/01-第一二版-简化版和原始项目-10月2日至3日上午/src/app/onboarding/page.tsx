"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, ScanText, X } from "lucide-react";
import type { CheckupResult, Gender, MetricType, Profile } from "@/lib/types";
import { useStore } from "@/lib/store";
import { PhotoError, parseProfile, readCheckup } from "@/lib/ai/client";
import { SAMPLE_CHECKUP, SAMPLE_CHECKUP_URL, readingText, saveCheckup } from "@/lib/checkup";
import { compressImage } from "@/lib/image";
import { ageOf, cn, fmtDate, nowISO } from "@/lib/utils";
import { useAiAvailable } from "@/components/AiStatus";
import { Logo } from "@/components/Logo";
import { MicButton } from "@/components/MicButton";
import {
  BasicFields,
  ContactFields,
  HistoryFields,
  emptyDraft,
  profileFromDraft,
  validateBasics,
  type ProfileDraft,
} from "@/components/ProfileForm";
import { Button, Card, Field, Input, Segmented, Spinner, TextButton } from "@/components/ui";

const NOTHING = /^(都)?没有。?$|^无。?$|^都没有/;
const WELCOME_KEY = "yiban.welcome";
const MAX_PHOTOS = 6;

type Stage =
  | { kind: "start" }
  | { kind: "reading"; count: number }
  | { kind: "confirm"; result: CheckupResult; sample: boolean }
  | { kind: "edit"; result: CheckupResult; sample: boolean; draft: ProfileDraft }
  | { kind: "offer"; names: string; metrics: MetricType[] };

/** Which numbers are worth tracking for the long-term conditions someone mentioned. */
function metricsFor(conditions: string[], medications: string[]): MetricType[] {
  const text = [...conditions, ...medications].join(" ");
  const out: MetricType[] = [];
  if (/糖尿病|血糖|二甲双胍|胰岛素/.test(text)) out.push("fbg", "hba1c");
  if (/高血压|血压|降压/.test(text)) out.push("bp");
  return out;
}

/**
 * 建档. The main way in is a check-up report: photograph it, look over what was read, done.
 * Telling it in one sentence (the earlier way) stays as the alternative for people without one.
 */
export default function OnboardingPage() {
  const { state, ready, setProfile, updateSettings } = useStore();
  const router = useRouter();
  const canRead = useAiAvailable();
  const [stage, setStage] = useState<Stage>({ kind: "start" });
  const [photos, setPhotos] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  // set as soon as a profile is being created here, so the redirect below leaves this page alone
  const creating = useRef(false);

  // someone who already has a profile has no business here
  useEffect(() => {
    if (ready && state.profile && !creating.current) router.replace("/");
  }, [ready, state.profile, router]);

  if (!ready) return null;

  const leave = () => router.replace("/");

  /** Saves the profile (and the check-up it came from), says back what was understood, and moves on. */
  const complete = (profile: Profile, checkup: CheckupResult | null) => {
    creating.current = true;
    setProfile(profile);
    const hasCheckup = checkup != null && (checkup.abnormal.length > 0 || checkup.readings.length > 0 || Boolean(checkup.advice));
    if (checkup && hasCheckup) saveCheckup(checkup);
    // Shown on the home screen until dismissed, so anything misread can be corrected on the spot.
    const understood = [
      profile.conditions.length ? `老毛病：${profile.conditions.join("、")}` : "",
      profile.allergies.length ? `过敏：${profile.allergies.join("、")}` : "",
      profile.medications.length ? `长期吃的药：${profile.medications.join("、")}` : "",
      profile.surgeries.length ? `做过的手术：${profile.surgeries.join("、")}` : "",
      profile.familyHistory.length ? `家里人的病：${profile.familyHistory.join("、")}` : "",
      checkup?.readings.length ? `体检时的数：${checkup.readings.map(readingText).join("、")}` : "",
      checkup?.abnormal.length ? `体检报告上要留意的 ${checkup.abnormal.length} 项，已存进档案` : "",
    ].filter(Boolean);
    try {
      if (understood.length) sessionStorage.setItem(WELCOME_KEY, JSON.stringify(understood));
    } catch {
      /* the note is a nicety; the profile itself is saved */
    }
    const metrics = metricsFor(profile.conditions, profile.medications);
    if (metrics.length) {
      setStage({ kind: "offer", names: profile.conditions.filter((c) => /糖尿病|血糖|高血压|血压/.test(c)).join("、") || "长期的情况", metrics });
      return;
    }
    leave();
  };

  const recognize = async (images: string[]) => {
    if (!images.length) return;
    setProblem(null);
    setStage({ kind: "reading", count: images.length });
    try {
      const res = await readCheckup(images);
      setPhotos([]);
      setStage({ kind: "confirm", result: res.result, sample: false });
    } catch (err) {
      const reason = err instanceof PhotoError ? err.reason : "failed";
      setProblem(
        reason === "unavailable"
          ? "现在认不了照片。可以先自己说几句来建档。"
          : reason === "unreadable"
            ? "这张照片上没认出体检的内容。换个角度、光线亮一点再拍一张，或者自己说几句。"
            : "这次没认出来。可以再试一次，或者自己说几句。",
      );
      setStage({ kind: "start" });
    }
  };

  /** The made-up report that ships with the app. If it cannot be read just now, what is printed on it is used. */
  const trySample = async () => {
    setProblem(null);
    if (!canRead) {
      setStage({ kind: "confirm", result: SAMPLE_CHECKUP, sample: true });
      return;
    }
    setStage({ kind: "reading", count: 1 });
    try {
      const blob = await (await fetch(SAMPLE_CHECKUP_URL)).blob();
      const res = await readCheckup([await compressImage(blob)]);
      setStage({ kind: "confirm", result: res.result, sample: true });
    } catch {
      setStage({ kind: "confirm", result: SAMPLE_CHECKUP, sample: true });
    }
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const added = await Promise.all(Array.from(files).slice(0, MAX_PHOTOS - photos.length).map((f) => compressImage(f)));
      setPhotos((p) => [...p, ...added].slice(0, MAX_PHOTOS));
      setProblem(null);
    } catch {
      setProblem("这张照片打不开，换一张试试。");
    }
  };

  /* ---------- after the profile is saved: the one follow-up question ---------- */

  if (stage.kind === "offer") {
    const what = [stage.metrics.includes("fbg") ? "血糖" : "", stage.metrics.includes("bp") ? "血压" : ""].filter(Boolean).join("和");
    const rhythm = [stage.metrics.includes("fbg") ? "血糖每天问一次" : "", stage.metrics.includes("bp") ? "血压每周问一次" : ""].filter(Boolean).join("，");
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-[36rem] flex-col justify-center px-4 py-8">
        <Card className="p-6">
          <p className="text-lg font-medium text-good">档案建好了。</p>
          <h1 className="mt-2 text-2xl leading-snug font-semibold text-ink">
            你提到了{stage.names}。要我按时提醒你记{what}吗？
          </h1>
          <p className="mt-2 text-lg leading-relaxed text-ink-2">
            {rhythm}，在首页填一下就行。记下来以后，看医生时可以把这段时间的变化直接给医生看。
          </p>
          <div className="mt-6 grid grid-cols-2 gap-2">
            <Button
              size="lg"
              onClick={() => {
                updateSettings({ longTerm: true, trackedMetrics: stage.metrics });
                leave();
              }}
            >
              要
            </Button>
            <Button size="lg" variant="secondary" onClick={leave}>
              先不用
            </Button>
          </div>
          <p className="mt-4 text-base leading-relaxed text-ink-2">以后想改，在「我的档案」里的「长期管理」。</p>
        </Card>
      </div>
    );
  }

  /* ---------- the report is being read ---------- */

  if (stage.kind === "reading") {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-[36rem] flex-col justify-center px-4 py-8">
        <Card className="flex flex-col items-center gap-3 px-5 py-12 text-center" role="status">
          <Spinner className="h-10 w-10" />
          <p className="text-xl font-semibold text-ink">正在认体检报告上的字</p>
          <p className="text-lg leading-relaxed text-ink-2">
            {stage.count > 1 ? `一共 ${stage.count} 张，` : ""}大约要半分钟到一分钟，请等一下。
          </p>
        </Card>
      </div>
    );
  }

  /* ---------- looking over what was read ---------- */

  if (stage.kind === "confirm") {
    return (
      <Confirm
        result={stage.result}
        sample={stage.sample}
        onConfirm={(profile) => complete(profile, stage.result)}
        onEdit={(draft) => setStage({ kind: "edit", result: stage.result, sample: stage.sample, draft })}
        onRetake={() => {
          setPhotos([]);
          setStage({ kind: "start" });
        }}
      />
    );
  }

  if (stage.kind === "edit") {
    return (
      <EditAll
        draft={stage.draft}
        onCancel={() => setStage({ kind: "confirm", result: stage.result, sample: stage.sample })}
        onSave={(profile) => complete(profile, stage.result)}
      />
    );
  }

  /* ---------- the start ---------- */

  const showManual = manual || !canRead;

  return (
    <div className="mx-auto w-full max-w-[36rem] px-4 pt-8 pb-12">
      <Logo />
      <h1 className="mt-7 text-[1.65rem] leading-tight font-semibold tracking-tight text-ink">先认识一下</h1>
      <p className="mt-1.5 text-lg leading-relaxed text-ink-2">说不清的，我帮你说清楚；记不住的，我帮你记住。</p>

      {problem && (
        <p role="alert" className="mt-5 rounded-2xl border border-warn/30 bg-warn-bg px-4 py-3.5 text-lg leading-relaxed text-ink">
          {problem}
        </p>
      )}

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
        data-testid="checkup-album-input"
        onChange={(e) => {
          void addPhotos(e.target.files);
          e.target.value = "";
        }}
      />

      <Card className="mt-6 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
            <ScanText className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold text-ink">用体检报告建档</h2>
            <p className="mt-0.5 text-lg leading-relaxed text-ink-2">
              {canRead ? "拍一下最近一次的体检报告，我把档案填好，你看一眼就行。" : "这台设备现在认不了照片。可以先用示例报告看看是什么样。"}
            </p>
          </div>
        </div>

        {photos.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {photos.map((src, i) => (
              <div key={i} className="relative h-24 w-20 overflow-hidden rounded-xl border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`第 ${i + 1} 页`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  aria-label={`去掉第 ${i + 1} 页`}
                  onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                  className="absolute top-0.5 right-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-ink/70 text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {canRead &&
          (photos.length > 0 ? (
            <div className="mt-4 space-y-2">
              <Button size="lg" className="w-full" onClick={() => void recognize(photos)}>
                开始整理（{photos.length} 张）
              </Button>
              {photos.length < MAX_PHOTOS && (
                <Button variant="secondary" size="lg" className="w-full" onClick={() => cameraRef.current?.click()}>
                  <Camera className="h-6 w-6" />
                  再拍一页
                </Button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="mt-4 flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-brand-300 bg-brand-50 px-4 py-5 text-center text-brand-800 transition hover:border-brand-500 hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
            >
              <Camera className="h-9 w-9" />
              <span className="text-xl font-semibold">拍体检报告</span>
              <span className="text-base text-ink">有好几页的话，一页一页拍，最多 {MAX_PHOTOS} 张</span>
            </button>
          ))}

        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3">
          {canRead ? <TextButton onClick={() => albumRef.current?.click()}>从相册选</TextButton> : <span />}
          <TextButton onClick={() => void trySample()}>用示例报告试试</TextButton>
        </div>
        {canRead && <p className="mt-1 text-base leading-relaxed text-ink-2">照片只用来认字，认完就丢，不会保存。</p>}
      </Card>

      {showManual ? (
        <ManualForm onDone={(profile) => complete(profile, null)} />
      ) : (
        <Button variant="secondary" size="lg" className="mt-4 w-full" onClick={() => setManual(true)}>
          没有体检报告，自己说几句
        </Button>
      )}

      <p className="mt-5 text-center text-base leading-relaxed text-ink-2">
        档案只存在这台设备上。以后随时可以在「我的档案」里改。
      </p>
      <div className="mt-6 border-t border-line pt-5 text-center">
        <p className="text-base text-ink-2">想先看看是什么样？</p>
        <div className="mt-1 flex flex-wrap justify-center gap-x-2">
          <Link href="/demo/liming" className="inline-flex min-h-12 items-center px-2 text-base font-medium text-brand-700 underline-offset-4 hover:underline">
            李明：一次肚子痛
          </Link>
          <Link href="/demo/wang" className="inline-flex min-h-12 items-center px-2 text-base font-medium text-brand-700 underline-offset-4 hover:underline">
            王秀兰：一年的糖尿病管理
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ---------- what was read from the report, said back in plain words ---------- */

function draftOf(r: CheckupResult, basics: { name: string; gender: Gender | null; year: string }): ProfileDraft {
  return {
    ...emptyDraft(),
    name: basics.name,
    gender: basics.gender ?? "男",
    birthYear: basics.year,
    heightCm: r.heightCm != null ? String(r.heightCm) : "",
    weightKg: r.weightKg != null ? String(r.weightKg) : "",
    bloodType: r.bloodType ?? "",
    conditions: r.conditions,
    allergies: r.allergies,
    medications: r.medications,
    surgeries: r.surgeries,
    familyHistory: r.familyHistory,
  };
}

function Confirm({
  result: r,
  sample,
  onConfirm,
  onEdit,
  onRetake,
}: {
  result: CheckupResult;
  sample: boolean;
  onConfirm: (profile: Profile) => void;
  onEdit: (draft: ProfileDraft) => void;
  onRetake: () => void;
}) {
  // Only what a profile cannot do without is asked for, and only when the report did not say it.
  const [name, setName] = useState(r.name ?? "");
  const [gender, setGender] = useState<Gender | null>(r.gender);
  const [year, setYear] = useState(r.birthYear != null ? String(r.birthYear) : "");
  const [error, setError] = useState<string | null>(null);
  const missing = !r.name || !r.gender || r.birthYear == null;
  const body = [r.heightCm != null ? `身高 ${r.heightCm} cm` : "", r.weightKg != null ? `体重 ${r.weightKg} kg` : "", r.bloodType ? `${r.bloodType} 型血` : ""].filter(Boolean);

  const confirm = () => {
    const y = Number(year);
    const thisYear = new Date().getFullYear();
    if (!name.trim()) return setError("请填一下怎么称呼你");
    if (!gender) return setError("请选一下性别");
    if (!Number.isInteger(y) || y < thisYear - 110 || y > thisYear) return setError("出生年份请填四位数，比如 1968");
    setError(null);
    onConfirm(profileFromDraft(draftOf(r, { name: name.trim(), gender, year: String(y) })));
  };

  return (
    <div className="mx-auto w-full max-w-[36rem] space-y-4 px-4 pt-8 pb-12">
      <div>
        <h1 className="text-[1.65rem] leading-tight font-semibold tracking-tight text-ink">我从体检报告里认出了这些</h1>
        <p className="mt-1.5 text-lg leading-relaxed text-ink-2">看一眼对不对。对就建档，不对可以改。</p>
      </div>

      {sample && (
        <p className="rounded-2xl border border-info/20 bg-info-bg px-4 py-3.5 text-lg leading-relaxed text-ink">
          这是示例体检报告，人物是虚构的。
        </p>
      )}

      {r.unclear.length > 0 && (
        <div className="rounded-2xl border border-warn/30 bg-warn-bg px-4 py-3.5">
          <p className="text-lg font-semibold text-ink">这几处我拿不准，请看一眼</p>
          <ul className="mt-1 space-y-1 text-lg leading-relaxed text-ink">
            {r.unclear.map((u, i) => (
              <li key={i}>· {u}</li>
            ))}
          </ul>
        </div>
      )}

      {missing && (
        <Card className="space-y-5 p-5">
          <p className="text-lg font-semibold text-ink">报告上没认出这几项，请补一下</p>
          {!r.name && (
            <Field label="怎么称呼你">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="姓名或者昵称" autoComplete="name" />
            </Field>
          )}
          {!r.gender && (
            <Field label="性别">
              <Segmented
                label="性别"
                className="flex w-full"
                options={[
                  { value: "男", label: "男" },
                  { value: "女", label: "女" },
                ]}
                value={gender ?? ("" as Gender)}
                onChange={(v) => setGender(v)}
              />
            </Field>
          )}
          {r.birthYear == null && (
            <Field label="哪年出生">
              <Input
                type="number"
                inputMode="numeric"
                value={year}
                onChange={(e) => setYear(e.target.value.slice(0, 4))}
                placeholder="比如 1968"
                aria-label="出生年份"
              />
            </Field>
          )}
        </Card>
      )}

      <Card className="divide-y divide-line">
        {(r.name || r.gender || r.birthYear != null) && (
          <Row label="你是">
            <span className="text-xl font-semibold">
              {[r.name, r.gender, r.birthYear != null ? `${r.birthYear} 年生（${ageOf(r.birthYear)} 岁）` : ""].filter(Boolean).join("，")}
            </span>
            {body.length > 0 && <span className="block">{body.join("，")}</span>}
          </Row>
        )}
        <Row label="老毛病">{r.conditions.length ? r.conditions.join("、") : "报告上没有写"}</Row>
        <Row label="过敏">{r.allergies.length ? <span className="font-semibold text-danger">{r.allergies.join("、")}</span> : "报告上没有写"}</Row>
        <Row label="长期吃的药">
          {r.medications.length ? (
            <ul className="space-y-0.5">
              {r.medications.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          ) : (
            "报告上没有写"
          )}
        </Row>
        {r.surgeries.length > 0 && <Row label="做过的手术">{r.surgeries.join("、")}</Row>}
        {r.familyHistory.length > 0 && <Row label="家里人的病">{r.familyHistory.join("、")}</Row>}
        {r.readings.length > 0 && (
          <Row label={`这次体检的数${r.date ? `（${fmtDate(`${r.date}T12:00:00`, { year: true })}）` : ""}`}>{r.readings.map(readingText).join("、")}</Row>
        )}
        {r.abnormal.length > 0 && (
          <Row label="报告上要留意的">
            <ul className="space-y-0.5">
              {r.abnormal.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </Row>
        )}
        {r.advice && <Row label="体检建议">{r.advice}</Row>}
      </Card>

      {error && (
        <p role="alert" className="text-lg font-medium text-danger">
          {error}
        </p>
      )}

      <Button size="lg" className="w-full" onClick={confirm}>
        对，建档
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => onEdit(draftOf(r, { name, gender, year }))}>
          改一下
        </Button>
        <Button variant="secondary" onClick={onRetake}>
          重新拍
        </Button>
      </div>
      <p className="text-center text-base leading-relaxed text-ink-2">
        老毛病只照抄报告上「既往史」里写的，不会因为某个数偏高就替你写上一种病。
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-4">
      <p className="text-base text-ink-2">{label}</p>
      <div className="mt-0.5 text-lg leading-relaxed text-ink">{children}</div>
    </div>
  );
}

/** Everything in plain boxes, filled in from the report. Only reached through 改一下. */
function EditAll({ draft: initial, onCancel, onSave }: { draft: ProfileDraft; onCancel: () => void; onSave: (profile: Profile) => void }) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    const bad = validateBasics(draft);
    if (bad) return setError(bad);
    setError(null);
    onSave(profileFromDraft(draft));
  };
  return (
    <div className="mx-auto w-full max-w-[36rem] space-y-4 px-4 pt-8 pb-12">
      <h1 className="text-[1.65rem] leading-tight font-semibold tracking-tight text-ink">改一下</h1>
      <Card className="p-5">
        <BasicFields draft={draft} onChange={setDraft} />
      </Card>
      <Card className="p-5">
        <HistoryFields draft={draft} onChange={setDraft} />
      </Card>
      <Card className="p-5">
        <h2 className="text-xl font-semibold text-ink">紧急联系人</h2>
        <p className="mt-1 mb-4 text-base leading-relaxed text-ink-2">出了状况时，旁边的人可以打给谁。可以先不填。</p>
        <ContactFields draft={draft} onChange={setDraft} />
      </Card>
      {error && (
        <p role="alert" className="text-lg font-medium text-danger">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="lg" onClick={onCancel}>
          不改了
        </Button>
        <Button size="lg" onClick={save}>
          改好了，建档
        </Button>
      </div>
    </div>
  );
}

/* ---------- without a report: who you are, and one sentence about your health ---------- */

function ManualForm({ onDone }: { onDone: (profile: Profile) => void }) {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [year, setYear] = useState("");
  const [history, setHistory] = useState("");
  const [none, setNone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 96)}px`;
  }, [history]);

  const submit = async () => {
    const y = Number(year);
    const thisYear = new Date().getFullYear();
    if (!name.trim()) return setError("请填一下怎么称呼你");
    if (!gender) return setError("请选一下性别");
    if (!Number.isInteger(y) || y < thisYear - 110 || y > thisYear) return setError("出生年份请填四位数，比如 1968");
    setError(null);
    setSaving(true);
    const said = none ? "" : history.trim();
    const parsed = said && !NOTHING.test(said) ? await parseProfile(said) : null;
    const now = nowISO();
    onDone({
      name: name.trim(),
      gender,
      birthYear: y,
      heightCm: null,
      weightKg: null,
      bloodType: null,
      conditions: parsed?.conditions ?? [],
      allergies: parsed?.allergies ?? [],
      medications: parsed?.medications ?? [],
      surgeries: parsed?.surgeries ?? [],
      familyHistory: parsed?.familyHistory ?? [],
      notes: "",
      emergencyContact: null,
      createdAt: now,
      updatedAt: now,
    });
  };

  return (
    <form
      className="mt-6 space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Card className="space-y-5 p-5">
        <Field label="怎么称呼你">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="姓名或者昵称" autoComplete="name" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="性别">
            <Segmented
              label="性别"
              className="flex w-full"
              options={[
                { value: "男", label: "男" },
                { value: "女", label: "女" },
              ]}
              value={gender ?? ("" as Gender)}
              onChange={(v) => setGender(v)}
            />
          </Field>
          <Field label="哪年出生">
            <Input
              type="number"
              inputMode="numeric"
              value={year}
              onChange={(e) => setYear(e.target.value.slice(0, 4))}
              placeholder="比如 1968"
              aria-label="出生年份"
            />
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <label htmlFor="history" className="block text-base font-medium text-ink">
          有什么老毛病、过敏、长期吃的药？
        </label>
        <p className="mt-0.5 text-base leading-relaxed text-ink-2">像跟医生说话一样说一句就行，我来分类。</p>
        <div
          className={cn(
            "mt-3 flex items-end gap-2 rounded-2xl border-2 border-line-strong bg-surface p-2 transition focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100",
            none && "opacity-50",
          )}
        >
          <textarea
            id="history"
            ref={box}
            value={history}
            disabled={none}
            onChange={(e) => setHistory(e.target.value)}
            placeholder="比如：有高血压，对青霉素过敏，每天吃一片降压药"
            className="min-h-24 flex-1 resize-none bg-transparent px-2.5 py-2 text-lg leading-relaxed text-ink outline-none placeholder:text-ink-3"
          />
          <MicButton onText={(t) => setHistory((x) => (x ? `${x}${t}` : t))} disabled={none} />
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={none}
          onClick={() => setNone((n) => !n)}
          className={cn(
            "mt-3 min-h-12 rounded-full border-2 px-5 text-lg transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200",
            none ? "border-brand-500 bg-brand-50 font-medium text-brand-800" : "border-line-strong bg-surface text-ink hover:bg-surface-2",
          )}
        >
          都没有
        </button>
      </Card>

      {error && (
        <p role="alert" className="text-lg font-medium text-danger">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" loading={saving}>
        {saving ? "正在记下来" : "开始用"}
      </Button>
    </form>
  );
}
