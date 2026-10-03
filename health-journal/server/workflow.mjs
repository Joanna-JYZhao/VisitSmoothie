import { createHash } from 'node:crypto';
import { id, now } from './store.mjs';
import { HttpError, FACT_LABELS, assertRevision, episodeFor } from './validation.mjs';
import { modelContext, runModel, urgentGuidance, validateFacts, validateQuestion, buildBrief, sourceEpisodeSnapshot } from './ai.mjs';

export const WORKFLOW_VERSION = 'health-journal-v1';
export const TOOL_REGISTRY = Object.freeze({ ask_followup: 'ask_patient', finish_tracking: 'save_checkpoint', create_brief: 'compose_brief' });
// Includes every source sent to the model, even automatically selected historical context.
// Assistant output is not a new patient update, so it does not invalidate its own run.
export function sourceFingerprint(state, episode) {
  const context = modelContext(state, episode, 'en', 'brief-draft');
  return createHash('sha256').update(JSON.stringify({ context, patientEntries: episode.entries.filter(e => e.role === 'patient'), profile: state.profile, episode: sourceEpisodeSnapshot(state, episode) })).digest('hex');
}
export function validatePlan(output, goal) {
  if (Object.keys(output).some(key => !['facts', 'decision', 'question'].includes(key))) throw new HttpError(502, 'The AI returned an unsupported plan.', 'AI_PLAN');
  const decision = output.decision;
  const allowed = goal === 'reflect' ? ['ask_followup', 'finish_tracking'] : ['create_brief'];
  if (!decision || typeof decision !== 'object' || Array.isArray(decision) || Object.keys(decision).some(key => !['action','missingDetails'].includes(key)) || !allowed.includes(decision.action) || !Array.isArray(decision.missingDetails) || decision.missingDetails.length > 10 || new Set(decision.missingDetails).size !== decision.missingDetails.length || decision.missingDetails.some(x => !FACT_LABELS.includes(x))) throw new HttpError(502, 'The AI returned an unsupported plan. Please try again.', 'AI_PLAN');
  if (decision.action === 'ask_followup') {
    if (!decision.missingDetails.length) throw new HttpError(502, 'The AI question did not identify a missing detail.', 'AI_PLAN');
    validateQuestion(output.question);
  } else if (output.question !== undefined || (decision.action === 'finish_tracking' && decision.missingDetails.length)) throw new HttpError(502, 'The AI returned an inconsistent plan.', 'AI_PLAN');
  return { action: decision.action, missingDetails: [...decision.missingDetails] };
}

