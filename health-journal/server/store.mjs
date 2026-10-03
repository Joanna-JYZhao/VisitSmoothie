import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertRevision, PROFILE_FIELDS } from './validation.mjs';

export const id = () => randomUUID();
export const now = () => new Date().toISOString();

export function emptyState(revision = 0) {
  return {
    revision,
    profile: Object.fromEntries(PROFILE_FIELDS.map(key => [key, ''])),
    onboarding: { completedAt: null },
    episodes: [],
    settings: { locale: 'zh', email: '', timeZone: '', emailContent: 'undecided' },
    updatedAt: now(),
  };
}

export function newEntry(text, at, severity = null) {
  return { id: id(), role: 'patient', text, at, recordedAt: now(), severity };
}

export function newEpisode({ title, category, startedAt, entry }) {
  const createdAt = now();
  return {
    id: id(), title, category, status: 'tracking', startedAt, createdAt, updatedAt: createdAt,
    entries: [entry], facts: [], briefs: [], visits: [], relatedIds: [],
    reminder: { nextAt: null, enabled: false }, patientQuestions: '',
  };
}

export class JournalStore {
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS journals (dataset TEXT PRIMARY KEY, revision INTEGER NOT NULL, state TEXT NOT NULL) STRICT;');
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec('CREATE TABLE IF NOT EXISTS workflow_runs (dataset TEXT NOT NULL, run_id TEXT NOT NULL, episode_id TEXT NOT NULL, record TEXT NOT NULL, PRIMARY KEY(dataset, run_id)) STRICT;');
    // A process restart cannot resume an in-memory provider request.
    for (const row of this.db.prepare('SELECT dataset, run_id, record FROM workflow_runs').all()) {
      const run = JSON.parse(row.record);
      if (run.status === 'running') {
        run.status = 'interrupted'; run.finishedAt = now(); run.errorCode = 'WORKFLOW_INTERRUPTED';
        for (const step of run.steps) if (step.status === 'running') { step.status = 'interrupted'; step.finishedAt = now(); step.resultCode = 'WORKFLOW_INTERRUPTED'; }
        this.db.prepare('UPDATE workflow_runs SET record = ? WHERE dataset = ? AND run_id = ?').run(JSON.stringify(run), row.dataset, row.run_id);
      }
    }
    this.getRow = this.db.prepare('SELECT state FROM journals WHERE dataset = ?');
    this.insert = this.db.prepare('INSERT OR IGNORE INTO journals (dataset, revision, state) VALUES (?, 0, ?)');
    this.update = this.db.prepare('UPDATE journals SET state = ?, revision = ? WHERE dataset = ? AND revision = ?');
  }

  read(dataset = 'real') {
    this.insert.run(dataset, JSON.stringify(emptyState()));
    return JSON.parse(this.getRow.get(dataset).state);
  }

  mutate(dataset, expectedRevision, callback) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const state = this.read(dataset);
      assertRevision(state, expectedRevision);
      const result = callback(state) || {};
      state.revision += 1;
      state.updatedAt = now();
      this.update.run(JSON.stringify(state), state.revision, dataset, expectedRevision);
      this.db.exec('COMMIT');
      return { state, ...result };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  replace(dataset, next, expectedRevision = this.read(dataset).revision) {
    return this.mutate(dataset, expectedRevision, state => {
      this.db.prepare('DELETE FROM workflow_runs WHERE dataset = ?').run(dataset);
      const revision = state.revision;
      Object.assign(state, next, { revision });
    });
  }

  runs(dataset, episodeId) {
    return this.db.prepare('SELECT record FROM workflow_runs WHERE dataset = ? AND episode_id = ? ORDER BY rowid DESC').all(dataset, episodeId).map(row => JSON.parse(row.record));
  }

  run(dataset, runId) {
    const row = this.db.prepare('SELECT record FROM workflow_runs WHERE dataset = ? AND run_id = ?').get(dataset, runId);
    return row ? JSON.parse(row.record) : null;
  }

  saveRun(dataset, run, { existingOnly = false } = {}) {
    if (existingOnly && !this.run(dataset,run.runId)) throw new Error('Workflow was cleared.');
    this.db.prepare('INSERT INTO workflow_runs(dataset, run_id, episode_id, record) VALUES(?,?,?,?) ON CONFLICT(dataset,run_id) DO UPDATE SET record=excluded.record').run(dataset, run.runId, run.episodeId, JSON.stringify(run));
    this.db.prepare('DELETE FROM workflow_runs WHERE dataset = ? AND episode_id = ? AND run_id NOT IN (SELECT run_id FROM workflow_runs WHERE dataset = ? AND episode_id = ? ORDER BY rowid DESC LIMIT 30)').run(dataset, run.episodeId, dataset, run.episodeId);
  }

  export(dataset) {
    return { ...this.read(dataset), workflowRuns: this.db.prepare('SELECT record FROM workflow_runs WHERE dataset = ? ORDER BY rowid').all(dataset).map(row => JSON.parse(row.record)) };
  }

  close() { this.db.close(); }
}

export function demoState() {
  const state = emptyState();
  state.profile = { ...state.profile, name: 'Alex (fictional)', conditions: 'No conditions entered in this fictional example.', allergies: 'Unknown', notes: 'Fictional demonstration data. Not a real patient.' };
  const ago = (days, hours = 0) => new Date(Date.now() - (days * 24 + hours) * 3600_000).toISOString();
  const earlier = newEpisode({ title: 'Earlier stomach discomfort', category: 'abdomen', startedAt: ago(90), entry: newEntry('A mild stomach ache after a long day. This is a fictional example.', ago(90), 3) });
  earlier.createdAt = ago(90); earlier.updatedAt = ago(86); earlier.status = 'closed';
  earlier.entries[0].recordedAt = ago(90);
  earlier.visits.push({ id: id(), date: ago(88).slice(0, 10), clinician: 'Example clinician', diagnosis: 'The clinician said the cause was uncertain at that visit.', treatment: 'No treatment entered.', tests: '', followUp: 'Record changes and discuss at follow-up.', notes: 'Fictional patient-entered visit outcome; not a current diagnosis.', createdAt: ago(88) });
  const current = newEpisode({ title: 'Stomach discomfort this week', category: 'abdomen', startedAt: ago(3), entry: newEntry('I noticed a dull ache in the upper part of my stomach after dinner.', ago(3), 4) });
  current.entries.push(newEntry('Yesterday it came and went. I was able to attend class.', ago(2), 3), newEntry('Today the ache returned after lunch and lasted about 20 minutes.', ago(1), 4));
  current.entries.forEach(entry => { entry.recordedAt = entry.at; });
  current.createdAt = ago(3); current.updatedAt = ago(1); current.relatedIds = [earlier.id];
  state.episodes = [current, earlier];
  return state;
}
