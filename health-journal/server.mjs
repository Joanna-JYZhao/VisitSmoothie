import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { JournalStore, emptyState, demoState, newEntry, newEpisode, id, now } from './server/store.mjs';
import * as validate from './server/validation.mjs';
import { createDeepSeekTransport, runModel, modelContext, validateFacts, validateQuestion, buildBrief, sourceEpisodeSnapshot, urgentGuidance } from './server/ai.mjs';
import { runWorkflow, sourceFingerprint } from './server/workflow.mjs';
import { renderBriefPdf } from './server/pdf.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MAX_BODY = 1024 * 1024;
const { HttpError } = validate;
const MUTATIONS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

function securityHeaders(res) {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cache-Control', 'no-store');
}

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

function guardRequest(req, server) {
  const port = server.address()?.port;
  const host = req.headers.host;
  const allowed = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!allowed.includes(host)) throw new HttpError(403, 'Only this local journal address is allowed.', 'LOCAL_ONLY');
  if (req.headers.origin && req.headers.origin !== `http://${host}`) throw new HttpError(403, 'Cross-origin requests are not allowed.', 'ORIGIN_REJECTED');
  if (req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Cross-site requests are not allowed.', 'ORIGIN_REJECTED');
  const datasetHeader = req.headers['x-journal-dataset'];
  if (datasetHeader !== undefined && !['real', 'demo'].includes(datasetHeader)) throw new HttpError(400, 'Dataset is invalid.');
  return datasetHeader || 'real';
}

async function body(req) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(req.headers['content-type'] || '')) throw new HttpError(415, 'Send this request as application/json.', 'JSON_REQUIRED');
  if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') throw new HttpError(415, 'Compressed request bodies are not supported.');
  if (Number(req.headers['content-length']) > MAX_BODY) throw new HttpError(413, 'This request is too large.', 'BODY_TOO_LARGE');
  const data = await new Promise((resolve, reject) => {
    let size = 0; const chunks = []; let failed = false;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        if (!failed) { failed = true; reject(new HttpError(413, 'This request is too large.', 'BODY_TOO_LARGE')); }
        return;
      }
      if (!failed) chunks.push(chunk);
    });
    req.on('end', () => { if (!failed) resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', () => reject(new HttpError(400, 'The request was interrupted.')));
    req.on('aborted', () => reject(new HttpError(400, 'The request was interrupted.')));
  });
  try { return validate.object(JSON.parse(data)); }
  catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, 'The request contains invalid JSON.'); }
}

async function serveStatic(req, res, publicDir, pathname) {
  if (!['GET', 'HEAD'].includes(req.method)) throw new HttpError(405, 'Method not allowed.', 'METHOD_NOT_ALLOWED');
  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch { throw new HttpError(400, 'Invalid path.'); }
  if (!/^\/[\w/.-]*$/u.test(decoded) || decoded.split('/').some(segment => segment.startsWith('.'))) throw new HttpError(404, 'File not found.', 'NOT_FOUND');
  const relative = decoded === '/' ? 'index.html' : decoded.slice(1);
  const parts = relative.split('/').filter(Boolean);
  let target = publicDir;
  try {
    const root = await realpath(publicDir);
    for (const part of parts) {
      target = path.join(target, part);
      if ((await lstat(target)).isSymbolicLink()) throw new Error('symlink');
    }
    const resolved = await realpath(target);
    if (!resolved.startsWith(`${root}${path.sep}`) || !(await lstat(resolved)).isFile()) throw new Error('outside');
    const type = MIME[path.extname(resolved).toLowerCase()];
    if (!type) throw new Error('type');
    const data = await readFile(resolved);
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': data.byteLength });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    throw new HttpError(404, 'File not found.', 'NOT_FOUND');
  }
}

function limits(list, max, what) {
  if (list.length >= max) throw new HttpError(409, `${what} limit reached. Export your journal before starting a fresh dataset.`, 'LIMIT_REACHED');
}

