import type { AfterMedication, AfterResult, AiMode, Episode, Measurement, VisitRecord } from "./types";
import { getState, storeActions } from "./store";
import { holidayBetween } from "./metrics";
import { NO_DIAGNOSIS, autoTags, fmtISODate, nowISO } from "./utils";

/* Saving what the doctor said: under the symptom being tracked, or as a visit of its own. */

export function medicationLine(m: AfterMedication): string {
  // how to take it may itself contain brackets ("不变（继续服用）"); flatten them so they do not nest
  const usage = m.usage.replace(/[（(]/g, "，").replace(/[）)]/g, "").replace(/[。.]$/, "");
  return usage ? `${m.name}（${usage}）` : m.name;
}

/** What the doctor did and prescribed, as one line. */
export function treatmentText(result: Pick<AfterResult, "medications" | "procedures">): string {
  const parts = [...(result.procedures ?? []), ...result.medications.map(medicationLine)];
  return parts.length ? parts.join("；") : "没有开药";
}

/**
 * When to remind about the follow-up: that many days after the visit, at nine in the morning.
 * "一周后" means that day, weekend or not. Only a distant date ("三个月后") that happens to land on
 * a public holiday is moved to the first working day after it.
 */
export function followUpDate(result: AfterResult): string | null {
  if (!result.followUpDays) return null;
  const d = new Date(`${result.date ?? fmtISODate(new Date())}T09:00:00`);
  d.setDate(d.getDate() + result.followUpDays);
  if (result.followUpDays >= 30) {
    for (let i = 0; i < 12; i++) {
      const key = fmtISODate(d);
      if (!holidayBetween(key, key)) break;
      d.setDate(d.getDate() + 1);
    }
  }
  return d.toISOString();
}

/**
 * A visit recorded on its own (a routine check-up) is often also about a complaint being
 * tracked: "脚麻给加了甲钴胺". When the words say so, that complaint gets the visit too, so its
 * card stops saying "建议找医生看一下" after the doctor has already seen it.
 */
export function episodesCoveredBy(result: AfterResult, said: string, episodes: Episode[] = getState().episodes): Episode[] {
  const text = [said, result.diagnosis, result.advice, result.summary, ...result.findings, ...result.medications.map((m) => m.usage)]
    .filter(Boolean)
    .join(" ");
  return episodes.filter(
    (e) => e.status === "active" && [e.title, ...e.tags].some((word) => word.length >= 2 && text.includes(word)),
  );
}

/** Long-term medicines from this visit that are not in the profile yet. */
export function newLongTermMedications(result: AfterResult): AfterMedication[] {
  const have = getState().profile?.medications ?? [];
  return result.medications.filter(
    (m) => m.longTerm && !have.some((h) => h.includes(m.name) || m.name.includes(h.replace(/（.*$/, "").trim())),
  );
}

export interface SavedAfter {
  /** what to undo if the user changes their mind */
  followUpId: string | null;
  measurementIds: string[];
  /** tracked complaints this visit was also filed under */
  linked: string[];
}

export function saveAfter(result: AfterResult, episodeId: string | null, mode: AiMode, said = ""): SavedAfter {
  const today = fmtISODate(new Date());
  const date = result.date ?? today;
  // readings from an earlier visit are filed at noon of that day; today's at this moment
  const at = date === today ? nowISO() : new Date(`${date}T12:00:00`).toISOString();
  const readings: Omit<Measurement, "id">[] = result.readings.map((r) => ({
    type: r.type,
    value: r.value,
    value2: r.value2,
    at,
    source: "visit",
    note: "看医生时的检查",
  }));
  // a routine check-up often has no new diagnosis; say that, rather than something that sounds like a verdict
  const diagnosis = result.diagnosis ?? NO_DIAGNOSIS;
  const treatment = treatmentText(result);
  const visit: VisitRecord = {
    date,
    hospital: result.hospital ?? undefined,
    department: result.department ?? undefined,
    diagnosis,
    treatment,
    advice: result.advice ?? undefined,
    findings: result.findings,
    archiveSummary: result.summary,
    followUp: result.followUpNote,
    followUpAt: null,
    mode,
    recordedAt: nowISO(),
  };

  if (episodeId) {
    storeActions.setVisit(episodeId, visit, autoTags(diagnosis));
    const measurementIds = readings.map((r) => storeActions.addMeasurement(r).id);
    return { followUpId: null, measurementIds, linked: [] };
  }

  const covered = episodesCoveredBy(result, said);
  for (const e of covered) storeActions.setVisit(e.id, visit);

  const before = new Set(getState().measurements.map((m) => m.id));
  const saved = storeActions.addFollowUp(
    {
      date,
      hospital: result.hospital ?? undefined,
      department: result.department ?? undefined,
      reason: result.diagnosis ? `复诊（${result.diagnosis}）` : "复诊",
      findings: result.findings.length ? result.findings.join("；") : (result.diagnosis ?? "没有记录检查结果"),
      plan: treatment,
      advice: [result.advice, result.followUpNote].filter(Boolean).join("；") || undefined,
      summary: result.summary || undefined,
    },
    readings,
  );
  const measurementIds = getState()
    .measurements.filter((m) => !before.has(m.id))
    .map((m) => m.id);
  return { followUpId: saved.id, measurementIds, linked: covered.map((e) => e.title) };
}
