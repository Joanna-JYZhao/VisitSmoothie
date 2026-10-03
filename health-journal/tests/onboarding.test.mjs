import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from '../server.mjs';
import { JournalStore, emptyState } from '../server/store.mjs';
import { calculateAge, needsOnboarding, todayLocal } from '../public/profile-model.js';
import { onboardingView } from '../public/onboarding.js';

const basic = { name: '小林（测试）', dob: '2008-10-03', sex: 'female', education: 'senior' };
async function setup(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'smoothie-registration-'));
  const dbPath = path.join(directory, 'journal.sqlite');
  const server = createServer({ dbPath });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const request = async (method, endpoint, body, dataset = 'real') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${endpoint}`, {
      method, headers: { 'Content-Type': 'application/json', 'X-Journal-Dataset': dataset },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, ...(await response.json()) };
  };
  return { request, dbPath };
}

test('age is calculated by the local birthday, including infants and leap days', () => {
  assert.equal(calculateAge('2008-10-03', new Date(2026, 9, 2, 23, 59)), 17);
  assert.equal(calculateAge('2008-10-03', new Date(2026, 9, 3)), 18);
  assert.equal(calculateAge('2008-10-03', new Date(2026, 9, 4)), 18);
  assert.equal(calculateAge('2026-10-03', new Date(2026, 9, 3)), 0);
  assert.equal(calculateAge('2008-02-29', new Date(2026, 1, 28)), 17);
  assert.equal(calculateAge('2008-02-29', new Date(2026, 2, 1)), 18);
  for (const dob of ['', '2026-02-30', '2026-13-01', '2007-02-29', '2008-10', '1800-01-01', '2027-01-01']) {
    assert.equal(calculateAge(dob, new Date(2026, 9, 3)), null, dob);
  }
  assert.equal(todayLocal(new Date('2026-10-03T03:00:00Z'), 'America/Los_Angeles'), '2026-10-02');
  assert.equal(todayLocal(new Date('2026-10-03T23:00:00Z'), 'Asia/Shanghai'), '2026-10-04');
});

test('onboarding distinguishes fresh, registered, demo and existing legacy journals', () => {
  const state = emptyState();
  assert.equal(needsOnboarding(state), true);
  state.profile.name = 'Partial profile';
  assert.equal(needsOnboarding(state), true);
  state.onboarding.completedAt = new Date().toISOString();
  assert.equal(needsOnboarding(state), false);
  assert.equal(needsOnboarding(emptyState(), 'demo'), false);
  const legacy = emptyState();
  delete legacy.onboarding;
  assert.equal(needsOnboarding(legacy), true);
  legacy.profile.conditions = 'Existing history';
  assert.equal(needsOnboarding(legacy), false);
  legacy.profile.conditions = '';
  legacy.episodes.push({ id: 'legacy-episode' });
  assert.equal(needsOnboarding(legacy), false);
});

test('registration validates required fields, dates, options and types without partial writes', async t => {
  const { request } = await setup(t);
  for (const profile of [
    ...['name', 'dob', 'sex', 'education'].map(key => ({ ...basic, [key]: '' })),
    ...['name', 'dob', 'sex', 'education'].map(key => Object.fromEntries(Object.entries(basic).filter(([k]) => k !== key))),
    { ...basic, name: '   ' }, { ...basic, dob: '2008-02-30' }, { ...basic, dob: '2200-01-01' },
    { ...basic, sex: 'invalid' }, { ...basic, education: 'invalid' }, { ...basic, age: 18 },
    { ...basic, conditions: [] }, { ...basic, name: 'a'.repeat(121) },
  ]) {
    const result = await request('POST', '/registration', { profile, revision: 0 });
    assert.equal(result.status, 400, JSON.stringify(profile));
    const { state } = await request('GET', '/state');
    assert.equal(state.revision, 0);
    assert.equal(state.profile.name, '');
    assert.equal(state.onboarding.completedAt, null);
  }
});

test('registration permits skipping all health history and persists completion across database reopen', async t => {
  const { request, dbPath } = await setup(t);
  const result = await request('POST', '/registration', { profile: basic, revision: 0, timeZone: 'America/Los_Angeles' });
  assert.equal(result.status, 201);
  assert.equal(result.state.revision, 1);
  assert.equal(result.state.settings.timeZone, 'America/Los_Angeles');
  assert.equal(needsOnboarding(result.state), false);
  for (const field of ['conditions', 'familyHistory', 'allergies']) assert.equal(result.state.profile[field], '');
  assert.equal('age' in result.state.profile, false);
  const reopened = new JournalStore(dbPath);
  try {
    assert.deepEqual(reopened.read(), result.state);
  } finally { reopened.close(); }
  assert.equal((await request('GET', '/state', undefined, 'demo')).state.profile.name, '');
  assert.equal((await request('POST', '/registration', { profile: basic, revision: 1 })).status, 409);
});

test('later health history edits persist, preserve required identity, and protect against stale changes', async t => {
  const { request } = await setup(t);
  const original = await request('POST', '/registration', { profile: { ...basic, conditions: '测试基础病\n第二行' }, revision: 0 });
  const result = await request('PUT', '/profile', { profile: { familyHistory: '测试家族史', allergies: '测试药物过敏' }, revision: 1 });
  assert.equal(result.status, 200);
  assert.equal(result.state.profile.name, basic.name);
  assert.equal(result.state.profile.conditions, '测试基础病\n第二行');
  assert.equal(result.state.profile.familyHistory, '测试家族史');
  assert.equal(result.state.profile.allergies, '测试药物过敏');
  assert.deepEqual(result.state.onboarding, original.state.onboarding);
  assert.equal((await request('PUT', '/profile', { profile: { name: '' }, revision: 2 })).status, 400);
  assert.equal((await request('PUT', '/profile', { profile: { allergies: 'lost update' }, revision: 1 })).status, 409);
  assert.equal((await request('GET', '/state')).state.profile.allergies, '测试药物过敏');
});

test('registration rejects invalid timezones and stale submissions atomically', async t => {
  const { request } = await setup(t);
  assert.equal((await request('POST', '/registration', { profile: basic, revision: 0, timeZone: 'Invalid/Zone' })).status, 400);
  await request('PUT', '/settings', { settings: { locale: 'en' }, revision: 0 });
  assert.equal((await request('POST', '/registration', { profile: basic, revision: 0 })).status, 409);
  const { state } = await request('GET', '/state');
  assert.equal(state.profile.name, '');
  assert.equal(state.onboarding.completedAt, null);
});

test('registration safely renders stored values and exactly the seven requested fields', () => {
  const state = emptyState();
  state.profile.name = '"><script>alert(1)</script>';
  state.profile.conditions = '</textarea><script>alert(2)</script>';
  const html = onboardingView({ state, page: 'register', t: (en, zh) => zh, icon: () => '', esc: value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])) });
  assert.doesNotMatch(html, /<script>/u);
  assert.match(html, /可跳过/u);
  assert.equal((html.match(/<(?:input|select|textarea) /gu) || []).length, 7);
  assert.equal((html.match(/ required>/gu) || []).length, 4);
  assert.doesNotMatch(html, /name="age"/u);
});
