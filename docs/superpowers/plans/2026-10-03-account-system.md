# Visit Smoothie Account System Plan

**Goal:** Deliver a standalone name/password login and seven-field personal profile app, removing the prior journal functionality.
**Architecture:** Account rows directly own profiles; server-side hashed session tokens select each account. Vanilla frontend has four simple screens.
**Stack:** Node 24 crypto/http/sqlite, ES modules/CSS, node:test.

- [x] Implement `visit-smoothie/server/accounts.mjs`, validation and HTTP routes.
- [x] Implement welcome/register/login/profile views, session-aware frontend and responsive styles.
- [x] Remove old tracked application and preserve ignored local databases.
- [x] Run isolated API, security, persistence and frontend tests; verify desktop/mobile in browser (23 passing tests).
- [x] Independent code review, fix findings, update documentation and refresh preview.
- [x] Prepare the verified branch for commit and the previously authorized push.
