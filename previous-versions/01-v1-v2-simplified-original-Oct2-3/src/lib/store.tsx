"use client";

import React, { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type {
  AnnualSummary,
  AppState,
  AskTurn,
  ChatMessage,
  Checkup,
  DemoPersona,
  DoctorSummary,
  Entry,
  Episode,
  EpisodeStatus,
  FollowUp,
  Hint,
  Measurement,
  Profile,
  Settings,
  VisitRecord,
} from "./types";
import { autoTags, findSimilarEpisodes, nowISO, provisionalTitle, uid, uniq } from "./utils";
import { buildDemoState } from "./demo";
import { buildWangXiulanState } from "./demo-wang";

export type { DemoPersona };

const KEY = "yiban.v1";
const NOTIFIED_KEY = "yiban.notified";
const DEFAULT_SETTINGS: Settings = {
  checkInIntervalHours: 24,
  notificationsEnabled: false,
  longTerm: false,
  trackedMetrics: [],
  metricReminderHours: 24,
};
const EMPTY: AppState = {
  version: 1,
  profile: null,
  episodes: [],
  measurements: [],
  followUps: [],
  annualSummary: null,
  nextVisit: null,
  checkups: [],
  asks: [],
  settings: DEFAULT_SETTINGS,
  demo: null,
};

/** How many question-and-answer turns are kept. Older ones drop off the top. */
const MAX_ASKS = 40;

export interface StoreApi {
  state: AppState;
  ready: boolean;
  setProfile: (p: Profile) => void;
  updateSettings: (s: Partial<Settings>) => void;
  /** Starts tracking a new symptom from the first thing the user said about it. */
  createEpisode: (input: { text: string; hint?: Hint | null }) => Episode;
  updateEpisode: (id: string, fn: (e: Episode) => Episode) => void;
  addEntry: (id: string, entry: Omit<Entry, "id" | "at"> & { at?: string }) => Entry;
  addMessage: (id: string, msg: Omit<ChatMessage, "id" | "at"> & { at?: string }) => ChatMessage;
  setStatus: (id: string, status: EpisodeStatus) => void;
  setSummary: (id: string, s: DoctorSummary | null) => void;
  setVisit: (id: string, v: VisitRecord, extraTags?: string[]) => void;
  deleteEpisode: (id: string) => void;
  addMeasurement: (m: Omit<Measurement, "id">) => Measurement;
  deleteMeasurement: (id: string) => void;
  addFollowUp: (f: Omit<FollowUp, "id" | "recordedAt">, measurements?: Omit<Measurement, "id">[]) => FollowUp;
  deleteFollowUp: (id: string) => void;
  setAnnualSummary: (s: AnnualSummary | null) => void;
  setNextVisit: (v: AppState["nextVisit"]) => void;
  /** Files a check-up report together with the readings printed on it. */
  addCheckup: (c: Omit<Checkup, "id" | "recordedAt">, measurements?: Omit<Measurement, "id">[]) => Checkup;
  deleteCheckup: (id: string) => void;
  addAsk: (turn: Omit<AskTurn, "id">) => AskTurn;
  clearAsks: () => void;
  /** Adds medicines to the profile's long-term list. Unlike setProfile, this keeps a demo a demo. */
  addMedications: (names: string[]) => void;
  /** Puts an episode back exactly as it was (undo). */
  restoreEpisode: (e: Episode) => void;
  loadDemo: (persona?: DemoPersona) => void;
  resetAll: () => void;
  exportJSON: () => string;
  getEpisode: (id: string) => Episode | undefined;
}

/** Brings data saved by an earlier version up to the current shape. */
export function migrate(raw: unknown): AppState {
  if (!raw || typeof raw !== "object") return EMPTY;
  const o = raw as Partial<AppState> & { settings?: Partial<Settings> };
  const tracked = o.settings?.trackedMetrics ?? [];
  return {
    version: 1,
    profile: o.profile ?? null,
    episodes: Array.isArray(o.episodes)
      ? o.episodes.map((e) => ({
          ...e,
          // "已就医" used to be a status. Seeing a doctor no longer ends the tracking.
          status: e.status === "resolved" ? "resolved" : "active",
          tags: e.tags ?? [],
          entries: e.entries ?? [],
          messages: e.messages ?? [],
          relatedEpisodeIds: e.relatedEpisodeIds ?? [],
          lastCheckInAt: e.lastCheckInAt ?? e.updatedAt ?? e.createdAt,
        }))
      : [],
    measurements: Array.isArray(o.measurements) ? o.measurements : [],
    followUps: Array.isArray(o.followUps) ? o.followUps : [],
    annualSummary: o.annualSummary ?? null,
    nextVisit: o.nextVisit ?? null,
    checkups: Array.isArray(o.checkups) ? o.checkups : [],
    asks: Array.isArray(o.asks) ? o.asks : [],
    settings: {
      ...DEFAULT_SETTINGS,
      ...(o.settings ?? {}),
      // The earlier version asked every few hours. Now it is once or twice a day, or every other day.
      checkInIntervalHours: [12, 24, 48].includes(o.settings?.checkInIntervalHours ?? 0)
        ? (o.settings?.checkInIntervalHours as number)
        : DEFAULT_SETTINGS.checkInIntervalHours,
      // people who were already tracking metrics keep seeing them
      longTerm: o.settings?.longTerm ?? tracked.length > 0,
    },
    demo: o.demo ?? null,
  };
}

/* ---------- a tiny external store over localStorage ---------- */

let memory: AppState | null = null;
const listeners = new Set<() => void>();

function read(): AppState {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    memory = raw ? migrate(JSON.parse(raw)) : EMPTY;
  } catch (err) {
    console.warn("无法读取本地数据", err);
    memory = EMPTY;
  }
  return memory;
}

