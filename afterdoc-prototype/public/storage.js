import {clinicalSnapshot} from './visits.js';
import {checkDraftMatches} from './journey.js';

export const STORAGE_KEY='afterdoc.visits.v1';
const schemaVersion=1;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const arrayOf=(v,check)=>Array.isArray(v)&&v.every(check);
const text=v=>typeof v==='string';
const visit=v=>object(v)&&text(v.id)&&Number.isInteger(v.number)&&v.number>0&&text(v.startedAt)&&Number.isFinite(Date.parse(v.startedAt));
const doc=v=>object(v)&&text(v.id)&&text(v.title)&&text(v.text);
const origin=v=>object(v)&&text(v.visitId)&&Number.isInteger(v.visitNumber)&&v.visitNumber>0&&text(v.questionId);
const question=v=>object(v)&&text(v.id)&&text(v.text)&&['saved','sent','replied','answered'].includes(v.status)&&(!v.sourceDocuments||arrayOf(v.sourceDocuments,doc))&&(!v.origin||origin(v.origin));
const checkMap=v=>object(v)&&Object.values(v).every(c=>object(c)&&['matched','mismatch','uncertain','skipped'].includes(c.status));
const completedMap=v=>object(v)&&Object.values(v).every(value=>typeof value==='boolean');
const draftTarget=v=>v===undefined||v===null||(object(v)&&text(v.visitId)&&text(v.itemId)&&Number.isInteger(v.planVersion)&&v.planVersion>0);
const plan=v=>v===null||(object(v)&&Number.isInteger(v.version)&&arrayOf(v.items,i=>object(i)&&text(i.id)&&text(i.title)&&(!i.missing||arrayOf(i.missing,text)))&&(!v.warnings||arrayOf(v.warnings,text))&&(!v.complexity||(object(v.complexity)&&arrayOf(v.complexity.reasons,text))));
const reminder=v=>object(v)&&text(v.id)&&text(v.title)&&text(v.start)&&text(v.timeZone)&&Number.isInteger(v.count)&&Number.isInteger(v.version);
const intake=v=>object(v)&&arrayOf(v.messages,m=>object(m)&&['user','assistant'].includes(m.role)&&text(m.content))&&arrayOf(v.records,doc)&&arrayOf(v.facts,f=>object(f)&&text(f.label)&&text(f.value)&&text(f.quote))&&arrayOf(v.unknowns,text)&&arrayOf(v.options,text);
function clinical(v) {
  return object(v)&&visit(v.visit)&&intake(v.intake)&&arrayOf(v.documents,doc)&&plan(v.plan)&&checkMap(v.checks)&&completedMap(v.completed)&&
    arrayOf(v.questions,question)&&arrayOf(v.reminders,reminder)&&arrayOf(v.postMessages,m=>object(m)&&text(m.content)&&(!m.citations||arrayOf(m.citations,c=>object(c)&&text(c.sourceId)&&text(c.quote))))&&
    arrayOf(v.versions,p=>object(p)&&Number.isInteger(p.version)&&plan(p.plan)&&arrayOf(p.documents,doc)&&(!p.checks||checkMap(p.checks))&&(!p.completed||completedMap(p.completed)))&&
    (v.recordDraft===null||doc(v.recordDraft))&&['draftIntake','draftPost','draftPlanText','draftCheck'].every(k=>text(v[k]))&&draftTarget(v.draftCheckTarget)&&
    (v.carryover===null||(object(v.carryover)&&text(v.carryover.summary)&&text(v.carryover.visitId)&&Number.isInteger(v.carryover.visitNumber)&&text(v.carryover.endedAt)&&arrayOf(v.carryover.questionsAtStart,question)));
}
const revision=v=>object(v)&&text(v.id)&&Number.isInteger(v.revision)&&v.revision>0&&text(v.text)&&text(v.savedAt)&&clinical(v.snapshot)&&!('noteVersions' in v.snapshot)&&!('visitHistory' in v.snapshot);
function validState(v) {
  return clinical(v)&&arrayOf(v.noteVersions,revision)&&arrayOf(v.visitHistory,h=>object(h)&&visit(h.visit)&&text(h.endedAt)&&arrayOf(h.noteVersions,revision))&&['zh','en'].includes(v.lang)&&['prepare','doctor','after','note'].includes(v.view)&&['brief','detail'].includes(v.preference)&&arrayOf(v.activities,object);
}

export function persistedState(state) {
  return {...clinicalSnapshot(state),noteVersions:structuredClone(state.noteVersions),visitHistory:structuredClone(state.visitHistory),
    lang:state.lang,view:state.view,preference:state.preference,activities:structuredClone(state.activities),
    ocrPhotoMissing:Boolean(state.ocrPending)};
}

export function restoreState(data,defaults) {
  if(!validState(data))throw new Error('Unrecognized saved visit data.');
  const submittedReview=Boolean(data.ocrReviewed&&data.draftPlanText.trim()&&data.documents.some(doc=>doc.text.trim()===data.draftPlanText.trim()));
  const restored={...defaults,...structuredClone(data),draftCheckTarget:structuredClone(data.draftCheckTarget??null),photoPreviews:[],busy:'',error:null,calendar:null,
    // Original photos are session-only. Unfinished OCR must be reviewed again.
    ocrPhotoMissing:Boolean(data.ocrPending),ocrReviewed:data.ocrPending?submittedReview:Boolean(data.ocrReviewed),checkOpen:null};
  const itemId=restored.draftCheckTarget?.itemId;
  if(restored.draftCheck&&checkDraftMatches(restored,itemId)&&!['matched','skipped'].includes(restored.checks[itemId]?.status))restored.checkOpen=itemId;
  return restored;
}

// A stale tab stops writing until the user explicitly reloads the stored version.
export function createLocalStore(storage) {
  let expected=null,blocked=null;
  const failure=(code,detail)=>({ok:false,error:{code,detail:String(detail||'')}});
  return {
    load(defaults) {
      try{expected=storage.getItem(STORAGE_KEY);}
      catch(error){blocked={code:'unavailable',detail:error.message};return {state:defaults,error:blocked};}
      try {
        if(expected===null){blocked=null;return {state:defaults,error:null};}
        const envelope=JSON.parse(expected);
        if(!object(envelope)||envelope.schemaVersion!==schemaVersion)throw new Error('Unsupported saved data version.');
        const state=restoreState(envelope.state,defaults);
        blocked=null;return {state,error:null};
      } catch(error) {
        blocked={code:'corrupt',detail:error.message};
        return {state:defaults,error:blocked};
      }
    },
    save(state) {
      if(blocked&&['corrupt','conflict'].includes(blocked.code))return {ok:false,error:blocked};
      try {
        if(storage.getItem(STORAGE_KEY)!==expected){blocked={code:'conflict',detail:'Another page changed the saved visits.'};return {ok:false,error:blocked};}
        const next=JSON.stringify({schemaVersion,state:persistedState(state)});
        if(next!==expected){storage.setItem(STORAGE_KEY,next);expected=next;}
        blocked=null;return {ok:true};
      } catch(error){return failure('unavailable',error.message);}
    },
    clear() {
      try{storage.removeItem(STORAGE_KEY);expected=null;blocked=null;return {ok:true};}
      catch(error){return failure('unavailable',error.message);}
    },
    raw() {try{return storage.getItem(STORAGE_KEY);}catch{return expected;}},
  };
}
