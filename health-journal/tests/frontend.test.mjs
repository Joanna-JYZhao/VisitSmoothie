import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { workflowPanel } from '../public/screens.js';

const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8')
  .replace(/^import .*\n/u, '').replace(/init\(\);\s*$/u, '');
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness() {
  const handlers = {}, rootHandlers = {}, windowHandlers = {}, requests = [], controls = [], downloads = [];
  const root = { addEventListener(type, handler) { rootHandlers[type] = handler; }, querySelectorAll() { return []; }, querySelector() { return null; }, focus() {} };
  const dialog = { open: false, contains: () => false, querySelector: () => null, classList: { toggle() {} }, addEventListener() {}, showModal() { this.open = true; }, close() { this.open = false; } };
  class Form {
    constructor(id, values) { this.id = id; this.values = values; this.elements = Object.entries(values).map(([name, value]) => ({ name, value, type: 'text', disabled: false, dataset: {} })); }
    closest() { return this.inDialog ? dialog : null; }
  }
  class FormData {
    constructor(form) { this.values = form.values; }
    get(key) { return this.values[key] ?? null; }
    [Symbol.iterator]() { return Object.entries(this.values)[Symbol.iterator](); }
  }
  const ctx = vm.createContext({
    URLSearchParams, setTimeout: () => 0, clearTimeout, Intl, Date, console,
    URL: { createObjectURL: () => 'blob:download', revokeObjectURL() {} },
    location: { search: '', hash: '' }, history: { replaceState() {} },
    HTMLFormElement: Form, FormData,
    window: { addEventListener(type, handler) { windowHandlers[type] = handler; }, scrollTo() {} },
    document: {
      documentElement: {}, querySelector: selector => selector === '#dialog' ? dialog : root,
      querySelectorAll: () => controls,
      createElement() { const link = { click() { downloads.push({ href: this.href, download: this.download }); } }; return link; },
      addEventListener(type, handler) { handlers[type] = handler; },
    },
    profileView() {}, journalView() {}, episodeView() {}, settingsView() {}, visitForm() {},
    fetch(path, options) { return new Promise(resolve => requests.push({ path, options, resolve })); },
  });
  vm.runInContext(source, ctx);
  const evaluate = code => vm.runInContext(code, ctx);
  evaluate(`render=()=>{if(typeof syncBusyControls==='function')syncBusyControls()};toast=()=>{};state={revision:7,profile:{},episodes:[],settings:{locale:'en'}};page='episode';activeId='A';tab='brief'`);
  const respond = async (index, body, status = 200) => {
    requests[index].resolve({ ok: status < 400, status, json: async () => body, blob: async () => body });
    await tick();
  };
  const seedDraft = (id, text) => evaluate(`briefDrafts.set(typeof briefKey==='function'?briefKey(${JSON.stringify(id)}):${JSON.stringify(id)},{text:${JSON.stringify(text)},sourceRevision:7})`);
  const submit = (id, values, inDialog = false) => { const form = new Form(id, values); form.inDialog = inDialog; handlers.submit({ target: form, preventDefault() {} }); };
  const click = dataset => handlers.click({ target: { closest: () => ({ dataset }) } });
  return { evaluate, respond, requests, seedDraft, submit, controls, windowHandlers, rootHandlers, dialog, Form, click, downloads };
}

test('a draft response stays with the episode requested before navigation', async () => {
  const h = harness();
  h.evaluate('generateBrief()');
  assert.equal(h.requests[0].path, '/api/episodes/A/brief-draft');
  h.evaluate(`navigate('episode','B','brief')`);
  await h.respond(0, { text: 'A symptoms only', sourceRevision: 7 });
  assert.equal(h.evaluate('context().briefDraft'), undefined);
  h.evaluate(`navigate('episode','A','brief')`);
  assert.equal(h.evaluate('context().briefDraft.text'), 'A symptoms only');
});

