import {planVersions, findDocument, questionDocuments} from './journey.js';

const clone=value=>structuredClone(value);
const id=()=>crypto.randomUUID();
const fields=['visit','demo','intake','documents','plan','checks','completed','questions','reminders','postMessages','carryover','draftIntake','draftPost','draftPlanText','draftCheck','recordDraft','ocrPending','ocrReviewed'];

export function newVisit(number=1, startedAt=new Date().toISOString(), visitId=id()) {
  return {id:visitId,number,startedAt};
}

// Snapshots deliberately exclude other snapshots and UI/connection state.
export function clinicalSnapshot(state) {
  const result=Object.fromEntries(fields.filter(key=>state[key]!==undefined).map(key=>[key,clone(state[key])]));
  // Opening an empty input is UI state, not a new clinical-note revision.
  if(state.draftCheck&&state.draftCheckTarget)result.draftCheckTarget=clone(state.draftCheckTarget);
  result.questions=(result.questions||[]).map(q=>({...q,sourceDocuments:questionDocuments(q)}));
  result.versions=clone(planVersions(state));
  return result;
}

function stable(value) {
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
  return value;
}
export const snapshotKey=state=>JSON.stringify(stable(clinicalSnapshot(state)));
export const noteHasChanges=state=>!state.noteVersions?.length||snapshotKey(state)!==JSON.stringify(stable(state.noteVersions.at(-1).snapshot));

export function saveNoteVersion(state,{text,now=new Date().toISOString(),id:noteId=id(),label=''}={}) {
  if(!noteHasChanges(state))return {noteVersions:state.noteVersions};
  return {noteVersions:[...(state.noteVersions||[]),{id:noteId,revision:(state.noteVersions?.length||0)+1,savedAt:now,label,text:String(text||''),snapshot:clinicalSnapshot(state)}]};
}

export function hasVisitContent(state) {
  return Boolean(state.plan||state.intake.messages.length||state.intake.records.length||state.documents.length||state.postMessages.length||state.recordDraft||
    [state.draftIntake,state.draftPost,state.draftPlanText,state.draftCheck].some(value=>value?.trim())||
    JSON.stringify(state.questions||[])!==JSON.stringify(state.carryover?.questionsAtStart||[]));
}

function historicalSummary(state) {
  const section=(name,rows)=>rows.length?`${name}\n${rows.join('\n')}`:'';
  return [
    state.demo?'虚构演示病例 / Fictional demonstration case':'',
    section('患者当时的描述 / What the patient reported then',state.intake.facts.map(f=>`${f.label}: ${f.value} [${f.certainty||'reported'}]`)),
    section('当时的书面计划（非当前指示）/ Previous written plan (not current instructions)',(state.plan?.items||[]).map(item=>`${item.title}: ${item.sourceQuote||item.details||''}`)),
    section('期间记录 / Interval updates',state.postMessages.filter(m=>m.role==='user').map(m=>m.content)),
    section('当时未解决的问题 / Questions still open then',state.questions.filter(q=>q.status!=='answered').map(q=>`${q.text}${q.reply?' — '+q.reply:''}`)),
  ].filter(Boolean).join('\n\n');
}

export function nextVisit(state,defaults,{text,now=new Date().toISOString(),id:visitId=id(),noteId=id(),carry=true}={}) {
  if(!hasVisitContent(state))throw new Error('Cannot archive an empty visit.');
  const saved=saveNoteVersion(state,{text,now,id:noteId,label:'visit-close'});
  const seen=new Set();
  const questions=carry?state.questions.filter(q=>q.status!=='answered').flatMap(q=>{
    const origin=q.origin||{visitId:state.visit.id,visitNumber:state.visit.number,questionId:q.id};
    const key=`${origin.visitId}/${origin.questionId}`;
    if(seen.has(key))return [];
    seen.add(key);
    const source=q.sourceId?findDocument(state,q.sourceId):null;
    const result={...clone(q),origin:clone(origin),sourceDocuments:clone(q.sourceDocuments||[])};
    if(source&&!result.sourceDocuments.some(doc=>doc.id===source.id))result.sourceDocuments.push(clone(source));
    // A previous plan item ID must not become a link to a new plan item.
    if(result.itemId){result.originItemId=result.originItemId||result.itemId;delete result.itemId;}
    return [result];
  }):[];
  return {...defaults,lang:state.lang,health:state.health,lastMeta:state.lastMeta,preference:state.preference,
    visit:newVisit(state.visit.number+1,now,visitId),demo:carry&&state.demo,
    visitHistory:[...clone(state.visitHistory||[]),{visit:clone(state.visit),demo:!!state.demo,endedAt:now,noteVersions:clone(saved.noteVersions)}],
    noteVersions:[],questions,
    carryover:carry?{visitId:state.visit.id,visitNumber:state.visit.number,endedAt:now,summary:historicalSummary(state),questionsAtStart:clone(questions)}:null};
}

// History guides questions only; it is never merged into current evidence records.
export function previousVisitContext(state) {
  if(!state.carryover)return null;
  return {visitNumber:state.carryover.visitNumber,endedAt:state.carryover.endedAt,summary:state.carryover.summary.slice(0,8000),
    unresolvedQuestions:state.questions.filter(q=>q.status!=='answered').slice(0,20).map(q=>String(q.text).slice(0,500))};
}
