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

## Nickname follow-up

Keep the current name-based account identity and remote Visit Smoothie styling. Add `nickname` to the profile JSON (no database column migration), return `user.name` for older profiles missing it, and require 1–60 trimmed characters in new saves. Render nickname/date/sex/education as the four basic fields, name/password as account controls, and keep the three optional health textareas unchanged.

- [x] Fetch remote refs and fast-forward check the current branch; inspect the remote registration/login visual reference.
- [x] Update `server/validation.mjs`, `server/accounts.mjs`, `public/views.js`, `public/app.js` and the existing CSS with the independent display nickname.
- [x] Extend account tests for nickname persistence, editing without changing login identity, duplicate display names and old-profile compatibility; update UI escaping assertions.
- [x] Run `node --test tests/*.test.mjs` (25 passing), check desktop/mobile registration and a nickname save/relogin in the browser, refresh README/verification/screenshots and prepare the current branch for the requested commit and push.
