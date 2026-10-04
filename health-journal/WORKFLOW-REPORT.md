# Controlled assistant workflow implementation

Implemented against `docs/superpowers/specs/2026-10-02-health-journal-agentic-design.md` in the shared local source. No commit, server restart, credential output, browser action or live provider request was performed by the implementation worker.

## Contract

- Native Node/SQLite architecture retained. `server/workflow.mjs` is the bounded orchestration module; there is one provider plan and at most one selected action per run. No generic agent framework.
- The provider must return `{facts, decision:{action,missingDetails}, question?}`. Reflect permits `ask_followup` and `finish_tracking`; brief-draft permits `create_brief`. Missing details use existing fact-label vocabulary. A follow-up requires one validated question and at least one missing detail. Finish omits questions and has no missing details. Unknown output keys, unsupported actions and ungrounded quotes fail closed.
- Closed action mapping: ask_followup → ask_patient; finish_tracking → save_checkpoint; create_brief → compose_brief. Context, local urgent rule, model plan, plan/quotation verification and final checkpoint are fixed server-owned tools. No email/network tools chosen by the model.
- Standard durable events: load_context/read_context, safety_check/check_urgent_guidance, agent_plan/extract_and_plan, verify_sources/verify_quotes, execute_tool/selected tool, checkpoint/save_checkpoint. A reviewed save appends patient_review/save_reviewed_brief. Events contain real start/end/status/result codes, no hidden reasoning.
- Local urgent checks execute before provider work and bypass it on a match, including when the provider is disconnected. They return urgent guidance with no follow-up/draft, preserving clinical revision. These are existing conservative rules, not a validated triage classifier.
- Patient entry save remains independent and first. Provider failure leaves it intact. Current exact patient substrings are the only accepted fact sources; historical/profile context remains distinct.

## Persistence and recovery

A separate `workflow_runs` table stores dataset, run ID, episode ID and JSON record. Run records include schemaVersion 1, workflowVersion `health-journal-v1`, runId, episodeId, goal, locale, timeZone, sourceFingerprint, sourceRevision, parentRunId, status, startedAt, finishedAt, steps, decision and optional output/errorCode/reviewedBriefId. Trace writes do not increment clinical revision.

`sourceFingerprint` hashes every model-relevant context, complete current patient entries, profile and source episode snapshot. Assistant replies do not invalidate their own source. Captured revision and fingerprint are checked immediately before clinical/tool application. Unchanged reflect requests reuse the latest run without duplicate questions. Brief drafts reuse matching source/revision/language/timezone; after a clinical revision changes, a fresh brief run is allowed so its reviewed save can satisfy revision checking. A second follow-up for the same already-questioned patient update is rejected even when other context changed.

An explicit `retryRunId` requires a failed/interrupted run of the same goal, dataset, episode and unchanged fingerprint. A new run records parentRunId; replay of that retry returns its existing result. Startup converts leftover running records/steps to interrupted. Draft text and source snapshots persist in run output. The last 30 runs per episode are retained; reviewed brief source snapshots remain in the clinical journal independently. Dataset reset deletes that dataset's runs in the clinical reset transaction; an in-flight cleared run cannot recreate its trace. Export includes only the requested dataset's workflowRuns.

Follow-up clinical mutation and waiting_patient state commit together. For new clients, reviewed brief save validates the run's dataset/episode/goal/waiting_review/sourceRevision/fingerprint/locale and stores the reviewed brief plus completed run in one transaction. Older clients may omit workflowRunId, preserving the existing revision-based reviewed save without asserting workflow completion.

## HTTP and UI

Existing reflect, brief-draft and briefs URLs remain. AI endpoints add workflow and reused metadata; drafts add workflowRunId. Failed newly-created runs return sanitized workflow metadata with the normal error/code. GET `/api/episodes/:id/workflow` returns newest-first runs with sourceCurrent and revisionCurrent flags.

The bilingual collapsible Assistant workflow panel displays recorded goals, statuses, real steps, missing-detail labels, next action, lineage, source changes, safe error codes, retries and durable draft recovery. Navigation-sensitive requests capture dataset/episode/language/timezone. Recovery never replaces an existing local edited draft. Brief saves use the draft language/run ID. Urgent guidance also appears in the page alert so collapse cannot hide it. Preferences links `/workflow-design.html` in a new tab with noopener. Parent owns the actual diagram files.

## Validation

Runtime: bundled Node 24 at `/Users/xinlu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`.

Command, run from `health-journal/`:

```
/Users/xinlu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/*.test.mjs
```

Final implementation-worker result: **49 passed, 0 failed, 0 skipped** (2026-10-02 local date). The default sandbox disallows loopback listeners (EPERM); the successful run used approved escalation only to allow temporary test listeners. Delivery server was untouched.

Added meaningful coverage for selected action events/stop, illegal plans/no reasoning storage, urgent bypass, quote grounding/provider failure, persisted drafts, restart interruptions, explicit retry lineage/idempotency, revision staleness, reset-during-provider race, bounded retention/dataset isolation, reviewed-save atomic transitions, edited-draft recovery, captured retries and draft language/run IDs. Existing 33 tests remain passing, with injected provider fixtures updated to the mandatory decision schema.

Live DeepSeek behavior, visual/mobile browser QA, diagram verification and delivery restart are parent-owned acceptance checks and are not claimed by this report. Source changes remain untracked in the shared workspace; no source certification against Git HEAD is claimed.

## Independent review round 1

Aligned the last brief-draft prompt sentence with mandatory facts+decision output. Added monotonic history-request versions: a pending history GET cannot overwrite a newer final run, another history request, or a cleared dataset cache even when no clinical revision increment occurred. Added regressions for old running/empty history responses, overlapping loads and clearing during a pending history load. Updated full suite: 48 passing.

## Browser acceptance display correction

For completed create_brief runs, the panel now reports “Result: Reviewed and saved — ready to share” / “结果: 已核对并保存，可以分享”. Waiting-review drafts retain the pending patient-review next step. A bilingual rendering regression verifies both statuses. No other historical next-action wording changed. Final suite: 49 passed, 0 failed, 0 skipped; screens.js syntax check passed. No implementation-worker browser or restart action.
