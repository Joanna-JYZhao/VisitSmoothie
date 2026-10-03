import test from 'node:test';
import assert from 'node:assert/strict';
import {newVisit, saveNoteVersion, nextVisit, clinicalSnapshot, previousVisitContext, hasVisitContent} from '../public/visits.js';
import {createLocalStore, persistedState, restoreState, STORAGE_KEY} from '../public/storage.js';
import {openUnderstandingCheck,addPlanVersion} from '../public/journey.js';

const now='2026-10-02T12:00:00.000Z';
function fresh(){return {visit:newVisit(1,now,'visit-1'),noteVersions:[],visitHistory:[],carryover:null,lang:'zh',view:'prepare',demo:false,intake:{messages:[],records:[],facts:[],unknowns:[],options:[],turn:0,reviewed:false},documents:[],versions:[],plan:null,checks:{},completed:{},questions:[],postMessages:[],reminders:[],activities:[],preference:'brief',draftIntake:'',draftPost:'',draftPlanText:'',draftCheck:'',recordDraft:null,ocrPending:false,ocrReviewed:false,photoPreviews:[],busy:'',calendar:null};}
function populated(){const s=fresh();s.intake.messages=[{role:'user',content:'Started Monday'}];s.intake.facts=[{label:'Onset',value:'Monday',quote:'Started Monday',sourceId:'patient'}];s.documents=[{id:'doc',title:'Instructions',text:'Medicine A once daily'}];s.plan={version:1,items:[{id:'item',title:'Medicine A',sourceId:'doc',sourceQuote:'Medicine A once daily'}]};s.versions=[{version:1,plan:structuredClone(s.plan),documents:structuredClone(s.documents)}];s.checks={item:{status:'matched'}};s.completed={item:true};s.questions=[{id:'open',text:'What if I miss it?',status:'replied',reply:'Ask the prescriber',sourceId:'reply',replySource:'Phone call'},{id:'resolved',text:'When?',status:'answered'}];s.documents.push({id:'reply',title:'Phone call',text:'Ask the prescriber'});s.reminders=[{id:'reminder',version:1,title:'Medicine reminder',start:'2026-10-02T08:00:00',timeZone:'Asia/Shanghai',count:5}];return s;}
test('note snapshots retain immutable facts, sources, questions and current plan markers',()=>{const s=populated();const saved=saveNoteVersion(s,{text:'First note',now,id:'note-1'});Object.assign(s,saved);s.intake.facts[0].value='Tuesday';s.documents[0].text='changed';s.questions[0].status='answered';s.checks.item.status='skipped';s.completed.item=false;const snap=s.noteVersions[0].snapshot;assert.equal(snap.intake.facts[0].value,'Monday');assert.equal(snap.documents[0].text,'Medicine A once daily');assert.equal(snap.questions[0].status,'replied');assert.equal(snap.versions[0].checks.item.status,'matched');assert.equal(snap.versions[0].completed.item,true);assert.equal(s.noteVersions[0].text,'First note');});
test('unchanged saves ignore view, generated note date, activities and language',()=>{const s=populated();Object.assign(s,saveNoteVersion(s,{text:'at noon',now,id:'one'}));s.view='note';s.lang='en';s.activities.push({time:'later'});assert.equal(saveNoteVersion(s,{text:'at one',now,id:'two'}).noteVersions.length,1);s.questions[0].reply='A different reply';assert.equal(saveNoteVersion(s,{text:'changed',now,id:'three'}).noteVersions.length,2);});
test('next visit archives current care and carries only unresolved questions with source provenance',()=>{const s=populated();const n=nextVisit(s,fresh(),{text:'Original note',now,id:'visit-2',noteId:'one'});assert.equal(n.visit.number,2);assert.equal(n.plan,null);assert.deepEqual(n.checks,{});assert.deepEqual(n.completed,{});assert.deepEqual(n.reminders,[]);assert.deepEqual(n.intake.facts,[]);assert.equal(n.intake.reviewed,false);assert.equal(n.questions.length,1);assert.equal(n.questions[0].origin.visitId,'visit-1');assert.equal(n.questions[0].reply,'Ask the prescriber');assert.equal(n.questions[0].sourceDocuments[0].text,'Ask the prescriber');assert.equal(n.visitHistory[0].noteVersions[0].snapshot.plan.items[0].title,'Medicine A');n.questions[0].reply='new';assert.equal(n.visitHistory[0].noteVersions[0].snapshot.questions[0].reply,'Ask the prescriber');assert.ok(n.carryover.summary.includes('Medicine A'));});
test('repeated cycles preserve original question identity without recursively nested archives',()=>{let s=populated();s=nextVisit(s,fresh(),{text:'one',now,id:'v2',noteId:'n1'});s.draftIntake='I am back';s=nextVisit(s,fresh(),{text:'two',now,id:'v3',noteId:'n2'});assert.equal(s.visit.number,3);assert.equal(s.questions.length,1);assert.equal(s.questions[0].origin.visitId,'visit-1');assert.equal(s.visitHistory.length,2);for(const visit of s.visitHistory)for(const revision of visit.noteVersions){assert.equal(revision.snapshot.visitHistory,undefined);assert.equal(revision.snapshot.noteVersions,undefined);}assert.equal(previousVisitContext(s).visitNumber,2);});
test('empty repeated transitions are refused, but a patient draft counts',()=>{const s=fresh();assert.equal(hasVisitContent(s),false);assert.throws(()=>nextVisit(s,fresh(),{text:'empty',now}),/empty/);s.draftIntake='New symptom';assert.equal(hasVisitContent(s),true);const next=nextVisit(s,fresh(),{text:'draft',now,id:'v2'});assert.equal(hasVisitContent(next),false);});
test('persistence retains exact records and pending OCR while stripping ephemeral state and blob URLs',()=>{const s=populated();s.busy='intake';s.calendar={access_token:'never-save'};s.health={configured:true};s.photoPreviews=[{title:'photo',url:'blob:temporary'}];s.ocrPending=true;s.ocrReviewed=false;s.recordDraft={id:'pending',title:'photo',text:'OCR text',requiresReview:true};const data=persistedState(s);const encoded=JSON.stringify(data);assert.ok(!encoded.includes('blob:'));assert.ok(!encoded.includes('access_token'));assert.equal(data.busy,undefined);const restored=restoreState(data,fresh());assert.equal(restored.ocrPending,true);assert.equal(restored.ocrReviewed,false);assert.equal(restored.ocrPhotoMissing,true);assert.equal(restored.recordDraft.text,'OCR text');assert.equal(restored.documents[0].text,'Medicine A once daily');assert.deepEqual(restored.photoPreviews,[]);assert.deepEqual(clinicalSnapshot(restored).plan,s.plan);});
function memoryStorage(){const map=new Map();return {map,getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};}
test('roundtrip reload retains visit ids, saved revisions and archives',()=>{const storage=memoryStorage();const a=createLocalStore(storage);a.load(fresh());const s=nextVisit(populated(),fresh(),{text:'original',now,id:'v2',noteId:'n1'});assert.equal(a.save(s).ok,true);const loaded=createLocalStore(storage).load(fresh());assert.equal(loaded.error,null);assert.equal(loaded.state.visit.id,'v2');assert.equal(loaded.state.visitHistory[0].noteVersions[0].text,'original');});
test('malformed and unsupported storage remain untouched and saving is blocked',()=>{for(const raw of ['{broken',JSON.stringify({schemaVersion:999,state:fresh()}),JSON.stringify({schemaVersion:1,state:{visit:{id:'x'}}})]){const storage=memoryStorage();storage.setItem(STORAGE_KEY,raw);const store=createLocalStore(storage);assert.equal(store.load(fresh()).error.code,'corrupt');assert.equal(store.save(fresh()).ok,false);assert.equal(storage.getItem(STORAGE_KEY),raw);}});
test('quota errors and another tab update are visible, and stale writes never replace stored records',()=>{const storage=memoryStorage();const a=createLocalStore(storage),b=createLocalStore(storage);a.load(fresh());b.load(fresh());assert.equal(a.save(populated()).ok,true);const saved=storage.getItem(STORAGE_KEY);assert.equal(b.save(fresh()).error.code,'conflict');assert.equal(storage.getItem(STORAGE_KEY),saved);const full=memoryStorage();const store=createLocalStore(full);store.load(fresh());full.setItem=()=>{throw new Error('quota');};assert.equal(store.save(populated()).error.code,'unavailable');assert.equal(full.getItem(STORAGE_KEY),null);});
test('failed storage access and deliberate local deletion are recoverable',()=>{const unavailable=createLocalStore({getItem(){throw new Error('denied')},setItem(){throw new Error('denied')},removeItem(){throw new Error('denied')}});assert.equal(unavailable.load(fresh()).error.code,'unavailable');assert.equal(unavailable.save(fresh()).ok,false);const storage=memoryStorage();storage.setItem(STORAGE_KEY,'broken');const store=createLocalStore(storage);store.load(fresh());assert.equal(store.clear().ok,true);assert.equal(store.save(fresh()).ok,true);});
test('malformed nested clinical data is rejected without overwriting the stored copy',()=>{
  for(const mutate of [s=>s.checks={item:null},s=>s.plan.warnings={},s=>s.plan.complexity={level:'high',reasons:[null]},s=>s.reminders=[{id:'r',start:null}],s=>s.questions[0].origin={visitNumber:'one'}]){
    const state=persistedState(populated());mutate(state);const storage=memoryStorage();const raw=JSON.stringify({schemaVersion:1,state});storage.setItem(STORAGE_KEY,raw);const store=createLocalStore(storage);assert.equal(store.load(fresh()).error.code,'corrupt');assert.equal(store.save(fresh()).ok,false);assert.equal(storage.getItem(STORAGE_KEY),raw);
  }
});
test('understanding draft resumes after storage reload and reopening its matching item',()=>{
  const state=populated();state.checks={};
  assert.equal(openUnderstandingCheck(state,'item'),true);
  state.draftCheck='I would take one tablet in the morning.';
  const storage=memoryStorage(),store=createLocalStore(storage);store.load(fresh());assert.equal(store.save(state).ok,true);
  const restored=createLocalStore(storage).load(fresh()).state;
  assert.equal(restored.checkOpen,'item');
  restored.checkOpen=null;openUnderstandingCheck(restored,'item');
  assert.equal(restored.draftCheck,'I would take one tablet in the morning.');
  assert.deepEqual(restored.draftCheckTarget,{visitId:'visit-1',planVersion:1,itemId:'item'});
});
test('an understanding draft cannot attach to a replacement plan even when item IDs are reused',()=>{
  const state=populated();openUnderstandingCheck(state,'item');state.draftCheck='An answer about the old instructions';
  const previous=persistedState(state);
  Object.assign(state,addPlanVersion(state,{items:[{id:'item',title:'Replacement medicine',sourceId:'new',sourceQuote:'Different instructions'}]},[{id:'new',title:'New plan',text:'Different instructions'}],{label:'replacement',time:'14:00'}));
  assert.equal(state.draftCheck,'');assert.equal(state.draftCheckTarget,null);assert.equal(state.checkOpen,null);
  // A stale but structurally valid target is never reopened on a newer plan.
  const restored=restoreState({...persistedState(state),draftCheck:previous.draftCheck,draftCheckTarget:previous.draftCheckTarget},fresh());
  assert.equal(restored.checkOpen,null);openUnderstandingCheck(restored,'item');assert.equal(restored.draftCheck,'');assert.equal(restored.draftCheckTarget.planVersion,2);
});
test('schema-one visits without a draft target still recover their unassociated text',()=>{
  const saved=persistedState(populated());saved.draftCheck='An older unsubmitted answer';delete saved.draftCheckTarget;
  const restored=restoreState(saved,fresh());assert.equal(restored.draftCheck,'An older unsubmitted answer');assert.equal(restored.draftCheckTarget,null);assert.equal(restored.checkOpen,null);
});
test('opening and closing an empty understanding input does not create a note revision',()=>{
  const state=populated();Object.assign(state,saveNoteVersion(state,{text:'Saved note',now,id:'saved'}));
  openUnderstandingCheck(state,'item');assert.equal(saveNoteVersion(state,{text:'Unchanged',now,id:'unused'}).noteVersions.length,1);
  state.checkOpen=null;assert.equal(saveNoteVersion(state,{text:'Unchanged',now,id:'unused-again'}).noteVersions.length,1);
});
test('reloading reviewed and submitted OCR leaves the saved note unchanged; new OCR remains gated',()=>{
  const state=populated();state.ocrPending=true;state.ocrReviewed=true;state.draftPlanText=state.documents[0].text;
  Object.assign(state,saveNoteVersion(state,{text:'Reviewed source note',now,id:'ocr-note'}));
  const restored=restoreState(persistedState(state),fresh());
  assert.equal(restored.ocrReviewed,true);assert.equal(saveNoteVersion(restored,{text:'Same note after refresh',now,id:'unneeded'}).noteVersions.length,1);
  state.draftPlanText='Different OCR text not yet submitted';
  assert.equal(restoreState(persistedState(state),fresh()).ocrReviewed,false);
});
