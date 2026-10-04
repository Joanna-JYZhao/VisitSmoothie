# Visit Smoothie accounts and personal profile

The user narrowed the task: remove the entire prior journal application and keep the specified login/registration/profile requirements. The latest scope replaces earlier journal integration plans.

## Product scope

- Standalone app in `visit-smoothie/`: welcome, first registration, login, and editable personal profile only.
- Name is the unique login username. Normalize NFKC and whitespace, compare names case-insensitively. Reject duplicate names; do not silently add suffixes. Login name is read-only after registration in this version. A separate required, editable nickname (1–60 characters after trimming) is used for display; nicknames need not be unique. Existing profiles without a nickname display their login name until edited.
- Register with nickname, full birth date (automatic age), male/female, five education choices, and optional multiline conditions/family hereditary history/allergies. Left guide explicitly says 可跳过. Keep login name, password and confirmation together in a separate account section.
- Login uses name/password. After login show only that account's personal profile; optional history can be added later. Logout invalidates the session and clears all transient profile/form data.
- No symptom recording, visits, summaries, AI, demo, export, preferences, password-recovery service, or account-management dashboard.

## Implementation

Node 24 HTTP/SQLite with no external dependencies. `server/accounts.mjs` owns accounts and sessions; `server/validation.mjs` owns input contracts. Passwords use async scrypt with random 16-byte salt and N=32768/r=8/p=3. Passwords are 15–128 characters with no composition rules or trimming. Session tokens are 256-bit random values, stored only as SHA-256 hashes, and expire in seven days. Cookie is HttpOnly/SameSite=Strict. Server stays localhost-only.

Profile lives in the account row and is selected only from authenticated session identity. Protected requests also require the expected account ID to catch stale browser tabs. Profile edits use optimistic revisions. Add per-name/per-IP attempt limits and a concurrent hash cap. Do not expose hashes, session tokens or other account IDs in normal responses.

Retain blue-and-white reference design, readable labeled controls, desktop/mobile layouts and native browser date validation. Browser drafts stay in memory only; never persist passwords in browser storage. Dirty drafts retain their base revision across background session refreshes. Broadcast session changes across tabs, abort invalidated requests, and serialize cookie-changing requests with Web Locks. The server revokes sessions whose authentication response was canceled before delivery. Discard obsolete responses and clear profile state at logout/session expiry.

The former tracked application code is removed, with Git history providing recovery. Its ignored local database remains on disk, excluded from Git and inaccessible to the new application. There is no automatic transfer into a new account.

## Verification

The latest UI reference is `origin/yiban-patient` at `57e0939`: its `src/app/welcome/smoothie.css` and login page retain the blue ink (#167493), white paper (#fcfdfd), mist (#edf5f7), ink (#173f4f), Songti/Georgia headings, system body text and rounded cards. Preserve this existing design in the current feature branch. The current branch was fetched and fast-forward checked against origin before edits.

Test two independent accounts, unauthorized reads/writes, stale-account headers, duplicate names, password hashing, wrong-password and rate-limit behavior, expired/revoked sessions, server/database restart, required fields and date bounds, immutable name, concurrent profile edits, request origin checks, and removed endpoints. Exercise real browser register/login/logout/relogin and profile supplementation with fictional test data; inspect desktop and mobile screenshots.

References: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html and https://nodejs.org/download/release/v24.21.0/docs/api/crypto.html .
