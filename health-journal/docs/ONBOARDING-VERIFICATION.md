# Visit Smoothie verification — 2026-10-03

Branch: `codex/visit-smoothie-onboarding`.

## Automated checks

The original 49-test suite passed before changes. The expanded 58-test suite passes after implementation, using Node 24 and temporary test databases. Coverage includes required fields, optional blank histories, invalid/future birthdays, enum validation, birthday/leap-day age calculation, local calendar timezones, stale revisions, atomic persistence, database reopen, later edits, legacy journals, demo isolation, escaped values, and failed-save draft retention.

Adding the education field exposed positional profile-label mapping in the existing brief builder. Labels now use explicit field keys; the original medicine/allergy regression check passes.

## Browser checks

Used the Codex browser against a dedicated localhost preview database containing only fictional test values. No existing health data or AI provider was used.

- Welcome button opens the requested seven-field form.
- Empty submission is blocked at four required identity controls.
- Future birth date is blocked; selecting `2008-10-03` displays `18 岁` on `2026-10-03`.
- Both sex options and all five education options are present.
- Language switching and returning through welcome retain the in-progress form.
- All three history fields can remain blank at registration.
- Successful save opens the journal; reload stays in the journal and displays the saved nickname.
- Health profile permits later multiline history additions; all three additions survive a reload.
- Desktop 1365 × 950 and mobile 390 × 844 checked visually; no horizontal overflow.
- No browser error or warning logs during these checks.

This validates local profile registration, not multi-user authentication, cloud sync, or deployment.
