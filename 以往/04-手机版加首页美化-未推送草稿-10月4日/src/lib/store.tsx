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
  Lang,
  Measurement,
  NewThreadItem,
  Profile,
  Reminder,
  Settings,
  ThreadItem,
  VisitRecord,
} from "./types";
import { autoTags, findSimilarEpisodes, nowISO, provisionalTitle, uid, uniq } from "./utils";
import { buildLinState } from "./demo-lin";
import { getLang, setLang } from "./lang";
import { SESSION_KEY, currentAccountId, dataKey, isDemoAccountId } from "./accounts";

export type { DemoPersona };

const NOTIFIED_KEY = "yiban.notified";
const DEFAULT_SETTINGS: Settings = {
  checkInIntervalHours: 24,
  notificationsEnabled: false,
  longTerm: false,
  trackedMetrics: [],
  metricReminderHours: 24,
  lang: "zh",
  tourDone: false,
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
  thread: [],
  reminders: [],
  settings: DEFAULT_SETTINGS,
  demo: null,
};

/** How much of the conversation is kept. Older items drop off the top; the records they led to stay. */
const MAX_THREAD = 300;

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
  /** Adds one bubble or card to the main conversation. */
  pushThread: (item: NewThreadItem) => ThreadItem;
  /** Changes a card in place (a draft that was saved, a description that was rewritten). */
  patchThread: (id: string, fn: (item: ThreadItem) => ThreadItem) => void;
  clearThread: () => void;
  addReminders: (list: Omit<Reminder, "id" | "createdAt">[]) => Reminder[];
  updateReminder: (id: string, fn: (r: Reminder) => Reminder) => void;
  removeReminder: (id: string) => void;
  /** Adds medicines to the profile's long-term list. Unlike setProfile, this keeps a demo a demo. */
  addMedications: (names: string[]) => void;
  /** Puts an episode back exactly as it was (undo). */
  restoreEpisode: (e: Episode) => void;
  /** Switches the interface language. Nothing that was recorded is touched. */
  setLanguage: (lang: Lang) => void;
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
    thread: Array.isArray(o.thread) ? o.thread : [],
    reminders: Array.isArray(o.reminders) ? o.reminders : [],
    settings: {
      ...DEFAULT_SETTINGS,
      ...(o.settings ?? {}),
      // The earlier version asked every few hours. Now it is once or twice a day, or every other day.
      checkInIntervalHours: [12, 24, 48].includes(o.settings?.checkInIntervalHours ?? 0)
        ? (o.settings?.checkInIntervalHours as number)
        : DEFAULT_SETTINGS.checkInIntervalHours,
      // people who were already tracking metrics keep seeing them
      longTerm: o.settings?.longTerm ?? tracked.length > 0,
      lang: o.settings?.lang === "en" ? "en" : "zh",
    },
    demo: o.demo ?? null,
  };
}

/* ---------- a tiny external store over localStorage ---------- */

let memory: AppState | null = null;
const listeners = new Set<() => void>();

/** 只有演示账号（虚构数据）还写 localStorage；真实账号的数据只存内存，
 *  持久化走服务端加密存储（/api/data，见 src/lib/server/secure-db.ts）。 */
function storeKey(): string | null {
  const id = currentAccountId();
  return id && isDemoAccountId(id) ? dataKey(id) : null;
}

/**
 * The language last chosen in this browser, whoever was logged in. Without it the choice made on
 * the welcome page would be lost on reload, and logging out would always fall back to Chinese.
 */
const DEVICE_LANG_KEY = "yiban.lang";
function deviceLang(): Lang {
  try {
    return localStorage.getItem(DEVICE_LANG_KEY) === "en" ? "en" : "zh";
  } catch {
    return "zh";
  }
}
function rememberDeviceLang(lang: Lang) {
  try {
    localStorage.setItem(DEVICE_LANG_KEY, lang);
  } catch {
    /* no storage: the choice lasts until the page is closed */
  }
}

function read(): AppState {
  if (memory) return memory;
  try {
    const key = storeKey();
    const raw = key ? localStorage.getItem(key) : null;
    // nothing saved here yet (logged out, or a server account still loading): use this browser's choice
    memory = raw ? migrate(JSON.parse(raw)) : { ...EMPTY, settings: { ...EMPTY.settings, lang: deviceLang() } };
  } catch (err) {
    console.warn("无法读取本地数据", err);
    memory = EMPTY;
  }
  // every sentence the app builds from here on is in the saved language
  setLang(memory.settings.lang);
  return memory;
}

function write(next: AppState) {
  memory = next;
  setLang(next.settings.lang);
  try {
    const key = storeKey();
    // 演示账号：写 localStorage。真实账号：安排同步到服务端加密存储。
    if (key) localStorage.setItem(key, JSON.stringify(next));
    else scheduleServerSync();
  } catch (err) {
    console.warn("无法保存本地数据", err);
  }
  listeners.forEach((l) => l());
}

/* ---------- 真实账号的服务端同步 ---------- */

/** 服务端数据的版本号；0 表示还没读过/还没有数据。 */
let serverVersion = 0;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let pushing = false;
let pulling = false;

/** 把内存里的最新状态整体推到服务端（覆盖式 + 乐观并发）。 */
async function pushToServer() {
  const id = currentAccountId();
  if (!id || isDemoAccountId(id) || !memory || pushing) return;
  pushing = true;
  try {
    const res = await fetch("/api/data", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: memory, baseVersion: serverVersion }),
    });
    if (res.ok) {
      const d = (await res.json()) as { version: number };
      serverVersion = d.version;
    } else if (res.status === 409) {
      // 另一个标签页/设备写过了：以服务端为准，本地重新加载
      const d = (await res.json()) as { version: number; state: unknown };
      serverVersion = d.version;
      memory = migrate(d.state);
      setLang(memory.settings.lang);
      listeners.forEach((l) => l());
    } else if (res.status === 401) {
      markSessionGone();
    }
  } catch {
    // 离线或服务不可用：数据还在内存里，下次 write 会再试
  } finally {
    pushing = false;
  }
}

