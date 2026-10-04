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
 * as context). In post there is also the pre record written before this same visit: picked, pre and post
 * are one record.
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

export function RecordLinkPicker({ mode, value, onChange, exclude }: { mode: "pre" | "post"; value: RecordLink; onChange: (v: RecordLink) => void; exclude?: string[] }) {
  const { state } = useStore();
  const [open, setOpen] = useState(false);
  const records = allRecords(state).filter((r) => !exclude?.includes(r.id));
  // the pre records of a visit not yet seen: what was written before this visit
  const preRecords = records.filter((r) => r.kind === "episode" && !r.hasVisit).slice(0, 6);
  // what can be followed up: a record a doctor has seen (in post, a pre record without a visit may also be the earlier one)
  const earlier = records.filter((r) => r.hasVisit || mode === "pre").filter((r) => r.id !== value.pre).slice(0, 8);
  const pre = recordById(state, value.pre);
  const prev = recordById(state, value.followUpOf);

  const summary = [
    pre ? L(`这次看病前：${pre.title}`, `Before this visit: ${pre.title}`) : "",
    prev ? L(`复诊 · 关联到「${prev.title}」`, `Follow-up of “${prev.title}”`) : "",
  ].filter(Boolean);
  const hint =
    mode === "pre"
      ? L("这次是复诊？点这里关联上一次的记录", "A follow-up visit? Tap to link your last record")
      : L("看病前在 pre 里写过，或者这次是复诊？点这里关联记录", "Wrote it up in pre first, or is this a follow-up? Tap to link a record");

  const list = (items: RecordRef[], current: string | null | undefined, set: (id: string | null) => void, none: string) => (
    <div role="radiogroup" className="space-y-1">
      <Choice on={!current} onClick={() => set(null)}>
        {none}
      </Choice>
      {items.map((r) => (
        <Choice key={r.id} on={current === r.id} onClick={() => set(r.id)}>
          {recordLabel(r)}
        </Choice>
      ))}
    </div>
  );

  return (
    <div className="rounded-2xl border border-line/80 bg-surface">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn("press flex min-h-12 w-full items-center gap-2.5 px-3 py-2 text-left", focusRing)}
      >
        <Link2 aria-hidden="true" className={cn("h-5 w-5 shrink-0", summary.length ? "text-brand-700" : "text-ink-3")} />
        <span className={cn("min-w-0 flex-1 text-base leading-snug", summary.length ? "font-medium text-brand-800" : "text-ink-2")}>{summary.length ? summary.join(L("；", "; ")) : hint}</span>
        <ChevronDown aria-hidden="true" className={cn("h-5 w-5 shrink-0 text-ink-3 transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && (
        <div className="animate-fade-up space-y-4 border-t border-line px-2 pt-3 pb-3">
          {mode === "post" && (
            <section>
              <p className="px-1 pb-1.5 text-base font-semibold text-ink-2">{L("这次看病前在 pre 里写的描述（和这次存成一条）", "What you wrote in pre before this visit (kept as one record)")}</p>
              {preRecords.length ? (
                list(preRecords, value.pre, (id) => onChange({ ...value, pre: id }), L("没有写过", "None"))
              ) : (
                <p className="px-1 text-base text-ink-3">{L("还没有看病前的记录。", "No “before the doctor” records yet.")}</p>
              )}
            </section>
          )}
          <section>
            <p className="px-1 pb-1.5 text-base font-semibold text-ink-2">{L("复诊：上一次的记录（新建一条，标注是它的复诊）", "Follow-up: your last record (a new record, marked as its follow-up)")}</p>
            {earlier.length ? (
              list(earlier, value.followUpOf, (id) => onChange({ ...value, followUpOf: id }), L("不是复诊", "Not a follow-up"))
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
