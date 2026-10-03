# Health Journal

A warm, bilingual, local patient journal for preparing a clearer conversation with a clinician. This directory contains the current first-generation website.

## Run on this computer

```sh
cd "/Users/xinlu/Documents/Stanford Venture Trip/health-journal"
./start.sh
```

Open <http://127.0.0.1:4187>. Keep the terminal/server running while using the website. Stop with Control-C; saved records survive restarts. The launcher uses this computer's bundled Node 24, with a system `node` fallback. `JOURNAL_NODE` can select another Node 24+ executable.

New journals start in Chinese. Use the language button to switch between Chinese and English. Existing journals retain their language preference. **Try an example** opens explicitly fictional records stored separately from your own journal. Return with **Back to my journal**.

## First registration — Visit Smoothie

A new journal opens the **Visit Smoothie** welcome screen. **开始我的健康旅程** opens the first-use patient profile:

- Required: nickname, complete date of birth, sex (male/female), and education (primary, middle, high/vocational, associate, bachelor or above).
- Age is calculated from the birthday and the device's current calendar date; it is never entered or stored as a number. Invalid and future birth dates are rejected.
- Optional multiline fields: underlying conditions, hereditary family conditions, and allergies. The left guide says **可跳过**. Leave any or all blank and add them later in **健康档案 / Health profile**.

**保存并开始** validates and saves the profile plus a completion marker in one SQLite transaction, then opens the journal. Reloading or restarting does not repeat completed registration. Existing populated journals continue opening normally. Blank health history remains unrecorded, not a confirmed absence. Unsaved form input is retained when going back, changing language or encountering a save error; it is not persisted across a reload before saving.

This is first-use profile registration for the existing local, single-user application. It does not create remote accounts or add password authentication.

## The five-step flow

1. **Health profile:** enter the health background you know; blank fields remain unknown.
2. **Today / My journal:** record a new symptom episode or add changes to an existing one. An optional DeepSeek question helps you add missing details. Your note is saved before the AI request.
3. **Before your visit:** add questions, select relevant earlier episodes, and generate a brief. Review/edit the draft and save a version. Download a real PDF, copy the text, or open the doctor display. Sharing/exporting never automatically sends it to anyone.
4. **After your visit:** record the clinician's actual conclusion and instructions in your own words; archive the episode when appropriate.
5. **A later episode:** earlier chapters in the same recorded category are surfaced for review. Select which history to include. The site does not infer that the cause or diagnosis is the same.

Saved briefs are immutable versions with source snapshots. Corrections to source records flag older briefs as out of date. A change made while drafting conservatively requires regenerating the draft; copy any manual edits first.

## AI and data

The assistant now uses a controlled agent workflow: save the patient's note, read context, check urgent guidance, choose and validate a bounded action, execute a dedicated tool, and save the result. Each episode has an **Assistant workflow** panel with durable run history, explicit retries and draft recovery. Reviewed brief saves complete the associated run atomically. See [the workflow contract](./docs/AGENTIC-WORKFLOW.md) and open [the design diagram](http://127.0.0.1:4187/workflow-design.html), also linked from Preferences.

- The existing parent `.env` supplies `DEEPSEEK_API_KEY`; an app-local `.env` can also supply missing configuration. Optional variables: `DEEPSEEK_MODEL`, `DEEPSEEK_BASE_URL`. Secrets stay on the server and never enter browser source or journal exports.
- Ordinary recording and viewing use local storage. Requesting AI sends bounded excerpts of the episode, profile and relevant history to the configured DeepSeek service. The interface discloses this at the recording/generation controls.
- AI extracts exact patient quotations and asks a short clarification question. Server templates assemble the brief. Unverifiable quotations and malformed responses are rejected; failure does not remove saved notes.
- This is a communication aid, not a diagnosis, treatment recommendation, validated triage system or verified medical record. Original-language quotations remain original-language when the interface switches.
- SQLite lives in `.data/journal.sqlite` with separate real/demo datasets. The server binds only to `127.0.0.1`. This prototype has no accounts, cloud sync or application-level database encryption. Anyone with access to this computer account may access its records.
- Preferences can export the selected dataset as JSON. Import/restore through the interface is not implemented. For a complete filesystem backup, stop the server and copy the entire `.data` directory. Do not publish that directory or `.env`.

## PDF

PDF export uses Python with ReportLab. This computer's bundled runtime is detected automatically; `JOURNAL_PYTHON` can point to another Python executable with ReportLab installed. English and Chinese text are supported, using the installed Arial Unicode font when available. If rendering is unavailable, the saved brief remains available for copying or browser printing.

## Deferred email integration

Email service selection was explicitly deferred. The site does **not** send reminders or doctor emails. Saved check-in dates are local dates only. Sending while this computer sleeps or is off requires an online scheduler and email provider; provider, message content and what data may be stored online remain to be decided. UI controls show this state explicitly.

## Verification and development

```sh
npm test
```

Requires Node 24+. Tests use temporary databases and injected model responses; they do not send real patient records. See [VERIFICATION.md](./VERIFICATION.md) for executed browser, PDF and live synthetic-AI evidence. No external frontend dependencies, trackers, CDN assets or build step are required.