function scheduleServerSync() {
  const id = currentAccountId();
  if (!id || isDemoAccountId(id)) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void pushToServer();
  }, 800);
}

/** 会话失效：清掉本地"已登录"标记，数据只留在服务端。 */
function markSessionGone() {
  serverVersion = 0;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
  memory = { ...EMPTY, settings: { ...EMPTY.settings, lang: deviceLang() } };
  listeners.forEach((l) => l());
}

/** 正在进行的那一次拉取：再次调用时等它完成，而不是立刻返回（否则启动时会先用空数据渲染，把人跳回首页）。 */
let inflight: Promise<void> | null = null;

/** 从服务端拉取当前账号的数据并灌进内存（登录后、应用启动时调用）。 */
export function hydrateFromServer(): Promise<void> {
  if (inflight) return inflight;
  inflight = pullFromServer().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function pullFromServer(): Promise<void> {
  const id = currentAccountId();
  if (!id || isDemoAccountId(id) || pulling) return;
  pulling = true;
  try {
    const res = await fetch("/api/data", { cache: "no-store" });
    if (res.status === 401) {
      markSessionGone();
      return;
    }
    if (!res.ok) return;
    const d = (await res.json()) as { state: unknown; version: number };
    serverVersion = d.version;
    // 服务端有数据就以服务端为准；服务端是空的就保留内存（比如刚注册完正在填档案）
    if (d.state) {
      memory = migrate(d.state);
      setLang(memory.settings.lang);
      listeners.forEach((l) => l());
    }
  } catch {
    // 服务暂时不可用：先用内存里的，同步会在下次 write 时重试
  } finally {
    pulling = false;
  }
}

// 页面隐藏/关闭前把未同步的修改立刻推上去
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
      void pushToServer();
    }
  });
}

function update(fn: (prev: AppState) => AppState) {
  write(fn(read()));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === SESSION_KEY || e.key === storeKey() || e.key === null) {
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

/** After logging in or out: forget what was read and show the new account's records. */
export function reloadAccount() {
  memory = null;
  serverVersion = 0;
  forgetWelcome();
  listeners.forEach((l) => l());
  void hydrateFromServer();
}

const serverSnapshot = () => EMPTY;
const clientReady = () => true;
const serverReady = () => false;

/* ---------- actions (stable, module-level) ---------- */

const touch = (e: Episode): Episode => ({ ...e, updatedAt: nowISO() });

/** The demo dataset: 林叔, the teammate's fictional patient, in the language of the interface. */
function demoIn(persona: DemoPersona, lang: Lang): AppState {
  void persona;
  return buildLinState(new Date(), lang);
}

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
  pushThread: (item) => {
    const full = { id: uid(), at: nowISO(), ...item } as ThreadItem;
    update((prev) => ({ ...prev, thread: [...prev.thread, full].slice(-MAX_THREAD) }));
    return full;
  },
  patchThread: (id, fn) => update((prev) => ({ ...prev, thread: prev.thread.map((x) => (x.id === id ? fn(x) : x)) })),
  clearThread: () => update((prev) => ({ ...prev, thread: [] })),
  addReminders: (list) => {
    const made: Reminder[] = list.map((r) => ({ id: uid(), createdAt: nowISO(), ...r }));
    update((prev) => ({ ...prev, reminders: [...prev.reminders, ...made] }));
    return made;
  },
  updateReminder: (id, fn) => update((prev) => ({ ...prev, reminders: prev.reminders.map((r) => (r.id === id ? fn(r) : r)) })),
  removeReminder: (id) => update((prev) => ({ ...prev, reminders: prev.reminders.filter((r) => r.id !== id) })),
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
  // The interface language changes. Somebody's own records are never touched or translated.
  // The demo (林叔) is the one exception: it exists in both languages, so it is rebuilt in the new
  // one. Its ids are fixed and the same in both languages, so a page showing one of its records
  // keeps working. The settings (the language, the finished tour) are kept as they are. A demo
  // lives in its own demo account, which is local only, so the rebuild never reaches the server.
  setLanguage: (lang) => {
    rememberDeviceLang(lang);
    update((prev) => {
      if ((prev.settings.lang ?? "zh") === lang) return prev;
      const settings = { ...prev.settings, lang };
      return prev.demo === "lin" ? { ...demoIn(prev.demo, lang), settings } : { ...prev, settings };
    });
  },
  loadDemo: (persona = "lin") => {
    forgetWelcome();
    const lang = getLang();
    const demo = demoIn(persona, lang);
    write({ ...demo, settings: { ...demo.settings, lang } });
  },
  resetAll: () => {
    forgetWelcome();
    // everything goes except the choice of language, which is not health data
    write({ ...EMPTY, settings: { ...DEFAULT_SETTINGS, lang: getLang() } });
    try {
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
  // 第一次渲染前先尝试从服务端拉一次数据，避免已登录用户看到一闪而过的空状态
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    void hydrateFromServer().finally(() => setBooted(true));
  }, []);
  const api = useMemo<StoreApi>(() => ({ state, ready, ...actions }), [state, ready]);
  return <StoreContext.Provider value={api}>{booted ? children : null}</StoreContext.Provider>;
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
