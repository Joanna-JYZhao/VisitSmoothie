import { open } from 'node:fs/promises';
import { constants } from 'node:fs';

const MAX_AUDIO_BYTES = 25_000_000;
const MIME = Object.freeze({
  mp3: 'audio/mpeg', mp4: 'audio/mp4', mpeg: 'audio/mpeg', mpga: 'audio/mpeg',
  m4a: 'audio/mp4', wav: 'audio/wav', webm: 'audio/webm',
});
const MIME_EXTENSION = Object.freeze({
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a',
  'audio/m4a': 'm4a', 'audio/x-m4a': 'm4a', 'video/mp4': 'mp4',
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav',
  'audio/webm': 'webm', 'video/webm': 'webm',
});

/** Stable, sanitized error contract; never contains upstream response bodies. */
export class DictationError extends Error {
  constructor(code, message, { status, retryable = false } = {}) {
    super(message);
    this.name = 'DictationError';
    this.code = code;
    this.retryable = retryable;
    if (status !== undefined) this.status = status;
  }
}

function configError(message) { return new DictationError('INVALID_CONFIG', message); }
function inputError(message) { return new DictationError('INVALID_INPUT', message); }
function aborted() { return new DictationError('ABORTED', 'Dictation was cancelled.'); }

function checkSize(size, limit) {
  if (size === 0) throw new DictationError('EMPTY_AUDIO', 'Audio is empty.');
  if (size > limit) throw new DictationError('AUDIO_TOO_LARGE', 'Audio exceeds the configured byte limit.');
}

function uploadName(value) {
  if (typeof value !== 'string' || /[\x00-\x1f\x7f]/u.test(value)) throw inputError('Provide a valid audio filename.');
  // Keep local paths and patient directory names out of the upload.
  const filename = value.replaceAll('\\', '/').split('/').at(-1);
  if (!filename || filename.length > 255) throw inputError('Provide a valid audio filename.');
  const extension = filename.split('.').at(-1).toLowerCase();
  if (!Object.hasOwn(MIME, extension) || !filename.includes('.')) {
    throw new DictationError('UNSUPPORTED_FORMAT', 'Use mp3, mp4, mpeg, mpga, m4a, wav or webm audio.');
  }
  return { filename, type: MIME[extension] };
}

function audioUpload(audio, filename, limit) {
  if (!(audio instanceof Blob || audio instanceof Uint8Array || audio instanceof ArrayBuffer)) {
    throw inputError('Audio must be a Blob, File, Buffer, Uint8Array or ArrayBuffer.');
  }
  checkSize(audio instanceof Blob ? audio.size : audio.byteLength, limit);
  if (filename === undefined && audio instanceof File) filename = audio.name;
  if (filename === undefined && audio instanceof Blob) {
    const extension = MIME_EXTENSION[audio.type.split(';')[0].trim().toLowerCase()];
    if (extension) filename = `dictation.${extension}`;
  }
  const metadata = uploadName(filename);
  return { ...metadata, blob: new Blob([audio], { type: metadata.type }) };
}

function optionsFor(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw inputError('Provide an input object.');
  const { language, prompt, signal } = value;
  if (language !== undefined && (typeof language !== 'string' || !/^[a-z]{2,3}(?:-[a-z]{2})?$/iu.test(language))) {
    throw inputError('Language must be a language code such as zh, en or zh-cn.');
  }
  if (prompt !== undefined && typeof prompt !== 'string') throw inputError('Transcription prompt must be a string.');
  if (signal !== undefined && !(signal instanceof AbortSignal)) throw inputError('Signal must be an AbortSignal.');
  if (signal?.aborted) throw aborted();
  return { language: language?.toLowerCase(), prompt, signal };
}

function endpointFor(baseURL) {
  let url;
  try { url = new URL(baseURL); } catch { throw configError('Provide a valid API base URL.'); }
  const localHTTP = url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !localHTTP) || url.username || url.password || url.search || url.hash) {
    throw configError('Use an HTTPS API base URL without credentials, query or fragment; local HTTP is allowed for development.');
  }
  url.pathname = `${url.pathname.replace(/\/+$/u, '')}/audio/transcriptions`;
  return url.href;
}

function providerError(status) {
  if (status === 401 || status === 403) return new DictationError('AUTH_FAILED', 'Transcription API authentication or access failed.', { status });
  if (status === 429) return new DictationError('RATE_LIMITED', 'Transcription API rate or quota limit reached.', { status, retryable: true });
  if (status === 413) return new DictationError('AUDIO_TOO_LARGE', 'Transcription API rejected the audio size.', { status });
  if (status >= 400 && status < 500 && status !== 408) return new DictationError('PROVIDER_REJECTED', 'Transcription API rejected the request.', { status });
  return new DictationError('PROVIDER_ERROR', 'Transcription API is unavailable.', { status, retryable: status === 408 || status >= 500 });
}

