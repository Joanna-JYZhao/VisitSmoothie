# Verification — 2026-10-02 (America/Los_Angeles)

## Automated checks

Final command, from this directory:

```sh
/Users/xinlu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/*.test.mjs
```

**33 passed, 0 failed, 0 skipped.** Tests ran against temporary databases with injected AI responses. Local listener tests required an approved sandbox escalation.

Coverage includes durable SQLite reopen, real/demo isolation, validation, optimistic revisions, timezone/date handling, exact-source grounding, hallucination rejection, immutable snapshots, metadata/history changes, provider failure/timeout, overlapping/stale AI responses, current versus historical outcomes, backfilled/corrected visit chronology, request security and static-file boundaries, persisted-only PDF rendering, frontend async navigation races, dataset switching, draft preservation, modal lifecycle, focus restoration and bilingual PDF generation.

## Browser and live AI checks

The app served on `127.0.0.1:4187`. Destructive/development data checks used an independent test server on port 4189 and `/private/tmp/health-journal-ui-test.sqlite`. All health text entered by the agent was explicitly fictional. The actual user dataset was not populated with QA data.

Executed in the Codex in-app browser:

- Edited the fictional profile; saved and reloaded it successfully.
- Created an English symptom episode; a real DeepSeek call returned a clarifying question and exact quoted facts.
- Added updates with reported intensity; verified precise current-time storage when an optional time was blank.
- Opened earlier history, selected it for inclusion, added a doctor question, generated/reviewed/saved a brief, and read the copied clipboard text.
- Saved a patient-entered fictional clinician outcome and archived the episode.
- Switched to Chinese, created a new episode, opened the earlier archived result and linked it as history.
- Generated a real Chinese DeepSeek brief after the final transport fix; reviewed and saved it. The brief correctly included selected historical outcome, unknown medicines, original-language allergy text and the browser timezone.
- Opened the doctor display and verified the selected saved version and fictional-data label.
- Returned from demo to the real dataset and reloaded; it remained empty and English-default.
- Checked desktop at 1366 × 900 and mobile at 390 × 844. Both had document width equal to viewport width; screenshots show no page-level horizontal overflow. The mobile navigation is horizontally scrollable. Temporary viewport overrides were reset.
- No browser warning/error logs were reported in the final observed app state.
- WebMCP navigation successfully opened Today; an invalid `view` was rejected. It cannot modify records.

Screenshots: [desktop](./verification/desktop.jpg), [mobile](./verification/mobile.jpg).

## Actual PDF output

The saved Chinese brief was fetched through its real `GET /api/episodes/:id/briefs/:id/pdf` endpoint. It produced a one-page PDF. PyPDF extracted the Chinese symptom text, English history and timezone correctly. Poppler rendered the file; visual inspection confirmed legible bilingual text, complete sections, no clipped content, fictional-data label and page footer. A separate bilingual renderer smoke file also passed extraction and visual inspection. Longer briefs may span multiple pages.

The browser download button was exercised and its request/blob/filename behavior is covered by the frontend regression. The in-app browser's download-event observer timed out without exposing a downloaded-file path, so an operating-system save from that browser is **not independently confirmed**. The served PDF bytes and rendered file were verified separately. Native printing likewise was not verified; direct PDF export is the primary path.

## Review and resolved findings

An independent review found that choosing `visits.at(-1)` could label a backfilled older visit as the latest. Fixed by visit-date ordering, with explicit handling of undated records; regression tests cover backfill and corrected dates.

Frontend review found cross-episode async response and dataset-switch risks. Operation context is now captured, per-dataset drafts are preserved, inputs lock during pending saves and snapshots include linked history/visit changes. Fourteen focused frontend regressions pass.

A live AI generation returned an incomplete response during QA. Diagnostic metadata showed reasoning consuming most of the old 2,200-token budget. The transport now explicitly disables thinking for its bounded extraction task and allows 4,000 output tokens, consistent with [DeepSeek's request documentation](https://api-docs.deepseek.com/api/create-chat-completion/) and [thinking-mode guide](https://api-docs.deepseek.com/guides/thinking_mode/). A subsequent live Chinese generation succeeded. These checks verify integration, not clinical reliability.

## Remaining boundaries

- Email delivery, online scheduling, cloud accounts and sync were deferred by the user. Check-in dates do not send background notifications.
- Changing unrelated state, including interface language, invalidates an unsaved brief draft conservatively. The draft text remains visible for copying before regeneration.
- JSON backup export has no in-app import/restore flow.
- This is a local communication prototype, not a clinically validated decision system. AI calls need internet and a functioning provider account.
- Existing AfterDoc source and its pre-existing review/verification edits were left untouched. No Git commit or external deployment was performed.

The delivery server remains running on port 4187. The isolated QA server was stopped after verification.

## Agentic workflow extension — 2026-10-02

Final implementation-worker run of the same full test command: **49 passed, 0 failed, 0 skipped**. New coverage includes bounded planning, source rejection, urgent-provider bypass, repeated-source reuse, persisted drafts, restart interruptions, explicit retry lineage, atomic reviewed saves, reset during provider work, dataset isolation and retention, stale history-response races, and bilingual completed-versus-waiting status. These are injected-provider tests; they are not clinical validation.

Independent task review identified a contradictory brief prompt and a stale history GET overwriting a newer run. Both were fixed with relevant regression coverage. A browser check found completed briefs still displaying a pending-review instruction; the result text and bilingual regression were corrected. Scoped independent re-reviews passed spec and quality for all three fixes.

Actual integration checks used only explicitly fictional data in `/private/tmp/health-journal-workflow-test.sqlite` on port 4189. All browser interaction used **Codex's in-app browser**, not Chrome:

- Real DeepSeek chose a follow-up for an initial fictional symptom entry; all six completed steps and the waiting-patient state appeared in the UI.
- After a patient update, DeepSeek selected `finish_tracking`; no extra question was added, and the previous run was marked as based on older sources.
- The QA service was restarted after transport/prompt fixes. Existing run history survived.
- Real DeepSeek generated an English brief with exact patient quotations and explicit unknown fields. The run paused at `waiting_review`.
- A fresh browser tab found the durable run and recovered its saved draft. Saving after review appended the seventh `patient_review` step and changed the run to completed. Reload preserved both reviewed brief v1 and the completed trace.
- English and Chinese completed-state labels were verified. At 390 × 844, the Chinese workflow panel was readable and document width equaled the 390-pixel viewport. Viewport overrides were reset.
- No warning/error console entries were reported in the final inspected app state.
- The diagram page rendered its SVG and Chinese workflow description in the in-app browser. The saved offline HTML embeds the same SVG and styling. Archify's initial automatic-layout checks failed; those diagnostics are retained, and the final explicit SVG layout was visually reviewed rather than represented as automatically certified.

Evidence: [completed workflow](./verification/agentic-workflow.jpg), [Chinese mobile workflow](./verification/agentic-mobile.jpg), [design diagram](./verification/agentic-design.jpg). The implementation contract and diagram locations are in [AGENTIC-WORKFLOW.md](./docs/AGENTIC-WORKFLOW.md).

The actual journal database was not populated or reset by QA. The updated delivery service runs on port 4187; email and online scheduling remain deferred.