function write(next: AppState) {
  memory = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch (err) {
    console.warn("无法保存本地数据", err);
  }
  listeners.forEach((l) => l());
}

function update(fn: (prev: AppState) => AppState) {
  write(fn(read()));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) {
      memory = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const serverSnapshot = () => EMPTY;
const clientReady = () => true;
const serverReady = () => false;

/* ---------- actions (stable, module-level) ---------- */

const touch = (e: Episode): Episode => ({ ...e, updatedAt: nowISO() });

/**
 * "档案建好了，我记下了这些" is about the profile that was just created in this tab. Once that
 * profile is replaced wholesale (a demo is loaded, everything is cleared) the note is about
 * somebody else and must not be shown.
 */
function forgetWelcome() {
  try {
    sessionStorage.removeItem("yiban.welcome");
  } catch {
    /* no session storage, so there is no note either */
  }
}

function patchEpisode(id: string, fn: (e: Episode) => Episode) {
  update((prev) => ({ ...prev, episodes: prev.episodes.map((e) => (e.id === id ? fn(e) : e)) }));
}

const actions: Omit<StoreApi, "state" | "ready"> = {
  // Saving a profile by hand means the data is now the user's own, not a demo.
  setProfile: (p) => update((prev) => ({ ...prev, profile: { ...p, updatedAt: nowISO() }, demo: null })),
  updateSettings: (s) => update((prev) => ({ ...prev, settings: { ...prev.settings, ...s } })),
  createEpisode: ({ text, hint = null }) => {
    const now = nowISO();
    const said = text.trim();
    const title = provisionalTitle(said);
    const tags = autoTags(said);
    const related = findSimilarEpisodes(read().episodes, { title, tags }).map((e) => e.id);
    const ep: Episode = {
      id: uid(),
      title,
      tags,
      status: "active",
      startedAt: now,
      createdAt: now,
      updatedAt: now,
      lastCheckInAt: now,
      snoozedUntil: null,
      entries: [{ id: uid(), at: now, severity: null, note: said, location: null, source: "user" }],
      messages: [{ id: uid(), role: "user", content: said, at: now, kind: "intake" }],
      lastHint: hint,
      lastHintAt: hint ? now : null,
      suggestedReplies: [],
      done: false,
      summary: null,
      visit: null,
      resolvedAt: null,
      relatedEpisodeIds: related,
    };
    update((prev) => ({ ...prev, episodes: [ep, ...prev.episodes] }));
    return ep;
  },
  updateEpisode: (id, fn) => patchEpisode(id, (e) => touch(fn(e))),
  addEntry: (id, entry) => {
    const full: Entry = { id: uid(), at: entry.at ?? nowISO(), ...entry };
    patchEpisode(id, (e) =>
      touch({
        ...e,
        entries: [...e.entries, full],
        lastCheckInAt:
          new Date(full.at).getTime() >= new Date(e.lastCheckInAt).getTime() ? full.at : e.lastCheckInAt,
        snoozedUntil: null,
      }),
    );
    return full;
  },
  addMessage: (id, msg) => {
    const full: ChatMessage = { id: uid(), at: msg.at ?? nowISO(), ...msg };
    patchEpisode(id, (e) => touch({ ...e, messages: [...e.messages, full] }));
    return full;
  },
  setStatus: (id, status) =>
    update((prev) => {
      const target = prev.episodes.find((e) => e.id === id);
      // "一个月后复查" still stands after the patient feels well: the reminder moves from the
      // symptom's card to the home screen instead of vanishing with the card.
      const due = target?.visit?.followUpAt;
      const carry =
        status === "resolved" && due && new Date(due).getTime() > Date.now() && !prev.nextVisit
          ? { at: due, note: `${target.title}：${target.visit?.followUp ?? "复查"}` }
          : prev.nextVisit;
      return {
        ...prev,
        nextVisit: carry,
        episodes: prev.episodes.map((e) =>
          e.id === id
            ? touch({
                ...e,
                status,
                resolvedAt: status === "resolved" ? nowISO() : null,
                snoozedUntil: null,
                // advice written while the user was ill no longer applies once they are well
                lastHint: status === "resolved" ? null : e.lastHint,
                suggestedReplies: status === "resolved" ? [] : e.suggestedReplies,
              })
            : e,
        ),
      };
    }),
  setSummary: (id, s) => patchEpisode(id, (e) => ({ ...e, summary: s })),
  // Seeing a doctor does not end the tracking: the symptom stays active until the user says they are well.
  setVisit: (id, v, extraTags = []) =>
    patchEpisode(id, (e) => {
      // A second visit replaces the first as "the" visit; the first stays on the timeline.
      const earlier: Entry[] = e.visit
        ? [
            {
              id: uid(),
              at: e.visit.recordedAt,
              severity: null,
              note: `${e.visit.date} 看医生：${e.visit.diagnosis}；${e.visit.treatment}`,
              location: null,
              source: "ai",
            },
          ]
        : [];
      return touch({
        ...e,
        visit: v,
        entries: [...e.entries, ...earlier],
        lastHint: null,
        lastHintAt: null,
        lastCheckInAt: nowISO(),
        tags: uniq([...e.tags, ...extraTags]).slice(0, 8),
      });
    }),
  deleteEpisode: (id) => update((prev) => ({ ...prev, episodes: prev.episodes.filter((e) => e.id !== id) })),
  addMeasurement: (m) => {
    const full: Measurement = { id: uid(), ...m };
    update((prev) => ({ ...prev, measurements: [...prev.measurements, full] }));
    return full;
  },
  deleteMeasurement: (id) =>
    update((prev) => ({ ...prev, measurements: prev.measurements.filter((m) => m.id !== id) })),
  addFollowUp: (f, measurements = []) => {
    const full: FollowUp = { id: uid(), recordedAt: nowISO(), ...f };
    update((prev) => ({
      ...prev,
      followUps: [...prev.followUps, full],
      measurements: [...prev.measurements, ...measurements.map((m) => ({ id: uid(), ...m }))],
    }));
    return full;
  },
  deleteFollowUp: (id) => update((prev) => ({ ...prev, followUps: prev.followUps.filter((f) => f.id !== id) })),
  setAnnualSummary: (summary) => update((prev) => ({ ...prev, annualSummary: summary })),
  setNextVisit: (v) => update((prev) => ({ ...prev, nextVisit: v })),
  addCheckup: (c, measurements = []) => {
    const full: Checkup = { id: uid(), recordedAt: nowISO(), ...c };
    update((prev) => ({
      ...prev,
      checkups: [...prev.checkups, full],
      measurements: [...prev.measurements, ...measurements.map((m) => ({ id: uid(), ...m }))],
    }));
    return full;
  },
  deleteCheckup: (id) => update((prev) => ({ ...prev, checkups: prev.checkups.filter((c) => c.id !== id) })),
  addAsk: (turn) => {
    const full: AskTurn = { id: uid(), ...turn };
    update((prev) => ({ ...prev, asks: [...prev.asks, full].slice(-MAX_ASKS) }));
    return full;
  },
  clearAsks: () => update((prev) => ({ ...prev, asks: [] })),
  addMedications: (names) =>
    update((prev) =>
      prev.profile
        ? {
            ...prev,
            profile: {
              ...prev.profile,
              medications: uniq([...prev.profile.medications, ...names.map((n) => n.trim()).filter(Boolean)]),
              updatedAt: nowISO(),
            },
          }
        : prev,
    ),
  restoreEpisode: (e) =>
    update((prev) => ({
      ...prev,
      episodes: prev.episodes.some((x) => x.id === e.id)
        ? prev.episodes.map((x) => (x.id === e.id ? e : x))
        : [e, ...prev.episodes],
    })),
  loadDemo: (persona = "liming") => {
    forgetWelcome();
    write(persona === "wang" ? buildWangXiulanState() : buildDemoState());
  },
  resetAll: () => {
    forgetWelcome();
    write(EMPTY);
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem(NOTIFIED_KEY);
    } catch {
      /* ignore */
    }
  },
  exportJSON: () => JSON.stringify(read(), null, 2),
  getEpisode: (id) => read().episodes.find((e) => e.id === id),
};

/** For code that runs outside React (a request that outlives the page that started it). */
export const getState = (): AppState => read();
export const storeActions = actions;

const StoreContext = createContext<StoreApi | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const state = useSyncExternalStore(subscribe, read, serverSnapshot);
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  const api = useMemo<StoreApi>(() => ({ state, ready, ...actions }), [state, ready]);
  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore 必须在 StoreProvider 内使用");
  return ctx;
}

/** Re-renders on an interval so relative times stay fresh. */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
