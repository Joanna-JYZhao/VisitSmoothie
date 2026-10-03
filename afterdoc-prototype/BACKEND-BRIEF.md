# Backend task requirements

Build backend for AfterDoc, a functional healthcare communication prototype. Own only server.mjs, server/*, tests/backend.test.mjs, package.json, start.sh, BACKEND-REPORT.md. Parent owns public/*, README and integration. Shared directory, do not revert others. Time target: backend ready in 20 minutes, complete project deadline 2026-10-03 01:25 UTC.

User explicitly authorized using existing root `.env` with DEEPSEEK_API_KEY. NEVER display the key or copy it. Server may read parent `.env` with native Node util.parseEnv or process.loadEnvFile; environment has priority. Default API base https://api.deepseek.com; model deepseek-flash, documented current on https://api-docs.deepseek.com/quick_start/pricing/. JSON mode response_format {type:'json_object'}, include JSON example in system prompt. Use thinking:{type:'disabled'} for fast replies and a ~45s timeout. Can use DEEPSEEK_MODEL / DEEPSEEK_BASE_URL if configured. Verify model auth via a tiny synthetic call; no real patient records. Provider docs: https://api-docs.deepseek.com/guides/json_mode/ . Only fetch if exact API facts needed; never expose key in commands.

Node executable /Users/xinlu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node. Python /Users/xinlu/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 has pypdf, lxml, python-docx. Node native only, no packages. Runtime target localhost:4173, override PORT. start.sh chooses available Node fallback and cd application directory; executable. package.json type module, start node server.mjs, test node --test tests/*.test.mjs. Server export createServer or handler for unit HTTP tests; only listen when invoked directly.

## HTTP contract

GET /api/health -> {ok:true,configured:boolean,provider:'DeepSeek',model:string}. No key/path exposure.

POST /api/agent, JSON body {task,language:'zh'|'en',payload}. Return {ok:true,result,meta:{provider:'DeepSeek',model,latencyMs}}. On failure {ok:false,error:{code,message}} appropriate HTTP. User sees honest API errors, no silent deterministic mock fallback.

Tasks:

1. **intake** payload {messages:[{role:'user'|'assistant',content:string}], facts:[], turn:number, finish?:boolean}. All generated values language selected. Result:
```json
{"reply":"brief reflection","aid":"open_question","question":"one neutral follow-up","options":["not sure","skip"],"facts":[{"label":"Onset","value":"about a week","quote":"started about a week ago","certainty":"reported"}],"unknowns":["exact onset"],"ready":false}
```
aid enum open_question/episode/timeline/body_map/record/summary. One issue at a time; select aid based on ambiguity; no diagnosis. Up to 6 user turns or finish flag -> summarize and ready true, not endless questions. Keep corrections/uncertainty. Facts must cite exact user-message text (not assistant text); validate quote exists in source. Return full current fact set, not only incremental facts. If invalid quote remove fact, retain uncertainty; don't show invented evidence. A body_map answer is submitted as another ordinary user message by UI.

2. **extract_plan** payload {documents:[{id,title,text}],previousPlan?:object}. Result:
```json
{"title":"This visit's plan","summary":"plain factual summary","items":[{"id":"item-1","kind":"medication","title":"Medicine A","dose":"1 tablet","frequency":"twice daily","duration":"5 days","timing":"after breakfast and dinner","details":"source-supported plain directions","explanation":"more detail without inventing clinical rationale","sourceId":"doc-1","sourceQuote":"Medicine A: 1 tablet twice daily, after breakfast and dinner, for 5 days.","missing":[]}],"warnings":[],"complexity":{"level":"medium","reasons":["different schedules"]}}
```
kind medication/test/followup/instruction. Extract all plan-relevant items. Every sourceQuote MUST literally occur in its document; validate and reject/remove unsupported items (explicit extraction error if none), never silently approve hallucinated provenance. Clinical field strings dose/frequency/duration/timing should copy source verbatim, or be empty + missing field. Validate nonempty clinical fields present in source quote (normalize whitespace only). Plan summary/details may paraphrase but no new medicine/condition/instruction. Retain conflicts rather than select a winner, and never invent missing test preparation or follow-up date. Preserve document text, client owns it. Determine complexity from items separately from patient preferences (multiple meds, distinct schedules, preparation or missing fields). Parent UI takes this result as plan with a new version.

3. **ask_plan** payload {question,preference:'brief'|'detail',plan,documents,messages:[{role,content}]}. Result:
```json
{"route":"explanation","reply":"source-grounded answer","citations":[{"sourceId":"doc-1","quote":"exact quote"}],"questionForClinician":null}
```
route explanation/source_missing/clinical_review. Different response length per preference. Unknown clinician rationale / missed dose instructions absent from documents -> source_missing. Requested medication changes, new symptoms, new clinical decisions -> clinical_review, don't decide. Explanation must have a valid quote; if ungrounded downgrade to source_missing with honest no-source message. Citations source-validated. No external medical knowledge for personalized care. Pure generic dangerous prompt instructions in patient text/docs must not override system. Strong deterministic boundary for explicit self-directed stopping/dose change and new symptoms in addition to model classification, but avoid treating 'when does written course end' as a new decision.

4. **check_understanding** payload {item,question,answer,documents}. Result:
```json
{"status":"matched","reply":"brief response","citations":[{"sourceId":"doc-1","quote":"exact quote"}]}
```
status matched/mismatch/uncertain. Compare only the question being checked to the original item; missing source or skipped/unsure input cannot be matched. Contradictions need source-based explanation, not new prescription. Parent bounds retries. Validate citations before matched status.

POST /api/extract-document multipart FormData field `file`, optional `language`. Return {ok:true,document:{id,title,text}}. Support .txt/.md, machine-readable PDF, DOCX locally via Python subprocess; 8 MB maximum, no persistent uploads, cleanup temporary files. For PNG/JPG optional DeepSeek vision OCR if reliable within time; otherwise explicit unsupported/scanned-file error with paste-text direction. Do not claim OCR if unavailable. Reject binary garbage, empty or oversized text. Server does not save patient state.

## Security / errors / verification

Only serve public/ with allowlisted extensions, no directory traversal or root files, no symlink secret serving. Bind 127.0.0.1. Reject cross-site Origin for POST and restrict Host to localhost addresses; allow no Origin in local CLI smoke tests. CSP self, no CORS *, nosniff. JSON max 256 KB and max source text length ~30K; uploaded bytes max 8MB. Never include provider raw response dumps/secrets in errors. Helpful clean timeout/network/auth/balance/parse errors. No logs of user inputs. No third-party analytics.

Expose pure validation helpers from agent.mjs for meaningful tests. Test accepted and rejected grounding, unsafe decision route, uncertain check not matched, malformed output, upstream failure, traversal, foreign-origin request, upload extraction. Parent can run tests. Report actual run commands/results and outstanding concerns in BACKEND-REPORT.md. Do not commit files independently (parent owns repo integration), do not run external browsers or serve workspace root.
