# Health Journal Agentic Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Apply a controlled agent/tool loop to the existing journal and save its design diagram.

**Architecture:** Keep the native Node/SQLite application. Extract workflow orchestration into a bounded server module, persist run events separately from patient revisions, and render the actual run history in the existing UI.

**Tech Stack:** Node 24, node:sqlite, vanilla ES modules, DeepSeek JSON, Archify workflow v2.

## Global Constraints

- Work only in health-journal/, this feature's docs and its new diagram folder. Preserve AfterDoc and existing patient data.
- No cloud deployment, mail sending, new provider or clinical diagnosis. No credential values in outputs.
- Existing user choices authorize implementation after selecting architecture A; no extra approval gate is required.
- Current journal source is untracked in a shared dirty workspace: do not commit unrelated work or manufacture source references to HEAD. Keep local task evidence; no worktree copy that would omit this source.
- Spec: docs/superpowers/specs/2026-10-02-health-journal-agentic-design.md.

### Task 1: Integrate the controlled workflow

**Files:** create health-journal/server/workflow.mjs and tests/workflow.test.mjs; modify server.mjs, server/store.mjs, server/ai.mjs, public/app.js, public/screens.js, public/styles.css and relevant regression tests. Create health-journal/WORKFLOW-REPORT.md.

**Interfaces:** preserve existing /reflect, /brief-draft and /briefs URLs; add GET /api/episodes/:id/workflow for durable run history. AI endpoints return workflow run metadata with existing state/draft fields; error responses include sanitized workflow metadata when a run was created. Draft output carries workflowRunId; reviewed saves may submit that run ID and must validate episode/dataset/source. Preserve existing older-client paths without making fake run claims.

- [x] Add meaningful tests for branching, invalid plans, source grounding, AI error preserving entry, urgent bypass without provider, repeated-source idempotency, changed source, durable drafts, restart interruption, explicit retry lineage, patient approval and dataset reset/export isolation.
- [x] Implement `runWorkflow` with dependency-injected model transport, tools selected from a closed registry, standard step events and persisted checkpoints. Reuse existing validators and summary composer.
- [x] Extend the provider JSON schema/instructions with allowed decision and missing-detail fields; validate both shape and goal-specific actions. Ask only one question per patient update and permit finish_tracking when no useful question remains.
- [x] Integrate existing endpoints and run-store methods. Keep audit writes out of clinical revision increments. Verify captured revision immediately before applying AI outputs. Make saving reviewed output and run completion coherent.
- [x] Add bilingual collapsible run panel, manual retry and draft recovery with captured operation context. Do not discard or overwrite an edited draft when loading history. Show only real completed steps and honest pending status.
- [x] Run `node --test tests/*.test.mjs` using bundled Node 24; write command/result and implementation contract in WORKFLOW-REPORT.md. Do not stop or replace the delivery server; parent owns restart and browser testing.

### Task 2: Save the workflow design

**Files:** .archify/workflow-health-journal-agentic-20261002-<time>/candidate.json and health-journal-agentic.html; exported SVG; public/workflow-design.html (static diagram entry); health-journal/docs/AGENTIC-WORKFLOW.md.

- [x] Create a Chinese logical workflow covering save-first, context, safety branch, bounded model plan, quote/plan validation, questions/stop/brief branches, human review, durable checkpoint, failure retry and historical reuse.
- [x] Used the Archify schema and authoring defaults and attempted finalize showcase; automatic layout did not pass. Diagnostics remain saved. The final explicit SVG design is manually verified and distinguished from committed-source provenance.
- [x] Verified the final HTML/SVG in the in-app browser and embedded the vector in a standalone offline HTML. Preferences links the served diagram without weakening the app CSP.

### Task 3: Review and deliver

- [x] Independent task/code review against the spec and actual patch; fix consequential findings and rerun the covering tests.
- [x] Start an isolated synthetic test server. Verify real DeepSeek decision, persisted run history, reviewed summary and mobile presentation; preserve real records.
- [x] Restart the delivery server, open the site and saved diagram, and update README/VERIFICATION with exact evidence and limitations.
