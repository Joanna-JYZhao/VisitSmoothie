import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JournalStore, newEpisode, newEntry, emptyState } from '../server/store.mjs';
import { runWorkflow, validatePlan, sourceFingerprint } from '../server/workflow.mjs';
const AT='2026-10-03T02:00:00Z';
function fixture(t,path=':memory:') {
 const store=new JournalStore(path);
 t.after(()=>store.close());
 const episode=newEpisode({title:'Fictional discomfort',category:'abdomen',startedAt:null,entry:newEntry('A dull ache after lunch.',AT,3)});
 store.mutate('real',0,s=>s.episodes.push(episode));
 const call=(transport,options={})=>runWorkflow({store,dataset:'real',episodeId:episode.id,goal:'reflect',locale:'en',revision:store.read().revision,timeoutMs:50,transport,...options});
 return {store,episode,call};
}
const ask=async({context})=>({decision:{action:'ask_followup',missingDetails:['duration']},question:'How long did it last?',facts:[{label:'other',quote:'dull ache',sourceId:context.currentEpisode.entries[0].sourceId}]});
const finish=async()=>({decision:{action:'finish_tracking',missingDetails:[]},facts:[]});
const brief=async()=>({decision:{action:'create_brief',missingDetails:[]},facts:[]});
test('selected tools execute with real events; duplicate sources append only one question',async t=>{
 const {store,episode,call}=fixture(t);let calls=0;
 const model=async input=>{calls++;return ask(input)};
 const first=await call(model), second=await call(model);
 assert.equal(calls,1);assert.equal(second.reused,true);assert.equal(first.workflow.runId,second.workflow.runId);
 assert.equal(first.workflow.status,'waiting_patient');assert.equal(store.read().revision,2);
 assert.equal(store.read().episodes[0].entries.filter(e=>e.role==='assistant').length,1);
 assert.deepEqual(first.workflow.steps.map(s=>s.name),['load_context','safety_check','agent_plan','verify_sources','execute_tool','checkpoint']);
 assert.ok(first.workflow.steps.every(s=>s.status==='completed'&&s.finishedAt));
 assert.equal(first.workflow.steps[4].tool,'ask_patient');
 store.mutate('real',2,s=>s.episodes[0].entries.push(newEntry('It lasted ten minutes.',AT,2)));
 const next=await call(finish);assert.equal(next.workflow.status,'completed');assert.equal(store.read().revision,3);
 assert.notEqual(next.workflow.sourceFingerprint,first.workflow.sourceFingerprint);
 assert.equal(store.runs('real',episode.id).length,2);
});
test('illegal or inconsistent decisions fail closed, without storing model reasoning',async t=>{
 for(const decision of [{action:'send_email',missingDetails:[]},{action:'ask_followup',missingDetails:[]},{action:'finish_tracking',missingDetails:['duration']},{action:'create_brief',missingDetails:[]}])assert.throws(()=>validatePlan({decision,facts:[]},'reflect'));
 const {store,call}=fixture(t);
 await assert.rejects(call(async()=>({facts:[]})),e=>e.code==='AI_PLAN'&&e.workflow.status==='failed');
 assert.equal(store.read().revision,1);assert.equal(store.read().episodes[0].entries.length,1);
 const run=store.export('real').workflowRuns[0];assert.equal(run.steps.at(-1).name,'verify_sources');assert.equal(run.steps.at(-1).status,'failed');
 await assert.rejects(call(async()=>({decision:{action:'finish_tracking',missingDetails:[]},facts:[],reasoning:'hidden'}),{retryRunId:run.runId}),e=>e.code==='AI_PLAN');
 assert.doesNotMatch(JSON.stringify(store.export('real')),/hidden/u);
});
test('urgent local rule bypasses all model work even without connected provider',async t=>{
 const {store,call}=fixture(t);store.mutate('real',1,s=>s.episodes[0].entries[0].text="I can't breathe");
 let calls=0;const result=await call(async()=>{calls++;throw Error('provider should never run')},{goal:'brief-draft'});
 assert.equal(calls,0);assert.equal(result.workflow.status,'urgent');assert.match(result.urgentGuidance,/immediate professional help/u);
 assert.equal(result.text,undefined);assert.equal(store.read().revision,2);
 assert.deepEqual(result.workflow.steps.map(s=>s.name),['load_context','safety_check','checkpoint']);
});
test('unverifiable current quotes and provider failure preserve saved patient text',async t=>{
 for(const transport of [async()=>{throw Error('upstream secret')},async()=>({decision:{action:'finish_tracking',missingDetails:[]},facts:[{label:'other',quote:'invented diagnosis',sourceId:'fake'}]})]){
  const {store,call}=fixture(t);await assert.rejects(call(transport),e=>e.workflow.status==='failed');
  assert.equal(store.read().episodes[0].entries[0].text,'A dull ache after lunch.');assert.equal(store.read().revision,1);
  assert.doesNotMatch(JSON.stringify(store.export('real')),/upstream secret|invented diagnosis/u);
 }
});
test('draft output survives reopening and restart converts running checkpoints to interrupted',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'journal-workflow-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const file=join(dir,'journal.sqlite');let store=new JournalStore(file);
 const episode=newEpisode({title:'Synthetic',category:'general',startedAt:null,entry:newEntry('A mild ache.',AT)});store.mutate('real',0,s=>s.episodes.push(episode));
 const draft=await runWorkflow({store,dataset:'real',episodeId:episode.id,goal:'brief-draft',locale:'zh',revision:1,transport:brief});
 const interrupted={...draft.workflow,runId:'interrupted',status:'running',steps:[{name:'agent_plan',status:'running',startedAt:AT}]};store.saveRun('real',interrupted);store.close();
 store=new JournalStore(file);t.after(()=>store.close());
 assert.equal(store.run('real',draft.workflow.runId).output.text,draft.text);assert.equal(store.read().revision,1);
 assert.equal(store.run('real','interrupted').status,'interrupted');assert.equal(store.run('real','interrupted').steps[0].status,'interrupted');
});
test('explicit retry has lineage, does not replay a successful retry, and rejects changed source',async t=>{
 const {store,call}=fixture(t);let failed;
 try{await call(async()=>{throw Error('offline')})}catch(e){failed=e.workflow}
 const retry=await call(finish,{retryRunId:failed.runId});assert.equal(retry.workflow.parentRunId,failed.runId);
 const repeated=await call(async()=>{throw Error('should not run')},{retryRunId:failed.runId});assert.equal(repeated.workflow.runId,retry.workflow.runId);
 store.mutate('real',1,s=>s.profile.allergies='Unknown');
 await assert.rejects(call(finish,{retryRunId:failed.runId}),e=>e.code==='INVALID_RETRY');
});
test('revision and fingerprint reject stale provider output including historical/profile changes',async t=>{
 const {store,call}=fixture(t);let release,started;
 const began=new Promise(r=>started=r);const pending=call(async()=>{started();await new Promise(r=>release=r);return finish()});await began;
 store.mutate('real',1,s=>s.profile.notes='A new patient-entered detail');release();
 await assert.rejects(pending,e=>e.status===409);assert.equal(store.read().revision,2);assert.equal(store.read().episodes[0].entries.length,1);
});
test('dataset clear during provider call cannot recreate deleted run traces',async t=>{
 const {store,call}=fixture(t);let release,started;
 const began=new Promise(r=>started=r);const pending=call(async()=>{started();await new Promise(r=>release=r);return finish()});await began;
 store.replace('real',emptyState(),1);release();await assert.rejects(pending);
 assert.deepEqual(store.export('real').workflowRuns,[]);assert.deepEqual(store.read().episodes,[]);
});
test('run retention is bounded and dataset resets isolate traces without changing clinical revision',t=>{
 const {store,episode}=fixture(t);
 for(let i=0;i<35;i++)store.saveRun('real',{runId:String(i),episodeId:episode.id,status:'completed',steps:[]});
 store.saveRun('demo',{runId:'demo',episodeId:episode.id,status:'completed',steps:[]});
 assert.equal(store.runs('real',episode.id).length,30);assert.equal(store.read().revision,1);
 assert.equal(store.export('real').workflowRuns.length,30);assert.equal(store.export('demo').workflowRuns.length,1);
 store.replace('demo',emptyState());assert.equal(store.export('demo').workflowRuns.length,0);assert.equal(store.runs('real',episode.id).length,30);
});
