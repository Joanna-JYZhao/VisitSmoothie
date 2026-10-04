"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Activity,
  CalendarCheck,
  FileText,
  HeartPulse,
  MessageCircleQuestion,
  NotebookPen,
  Settings,
  Siren,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { hasYearOfData } from "@/lib/metrics";
import { ageOf, cn, fmtDate } from "@/lib/utils";
import { addPastHistory, ageFromBirthDate } from "@/app/me/profile-data";
import { useToast } from "@/components/Toast";
import {
  Button,
  Card,
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

/** 我的档案: who I am, everything recorded so far, and the few settings there are. */
export default function MePage() {
  const { state, updateSettings, setNextVisit } = useStore();
  const profile = state.profile;
  if (!profile) return null;
  const { longTerm } = state.settings;
  const contact = profile.emergencyContact;

  const facts: [string, string[]][] = [
    ["基础病和以往病史", profile.conditions],
    ["过敏史", profile.allergies],
    ["长期吃的药", profile.medications],
    ["做过的手术", profile.surgeries],
    ["家族遗传病", profile.familyHistory],
  ];
  const age = (profile.birthDate ? ageFromBirthDate(profile.birthDate) : null) ?? ageOf(profile.birthYear);

  return (
    <div className="space-y-6">
      <PageHeader
        title="我的档案"
        aside={
          <Link
            href="/me/settings"
            aria-label="设置"
            className={cn(
              "-mr-2 flex h-12 w-12 items-center justify-center rounded-xl text-ink-2 transition hover:bg-surface-2 hover:text-ink",
              focusRing,
            )}
          >
            <Settings className="h-6 w-6" />
          </Link>
        }
      />

      <Card className="p-5">
        <div className="flex items-center gap-3.5">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-50 text-2xl font-semibold text-brand-800"
          >
            {Array.from(profile.name.trim())[0] ?? ""}
          </span>
          <p className="min-w-0 flex-1 text-2xl leading-tight font-semibold text-ink">
            {profile.name}
            <span className="mt-0.5 block text-lg font-normal text-ink-2">
              {[profile.gender, `${age} 岁`, profile.education].filter(Boolean).join(" · ")}
            </span>
          </p>
          <LinkButton href="/me/edit" variant="secondary" size="sm" className="shrink-0">
            修改
          </LinkButton>
        </div>
        <dl className="mt-4 space-y-3 border-t border-line pt-4">
          {facts
            .filter(([label, list]) => list.length || label === "基础病和以往病史" || label === "过敏史")
            .map(([label, list]) => (
              <div key={label}>
                <dt className="text-base text-ink-2">{label}</dt>
                <dd className="text-lg leading-relaxed text-ink">{list.length ? list.join("、") : "还没填"}</dd>
              </div>
            ))}
          {profile.notes && (
            <div>
              <dt className="text-base text-ink-2">还想让医生知道的</dt>
              <dd className="text-lg leading-relaxed text-ink">{profile.notes}</dd>
            </div>
          )}
        </dl>
        {/* who to call: the first thing the emergency page shows, so it is kept in sight here */}
        <dl className="mt-4 border-t border-line pt-4">
          <dt className="text-base text-ink-2">紧急联系人</dt>
          {contact ? (
            <dd className="text-lg leading-relaxed text-ink">
              {[contact.relation, contact.name].filter(Boolean).join(" ")}
              <span className="ml-3 inline-block tabular-nums">{contact.phone}</span>
            </dd>
          ) : (
            <dd className="flex flex-wrap items-center justify-between gap-x-3 text-lg leading-relaxed text-ink">
              还没有紧急联系人
              <TextLink href="/me/edit#contact" className="-mr-2">
                去填
              </TextLink>
            </dd>
          )}
        </dl>
      </Card>

      <PastHistory />

      {state.nextVisit && (
        <Card tone="brand" className="flex items-start gap-3.5 p-5">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface text-brand-700 shadow-pill"
          >
            <CalendarCheck className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1 pt-1">
            <p className="text-lg leading-relaxed font-medium text-ink">
              {fmtDate(state.nextVisit.at, { weekday: true })}要去看医生：{state.nextVisit.note}
            </p>
            <TextButton className="-ml-2" onClick={() => setNextVisit(null)}>
              不用提醒了
            </TextButton>
          </div>
        </Card>
      )}


      <section>
        <SectionTitle>更多</SectionTitle>
        <Card className="divide-y divide-line overflow-hidden">
          <Toggle
            checked={longTerm}
            onChange={(v) => updateSettings({ longTerm: v })}
            icon={<HeartPulse className="h-5 w-5" />}
            label="长期管理"
            detail="有糖尿病、高血压这类要长期记录的情况时打开。打开后，首页会按时问你一个数，比如今天的血糖。关掉后首页不再问，下面的「健康指标」和「这一年」也收起来，记录都还在。"
          />
          {longTerm && <RowLink href="/me/metrics" icon={<Activity className="h-5 w-5" />} title="健康指标" detail="血糖、血压、体重的记录和变化" />}
          {longTerm && hasYearOfData(state) && (
            <RowLink href="/doctor/year" icon={<FileText className="h-5 w-5" />} title="给医生看：这一年" detail="复诊时把一年的变化交给医生" />
          )}
          <RowLink href="/ask" icon={<MessageCircleQuestion className="h-5 w-5" />} title="问医伴" detail="记不清的，问我" />
          <RowLink href="/sos" icon={<Siren className="h-5 w-5" />} iconTone="danger" title="应急手册" detail="突发状况时，打开给身边的人看" />
          <RowLink href="/me/settings" icon={<Settings className="h-5 w-5" />} iconTone="neutral" title="设置" detail="提醒、备份、演示数据" />
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
      toast.show(text.trim() ? "这些档案里已经有了" : "还没写内容", "neutral");
      return;
    }
    setProfile(next);
    close();
    toast.show(`已记进档案：${[...conditions, ...surgeries].join("、")}`, "good");
  };
  return (
    <Card className="p-5">
      <p className="text-lg font-semibold text-ink">以往病史</p>
      <p className="mt-1 text-base leading-relaxed text-ink-2">以前得过的病、受过的伤、做过的手术，补上以后，问诊时我会一起考虑。</p>
      <Button size="lg" variant="secondary" className="mt-3 w-full" onClick={() => setOpen(true)}>
        <NotebookPen className="h-6 w-6" />
        补充以往病史
      </Button>
      <Modal
        open={open}
        title="补充以往病史"
        onClose={close}
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              先不写
            </Button>
            <Button onClick={save}>记进档案</Button>
          </>
        }
      >
        <p className="mb-2 text-base leading-relaxed text-ink-2">一行写一条，写上大概哪年。</p>
        <Textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="以往病史"
          placeholder={"比如：\n2015 年阑尾切除\n2024 年右膝扭伤"}
          className="min-h-36"
        />
      </Modal>
    </Card>
  );
}
