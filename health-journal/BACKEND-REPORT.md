# Backend implementation report

Status: complete for the agreed local-journal API, including the subsequent metadata, concise-brief, timezone, source-snapshot and saved-PDF requirements.

## Implemented

- Native Node 24 HTTP server, loopback-only launcher, dependency-free API, SQLite WAL persistence with full synchronization and transactional optimistic revisions.
- Independent `real` and `demo` dataset rows. Demo is explicitly fictional, contains no fake model outputs, and uses relative dates. Reset preserves a monotonically increasing revision so a pre-reset request cannot overwrite fresh records.
- Profile, settings, episode creation/correction, patient entry creation/correction, AI reflection, brief drafting/reviewed immutable versions, visit outcomes/corrections, local-only check-in preferences, JSON export and dataset reset.
- Host/Origin/cross-site guards; JSON-only bounded mutation requests; input validation; static public-directory confinement with traversal/symlink rejection; no credential/source exposure; restrictive CSP and no-store responses.
- DeepSeek configuration stays server-side and is loaded safely from `.env` only when explicitly starting the server. Importing `createServer` neither reads `.env` nor starts listeners. Provider transport is injectable for tests. AI failures are sanitized and never manufacture successful assistant messages. Requests have bounded context, response size, timeout and per-episode overlap protection; changed global revisions reject stale responses.
- Current facts require exact substrings of current patient entries. Assistant/history/profile quotations cannot become current facts. The server builds factual brief prose from selected quotations, patient-selected dates/severity, patient profile/questions and explicitly separated patient-entered visit outcomes. The model does not write the brief narrative.
- Compact briefs include up to six chronological entry anchors including first/latest/highest reported intensity, up to four nonduplicative extra quotations, medicines/allergies even when unknown, bounded history and explicit omissions/shortening notices. Main content is capped at 6,000 characters plus the explanatory footer; full source snapshots stay available. Timestamp output uses a validated optional browser `timeZone`, default UTC, explicitly named in the text.
- The saved-PDF endpoint delegates to the parent's `server/pdf.mjs` renderer and reads only a persisted reviewed brief in the selected dataset. It cannot render request-supplied text.

## Stable contracts

- `PATCH /api/episodes/:id` additionally accepts `category` and `startedAt`, using the creation validators.
- `POST /api/episodes/:id/brief-draft` additionally accepts optional `timeZone` (IANA timezone).
- Drafts and saved briefs include `sourceEpisode`:

```js
{
  title, category, startedAt, patientQuestions, relatedIds, visits,
  history: [{ id, title, startedAt, visits }]
}
```

`history` contains explicitly linked episodes in `relatedIds` order; visit arrays are complete snapshots. Use `sourceEpisode`, `profileSnapshot` and patient `sourceEntries` to determine saved-brief staleness. Assistant messages and newly saved briefs do not appear in `sourceEpisode`. `sourceRevision` is the captured global integer state revision; an intervening mutation rejects saving a draft, requiring regeneration.

- `GET /api/episodes/:episodeId/briefs/:briefId/pdf` returns `application/pdf`, with attachment filename `health-journal-vN.pdf`.
- `createServer({ dbPath, publicDir, modelTransport, aiConfig, aiTimeoutMs, pdfRenderer })` returns an ordinary Node HTTP server. Tests bind it to loopback port 0. Closing it closes SQLite.

## Verification executed

Command:

```sh
/Users/xinlu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/backend.test.mjs
```

Final result: **16 tests passed, 0 failed, 0 skipped**. Runtime approximately 0.21 seconds. Loopback listeners required execution outside the filesystem/network sandbox after its initial `listen EPERM`; the approved rerun passed. Tests use temporary isolated databases, synthetic text and injected transport; no real provider requests or real records were used.

Covered durable reopen; dataset isolation; date/severity/settings validation; category/onset correction; stale revisions; recorded versus selected timestamps; grounded AI reflection; immutable brief snapshots after source correction; frozen metadata/history; demo reset; secret-free JSON export; monotonic reset; host/origin/cross-site/static traversal/symlink/JSON/body/CSP protections; hallucinated/assistant/history quote rejection; missing AI configuration; sanitized provider failure; AI timeout; overlapping/stale AI response rejection; historical outcomes remaining separate; compact templates; timezone conversion; no delivery claim; provider request shaping; and persisted-brief-only PDF routing.

Syntax checks for `server.mjs` and `server/ai.mjs` also passed. Parent owns the actual PDF-rendering smoke/visual checks and live synthetic DeepSeek/browser verification.

## Limits retained deliberately

- This is a local personal application without accounts, cloud synchronization or email delivery. Stored email preferences do not enable sending; reminders always persist `enabled: false`.
- Entries are saved independently before explicit AI calls. AI question output is constrained by instructions, a question-format check and conservative unsafe-output patterns; that is not a clinical validation or comprehensive triage system. Emergency guidance is a conservative reminder, and the UI provides the always-visible general urgent-help information.
- Context selection is bounded for long journals. Brief text explicitly identifies selections and shortening; the original entries are retained in snapshots and exports.
- Storage files are private-permission local SQLite files, not application-encrypted vaults. The user's filesystem/OS security remains relevant.
- The same global revision protects draft saves, so even an unrelated intervening edit conservatively requires a fresh draft.

No edits to `public/`, existing AfterDoc, Git branches, worktrees or commits were made by this backend task.

## Final review fixes

- Corrected current and linked visit selection to sort by the patient's validated visit date, not array insertion order. Backfilled earlier visits no longer replace the actual most recent dated visit. Date corrections change the chosen outcome. If all dates are unknown, the selected record is explicitly labelled as the most recently entered undated visit. Model historical context uses the same date ordering; persisted arrays remain unchanged.
- Explicitly set DeepSeek `thinking: { type: 'disabled' }` and `max_tokens: 4000` for these bounded extraction tasks, with prompt limits of 16 facts and 160 characters per quotation. The official [Thinking Mode documentation](https://api-docs.deepseek.com/guides/thinking_mode/) confirms thinking is enabled by default and supports this explicit switch. Parent diagnosed the intermittent real-provider incomplete output; live retesting remains parent-owned.
- Added chronology regression coverage for backfill, corrected dates and all-undated records, plus assertions for the outgoing provider configuration. Reran the same backend command: **17 tests passed, 0 failed**.
