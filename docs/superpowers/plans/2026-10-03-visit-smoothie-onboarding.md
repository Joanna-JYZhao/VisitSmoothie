# Visit Smoothie Implementation Plan

**Goal:** Deliver the supplied first-registration flow on a new branch and verify it end to end.

**Architecture:** Add a shared profile model and a dedicated onboarding renderer. Persist completion atomically through the existing store; reuse profile fields in the later editor.

**Tech Stack:** Vanilla ES modules, CSS, Node 24 HTTP, SQLite, node:test, browser automation.

## Constraints

- User-supplied two-screen sketch and exact seven fields govern the UI.
- Four identity fields required; all three medical-history textareas optional.
- No stored/editable numeric age; calculate against the user's local calendar.
- Preserve legacy data and use fictional temporary databases for verification.
- Implement in this chat; no deployment or external messaging.

## Tasks

- [x] Shared model + server: create `health-journal/public/profile-model.js`; add education to `server/validation.mjs`, registration validation and completion marker to `server.mjs`/`server/store.mjs`. Registration atomically writes `{ profile, onboarding: { completedAt } }`; reject incomplete identity fields, invalid options, impossible/future dates and stale revision.
- [x] UI: create `public/onboarding.js` and `public/onboarding.css`; update `app.js` routing/actions/submission, `index.html` loading state, and `screens.js` profile editor. Render welcome for fresh journals; required details + optional history in the form; successful submission opens journal; later additions use the profile editor.
- [x] Verification: add `tests/onboarding.test.mjs` for shared model and API behavior, update frontend harness import handling, and exercise browser registration/reload/edit/error paths plus mobile layout. Run `/Users/xinlu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/*.test.mjs` and review screenshots.
- [x] Delivery: update README with registration/local-storage behavior and verification results, inspect diff, keep the finished changes on the requested branch and open the preview.
