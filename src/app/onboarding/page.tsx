"use client";

import "../welcome/smoothie.css";
import { SmoothieFooter, SmoothieHeader } from "@/components/Smoothie";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, ChevronLeft, ScanText, X } from "lucide-react";
import type { CheckupResult, Gender, MetricType, Profile } from "@/lib/types";
import { reloadAccount, useStore } from "@/lib/store";
import { placeholderName } from "@/lib/dev";
import { currentAccountId, legacyProfile, passwordProblem, registerHere, PASSWORD_MAX, PASSWORD_MIN } from "@/lib/accounts";
import { L } from "@/lib/lang";
import { PhotoError, readCheckup } from "@/lib/ai/client";
import { SAMPLE_CHECKUP, SAMPLE_CHECKUP_URL, readingText, saveCheckup } from "@/lib/checkup";
import { compressImage } from "@/lib/image";
import { ageOf, fmtDate } from "@/lib/utils";
import { useAiAvailable } from "@/components/AiStatus";
import {
  RegisterFields,
  emptyRegister,
  registerFromProfile,
  missingFields,
  profileFromRegister,
  validateRegister,
  type RegisterDraft,
} from "@/components/ProfileForm";
import type { RequiredField } from "@/app/me/profile-data";
import { Button, Card, Spinner, TextButton } from "@/components/ui";

const MAX_PHOTOS = 6;
/** A report page has small print: it is sent larger than other photos, or rows of a tilted table get mixed up. */
const PHOTO_SIDE = 2400;

/** Why the photos could not be used. Kept as a code so the sentence follows the language of the page. */
type Problem = "unavailable" | "unreadable" | "failed" | "photo";

type Stage =
  | { kind: "start" }
  | { kind: "report" }
  | { kind: "reading"; count: number }
  | { kind: "confirm"; result: CheckupResult; sample: boolean };

/** Which numbers are worth tracking for the long-term conditions someone has. */
function metricsFor(conditions: string[], medications: string[]): MetricType[] {
  const text = [...conditions, ...medications].join(" ");
  const out: MetricType[] = [];
  if (/糖尿病|血糖|二甲双胍|胰岛素|diabet|glucose|blood sugar|metformin|insulin/i.test(text)) out.push("fbg", "hba1c");
  if (/高血压|血压|降压|hypertension|blood pressure/i.test(text)) out.push("bp");
  return out;
}

function problemText(problem: Problem): string {
  if (problem === "unavailable") return L("现在认不了照片。可以先填上面的表来建档。", "Photos cannot be read right now. You can fill in the form instead.");
  if (problem === "unreadable") {
    return L(
      "这张照片上没认出体检的内容。换个角度、光线亮一点再拍一张，或者回去填表。看病的单子可以在建档以后用「看完医生了」来拍。",
      "I could not find check-up results in this photo. Try another angle with more light, or go back and fill in the form. Papers from a doctor's visit can be photographed after setup, under I've seen the doctor.",
    );
  }
  if (problem === "photo") return L("这张照片打不开，换一张试试。", "This photo could not be opened. Try another one.");
  return L("这次没认出来。可以再试一次，或者回去填表。", "That did not work this time. Try again, or go back and fill in the form.");
}

/** 男 / 女 are stored as they are; only what is shown follows the language. */
const genderLabel = (g: Gender) => (g === "男" ? L("男", "Male") : g === "女" ? L("女", "Female") : L("其他", "Other"));

/**
 * 建档: 七项（昵称、出生日期、性别、学历必填；基础病、家族遗传病、过敏史选填）。
 * A check-up report is the optional shortcut: photograph it and the record is filled in from it.
 */