/** Create once on the server, then call independently for each dictation. */
export function createDictationClient(config = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw configError('Provide a configuration object.');
  const {
    apiKey,
    baseURL = 'https://api.openai.com/v1',
    model = 'gpt-transcribe',
    timeoutMs = 120_000,
    maxAudioBytes = MAX_AUDIO_BYTES,
    languageField: configuredLanguageField,
    fetchImpl = globalThis.fetch,
  } = config;
  if (typeof apiKey !== 'string' || !apiKey || /[\s\x00-\x1f\x7f]/u.test(apiKey)) throw configError('Provide a server-side transcription API key.');
  if (typeof model !== 'string' || !model.trim()) throw configError('Provide a transcription model name.');
  const languageField = configuredLanguageField === undefined
    ? (model.startsWith('gpt-transcribe') ? 'languages' : 'language')
    : configuredLanguageField;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647) throw configError('Timeout must be a positive timer-safe integer in milliseconds.');
  if (!Number.isInteger(maxAudioBytes) || maxAudioBytes < 1 || maxAudioBytes > MAX_AUDIO_BYTES) throw configError('Audio limit must be between 1 and 25,000,000 bytes.');
  if (!['language', 'languages'].includes(languageField)) throw configError('Language field must be language or languages.');
  if (typeof fetchImpl !== 'function') throw configError('Provide a fetch-compatible transport.');
  const endpoint = endpointFor(baseURL);

  async function transcribe(input) {
    const { language, prompt, signal } = optionsFor(input);
    const { blob, filename } = audioUpload(input.audio, input.filename, maxAudioBytes);
    const form = new FormData();
    form.set('file', blob, filename);
    form.set('model', model);
    form.set('response_format', 'json');
    if (language !== undefined) form.set(languageField === 'languages' ? 'languages[]' : 'language', language);
    if (prompt !== undefined) form.set('prompt', prompt);

    const timeout = new AbortController();
    const timeoutReason = new DOMException('Dictation timeout.', 'TimeoutError');
    const timer = setTimeout(() => timeout.abort(timeoutReason), timeoutMs);
    const requestSignal = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}` },
        body: form, signal: requestSignal, redirect: 'error',
      });
      if (!response || typeof response.json !== 'function') throw new DictationError('INVALID_RESPONSE', 'Transcription API returned an invalid response.');
      if (!response.ok) {
        // Do not parse or expose error bodies; they can contain patient data or keys.
        try { await response.body?.cancel(); } catch { /* Discard cleanup failures. */ }
        throw providerError(response.status);
      }
      let data;
      try { data = await response.json(); }
      catch {
        if (requestSignal.aborted) throw aborted();
        throw new DictationError('INVALID_RESPONSE', 'Transcription API returned invalid JSON.');
      }
      if (!data || typeof data.text !== 'string') throw new DictationError('INVALID_RESPONSE', 'Transcription API response has no text field.');
      if (!data.text.trim()) throw new DictationError('EMPTY_TRANSCRIPT', 'Transcription API returned no speech text.');
      // Return exactly the transcript, including negations, uncertainty and whitespace.
      return { text: data.text, model };
    } catch (error) {
      if (requestSignal.aborted) {
        if (requestSignal.reason === timeoutReason) throw new DictationError('TIMEOUT', 'Transcription API request timed out.', { retryable: true });
        throw aborted();
      }
      if (error instanceof DictationError) throw error;
      throw new DictationError('NETWORK_ERROR', 'Could not reach the transcription API.', { retryable: true });
    } finally {
      clearTimeout(timer);
    }
  }

  async function transcribeFile(filePath, options = {}) {
    const checked = optionsFor(options);
    if (typeof filePath !== 'string' || !filePath || filePath.includes('\0')) throw inputError('Provide a local audio file path.');
    let handle;
    let audio;
    let filename;
    try {
      // A FIFO must not block open() before we can reject nonregular files.
      handle = await open(filePath, constants.O_RDONLY | constants.O_NONBLOCK);
      const stat = await handle.stat();
      if (!stat.isFile()) throw new DictationError('FILE_READ_ERROR', 'Audio path must refer to a regular file.');
      checkSize(stat.size, maxAudioBytes);
      ({ filename } = uploadName(filePath));
      const chunks = [];
      let size = 0;
      // Bound actual bytes too: a caller-owned file may grow after stat().
      for await (const chunk of handle.createReadStream({ autoClose: false, signal: checked.signal })) {
        size += chunk.length;
        checkSize(size, maxAudioBytes);
        chunks.push(chunk);
      }
      checkSize(size, maxAudioBytes);
      audio = Buffer.concat(chunks, size);
    } catch (error) {
      if (checked.signal?.aborted) throw aborted();
      if (error instanceof DictationError) throw error;
      throw new DictationError('FILE_READ_ERROR', 'Could not read the local audio file.');
    } finally {
      await handle?.close();
    }
    return transcribe({ audio, filename, ...checked });
  }

  return Object.freeze({ transcribe, transcribeFile });
}