export async function runWorkflow({ store, dataset, episodeId, goal, locale, timeZone='UTC', revision, retryRunId, transport, timeoutMs }) {
  const captured = store.read(dataset);
  assertRevision(captured, revision);
  const episode = episodeFor(captured, episodeId);
  const fingerprint = sourceFingerprint(captured, episode);
  let parentRunId = null;
  if (retryRunId !== undefined) {
    const parent = store.run(dataset, retryRunId);
    if (!parent || parent.episodeId !== episodeId || parent.goal !== goal || !['failed','interrupted'].includes(parent.status) || parent.sourceFingerprint !== fingerprint) throw new HttpError(409, 'Retry requires a failed or interrupted run with unchanged sources.', 'INVALID_RETRY');
    parentRunId = parent.runId;
  }
  const existing = store.runs(dataset, episodeId).find(run => run.goal === goal && run.locale === locale && run.timeZone === timeZone && run.sourceFingerprint === fingerprint && (goal !== 'brief-draft' || run.sourceRevision === captured.revision));
  if (existing && !parentRunId) {
    if (existing.status === 'running') throw new HttpError(409, 'An assistant workflow is already running.', 'AI_IN_PROGRESS');
    return { state: captured, ...(existing.status === 'completed' ? {} : existing.output || {}), workflow: existing, reused: true };
  }
  if (parentRunId && existing?.parentRunId === parentRunId) return { state: captured, ...(existing.status === 'completed' ? {} : existing.output || {}), workflow: existing, reused: true };
  const run = { schemaVersion: 1, workflowVersion: WORKFLOW_VERSION, runId: id(), episodeId, goal, locale, timeZone, sourceFingerprint: fingerprint, sourceRevision: captured.revision, parentRunId, status: 'running', startedAt: now(), finishedAt: null, steps: [], decision: null };
  store.saveRun(dataset, run);
  async function step(name, tool, fn, resultCode) {
    const event = { name, tool, status: 'running', startedAt: now(), finishedAt: null, resultCode: null };
    run.steps.push(event); store.saveRun(dataset, run, {existingOnly:true});
    const result = await fn();
    if (!store.run(dataset,run.runId)) throw new HttpError(409,'This workflow was cleared with its dataset.','STALE_WORKFLOW');
    event.status = 'completed'; event.finishedAt = now(); event.resultCode = typeof resultCode === 'function' ? resultCode(result) : resultCode;
    store.saveRun(dataset, run, {existingOnly:true}); return result;
  }
  const assertSources = () => {
    const current = store.read(dataset);
    assertRevision(current, captured.revision);
    if (sourceFingerprint(current, episodeFor(current, episodeId)) !== fingerprint) throw new HttpError(409, 'The journal changed during this workflow. Please start again.', 'STALE_WORKFLOW');
  };
  try {
    const context = await step('load_context','read_context', () => modelContext(captured, episode, locale, goal),'CONTEXT_LOADED');
    const urgent = await step('safety_check','check_urgent_guidance', () => urgentGuidance(episode.entries,locale), x => x ? 'URGENT_GUIDANCE' : 'NO_RULE_MATCH');
    let result = { state: captured };
    if (urgent) {
      assertSources(); run.output = { urgentGuidance: urgent }; run.status = 'urgent';
    } else {
      const output = await step('agent_plan','extract_and_plan', () => runModel(transport,context,timeoutMs),'PLAN_RECEIVED');
      const facts = await step('verify_sources','verify_quotes', () => {
        run.decision = validatePlan(output,goal);
        if (run.decision.action === 'ask_followup' && episode.entries.at(-1)?.role === 'assistant') throw new HttpError(502,'A question was already asked for this patient update. Add a new note first.','AI_PLAN');
        return validateFacts(output.facts,episode.entries);
      },'PLAN_AND_QUOTES_VERIFIED');
      result = await step('execute_tool',TOOL_REGISTRY[run.decision.action], () => {
        assertSources();
        if (run.decision.action === 'create_brief') {
          const draft = { text: buildBrief(captured,episode,facts,locale,timeZone), locale, sourceEntries: structuredClone(episode.entries.filter(e=>e.role==='patient')), profileSnapshot: structuredClone(captured.profile), sourceEpisode: sourceEpisodeSnapshot(captured,episode), sourceRevision: captured.revision, workflowRunId: run.runId };
          run.output = draft; run.status = 'waiting_review'; return { state: captured, ...draft };
        }
        if (run.decision.action === 'finish_tracking') { run.status = 'completed'; return { state: captured }; }
        const question = validateQuestion(output.question);
        // Clinical mutation and waiting checkpoint commit together.
        return store.mutate(dataset,captured.revision,state => {
          const current = episodeFor(state,episodeId);
          if (current.entries.filter(e=>e.role==='assistant').length >= 200) throw new HttpError(409,'AI question limit reached.','LIMIT_REACHED');
          current.facts = facts;
          current.entries.push({ id: id(), role: 'assistant', text: question, at: now(), recordedAt: now(), severity: null, workflowRunId: run.runId });
          current.updatedAt=now(); run.status='waiting_patient'; run.output={question}; store.saveRun(dataset,run);
        });
      },TOOL_REGISTRY[run.decision.action].toUpperCase());
    }
    await step('checkpoint','save_checkpoint', () => { run.finishedAt=now(); store.saveRun(dataset,run); },'RESULT_SAVED');
    return { ...result, ...(run.output || {}), workflow: run, reused: false };
  } catch (error) {
    // A reset may have removed this run while the provider was in flight.
    if (store.run(dataset,run.runId)) {
      run.status='failed'; run.finishedAt=now(); run.errorCode=error instanceof HttpError ? error.code : 'INTERNAL_ERROR';
      for (const event of run.steps) if(event.status==='running') {event.status='failed';event.finishedAt=now();event.resultCode=run.errorCode;}
      store.saveRun(dataset,run);
      error.workflow=run;
    }
    throw error;
  }
}
