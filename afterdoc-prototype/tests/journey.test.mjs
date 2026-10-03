import test from 'node:test';
import assert from 'node:assert/strict';
import {addPlanVersion,findDocument,markPatientCorrection,planVersions} from '../public/journey.js';

test('new source plan retains the previous source and immutable plan snapshot',()=>{
  let state={plan:null,documents:[],versions:[]};
  const first={items:[{id:'a',dose:'1 tablet',sourceId:'old-doc',sourceQuote:'1 tablet'}]};
  Object.assign(state,addPlanVersion(state,first,[{id:'old-doc',text:'1 tablet'}],{label:'first',time:'10:00'}));
  state.plan.items[0].dose='a UI-side edit';
  assert.equal(state.versions[0].plan.items[0].dose,'1 tablet');
  Object.assign(state,addPlanVersion(state,{items:[{id:'b',dose:'2 tablets'}]},[{id:'new-doc',text:'2 tablets'}],{label:'second',time:'11:00'}));
  assert.equal(state.plan.version,2);
  assert.equal(state.versions[0].version,1);
  assert.equal(state.versions[1].plan.items[0].dose,'2 tablets');
  assert.equal(findDocument(state,'old-doc').text,'1 tablet');
  assert.equal(findDocument(state,'new-doc').text,'2 tablets');
});

test('a supplied intake record resolves independently from patient speech',()=>{
  const state={intake:{records:[{id:'intake-record',text:'supplied history'}]},documents:[],versions:[]};
  assert.equal(findDocument(state,'intake-record').text,'supplied history');
  assert.equal(findDocument(state,'unknown'),null);
});

test('patient corrections invalidate both patient and clinician review',()=>{
  const state={intake:{reviewed:true},doctorReviewed:true};
  markPatientCorrection(state);
  assert.equal(state.intake.reviewed,false);
  assert.equal(state.doctorReviewed,false);
});

test('replacing a plan archives the understanding and patient markers for the old version',()=>{
  let state={plan:null,documents:[],versions:[],checks:{},completed:{}};
  Object.assign(state,addPlanVersion(state,{items:[{id:'a'}]},[],{label:'first',time:'10:00'}));
  state.checks={a:{status:'matched',attempts:2}};
  state.completed={a:true};
  state.plan.reviewed=true;
  Object.assign(state,addPlanVersion(state,{items:[{id:'b'}]},[],{label:'replacement',time:'11:00'}));
  state.checks={b:{status:'skipped'}};
  state.completed={};
  assert.equal(state.versions[0].checks.a.status,'matched');
  assert.equal(state.versions[0].completed.a,true);
  assert.equal(state.versions[0].plan.reviewed,true);
  assert.equal(planVersions(state)[1].checks.b.status,'skipped');
  assert.equal(planVersions(state)[1].completed.a,undefined);
});
