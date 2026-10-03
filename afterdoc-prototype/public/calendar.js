// Calendar times are chosen and confirmed by the patient, never inferred as medical advice.
export function dailyFrequency(text='') {
  const chinese={一:1,二:2,两:2,三:3,四:4};
  const zh=/^(?:每日|每天)\s*([1-4一二两三四])\s*次[。.]?$/.exec(text.trim());
  if(zh)return Number(zh[1])||chinese[zh[1]];
  if(/^twice (?:a day|daily)[.]?$/i.test(text.trim()))return 2;
  if(/^(?:once (?:a day|daily)|once-daily)[.]?$/i.test(text.trim()))return 1;
  const count=/^([1-4]) times (?:a day|daily)[.]?$/i.exec(text.trim());
  if(count)return Number(count[1]);
  return null;
}
export function durationDays(text='') {
  const m=/^(?:连续|共|for\s+)?([1-9]\d*)\s*(?:天|days?)[。.]?$/i.exec(text.trim());
  return m?Number(m[1]):null;
}
export function conditionalSchedule(text='') {
  return /按需|必要时|需要时|逐渐|逐步|递减|隔日|隔天|每隔|每周|as needed|if needed|\bprn\b|taper|every other|alternate days|weekly/i.test(text);
}
export function validateReminders(events) {
  if(!Array.isArray(events)||!events.length||events.length>32)throw new Error('Choose 1–32 reminder series.');
  return events.map(e=>{
    if(!e||typeof e!=='object'||typeof e.id!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(e.id))throw new Error('Invalid reminder id.');
    if(typeof e.title!=='string'||!e.title.trim()||e.title.length>200)throw new Error('Invalid reminder title.');
    const match=/^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):00$/.exec(e.start||'');
    if(!match||new Date(`${e.start}Z`).toISOString().slice(0,19)!==e.start)throw new Error('Choose a valid date and time.');
    if(typeof e.timeZone!=='string'||!e.timeZone.trim())throw new Error('Choose a valid time zone.');
    try{new Intl.DateTimeFormat('en',{timeZone:e.timeZone}).format();}catch{throw new Error('Choose a valid time zone.');}
    if(!Number.isInteger(e.count)||e.count<1||e.count>90)throw new Error('Choose 1–90 days.');
    if(!Number.isInteger(e.minutesBefore)||e.minutesBefore<0||e.minutesBefore>10080)throw new Error('Invalid alert time.');
    if(!['medication','test','followup'].includes(e.kind))throw new Error('Unsupported reminder type.');
    return {id:e.id,title:e.title,description:String(e.description||'').slice(0,5000),start:e.start,timeZone:e.timeZone,count:e.count,minutesBefore:e.minutesBefore,kind:e.kind};
  });
}
const escapeIcs=value=>String(value).replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
function foldLine(line){let result='',part='',bytes=0;for(const char of line){const size=new TextEncoder().encode(char).length;if(bytes+size>74){result+=part+'\r\n ';part='';bytes=1;}part+=char;bytes+=size;}return result+part;}
export function calendarFile(events,{includeDetails=false,stamp=new Date()}={}) {
  const reminders=validateReminders(events);
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//AfterDoc//Patient Reminders//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
  for(const e of reminders){
    const summary=includeDetails?e.title:e.kind==='medication'?'AfterDoc · Medication reminder':'AfterDoc · Appointment reminder';
    lines.push('BEGIN:VEVENT',`UID:${e.id}@afterdoc.local`,`DTSTAMP:${stamp.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')}`,`DTSTART;TZID=${e.timeZone}:${e.start.replace(/[-:]/g,'')}`,'DURATION:PT10M',`SUMMARY:${escapeIcs(summary)}`,`DESCRIPTION:${escapeIcs(includeDetails?e.description:'Open your AfterDoc plan for the original instructions.')}`,'CLASS:PRIVATE','TRANSP:TRANSPARENT');
    if(e.count>1)lines.push(`RRULE:FREQ=DAILY;COUNT=${e.count}`);
    lines.push('BEGIN:VALARM','ACTION:DISPLAY',`DESCRIPTION:${escapeIcs(summary)}`,`TRIGGER:-PT${e.minutesBefore}M`,'END:VALARM','END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n')+'\r\n';
}
export function googleEvent(e,{includeDetails=false}={}) {
  const item=validateReminders([e])[0];
  const endDate=new Date(`${item.start}Z`);endDate.setUTCMinutes(endDate.getUTCMinutes()+10);
  return {summary:includeDetails?item.title:item.kind==='medication'?'AfterDoc · Medication reminder':'AfterDoc · Appointment reminder',description:includeDetails?item.description:'Open your AfterDoc plan for the original instructions.',start:{dateTime:item.start,timeZone:item.timeZone},end:{dateTime:endDate.toISOString().slice(0,19),timeZone:item.timeZone},...(item.count>1?{recurrence:[`RRULE:FREQ=DAILY;COUNT=${item.count}`]}:{}),reminders:{useDefault:false,overrides:[{method:'popup',minutes:item.minutesBefore}]},visibility:'private',transparency:'transparent'};
}
