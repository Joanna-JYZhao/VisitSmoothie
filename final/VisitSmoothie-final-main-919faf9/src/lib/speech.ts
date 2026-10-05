"use client";

import { getLang } from "./lang";

/*
 * Which way speech becomes text. The speech service on the server is the first choice; when it is
 * not set up, refuses the key or fails once, the browser's own speech recognition (Chrome, Safari,
 * Edge) listens instead. When neither works the caller says so and asks for typing.
 */

/* ---------- the server's speech service ---------- */

// For the public demo (2026-10-04): always the browser's own recognition, the speech service is not asked.
const BROWSER_ONLY = true;

let serverKnown: boolean | null = null;
let serverCheck: Promise<boolean> | null = null;

/** Asks the server once whether its speech service works. Call it early: the answer is needed at the tap. */
export function checkServerSpeech(): Promise<boolean> {
  if (BROWSER_ONLY) return Promise.resolve(false);
  if (serverKnown === false) return Promise.resolve(false);
  if (!serverCheck) {
    serverCheck = fetch("/api/transcribe")
      .then((r) => (r.ok ? r.json() : { ok: false }))
      .then((d: { ok?: unknown }) => d?.ok === true)
      .catch(() => false)
      .then((ok) => {
        if (serverKnown !== false) serverKnown = ok;
        return serverKnown === true;
      });
  }
  return serverCheck;
}

/** true / false once checked, null while still unknown. */
export function serverSpeechKnown(): boolean | null {
  return BROWSER_ONLY ? false : serverKnown;
}

/** A transcription failed: from now on the browser listens instead. */
export function markServerSpeechBroken() {
  serverKnown = false;
}

/* ---------- the browser's own speech recognition ---------- */

interface Alternative {
  transcript: string;
}
interface Result {
  isFinal: boolean;
  0: Alternative;
}
interface ResultEvent {
  resultIndex: number;
  results: ArrayLike<Result>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: ResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function canBrowserListen(): boolean {
  return recognitionCtor() != null;
}

/** Errors after which listening cannot go on: no permission, no service, no microphone. */
const FATAL = new Set(["not-allowed", "service-not-allowed", "audio-capture", "network", "language-not-supported"]);

export class ListenError extends Error {
  /** the browser's error name, e.g. "not-allowed" */
  readonly code: string;
  constructor(code: string) {
    super(`speech recognition: ${code}`);
    this.name = "ListenError";
    this.code = code;
  }
}

export interface Listening {
  /** Stops and returns everything heard. Throws ListenError when listening failed and nothing was heard. */
  stop: () => Promise<string>;
  cancel: () => void;
}

/**
 * Starts listening in the interface language. Must be called straight from a tap (Safari asks for
 * that). The browser ends a session after a pause or about a minute; it is started again until
 * `stop`, so a long visit is heard to the end.
 */
export function startListening(onFatal?: (err: ListenError) => void, onLive?: (text: string) => void): Listening {
  const Ctor = recognitionCtor();
  if (!Ctor) throw new ListenError("unsupported");
  const en = getLang() === "en";
  const done: string[] = [];
  let session: string[] = [];
  let interim = "";
  let stopped = false;
  let fatal: ListenError | null = null;
  let endWaiter: (() => void) | null = null;
  let r: Recognition;

  const keep = () => {
    const said = session.filter(Boolean).join(en ? " " : "").trim() || interim.trim();
    if (said) done.push(said);
    session = [];
    interim = "";
  };

  const open = () => {
    r = new Ctor();
    r.lang = en ? "en-US" : "zh-CN";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let pending = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) session[i] = res[0].transcript.trim();
        else pending += res[0].transcript;
      }
      interim = pending;
      if (onLive) {
        const now = session.filter(Boolean).join(en ? " " : "") + (en && interim ? " " : "") + interim;
        onLive([...done, now.trim()].filter(Boolean).join(en ? " " : ""));
      }
    };
    r.onerror = (e) => {
      if (FATAL.has(e.error)) {
        fatal = new ListenError(e.error);
        if (!stopped) onFatal?.(fatal);
      }
    };
    r.onend = () => {
      keep();
      if (!stopped && !fatal) {
        try {
          open();
          return;
        } catch {
          /* could not start again: treat as stopped */
        }
      }
      endWaiter?.();
      endWaiter = null;
    };
    r.start();
  };
  open();

  const text = () => done.join(en ? " " : "").trim();
  return {
    stop: () =>
      new Promise<string>((resolve, reject) => {
        stopped = true;
        const finish = () => {
          const t = text();
          if (!t && fatal) reject(fatal);
          else resolve(t);
        };
        endWaiter = finish;
        try {
          r.stop();
        } catch {
          /* already ended */
        }
        // some browsers never send "end" after stop: give it a moment, then use what was heard
        setTimeout(() => {
          if (endWaiter) {
            endWaiter = null;
            keep();
            finish();
          }
        }, 2500);
      }),
    cancel: () => {
      stopped = true;
      endWaiter = null;
      try {
        r.abort();
      } catch {
        /* already ended */
      }
    },
  };
}