test('saving an update then navigating reflects its original episode and clears only its form', async () => {
  const h = harness();
  h.evaluate(`tab='entries';formDrafts.set(draftKey('update-form'),{text:'A update'})`);
  h.submit('update-form', { text: 'A update', severity: '', askAI: 'on' });
  h.evaluate(`navigate('episode','B');formDrafts.set(draftKey('update-form'),{text:'B unsaved'})`);
  await h.respond(0, { state: { revision: 8, profile: {}, episodes: [], settings: { locale: 'en' } } });
  assert.equal(h.requests[1].path, '/api/episodes/A/reflect');
  assert.equal(JSON.parse(h.requests[1].options.body).revision, 8);
  assert.equal(h.evaluate(`formDrafts.get(draftKey('update-form')).text`), 'B unsaved');
  h.evaluate(`navigate('episode','A')`);
  assert.equal(h.evaluate(`formDrafts.has(draftKey('update-form'))`), false);
  await h.respond(1, {});
});

test('saving a brief while navigating does not delete or select another episode draft', async () => {
  const h = harness();
  h.seedDraft('A', 'A reviewed');
  h.seedDraft('B', 'B draft');
  h.submit('brief-save-form', { text: 'A reviewed' });
  h.evaluate(`navigate('episode','B','brief')`);
  await h.respond(0, { briefId: 'A-saved' });
  assert.equal(h.evaluate('context().briefDraft.text'), 'B draft');
  assert.equal(h.evaluate('selectedBriefId'), null);
  h.evaluate(`navigate('episode','A','brief')`);
  assert.equal(h.evaluate('context().briefDraft'), undefined);
});

test('pending saves lock editable controls and unlock them on failure', async () => {
  const h = harness();
  const input = { disabled: false, dataset: {} }, alreadyDisabled = { disabled: true, dataset: {} };
  h.controls.push(input, alreadyDisabled);
  h.submit('profile-form', { name: '', allergies: 'Penicillin' });
  assert.equal(input.disabled, true);
  await h.respond(0, { error: 'Validation failed' }, 400);
  assert.equal(input.disabled, false);
  assert.equal(alreadyDisabled.disabled, true);
});

test('clearing one dataset removes its drafts but preserves the other dataset', async () => {
  const h = harness();
  h.seedDraft('A', 'Real draft');
  h.evaluate(`formDrafts.set(draftKey('update-form'),{text:'Real note'});dataset='demo'`);
  h.seedDraft('A', 'Demo draft');
  h.evaluate(`formDrafts.set(draftKey('update-form'),{text:'Demo note'});dataset='real'`);
  h.submit('clear-form', { confirmation: 'DELETE' });
  await h.respond(0, { state: { revision: 8, profile: {}, episodes: [], settings: { locale: 'en' } } });
  assert.equal(h.evaluate(`formDrafts.has('real:episode:A:brief:update-form')`), false);
  assert.equal(h.evaluate(`formDrafts.has('demo:episode:A:brief:update-form')`), true);
  h.evaluate(`dataset='demo';activeId='A'`);
  assert.equal(h.evaluate('context().briefDraft.text'), 'Demo draft');
});

test('an unsuccessful dataset switch cannot relabel the loaded journal', async () => {
  const h = harness();
  h.evaluate(`run(()=>changeDataset('demo'))`);
  await h.respond(0, { error: 'Unavailable' }, 503);
  assert.equal(h.evaluate('dataset'), 'real');
  assert.equal(h.evaluate('state.revision'), 7);
});

