import { blankProfile, view } from './views.js';
import { calculateAge } from './profile-model.js';

const root = document.querySelector('#app');
let state = { account: null, profile: blankProfile(), revision: 0, page: 'welcome', error: '', busy: false, checking: true };
let generation = 0;
const drafts = new Map();
const pendingRequests = new Set();
let sessionCheck = 0;
let channel;
try { channel = new BroadcastChannel('visit-smoothie-session'); } catch { /* Session checks still protect every request. */ }

function clearSession() {
  generation++;
  sessionCheck++;
  for (const controller of pendingRequests) controller.abort();
  pendingRequests.clear();
  drafts.clear();
  state = { account: null, profile: blankProfile(), revision: 0, page: 'login', error: '', busy: false, checking: false };
  const toast = document.querySelector('#toast');
  toast.textContent = ''; toast.hidden = true;
  root.innerHTML = '';
}
function remember(form) {
  drafts.set(form.id, Object.fromEntries([...form.elements].filter(el => el.name && el.type !== 'password').map(el => [el.name, el.value])));
}
function syncValidation() {
  const name = root.querySelector('#p-name') || root.querySelector('#login-name');
  if (name) name.setCustomValidity(name.value.trim() ? '' : '请填写姓名。');
  const nickname = root.querySelector('#p-nickname');
  if (nickname) nickname.setCustomValidity(nickname.value.trim() ? '' : '请填写昵称。');
  const dob = root.querySelector('#p-dob'), output = root.querySelector('#profile-age');
  if (dob && output) { const age = calculateAge(dob.value); output.textContent = age === null ? '选择出生年月日，自动计算年龄。' : `${age} 岁 · 根据出生日期自动计算`; }
  const secret = root.querySelector('#password'), confirm = root.querySelector('#confirm-password');
  if (confirm) confirm.setCustomValidity(confirm.value && confirm.value !== secret.value ? '两次输入的密码不一致。' : '');
}
function render() {
  if (state.account) state.page = 'profile';
  else if (!['welcome', 'register', 'login'].includes(state.page)) state.page = 'login';
  root.innerHTML = view(state);
  for (const form of root.querySelectorAll('form')) for (const el of form.elements) {
    const values = drafts.get(form.id);
    if (el.type !== 'password' && values && Object.hasOwn(values, el.name)) el.value = values[el.name];
  }
  for (const el of root.querySelectorAll('button,input,select,textarea')) el.disabled = state.busy || state.checking;
  syncValidation();
  document.title = `Visit Smoothie · ${state.account ? '个人资料' : state.page === 'login' ? '登录' : '注册'}`;
  if (location.hash !== `#${state.page}`) history.replaceState(null, '', `#${state.page}`);
}
function navigate(page) { if (state.busy) return; state.page = page; state.error = ''; render(); root.querySelector('#main')?.focus(); window.scrollTo({ top: 0, behavior: 'instant' }); }
function toast(message) { const el = document.querySelector('#toast'); el.textContent = message; el.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => { el.hidden = true; }, 4000); }
function stale() { return Object.assign(new Error('请求已过期。'), { code: 'SUPERSEDED' }); }

