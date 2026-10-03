# Verification record — 2026-10-02 / 03

This records executed prototype checks using fictional data. It is not clinical validation, a production readiness claim, or evidence of a real Google account connection.

## Automated verification

**36 tests passed, 0 failed, 0 skipped.** Executed with the bundled Node 24 runtime and approved access to localhost sockets and native macOS Vision. Final suite includes:

- Exact source quotes; rejection of fabricated provenance, assistant-origin patient facts and unsupported clinical fields.
- Missing medication directions, appropriate missing-field categories, normalized plan kinds, exact-source warnings and separate complexity assessment.
- Explicit stop/skip/new-symptom routing and no decision forwarding on the clinical-review route; uncertainty cannot pass understanding checks.
- Malformed/upstream failures, full-response model deadline, Host/Origin/path restrictions.
- Separate long intake records, TXT, DOCX and text-based PDF extraction.
- Real local OCR of synthetic English/Chinese labels, rotated JPEGs, invalid/blank images and required-review metadata. Additional backend smoke checks covered WebP and HEIC.
- Immutable plan/source versions, archived patient checks/markers and review invalidation.
- Calendar recurrence, local timezone, private defaults, alarms, text escaping, UTF-8 line folding and invalid dates.
- Exclusion of conditional/PRN, fractional and ranged schedules; missing timezone rejection.
- Mocked Google OAuth state/PKCE, explicit write confirmation, stable event IDs, account switch isolation and applying changed privacy settings to an existing event.
- HTTP attachment downloads with exact note/calendar content and rejection of unknown download tokens.

Command: `node --test tests/*.test.mjs` from this directory. Tests of Google use an injected transport and synthetic tokens; they do not contact Google or write an actual calendar.

## Real model and browser checks

The local app ran at `http://127.0.0.1:4173/`. All browser work used the Codex in-app browser; no external Chrome was launched.

| Flow | Observed result |
| --- | --- |
| Ordinary patient language → clarification | Real DeepSeek selected episode/body-location/timeline aids across runs; retained an approximate onset and “cannot remember exact date.” |
| Stop and patient review | Stopping produced a summary-ready message; facts kept original quotes. Patient could edit and confirm the brief. |
| Show the clinician | The patient-owned dialog displayed the reviewed summary, quotes and uncertainties. No clinician login or clinician checkbox remains in the final UI. |
| Long record upload | A 7,173-character fictional TXT produced real, source-linked facts without exceeding the chat-message limit. |
| Photo → plan | A synthetic Chinese instruction image was OCRed locally, shown beside editable text, and blocked from extraction until the patient review checkbox was selected. Real DeepSeek then produced sourced medication, follow-up and additional instruction cards. |
| Essential directions | “Swallow whole; do not crush,” bring-packaging requirements and missing preparation instructions remained visible in brief mode. Detailed mode added explanations. |
| Understanding | An incorrect once-daily answer against a twice-daily instruction returned mismatch; a corrected answer returned matched. Skip remained skipped. Checks are bounded to two attempts. |
| Sourced explanation | A medicine-schedule question returned the original doses/schedules with working highlighted citations. |
| Missing answer | The missed-dose question returned source-missing and a saved, explicitly not-sent professional question. |
| New decision | “I feel better; can I stop?” returned the no-decision boundary and a professional-review question. |
| Professional response | User-entered reply source was retained. Saving a reply without explicitly resolving the question kept it open. Marking a reply as a full new plan triggered real extraction and a new version. |
| Versions | V1–V3 could be viewed; old chat citations still opened the old original record. New clinical plans reset current checks. Historical patient markers remained visible. |
| Reminders | The patient chose 2026-10-03, 08:00 and 20:00, Asia/Shanghai, for a source-specified five-day medicine course. The UI distinguished local settings from actual Google writes. |
| Google interface | Real local status showed interface-ready / not-configured / not-connected. Setup entry listed the required configuration names and callback. No live Google success was claimed. |
| ICS download | Downloaded `AfterDoc-reminders.ics` and read it back. Verified two private series, Asia/Shanghai, COUNT=5 and VALARM at each event time. Medicine names were absent by default. |
| Note download | Downloaded `AfterDoc-visit-note.txt` and read it back. Verified original instructions, previous-plan section, patient markers, reminder settings, open questions, professional source and unverified-author labeling. |

The initial Blob download did not yield a confirmed file in the in-app browser. It was replaced with an explicit short-lived HTTP attachment link. Both final file types were then downloaded successfully. Exports are generated on demand, kept in bounded server memory and not written to an application database.

## Visual and independent review

Desktop 1360×960 and mobile 390×844 views were inspected. The mobile page reported a document width equal to its viewport, without horizontal overflow. The UI has Chinese/English controls, source dialogs, visible loading/errors and keyboard focus styles. Local proof images are in `test-artifacts/` (ignored by Git).

Independent code review found and resolved six initial issues and five additional calendar/OCR issues. `REVIEW.md` distinguishes independent source inspection from the execution evidence recorded here.

## Remaining limits

- Google OAuth interfaces and transport tests are implemented; real Google authorization/write behavior remains unverified until OAuth credentials and user authorization exist.
- Calendar delivery depends on the receiving calendar app and notification permissions. The app does not provide closed-page/background push reminders.
- No real mobile camera hardware was used; the photo button and upload path were exercised with synthetic images in the desktop in-app browser.
- OCR can misread text; exact-source validation does not prove semantic or clinical correctness. Scanned PDF OCR and non-macOS image OCR are not implemented.
- Patient state is ephemeral; professional identities are not authenticated; saved questions are not sent automatically. Clinical plan replacement does not automatically delete or modify calendar events already exported.
- No real patient data was used for verification. `.env`, runtime caches, screenshots and downloads are excluded from the source commit.
