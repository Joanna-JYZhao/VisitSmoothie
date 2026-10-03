# AfterDoc — patient-facing prototype

A working Chinese/English prototype connecting a patient's own pre-visit description, photographed or uploaded instructions, adaptive post-visit explanations, and a portable note for the next visit. **The clinician never needs to log into this app.**

## Run

From the repository root:

```sh
./afterdoc-prototype/start.sh
```

Open **http://127.0.0.1:4173/**. Stop the server with Ctrl-C. The script uses this Mac's bundled Node 24, falling back to `node` on PATH. No npm install is required.

The root `.env` supplies `DEEPSEEK_API_KEY`. Optional `DEEPSEEK_MODEL` defaults to `deepseek-flash`; `DEEPSEEK_BASE_URL` defaults to `https://api.deepseek.com`. The key is read only on the server and is excluded from Git. Restart after changing configuration. `PORT` can override 4173.

## A short demo

1. **Tell your story.** Describe an experience in ordinary language. The agent chooses a clarification aid and retains exact quotes and uncertainty. Stop after any turn; review and correct the summary. Choose **展示给医生 / Show the clinician** to display a readable brief on your own device.
2. **Capture your plan.** Photograph or upload instructions after the visit, or use the clearly labeled fictional record. Photos are OCRed locally. Compare the text with each photo, correct it and confirm before generating the plan.
3. **Understand and act.** Review source-linked actions. Switch between brief and detailed explanations; original execution instructions remain visible in both. Ask repeated questions or optionally check your understanding. Skipping is never recorded as understanding.
4. **Set reminders.** After checking the source plan, choose an action's reminder dates, clock times and timezone. Save settings, then download an ICS calendar or use the Google Calendar interface once configured. Medication series require an explicit fixed daily schedule and integer duration; PRN, tapering, interval and ranged schedules are not automatically scheduled.
5. **Carry it forward.** Missing information and new clinical decisions become saved questions. You can mark a question as sent yourself and record a professional's reply. Recording a reply alone does not change medication. A complete new written plan creates a new version, retaining original sources and prior patient status. Export the living note as text.

The quick fictional case loads a fixture without a model call. Free narration, plan extraction, questions and understanding checks use real DeepSeek responses; service errors are shown rather than replaced with canned success.

## Photos and documents

- PNG, JPEG, WebP and HEIC/HEIF: local macOS Vision OCR, with Simplified Chinese and English recognition and EXIF orientation handling. The first request compiles `server/vision_ocr.swift` using macOS Swift tools; the ignored `.runtime` directory holds the executable and compiler cache.
- TXT/Markdown: local UTF-8 decoding. DOCX and text-based PDF: local Python extraction using the bundled runtime configured in `server/extract.mjs`.
- Scanned PDFs have no OCR pipeline in this prototype; use a photo or paste transcribed text.
- Maximum upload: 8 MB; extracted text: 30,000 characters per record. Image recognition can misread clinical details, so photo text requires patient review. Exact quote validation proves the quote exists, not that OCR or a paraphrase is medically correct.
- Images are not sent to DeepSeek. Confirmed text and the context relevant to the requested agent action are sent to DeepSeek. Temporary image files are removed after local recognition.

## Google Calendar interface

The OAuth and event-write interfaces are implemented. **No live Google account connection is claimed without configuring and authorizing an OAuth app.**

Create a Google Cloud OAuth **Web application**, enable the Google Calendar API, and add this exact authorized redirect URI:

```text
http://127.0.0.1:4173/api/calendar/google/callback
```

Add the following values to the existing root `.env` locally; never paste secrets into chat or commit them:

```dotenv
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://127.0.0.1:4173/api/calendar/google/callback
```

Restart, open **日历与提醒 / Calendar & reminders**, and choose **Connect Google Calendar**. The user authorizes in a separate Google tab, returns to the existing AfterDoc tab and refreshes connection status. Clicking **Confirm & save** writes the reviewed reminder series to the authorized account's primary calendar.

| Endpoint | Contract |
| --- | --- |
| `GET /api/calendar/status` | Configuration and connection booleans; never tokens |
| `POST /api/calendar/google/authorize` | `{}` → Google authorization URL; one-use state + PKCE |
| `GET /api/calendar/google/callback` | Exchanges the authorization code; a new authorization replaces prior credentials |
| `POST /api/calendar/google/events` | `{events, confirmed:true, includeDetails:false}` → per-series save results and `allSaved` |
| `POST /api/calendar/disconnect` | Clears this local session's tokens; does not delete calendar events or revoke the Google app grant |

An event input includes `id`, `title`, `description`, `kind`, a local `start` such as `2026-10-03T08:00:00`, IANA `timeZone`, bounded `count` and `minutesBefore`. See `public/calendar.js` and `tests/calendar.test.mjs` for the exact validated contract. Stable event IDs allow safe retries; an existing event is updated to the currently confirmed privacy/content settings. Partial failures remain visible.

Tokens stay in server memory and disappear on restart. This is a **single-user localhost integration**, not a multi-user OAuth service. The event scope is `calendar.events`. Calendar names/descriptions are generic by default; including medicine names and instructions requires selecting the explicit checkbox. No invites are sent.

ICS export works without Google configuration and includes a daily recurrence and display alarm. Import it into Google Calendar, Apple Calendar or another compatible app, then check its notification settings. **AfterDoc itself does not send background notifications when its page is closed.** Calendar imports and already-created Google events are not automatically changed or deleted when the clinical plan changes; the app flags older reminder settings and the patient must reconcile them in the calendar. Removing a local setting does not remove an external event.

Provider references: [Google OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server), [Calendar event creation](https://developers.google.com/workspace/calendar/api/guides/create-events), [Google Calendar ICS import](https://support.google.com/calendar/answer/37118), [DeepSeek JSON mode](https://api-docs.deepseek.com/guides/json_mode/).

## State, scope and verification

Patient state stays in browser memory. Requested exports are held in bounded server memory, exposed through random local download links that expire after ten minutes; they are never written to an application database. Refreshing or replacing the session clears it; export before leaving. No patient database, hospital connection, authenticated professional identity, autonomous treatment change or automatic sending of professional questions is included. Professional replies are explicitly user-entered and identity-unverified. Patient completion markers are self-reported, not measured medication adherence.

The localhost server serves only `public/`, checks Host/Origin, rejects path escape and applies a content security policy. This reduces prototype exposure; it is not a production security or clinical validation claim.

```sh
cd afterdoc-prototype
node --test tests/*.test.mjs
```

Node 24, the configured Python runtime and native macOS Vision are needed for the full suite. The tests use synthetic data, injected Google transport and local document fixtures. They do not write to a real Google account. See `VERIFICATION.md` for executed checks and `REVIEW.md` for independent findings and resolutions.