test('unsaved optional profile fields trigger the unload warning', () => {
  const h = harness();
  h.evaluate(`page='profile';activeId=null;formDrafts.set(draftKey('profile-form'),{name:'',allergies:'Penicillin'})`);
  let prevented = false;
  h.windowHandlers.beforeunload({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
});

test('completion of an earlier modal save does not close a newly opened modal', async () => {
  const h = harness();
  h.evaluate(`editingEntryId='entry-A';editingEntryAt='2026-10-02T18:30:42.100Z';openDialog('Edit A','');`);
  h.submit('edit-entry-form', { text: 'Correct A', at: '2026-10-02T11:30', severity: '2' }, true);
  h.evaluate(`openDialog('Another dialog','')`);
  await h.respond(0, {});
  assert.equal(h.dialog.open, true);
});

test('snapshot staleness includes linked visit corrections and episode details', () => {
  const h = harness();
  h.evaluate(`state.episodes=[{id:'A',title:'Current',category:'abdomen',startedAt:null,patientQuestions:'',relatedIds:['B'],visits:[],entries:[]},{id:'B',title:'Earlier',startedAt:'2025-01-01',visits:[{diagnosis:'Original'}]}];globalThis.snapshot={sourceEntries:[],profileSnapshot:{},sourceEpisode:JSON.parse(JSON.stringify(episodeSnapshot(state.episodes[0])))}`);
  assert.equal(h.evaluate('briefStale(snapshot,state.episodes[0])'), false);
  h.evaluate(`state.episodes[1].visits[0].diagnosis='Corrected'`);
  assert.equal(h.evaluate('briefStale(snapshot,state.episodes[0])'), true);
  h.evaluate(`state.episodes[1].visits[0].diagnosis='Original';state.episodes[0].startedAt='2026-09-01'`);
  assert.equal(h.evaluate('briefStale(snapshot,state.episodes[0])'), true);
  assert.equal(h.evaluate(`briefStale({sourceEntries:[],profileSnapshot:{}},state.episodes[0])`), true);
});

test('PDF downloads capture the saved version, dataset, and filename before navigation', async () => {
  const h = harness();
  h.evaluate(`state.episodes=[{id:'A',briefs:[{id:'saved-A',version:3}]}]`);
  h.click({ action: 'download-pdf', brief: 'saved-A' });
  assert.equal(h.requests[0].path, '/api/episodes/A/briefs/saved-A/pdf');
  assert.equal(h.requests[0].options.headers['X-Journal-Dataset'], 'real');
  h.evaluate(`navigate('episode','B','brief')`);
  await h.respond(0, { pdf: true });
  assert.equal(h.downloads[0].download, 'health-journal-real-brief-v3.pdf');
  assert.equal(h.downloads[0].href, 'blob:download');
});

test('AI requests keep the captured locale and send the browser timezone', async () => {
  const h = harness();
  h.evaluate(`locale='zh';generateBrief();locale='en'`);
  const body = JSON.parse(h.requests[0].options.body);
  assert.equal(body.locale, 'zh');
  assert.equal(body.timeZone, Intl.DateTimeFormat().resolvedOptions().timeZone);
  await h.respond(0, { text: '示例', sourceRevision: 7 });
});

test('a modal submits the episode it opened for after a hash navigation', async () => {
  const h = harness();
  h.evaluate(`editingEntryId='entry-A';editingEntryAt='2026-10-02T18:30:42.100Z';openDialog('Edit A','');navigate('episode','B')`);
  h.submit('edit-entry-form', { text: 'Correct A', at: '2026-10-02T11:30', severity: '2' }, true);
  assert.equal(h.requests[0].path, '/api/episodes/A/entries/entry-A');
  await h.respond(0, {});
});

test('a late response never replaces state from another dataset', async () => {
  const h = harness();
  h.evaluate(`api('/state');dataset='demo';state={revision:99}`);
  await h.respond(0, { state: { revision: 8 } });
  assert.equal(h.evaluate('state.revision'), 99);
});

test('clearing the final nonempty profile field still warns before unloading', () => {
  const h = harness();
  h.evaluate(`formDrafts.set(draftKey('profile-form'),{name:'',allergies:''})`);
  let prevented = false;
  h.windowHandlers.beforeunload({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
});

test('recovering a durable draft preserves local edits and stays attached to captured dataset', () => {
  const h=harness();
  h.seedDraft('A','My unsaved edits');
  h.evaluate(`workflowHistory.set(briefKey('A'),{runs:[{runId:'run-A',output:{text:'Original server draft',sourceRevision:7}}]});recoverDraft('run-A')`);
  assert.equal(h.evaluate('context().briefDraft.text'),'My unsaved edits');
  h.evaluate(`briefDrafts.delete(briefKey('A'));recoverDraft('run-A')`);
  assert.equal(h.evaluate('context().briefDraft.text'),'Original server draft');
  h.evaluate(`dataset='demo'`);
  assert.equal(h.evaluate('context().briefDraft'),undefined);
});

test('manual retry captures the prior goal, language, timezone, dataset and episode', async () => {
  const h=harness();
  h.evaluate(`workflowHistory.set(briefKey('A'),{runs:[{runId:'failed-A',goal:'brief-draft',locale:'zh',timeZone:'Asia/Shanghai'}]});retryWorkflow('failed-A');navigate('episode','B','brief');dataset='demo'`);
  assert.equal(h.requests[0].path,'/api/episodes/A/brief-draft');
  assert.equal(h.requests[0].options.headers['X-Journal-Dataset'],'real');
  assert.deepEqual(JSON.parse(h.requests[0].options.body),{locale:'zh',revision:7,retryRunId:'failed-A',timeZone:'Asia/Shanghai'});
  await h.respond(0,{text:'Retried draft',sourceRevision:7});
  assert.equal(h.evaluate('context().briefDraft'),undefined);
  h.evaluate(`dataset='real';navigate('episode','A','brief')`);
  assert.equal(h.evaluate('context().briefDraft.text'),'Retried draft');
});

test('reviewed save submits draft language and durable workflow run id', async () => {
  const h=harness();
  h.evaluate(`briefDrafts.set(briefKey('A'),{text:'患者核对',locale:'zh',sourceRevision:7,workflowRunId:'run-A'});locale='en'`);
  h.submit('brief-save-form',{text:'患者核对'});
  assert.deepEqual(JSON.parse(h.requests[0].options.body),{text:'患者核对',locale:'zh',sourceRevision:7,revision:7,workflowRunId:'run-A'});
  await h.respond(0,{briefId:'saved-A'});
});

test('a stale workflow GET cannot hide a final run received at the same clinical revision', async () => {
  const h=harness();
  h.evaluate(`loadWorkflow(operationContext());rememberWorkflow({runId:'final-A',episodeId:'A',status:'waiting_review',output:{text:'Durable draft'}},'real')`);
  await h.respond(0,{runs:[{runId:'final-A',episodeId:'A',status:'running'}]});
  assert.equal(h.evaluate('context().workflowRuns[0].status'),'waiting_review');
  assert.equal(h.evaluate('context().workflowRuns[0].output.text'),'Durable draft');
  assert.equal(h.evaluate(`workflowHistory.get(briefKey('A')).revision`),null);
});

test('overlapping history loads keep the newest response and clearing invalidates pending loads', async () => {
  const h=harness();
  h.evaluate('loadWorkflow(operationContext());loadWorkflow(operationContext())');
  await h.respond(1,{runs:[{runId:'new',status:'completed'}]});
  await h.respond(0,{runs:[]});
  assert.equal(h.evaluate('context().workflowRuns[0].runId'),'new');
  h.evaluate(`loadWorkflow(operationContext());workflowHistory.delete(briefKey('A'))`);
  await h.respond(2,{runs:[{runId:'cleared'}]});
  assert.equal(h.evaluate('context().workflowRuns'),undefined);
});


test('completed brief panels show the reviewed result in both languages while drafts still await review', () => {
  const run={runId:'run-A',goal:'brief-draft',status:'completed',startedAt:'2026-10-03T02:00:00Z',decision:{action:'create_brief',missingDetails:[]},steps:[],output:{text:'Draft'}};
  for(const locale of ['en','zh']){
    const c={t:(en,zh)=>locale==='zh'?zh:en,esc:String,fmt:()=>'',busy:false,workflowRuns:[run],workflowPanelOpen:true};
    const completed=workflowPanel(c);
    assert.match(completed,locale==='en'?/Result: Reviewed and saved — ready to share/u:/结果: 已核对并保存，可以分享/u);
    assert.doesNotMatch(completed,locale==='en'?/Patient reviews the draft/u:/患者核对草稿/u);
    const waiting=workflowPanel({...c,workflowRuns:[{...run,status:'waiting_review'}]});
    assert.match(waiting,locale==='en'?/Next step: Patient reviews the draft/u:/下一步: 患者核对草稿/u);
  }
});
