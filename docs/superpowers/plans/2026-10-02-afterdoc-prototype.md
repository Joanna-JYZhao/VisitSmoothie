# AfterDoc prototype implementation plan

**Goal:** Deliver a runnable, polished bilingual prototype of the approved pre-visit → patient-carried visit brief → adaptive post-visit workflow within two hours of 2026-10-02 23:25 UTC.

**Architecture:** A dependency-free Node 24 local server serves a browser application and calls DeepSeek from the server. Patient state stays in browser memory. A source-linked care plan, preference, understanding status and pending questions carry through the visit. The local `.env` at the repository root is read without copying its key into client code or Git.

**Tech stack:** Native Node HTTP/fetch, HTML/CSS/ES modules, Python for local PDF/DOCX text extraction if available. No external Chrome launch. The newly authored app may be tested in the in-app browser over its own localhost URL; it must not serve the existing diagram or arbitrary workspace files.

## Global constraints

- Preserve the entire approved product journey: patient clarification; patient review; a brief shown to the clinician without clinician login; patient-imported documented plan; essential actions; preference AND complexity; concise or detailed explanations; optional bounded understanding checks; repeated questions; unresolved and clinical-review queues; professionally supplied replies and plan versioning; return-visit note.
- Real DeepSeek responses power free-text work; failures are visible, never disguised as successful AI results. Fictional demo data is labeled. No diagnosis, treatment change, inferred missing instruction or claim that a saved question was sent.
- Every extracted care item has an exact source quote. Dose, frequency, duration and timing are copied from the source or marked missing. Patient facts cite patient messages, never model-generated questions.
- Chinese default, English switch; source text retains its original language. Comfortable type, responsive layout, keyboard-visible focus, source drawer, readable errors and loading states.
- No database, no real EHR, no automatic external messaging. Only the explicitly selected model API receives user-submitted text for the current action. No key value in logs, browser, summaries, commits or tests.
- Scope is a functional browser prototype. Prototype skill's terminal/visual-variant suggestions do not replace this requested product journey. Time limit favors native runtime and scoped verification over framework setup.

## Task 1: Local backend and grounded AI contracts

Owner: backend implementer. Files: `afterdoc-prototype/server.mjs`, `afterdoc-prototype/server/agent.mjs`, `afterdoc-prototype/server/extract.py`, `afterdoc-prototype/tests/backend.test.mjs`, `afterdoc-prototype/package.json`, `afterdoc-prototype/start.sh`.

- [x] Read the backend brief and implement the specified HTTP and JSON contracts.
- [x] Add source validation, clinical decision boundary, errors/timeouts, restricted static serving and local document extraction.
- [x] Test unsupported sources, malformed JSON, path traversal, wrong origins, API failure, and positive extraction/clarification contracts. Run one real synthetic DeepSeek request after configuration is loaded.
- [x] Report evidence to `afterdoc-prototype/BACKEND-REPORT.md`; do not modify frontend files or the root `.env`.

## Task 2: Patient and clinician experience

Owner: parent. Files: `afterdoc-prototype/public/index.html`, `styles.css`, `app.js`, `fixtures.js`.

- [x] Implement persistent-in-memory journey state and bilingual UI. Design palette: ink #16384A, teal #007F79, mist #EDF5F4, white #FFFFFF, line #DDE5E7, amber #A66928. Avenir Next/PingFang for interface, Menlo for source references. Signature: a living care-note column visibly accumulates verified facts and pending questions.
- [x] Wire pre-visit free narration and one-question clarification, body-map/timeline aids, pause/skip, source-backed facts, editable summary and patient review.
- [x] Wire the patient-owned record import and a brief that can be shown to the doctor. Extract/inspect the source-linked plan before using it.
- [x] Implement essential actions, preference toggle, separate complexity assessment, optional understanding check with bounded attempts, follow-up chat routing and source drawer.
- [x] Implement saved/sent-by-patient/answered statuses, professionally supplied reply, plan versioning, and export of a return-visit note.

## Task 3: Integration, review and delivery

- [x] Start with `./afterdoc-prototype/start.sh`; verify HTTP readiness and real DeepSeek calls with synthetic data.
- [x] Walk the complete journey and both explanation branches, source-missing and clinical-review routes, optional/incorrect checks, professional response and export.
- [x] Inspect desktop and mobile layouts in the in-app browser; fix clipping and broken controls. Do not launch external Chrome.
- [x] Independently review safety-relevant grounding, credentials, UI integration and requirements. Resolve important defects.
- [x] Write README and factual verification report, commit only prototype/docs/ignore files on `codex/afterdoc-prototype`, confirm `.env` remains untracked, and leave a runnable local preview.

## Completion evidence

Backend test output + live model smoke output + exercised UI states/screenshots + committed source + local HTTP readiness. A static mock alone does not meet this objective. Clinical effectiveness, production security and hospital integration are outside a two-hour prototype and must not be claimed.

## Authorized scope clarification, 2026-10-03 00:26 UTC

The user explicitly requested a patient-facing product with no clinician entry into the system: the patient shows the pre-visit brief, photographs or imports the written instructions, and manages the post-visit workflow. They also requested Google Calendar integration interfaces and medication reminders. These replace the earlier clinician-demo workspace requirement.

- [x] Replace the clinician workspace/verification UI with patient-owned records and a doctor-facing read-only brief.
- [x] Add local macOS Vision OCR for uploaded photos; show original photo and editable OCR text; require patient confirmation before plan extraction.
- [x] Add patient-confirmed reminder scheduling with dates, chosen clock times, timezone, bounded duration, and original source. Never infer absent clinical directions.
- [x] Add Google OAuth/status/event-write interfaces, server-only tokens in memory, private default event labels, and an explicit not-configured state. No live Google connection may be claimed without credentials/authorization.
- [x] Export recurring reminders as ICS with alarm instructions; calendar delivery depends on the calendar app settings. Plan changes flag prior reminders rather than silently updating external calendars.
- [x] Test calendar contracts with synthetic transport, real local OCR, and patient-only browser workflow.

## Completion audit

The final source implements the user-authorized patient-only scope and calendar interfaces. `afterdoc-prototype/VERIFICATION.md` records 36 passing tests, real DeepSeek and local OCR checks, downloaded/read-back ICS and living-note files, responsive inspection, and limitations. Google live authorization remains explicitly unconfigured and is not claimed as tested. The app is served locally; code, documentation and ignore rules are committed separately from existing research documents and credentials.
