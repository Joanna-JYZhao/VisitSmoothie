# AfterDoc independent implementation review

Reviewed the supplied `/private/tmp/afterdoc-review.diff`, current application source, the approved implementation plan, `BACKEND-BRIEF.md`, and `BACKEND-REPORT.md`. Scope is a local two-hour communication prototype, not clinical efficacy, production readiness, or EHR integration. No browser/server was started, no existing backend suite was rerun, and no `.env` or credential values were inspected. Parent is performing live UI verification independently.

## Final export and reminder-state check

**Scoped spec and code-quality verdict remain pass; no blocker found in the last changes.** Inspected `server.mjs:113-127`, `public/app.js:130-131,224-228,257`, and the new export regression without executing tests or using the browser/network.

- Export creation uses the existing bounded JSON reader and local Host/Origin checks. Calendar content is generated through the validated calendar contract; note content is bounded. Filenames and attachment types are fixed by the server, and download identifiers address an in-memory map rather than filesystem paths.
- Downloads use random UUID links, attachment headers, existing no-store/nosniff headers, at most ten cached exports, and an enforced ten-minute access expiry. Expired entries are pruned when a later export is created. This is temporary server-memory export content, with no new disk persistence.
- `offerDownload` exposes a visible, escaped download link and correctly reports the file as prepared, rather than claiming that a download already completed. The note and calendar actions both use this path.
- Supplement-only replies retain the same clinical plan and migrate reminders from the immediately preceding version. Full plan replacement leaves prior reminders on their old version, so the existing stale-reminder warning and current-version export filter apply.

The parent reports **36/36 final tests passed** and successful browser download plus content inspection of both the note and calendar files. These are parent-provided execution results; this final check independently reviewed the implementation and regression source. Live Google OAuth/calendar write remains untested without configured credentials.

## Expanded scope: patient-only, photo OCR, and calendar interface

The user has superseded the clinician-workspace requirement: the patient shows a pre-visit brief, uploads/photographs written instructions, reviews recognized text, and manages follow-up. Google Calendar integration endpoints plus portable reminder export are in scope. A configured/live Google account is not claimed.

**Final scoped spec verdict: passes the patient-only/OCR/calendar-interface code review. Final scoped code-quality verdict: passes, with all five findings from this addition resolved.** No remaining material blocker was found in the repaired paths. The patient-only flow is implemented without a clinician review checkbox. Photo extraction runs locally with bounded subprocess execution, temporary-file cleanup, and a text-review step. Google state/PKCE and memory-only credentials are present; event details are opt-in, writes require confirmation, and `.ics` reminders use bounded recurrence. No direct key/token exposure was found in inspected response/static/UI paths.

This is approval of the implemented local interface and reviewed fixes, not a claim of a live Google integration test or general clinical schedule understanding. Full-suite execution and final OCR/calendar browser evidence are owned by the parent; the final export/state check above records the latest supplied results.

| Addition finding | Final status | Fix inspected |
| --- | --- | --- |
| A. Conditional/ranged schedules | Resolved | `public/calendar.js:2-18` uses full-string frequency/duration patterns. `conditionalSchedule` rejects the flagged PRN/taper/alternate schedules, and `public/app.js:107` checks the original source quote before offering medication reminders. Regression cases cover as-needed, ranges, fractions, and conditional source text. |
| B. OCR confirmation bypass | Resolved | `public/app.js:231` preserves `ocrPending` across appends with OR, clears review on every append, and retains all original photos in `photoPreviews`. The record view renders all previews; edits invalidate review, and extraction still checks it. |
| C. Cross-account refresh-token reuse | Resolved | `server/calendar.mjs:12,23` replaces tokens on new authorization; refresh alone retains the current refresh token. The account-switch regression verifies that the new account without refresh permission expires without refreshing the previous account. |
| D. Privacy changes on duplicate saves | Resolved | `server/calendar.mjs:36` PATCHes the explicitly confirmed event payload on a 409, including summary and description. The new regression checks that re-saving with generic privacy removes the medication title and instruction text. |
| E. Omitted timezone accepted | Resolved | `public/calendar.js:26` requires a nonempty string before timezone validation; the missing-timezone regression is present. |

The following descriptions retain the original addition findings as history; they no longer describe the current repaired paths.

### A. Conditional/ranged medication schedules become fixed daily reminders (P1)

- Locations: `public/calendar.js:2-12`, `public/app.js:106-107`.
- The frequency and duration parsers match substrings. New pure helper checks returned `dailyFrequency('once daily as needed') = 1`, `dailyFrequency('每日2次，按需服用') = 2`, `durationDays('3-5 days') = 5`, and `durationDays('1.5 days') = 5`.
- The dialog accepts these as complete daily courses even though its own UI says as-needed and interval schedules are not automatically scheduled. This can create an incorrect fixed reminder series.
- Require unambiguous supported frequency/duration strings and reject as-needed, conditional, taper, interval, and ranged instructions in the source item before enabling daily scheduling. Preserve the source and direct the patient to clarify unsupported schedules.

### B. A later non-photo upload bypasses pending OCR confirmation (P2)

