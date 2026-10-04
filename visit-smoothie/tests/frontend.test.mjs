import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { blankProfile, view } from '../public/views.js';
import { calculateAge } from '../public/profile-model.js';

const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8').replace(/^import .*\n/gmu, '').replace(/checkSession\(\);\s*$/u, '');
function harness() {
  const requests = [], handlers = {}, broadcasts = [], toast = { hidden: true, textContent: '' };
  const root = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [], addEventListener: (name, fn) => { handlers[name] = fn; } };
  const ctx = vm.createContext({
    blankProfile, view, calculateAge, console, setTimeout: () => 0, clearTimeout, Intl, AbortController,
    navigator: { locks: { request: (_name, _options, callback) => callback() } },
    location: { hash: '' }, history: { replaceState() {} },
    window: { addEventListener() {}, scrollTo() {} },
    document: { querySelector: selector => selector === '#toast' ? toast : root, addEventListener() {} },
    BroadcastChannel: class { postMessage(value) { broadcasts.push(value); } },
    fetch: (url, options) => new Promise(resolve => requests.push({ url, options, resolve })),
  });
  vm.runInContext(source, ctx);
  const evaluate = code => vm.runInContext(code, ctx);
  evaluate(`render=()=>{};state.checking=false`);
  const respond = async (index, body, status = 200) => { requests[index].resolve({ ok: status < 400, status, json: async () => body }); await new Promise(resolve => setImmediate(resolve)); };
  return { requests, evaluate, respond, broadcasts, toast };
}
test('transient drafts never retain password fields', () => {
  const h = harness();
  h.evaluate(`remember({id:'register-form',elements:[{name:'name',value:'测试',type:'text'},{name:'password',value:'not stored',type:'password'},{name:'confirmPassword',value:'not stored',type:'password'}]})`);
  assert.equal(h.evaluate(`JSON.stringify(drafts.get('register-form'))`), '{"name":"测试"}');
});
test('clearing a session erases profile data, form drafts and success messages', () => {
  const h = harness();
  h.evaluate(`state.account={id:'A',name:'甲'};state.profile.allergies='Private A';drafts.set('profile-form',{allergies:'A draft'});clearSession()`);
  assert.equal(h.evaluate('state.account'), null);
  assert.equal(h.evaluate('state.profile.allergies'), '');
  assert.equal(h.evaluate('drafts.size'), 0);
  assert.equal(h.toast.hidden, true);
});
test('late profile responses after logout are discarded and cannot restore the old account', async () => {
  const h = harness();
  h.evaluate(`state.account={id:'A',name:'甲'};perform(async()=>Object.assign(state,await request('/profile')));clearSession()`);
  assert.equal(h.requests[0].options.headers['X-Account-Id'], 'A');
  assert.equal(h.requests[0].options.signal.aborted, true);
  await h.respond(0, { account: { id: 'A', name: '甲' }, profile: { allergies: 'Private A' } });
  assert.equal(h.evaluate('state.account'), null);
  assert.equal(h.evaluate('state.profile.allergies'), '');
});
test('session refresh retains a dirty profile draft at its original revision', async () => {
  const h = harness();
  h.evaluate(`state.account={id:'A',name:'甲'};state.revision=0;state.profile.conditions='old';drafts.set('profile-form',{conditions:'old',allergies:'my draft'});checkSession()`);
  await h.respond(0, { account: { id: 'A', name: '甲' }, profile: { conditions: 'other tab update' }, revision: 1 });
  assert.equal(h.evaluate('state.revision'), 0);
  assert.equal(h.evaluate(`drafts.get('profile-form').allergies`), 'my draft');
  assert.match(h.evaluate('state.error'), /其他页面更新/u);
  h.evaluate(`perform(()=>request('/profile','PUT',{profile:drafts.get('profile-form'),revision:state.revision}))`);
  assert.equal(JSON.parse(h.requests[1].options.body).revision, 0);
  await h.respond(1, { code: 'STALE_PROFILE', error: '资料已在其他页面更新。' }, 409);
  assert.equal(h.evaluate(`drafts.get('profile-form').allergies`), 'my draft');
});
test('invalidating a queued login prevents it from sending or changing the cookie', async () => {
  const h = harness();
  h.evaluate(`let queued; navigator.locks.request=(_name,options,callback)=>new Promise((resolve,reject)=>{queued=callback;options.signal.addEventListener('abort',()=>reject(new Error('aborted')))});perform(()=>request('/login','POST',{name:'甲',password:'synthetic-password'}));clearSession()`);
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(h.evaluate('queued()'), { code: 'SUPERSEDED' });
  assert.equal(h.requests.length, 0);
  assert.equal(h.evaluate('state.account'), null);
});
test('an older session check cannot end a newer session check', async () => {
  const h = harness();
  h.evaluate('checkSession();clearSession();checkSession()');
  await h.respond(0, { account: null });
  assert.equal(h.evaluate('state.checking'), true);
  await h.respond(1, { account: null });
  assert.equal(h.evaluate('state.checking'), false);
});
test('an expired session removes displayed health data and returns to login', async () => {
  const h = harness();
  h.evaluate(`state.account={id:'A',name:'甲'};state.profile.conditions='Private';perform(()=>request('/profile'))`);
  await h.respond(0, { code: 'AUTH_REQUIRED', error: '请先登录。' }, 401);
  assert.equal(h.evaluate('state.account'), null);
  assert.equal(h.evaluate('state.page'), 'login');
  assert.equal(h.evaluate('state.profile.conditions'), '');
});
test('another-tab session change clears old drafts before adopting the new account', async () => {
  const h = harness();
  h.evaluate(`state.account={id:'A',name:'甲'};drafts.set('profile-form',{conditions:'A draft'});channel.onmessage()`);
  assert.equal(h.evaluate('state.account'), null);
  assert.equal(h.evaluate('drafts.size'), 0);
  await h.respond(0, { account: { id: 'B', name: '乙' }, profile: { name: '乙', conditions: '' }, revision: 0 });
  assert.equal(h.evaluate('state.account.id'), 'B');
  assert.equal(h.evaluate('state.profile.conditions'), '');
});
test('a failed save preserves non-password input and restores the enabled state', async () => {
  const h = harness();
  h.evaluate(`drafts.set('register-form',{name:'测试',conditions:'draft'});perform(()=>request('/register','POST',{}))`);
  await h.respond(0, { error: '该姓名已注册。' }, 409);
  assert.equal(h.evaluate(`drafts.get('register-form').conditions`), 'draft');
  assert.equal(h.evaluate('state.busy'), false);
  assert.equal(h.evaluate('state.error'), '该姓名已注册。');
});
test('the UI safely escapes profile values and contains only the requested profile and account controls', () => {
  const profile = { ...blankProfile(), name: '"><script>bad</script>', conditions: '</textarea><script>bad</script>' };
  const html = view({ profile, account: null, page: 'register', busy: false, checking: false, error: '' });
  assert.doesNotMatch(html, /<script>/u);
  assert.doesNotMatch(html, /Health Journal|AI|摘要|症状记录|偏好设置|name="age"/u);
  assert.match(html, /可跳过/u);
  assert.equal((html.match(/<textarea /gu) || []).length, 3);
  assert.equal((html.match(/type="password"/gu) || []).length, 2);
  const editing = view({ profile, account: { id: 'A', name: '测试' }, page: 'profile', error: '' });
  assert.match(editing, /退出登录/u);
  assert.match(editing, /readonly/u);
  assert.doesNotMatch(editing, /type="password"/u);
});
