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
  const intake=(state.intake?.records||[]).find(doc=>doc.id===id);
  if(intake)return intake;
  for(const version of state.versions||[]) {
    const archived=(version.documents||[]).find(doc=>doc.id===id);
    if(archived)return archived;
  }
  return null;
}

export function markPatientCorrection(state) {
  state.intake.reviewed=false;
  state.doctorReviewed=false;
}
