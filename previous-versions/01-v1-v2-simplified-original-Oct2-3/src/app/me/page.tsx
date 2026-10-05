"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Activity,
  CalendarCheck,
  ClipboardCheck,
  FileText,
  HeartPulse,
  MessageCircleQuestion,
  NotebookPen,
  Settings,
  Siren,
  Stethoscope,
} from "lucide-react";
import type { Checkup, Episode, FollowUp } from "@/lib/types";
import { useStore } from "@/lib/store";
import { hasYearOfData } from "@/lib/metrics";
import { ageOf, cn, episodeLine, fmtDate } from "@/lib/utils";
import { useToast } from "@/components/Toast";
import {
  Badge,
  Card,
  IconTile,
  LinkButton,
  PageHeader,
  RowButton,
  RowLink,
  SectionTitle,
  TextButton,
  TextLink,
  Toggle,
  focusRing,
} from "@/components/ui";

type Item =
  | { kind: "episode"; at: number; episode: Episode }
  | { kind: "followUp"; at: number; followUp: FollowUp }
  | { kind: "checkup"; at: number; checkup: Checkup };

/** Noon on a calendar date, so a record with only a date sorts into the middle of its day. */
const noon = (date: string) => `${date}T12:00:00`;

/** 我的档案: who I am, everything recorded so far, and the few settings there are. */
export default function MePage() {
  const { state, updateSettings, setNextVisit } = useStore();
  const profile = state.profile;
  if (!profile) return null;
  const { longTerm } = state.settings;
  const contact = profile.emergencyContact;

  const items: Item[] = [
    ...state.episodes.map((e): Item => ({ kind: "episode", at: new Date(e.startedAt).getTime(), episode: e })),
    ...state.followUps.map((f): Item => ({ kind: "followUp", at: new Date(noon(f.date)).getTime(), followUp: f })),
    ...state.checkups.map((c): Item => {
      const at = new Date(noon(c.date)).getTime();
      // a report whose date could not be read still has the day it was filed
      return { kind: "checkup", at: Number.isFinite(at) ? at : new Date(c.recordedAt).getTime(), checkup: c };
    }),
  ].sort((a, b) => b.at - a.at);

  const facts: [string, string[]][] = [
    ["老毛病", profile.conditions],
    ["过敏", profile.allergies],
    ["长期吃的药", profile.medications],
    ["做过的手术", profile.surgeries],
    ["家里人的病", profile.familyHistory],
  ];

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
              {profile.gender} · {ageOf(profile.birthYear)} 岁
            </span>
          </p>
          <LinkButton href="/me/edit" variant="secondary" size="sm" className="shrink-0">
            修改
          </LinkButton>
        </div>
        <dl className="mt-4 space-y-3 border-t border-line pt-4">
          {facts
            .filter(([label, list]) => list.length || label === "老毛病" || label === "过敏" || label === "长期吃的药")
            .map(([label, list]) => (
              <div key={label}>
                <dt className="text-base text-ink-2">{label}</dt>
                <dd className="text-lg leading-relaxed text-ink">{list.length ? list.join("、") : "没有"}</dd>
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
        <SectionTitle>历次记录</SectionTitle>
        {items.length === 0 ? (
          <Card className="flex items-center gap-3.5 p-5">
            <IconTile tone="neutral" size="lg">
              <NotebookPen className="h-6 w-6" />
            </IconTile>
            <p className="min-w-0 flex-1 text-lg leading-relaxed text-ink-2">还没有记录。在「今天」说一句哪里不舒服，就会记到这里。</p>
          </Card>
        ) : (
          <Card className="divide-y divide-line overflow-hidden">
            {items.map((it) =>
              it.kind === "episode" ? (
                <RowLink
                  key={it.episode.id}
                  href={`/episodes/${it.episode.id}/detail`}
                  icon={<NotebookPen className="h-5 w-5" />}
                  title={
                    <>
                      {it.episode.title}
                      {it.episode.status === "active" && (
                        <Badge tone="brand" className="ml-2 align-middle">
                          还在跟踪
                        </Badge>
                      )}
                    </>
                  }
                  detail={`${fmtDate(it.episode.startedAt, { year: true })} · ${episodeLine(it.episode)}`}
                />
              ) : it.kind === "followUp" ? (
                <FollowUpRow key={it.followUp.id} followUp={it.followUp} />
              ) : (
                <CheckupRow key={it.checkup.id} checkup={it.checkup} />
              ),
            )}
          </Card>
        )}
      </section>

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

/** What a row opens into: the record itself, set a little apart from the list around it, and the way to remove it. */
function Opened({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  return (
    <div className="border-t border-line bg-surface-2/60 px-5 pt-4 pb-2">
      <dl className="space-y-3 text-lg leading-relaxed">{children}</dl>
      <TextButton tone="danger" className="mt-1 -ml-2" onClick={onDelete}>
        删除这次记录
      </TextButton>
    </div>
  );
}

function Part({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-base text-ink-2">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}

/** A doctor visit that was not about one tracked symptom. Opens in place. */
function FollowUpRow({ followUp: f }: { followUp: FollowUp }) {
  const { deleteFollowUp, addFollowUp } = useStore();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const where = [f.hospital, f.department].filter(Boolean).join(" ");
  return (
    <div>
      <RowButton
        expanded={open}
        onClick={() => setOpen((o) => !o)}
        icon={<Stethoscope className="h-5 w-5" />}
        title={f.reason}
        detail={`${fmtDate(noon(f.date), { year: true })}${where ? ` · ${where}` : ""}`}
      />
      {open && (
        <Opened
          onDelete={() => {
            const { id: _id, recordedAt: _at, ...rest } = f;
            void _id;
            void _at;
            deleteFollowUp(f.id);
            toast.show("已删除这次复诊记录", "neutral", { label: "撤销", onClick: () => addFollowUp(rest) });
          }}
        >
          <Part label="检查结果">{f.findings}</Part>
          <Part label="开的药和处理">{f.plan}</Part>
          {f.advice && <Part label="医生的叮嘱">{f.advice}</Part>}
          {f.summary && <Part label="存档摘要">{f.summary}</Part>}
        </Opened>
      )}
    </div>
  );
}

/** A health check-up: what the report flagged and what it advised. Opens in place. */
function CheckupRow({ checkup: c }: { checkup: Checkup }) {
  const { deleteCheckup, addCheckup } = useStore();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const day = new Date(noon(c.date));
  const when = Number.isFinite(day.getTime()) ? fmtDate(day, { year: true }) : fmtDate(c.recordedAt, { year: true });
  return (
    <div>
      <RowButton
        expanded={open}
        onClick={() => setOpen((o) => !o)}
        icon={<ClipboardCheck className="h-5 w-5" />}
        title="体检"
        detail={`${when}${c.institution ? ` · ${c.institution}` : ""}`}
      />
      {open && (
        <Opened
          onDelete={() => {
            const { id: _id, recordedAt: _at, ...rest } = c;
            void _id;
            void _at;
            deleteCheckup(c.id);
            toast.show("已删除这次体检记录", "neutral", { label: "撤销", onClick: () => addCheckup(rest) });
          }}
        >
          <Part label="报告上要留意的">
            {c.abnormal.length ? (
              <ul className="space-y-1">
                {c.abnormal.map((x, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="mt-[0.7em] h-1.5 w-1.5 shrink-0 rounded-full bg-ink-3" aria-hidden="true" />
                    <span className="min-w-0 flex-1">{x}</span>
                  </li>
                ))}
              </ul>
            ) : (
              "这份报告上没有记下要留意的项目"
            )}
          </Part>
          {c.advice && <Part label="体检建议">{c.advice}</Part>}
        </Opened>
      )}
    </div>
  );
}