export default function OnboardingPage() {
  const { state, ready, setProfile, updateSettings } = useStore();
  const router = useRouter();
  const canRead = useAiAvailable();
  const [stage, setStage] = useState<Stage>({ kind: "start" });
  // a profile kept here from before there were accounts is offered to the new account
  const [legacy] = useState(() => (typeof window === "undefined" ? null : legacyProfile()));
  const [takeLegacy, setTakeLegacy] = useState(true);
  const [form, setForm] = useState<RegisterDraft>(() => (legacy ? registerFromProfile(legacy) : emptyRegister()));
  const [pw, setPw] = useState({ password: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  // already logged in without a profile (a registration cut short): no password needed again
  const [hasAccount] = useState(() => typeof window !== "undefined" && Boolean(currentAccountId()));
  const [missing, setMissing] = useState<RequiredField[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [problem, setProblem] = useState<Problem | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  // set as soon as a profile is being created here, so the redirect below leaves this page alone
  const creating = useRef(false);

  // someone who already has a profile has no business here
  useEffect(() => {
    if (ready && state.profile && !creating.current) router.replace("/");
  }, [ready, state.profile, router]);

  if (!ready) return null;

  /**
   * Registers (name and password), then saves the profile (and the check-up it came from) in the
   * new account and goes to the main screen. Returns the sentence to show when it cannot.
   */
  const complete = async (given: Profile, checkup: CheckupResult | null): Promise<string | null> => {
    // 开发者开关开着、姓名没填：用一个占位的名字，账号才有个名字
    const profile = given.name.trim() ? given : { ...given, name: placeholderName() };
    if (!hasAccount) {
      const bad = passwordProblem(pw.password, pw.confirm);
      if (bad) return bad;
      setSaving(true);
      creating.current = true;
      const err = await registerHere(profile.name, pw.password, pw.confirm, Boolean(legacy) && takeLegacy);
      setSaving(false);
      if (err) {
        creating.current = false;
        return err;
      }
      reloadAccount();
    }
    creating.current = true;
    setProfile(profile);
    const hasCheckup = checkup != null && (checkup.abnormal.length > 0 || checkup.readings.length > 0 || Boolean(checkup.advice));
    if (checkup && hasCheckup) saveCheckup(checkup);
    // Someone with diabetes or high blood pressure is asked for those numbers from the start: no question about it.
    const metrics = metricsFor(profile.conditions, profile.medications);
    if (metrics.length) updateSettings({ longTerm: true, trackedMetrics: metrics });
    router.replace("/");
    return null;
  };

  const passwordFields = hasAccount ? null : (
    <PasswordFields value={pw} onChange={(v) => {
      setPw(v);
      setError(null);
    }} />
  );

  const change = (d: RegisterDraft) => {
    setForm(d);
    setError(null);
    // a field that was flagged stops being red as soon as it is filled
    setMissing((m) => m.filter((f) => missingFields(d).includes(f)));
  };

  const submitForm = () => {
    const bad = validateRegister(form);
    if (bad) {
      setMissing(missingFields(form));
      setError(bad);
      return;
    }
    void complete(profileFromRegister(form, legacy && takeLegacy ? legacy : null), null).then((err) => err && setError(err));
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
      setProblem(err instanceof PhotoError ? err.reason : "failed");
      setStage({ kind: "report" });
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
      const res = await readCheckup([await compressImage(blob, PHOTO_SIDE)]);
      setStage({ kind: "confirm", result: res.result, sample: true });
    } catch {
      setStage({ kind: "confirm", result: SAMPLE_CHECKUP, sample: true });
    }
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const added = await Promise.all(
        Array.from(files)
          .slice(0, MAX_PHOTOS - photos.length)
          .map((f) => compressImage(f, PHOTO_SIDE)),
      );
      setPhotos((p) => [...p, ...added].slice(0, MAX_PHOTOS));
      setProblem(null);
    } catch {
      setProblem("photo");
    }
  };

  /* ---------- the report is being read ---------- */

  if (stage.kind === "reading") {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-[36rem] flex-col justify-center px-4 py-8">
        <Card className="flex flex-col items-center gap-3 px-5 py-12 text-center" role="status">
          <Spinner className="h-10 w-10" />
          <p className="text-xl font-semibold text-ink">{L("正在认体检报告上的字", "Reading your check-up report")}</p>
          <p className="text-lg leading-relaxed text-ink-2">
            {L(
              `${stage.count > 1 ? `一共 ${stage.count} 张，` : ""}大约要半分钟到一分钟，请等一下。`,
              `${stage.count > 1 ? `${stage.count} photos. ` : ""}This takes about half a minute to a minute. Please wait.`,
            )}
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
        typed={form}
        extra={passwordFields}
        onConfirm={(profile) => complete(profile, stage.result)}
        onRetake={() => {
          setPhotos([]);
          setStage({ kind: "report" });
        }}
      />
    );
  }

  /* ---------- the optional shortcut: photograph a check-up report ---------- */

  if (stage.kind === "report") {
    return (
      <div className="mx-auto w-full max-w-[36rem] px-4 pt-6 pb-12">
        <button
          type="button"
          onClick={() => {
            setProblem(null);
            setStage({ kind: "start" });
          }}
          className="-ml-2 inline-flex min-h-12 items-center gap-0.5 rounded-xl px-2 text-base font-medium text-ink-2 transition hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
        >
          <ChevronLeft className="h-5 w-5" />
          {L("回去填表", "Back to the form")}
        </button>

        {problem && (
          <p role="alert" className="mt-3 rounded-2xl border border-warn/30 bg-warn-bg px-4 py-3.5 text-lg leading-relaxed text-ink">
            {problemText(problem)}
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

        <Card className="mt-3 p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
              <ScanText className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold text-ink">{L("用体检报告建档", "Use a check-up report")}</h1>
              <p className="mt-0.5 text-lg leading-relaxed text-ink-2">
                {canRead
                  ? L("拍一下最近一次的体检报告，我把档案填好，你看一眼就行。", "Photograph your latest check-up report. I fill in your record, and you just look it over.")
                  : L("这台设备现在认不了照片。可以先用示例报告看看是什么样。", "Photos cannot be read right now. You can try the sample report to see how it works.")}
              </p>
            </div>
          </div>

          {photos.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {photos.map((src, i) => (
                <div key={i} className="relative h-24 w-20 overflow-hidden rounded-xl border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={L(`第 ${i + 1} 页`, `Page ${i + 1}`)} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    aria-label={L(`去掉第 ${i + 1} 页`, `Remove page ${i + 1}`)}
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
                  {L(`开始整理（${photos.length} 张）`, `Read ${photos.length} ${photos.length === 1 ? "photo" : "photos"}`)}
                </Button>
                {photos.length < MAX_PHOTOS && (
                  <Button variant="secondary" size="lg" className="w-full" onClick={() => cameraRef.current?.click()}>
                    <Camera className="h-6 w-6" />
                    {L("再拍一页", "Add a page")}
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
                <span className="text-xl font-semibold">{L("拍体检报告", "Photograph the report")}</span>
                <span className="text-base text-ink">
                  {L(`有好几页的话，一页一页拍，最多 ${MAX_PHOTOS} 张`, `For several pages, take one photo per page, up to ${MAX_PHOTOS}`)}
                </span>
              </button>
            ))}

          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3">
            {canRead ? <TextButton onClick={() => albumRef.current?.click()}>{L("从相册选", "Choose photos")}</TextButton> : <span />}
            <TextButton onClick={() => void trySample()}>{L("用示例报告试试", "Try a sample")}</TextButton>
          </div>
          {canRead && (
            <p className="mt-1 text-base leading-relaxed text-ink-2">
              {L("照片只用来认字，认完就丢，不会保存。", "Photos are only used to read the text. They are thrown away afterwards and never saved.")}
            </p>
          )}
        </Card>
      </div>
    );
  }

  /* ---------- the start: seven items, in the teammate's Visit Smoothie layout ---------- */

  return (
    <div className="onboarding-shell">
      <SmoothieHeader />
      <main className="onboarding-main is-register">
        <Link href="/welcome" className="onboarding-back">
          <ChevronLeft className="h-4 w-4" />
          返回
        </Link>
        <div className="registration-layout">
          {/*
            建档的左栏：用户要求把这一栏做得极简 —— 一句「可跳过」的提示，加两个安静的入口。
            原来这里的大标题、步骤说明和重复的解释文字都去掉了，表单因此成为主角。
          */}
          <aside className="registration-guide">
            <p className="registration-eyebrow">个人档案</p>
            <p className="guide-hint">健康信息可跳过，之后可以补充。</p>
            <div className="guide-links">
              <Link href="/login" className="guide-link">
                直接登录
              </Link>
              <Link href="/demo/lin" className="guide-link">
                林叔：一次左膝痛（虚构）
              </Link>
            </div>
          </aside>

          <section className="registration-card" aria-labelledby="profile-title">
            <header className="registration-card-header">
              <div>
                <p className="registration-eyebrow">LET’S GET TO KNOW YOU</p>
                <h2 id="profile-title">建立个人档案</h2>
              </div>
              <button
                type="button"
                className="onboarding-language"
                onClick={() => {
                  setError(null);
                  setStage({ kind: "report" });
                }}
              >
                有体检报告？拍一下，我帮你填
              </button>
            </header>
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                submitForm();
              }}
            >
              {legacy && (
                <p className="smoothie-note">
                  {takeLegacy
                    ? `这台电脑上原来有「${legacy.name}」的档案和记录，已经帮你填好。注册后，它们会接到这个新账号里。`
                    : `「${legacy.name}」原来的档案留在这台电脑上，不接到新账号。`}{" "}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      const next = !takeLegacy;
                      setTakeLegacy(next);
                      setForm(next ? registerFromProfile(legacy) : emptyRegister());
                    }}
                  >
                    {takeLegacy ? "不要接，从空白开始" : "还是接过来"}
                  </button>
                </p>
              )}
              <RegisterFields draft={form} onChange={change} missing={missing} />
              {passwordFields}
              {error && (
                <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger-bg px-4 py-3 text-base font-medium text-danger">
                  {error}
                </p>
              )}
              <div className="registration-submit">
                <p>留空的内容将标记为「未记录」，之后随时可以补充。</p>
                <button type="submit" className="smoothie-button" disabled={saving}>
                  {saving ? "正在保存…" : hasAccount ? "保存并开始" : "注册并保存"}
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            </form>
          </section>
        </div>
      </main>
      <SmoothieFooter />
    </div>
  );
}

/* ---------- what was read from the report, then the seven items to complete ---------- */

function Confirm({
  result: r,
  sample,
  typed,
  extra,
  onConfirm,
  onRetake,
}: {
  result: CheckupResult;
  sample: boolean;
  /** what was already typed on the form before going to the report */
  typed: RegisterDraft;
  /** the password fields, when this is a registration */
  extra?: React.ReactNode;
  /** resolves to the sentence to show when saving failed */
  onConfirm: (profile: Profile) => Promise<string | null>;
  onRetake: () => void;
}) {
  const [draft, setDraft] = useState<RegisterDraft>(() => ({
    ...typed,
    name: typed.name || r.name || "",
    gender: typed.gender || (r.gender === "男" || r.gender === "女" ? r.gender : ""),
    conditions: typed.conditions || r.conditions.join("\n"),
    familyHistory: typed.familyHistory || r.familyHistory.join("\n"),
    allergies: typed.allergies || r.allergies.join("\n"),
  }));
  const [missing, setMissing] = useState<RequiredField[]>([]);
  const [error, setError] = useState<string | null>(null);
  const list = (items: string[]) => items.join("、");
  const who = [
    r.name,
    r.gender ? genderLabel(r.gender) : "",
    r.birthYear != null ? `${r.birthYear} 年生（约 ${ageOf(r.birthYear)} 岁）` : "",
  ].filter(Boolean);
  const body = [
    r.heightCm != null ? `身高 ${r.heightCm} cm` : "",
    r.weightKg != null ? `体重 ${r.weightKg} kg` : "",
    r.bloodType ? `${r.bloodType} 型血` : "",
  ].filter(Boolean);
  const when = r.date ? fmtDate(`${r.date}T12:00:00`, { year: true }) : "";

  const change = (d: RegisterDraft) => {
    setDraft(d);
    setError(null);
    setMissing((m) => m.filter((f) => missingFields(d).includes(f)));
  };

  const confirm = () => {
    const bad = validateRegister(draft);
    if (bad) {
      setMissing(missingFields(draft));
      return setError(bad);
    }
    // what the seven items do not cover is taken from the report as it was read
    void onConfirm(
      profileFromRegister(draft, {
        heightCm: r.heightCm,
        weightKg: r.weightKg,
        bloodType: r.bloodType,
        medications: r.medications,
        surgeries: r.surgeries,
      }),
    ).then((err) => err && setError(err));
  };

  return (
    <div className="mx-auto w-full max-w-[36rem] space-y-4 px-4 pt-8 pb-12">
      <div>
        <h1 className="text-[1.65rem] leading-tight font-semibold tracking-tight text-ink">我从体检报告里认出了这些</h1>
        <p className="mt-1.5 text-lg leading-relaxed text-ink-2">看一眼对不对，再把下面带 * 的补上就能建档。</p>
      </div>

      {sample && (
        <p className="rounded-2xl border border-info/20 bg-info-bg px-4 py-3.5 text-lg leading-relaxed text-ink">这是示例体检报告，人物是虚构的。</p>
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

      <Card className="divide-y divide-line">
        {who.length > 0 && (
          <Row label="报告上的你">
            <span className="text-xl font-semibold">{who.join("，")}</span>
            {body.length > 0 && <span className="block">{body.join("，")}</span>}
          </Row>
        )}
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
        {r.surgeries.length > 0 && <Row label="做过的手术">{list(r.surgeries)}</Row>}
        {r.readings.length > 0 && (
          <Row label={`这次体检的数${when ? `（${when}）` : ""}`}>
            {list(r.readings.map(readingText))}
            {!r.date && (
              <span className="mt-1 block text-base text-ink-2">报告上没认出体检日期，这几个数只在这里给你看，不会记进档案。</span>
            )}
          </Row>
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
        {r.advice && (
          <Row label="体检建议">
            <span className="whitespace-pre-line">{r.advice}</span>
          </Row>
        )}
      </Card>

      <Card className="p-5">
        <p className="mb-4 text-lg font-semibold text-ink">你的资料（报告上有的已经填好，可以改）</p>
        <RegisterFields draft={draft} onChange={change} missing={missing} birthYearHint={r.birthYear} />
      </Card>
      {extra && (
        <Card className="smoothie-scope p-5">
          {extra}
        </Card>
      )}

      {error && (
        <p role="alert" className="rounded-2xl border border-danger/30 bg-danger-bg px-4 py-3 text-lg font-medium text-danger">
          {error}
        </p>
      )}

      <Button size="lg" className="w-full" onClick={confirm}>
        对，建档
      </Button>
      <Button variant="secondary" size="lg" className="w-full" onClick={onRetake}>
        重新拍
      </Button>
      <p className="text-center text-base leading-relaxed text-ink-2">
        基础病只照抄报告上「既往史」里写的，不会因为某个数偏高就替你写上一种病。
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

/* ---------- the password, as in the teammate's version: 15 to 128 characters, typed twice ---------- */

function PasswordFields({
  value,
  onChange,
}: {
  value: { password: string; confirm: string };
  onChange: (v: { password: string; confirm: string }) => void;
}) {
  return (
    <section className="registration-section history-section" aria-labelledby="password-heading">
      <div className="form-section-title">
        <h3 id="password-heading">设置登录密码</h3>
        <span>必填</span>
      </div>
      <div className="field-grid">
        <div className="field">
          <label htmlFor="password">密码</label>
          <input
            type="password"
            id="password"
            autoComplete="new-password"
            maxLength={PASSWORD_MAX}
            value={value.password}
            onChange={(e) => onChange({ ...value, password: e.target.value })}
            aria-describedby="password-hint"
          />
          <small id="password-hint">{`${PASSWORD_MIN}–${PASSWORD_MAX} 个字，可以用一句好记的话。`}</small>
        </div>
        <div className="field">
          <label htmlFor="confirm-password">确认密码</label>
          <input
            type="password"
            id="confirm-password"
            autoComplete="new-password"
            maxLength={PASSWORD_MAX}
            value={value.confirm}
            onChange={(e) => onChange({ ...value, confirm: e.target.value })}
          />
        </div>
      </div>
    </section>
  );
}
