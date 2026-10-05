"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import {
  Activity,
  CalendarCheck,
  FileText,
  HeartPulse,
  History,
  MessageCircleQuestion,
  NotebookPen,
  Phone,
  Settings,
  ShieldAlert,
  Siren,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { hasYearOfData } from "@/lib/metrics";
import { ageOf, cn, fmtDate } from "@/lib/utils";
import { addPastHistory, ageFromBirthDate, ageLabel, educationLabel, genderLabel } from "@/app/me/profile-data";
import { useToast } from "@/components/Toast";
import {
  Button,
  Card,
  IconTile,
  LinkButton,
  Modal,
  PageHeader,
  RowLink,
  SectionTitle,
  TextButton,
  TextLink,
  Textarea,
  Toggle,
  focusRing,
} from "@/components/ui";
import { L } from "@/lib/lang";

/** 我的档案: who I am, everything recorded so far, and the few settings there are. */
export default function MePage() {
  const { state, updateSettings, setNextVisit } = useStore();
  const profile = state.profile;
  if (!profile) return null;
  const { longTerm } = state.settings;
  const contact = profile.emergencyContact;

  const facts: [string, string[]][] = [
    [L("基础病和以往病史", "Health conditions and past illnesses"), profile.conditions],
    [L("过敏史", "Allergies"), profile.allergies],
    [L("长期吃的药", "Regular medicines"), profile.medications],
    [L("做过的手术", "Past operations"), profile.surgeries],
    [L("家族遗传病", "Family history"), profile.familyHistory],
  ];
  const age = (profile.birthDate ? ageFromBirthDate(profile.birthDate) : null) ?? ageOf(profile.birthYear);

  return (
    <div className="space-y-6 pb-2">
      <PageHeader
        title={L("我的档案", "My profile")}
        aside={
          <Link
            href="/me/settings"
            aria-label={L("设置", "Settings")}
            className={cn(
              "press -mr-2 flex h-12 w-12 items-center justify-center rounded-xl text-ink-2 transition hover:bg-surface-2 hover:text-ink",
              focusRing,
            )}
          >
            <Settings className="h-6 w-6" />
          </Link>
        }
      />

      {/* Identity and medical facts form one plain, grouped list. */}
      <Card tone="raised" className="animate-pop overflow-hidden">
        <div className="flex items-center gap-3.5 px-4 py-4">
          <span
            aria-hidden="true"
            className="flex h-15 w-15 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[1.6rem] leading-none font-semibold text-white"
          >
            {Array.from(profile.name.trim())[0] ?? ""}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="name-title text-ink">{profile.name}</h2>
            <p className="t-body mt-0.5 text-ink-2">
              {/* each part stays whole when the line wraps on a narrow phone */}
              {[genderLabel(profile.gender), ageLabel(age), profile.education ? educationLabel(profile.education) : null].filter(Boolean).map((part, i) => (
                <Fragment key={i}>
                  {i > 0 && <span className="mx-1.5 text-ink-3">·</span>}
                  <span className="whitespace-nowrap">{part}</span>
                </Fragment>
              ))}
            </p>
          </div>
          <LinkButton href="/me/edit" variant="secondary" size="sm" className="press shrink-0 self-center">
            {L("修改", "Edit")}
          </LinkButton>
        </div>
        <dl className="divide-y divide-line border-t border-line">
          {facts
            .filter(([, list]) => list.length || list === profile.conditions || list === profile.allergies)
            .map(([label, list]) => {
              // allergies must not be missed by anyone reading the card
              const allergy = list === profile.allergies;
              const warn = allergy && list.length > 0;
              return (
                <div key={label} className={cn("flex items-start gap-3 px-4 py-3", warn && "bg-danger-bg/50")}>
                  {allergy && (
                    <IconTile tone={warn ? "danger" : "neutral"} size="sm" className="mt-0.5">
                      <ShieldAlert />
                    </IconTile>
                  )}
                  <div className="min-w-0 flex-1">
                    <dt className={cn("text-base font-medium", warn ? "text-danger" : "text-ink-2")}>{label}</dt>
                    <dd className={cn("t-body mt-0.5", list.length ? "text-ink" : "text-ink-3", warn && "text-lg font-medium")}>
                      {list.length ? list.join(L("、", ", ")) : L("还没填", "Not filled in yet")}
                    </dd>
                  </div>
                </div>
              );
            })}
          {profile.notes && (
            <div className="px-4 py-3">
              <dt className="text-base font-medium text-ink-2">{L("还想让医生知道的", "Anything else for the doctor")}</dt>
              <dd className="t-body mt-0.5 text-ink">{profile.notes}</dd>
            </div>
          )}
        </dl>
        {/* who to call: the first thing the emergency page shows, so it is kept in sight here */}
        <div className="flex items-center gap-3 border-t border-line bg-surface-2/60 px-4 py-3.5">
          <IconTile tone={contact ? "good" : "neutral"} size="lg">
            <Phone />
          </IconTile>
          <dl className="min-w-0 flex-1">
            <dt className="text-base font-medium text-ink-2">{L("紧急联系人", "Emergency contact")}</dt>
            {contact ? (
              <dd className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="text-lg font-medium text-ink">{[contact.relation, contact.name].filter(Boolean).join(" ")}</span>
                <span className="t-heading text-ink tabular-nums">{contact.phone}</span>
              </dd>
            ) : (
              <dd className="flex flex-wrap items-center justify-between gap-x-3 text-lg text-ink-2">
                {L("还没有紧急联系人", "No emergency contact yet")}
                <TextLink href="/me/edit#contact" className="-my-2 -mr-2">
                  {L("去填", "Add one")}
                </TextLink>
              </dd>
            )}
          </dl>
        </div>
      </Card>

      <div className="rise-1">
        <PastHistory />
      </div>

      {state.nextVisit && (
        <Card tone="brand" className="rise-2 flex items-start gap-3.5 p-4">
          <IconTile tone="solid" size="lg">
            <CalendarCheck />
          </IconTile>
          <div className="min-w-0 flex-1 pt-1">
            <p className="t-lead font-medium text-ink">
              {L(`${fmtDate(state.nextVisit.at, { weekday: true })}要去看医生：`, `Doctor's visit on ${fmtDate(state.nextVisit.at, { weekday: true })}: `)}
              {state.nextVisit.note}
            </p>
            <TextButton className="mt-1 -ml-2" onClick={() => setNextVisit(null)}>
              {L("不用提醒了", "No more reminders")}
            </TextButton>
          </div>
        </Card>
      )}

      <section className="rise-3">
        <SectionTitle>{L("更多", "More")}</SectionTitle>
        <Card className="divide-y divide-line overflow-hidden">
          <Toggle
            checked={longTerm}
            onChange={(v) => updateSettings({ longTerm: v })}
            icon={<HeartPulse />}
            label={L("长期管理", "Long-term care")}
            detail={L(
              "有糖尿病、高血压这类要长期记录的情况时打开。打开后，首页会按时问你一个数，比如今天的血糖。关掉后首页不再问，下面的「健康指标」和「这一年」也收起来，记录都还在。",
              "For diabetes, high blood pressure or anything tracked over time. The home page asks for one number on schedule, like today's blood sugar. Turned off, it stops asking and hides \"Health numbers\" and \"This year\". Your records stay.",
            )}
          />
          {longTerm && <RowLink href="/me/metrics" icon={<Activity />} title={L("健康指标", "Health numbers")} detail={L("血糖、血压、体重的记录和变化", "Blood sugar, blood pressure and weight over time")} className="press" />}
          {longTerm && hasYearOfData(state) && (
            <RowLink href="/doctor/year" icon={<FileText />} title={L("给医生看：这一年", "For the doctor: this year")} detail={L("复诊时把一年的变化交给医生", "Show the doctor a year of changes at a follow-up visit")} className="press" />
          )}
          <RowLink href="/ask" icon={<MessageCircleQuestion />} iconTone="info" title={L("问问诊奶昔", "Ask VisitSmoothie")} detail={L("记不清的，问我", "Can't remember something? Ask me")} className="press" />
          <RowLink href="/sos" icon={<Siren />} iconTone="solidDanger" title={L("应急手册", "Emergency guide")} detail={L("突发状况时，打开给身边的人看", "In an emergency, open this and show the people around you")} className="press" />
          <RowLink href="/me/settings" icon={<Settings />} iconTone="neutral" title={L("设置", "Settings")} detail={L("提醒、备份、演示数据", "Reminders, backup, demo")} className="press" />
        </Card>
      </section>
    </div>
  );
}

