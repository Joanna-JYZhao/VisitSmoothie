import crypto from 'node:crypto';
import {AppError} from './provider.mjs';
import {validateReminders,googleEvent} from '../public/calendar.js';

export function createCalendarConnector({env=process.env,fetcher=fetch,now=()=>Date.now()}={}) {
  const config={clientId:env.GOOGLE_CLIENT_ID||'',clientSecret:env.GOOGLE_CLIENT_SECRET||'',redirect:env.GOOGLE_REDIRECT_URI||`http://127.0.0.1:${env.PORT||4173}/api/calendar/google/callback`};
  let token=null;
  const pending=new Map();
  const configured=()=>Boolean(config.clientId&&config.clientSecret);
  const status=()=>({configured:configured(),connected:Boolean(token?.access_token),provider:'Google Calendar',redirectUri:config.redirect});
  async function request(url,options){let res;try{res=await fetcher(url,{...options,signal:AbortSignal.timeout(20000)});}catch{throw new AppError('calendar_network','Calendar service unavailable. Your reminder settings are retained.',502);}return res;}
  async function tokenRequest(data,{replace=false}={}){const res=await request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(data)});if(!res.ok)throw new AppError('calendar_auth','Google authorization failed. Reconnect your calendar.',401);const result=await res.json();if(!result.access_token)throw new AppError('calendar_auth','Google did not return access.',401);token={...(replace?{}:token),...result,expiresAt:now()+Number(result.expires_in||3600)*1000};}
  function authorize(){
    if(!configured())throw new AppError('calendar_not_configured','Google Calendar interface is ready. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the local .env first.',503);
    const callback=new URL(config.redirect);if(callback.protocol!=='http:'||!['localhost','127.0.0.1'].includes(callback.hostname)||callback.pathname!=='/api/calendar/google/callback')throw new AppError('calendar_config','Use the documented local OAuth callback URL.',503);
    for(const [key,value] of pending)if(now()-value.created>600000)pending.delete(key);
    const state=crypto.randomBytes(32).toString('hex'),verifier=crypto.randomBytes(32).toString('base64url');
    pending.set(state,{verifier,created:now()});
    const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search=new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirect,response_type:'code',scope:'https://www.googleapis.com/auth/calendar.events',state,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',access_type:'offline',prompt:'consent'}).toString();
    return {url:url.href};
  }
  async function callback(params){const state=params.get('state'),flow=pending.get(state);pending.delete(state);if(!flow||now()-flow.created>600000)throw new AppError('calendar_state','This connection attempt expired. Start again from AfterDoc.',400);if(params.get('error')||!params.get('code'))throw new AppError('calendar_denied','Calendar access was not granted.',400);await tokenRequest({client_id:config.clientId,client_secret:config.clientSecret,redirect_uri:config.redirect,code:params.get('code'),code_verifier:flow.verifier,grant_type:'authorization_code'},{replace:true});return status();}
  async function access(){if(!token)throw new AppError('calendar_not_connected','Connect Google Calendar before saving reminders.',401);if(token.expiresAt<now()+60000){if(!token.refresh_token){token=null;throw new AppError('calendar_expired','Reconnect Google Calendar.',401);}await tokenRequest({client_id:config.clientId,client_secret:config.clientSecret,refresh_token:token.refresh_token,grant_type:'refresh_token'});}return token.access_token;}
  async function insert(body){
    if(body.confirmed!==true)throw new AppError('calendar_confirmation','Review and confirm reminder dates and times first.',400);
    let events;try{events=validateReminders(body.events);}catch(e){throw new AppError('calendar_input',e.message,400);}
    const bearer=await access(),results=[];
    for(const event of events){
      // A stable ID permits safe retries after a partial write or lost response.
      const id=crypto.createHash('sha256').update(event.id).digest('hex');
      const payload={...googleEvent(event,{includeDetails:body.includeDetails===true}),id};
      const endpoint='https://www.googleapis.com/calendar/v3/calendars/primary/events';
      try{
        let res=await request(endpoint+'?sendUpdates=none',{method:'POST',headers:{Authorization:`Bearer ${bearer}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
        if(res.status===409){res=await request(endpoint+'/'+id+'?sendUpdates=none',{method:'PATCH',headers:{Authorization:`Bearer ${bearer}`,'Content-Type':'application/json'},body:JSON.stringify(googleEvent(event,{includeDetails:body.includeDetails===true}))});}
        if(!res.ok){if(res.status===401)token=null;results.push({id:event.id,ok:false,error:res.status===401?'Reconnect Google Calendar.':'Google did not save this reminder.'});continue;}
        const saved=await res.json();results.push({id:event.id,ok:true,eventId:saved.id,htmlLink:typeof saved.htmlLink==='string'&&saved.htmlLink.startsWith('https://www.google.com/calendar/')?saved.htmlLink:null});
      }catch{results.push({id:event.id,ok:false,error:'Could not confirm this reminder was saved. Retry uses the same event id.'});}
    }
    return {results,allSaved:results.every(r=>r.ok)};
  }
  function disconnect(){token=null;pending.clear();return status();}
  return {status,authorize,callback,insert,disconnect};
}
