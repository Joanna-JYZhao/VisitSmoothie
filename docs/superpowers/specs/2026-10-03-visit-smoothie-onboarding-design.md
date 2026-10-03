# Visit Smoothie first registration

The user's supplied sketch and field list define the design. Implement directly on `codex/visit-smoothie-onboarding` in the existing local `health-journal` application.

## Experience

A spacious welcome screen says **Visit Smoothie**, with one **开始我的健康旅程** button and a hand-drawn blue arrow inspired by the sketch. It leads to a Patient Profile screen with a left guidance panel and a white form. Use paper white `#fcfdfd`, mist `#edf5f7`, ink `#173f4f`, ocean `#167493`, muted `#57717b`, and border `#d8e4e8`. Georgia/Songti is reserved for the brand; system sans/PingFang is used for readable form text. The hand-drawn journey line is the visual signature. Stack the guide above the form on narrow screens.

Required: nickname, full birth date, sex (male/female), education (primary/junior/senior or vocational/associate/bachelor or above). Age is derived in whole years from the local calendar date, never editable or stored. Optional multi-line fields: conditions, family hereditary history, allergies. The left panel explicitly says **可跳过**; optional fields can be left blank and edited later from Health profile. Empty medical history means not recorded.

Native date/select controls, visible labels, keyboard focus, invalid-date and future-date prevention, preserved drafts during navigation/language changes/failed saves, a saving state, and accessible errors are required.

## Integration

Keep the existing vanilla JS frontend, Node HTTP server and SQLite store. Add a focused onboarding view module and a shared profile model. Registration is a separate atomic API operation that validates all required fields and saves an onboarding completion marker with the profile. Completed registrations go to the journal; existing populated legacy journals remain accessible. Empty legacy journals enter onboarding. Demo data remains separate.

This task adds first-use profile registration to the local application. Account credentials and multi-user authentication are outside the supplied requirements; do not imply they exist.

## Choices

Use the sketch's two-screen welcome/form flow. A single landing form loses the reference's opening screen; a seven-step wizard makes these short fields unnecessarily slow. Continue using the existing profile editor for later additions, aligning its identity fields with registration.

## Verification

Run existing tests, registration API tests (required/optional fields, impossible/future dates, enums, persistence, conflict, later edits), age calculations around birthdays/leap dates, and browser checks for fresh registration, reload, validation, later supplementation, desktop/mobile layout, and console errors. Use a separate temporary database for browser verification.
