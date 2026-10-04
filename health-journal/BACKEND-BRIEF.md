# Backend implementation contract

Own `server.mjs`, `server/*.mjs`, `tests/*.test.mjs`, `package.json`, `start.sh`, `.gitignore`. Do not edit `public/`. Node 24 available at `/Users/xinlu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`.

## Runtime
Port default 4187, loopback 127.0.0.1 only. Read root ../.env safely using Node process.loadEnvFile and optional app .env if needed; only DEEPSEEK_API_KEY, DEEPSEEK_MODEL, DEEPSEEK_BASE_URL used; do not write or print secrets. default deepseek-flash and https://api.deepseek.com (current official docs verified). Serve only public/. SQLite at `.data/journal.sqlite`, ignored, dataset `real` default and `demo` when header X-Journal-Dataset: demo. No auth, cloud or SMTP claims. Restrict Host, Origin and mutation JSON requests. Limit bodies, validate date/string/category/severity; prevent path traversal/symlinks and source credential exposure. CSP no inline script; allow self resources/data SVG only. API error {error,code?}; status codes meaningful. Export createServer or app handler for test on port 0.

## State shape, all responses for mutations `{state,...}`
`state = {revision:number, profile:{name,dob,sex,conditions,medications,allergies,surgeries,familyHistory,notes}, episodes:Episode[], settings:{locale:'en'|'zh', email:'', timeZone:'', emailContent:'undecided'}, updatedAt}`. Profile all fields strings and optional.

`Episode = {id,title,category,status:'tracking'|'closed',startedAt:string|null,createdAt,updatedAt,entries:Entry[],facts:Fact[],briefs:Brief[],visits:Visit[],relatedIds:string[],reminder:{nextAt:string|null,enabled:false},patientQuestions:string}`.
Categories `general,abdomen,head,chest,breathing,skin,muscle,other`.
`Entry = {id,role:'patient'|'assistant',text,at,recordedAt,severity:number|null,updatedAt?}`. at is user-selected occurrence time; recordedAt is actual save time. Unknown onset stays null.
`Fact = {label:'onset'|'location'|'duration'|'pattern'|'intensity'|'triggers'|'associated'|'medications'|'impact'|'other',quote,sourceId}`. Quotes must be exact substrings of current patient entries only; reject assistant/history fabrication. No invented freeform factual value.
`Brief = {id,version,createdAt,locale,text,sourceRevision:number,sourceEntries:Entry[],profileSnapshot,reviewed:true}`. sourceRevision can be episode revision/version counter or episode updatedAt if documented; FRONTEND will compare snapshot sourceEntries with current patient entries by IDs/text/at/severity and profileSnapshot JSON for staleness.
`Visit = {id,date,clinician,diagnosis,treatment,tests,followUp,notes,createdAt}` all user-entered strings; diagnosis is not model output.

## Endpoints
- GET /api/state -> `{state,capabilities:{ai:boolean,email:false}}`.
- PUT /api/profile `{profile,revision}` -> state.
- PUT /api/settings `{settings,revision}` -> state (validated fields only).
- POST /api/episodes `{title?,text,category,startedAt:null|string,at?:string,severity:null|number,revision}` -> `{state,episodeId}`. title defaults to bounded first patient text, no model generation. first entry required.
- POST /api/episodes/:id/entries `{text,at,severity,revision}` -> `{state,entryId}`; save before invoking AI.
- PATCH /api/episodes/:id/entries/:entryId `{text,at,severity,revision}` edits patient entries only, clears facts; saved briefs immutable.
- PATCH /api/episodes/:id `{status?,title?,patientQuestions?,relatedIds?,reminder?:{nextAt:null|string},revision}`.
- POST /api/episodes/:id/reflect `{locale,revision}` -> `{state}`: real DeepSeek generates 1 concise empathetic neutral clarifying question and fact quote list. Exact-quote validate, no diagnosis or treatment suggestion. Include profile/current patient entries and historical context separately. Do not use canned success on service failure. API failure preserves entries. Prevent duplicate overlapping AI calls; stale source revision after AI returns -> 409, no append. History only informs questions, not current facts. Return sanitized errors, bounded timeout.
- POST /api/episodes/:id/brief-draft `{locale,revision}` -> `{text,sourceEntries,profileSnapshot,sourceRevision}`: use real model to SELECT exact quotes with fact labels (same validated facts contract), then server template creates concise factual brief from quotes, episode timing and severity, patient's profile/questions and linked prior visits. Separate current/history and unknowns; never model diagnosis. Brief may be edited by patient client-side. No persistence until save.
- POST /api/episodes/:id/briefs `{text,locale,sourceRevision,revision}` -> `{state,briefId}`; reject stale sourceRevision; snapshot sourceEntries/profile; reviewed true (save button explicitly confirms review). Later changes do not mutate old briefs.
- POST /api/episodes/:id/visits `{visit,closeEpisode:boolean,revision}` -> state.
- PATCH /api/episodes/:id/visits/:visitId `{visit,revision}` -> state (allow patient correction).
- POST /api/demo/reset `{}` -> `{state}`, only demo dataset accepted; synthetic example has a profile, closed earlier abdomen episode with patient-entered doctor result, and one active abdomen episode with 2-3 dated patient entries and no fake AI-generated messages/facts. Label fictional in UI. Use relative dates from now for coherent timeline; no real health data.
- GET /api/export -> state JSON attachment without credentials.
- POST /api/reset `{confirmation:'DELETE',revision}` -> fresh state for requested dataset only.

## Tests
Meaningful Node built-in tests for state persistence/reopen, local real/demo separation, host/origin/path/JSON/size guards, revision conflict, entry correction invalidates facts but immutable brief snapshots, hallucinated/assistant/history quotes rejected, AI failure leaves patient text, API integration with injected model transport (no real network), stale AI response ignored, historical comparisons do not reactivate old diagnosis, no email delivery claim. Live synthetic check parent handles. Export helpers to enable tests.

## Product boundary
General urgent-symptom advice links to https://medlineplus.gov/ency/article/001927.htm in UI. Model should never reassure emergencies away or diagnose; advise immediate professional help if emergency-like symptoms reported and otherwise ask one useful missing detail. No autonomous medication instructions. Model context bounded; honest provider errors.
