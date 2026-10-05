"use client";

import { useState } from "react";
import type { Hint, Measurement, MetricType } from "@/lib/types";
import { useStore } from "@/lib/store";
import { METRICS, dayKey, dueMetrics, formatValue, latestOf, looksMistyped, plainConclusion } from "@/lib/metrics";
import { fmtTime, nowISO, relativeTime } from "@/lib/utils";
import { HintBanner } from "./HintBanner";
import { ReadingInputs, RecordMetricModal, parseReading, useRecordMetric } from "./RecordMetricModal";
import { useToast } from "./Toast";
import { Button, Card, TextButton, TextLink } from "./ui";

const daily = (t: MetricType) => t === "fbg" || t === "ppg";

/**
 * For people who look after a long-term condition: one number to fill in, what was recorded
 * today (with a way to correct it), and one plain sentence that answers "how am I doing".
 * Shown only when 长期管理 is switched on.
 */
export function LongTermCard({ now, onAlert }: { now: number; onAlert: (h: Hint) => void }) {
  const { state, deleteMeasurement, addMeasurement } = useStore();
  const record = useRecordMetric();
  const toast = useToast();
  const [raw, setRaw] = useState("");
  const [raw2, setRaw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<Hint | null>(null);
  const [modal, setModal] = useState(false);
  // The reading being corrected. It stays on file until the new value is saved, so backing out loses nothing.
  const [editing, setEditing] = useState<Measurement | null>(null);
  // a value that looks like a slip of the finger is asked about before it is saved
  const [doubt, setDoubt] = useState<string | null>(null);

  const tracked = state.settings.trackedMetrics;
  // one thing at a time: the first metric that is due
  const type: MetricType | null = editing?.type ?? dueMetrics(state.measurements, state.settings, now)[0] ?? null;
  const conclusion = plainConclusion(state.measurements, now);
  const today = state.measurements
    .filter((m) => dayKey(m.at) === dayKey(new Date(now)))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 3);
  const lastOfFirst = tracked.length ? latestOf(state.measurements, tracked[0]) : null;

  const save = (sure = false) => {
    if (!type) return;
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
    // a correction keeps the time of the reading it replaces, and only now takes the old one out
    const { saved, hint } = record({ type, ...parsed, at: editing?.at ?? nowISO(), note: editing?.note });
    if (editing) deleteMeasurement(editing.id);
    const replaced = editing;
    setRaw("");
    setRaw2("");
    setError(null);
    setDoubt(null);
    setEditing(null);
    if (hint?.level === "urgent") {
      setNote(null);
      onAlert(hint);
      return;
    }
    setNote(hint);
    toast.show(`${replaced ? "已改成" : "已记下"}${METRICS[type].label} ${formatValue(saved)}`, "good", {
      label: "撤销",
      onClick: () => {
        deleteMeasurement(saved.id);
        if (replaced) {
          const { id: _id, ...old } = replaced;
          void _id;
          addMeasurement(old);
        }
        setNote(null);
      },
    });
  };

  const cancelEdit = () => {
    setEditing(null);
    setRaw("");
    setRaw2("");
    setError(null);
    setDoubt(null);
  };

  return (
    <Card className="p-5">
      {!tracked.length ? (
        <>
          <p className="text-xl font-semibold text-ink">还没选要记的指标</p>
          <p className="mt-1 text-lg text-ink-2">选好以后，这里每次只问你一个数。</p>
          <TextLink href="/me/metrics">去选</TextLink>
        </>
      ) : type ? (
        <form
          onSubmit={(ev) => {
            ev.preventDefault();
            save();
          }}
        >
          <label className="block text-xl font-semibold text-ink">
            {editing ? `把${METRICS[type].label} ${formatValue(editing)} 改成` : `${daily(type) ? "今天的" : "这周的"}${METRICS[type].label}`}
          </label>
          <div className="mt-3 flex items-center gap-2">
            <ReadingInputs
              type={type}
              raw={raw}
              raw2={raw2}
              onChange={(a, b) => {
                setRaw(a);
                setRaw2(b);
                setError(null);
                setDoubt(null);
              }}
            />
            <Button type="submit" className="shrink-0">
              {editing ? "改好了" : "记下"}
            </Button>
          </div>
          {editing && (
            <TextButton className="-ml-2" onClick={cancelEdit}>
              不改了
            </TextButton>
          )}
          {error && <p className="mt-2 text-base font-medium text-danger">{error}</p>}
          {doubt && (
            <div className="mt-3 rounded-2xl border border-warn/30 bg-warn-bg px-4 py-3.5" role="alert">
              <p className="text-lg leading-relaxed font-medium text-ink">{doubt}</p>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => setDoubt(null)}>
                  填错了，重填
                </Button>
                <Button onClick={() => save(true)}>没错，记下</Button>
              </div>
            </div>
          )}
        </form>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 text-lg leading-relaxed text-ink">
            {lastOfFirst
              ? `上次记的：${METRICS[lastOfFirst.type].label} ${formatValue(lastOfFirst)}（${relativeTime(lastOfFirst.at, now)}）`
              : "现在没有要记的。"}
          </p>
          <Button variant="secondary" size="sm" className="shrink-0" onClick={() => setModal(true)}>
            再记一个数
          </Button>
        </div>
      )}

      {today.length > 0 && (
        <ul className="mt-4 divide-y divide-line rounded-2xl bg-surface-2 px-4">
          {today.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-1.5">
              <span className="min-w-0 flex-1 text-base text-ink">
                今天 {fmtTime(m.at)} 记了{METRICS[m.type].label} <span className="font-semibold tabular-nums">{formatValue(m)}</span>
              </span>
              <TextButton
                className="-mr-2 shrink-0"
                aria-label={`改 ${METRICS[m.type].label} ${formatValue(m)}`}
                onClick={() => {
                  // the box above takes the corrected value; the old reading stays until that is saved
                  setEditing(m);
                  setRaw(String(m.value));
                  setRaw2(m.value2 != null ? String(m.value2) : "");
                  setNote(null);
                  setDoubt(null);
                  setError(null);
                }}
              >
                改
              </TextButton>
            </li>
          ))}
        </ul>
      )}

      {note && <HintBanner hint={note} className="mt-4" />}
      {conclusion && <p className="mt-4 text-lg leading-relaxed text-ink">{conclusion}</p>}

      <div className="mt-1 flex items-center justify-between">
        <TextLink href="/me/metrics">看变化和以前的记录</TextLink>
        {type && <TextButton onClick={() => setModal(true)}>记别的数</TextButton>}
      </div>
      <RecordMetricModal open={modal} onClose={() => setModal(false)} defaultType={type ? undefined : (tracked[0] ?? "ppg")} />
    </Card>
  );
}