export function loadConfiguration() {
  for (const file of [path.join(ROOT, '..', '.env'), path.join(ROOT, '.env')]) {
    try { process.loadEnvFile(file); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('Unable to read local AI configuration.'); }
  }
  return { apiKey: process.env.DEEPSEEK_API_KEY || '', model: process.env.DEEPSEEK_MODEL || 'deepseek-flash', baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com' };
}

/** Inject modelTransport({context, signal}) for deterministic tests; importing never loads .env or starts a listener. */
export function createServer({ dbPath = path.join(ROOT, '.data', 'journal.sqlite'), publicDir = path.join(ROOT, 'public'), modelTransport, aiConfig = {}, aiTimeoutMs = 30_000, pdfRenderer = renderBriefPdf } = {}) {
  const store = new JournalStore(dbPath);
  const transport = modelTransport || createDeepSeekTransport(aiConfig);
  const aiAvailable = Boolean(modelTransport || aiConfig.apiKey);
  const inFlight = new Set();

  const server = http.createServer(async (req, res) => {
    securityHeaders(res);
    try {
      const dataset = guardRequest(req, server);
      // Inspect the raw path before URL normalization can hide dot-segment traversal.
      const rawPath = (req.url || '/').split('?')[0];
      if (!rawPath.startsWith('/') || rawPath.startsWith('//')) throw new HttpError(400, 'Invalid request path.');
      let decoded;
      try { decoded = decodeURIComponent(rawPath); } catch { throw new HttpError(400, 'Invalid request path.'); }
      if (decoded.split('/').some(part => part === '.' || part === '..') || decoded.includes('\\') || decoded.includes('\0')) throw new HttpError(404, 'File not found.', 'NOT_FOUND');
      if (!rawPath.startsWith('/api/')) return await serveStatic(req, res, publicDir, rawPath);
      const input = MUTATIONS.has(req.method) ? await body(req) : null;
      const route = `${req.method} ${rawPath}`;

      if (route === 'GET /api/state') return json(res, 200, { state: store.read(dataset), capabilities: { ai: aiAvailable, email: false } });
      if (route === 'GET /api/export') {
        res.setHeader('Content-Disposition', `attachment; filename="health-journal-${dataset}-${new Date().toISOString().slice(0, 10)}.json"`);
        return json(res, 200, store.export(dataset));
      }
      if (route === 'POST /api/demo/reset') {
        validate.fields(input, []);
        if (dataset !== 'demo') throw new HttpError(403, 'Fictional example reset is available only in the demo dataset.', 'DEMO_ONLY');
        return json(res, 200, store.replace('demo', demoState()));
      }
      if (route === 'POST /api/reset') {
        validate.fields(input, ['confirmation', 'revision']);
        if (input.confirmation !== 'DELETE') throw new HttpError(400, 'Type DELETE to clear this dataset.');
        return json(res, 200, store.replace(dataset, emptyState(), validate.revision(input.revision)));
      }
      if (route === 'PUT /api/profile') {
        validate.fields(input, ['profile', 'revision']);
        return json(res, 200, store.mutate(dataset, input.revision, state => { state.profile = validate.profile(input.profile, state.profile); }));
      }
      if (route === 'PUT /api/settings') {
        validate.fields(input, ['settings', 'revision']);
        return json(res, 200, store.mutate(dataset, input.revision, state => { state.settings = validate.settings(input.settings, state.settings); }));
      }
      if (route === 'POST /api/episodes') {
        validate.fields(input, ['title', 'text', 'category', 'startedAt', 'at', 'severity', 'revision']);
        const text = validate.string(input.text, 'Entry', 6000, true);
        const title = input.title === undefined || input.title === '' ? text.slice(0, 80) : validate.string(input.title, 'Title', 160, true);
        const category = validate.choice(input.category, validate.CATEGORIES, 'Category');
        const startedAt = validate.date(input.startedAt, 'Symptom onset', { nullable: true });
        const entry = newEntry(text, input.at === undefined ? now() : validate.date(input.at, 'Entry time'), validate.severity(input.severity));
        return json(res, 201, store.mutate(dataset, input.revision, state => {
          limits(state.episodes, 200, 'Episode');
          const episode = newEpisode({ title, category, startedAt, entry });
          state.episodes.unshift(episode);
          return { episodeId: episode.id };
        }));
      }
      const pdfMatch = rawPath.match(/^\/api\/episodes\/([a-f0-9-]{36})\/briefs\/([a-f0-9-]{36})\/pdf$/u);
      if (pdfMatch && req.method === 'GET') {
        const episode = validate.episodeFor(store.read(dataset), pdfMatch[1]);
        const brief = episode.briefs.find(item => item.id === pdfMatch[2] && item.reviewed === true);
        if (!brief) throw new HttpError(404, 'Reviewed brief not found.', 'NOT_FOUND');
        const pdf = await pdfRenderer(brief, { demo: dataset === 'demo' });
        res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="health-journal-v${brief.version}.pdf"`, 'Content-Length': pdf.length });
        return res.end(pdf);
      }
      const match = rawPath.match(/^\/api\/episodes\/([a-f0-9-]{36})(?:\/(entries|reflect|brief-draft|briefs|visits|workflow)(?:\/([a-f0-9-]{36}))?)?$/u);
      if (!match) throw new HttpError(404, 'Endpoint not found.', 'NOT_FOUND');
      const [, episodeId, action, itemId] = match;

      if (req.method === 'GET' && action === 'workflow' && !itemId) {
        const state = store.read(dataset), episode = validate.episodeFor(state, episodeId);
        const fingerprint = sourceFingerprint(state, episode);
        return json(res, 200, { runs: store.runs(dataset, episodeId).map(run => ({ ...run, sourceCurrent: run.sourceFingerprint === fingerprint, revisionCurrent: run.sourceRevision === state.revision })) });
      }
      if (req.method === 'PATCH' && !action) {
        validate.fields(input, ['status', 'title', 'category', 'startedAt', 'patientQuestions', 'relatedIds', 'reminder', 'revision']);
        return json(res, 200, store.mutate(dataset, input.revision, state => {
          const episode = validate.episodeFor(state, episodeId);
          if ('status' in input) episode.status = validate.choice(input.status, ['tracking', 'closed'], 'Status');
          if ('title' in input) episode.title = validate.string(input.title, 'Title', 160, true);
          if ('category' in input) episode.category = validate.choice(input.category, validate.CATEGORIES, 'Category');
          if ('startedAt' in input) episode.startedAt = validate.date(input.startedAt, 'Symptom onset', { nullable: true });
          if ('patientQuestions' in input) episode.patientQuestions = validate.string(input.patientQuestions, 'Patient questions', 6000);
          if ('relatedIds' in input) {
            if (!Array.isArray(input.relatedIds) || input.relatedIds.length > 10 || new Set(input.relatedIds).size !== input.relatedIds.length || input.relatedIds.some(relatedId => typeof relatedId !== 'string' || relatedId === episodeId || !state.episodes.some(item => item.id === relatedId))) throw new HttpError(400, 'Related episodes must be distinct existing episodes.');
            episode.relatedIds = [...input.relatedIds];
          }
          if ('reminder' in input) {
            validate.fields(input.reminder, ['nextAt'], 'Reminder');
            episode.reminder = { nextAt: validate.date(input.reminder.nextAt, 'Next check-in', { nullable: true }), enabled: false };
          }
          episode.updatedAt = now();
        }));
      }
      if (req.method === 'POST' && action === 'entries' && !itemId) {
        validate.fields(input, ['text', 'at', 'severity', 'revision']);
        const entry = newEntry(validate.string(input.text, 'Entry', 6000, true), validate.date(input.at, 'Entry time'), validate.severity(input.severity));
        return json(res, 201, store.mutate(dataset, input.revision, state => {
          const episode = validate.episodeFor(state, episodeId);
          limits(episode.entries.filter(item => item.role === 'patient'), 200, 'Patient entry');
          episode.entries.push(entry); episode.updatedAt = now();
          return { entryId: entry.id };
        }));
      }
      if (req.method === 'PATCH' && action === 'entries' && itemId) {
        validate.fields(input, ['text', 'at', 'severity', 'revision']);
        return json(res, 200, store.mutate(dataset, input.revision, state => {
          const episode = validate.episodeFor(state, episodeId);
          const entry = episode.entries.find(item => item.id === itemId && item.role === 'patient');
          if (!entry) throw new HttpError(404, 'Patient entry not found.', 'NOT_FOUND');
          entry.text = validate.string(input.text, 'Entry', 6000, true);
          entry.at = validate.date(input.at, 'Entry time');
          entry.severity = validate.severity(input.severity);
          entry.updatedAt = now(); episode.updatedAt = now(); episode.facts = [];
        }));
      }
      if (req.method === 'POST' && ['reflect', 'brief-draft'].includes(action) && !itemId) {
        validate.fields(input, action === 'brief-draft' ? ['locale', 'timeZone', 'revision', 'retryRunId'] : ['locale', 'revision', 'retryRunId']);
        const locale = validate.choice(input.locale, ['en', 'zh'], 'Language');
        const timeZone = input.timeZone === undefined ? 'UTC' : validate.settings({ timeZone: input.timeZone }, {}).timeZone || 'UTC';
        if (input.retryRunId !== undefined && (typeof input.retryRunId !== 'string' || !/^[a-f0-9-]{36}$/u.test(input.retryRunId))) throw new HttpError(400, 'Invalid retry run.');
        const lock = `${dataset}:${episodeId}`;
        if (inFlight.has(lock)) throw new HttpError(409, 'An AI request is already running for this episode.', 'AI_IN_PROGRESS');
        inFlight.add(lock);
        try {
          return json(res, 200, await runWorkflow({ store, dataset, episodeId, goal: action, locale, timeZone, revision: input.revision, retryRunId: input.retryRunId, transport, timeoutMs: aiTimeoutMs }));
        } finally { inFlight.delete(lock); }
      }
      if (req.method === 'POST' && action === 'briefs' && !itemId) {
        validate.fields(input, ['text', 'locale', 'sourceRevision', 'revision', 'workflowRunId']);
        const text = validate.string(input.text, 'Reviewed brief', 240_000, true);
        const locale = validate.choice(input.locale, ['en', 'zh'], 'Language');
        validate.revision(input.sourceRevision);
        return json(res, 201, store.mutate(dataset, input.revision, state => {
          if (state.revision !== input.sourceRevision) throw new HttpError(409, 'The brief’s source changed. Generate a new draft before saving.', 'STALE_BRIEF');
          const episode = validate.episodeFor(state, episodeId);
          let run;
          if (input.workflowRunId !== undefined) {
            run = typeof input.workflowRunId === 'string' ? store.run(dataset, input.workflowRunId) : null;
            if (!run || run.episodeId !== episodeId || run.goal !== 'brief-draft' || run.status !== 'waiting_review' || run.sourceRevision !== input.sourceRevision || run.sourceFingerprint !== sourceFingerprint(state,episode) || run.locale !== locale) throw new HttpError(409, 'This draft no longer matches its workflow source.', 'STALE_BRIEF');
          }
          limits(episode.briefs, 50, 'Saved brief');
          const brief = { id: id(), version: episode.briefs.length + 1, createdAt: now(), locale, text, sourceRevision: input.sourceRevision, sourceEntries: structuredClone(episode.entries.filter(entry => entry.role === 'patient')), profileSnapshot: structuredClone(state.profile), sourceEpisode: sourceEpisodeSnapshot(state, episode), reviewed: true, ...(run ? {workflowRunId: run.runId} : {}) };
          episode.briefs.push(brief); episode.updatedAt = now();
          if (run) {
            run.status='completed'; run.finishedAt=now(); run.reviewedBriefId=brief.id;
            run.steps.push({name:'patient_review',tool:'save_reviewed_brief',status:'completed',startedAt:now(),finishedAt:now(),resultCode:'PATIENT_REVIEW_SAVED'});
            store.saveRun(dataset,run);
          }
          return { briefId: brief.id };
        }));
      }
      if (req.method === 'POST' && action === 'visits' && !itemId) {
        validate.fields(input, ['visit', 'closeEpisode', 'revision']);
        if (typeof input.closeEpisode !== 'boolean') throw new HttpError(400, 'Choose whether this episode should be closed.');
        return json(res, 201, store.mutate(dataset, input.revision, state => {
          const episode = validate.episodeFor(state, episodeId);
          limits(episode.visits, 30, 'Visit');
          episode.visits.push({ id: id(), ...validate.visit(input.visit), createdAt: now() });
          if (input.closeEpisode) episode.status = 'closed';
          episode.updatedAt = now();
        }));
      }
      if (req.method === 'PATCH' && action === 'visits' && itemId) {
        validate.fields(input, ['visit', 'revision']);
        return json(res, 200, store.mutate(dataset, input.revision, state => {
          const episode = validate.episodeFor(state, episodeId);
          const visit = episode.visits.find(item => item.id === itemId);
          if (!visit) throw new HttpError(404, 'Visit not found.', 'NOT_FOUND');
          Object.assign(visit, validate.visit(input.visit, visit));
          episode.updatedAt = now();
        }));
      }
      throw new HttpError(405, 'Method not allowed for this endpoint.', 'METHOD_NOT_ALLOWED');
    } catch (error) {
      if (!res.headersSent) json(res, error instanceof HttpError ? error.status : 500, { error: error instanceof HttpError ? error.message : 'The journal could not complete this request. Please try again.', code: error instanceof HttpError ? error.code : 'INTERNAL_ERROR', ...(error.workflow ? { workflow: error.workflow } : {}) });
      else res.end();
    }
  });
  server.requestTimeout = 20_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.on('close', () => store.close());
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = process.env.PORT === undefined ? 4187 : Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a whole number from 1 to 65535.');
  const server = createServer({ aiConfig: loadConfiguration() });
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? 'This journal port is already in use. Set a different PORT and try again.' : 'The local journal server could not start.');
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => console.log(`Health Journal is available at http://127.0.0.1:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => { process.exitCode = 0; }));
}
