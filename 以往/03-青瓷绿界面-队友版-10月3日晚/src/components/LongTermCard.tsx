"use client";

import { useState } from "react";
import type { Hint, Measurement, MetricType } from "@/lib/types";
import { useStore } from "@/lib/store";
import { L } from "@/lib/lang";
import { METRICS, dayKey, dueMetrics, formatValue, latestOf, looksMistyped, plainConclusion } from "@/lib/metrics";
import { fmtTime, nowISO, relativeTime } from "@/lib/utils";
import { HintBanner } from "./HintBanner";
import { ReadingInputs, RecordMetricModal, parseReading, useRecordMetric } from "./RecordMetricModal";
import { useToast } from "./Toast";
import { Activity, CircleAlert, ListChecks } from "lucide-react";
import { Button, Card, IconTile, TextButton, TextLink } from "./ui";

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
    const what = `${METRICS[type].label} ${formatValue(saved)}`;
    toast.show(L(`${replaced ? "已改成" : "已记下"}${what}`, `${replaced ? "Changed to" : "Saved"}: ${what}`), "good", {
      label: L("撤销", "Undo"),
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
    <Card className="p-5 sm:p-6">
      {!tracked.length ? (
        <div className="flex items-start gap-4">
          <IconTile size="lg" className="animate-breathe">
            <ListChecks />
          </IconTile>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="t-heading text-ink">{L("还没选要记的指标", "Nothing chosen to track yet")}</p>
            <p className="t-body mt-1 text-ink-2">{L("选好以后，这里每次只问你一个数。", "Once you choose, I'll ask for one number at a time here.")}</p>
            <TextLink href="/me/metrics" className="-ml-2 mt-1">
              {L("去选", "Choose")}
            </TextLink>
          </div>
        </div>
      ) : type ? (
        <form
          onSubmit={(ev) => {
            ev.preventDefault();
            save();
          }}
        >
          <label className="t-heading flex items-center gap-3 text-ink">
            <IconTile tone="solid">
              <Activity />
            </IconTile>
            {editing
              ? L(`把${METRICS[type].label} ${formatValue(editing)} 改成`, `${METRICS[type].label} ${formatValue(editing)}: change to`)
              : L(`${daily(type) ? "今天的" : "这周的"}${METRICS[type].label}`, `${METRICS[type].label} ${daily(type) ? "today" : "this week"}`)}
          </label>
          <div className="mt-4 flex items-center gap-2">
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
            <Button type="submit" className="press shrink-0">
              {editing ? L("改好了", "Done") : L("记下", "Save")}
            </Button>
          </div>
          {editing && (
            <TextButton className="-ml-2" onClick={cancelEdit}>
              {L("不改了", "Leave it as it was")}
            </TextButton>
          )}
          {error && (
            <p role="alert" className="mt-3 flex animate-fade-up items-center gap-1.5 text-base font-medium text-danger">
              <CircleAlert className="h-5 w-5 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}
          {doubt && (
            <div className="mt-4 flex animate-pop items-start gap-3.5 rounded-2xl bg-warn-bg px-4 py-4" role="alert">
              <IconTile tone="warn" size="sm" className="mt-0.5">
                <CircleAlert />
              </IconTile>
              <div className="min-w-0 flex-1">
                <p className="t-lead font-medium text-ink">{doubt}</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button variant="secondary" className="press" onClick={() => setDoubt(null)}>
                    {L("填错了，重填", "Wrong, re-enter")}
                  </Button>
                  <Button className="press" onClick={() => save(true)}>
                    {L("没错，记下", "It's right, save")}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </form>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="t-body min-w-0 text-ink">
            {lastOfFirst
              ? L(
                  `上次记的：${METRICS[lastOfFirst.type].label} ${formatValue(lastOfFirst)}（${relativeTime(lastOfFirst.at, now)}）`,
                  `Last saved: ${METRICS[lastOfFirst.type].label} ${formatValue(lastOfFirst)} (${relativeTime(lastOfFirst.at, now)})`,
                )
              : L("现在没有要记的。", "Nothing to record right now.")}
          </p>
          <Button variant="secondary" size="sm" className="press shrink-0" onClick={() => setModal(true)}>
            {L("再记一个数", "Add a reading")}
          </Button>
        </div>
      )}

      {today.length > 0 && (
        <ul className="mt-5 divide-y divide-line rounded-2xl bg-surface-2/70 px-4 ring-1 ring-line/60 ring-inset">
          {today.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1 text-base text-ink-2">
                {L(`今天 ${fmtTime(m.at)} 记了${METRICS[m.type].label}`, `Today ${fmtTime(m.at)}: ${METRICS[m.type].label}`)}{" "}
                <span className="text-lg font-semibold text-ink tabular-nums">{formatValue(m)}</span>
              </span>
              <TextButton
                className="-mr-2 shrink-0"
                aria-label={L(`改 ${METRICS[m.type].label} ${formatValue(m)}`, `Change ${METRICS[m.type].label} ${formatValue(m)}`)}
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
                {L("改", "Change")}
              </TextButton>
            </li>
          ))}
        </ul>
      )}

      {note && <HintBanner hint={note} className="mt-4" />}
      {conclusion && <p className="t-lead mt-5 text-ink">{conclusion}</p>}

      <div className="mt-2 flex flex-wrap items-center justify-between">
        <TextLink href="/me/metrics">{L("看变化和以前的记录", "Trends and history")}</TextLink>
        {type && <TextButton onClick={() => setModal(true)}>{L("记别的数", "Other reading")}</TextButton>}
      </div>
      <RecordMetricModal open={modal} onClose={() => setModal(false)} defaultType={type ? undefined : (tracked[0] ?? "ppg")} />
    </Card>
  );
}
