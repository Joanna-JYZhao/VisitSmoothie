"use client";

import { useState } from "react";
import type { Hint, Measurement, MetricType } from "@/lib/types";
import { useStore } from "@/lib/store";
import { METRICS, METRIC_ORDER, dayKey, evaluateMeasurement, findHighStreaks, formatValue, looksMistyped } from "@/lib/metrics";
import { toLocalInputValue } from "@/lib/utils";
import { HintBanner } from "./HintBanner";
import { useToast } from "./Toast";
import { Button, Field, IconTile, Input, Modal, Select, TextButton } from "./ui";
import { L } from "@/lib/lang";
import { CircleAlert, Clock3 } from "lucide-react";

/* the box a reading is typed into: the number big and tabular, centred, the way a Health entry is */
const readingCls = "t-title min-w-0 text-center tabular-nums placeholder:text-lg placeholder:font-normal placeholder:tracking-normal";
/* the browser's own calendar button inside a time box: quiet until the hand reaches it */
const dateCls =
  "[&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:rounded-lg [&::-webkit-calendar-picker-indicator]:p-1 [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:transition [&::-webkit-calendar-picker-indicator]:hover:bg-brand-50 [&::-webkit-calendar-picker-indicator]:hover:opacity-100";

/** Saves one reading and returns it together with what, if anything, the user should be told. */
export function useRecordMetric() {
  const { state, addMeasurement } = useStore();
  return (input: {
    type: MetricType;
    value: number;
    value2?: number | null;
    at: string;
    note?: string;
  }): { saved: Measurement; hint: Hint | null } => {
    const saved = addMeasurement({ ...input, source: "user" });
    const direct = evaluateMeasurement(saved);
    if (direct && direct.level !== "info") return { saved, hint: direct };
    if (saved.type === "fbg") {
      const streak = findHighStreaks([...state.measurements, saved]).find((s) => s.endKey === dayKey(saved.at));
      if (streak) {
        return {
          saved,
          hint: {
            level: "warn",
            text: `空腹血糖已经连续 ${streak.days} 天高于一般范围。想一想这几天吃的和用的药有没有变化；再高下去请联系医生。`,
          },
        };
      }
    }
    return { saved, hint: direct };
  };
}

export function parseReading(type: MetricType, raw: string, raw2: string): { value: number; value2: number | null } | string {
  const def = METRICS[type];
  const value = Number(raw);
  if (!raw.trim() || !Number.isFinite(value)) return L("请填一个数", "Please enter a number");
  if (value < def.inputMin || value > def.inputMax) return L(`这个数应该在 ${def.inputMin} 到 ${def.inputMax} 之间，请再看一眼`, `The number should be between ${def.inputMin} and ${def.inputMax}. Please check it`);
  if (type !== "bp") return { value, value2: null };
  const value2 = Number(raw2);
  if (!raw2.trim() || !Number.isFinite(value2)) return L("请把低压也填上", "Please also enter the lower number");
  if (value2 < 30 || value2 > 160 || value2 >= value) return L("低压应该比高压小，请再看一眼", "The lower number should be smaller than the upper one. Please check");
  return { value, value2 };
}

/** The two boxes for a reading (one for most metrics, two for blood pressure). */
export function ReadingInputs({
  type,
  raw,
  raw2,
  onChange,
  onEnter,
  autoFocus,
}: {
  type: MetricType;
  raw: string;
  raw2: string;
  onChange: (raw: string, raw2: string) => void;
  onEnter?: () => void;
  autoFocus?: boolean;
}) {
  const def = METRICS[type];
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Input
        type="number"
        inputMode="decimal"
        step={def.step}
        value={raw}
        onChange={(e) => onChange(e.target.value, raw2)}
        placeholder={type === "bp" ? L("高压", "Upper") : def.placeholder}
        aria-label={type === "bp" ? L("高压", "Upper") : `${def.label}（${def.unit}）`}
        autoFocus={autoFocus}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        className={readingCls}
      />
      {type === "bp" && (
        <>
          <span aria-hidden="true" className="t-title font-light text-ink-3">
            /
          </span>
          <Input
            type="number"
            inputMode="numeric"
            value={raw2}
            onChange={(e) => onChange(raw, e.target.value)}
            placeholder={L("低压", "Lower")}
            aria-label={L("低压", "Lower")}
            onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
            className={readingCls}
          />
        </>
      )}
    </div>
  );
}

export function RecordMetricModal({
  open,
  onClose,
  defaultType,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  defaultType?: MetricType;
  /** an existing reading to correct: the form opens filled in, and saving replaces it */
  editing?: Measurement | null;
}) {
  if (!open) return null;
  return <RecordMetricForm key={editing?.id ?? "new"} onClose={onClose} defaultType={defaultType} editing={editing ?? null} />;
}

