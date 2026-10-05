# Patient dictation

The user requested an isolated, reusable dictation feature. Other engineers must be able to pass patient audio in and receive text for their existing analysis API and prompt. Their follow-up authorizes implementation with credentials supplied by the eventual caller.

## Contract

- Node.js 24+, ESM, no runtime dependencies; standalone `patient-dictation/` package.
- `createDictationClient({ apiKey, baseURL?, model?, timeoutMs?, maxAudioBytes?, languageField?, fetchImpl? })` creates a server-side client.
- `client.transcribe({ audio, filename?, language?, prompt?, signal? })` accepts Blob/File, Buffer/Uint8Array or ArrayBuffer and returns `Promise<{ text: string, model: string }>`.
- `client.transcribeFile(path, { language?, prompt?, signal? })` reads a caller-owned local file with a byte limit and returns the same result.
- Byte inputs require a filename. File names are inferred for File inputs; Blob names can be inferred from recognized MIME types. Supported extensions: mp3, mp4, mpeg, mpga, m4a, wav, webm.
- Preserve the provider's transcript exactly. Reject absent or blank transcripts; never substitute invented text. A transcription prompt is optional vocabulary/context, separate from the downstream analysis prompt.

## Transport and errors

Use multipart `POST /audio/transcriptions`, with the caller's server-side key, configurable base URL and model. Defaults follow the official OpenAI file-transcription guide: `https://api.openai.com/v1` and `gpt-transcribe`. The default language field is `languages[]` for gpt-transcribe models, `language` for other models; callers may override it for compatible providers.

Default limits: 25,000,000 audio bytes and 120,000 ms per provider request. Validate input before upload, support AbortSignal cancellation, block redirects, and return typed errors with a stable code, retryability and optional upstream status. Error messages do not echo provider bodies or secrets. No automatic retries, logs, audio persistence or transcript persistence.

## Delivery and verification

Include TypeScript declarations, CLI, environment-variable reference, and integration examples. Tests use fictional transcripts, generated WAV bytes and a local HTTP stub with real multipart parsing. They verify bytes, filename, language fields, transcript preservation, validation, error redaction, timeouts, cancellation, concurrent-call isolation, file handling and CLI behavior. No real patient audio or provider key was supplied: live transcription quality and provider-account access remain untested.

Source: https://developers.openai.com/api/docs/guides/speech-to-text (checked 2026-10-03).
