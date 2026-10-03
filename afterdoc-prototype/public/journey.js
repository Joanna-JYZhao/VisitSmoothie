// Portable state transitions used by the prototype; no model calls or DOM access.
export function planVersions(state) {
  return (state.versions||[]).map(snapshot=>snapshot.version===state.plan?.version
    ? {...snapshot,plan:{...snapshot.plan,reviewed:!!state.plan.reviewed},checks:structuredClone(state.checks||{}),completed:structuredClone(state.completed||{})}
    : snapshot);
}

export function addPlanVersion(current, nextPlan, documents, {label, time, reviewed=false}) {
  const version=(current.plan?.version||0)+1;
  const plan={...structuredClone(nextPlan),version,reviewed};
  const copiedDocuments=structuredClone(documents);
  const snapshot={version,label,time,plan:structuredClone(plan),documents:structuredClone(copiedDocuments)};
  return {plan,documents:copiedDocuments,versions:[...planVersions(current),snapshot]};
}

export function findDocument(state,id) {
  const current=(state.documents||[]).find(doc=>doc.id===id);
  if(current)return current;
  const reply=(state.questions||[]).flatMap(questionDocuments).find(doc=>doc.id===id);
  if(reply)return reply;
  const intake=(state.intake?.records||[]).find(doc=>doc.id===id);
  if(intake)return intake;
  for(const version of state.versions||[]) {
    const archived=(version.documents||[]).find(doc=>doc.id===id);
    if(archived)return archived;
  }
  return null;
}

// Older saved sessions already retain these exact patient-entered reply fields.
// Recover their source document even when the first plan replaced documents[].
export function questionDocuments(question) {
  const documents=structuredClone(question.sourceDocuments||[]);
  if(typeof question.sourceId==='string'&&typeof question.reply==='string'&&typeof question.replySource==='string'&&
    !documents.some(doc=>doc.id===question.sourceId))documents.push({id:question.sourceId,title:question.replySource,text:question.reply});
  return documents;
}

export function recordQuestionReply(question,document,status) {
  const sourceDocuments=questionDocuments(question);
  if(!sourceDocuments.some(doc=>doc.id===document.id))sourceDocuments.push(structuredClone(document));
  Object.assign(question,{status,reply:document.text,replySource:document.title,sourceId:document.id,sourceDocuments});
}

export function markPatientCorrection(state) {
  state.intake.reviewed=false;
  state.doctorReviewed=false;
}
