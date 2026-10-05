export type DictationErrorCode =
  | 'INVALID_CONFIG' | 'INVALID_INPUT' | 'EMPTY_AUDIO' | 'AUDIO_TOO_LARGE'
  | 'UNSUPPORTED_FORMAT' | 'FILE_READ_ERROR' | 'AUTH_FAILED' | 'RATE_LIMITED'
  | 'PROVIDER_REJECTED' | 'PROVIDER_ERROR' | 'INVALID_RESPONSE'
  | 'EMPTY_TRANSCRIPT' | 'NETWORK_ERROR' | 'TIMEOUT' | 'ABORTED';

export class DictationError extends Error {
  readonly code: DictationErrorCode;
  readonly retryable: boolean;
  readonly status?: number;
  constructor(code: DictationErrorCode, message: string, options?: { status?: number; retryable?: boolean });
}

export interface DictationConfig {
  /** Server-side key for a provider that supports audio transcription. */
  apiKey: string;
  /** API root including /v1 when required, not the full endpoint. */
  baseURL?: string;
  model?: string;
  /** Provider-request timeout; default 120000 ms. */
  timeoutMs?: number;
  /** Integer from 1 to 25000000; default 25000000 bytes. */
  maxAudioBytes?: number;
  /** Default languages for gpt-transcribe models, language otherwise. */
  languageField?: 'language' | 'languages';
  fetchImpl?: typeof fetch;
}

export interface DictationOptions {
  /** Optional input-language hint; omitted means provider auto-detection. */
  language?: string;
  /** Optional transcription context; separate from the analysis prompt. */
  prompt?: string;
  signal?: AbortSignal;
}

export interface DictationInput extends DictationOptions {
  audio: Blob | Uint8Array | ArrayBuffer;
  /** Required for byte inputs; inferred from File.name or recognized Blob MIME. */
  filename?: string;
}

export interface DictationResult {
  /** Exact provider transcript in its original language. */
  text: string;
  model: string;
}

export interface DictationClient {
  transcribe(input: DictationInput): Promise<DictationResult>;
  transcribeFile(filePath: string, options?: DictationOptions): Promise<DictationResult>;
}

export function createDictationClient(config: DictationConfig): DictationClient;