async function request(endpoint, method = 'GET', body) {
  const version = generation;
  const controller = new AbortController();
  pendingRequests.add(controller);
  const send = async () => {
    if (version !== generation || controller.signal.aborted) throw stale();
    return fetch(`/api${endpoint}`, {
      method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-App-Request': 'VisitSmoothie', ...(state.account ? { 'X-Account-Id': state.account.id } : {}) },
      signal: controller.signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  };
  let response;
  try {
    // Serialize cookie-changing responses across tabs, including an explicit logout.
    if (['/login', '/register', '/logout'].includes(endpoint)) {
      if (!navigator.locks) throw new Error('当前浏览器不支持安全登录，请更新浏览器后重试。');
      response = await navigator.locks.request('visit-smoothie-auth', { signal: controller.signal }, send);
    } else response = await send();
    const result = await response.json();
    if (version !== generation) throw stale();
    if (!response.ok) {
      if (result.code === 'AUTH_REQUIRED' || result.code === 'ACCOUNT_CHANGED') {
        clearSession();
        if (result.code === 'ACCOUNT_CHANGED') await checkSession();
        state.error = result.error; render(); throw stale();
      }
      throw Object.assign(new Error(result.error || '暂时无法保存，请重试。'), { code: result.code });
    }
    return result;
  } finally { pendingRequests.delete(controller); }
}
function adopt(result) {
  clearSession();
  Object.assign(state, result, { page: 'profile' });
  channel?.postMessage('changed');
}
async function perform(action) {
  if (state.busy) return;
  const version = generation;
  state.busy = true; state.error = ''; render();
  try { await action(); }
  catch (error) { if (version === generation && error.code !== 'SUPERSEDED') state.error = error.message || '连接失败，请检查服务后重试。'; }
  finally { if (version === generation) state.busy = false; render(); }
}
async function checkSession() {
  const version = generation;
  let check = ++sessionCheck;
  state.checking = true; render();
  try {
    const result = await request('/session');
    if (version !== generation || check !== sessionCheck) return;
    if (result.account?.id !== state.account?.id) {
      const previousPage = state.page;
      clearSession();
      check = sessionCheck;
      if (result.account) Object.assign(state, result, { page: 'profile' });
      else state.page = ['welcome', 'register', 'login'].includes(previousPage) ? previousPage : 'login';
    } else if (result.account) {
      if (drafts.has('profile-form')) {
        if (result.revision !== state.revision) state.error = '资料已在其他页面更新。当前草稿仍保留，请刷新后重新编辑。';
      } else Object.assign(state, result);
    }
  } catch (error) { if (version === generation && check === sessionCheck && error.code !== 'SUPERSEDED') { clearSession(); check = sessionCheck; state.error = '连接失败，请确认本机服务已启动，再重新加载。'; } }
  finally { if (check === sessionCheck) { state.checking = false; render(); } }
}

root.addEventListener('input', event => { const form = event.target.closest('form'); if (form) remember(form); syncValidation(); });
root.addEventListener('change', event => { const form = event.target.closest('form'); if (form) remember(form); syncValidation(); });
root.addEventListener('click', event => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action || state.busy || state.checking) return;
  if (action === 'logout') return perform(async () => { await request('/logout', 'POST', {}); clearSession(); channel?.postMessage('changed'); toast('已退出登录。'); });
  navigate(action);
});
root.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target;
  if (state.busy || state.checking || !(form instanceof HTMLFormElement)) return;
  syncValidation();
  if (!form.reportValidity()) return;
  remember(form);
  const values = Object.fromEntries(new FormData(form));
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (form.id === 'login-form') return perform(async () => { adopt(await request('/login', 'POST', { name: values.name, password: values.password })); toast('登录成功。'); });
  const { password, confirmPassword, ...profile } = values;
  if (form.id === 'register-form') return perform(async () => { adopt(await request('/register', 'POST', { profile, password, timeZone })); toast('账号已建立，资料已保存。'); });
  if (form.id === 'profile-form') return perform(async () => {
    Object.assign(state, await request('/profile', 'PUT', { profile, revision: state.revision, timeZone }));
    drafts.delete('profile-form'); toast('个人资料已保存。');
  });
});
window.addEventListener('hashchange', () => { if (!state.busy) navigate(location.hash.slice(1)); });
window.addEventListener('beforeunload', event => { if (state.busy || drafts.size) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('pageshow', event => { if (event.persisted) { clearSession(); checkSession(); } });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { root.innerHTML = '<main class="initial"><p>Visit Smoothie</p></main>'; }
  else if (!state.busy) checkSession();
});
if (channel) channel.onmessage = () => { clearSession(); checkSession(); };
state.page = ['register', 'login'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'welcome';
checkSession();
