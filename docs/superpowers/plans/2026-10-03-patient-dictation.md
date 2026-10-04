# Patient Dictation Implementation Plan

> **For agentic workers:** Execute inline; use the requesting-code-review skill for an independent read-only review before delivery. The user has requested implementation in this chat.

**Goal:** Deliver a callable audio-to-text feature whose text can be handed directly to existing analysis code.

**Architecture:** An isolated ESM package owns transcription transport and input validation. A file adapter and CLI use the same client. The analysis API, prompt and credentials stay in caller code.

**Tech Stack:** Node.js 24, native fetch/FormData/Blob, node:test. No runtime dependencies.

## Global Constraints

- Worktree branch: `codex/patient-audio-transcription`.
- Preserve transcript exactly; no diagnosis, summarization, fake transcription or persistence.
- API key is injected by caller; no secret copying, key creation or live paid calls in this implementation.
- Default upload limit: 25,000,000 bytes. Default provider-request timeout: 120,000 ms.

## Task 1: Callable client and file adapter

Files: `patient-dictation/index.mjs`, `patient-dictation/index.d.mts`, `patient-dictation/package.json`, `patient-dictation/tests/dictation.test.mjs`.

Produces: `createDictationClient(config)`, `DictationError`; client methods `transcribe(input)` and `transcribeFile(path, options)`, both returning `{ text, model }`.

- [x] Create tests for a real local multipart upload, exact text passthrough, configurable model/base URL and language-field mapping; validate that they fail before the module exists.
- [x] Implement the transport, bounded file reader, validation and typed errors from the design contract.
- [x] Verify bad inputs do not reach the provider; verify auth/rate-limit/provider errors, malformed responses, timeout, cancellation and concurrent calls.

## Task 2: CLI and integration handoff

Files: `patient-dictation/cli.mjs`, `patient-dictation/README.md`, `patient-dictation/.env.example`, `patient-dictation/tests/cli.test.mjs`.

Consumes: the client from Task 1. Produces: CLI text/JSON output and documented server-side dictation-to-analysis integration.

- [x] Add CLI help, file argument, language, transcription prompt and JSON options; accept credentials only through server-side environment configuration.
- [x] Verify CLI success against the local HTTP stub and sanitized failures with a nonzero exit code.
- [x] Document Blob/File/bytes/file input, TypeScript types, configurable compatible providers, cancellation and error codes; distinguish uploaded completed recordings from live streaming.

## Task 3: Verification and review

- [x] Run `npm test` in `patient-dictation` and the existing application test suite once.
- [x] Verify package exports and `npm pack --dry-run`, check the diff for unintended application edits and secrets.
- [x] Request an independent read-only code review; fix substantive findings and rerun affected checks.
- [x] Record exact verification results in `patient-dictation/VERIFICATION.md`, commit the feature, and hand off the branch and public usage example.
