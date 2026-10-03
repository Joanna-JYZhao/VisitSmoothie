import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarFile,googleEvent,validateReminders,dailyFrequency,durationDays,conditionalSchedule} from '../public/calendar.js';
import {createCalendarConnector} from '../server/calendar.mjs';
const event={id:'test-1',title:'示例药片 A',description:'1片，每日2次，连续5天。',start:'2026-10-03T08:00:00',timeZone:'Asia/Shanghai',count:5,minutesBefore:0,kind:'medication'};
test('calendar preserves local time, bounded recurrence and private defaults',()=>{const ics=calendarFile([event]);assert.match(ics,/DTSTART;TZID=Asia\/Shanghai:20261003T080000/);assert.match(ics,/RRULE:FREQ=DAILY;COUNT=5/);assert.match(ics,/TRIGGER:-PT0M/);assert.doesNotMatch(ics,/示例药片/);assert.match(ics,/CLASS:PRIVATE/);const g=googleEvent(event);assert.equal(g.start.timeZone,'Asia/Shanghai');assert.equal(g.end.dateTime,'2026-10-03T08:10:00');assert.deepEqual(g.reminders.overrides,[{method:'popup',minutes:0}]);});
test('calendar rejects impossible dates, unbounded reminders and invalid zones',()=>{for(const change of [{start:'2026-02-30T08:00:00'},{count:0},{count:91},{timeZone:'bad-zone'}])assert.throws(()=>validateReminders([{...event,...change}]));assert.equal(dailyFrequency('每日2次'),2);assert.equal(dailyFrequency('as needed'),null);assert.equal(durationDays('连续5天'),5);});
test('ICS escapes untrusted text and folds long UTF-8 lines',()=>{const ics=calendarFile([{...event,description:'x\nBEGIN:VEVENT;,'+'长'.repeat(100)}],{includeDetails:true});assert.match(ics,/x\\nBEGIN:VEVENT\\;\\,/);assert.equal(ics.split('\r\n').filter(l=>l==='BEGIN:VEVENT').length,1);assert.ok(ics.split('\r\n').every(l=>Buffer.byteLength(l)<=75));});
test('unconfigured Google connector is explicit and does not report connected',()=>{const c=createCalendarConnector({env:{}});assert.equal(c.status().configured,false);assert.equal(c.status().connected,false);assert.throws(()=>c.authorize(),e=>e.code==='calendar_not_configured');});
test('conditional, ranged and fractional schedules are not converted to fixed daily reminders',()=>{
  assert.equal(dailyFrequency('once daily as needed'),null);
  assert.equal(dailyFrequency('每日2次，按需服用'),null);
  assert.equal(durationDays('3-5 days'),null);
  assert.equal(durationDays('1.5 days'),null);
  assert.equal(durationDays('连续3至5天'),null);
  assert.equal(conditionalSchedule('每次1片，每日2次，必要时服用。'),true);
  assert.throws(()=>validateReminders([{...event,timeZone:undefined}]));
});
test('Google connector checks OAuth state and confirmation, then creates idempotent events',async()=>{const calls=[];let inserts=0;const c=createCalendarConnector({env:{GOOGLE_CLIENT_ID:'test-client',GOOGLE_CLIENT_SECRET:'test-secret'},fetcher:async(url,opts)=>{calls.push({url,opts});if(url.includes('/token'))return new Response(JSON.stringify({access_token:'synthetic-token',expires_in:3600}));if(opts.method==='POST'){inserts++;if(inserts===2)return new Response('{}',{status:409});return new Response(JSON.stringify({id:JSON.parse(opts.body).id}));}return new Response(JSON.stringify({id:'existing'}));}});await assert.rejects(c.callback(new URLSearchParams({state:'wrong',code:'x'})),e=>e.code==='calendar_state');const auth=new URL(c.authorize().url);assert.equal(auth.searchParams.get('code_challenge_method'),'S256');await c.callback(new URLSearchParams({state:auth.searchParams.get('state'),code:'test'}));assert.equal(c.status().connected,true);await assert.rejects(c.insert({events:[event]}),e=>e.code==='calendar_confirmation');assert.equal((await c.insert({events:[event],confirmed:true})).allSaved,true);assert.equal((await c.insert({events:[event],confirmed:true})).allSaved,true);const posts=calls.filter(c=>c.opts.method==='POST'&&c.url.includes('/events'));assert.equal(JSON.parse(posts[0].opts.body).id,JSON.parse(posts[1].opts.body).id);assert.doesNotMatch(posts[0].opts.body,/示例药片/);c.disconnect();assert.equal(c.status().connected,false);});

test('a new Google account never inherits the preceding account refresh token',async()=>{
  let clock=1000,auths=0,refreshes=0;
  const c=createCalendarConnector({env:{GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'test'},now:()=>clock,fetcher:async(url,opts)=>{
    if(url.includes('/token')){const body=new URLSearchParams(opts.body);if(body.get('grant_type')==='refresh_token')refreshes++;auths++;return new Response(JSON.stringify({access_token:'account-'+auths,expires_in:3600,...(auths===1?{refresh_token:'account-a-refresh'}:{})}));}
    return new Response(JSON.stringify({id:'event'}));
  }});
  for(let i=0;i<2;i++){const auth=new URL(c.authorize().url);await c.callback(new URLSearchParams({state:auth.searchParams.get('state'),code:'auth'+i}));}
  clock+=3600000;
  await assert.rejects(c.insert({events:[event],confirmed:true}),e=>e.code==='calendar_expired');
  assert.equal(refreshes,0);assert.equal(c.status().connected,false);
});
test('re-saving a reminder applies current privacy settings to the existing event',async()=>{
  let stored=null;
  const c=createCalendarConnector({env:{GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'test'},fetcher:async(url,opts)=>{
    if(url.includes('/token'))return new Response(JSON.stringify({access_token:'token',expires_in:3600}));
    if(opts.method==='POST'&&stored)return new Response('{}',{status:409});
    stored=JSON.parse(opts.body);return new Response(JSON.stringify({id:'event'}));
  }});
  const auth=new URL(c.authorize().url);await c.callback(new URLSearchParams({state:auth.searchParams.get('state'),code:'code'}));
  await c.insert({events:[event],confirmed:true,includeDetails:true});assert.equal(stored.summary,event.title);
  const retry=await c.insert({events:[event],confirmed:true,includeDetails:false});assert.equal(retry.allSaved,true);assert.doesNotMatch(stored.summary,/示例药片/);assert.doesNotMatch(stored.description,/每日/);
});