- Location: `public/app.js:230`.
- Upload a photo, leave its recognition unchecked, then append a TXT/PDF. The existing OCR text remains in `draftPlanText`, but `ocrPending` becomes false because it is assigned from only the newest document. The confirmation checkbox disappears and extraction proceeds.
- Multiple photo appends also retain only the newest photo preview, so one confirmation cannot be meaningfully checked against all retained photo text.
- Preserve pending review per photo and show the corresponding originals, or require each photo's confirmation before appending it to the approved draft. A non-photo upload must not clear pending OCR review.

### C. Reauthorization can reuse another account's refresh token (P1)

- Locations: `server/calendar.mjs:12`, `server/calendar.mjs:23-24`.
- `tokenRequest` merges the previous token object for both a new authorization and a refresh. If a new account's authorization response lacks a refresh token, the earlier account's refresh token survives.
- A new injected-transport test authorized account A with a refresh token, authorized B without one, then expired B. The next write refreshed with A's token (`previousAccountRefreshReused: true`). This may target the wrong account.
- Replace the token object on a new authorization. Only preserve a refresh token during refresh of the same session/account. Test a second authorization that does not return a refresh token.

### D. Duplicate saves report success without applying changed privacy/content (P2)

- Location: `server/calendar.mjs:35-38`.
- A 409 retrieves the existing event and marks it saved without comparing or updating the event content. Reminder IDs stay stable while the patient's include-details preference can change.
- A new injected-transport test saved with details, then saved the same reminder with generic privacy settings. It returned `allSaved: true` while the remote event still contained the medication title (`remoteTitleStillSensitive: true`).
- On conflict, update the existing event to the explicitly confirmed payload, or detect differing content and clearly report that the current settings were not applied. Idempotency must not conceal payload changes.

### E. Calendar validation accepts an omitted timezone (P2)

- Location: `public/calendar.js:21`.
- `Intl.DateTimeFormat` uses the host default when `timeZone` is undefined, so the validator accepts it. A pure helper check confirmed `missingZoneAccepted: true`; `.ics` subsequently emits `TZID=undefined`.
- Require a nonempty timezone string before checking it with `Intl`. Explicit dates, times, and timezone are part of the patient confirmation contract.

Addition verification performed here: initial source inspection and new pure/injected-transport checks described above, followed by focused inspection of all five fixes and their regression tests. The earlier defect reproduction outputs are historical. No server/browser was started, no Google request was made, and no `.env` or real token was read. Existing tests were read, not rerun. Actual OCR and patient-only browser verification remain the parent's execution responsibility.

## Prior-scope verdict after scoped rereview

**Spec compliance: passes the scoped code review for the approved local prototype.** All six original findings below are resolved in the current implementation. The intended intake → clinician source plan → adaptive support → professional reply/version/export journey is implemented. Final live replacement/export and responsive UI evidence remains owned by the parent; this verdict does not claim independently repeated browser verification.

**Code quality: passes the scoped rereview, with no remaining material blocker found in the six repaired areas.** The fixes preserve exact source access, invalidate stale review state, separate longer source records from capped chat messages, derive essential missing-field markers, and enforce the provider deadline through body consumption. The extracted `journey.js` state transitions make version preservation and source resolution directly testable.

| Original finding | Status | Evidence inspected in current source |
| --- | --- | --- |
| 1. Essential directions hidden in brief mode | Resolved | `public/app.js:104` now renders the exact `sourceQuote` for **all** item kinds outside the preference condition, including medication-specific instructions such as do-not-crush. The final medication exclusion removal was rechecked directly. |
| 2. Broken historical citations and inaccessible versions | Resolved | `public/journey.js:2-25` captures the preceding version's understanding checks, patient markers, and review flag before replacement; deep-cloned new snapshots contain the matching plan and sources. `findDocument` searches current, intake, and archived sources. `public/app.js:229` opens historical versions; `public/app.js:199-205` exports prior plans and statuses with an explicit historical label. |
| 3. Stale clinician review after corrections | Resolved | `markPatientCorrection` clears both patient and clinician review; new narration/import notices and direct fact edits call it (`public/app.js:123`, `public/app.js:263`). |
| 4. Long intake imports poison chat | Resolved | Imports are retained in `intake.records`, and chat receives a short record notice (`public/app.js:193`). Intake submits records separately (`public/app.js:126`); backend validates those records under the document contract (`server.mjs:128-130`) and validates source IDs/quotes independently from patient speech. |
| 5. Missing essential clinical fields unmarked | Resolved | `server/agent.mjs:99-108` derives missing dose/frequency/duration for medication independently of the model missing list, validates present timing, filters inapplicable missing labels by kind, and retains explicit missing test preparation. Unspecified medication timing is also shown as not recorded in the UI. |
| 6. Timeout excludes response body | Resolved | `server/provider.mjs:28-87` races both fetch and body reading against one deadline, aborts on expiry, classifies body-stage aborts as timeouts, and clears the timer only in the outer finally. |

