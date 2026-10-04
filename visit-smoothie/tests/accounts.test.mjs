import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from '../server.mjs';
import { Accounts, SESSION_SECONDS } from '../server/accounts.mjs';
import { profile as validateProfile, username } from '../server/validation.mjs';
import { calculateAge, todayLocal } from '../public/profile-model.js';

const PASSWORD = 'synthetic-only-passphrase-2026';
const details = (name = '测试甲') => ({ name, dob: '2008-10-03', sex: 'female', education: 'senior', conditions: '', familyHistory: '', allergies: '' });
async function setup(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'smoothie-accounts-test-'));
  const dbPath = path.join(dir, 'accounts.sqlite');
  let time = Date.parse('2026-10-03T19:00:00Z');
  let server;
  async function start() { server = createServer({ dbPath, now: () => time }); server.listen(0, '127.0.0.1'); await once(server, 'listening'); }
  async function stop() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await start();
  t.after(async () => { await stop(); await rm(dir, { recursive: true, force: true }); });
  const request = async (method, endpoint, body, session, extraHeaders = {}, signal) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${endpoint}`, {
      method, signal, headers: { 'Content-Type': 'application/json', 'X-App-Request': 'VisitSmoothie', ...(session ? { Cookie: session.cookie, 'X-Account-Id': session.account.id } : {}), ...extraHeaders },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const raw = await response.text();
    let data; try { data = JSON.parse(raw); } catch { data = raw; }
    return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0], headers: response.headers };
  };
  const register = async (name = '测试甲', profile = details(name)) => {
    const result = await request('POST', '/api/register', { profile, password: PASSWORD, timeZone: 'America/Los_Angeles' });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    return { ...result.data, cookie: result.cookie };
  };
  return { request, register, dbPath, server: () => server, advance: ms => { time += ms; }, restart: async () => { await stop(); await start(); } };
}

test('age uses calendar birthdays, leap days and valid full dates only', () => {
  assert.equal(calculateAge('2008-10-03', new Date(2026, 9, 2)), 17);
  assert.equal(calculateAge('2008-10-03', new Date(2026, 9, 3)), 18);
  assert.equal(calculateAge('2026-10-03', new Date(2026, 9, 3)), 0);
  assert.equal(calculateAge('2008-02-29', new Date(2026, 1, 28)), 17);
  assert.equal(calculateAge('2008-02-29', new Date(2026, 2, 1)), 18);
  for (const dob of ['', '2026-02-30', '2007-02-29', '2200-01-01', '2008-10', ['2008-10-03'], null, 20261003]) assert.equal(calculateAge(dob, new Date(2026, 9, 3)), null);
  assert.equal(todayLocal(new Date('2026-10-03T03:00:00Z'), 'America/Los_Angeles'), '2026-10-02');
});
test('registration profile accepts exactly seven fields and requires the four identity fields', () => {
  const options = { timeZone: 'America/Los_Angeles', now: new Date('2026-10-03T03:00:00Z') };
  for (const name of ['name', 'dob', 'sex', 'education']) assert.throws(() => validateProfile({ ...details(), [name]: '' }, options));
  for (const patch of [{ dob: '2026-10-03' }, { dob: '2008-02-30' }, { dob: ['2008-10-03'] }, { sex: 'other' }, { education: 'unknown' }, { age: 18 }, { conditions: null }]) assert.throws(() => validateProfile({ ...details(), ...patch }, options));
  assert.deepEqual(validateProfile(details(), options), details());
  assert.deepEqual(username(' Ｌｉ   Ming '), { name: 'Li Ming', key: 'li ming' });
});
test('anonymous requests cannot read or change profiles and no old APIs/assets remain', async t => {
  const { request } = await setup(t);
  assert.deepEqual((await request('GET', '/api/session')).data, { account: null });
  assert.equal((await request('GET', '/api/profile')).status, 401);
  assert.equal((await request('PUT', '/api/profile', { profile: details(), revision: 0 })).status, 401);
  assert.equal((await request('GET', '/workflow-design.html')).status, 404);
  assert.equal((await request('GET', '/server/accounts.mjs')).status, 404);
  assert.equal((await request('GET', '/.data/accounts.sqlite')).status, 404);
});
test('registration creates a private profile and stores only salted password and session hashes', async t => {
  const { register, request, dbPath } = await setup(t);
  const a = await register();
  assert.match(a.account.id, /^[a-f0-9-]{36}$/u);
  assert.deepEqual(a.profile, details());
  assert.equal(a.revision, 0);
  assert.equal('age' in a.profile, false);
  assert.doesNotMatch(JSON.stringify(a), /password_hash|token_hash/u);
  const state = await request('GET', '/api/session', undefined, a);
  assert.deepEqual(state.data.account, a.account);
  const db = new DatabaseSync(dbPath);
  try {
    const row = db.prepare('SELECT * FROM users').get();
    assert.match(row.password_hash, /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/u);
    assert.ok(!JSON.stringify(row).includes(PASSWORD));
    const session = db.prepare('SELECT * FROM sessions').get();
    assert.equal(session.token_hash.length, 64);
    assert.notEqual(session.token_hash, a.cookie.split('=')[1]);
  } finally { db.close(); }
});
test('session cookie has HttpOnly/SameSite protections, and name login works after logout', async t => {
  const { request } = await setup(t);
  const registered = await request('POST', '/api/register', { profile: details('  Ｌｉ   Ming '), password: PASSWORD });
  assert.equal(registered.status, 201);
  assert.match(registered.headers.get('set-cookie'), /HttpOnly; SameSite=Strict; Max-Age=604800/u);
  const a = { ...registered.data, cookie: registered.cookie };
  assert.equal(a.account.name, 'Li Ming');
  assert.equal((await request('POST', '/api/logout', {}, a)).status, 200);
  assert.equal((await request('GET', '/api/profile', undefined, a)).status, 401);
  const logged = await request('POST', '/api/login', { name: 'li ming', password: PASSWORD });
  assert.equal(logged.status, 200);
  assert.equal(logged.data.account.id, a.account.id);
  assert.notEqual(logged.cookie, a.cookie);
});
test('two users have independent profiles, even when a client supplies another user ID', async t => {
  const { register, request } = await setup(t);
  const a = await register('甲', { ...details('甲'), conditions: '甲的虚构基础病' });
  const b = await register('乙');
  assert.notEqual(a.account.id, b.account.id);
  const edited = await request('PUT', '/api/profile', { profile: { ...a.profile, allergies: '甲的虚构过敏史' }, revision: 0 }, a);
  assert.equal(edited.status, 200);
  const bView = await request('GET', `/api/profile?userId=${a.account.id}`, undefined, b);
  assert.equal(bView.data.account.id, b.account.id);
  assert.equal(bView.data.profile.conditions, '');
  assert.equal(bView.data.profile.allergies, '');
  assert.equal((await request('PUT', '/api/profile', { profile: a.profile, revision: 0 }, b, { 'X-Account-Id': a.account.id })).status, 409);
  assert.equal((await request('PUT', '/api/profile', { profile: b.profile, revision: 0, userId: a.account.id }, b)).status, 400);
  assert.equal((await request('GET', '/api/export', undefined, a)).status, 404);
  assert.equal((await request('POST', '/api/episodes', {}, a)).status, 404);
  assert.equal((await request('GET', '/api/profile', undefined, a)).data.profile.allergies, '甲的虚构过敏史');
});
test('profile history edits persist across restart and stale revisions cannot overwrite them', async t => {
  const h = await setup(t);
  const a = await h.register();
  const changed = { ...a.profile, conditions: '虚构基础病\n第二行', familyHistory: '虚构家族史', allergies: '虚构食物过敏' };
  assert.equal((await h.request('PUT', '/api/profile', { profile: changed, revision: 0 }, a)).status, 200);
  assert.equal((await h.request('PUT', '/api/profile', { profile: a.profile, revision: 0 }, a)).data.code, 'STALE_PROFILE');
  await h.restart();
  assert.deepEqual((await h.request('GET', '/api/profile', undefined, a)).data.profile, changed);
  assert.equal((await h.request('PUT', '/api/profile', { profile: { ...changed, name: '新姓名' }, revision: 1 }, a)).data.code, 'NAME_IMMUTABLE');
});
test('duplicate normalized names, short passwords and invalid registration never create another user', async t => {
  const { register, request, dbPath } = await setup(t);
  await register('Test User');
  assert.equal((await request('POST', '/api/register', { profile: details(' Ｔｅｓｔ  User '), password: PASSWORD })).data.code, 'NAME_TAKEN');
  assert.equal((await request('POST', '/api/register', { profile: details('Other'), password: 'short' })).status, 400);
  assert.equal((await request('POST', '/api/register', { profile: { ...details('Third'), dob: '2200-01-01' }, password: PASSWORD })).status, 400);
  const db = new DatabaseSync(dbPath);
  try { assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1); } finally { db.close(); }
});
test('incorrect and nonexistent credentials give the same error, and repeated attempts are throttled', async t => {
  const h = await setup(t);
  await h.register('Login Test');
  const wrong = await h.request('POST', '/api/login', { name: 'Login Test', password: 'wrong' });
  const missing = await h.request('POST', '/api/login', { name: 'Missing Test', password: 'wrong' });
  assert.deepEqual(wrong.data, missing.data);
  assert.equal(wrong.status, 401);
  for (let i = 0; i < 3; i++) assert.equal((await h.request('POST', '/api/login', { name: 'Login Test', password: 'wrong' })).status, 401);
  assert.equal((await h.request('POST', '/api/login', { name: 'Login Test', password: PASSWORD })).status, 429);
  h.advance(15 * 60_000 + 1);
  assert.equal((await h.request('POST', '/api/login', { name: 'Login Test', password: PASSWORD })).status, 200);
});
test('expired, fabricated and revoked sessions cannot access a profile', async t => {
  const h = await setup(t);
  const a = await h.register();
  assert.equal((await h.request('GET', '/api/profile', undefined, { ...a, cookie: 'visit_smoothie_session=' + 'a'.repeat(43) })).status, 401);
  h.advance(SESSION_SECONDS * 1000 + 1);
  assert.equal((await h.request('GET', '/api/profile', undefined, a)).status, 401);
  assert.deepEqual((await h.request('GET', '/api/session', undefined, a)).data, { account: null });
});
test('origin, request marker and account binding checks reject forged requests', async t => {
  const h = await setup(t);
  const a = await h.register();
  assert.equal((await h.request('GET', '/api/profile', undefined, a, { 'X-Account-Id': '' })).status, 409);
  assert.equal((await h.request('PUT', '/api/profile', { profile: a.profile, revision: 0 }, a, { Origin: 'https://evil.invalid' })).status, 403);
  assert.equal((await h.request('POST', '/api/logout', {}, a, { 'X-App-Request': '' })).status, 403);
  assert.equal((await h.request('POST', '/api/login', { name: 'Test', password: PASSWORD }, undefined, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await h.request('GET', '/api/session', undefined, a, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
});
test('account salts are unique for identical passwords and session count is bounded', async () => {
  const db = new Accounts(':memory:');
  try {
    const a = await db.register(details('A'), PASSWORD, 'test-a');
    await db.register(details('B'), PASSWORD, 'test-b');
    const hashes = db.db.prepare('SELECT password_hash FROM users').all();
    assert.notEqual(hashes[0].password_hash, hashes[1].password_hash);
    for (let i = 0; i < 12; i++) db.createSession(a.account.id);
    assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id=?').get(a.account.id).n, 10);
  } finally { db.close(); }
});
test('an aborted delayed login cannot issue a cookie or leave a session after another tab logs out', async t => {
  const h = await setup(t);
  const a = await h.register('Delayed A');
  const b = await h.register('Current B');
  await h.request('POST', '/api/logout', {}, a);
  await h.request('POST', '/api/logout', {}, b);
  const original = Accounts.prototype.hash;
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  let hold = true;
  Accounts.prototype.hash = async function (...args) {
    const result = await original.apply(this, args);
    if (hold) { hold = false; entered(); await gate; }
    return result;
  };
  t.after(() => { Accounts.prototype.hash = original; release(); });
  const closed = new Promise(resolve => h.server().once('request', (_req, res) => res.once('close', resolve)));
  const controller = new AbortController();
  const late = h.request('POST', '/api/login', { name: a.account.name, password: PASSWORD }, undefined, {}, controller.signal);
  const cancelled = assert.rejects(late, { name: 'AbortError' });
  await started;
  // Cross-tab session invalidation aborts A before B changes the shared cookie.
  controller.abort();
  await Promise.all([cancelled, closed]);
  const loginB = await h.request('POST', '/api/login', { name: b.account.name, password: PASSWORD });
  assert.equal(loginB.status, 200);
  const logoutB = await h.request('POST', '/api/logout', {}, { ...loginB.data, cookie: loginB.cookie });
  assert.match(logoutB.headers.get('set-cookie'), /Max-Age=0/u);
  release();
  await new Promise(resolve => setImmediate(resolve));
  const db = new DatabaseSync(h.dbPath);
  try { assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0); }
  finally { db.close(); }
  assert.deepEqual((await h.request('GET', '/api/session', undefined, { account: b.account, cookie: logoutB.cookie })).data, { account: null });
});
