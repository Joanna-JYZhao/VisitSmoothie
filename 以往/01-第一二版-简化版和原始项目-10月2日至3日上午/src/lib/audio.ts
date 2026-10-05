"use client";

import { transcribeClip } from "./ai/client";

/*
 * Speech input. The browser records in whatever format it likes (webm, mp4), but the speech
 * service only takes WAV or MP3 and at most 30 seconds per request. So a recording is decoded,
 * mixed down to 16 kHz mono, cut at quiet moments into clips under 28 seconds, and sent as WAV.
 */

const RATE = 16_000;
const MAX_CLIP_SECONDS = 28;

export function canRecord(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

export interface ActiveRecording {
  /** Stops and returns what was recorded. */
  stop: () => Promise<Blob>;
  /** Stops and throws the recording away. */
  cancel: () => void;
}

function pickMime(): string {
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

export async function startRecording(): Promise<ActiveRecording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
  });
  const mime = pickMime();
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const parts: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) parts.push(e.data);
  };
  recorder.start();
  const release = () => stream.getTracks().forEach((t) => t.stop());
  return {
    stop: () =>
      new Promise<Blob>((resolve) => {
        const finish = () => {
          release();
          resolve(new Blob(parts, { type: recorder.mimeType || mime || "audio/webm" }));
        };
        if (recorder.state === "inactive") finish();
        else {
          recorder.onstop = finish;
          recorder.stop();
        }
      }),
    cancel: () => {
      recorder.onstop = null;
      if (recorder.state !== "inactive") recorder.stop();
      release();
    },
  };
}

/** Mixes all channels into one and brings the sample rate down to 16 kHz. */
export function toMono16k(buffer: AudioBuffer): Float32Array {
  const length = buffer.length;
  const mono = new Float32Array(length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) mono[i] += data[i] / buffer.numberOfChannels;
  }
  if (buffer.sampleRate === RATE) return mono;
  const ratio = buffer.sampleRate / RATE;
  const out = new Float32Array(Math.floor(length / ratio));
  for (let i = 0; i < out.length; i++) {
    // averaging the window is a crude low-pass filter, which is all speech recognition needs
    const start = Math.floor(i * ratio);
    const end = Math.min(length, Math.max(start + 1, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = start; j < end; j++) sum += mono[j];
    out[i] = sum / (end - start);
  }
  return out;
}

/** Quiet recordings are turned up so soft speech is still understood. */
export function normalizeVolume(samples: Float32Array): Float32Array {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  if (peak < 0.005 || peak >= 0.6) return samples;
  const gain = Math.min(0.9 / peak, 12);
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * gain;
  return out;
}

/** Cuts a long recording into clips, each cut placed at the quietest moment near the limit. */
export function splitAtQuiet(samples: Float32Array, maxSeconds = MAX_CLIP_SECONDS): Float32Array[] {
  const max = maxSeconds * RATE;
  const frame = RATE / 10;
  const search = 4 * RATE;
  const out: Float32Array[] = [];
  let start = 0;
  while (samples.length - start > max) {
    const hi = start + max;
    let cut = hi;
    let quietest = Infinity;
    for (let f = hi - search; f + frame <= hi; f += frame) {
      let energy = 0;
      for (let i = f; i < f + frame; i++) energy += samples[i] * samples[i];
      if (energy < quietest) {
        quietest = energy;
        cut = f + frame / 2;
      }
    }
    out.push(samples.subarray(start, cut));
    start = cut;
  }
  // anything under a third of a second is a tap, not speech
  if (samples.length - start > RATE * 0.3) out.push(samples.subarray(start));
  return out;
}

export function encodeWav(samples: Float32Array): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

/** A recording (any format the browser can decode) as WAV clips ready for the speech service. */
export async function toWavClips(recording: Blob): Promise<Blob[]> {
  const Ctx: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(await recording.arrayBuffer());
    return splitAtQuiet(normalizeVolume(toMono16k(decoded))).map(encodeWav);
  } finally {
    void ctx.close();
  }
}

/** Turns a recording into text. Returns an empty string when nothing was said. */
export async function transcribeRecording(recording: Blob): Promise<string> {
  const clips = await toWavClips(recording);
  const texts: string[] = [];
  // three at a time keeps a long dictation quick without flooding the service
  for (let i = 0; i < clips.length; i += 3) {
    texts.push(...(await Promise.all(clips.slice(i, i + 3).map(transcribeClip))));
  }
  return texts.join("").trim();
}