Rereview evidence: read the changed implementation and the targeted regression coverage in `tests/backend.test.mjs` and `tests/journey.test.mjs`. The parent reports **24 combined tests passed**, including 20 backend tests; this review did not rerun them or start a server. Parent also reports live synthetic DeepSeek/UI verification through intake, clinician review, extraction, both preference modes, sourced answers, mismatch→matched and skipped checks, source-missing/clinical routes, and saved/sent/replied states. These execution claims are attributed to the parent, not to this independent code inspection.

## Original findings (historical; all resolved above)

### 1. Essential directions disappear in brief mode (P1)

- Location: `public/app.js:101`, with concrete fixtures at `public/fixtures.js:17-18`.
- `careItem` renders `item.timing || item.details`, then exposes explanation/details only in the detailed preference. A nonempty timing suppresses all non-timing instructions in the normal brief view.
- The provided follow-up fixture consequently shows the visit date but hides the requirement to bring medicine packaging and the record. The test fixture likewise hides the requirement to consult the appointment slip for preparation.
- This contradicts the approved requirement that essential actions remain available regardless of explanation preference. Keep source-backed execution instructions in the brief action card; reserve the preference switch for additional explanation.

### 2. Plan replacement breaks historical citations and exposes no usable version history (P2)

- Locations: `public/app.js:138-139`, `public/app.js:172-174`, `public/app.js:184-185`, and version rendering in `public/app.js:109`.
- Replacing a plan discards `state.documents` in favor of the new record, while prior chat messages and their citation buttons remain. `showSource` only searches the current documents. Clicking an old citation yields a message saying to consult the prior version, but versions are plain labels without a view action.
- Snapshots also label the newly created version while storing the preceding plan; the initial snapshot has no plan. The return note exports only the current plan and omits prior versions and prior understanding/arrangement status.
- Keep explicit version snapshots with the matching plan, sources, and relevant patient status; expose a read-only version view and resolve archived citation IDs there. Export sufficient history to preserve the original plan after replacement.

### 3. Clinician review remains valid after the underlying patient facts change (P2)

- Locations: `public/app.js:120` and `public/app.js:252`.
- New patient narration and direct fact edits clear `state.intake.reviewed` but leave `state.doctorReviewed` true. Reproduction: mark clinician review in the doctor workspace, return to preparation and change a fact, then inspect the doctor workspace or living note.
- The revised history is still represented as clinician reviewed even though it differs from the reviewed content. Invalidate the clinician review whenever intake evidence/facts are changed, or attach review status to a specific immutable revision.

### 4. Longer supported records poison the intake conversation (P2)

- Locations: `public/app.js:191`, `server.mjs:127`, `server/extract.mjs:46`.
- Document extraction accepts up to 30,000 characters, but pre-visit import inserts the entire extracted record into one user message. Intake rejects any message above 5,000 characters.
- A 6,000-character supported TXT/PDF/DOCX therefore extracts successfully, is appended to the conversation, and then fails the next agent call. Retry and subsequent questions still include the oversized message, so the session remains blocked.
- Pass imported documents separately with source IDs, or apply a clear, recoverable limit before appending them. Do not silently truncate clinical source text.

### 5. Missing clinical fields can be accepted without any missing marker (P2)

- Location: `server/agent.mjs:70-75`.
- The validator adds a missing marker only when a nonempty field fails source validation. Empty or omitted frequency/duration/timing values rely entirely on the model to supply the `missing` array.
- A new, pure-validator synthetic check supplied `Medicine A: 1 tablet.` with empty frequency/duration/timing and `missing: []`. Actual output was `missing: []`, `complexity: {level: "low", reasons: []}`.
- This contradicts the contract that absent directions are marked missing, and can hide uncertainty and understate complexity. Derive relevant missing clinical fields from the normalized result, independent of the model's own missing list; define applicable fields per item kind.

### 6. Provider timeout ends at response headers instead of completed body (P2)

- Locations: `server/provider.mjs:34-55`, `server/provider.mjs:64`.
- `fetch` resolves on headers, then the `finally` clears the timer before `response.json()` consumes the body. A delayed or stalled body is no longer covered by the advertised 45-second provider timeout.
- A new synthetic fetch stub returned headers immediately and its body after 60 ms; calling `completeJson` with a 10 ms timeout still resolved successfully after 62 ms. This did not contact any service or load configuration.
- Keep the abort timer until the response body is consumed and parsed; classify an abort during body consumption as a timeout. The frontend's separate 65-second timeout does not cancel this backend work.

## Accepted boundaries and remaining evidence

- Exact quote checks establish that cited text exists. They do not prove every paraphrase follows semantically from that text; `BACKEND-REPORT.md` already acknowledges this, and it should remain a stated prototype limitation.
- User-entered professional replies are explicitly labeled as unverified identity. Saved questions are distinguished from patient-reported sending; no automatic external messaging was found.
- The original scope permitted an OCR fallback; the expanded scope above now implements local photo OCR. A database, persistence, authenticated clinician identity, and production security review remain outside this task.
- Responsive visuals, keyboard/focus behavior, live full-journey completion, actual export download, and screenshots remain the parent's UI verification responsibility.

Parent was notified of all six original findings and the medication-specific remainder discovered during rereview. The current verdict above covers the subsequent fixes inspected in source; the original finding descriptions are retained as review history.
