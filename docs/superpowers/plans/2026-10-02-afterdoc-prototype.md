# AfterDoc prototype implementation plan

**Goal:** Deliver a runnable, polished bilingual prototype of the approved pre-visit → clinician visit → adaptive post-visit workflow within two hours of 2026-10-02 23:25 UTC.

**Architecture:** A dependency-free Node 24 local server serves a browser application and calls DeepSeek from the server. Patient state stays in browser memory. A source-linked care plan, preference, understanding status and pending questions carry through the visit. The local `.env` at the repository root is read without copying its key into client code or Git.

**Tech stack:** Native Node HTTP/fetch, HTML/CSS/ES modules, Python for local PDF/DOCX text extraction if available. No external Chrome launch. The newly authored app may be tested in the in-app browser over its own localhost URL; it must not serve the existing diagram or arbitrary workspace files.

## Global constraints

- Preserve the entire approved product journey: patient clarification; patient review; clinician verification; documented plan; essential actions; preference AND complexity; concise or detailed explanations; optional bounded understanding checks; repeated questions; unresolved and clinical-review queues; professionally supplied replies and plan versioning; return-visit note.
- Real DeepSeek responses power free-text work; failures are visible, never disguised as successful AI results. Fictional demo data is labeled. No diagnosis, treatment change, inferred missing instruction or claim that a saved question was sent.
- Every extracted care item has an exact source quote. Dose, frequency, duration and timing are copied from the source or marked missing. Patient facts cite patient messages, never model-generated questions.
- Chinese default, English switch; source text retains its original language. Comfortable type, responsive layout, keyboard-visible focus, source drawer, readable errors and loading states.
- No database, no real EHR, no automatic external messaging. Only the explicitly selected model API receives user-submitted text for the current action. No key value in logs, browser, summaries, commits or tests.
- Scope is a functional browser prototype. Prototype skill's terminal/visual-variant suggestions do not replace this requested product journey. Time limit favors native runtime and scoped verification over framework setup.

## Task 1: Local backend and grounded AI contracts

Owner: backend implementer. Files: `afterdoc-prototype/server.mjs`, `afterdoc-prototype/server/agent.mjs`, `afterdoc-prototype/server/extract.py`, `afterdoc-prototype/tests/backend.test.mjs`, `afterdoc-prototype/package.json`, `afterdoc-prototype/start.sh`.

- [ ] Read the backend brief and implement the specified HTTP and JSON contracts.
- [ ] Add source validation, clinical decision boundary, errors/timeouts, restricted static serving and local document extraction.
- [ ] Test unsupported sources, malformed JSON, path traversal, wrong origins, API failure, and positive extraction/clarification contracts. Run one real synthetic DeepSeek request after configuration is loaded.
- [ ] Report evidence to `afterdoc-prototype/BACKEND-REPORT.md`; do not modify frontend files or the root `.env`.

## Task 2: Patient and clinician experience

Owner: parent. Files: `afterdoc-prototype/public/index.html`, `styles.css`, `app.js`, `fixtures.js`.

- [ ] Implement persistent-in-memory journey state and bilingual UI. Design palette: ink #16384A, teal #007F79, mist #EDF5F4, white #FFFFFF, line #DDE5E7, amber #A66928. Avenir Next/PingFang for interface, Menlo for source references. Signature: a living care-note column visibly accumulates verified facts and pending questions.
- [ ] Wire pre-visit free narration and one-question clarification, body-map/timeline aids, pause/skip, source-backed facts, editable summary and patient review.
- [ ] Wire the clinician demo workspace and document import. Extract/inspect the source-linked plan before using it.
- [ ] Implement essential actions, preference toggle, separate complexity assessment, optional understanding check with bounded attempts, follow-up chat routing and source drawer.
- [ ] Implement saved/sent-by-patient/answered statuses, professionally supplied reply, plan versioning, and export of a return-visit note.

## Task 3: Integration, review and delivery

- [ ] Start with `./afterdoc-prototype/start.sh`; verify HTTP readiness and real DeepSeek calls with synthetic data.
- [ ] Walk the complete journey and both explanation branches, source-missing and clinical-review routes, optional/incorrect checks, professional response and export.
- [ ] Inspect desktop and mobile layouts in the in-app browser; fix clipping and broken controls. Do not launch external Chrome.
- [ ] Independently review safety-relevant grounding, credentials, UI integration and requirements. Resolve important defects.
- [ ] Write README and factual verification report, commit only prototype/docs/ignore files on `codex/afterdoc-prototype`, confirm `.env` remains untracked, and leave a runnable local preview.

## Completion evidence

Backend test output + live model smoke output + exercised UI states/screenshots + committed source + local HTTP readiness. A static mock alone does not meet this objective. Clinical effectiveness, production security and hospital integration are outside a two-hour prototype and must not be claimed.