function RecordMetricForm({
  onClose,
  defaultType,
  editing,
}: {
  onClose: () => void;
  defaultType?: MetricType;
  editing: Measurement | null;
}) {
  const { state, deleteMeasurement, addMeasurement } = useStore();
  const record = useRecordMetric();
  const toast = useToast();
  const tracked = state.settings.trackedMetrics;
  const order = [...tracked, ...METRIC_ORDER.filter((t) => !tracked.includes(t))];
  const [type, setType] = useState<MetricType>(editing?.type ?? defaultType ?? order[0]);
  const [raw, setRaw] = useState(editing ? String(editing.value) : "");
  const [raw2, setRaw2] = useState(editing?.value2 != null ? String(editing.value2) : "");
  const [more, setMore] = useState(Boolean(editing));
  const [at, setAt] = useState(() => toLocalInputValue(editing ? new Date(editing.at) : new Date()));
  const [note, setNote] = useState(editing?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Hint | null>(null);
  const [doubt, setDoubt] = useState<string | null>(null);
  const def = METRICS[type];

  const save = (sure = false) => {
    const parsed = parseReading(type, raw, raw2);
    if (typeof parsed === "string") {
      setError(parsed);
      return;
    }
    if (!sure) {
      const question = looksMistyped({ type, ...parsed }, state.measurements);
      if (question) {
        setDoubt(question);
        return;
      }
    }
    const when = more ? new Date(at) : new Date();
    if (Number.isNaN(when.getTime()) || when.getTime() > Date.now() + 60_000) {
      setError(L("时间不能比现在晚", "The time can't be later than now"));
      return;
    }
    const { saved, hint } = record({ type, ...parsed, at: when.toISOString(), note: note.trim() || undefined });
    // a correction takes the old reading out only once the new one is in
    if (editing) deleteMeasurement(editing.id);
    if (hint) setResult(hint);
    else {
      toast.show(L(`${editing ? "已改成" : "已记下"}${def.label} ${formatValue(saved)}`, `${editing ? "Changed to" : "Saved"}: ${def.label} ${formatValue(saved)}`), "good", {
        label: L("撤销", "Undo"),
        onClick: () => {
          deleteMeasurement(saved.id);
          if (editing) {
            const { id: _id, ...old } = editing;
            void _id;
            addMeasurement(old);
          }
        },
      });
      onClose();
    }
  };

  if (result) {
    return (
      <Modal open title={L(`已记下${def.label} ${raw}${type === "bp" ? `/${raw2}` : ""}`, `Saved: ${def.label} ${raw}${type === "bp" ? `/${raw2}` : ""}`)}
        onClose={onClose}
        footer={<Button onClick={onClose}>{L("知道了", "OK")}</Button>}
      >
        <HintBanner hint={result} />
      </Modal>
    );
  }

  return (
    <Modal
      open
      title={editing ? L("改这条记录", "Edit this record") : L("记一个数", "Add a number")}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {L("取消", "Cancel")}
          </Button>
          <Button onClick={() => save()}>{L("保存", "Save")}</Button>
        </>
      }
    >
      <div className="grid gap-5 text-ink">
        <Field label={L("记什么", "What to record")}>
          <Select
            value={type}
            disabled={Boolean(editing)}
            onChange={(e) => {
              setType(e.target.value as MetricType);
              setError(null);
            }}
          >
            {order.map((t) => (
              <option key={t} value={t}>
                {METRICS[t].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={type === "bp" ? L("高压 / 低压", "Upper / lower") : L(`数值（${def.unit}）`, `Number (${def.unit})`)}
          hint={def.targetText ? L(`${def.targetText}，你自己的目标听医生的`, `${def.targetText}. Your own target comes from your doctor`) : undefined}
        >
          <div className="flex">
            <ReadingInputs
              type={type}
              raw={raw}
              raw2={raw2}
              autoFocus
              onEnter={() => save()}
              onChange={(a, b) => {
                setRaw(a);
                setRaw2(b);
                setError(null);
                setDoubt(null);
              }}
            />
          </div>
        </Field>
        {more ? (
          <>
            <Field label={L("什么时候测的", "When was it measured")}>
              <Input type="datetime-local" value={at} max={toLocalInputValue(new Date())} onChange={(e) => setAt(e.target.value)} className={dateCls} />
            </Field>
            <Field label={L("备注", "Note")}>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={L("可以不填，比如：聚餐后", "Optional, e.g. after a big dinner")} />
            </Field>
          </>
        ) : (
          <TextButton onClick={() => setMore(true)} className="-my-2 -ml-2 justify-self-start">
            <Clock3 className="mr-1 h-5 w-5" aria-hidden="true" />
            {L("不是刚测的，或者想加备注", "Not measured just now, or add a note")}
          </TextButton>
        )}
        {error && (
          <p role="alert" className="flex animate-fade-up items-center gap-1.5 text-base font-medium text-danger">
            <CircleAlert className="h-5 w-5 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}
        {doubt && (
          <div className="flex animate-pop items-start gap-3.5 rounded-2xl bg-warn-bg px-4 py-4" role="alert">
            <IconTile tone="warn" size="sm" className="mt-0.5">
              <CircleAlert />
            </IconTile>
            <div className="min-w-0 flex-1">
              <p className="t-lead font-medium text-ink">{doubt}</p>
              <Button className="press mt-4 w-full" onClick={() => save(true)}>
                {L("没错，记下", "It's right, save")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
