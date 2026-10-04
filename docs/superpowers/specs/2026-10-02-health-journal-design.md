# Health Journal — approved first-version direction

## Confirmed choices
- New independent patient website, separate from AfterDoc, running on this Mac.
- Real DeepSeek AI using the existing root `.env`, server side only.
- English default with a Chinese switch. Warm, calm journal aesthetic: cream, soft warm accents, generous spacing.
- Patient can add symptoms whenever they choose. Entries accumulate within one episode; the pre-visit action summarizes that episode for a clinician.
- Journey: health profile → symptom entries and clarifications → reviewed visit brief → patient-entered clinician outcomes → earlier episodes when symptoms recur.
- Email must eventually run while this Mac sleeps, requiring an online component. The user explicitly selected completing the website first and deciding the mail service later. Email delivery is deferred, visibly unavailable, never simulated as sent.
- Doctor delivery choice is pending; read-only display, copy and print are independent reversible output capabilities. No email is sent by this build.

## Product
Health Journal is a descriptive working title. Home opens directly to recording a symptom, with a recent journal and profile access. A single episode contains dated patient entries, optional patient-selected severity, grounded AI clarifications, an editable visit brief, and clinician outcomes entered by the patient. New episodes can reference similar prior categories but never inherit a diagnosis automatically. AI does not diagnose or change treatment.

Profile fields are optional: preferred name, date of birth, sex as provided, conditions, medicines, allergies, surgeries, family history, and notes. Empty fields remain unknown, never 'none'. The patient selects when symptoms began; entry timestamps are distinct from symptom onset. AI asks one useful neutral question at a time and keeps exact source quotes for extracted facts. It receives current episode and explicitly separate historical context.

The brief includes the concern, symptom onset if supplied, dated symptom change, recorded intensity, relevant history, source-backed facts, patient questions, and linked earlier visits. Patient reviews and edits it before saving a frozen version. Export uses the reviewed version; later entries mark it out of date. Doctor diagnoses/outcomes are explicitly patient-entered and can be corrected. Read-only history preserves original episode boundaries.

## Implementation decisions
Independent `health-journal/` directory; native Node 24 server and SQLite, dependency-free browser ES modules. Loopback-only HTTP. Health records persist locally in an ignored database; backups can be exported. The existing AfterDoc code and running server remain untouched. Fictional example data lives in a separate demo dataset. Model requests are explicit user actions; errors remain visible and patient entries survive AI failure.

The remote mail component is not provisioned until provider and content choices are settled. Reminder settings can store a user-chosen next check-in but are marked local only / email not connected. No background or email delivery claim.

## Visual system
Paper #F8F5F0, white #FFFFFF, warm ink #3D3834, muted #756C64, clay #A8543C, apricot #F0D9C5, line #E8E0D6. Georgia display headings used sparingly; Avenir Next / system / PingFang body. A continuous dated journal line is the signature; no decorative artwork. Desktop sidebar and two-column working surface, mobile compact navigation. Body 16px minimum, clear focus, reduced-motion support, legible print layout.

## Verification
Test persistence, input validation, demo separation, malicious origins/paths, API failure, exact-quote validation, immutable brief versions, source edits/staleness, episode recurrence, and local-only reminder state. Exercise real DeepSeek with synthetic data. Walk profile → symptom entries → brief review/export → visit record → new related episode in browser, including Chinese and narrow viewport. Document limitations and run instructions honestly.
