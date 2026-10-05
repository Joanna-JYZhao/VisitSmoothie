# Health Journal Implementation Plan

**Goal:** Deliver the confirmed local five-step patient journal with real DeepSeek, attractive bilingual UI, durable records and clinician-ready summaries.

**Architecture:** Node 24 on loopback serves native browser modules and a SQLite-backed JSON API. AI facts require exact quotes from the patient's current entries. Saved briefs preserve source snapshots. Real and fictional demo data use separate dataset keys.

**Tech Stack:** Node 24, node:sqlite, HTML/CSS/ES modules, Python/ReportLab PDF export, native browser print.

## Global constraints
- Write only `health-journal/` plus this plan and its design spec; preserve existing work.
- No secret values in outputs, browser code, committed files or exports.
- Local records, English default/Chinese switch, warm journal visual direction.
- Distinguish unknown, patient report, AI organization and patient-entered clinician result.
- Email provider and sending are deferred by the user; never claim an email was sent.
- Current user guidance: user records symptoms whenever they wish, pre-visit summary combines those entries.

## Tasks and checks
- [x] Backend: implement contract in `health-journal/BACKEND-BRIEF.md`, persistent store, validation, grounded AI, immutable briefs, visit outcomes, demo separation; test with `node --test tests/*.test.mjs`.
- [x] First preview: create home, sidebar, patient recording affordance and representative journal styling; serve successfully and open the in-app browser.
- [x] Full interface: profile, episode recording and conversation, timeline, source drawer, reviewable brief, PDF/copy/print/doctor display, clinician outcome, history and recurrence, reminder preferences with unavailable-email state, backup and clear confirmation.
- [x] Integration: live synthetic AI request and browser journey; verify responsive layout, Chinese, reload and failure states. PDF bytes rendered and inspected; in-app browser download-event observation remains a tooling limitation documented in VERIFICATION.
- [x] Review and delivery: independent code review, address consequential findings, write README and VERIFICATION with executed evidence, retain local server and link. Final test result: 33 passed.

## State contracts
See `health-journal/BACKEND-BRIEF.md`. Browser never writes an entire opaque database. Mutations carry `revision`; stale writes return 409. AI failure never discards a saved patient entry. Original source snapshots remain attached to each saved brief.