/**
 * 补充以往病史: typed one per line. Operations go to 做过的手术, the rest to 基础病和以往病史;
 * both are part of the profile every consultation is given.
 */
function PastHistory() {
  const { state, setProfile } = useStore();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const profile = state.profile;
  if (!profile) return null;
  const close = () => {
    setOpen(false);
    setText("");
  };
  const save = () => {
    const { profile: next, surgeries, conditions } = addPastHistory(profile, text);
    if (!surgeries.length && !conditions.length) {
      toast.show(text.trim() ? L("这些档案里已经有了", "These are already in your profile") : L("还没写内容", "Nothing written yet"), "neutral");
      return;
    }
    setProfile(next);
    close();
    toast.show(L(`已记进档案：${[...conditions, ...surgeries].join("、")}`, `Added to your profile: ${[...conditions, ...surgeries].join(", ")}`), "good");
  };
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3.5">
        <IconTile size="lg">
          <History />
        </IconTile>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="t-heading text-ink">{L("以往病史", "Past illnesses")}</p>
          <p className="t-body mt-1 text-ink-2">
            {L(
              "以前得过的病、受过的伤、做过的手术，补上以后，问诊时我会一起考虑。",
              "Illnesses, injuries and operations you had before. Once added, I keep them in mind when we talk about how you feel.",
            )}
          </p>
        </div>
      </div>
      <Button size="lg" variant="secondary" className="press mt-4 w-full" onClick={() => setOpen(true)}>
        <NotebookPen className="h-6 w-6" />
        {L("补充以往病史", "Add past illnesses")}
      </Button>
      <Modal
        open={open}
        title={L("补充以往病史", "Add past illnesses")}
        onClose={close}
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              {L("先不写", "Not now")}
            </Button>
            <Button onClick={save}>{L("记进档案", "Add to profile")}</Button>
          </>
        }
      >
        <p className="t-body mb-3 text-ink-2">{L("一行写一条，写上大概哪年。", "One per line, with roughly which year.")}</p>
        <Textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label={L("以往病史", "Past illnesses")}
          placeholder={L("比如：\n2015 年阑尾切除\n2024 年右膝扭伤", "For example:\n2015 appendix removed\n2024 sprained right knee")}
          className="min-h-36"
        />
      </Modal>
    </Card>
  );
}
