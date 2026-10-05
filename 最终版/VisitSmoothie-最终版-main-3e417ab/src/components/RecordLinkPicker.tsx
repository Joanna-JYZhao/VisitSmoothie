"use client";

import { useState } from "react";
import { Check, ChevronDown, Link2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { allRecords, recordById, recordLabel, type RecordRef } from "@/lib/records";
import { L } from "@/lib/lang";
import { cn } from "@/lib/utils";
import { focusRing } from "@/components/ui";

/*
 * Above the input in pre and post: which records this one goes with. 复诊 picks the earlier record it
 * follows up (it becomes a new record, marked as its follow-up, and the assistant reads the earlier one
 * as context). post also asks whether pre was used before this same visit: picked, pre and post are one record.
 */

export interface RecordLink {
  /** post only: the pre record of this same visit */
  pre?: string | null;
  /** 复诊: the earlier record this follows up */
  followUpOf?: string | null;
}

function Choice({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        "press flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-base transition-colors duration-200",
        on ? "bg-brand-50 font-medium text-brand-800" : "text-ink hover:bg-surface-2/70",
        focusRing,
      )}
    >
      <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full", on ? "tile-brand text-white" : "border-[1.5px] border-line-strong bg-surface")}>
        {on && <Check className="h-4 w-4" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}

/** 是 / 不是: two pills side by side, neither lit until one is tapped. */
function YesNo({ value, onChange, yes, no }: { value: boolean | null; onChange: (v: boolean) => void; yes: string; no: string }) {
  const pill = (v: boolean, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={value === v}
      onClick={() => onChange(v)}
      className={cn(
        "press min-h-12 flex-1 rounded-full px-4 text-base font-semibold transition-colors duration-200",
        value === v ? "tile-brand text-white" : "bg-surface-2 text-ink-2 hover:text-brand-800",
        focusRing,
      )}
    >
      {label}
    </button>
  );
  return (
    <div role="radiogroup" className="flex gap-2">
      {pill(true, yes)}
      {pill(false, no)}
    </div>
  );
}

/**
 * post asks first whether 看医生之前 (pre) was used before this visit, and which record that was: picked,
 * the visit is kept with it and takes its 复诊 setting as it is. Only without pre does it ask whether this
 * is a follow-up visit, and of which record. Either can be answered no. Once answered, the questions fold
 * into one line saying what this visit is linked to, with a way to change it.
 */
function PostLinkQuestions({ value, onChange, exclude }: { value: RecordLink; onChange: (v: RecordLink) => void; exclude?: string[] }) {
  const { state } = useStore();
  const records = allRecords(state).filter((r) => !exclude?.includes(r.id));
  // the pre records of a visit not yet seen: what was written before this visit
  const preRecords = records.filter((r) => r.kind === "episode" && !r.hasVisit).slice(0, 6);
  // what can be followed up: a record a doctor has seen
  const earlier = records.filter((r) => r.hasVisit).slice(0, 8);
  // 用过 / 是 tapped before a record is picked: the list stays open with nothing picked yet
  const [usedPre, setUsedPre] = useState<boolean | null>(value.pre ? true : null);
  const [followUp, setFollowUp] = useState<boolean | null>(value.followUpOf ? true : null);
  const hadPre = value.pre ? true : usedPre;
  const isFollowUp = value.followUpOf ? true : followUp;
  const answered = hadPre === true ? Boolean(value.pre) : hadPre === false && (isFollowUp === false || Boolean(value.followUpOf));
  const [editing, setEditing] = useState(false);
  const pre = recordById(state, value.pre);
  const prev = recordById(state, value.followUpOf);

  // a pre record picked: its 复诊 setting comes with it
  const pickPre = (id: string) => onChange({ pre: id, followUpOf: state.episodes.find((e) => e.id === id)?.followUpOf ?? null });

  const list = (items: RecordRef[], current: string | null | undefined, set: (id: string) => void, empty: string) =>
    items.length ? (
      <div role="radiogroup" className="mt-2 space-y-1">
        {items.map((r) => (
          <Choice key={r.id} on={current === r.id} onClick={() => set(r.id)}>
            {recordLabel(r)}
          </Choice>
        ))}
      </div>
    ) : (
      <p className="mt-2 px-1 text-base text-ink-3">{empty}</p>
    );

  if (answered && !editing) {
    const lines = [
      pre ? L(`看医生之前：${recordLabel(pre)}`, `Before the doctor: ${recordLabel(pre)}`) : L("没有用过看医生之前", "Didn't use “Before the doctor”"),
      prev ? L(`复诊：关联到「${recordLabel(prev)}」`, `Follow-up of “${recordLabel(prev)}”`) : L("不是复诊", "Not a follow-up"),
    ];
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-line/80 bg-surface px-3.5 py-3">
        <Link2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" />
        <div className="min-w-0 flex-1 space-y-0.5 text-base leading-snug">
          <p className="font-semibold text-ink">{L("这次关联的记录", "Linked to this visit")}</p>
          {lines.map((x, i) => (
            <p key={i} className="text-ink-2">
              {x}
            </p>
          ))}
        </div>
        <button type="button" onClick={() => setEditing(true)} className={cn("press min-h-11 shrink-0 rounded-full bg-surface-2 px-3.5 text-base font-medium text-brand-800", focusRing)}>
          {L("改一下", "Change")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-line/80 bg-surface px-3 py-3.5">
      <section>
        <p className="flex items-center gap-2 px-1 pb-2 text-lg font-semibold text-ink">
          <Link2 aria-hidden="true" className="h-5 w-5 shrink-0 text-brand-700" />
          {L("这次看医生之前，用过「看医生之前」吗？", "Did you use “Before the doctor” before this visit?")}
        </p>
        <YesNo
          value={hadPre}
          yes={L("用过", "Yes")}
          no={L("没有", "No")}
          onChange={(v) => {
            setUsedPre(v);
            if (v !== (hadPre === true)) onChange({ pre: null, followUpOf: null });
            setFollowUp(null);
          }}
        />
        {hadPre && (
          <>
            <p className="px-1 pt-3 text-base text-ink-2">{L("是哪一条？（和这次存成一条记录，复诊的设置跟着它）", "Which one? (Kept as one record with this visit, with its follow-up setting)")}</p>
            {list(preRecords, value.pre, pickPre, L("还没有看医生之前的记录。", "No “Before the doctor” records yet."))}
          </>
        )}
      </section>
      {hadPre === false && (
        <section className="border-t border-line pt-4">
          <p className="px-1 pb-2 text-lg font-semibold text-ink">{L("这次是复诊吗？", "Is this a follow-up visit?")}</p>
          <YesNo
            value={isFollowUp}
            yes={L("是复诊", "Yes")}
            no={L("不是", "No")}
            onChange={(v) => {
              setFollowUp(v);
              if (!v) onChange({ pre: null, followUpOf: null });
            }}
          />
          {isFollowUp && (
            <>
              <p className="px-1 pt-3 text-base text-ink-2">{L("关联上一次的哪条记录？（新建一条，标注是它的复诊）", "Which earlier record? (A new record, marked as its follow-up)")}</p>
              {list(earlier, value.followUpOf, (id) => onChange({ pre: null, followUpOf: id }), L("还没有看过医生的记录可以关联。", "No records from a doctor's visit to link yet."))}
            </>
          )}
        </section>
      )}
      {answered && (
        <button type="button" onClick={() => setEditing(false)} className={cn("press min-h-11 w-full rounded-xl bg-surface-2 text-base font-medium text-ink", focusRing)}>
          {L("好了", "Done")}
        </button>
      )}
    </div>
  );
}
export function RecordLinkPicker({ mode, value, onChange, exclude }: { mode: "pre" | "post"; value: RecordLink; onChange: (v: RecordLink) => void; exclude?: string[] }) {
  if (mode === "post") return <PostLinkQuestions value={value} onChange={onChange} exclude={exclude} />;
  return <PreLinkPicker value={value} onChange={onChange} exclude={exclude} />;
}

/** pre: one collapsible line above the input — 这次是复诊？ — opening to the earlier records. */
function PreLinkPicker({ value, onChange, exclude }: { value: RecordLink; onChange: (v: RecordLink) => void; exclude?: string[] }) {
  const { state } = useStore();
  const [open, setOpen] = useState(false);
  const earlier = allRecords(state).filter((r) => !exclude?.includes(r.id)).slice(0, 8);
  const prev = recordById(state, value.followUpOf);

  return (
    <div className="rounded-2xl border border-line/80 bg-surface">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn("press flex min-h-12 w-full items-center gap-2.5 px-3 py-2 text-left", focusRing)}
      >
        <Link2 aria-hidden="true" className={cn("h-5 w-5 shrink-0", prev ? "text-brand-700" : "text-ink-3")} />
        <span className={cn("min-w-0 flex-1 text-base leading-snug", prev ? "font-medium text-brand-800" : "text-ink-2")}>
          {prev ? L(`复诊 · 关联到「${prev.title}」`, `Follow-up of “${prev.title}”`) : L("这次是复诊？点这里关联上一次的记录", "A follow-up visit? Tap to link your last record")}
        </span>
        <ChevronDown aria-hidden="true" className={cn("h-5 w-5 shrink-0 text-ink-3 transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && (
        <div className="animate-fade-up space-y-4 border-t border-line px-2 pt-3 pb-3">
          <section>
            <p className="px-1 pb-1.5 text-base font-semibold text-ink-2">{L("复诊：上一次的记录（新建一条，标注是它的复诊）", "Follow-up: your last record (a new record, marked as its follow-up)")}</p>
            {earlier.length ? (
              <div role="radiogroup" className="space-y-1">
                <Choice on={!value.followUpOf} onClick={() => onChange({ ...value, followUpOf: null })}>
                  {L("不是复诊", "Not a follow-up")}
                </Choice>
                {earlier.map((r) => (
                  <Choice key={r.id} on={value.followUpOf === r.id} onClick={() => onChange({ ...value, followUpOf: r.id })}>
                    {recordLabel(r)}
                  </Choice>
                ))}
              </div>
            ) : (
              <p className="px-1 text-base text-ink-3">{L("还没有可以关联的记录。", "No records to link yet.")}</p>
            )}
          </section>
          <button type="button" onClick={() => setOpen(false)} className={cn("press min-h-11 w-full rounded-xl bg-surface-2 text-base font-medium text-ink", focusRing)}>
            {L("好了", "Done")}
          </button>
        </div>
      )}
    </div>
  );
}