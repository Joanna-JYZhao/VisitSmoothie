import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server.mjs';
import { JournalStore, demoState, newEntry } from '../server/store.mjs';
import { validateFacts, validateQuestion, modelContext, sourceEpisodeSnapshot, buildBrief, createDeepSeekTransport, urgentGuidance } from '../server/ai.mjs';

const AT = '2026-10-03T02:00:00.000Z';
const grounded = async ({ context }) => ({ decision: { action: context.operation === 'reflect' ? 'ask_followup' : 'create_brief', missingDetails: context.operation === 'reflect' ? ['impact'] : [] }, ...(context.operation === 'reflect' ? { question: 'How has this affected your usual activities?' } : {}), facts: [{ label: 'other', quote: context.currentEpisode.entries[0].text, sourceId: context.currentEpisode.entries[0].sourceId }] });

async function setup(t, options = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'health-journal-test-'));
  const publicDir = path.join(dir, 'public');
  await mkdir(publicDir);
  await writeFile(path.join(publicDir, 'index.html'), '<!doctype html><title>Journal</title>');
  await writeFile(path.join(dir, '.env'), 'DO_NOT_EXPOSE=synthetic-secret');
  await symlink(path.join(dir, '.env'), path.join(publicDir, 'escape.js'));
  const server = createServer({ dbPath: path.join(dir, '.data', 'journal.sqlite'), publicDir, modelTransport: grounded, ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });
  const request = async (method, endpoint, input, headers = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}${endpoint}`, { method, headers: { ...(input === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, data, headers: response.headers };
  };
  const raw = (endpoint, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, path: endpoint, method, headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString(), headers: response.headers }));
    });
    request.on('error', reject);
    request.end(body);
  });
  const create = async (revision = 0, text = 'A mild stomach ache after dinner.', headers = {}) => request('POST', '/api/episodes', { text, category: 'abdomen', startedAt: null, at: AT, severity: 4, revision }, headers);
  return { server, request, raw, create, port, dir };
}

test('SQLite persists independently for real and demo datasets across close/reopen', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'health-journal-store-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'journal.sqlite');
  let store = new JournalStore(file);
  assert.equal(store.read().revision, 0);
  store.mutate('real', 0, state => { state.profile.name = 'Saved locally'; });
  store.replace('demo', demoState());
  assert.throws(() => store.mutate('real', 0, state => { state.profile.name = 'Lost update'; }), /changed/u);
  store.close();
  store = new JournalStore(file);
  assert.equal(store.read('real').profile.name, 'Saved locally');
  assert.equal(store.read('real').revision, 1);
  assert.match(store.read('demo').profile.name, /fictional/u);
  store.close();
});

test('profile/settings validation, onset correction and revision conflicts preserve saved data', async t => {
  const { request, create } = await setup(t);
  assert.deepEqual((await request('GET', '/api/state')).data.capabilities, { ai: true, email: false });
  let response = await request('PUT', '/api/profile', { profile: { name: 'Alex', allergies: '' }, revision: 0 });
  assert.equal(response.status, 200);
  response = await request('PUT', '/api/settings', { settings: { locale: 'zh', timeZone: 'America/Los_Angeles', email: 'alex@example.invalid' }, revision: 1 });
  assert.equal(response.data.state.settings.emailContent, 'undecided');
  for (const settings of [{ timeZone: 'Invalid/Zone' }, { email: 'broken' }, { emailContent: 'send' }, { enabled: true }]) assert.equal((await request('PUT', '/api/settings', { settings, revision: 2 })).status, 400);
  assert.equal((await request('PUT', '/api/profile', { profile: { dob: '2026-02-30' }, revision: 2 })).status, 400);
  response = await create(2);
  const id = response.data.episodeId;
  assert.equal(response.data.state.episodes[0].startedAt, null);
  assert.equal(response.data.state.episodes[0].entries[0].at, AT);
  assert.notEqual(response.data.state.episodes[0].entries[0].recordedAt, AT);
  assert.equal((await request('PATCH', `/api/episodes/${id}`, { title: 'Wrong version', revision: 2 })).status, 409);
  response = await request('PATCH', `/api/episodes/${id}`, { category: 'general', startedAt: '2026-10-01', reminder: { nextAt: '2026-10-05T15:00:00Z' }, revision: 3 });
  assert.equal(response.data.state.episodes[0].category, 'general');
  assert.equal(response.data.state.episodes[0].startedAt, '2026-10-01');
  assert.deepEqual(response.data.state.episodes[0].reminder, { nextAt: '2026-10-05T15:00:00Z', enabled: false });
  for (const fields of [{ severity: 11 }, { severity: '4' }, { at: '2026-02-30' }, { at: '2026-10-01T24:00:00Z' }, { text: ' ' }]) {
    assert.equal((await request('POST', `/api/episodes/${id}/entries`, { text: 'New observation', at: AT, severity: null, revision: 4, ...fields })).status, 400);
  }
  assert.equal((await request('GET', '/api/state')).data.state.revision, 4);
});

test('reflect, reviewed brief, source correction and metadata preserve immutable versions', async t => {
  const { request, create } = await setup(t);
  let response = await create();
  const id = response.data.episodeId;
  const entryId = response.data.state.episodes[0].entries[0].id;
  response = await request('POST', `/api/episodes/${id}/reflect`, { locale: 'en', revision: 1 });
  assert.equal(response.status, 200);
  assert.equal(response.data.state.episodes[0].facts.length, 1);
  const assistantId = response.data.state.episodes[0].entries[1].id;
  const draft = await request('POST', `/api/episodes/${id}/brief-draft`, { locale: 'en', timeZone: 'America/Los_Angeles', revision: 2 });
  assert.equal(draft.status, 200);
  assert.match(draft.data.text, /America\/Los_Angeles/u);
  assert.match(draft.data.text, /Oct 2, 2026/u);
  assert.equal(draft.data.sourceEntries.length, 1);
  assert.deepEqual(Object.keys(draft.data.sourceEpisode), ['title', 'category', 'startedAt', 'patientQuestions', 'relatedIds', 'visits', 'history']);
  response = await request('POST', `/api/episodes/${id}/briefs`, { text: draft.data.text, locale: 'en', sourceRevision: 2, revision: 2 });
  assert.equal(response.status, 201);
  const frozen = structuredClone(response.data.state.episodes[0].briefs[0]);
  response = await request('PATCH', `/api/episodes/${id}/entries/${entryId}`, { text: 'Corrected: discomfort before dinner.', at: AT, severity: 2, revision: 3 });
  assert.equal(response.status, 200);
  assert.deepEqual(response.data.state.episodes[0].facts, []);
  assert.deepEqual(response.data.state.episodes[0].briefs[0], frozen);
  assert.equal((await request('PATCH', `/api/episodes/${id}/entries/${assistantId}`, { text: 'fake', at: AT, severity: null, revision: 4 })).status, 404);
  assert.equal((await request('POST', `/api/episodes/${id}/briefs`, { text: draft.data.text, locale: 'en', sourceRevision: 2, revision: 4 })).data.code, 'STALE_BRIEF');
  response = await request('PATCH', `/api/episodes/${id}`, { startedAt: '2026-10-01', patientQuestions: 'What details should I record?', revision: 4 });
  assert.notDeepEqual(sourceEpisodeSnapshot(response.data.state, response.data.state.episodes[0]), frozen.sourceEpisode);
  assert.deepEqual(response.data.state.episodes[0].briefs[0], frozen);
});

test('fictional reset and export never overwrite or leak real records and reset revisions are monotonic', async t => {
  const { request, create } = await setup(t);
  await create(0, 'A private real record');
  const demoHeaders = { 'X-Journal-Dataset': 'demo' };
  assert.equal((await request('POST', '/api/demo/reset', {})).status, 403);
  const demo = await request('POST', '/api/demo/reset', {}, demoHeaders);
  assert.equal(demo.data.state.episodes.length, 2);
  assert.ok(demo.data.state.episodes.every(episode => episode.entries.every(entry => entry.role === 'patient') && episode.facts.length === 0));
  assert.equal((await request('GET', '/api/state')).data.state.episodes[0].entries[0].text, 'A private real record');
  const exported = await request('GET', '/api/export');
  assert.match(exported.headers.get('content-disposition'), /attachment/u);
  assert.equal(exported.data.episodes.length, 1);
  assert.doesNotMatch(JSON.stringify(exported.data), /DEEPSEEK|synthetic-secret|apiKey/u);
  assert.equal((await request('POST', '/api/reset', { confirmation: 'no', revision: 1 })).status, 400);
  const cleared = await request('POST', '/api/reset', { confirmation: 'DELETE', revision: 1 });
  assert.equal(cleared.data.state.revision, 2);
  assert.equal(cleared.data.state.episodes.length, 0);
  assert.equal((await request('GET', '/api/state', undefined, demoHeaders)).data.state.episodes.length, 2);
  assert.equal((await create(1)).status, 409);
});

test('Host, Origin, cross-site, traversal, symlink, JSON, body limits and CSP guard local access', async t => {
  const { request, raw, port } = await setup(t);
  assert.equal((await raw('/api/state', { headers: { Host: `evil.invalid:${port}` } })).status, 403);
  assert.equal((await request('GET', '/api/state', undefined, { Origin: 'https://evil.invalid' })).status, 403);
  assert.equal((await request('GET', '/api/state', undefined, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await request('GET', '/api/state', undefined, { 'X-Journal-Dataset': 'other' })).status, 400);
  for (const endpoint of ['/../.env', '/%2e%2e/.env', '/.env', '/server.mjs', '/escape.js', '/%2e%2e%2f.env']) {
    const response = await raw(endpoint);
    assert.equal(response.status, 404, endpoint);
    assert.doesNotMatch(response.body, /synthetic-secret/u);
  }
  assert.equal((await raw('/api/reset', { method: 'POST', body: '{}' })).status, 415);
  assert.equal((await raw('/api/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
  assert.equal((await raw('/api/reset', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' }, body: '{}' })).status, 415);
  assert.equal((await raw('/api/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'x'.repeat(1024 * 1024 + 1) }) })).status, 413);
  const page = await request('GET', '/');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/u);
  assert.doesNotMatch(page.headers.get('content-security-policy'), /unsafe-inline/u);
  assert.equal(page.headers.get('cache-control'), 'no-store');
});

test('hallucinated, assistant and historical quotes are rejected; current exact quotes accepted', () => {
  const entries = [{ id: 'patient', role: 'patient', text: 'A dull ache after dinner.' }, { id: 'assistant', role: 'assistant', text: 'Does it affect sleep?' }];
  assert.deepEqual(validateFacts([{ label: 'location', quote: 'dull ache', sourceId: 'patient' }], entries), [{ label: 'location', quote: 'dull ache', sourceId: 'patient' }]);
  for (const fact of [
    { label: 'other', quote: 'gastroenteritis', sourceId: 'patient' },
    { label: 'other', quote: 'Does it affect sleep?', sourceId: 'assistant' },
    { label: 'other', quote: 'Old diagnosis', sourceId: 'old-entry' },
    { label: 'diagnosis', quote: 'dull ache', sourceId: 'patient' },
    { label: 'other', quote: 'dull ache', sourceId: 'patient', value: 'made up' },
  ]) assert.throws(() => validateFacts([fact], entries), error => error.code === 'AI_GROUNDING');
  assert.throws(() => validateQuestion('You probably have gastritis. Are you eating?'), error => error.code === 'AI_FORMAT');
  assert.throws(() => validateQuestion('Where? When?'), error => error.code === 'AI_FORMAT');
});

test('provider failure and timeout preserve the separately saved patient entry and sanitize errors', async t => {
  for (const [label, options, expected] of [
    ['failure', { modelTransport: async () => { throw new Error('synthetic-secret upstream error'); } }, 502],
    ['timeout', { modelTransport: async () => new Promise(() => {}), aiTimeoutMs: 20 }, 504],
    ['missing key', { modelTransport: undefined }, 503],
  ]) await t.test(label, async sub => {
    const { create, request } = await setup(sub, options);
    const created = await create();
    const response = await request('POST', `/api/episodes/${created.data.episodeId}/reflect`, { locale: 'en', revision: 1 });
    assert.equal(response.status, expected);
    assert.doesNotMatch(JSON.stringify(response.data), /synthetic-secret/u);
    const saved = (await request('GET', '/api/state')).data.state;
    assert.equal(saved.episodes[0].entries.length, 1);
    assert.equal(saved.revision, 1);
  });
});

test('overlapping AI is blocked and stale model response cannot append facts or assistant messages', async t => {
  let release;
  let notify;
  const began = new Promise(resolve => { notify = resolve; });
  const { create, request } = await setup(t, { modelTransport: async input => {
    notify();
    await new Promise(resolve => { release = resolve; });
    return grounded(input);
  } });
  const created = await create();
  const id = created.data.episodeId;
  const pending = request('POST', `/api/episodes/${id}/reflect`, { locale: 'en', revision: 1 });
  await began;
  assert.equal((await request('POST', `/api/episodes/${id}/brief-draft`, { locale: 'en', revision: 1 })).data.code, 'AI_IN_PROGRESS');
  assert.equal((await request('POST', `/api/episodes/${id}/entries`, { text: 'A new development', at: AT, severity: null, revision: 1 })).status, 201);
  release();
  assert.equal((await pending).status, 409);
  const episode = (await request('GET', '/api/state')).data.state.episodes[0];
  assert.equal(episode.entries.length, 2);
  assert.ok(episode.entries.every(entry => entry.role === 'patient'));
  assert.deepEqual(episode.facts, []);
});

test('historical visit context is separate and corrections change snapshot without inheriting diagnosis', async t => {
  const { request } = await setup(t);
  const headers = { 'X-Journal-Dataset': 'demo' };
  let state = (await request('POST', '/api/demo/reset', {}, headers)).data.state;
  const current = state.episodes[0], old = state.episodes[1];
  const context = modelContext(state, current, 'en', 'reflect');
  assert.equal(context.historicalContextOnly.length, 1);
  assert.equal(context.currentEpisode.entries.length, 3);
  assert.ok(!JSON.stringify(context.currentEpisode).includes(old.visits[0].diagnosis));
  const snapshot = sourceEpisodeSnapshot(state, current);
  let response = await request('POST', `/api/episodes/${current.id}/visits`, { visit: { date: '2026-10-02', diagnosis: 'Patient-entered result', notes: 'As remembered by patient' }, closeEpisode: true, revision: state.revision }, headers);
  assert.equal(response.data.state.episodes[0].status, 'closed');
  state = response.data.state;
  response = await request('PATCH', `/api/episodes/${old.id}/visits/${old.visits[0].id}`, { visit: { diagnosis: 'Corrected prior result' }, revision: state.revision }, headers);
  state = response.data.state;
  assert.notDeepEqual(sourceEpisodeSnapshot(state, state.episodes[0]), snapshot);
  assert.equal(state.episodes[0].facts.length, 0);
  assert.equal(state.episodes[0].visits[0].diagnosis, 'Patient-entered result');
  const text = buildBrief(state, state.episodes[0], [], 'en');
  assert.ok(text.indexOf('Corrected prior result') > text.indexOf('Linked history (not a diagnosis'));
  const before = sourceEpisodeSnapshot(state, state.episodes[0]);
  state.episodes[0].entries.push({ role: 'assistant', text: 'A question?' });
  state.episodes[0].briefs.push({ text: 'Saved later' });
  assert.deepEqual(sourceEpisodeSnapshot(state, state.episodes[0]), before);
});

test('briefs stay compact, include peak/first/latest and preserve omissions, medicines and allergies', () => {
  const state = demoState();
  const episode = state.episodes[0];
  episode.entries = Array.from({ length: 25 }, (_, index) => newEntry(`Observation ${index}: ${'long patient detail '.repeat(30)}`, new Date(Date.UTC(2026, 8, index + 1)).toISOString(), index === 9 ? 10 : 3));
  state.profile.medications = 'Medicine recorded by patient. '.repeat(100);
  state.profile.allergies = 'Allergy recorded by patient. '.repeat(100);
  const text = buildBrief(state, episode, [], 'en');
  assert.ok(text.length < 6400);
  assert.match(text, /Observation 0:/u);
  assert.match(text, /Observation 24:/u);
  assert.match(text, /Observation 9:/u);
  assert.match(text, /of 25 entries/u);
  assert.match(text, /Medicines: Medicine recorded/u);
  assert.match(text, /Allergies: Allergy recorded/u);
  assert.match(text, /shortened/u);
  assert.match(text, /not the complete record/u);
  assert.match(buildBrief(state, episode, [], 'zh'), /未知|不确定/u);
  assert.match(urgentGuidance([{ role: 'patient', text: "I can't breathe" }], 'en'), /immediate professional help/u);
});

test('real transport shapes provider requests and never exposes provider error payloads', async () => {
  let captured;
  const transport = createDeepSeekTransport({ apiKey: 'synthetic-key', fetchImpl: async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ facts: [] }) } }] }));
  } });
  assert.deepEqual(await transport({ context: { operation: 'brief-draft' }, signal: new AbortController().signal }), { facts: [] });
  assert.equal(captured.url, 'https://api.deepseek.com/chat/completions');
  assert.equal(captured.options.headers.Authorization, 'Bearer synthetic-key');
  assert.equal(JSON.parse(captured.options.body).model, 'deepseek-flash');
  assert.deepEqual(JSON.parse(captured.options.body).thinking, { type: 'disabled' });
  assert.equal(JSON.parse(captured.options.body).max_tokens, 4000);
  assert.match(JSON.parse(captured.options.body).messages[0].content, /at most 16 facts, with each quote at most 160 characters/u);
  assert.equal(captured.options.redirect, 'error');
  const failing = createDeepSeekTransport({ apiKey: 'synthetic-key', fetchImpl: async () => new Response('synthetic upstream secret', { status: 401 }) });
  await assert.rejects(failing({ context: {}, signal: new AbortController().signal }), error => error.status === 502 && !error.message.includes('synthetic'));
});

test('PDF endpoint renders only the persisted reviewed version from the selected dataset', async t => {
  const rendered = [];
  const { request, create } = await setup(t, { pdfRenderer: async (brief, options) => {
    rendered.push({ brief, options });
    return Buffer.from('%PDF-1.7\nsynthetic PDF\n%%EOF');
  } });
  const created = await create();
  const episodeId = created.data.episodeId;
  const saved = await request('POST', `/api/episodes/${episodeId}/briefs`, { text: 'Reviewed patient text', locale: 'en', sourceRevision: 1, revision: 1 });
  const briefId = saved.data.briefId;
  const endpoint = `/api/episodes/${episodeId}/briefs/${briefId}/pdf`;
  const pdf = await request('GET', `${endpoint}?text=Untrusted%20request%20text`);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.equal(pdf.headers.get('content-disposition'), 'attachment; filename="health-journal-v1.pdf"');
  assert.equal(rendered[0].brief.text, 'Reviewed patient text');
  assert.equal(rendered[0].brief.reviewed, true);
  assert.deepEqual(rendered[0].options, { demo: false });
  assert.equal((await request('GET', endpoint, undefined, { 'X-Journal-Dataset': 'demo' })).status, 404);
  assert.equal(rendered.length, 1);
  assert.equal((await request('GET', `/api/episodes/${episodeId}/briefs/00000000-0000-0000-0000-000000000000/pdf`)).status, 404);
});

test('unverifiable AI facts cannot be persisted through the reflection endpoint', async t => {
  const { request, create } = await setup(t, { modelTransport: async ({ context }) => ({ decision:{action:'ask_followup',missingDetails:['impact']}, question: 'How does this affect your day?', facts: [{ label: 'other', quote: 'A diagnosis the patient never stated', sourceId: context.currentEpisode.entries[0].sourceId }] }) });
  const created = await create();
  const response = await request('POST', `/api/episodes/${created.data.episodeId}/reflect`, { locale: 'en', revision: 1 });
  assert.equal(response.status, 502);
  assert.equal(response.data.code, 'AI_GROUNDING');
  const state = (await request('GET', '/api/state')).data.state;
  assert.equal(state.revision, 1);
  assert.deepEqual(state.episodes[0].facts, []);
  assert.equal(state.episodes[0].entries.length, 1);
});

test('brief and model history use visit dates after backfill and correction, without inventing undated chronology', () => {
  const state = demoState();
  const episode = state.episodes[0];
  const history = state.episodes[1];
  const visit = (id, date, diagnosis, createdAt) => ({ id, date, diagnosis, createdAt, clinician: '', treatment: '', tests: '', followUp: '', notes: '' });
  episode.visits = [visit('current-recent', '2026-09-20', 'Current later visit', '2026-09-20T12:00:00Z'), visit('current-backfill', '2026-09-10', 'Current backfilled older visit', '2026-09-25T12:00:00Z')];
  history.visits = [visit('old-recent', '2026-08-20', 'Historical later visit', '2026-08-20T12:00:00Z'), visit('old-backfill', '2026-08-10', 'Historical backfilled older visit', '2026-09-25T12:00:00Z'), visit('old-first', '2026-08-01', 'Historical earliest visit', '2026-09-26T12:00:00Z')];
  let text = buildBrief(state, episode, [], 'en');
  assert.match(text, /Current later visit/u);
  assert.match(text, /Historical later visit/u);
  assert.doesNotMatch(text, /backfilled older visit/u);
  assert.deepEqual(modelContext(state, episode, 'en', 'reflect').historicalContextOnly[0].pastClinicianOutcomesEnteredByPatient.map(item => item.id), ['old-backfill', 'old-recent']);
  episode.visits[1].date = '2026-09-30';
  history.visits[1].date = '2026-08-30';
  text = buildBrief(state, episode, [], 'en');
  assert.match(text, /Current backfilled older visit/u);
  assert.match(text, /Historical backfilled older visit/u);
  assert.doesNotMatch(text, /Current later visit|Historical later visit/u);
  assert.deepEqual(modelContext(state, episode, 'en', 'reflect').historicalContextOnly[0].pastClinicianOutcomesEnteredByPatient.map(item => item.id), ['old-recent', 'old-backfill']);
  episode.visits.forEach(item => { item.date = ''; });
  text = buildBrief(state, episode, [], 'en');
  assert.match(text, /Undated visit in this episode \(most recently entered by patient\)/u);
  assert.match(text, /Current backfilled older visit/u);
  assert.deepEqual(history.visits.map(item => item.id), ['old-recent', 'old-backfill', 'old-first']);
});

test('workflow draft history and patient approval validate run, dataset and source atomically', async t => {
  const {request,create}=await setup(t);
  const created=await create();const id=created.data.episodeId;
  const draft=(await request('POST',`/api/episodes/${id}/brief-draft`,{locale:'en',revision:1})).data;
  assert.equal(draft.workflow.status,'waiting_review');assert.equal(draft.workflowRunId,draft.workflow.runId);
  let history=(await request('GET',`/api/episodes/${id}/workflow`)).data.runs;
  assert.equal(history[0].output.text,draft.text);assert.equal(history[0].sourceCurrent,true);
  const bad=await request('POST',`/api/episodes/${id}/briefs`,{text:'Reviewed',locale:'en',sourceRevision:1,revision:1,workflowRunId:'00000000-0000-0000-0000-000000000000'});
  assert.equal(bad.data.code,'STALE_BRIEF');
  assert.equal((await request('POST',`/api/episodes/${id}/briefs`,{text:'Reviewed',locale:'en',sourceRevision:1,revision:1,workflowRunId:draft.workflowRunId},{'X-Journal-Dataset':'demo'})).status,409);
  assert.equal((await request('GET',`/api/episodes/${id}/workflow`)).data.runs[0].status,'waiting_review');
  const saved=await request('POST',`/api/episodes/${id}/briefs`,{text:'Patient-reviewed wording',locale:'en',sourceRevision:1,revision:1,workflowRunId:draft.workflowRunId});
  assert.equal(saved.status,201);assert.equal(saved.data.state.episodes[0].briefs[0].workflowRunId,draft.workflowRunId);
  history=(await request('GET',`/api/episodes/${id}/workflow`)).data.runs;
  assert.equal(history[0].status,'completed');assert.equal(history[0].reviewedBriefId,saved.data.briefId);assert.equal(history[0].steps.at(-1).tool,'save_reviewed_brief');
  assert.equal((await request('GET','/api/export')).data.workflowRuns[0].status,'completed');
});
