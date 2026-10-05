# Verification — 2026-10-03

## Automated

`node --test tests/*.test.mjs`: **25 passed, 0 failed** after the nickname follow-up. The preceding account implementation was independently reviewed with all 23 original tests passing.

- Required profile fields, real complete dates, future-date rejection, birthday/leap-day age calculation and normalized names.
- Anonymous access blocked; static assets allowlisted; former journal/AI/export APIs absent.
- Unique account IDs, separate profiles, server-side account selection and stale-account header rejection.
- Random salted scrypt hashes, hashed session tokens, HttpOnly/SameSite cookies, wrong credentials and request throttling.
- Logout, session expiry, fabricated tokens, restart persistence and duplicate registration rejection.
- Optimistic profile revisions reject stale saves, including a dirty tab refreshed after another tab saved.
- Session invalidation clears private drafts, aborts pending requests and rejects obsolete responses. Auth transitions use Web Locks; canceled delayed login cannot leave a live session after another tab logs out.
- Origin and request-header validation; escaped UI fields; passwords excluded from transient drafts.
- Independent display nickname persists across editing/restart/login without changing account ID or login name. Repeated nicknames are allowed; blank/oversized nicknames are rejected. Older profiles without the field remain readable and editable. Nicknames are escaped in inputs and the display header.

## Browser

Exercised the app in the Codex browser against a disposable database under `/tmp/visit-smoothie-accounts-preview-20261003/`, using fictional accounts only:

1. Registration displays every requested field and the 可跳过 guide. Password mismatch blocks submission; optional health fields may be blank.
2. Date entry calculates age. Registration opens the new account's profile.
3. Additional multiline history saves and survives refresh and subsequent name/password login.
4. Incorrect password displays an error. Two users retain separate health fields.
5. Logout clears the displayed profile; a second open tab also returns to login.
6. Final updated frontend has no browser warnings/errors. At 390 px width, document width is also 390 px; no horizontal overflow.
7. Desktop (1365 px) and mobile (390 px) full-page screenshots visually inspected. Final preview left logged out on the blank registration form.
8. Nickname follow-up: registered a fictional account with all three health fields blank; verified birthday-derived age, nickname in the header, and a later nickname change plus multiline condition/allergy supplementation. Original login name still worked and the saved data returned after logout/relogin. Save was checked with keyboard activation and a normal mouse click after resetting a temporary browser viewport override.

Screenshots: [desktop](output/playwright/registration-desktop.jpg), [mobile](output/playwright/registration-mobile.jpg).

## Review and limits

Independent review identified two concurrency defects (dirty-draft revision advancement and delayed login after logout). Both were fixed, regression-tested and re-reviewed with no remaining blockers.

Before the nickname edits, fetched origin and fast-forward checked `codex/visit-smoothie-onboarding` (already current). Inspected the registration/login style in `origin/yiban-patient` at `57e0939`; retained its blue ink, white paper, serif headings and rounded cards. Only the current onboarding feature branch is changed by this follow-up.

Local implementation and local browser flows are verified. Public deployment, external-device access, password recovery and production operational controls are outside this delivery. No external AI service was called and no real health data was used in verification.
