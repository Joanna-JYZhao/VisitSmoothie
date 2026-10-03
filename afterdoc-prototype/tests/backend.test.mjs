import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createServer} from '../server.mjs';
import {AppError, completeJson} from '../server/provider.mjs';
import {extractDocument} from '../server/extract.mjs';
import {demoRecords} from '../public/fixtures.js';
import {validatePlan, validateAnswer, validateCheck, validateIntake, unsafeQuestionRoute} from '../server/agent.mjs';

const documents = [{id:'doc-1',title:'Visit note',text:'Medicine A: 1 tablet twice daily, after breakfast and dinner, for 5 days. Follow up if symptoms persist.'}];
const item = {id:'item-1',kind:'medication',title:'Medicine A',dose:'1 tablet',frequency:'twice daily',duration:'5 days',timing:'after breakfast and dinner',sourceId:'doc-1',sourceQuote:'Medicine A: 1 tablet twice daily, after breakfast and dinner, for 5 days.',missing:[]};

test('plan keeps verified directions and removes unsupported clinical fields', () => {
  const result = validatePlan({items:[{...item,dose:'2 tablets',duration:'5 days'}]}, documents);
  assert.equal(result.items[0].dose, '');
  assert.equal(result.items[0].duration, '5 days');
  assert.ok(result.items[0].missing.includes('dose'));
});

test('empty essential medication directions are marked missing', () => {
  const result = validatePlan({items:[{...item,dose:'',frequency:'',duration:'',timing:'',missing:[]}]},documents);
  assert.deepEqual(result.items[0].missing.sort(),['dose','duration','frequency']);
  assert.equal(result.complexity.level,'medium');
});

test('plan rejects fabricated provenance', () => {
  assert.throws(() => validatePlan({items:[{...item,sourceQuote:'A made-up instruction'}]}, documents), {code:'ungrounded_plan'});
});

test('plan keeps only document-exact warnings and translates complexity reasons', () => {
  const result = validatePlan({items:[{...item,dose:'2 tablets'}],warnings:['Follow up if symptoms persist.','Avoid driving for a month.']},documents,'zh');
  assert.deepEqual(result.warnings,['Follow up if symptoms persist.']);
  assert.deepEqual(result.complexity.reasons,['部分说明缺失']);
});

test('normalizes plan kind aliases and removes inapplicable missing fields', () => {
  const doc = {id:'demo-doc',title:'Fictional visit',text:demoRecords.zh};
  const testQuote = '检查：10月5日上午进行预约检查。检查前准备以预约单的书面要求为准；本记录未列出具体准备要求。';
  const followQuote = '复诊：10月9日门诊复诊，携带药物包装与这份记录。';
  const instructionQuote = '记录症状出现的时间及用药后的变化，复诊时一起讨论。';
  const result = validatePlan({items:[
    {id:'test',kind:'test',title:'预约检查',sourceId:'demo-doc',sourceQuote:testQuote,missing:['explanation','dose','frequency','duration','检查准备要求']},
    {id:'follow',kind:'follow_up',title:'门诊复诊',sourceId:'demo-doc',sourceQuote:followQuote,missing:['rationale','dose','date']},
    {id:'instruction',kind:'instruction',title:'记录症状',sourceId:'demo-doc',sourceQuote:instructionQuote,missing:['summary','duration']},
  ]},[doc],'zh');
  assert.deepEqual(result.items.map(i => i.kind),['test','followup','instruction']);
  assert.deepEqual(result.items[0].missing,['检查准备要求']);
  assert.deepEqual(result.items[1].missing,['date']);
  assert.deepEqual(result.items[2].missing,[]);
});

test('explicitly missing test preparation survives even if model omits missing array', () => {
  const doc = {id:'demo-doc',title:'Fictional visit',text:demoRecords.zh};
  const quote = '检查：10月5日上午进行预约检查。检查前准备以预约单的书面要求为准；本记录未列出具体准备要求。';
  const result = validatePlan({items:[{kind:'test',title:'预约检查',sourceId:'demo-doc',sourceQuote:quote,missing:[]}]},[doc],'zh');
  assert.deepEqual(result.items[0].missing,['检查准备要求']);
});

test('intake facts require an exact user quote', () => {
  const result = validateIntake({reply:'Thanks',question:'When?',aid:'timeline',facts:[{label:'Onset',value:'today',quote:'today'},{label:'Dose',value:'one',quote:'one pill'}],unknowns:[],ready:false},{messages:[{role:'user',content:'It started today.'},{role:'assistant',content:'Take one pill.'}],turn:1});
  assert.equal(result.facts.length, 1);
  assert.equal(result.facts[0].quote, 'today');
  assert.equal(result.facts[0].sourceId, 'patient');
});

test('record facts cite their exact record; assistant text and invented IDs are rejected', () => {
  const record = {id:'record-1',title:'Prior visit',text:'Prior record says the symptom began Monday.'};
  const payload = {messages:[{role:'user',kind:'record',content:'I supplied this record.'},{role:'assistant',content:'assistant-only detail'},{role:'user',content:'I feel tired.'}],records:[record],turn:1};
  const result = validateIntake({reply:'One question?',question:'Anything else?',aid:'record',facts:[
    {label:'Past onset',value:'Monday',quote:'symptom began Monday',sourceId:'record-1'},
    {label:'Assistant claim',value:'x',quote:'assistant-only detail',sourceId:'patient'},
    {label:'Invented source',value:'x',quote:'symptom began Monday',sourceId:'record-2'},
    {label:'Record notice',value:'x',quote:'I supplied this record.',sourceId:'patient'},
  ],unknowns:[],ready:false},payload);
  assert.deepEqual(result.facts.map(f => f.sourceId),['record-1']);
  assert.equal(result.ready,false);
});

test('legacy facts infer patient first then record source', () => {
  const payload = {messages:[{role:'user',content:'I felt tired Monday.'}],records:[{id:'record-1',title:'History',text:'I felt tired Monday. Earlier note says Tuesday.'}],turn:1};
  const result = validateIntake({reply:'Thanks',question:'More?',aid:'record',facts:[
    {label:'Patient',value:'Monday',quote:'I felt tired Monday.'},
    {label:'Record',value:'Tuesday',quote:'Earlier note says Tuesday.'},
  ],unknowns:[],ready:false},payload);
  assert.deepEqual(result.facts.map(f => f.sourceId),['patient','record-1']);
});

test('finish suppresses model follow-up and gives a summary-ready reply', () => {
  const result = validateIntake({reply:'What else happened?',question:'What else?',aid:'open_question',facts:[],unknowns:['time unclear'],ready:false},{messages:[{role:'user',content:'I am done.'}],records:[],turn:1,finish:true},'zh');
  assert.equal(result.ready,true);
  assert.equal(result.aid,'summary');
  assert.equal(result.question,'');
  assert.deepEqual(result.options,[]);
  assert.match(result.reply,/摘要/);
  assert.ok(!result.reply.includes('What else'));
});

test('explicit self-directed dose change goes to clinical review', () => {
  assert.equal(unsafeQuestionRoute('Can I stop taking my medicine now?'), 'clinical_review');
  const result = validateAnswer({route:'explanation',reply:'Yes',citations:[{sourceId:'doc-1',quote:item.sourceQuote}]}, documents, 'Can I stop taking my medicine now?', 'en');
  assert.equal(result.route, 'clinical_review');
  assert.ok(!result.reply.includes('Yes'));
  assert.equal(unsafeQuestionRoute('When does the written 5-day course end?'), null);
  assert.equal(unsafeQuestionRoute('感觉好多了，可以提前停药吗？'), 'clinical_review');
  assert.equal(unsafeQuestionRoute('吃药以后开始恶心'), 'clinical_review');
  assert.equal(unsafeQuestionRoute('计划写的疗程何时结束？'), null);
});

test('model-selected clinical review never forwards a treatment instruction', () => {
  const result = validateAnswer({route:'clinical_review',reply:'Stop Medicine A today.',citations:[{sourceId:'doc-1',quote:item.sourceQuote}],questionForClinician:'Stop Medicine A today.'},documents,'Could this medicine be changed?','en');
  assert.equal(result.route,'clinical_review');
  assert.ok(!result.reply.includes('Stop Medicine A'));
  assert.equal(result.questionForClinician,null);
  const missing = validateAnswer({route:'source_missing',reply:'Take two tablets instead.',citations:[]},documents,'What if I miss a dose?','en');
  assert.equal(missing.route,'source_missing');
  assert.ok(!missing.reply.includes('two tablets'));
});

test('ungrounded explanation and unsure understanding cannot pass', () => {
  const answer = validateAnswer({route:'explanation',reply:'Use 2 tablets',citations:[{sourceId:'doc-1',quote:'not in document'}]}, documents, 'What does it say?', 'en');
  assert.equal(answer.route, 'source_missing');
  const check = validateCheck({status:'matched',reply:'Correct',citations:[{sourceId:'doc-1',quote:item.sourceQuote}]}, documents, item, 'not sure', 'en');
  assert.equal(check.status, 'uncertain');
  const missed = validateAnswer({route:'explanation',reply:'Take it right away',citations:[{sourceId:'doc-1',quote:item.sourceQuote}]}, documents, 'What if I miss a dose of this medicine?', 'en');
  assert.equal(missed.route, 'source_missing');
  assert.ok(!missed.reply.includes('right away'));
});

test('malformed model output and upstream errors return clean responses', async () => {
  const server = createServer({config:{key:'test-key',model:'test-model'},complete:async () => ({result:{nonsense:true},latencyMs:1})});
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  try {
    const port = server.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/api/agent`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({task:'extract_plan',language:'en',payload:{documents}})});
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error.code, 'provider_parse');
  } finally { await new Promise(resolve => server.close(resolve)); }
  const failed = createServer({config:{key:'test-key',model:'test-model'},complete:async () => {throw new AppError('provider_timeout','The AI service timed out.',504);}});
  await new Promise(resolve => failed.listen(0,'127.0.0.1',resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${failed.address().port}/api/agent`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({task:'extract_plan',payload:{documents}})});
    assert.equal(response.status, 504);
    assert.equal((await response.json()).error.code, 'provider_timeout');
  } finally { await new Promise(resolve => failed.close(resolve)); }
});

test('provider timeout includes slow response body', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ok:true,json:() => new Promise(resolve => setTimeout(() => resolve({choices:[{message:{content:'{"ok":true}'}}]}),60))});
  try {
    const started = Date.now();
    await assert.rejects(completeJson({key:'synthetic',model:'test',baseUrl:'https://example.test'},'Return JSON.',{},10),{code:'provider_timeout'});
    assert.ok(Date.now() - started < 55);
  } finally { globalThis.fetch = originalFetch; }
});

test('rejects traversal and foreign origin', async () => {
  const server = createServer({config:{key:'',model:'test-model'}});
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const traversal = await fetch(`${base}/%2e%2e%2fBACKEND-BRIEF.md`);
    assert.equal(traversal.status, 404);
    const origin = await fetch(`${base}/api/agent`, {method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'});
    assert.equal(origin.status, 403);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('extracts plain text upload and rejects binary garbage', async () => {
  const server = createServer({config:{key:'',model:'test-model'}});
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const form = new FormData();
    form.append('file', new Blob(['Medicine A: 1 tablet twice daily.'], {type:'text/plain'}), 'visit.txt');
    const response = await fetch(`${base}/api/extract-document`, {method:'POST',body:form});
    assert.equal(response.status, 200);
    assert.match((await response.json()).document.text, /Medicine A/);
    const bad = new FormData();
    bad.append('file',new Blob([new Uint8Array([0,1,2,3,4,5,6,7,8,9,10,11,12,13])]),'bad.txt');
    const rejected = await fetch(`${base}/api/extract-document`,{method:'POST',body:bad});
    assert.equal(rejected.status, 415);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('intake accepts a long separate record and verifies its citation', async () => {
  const record = {id:'record-long',title:'Prior note',text:'History: began on Monday.\n' + 'Unrelated history line.\n'.repeat(450)};
  const server = createServer({config:{key:'test-key',model:'test-model'},complete:async (_config,_prompt,input) => {
    assert.equal(input.records[0].text.length > 5000,true);
    return {result:{reply:'Thanks',aid:'record',question:'When did it change?',options:[],facts:[{label:'Onset',value:'Monday',quote:'began on Monday',sourceId:'record-long'}],unknowns:[],ready:false},latencyMs:1};
  }});
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/agent`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({task:'intake',language:'en',payload:{messages:[{role:'user',kind:'record',content:'I supplied this record.'}],records:[record],turn:0}})});
    assert.equal(response.status,200);
    const data = await response.json();
    assert.equal(data.result.facts[0].sourceId,'record-long');
    assert.equal(data.result.ready,false);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('extracts machine-readable DOCX without saving an upload', async () => {
  const python = '/Users/xinlu/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
  const code = 'import io,sys\nfrom docx import Document\nd=Document()\nd.add_paragraph("Medicine A: one tablet with breakfast.")\nb=io.BytesIO()\nd.save(b)\nsys.stdout.buffer.write(b.getvalue())';
  const generated = spawnSync(python,['-c',code],{maxBuffer:1024*1024});
  assert.equal(generated.status,0);
  const doc = await extractDocument(generated.stdout,'visit.docx');
  assert.match(doc.text,/Medicine A: one tablet/);
});

test('extracts machine-readable PDF text', async () => {
  const python = '/Users/xinlu/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
  const code = 'import io,sys\nfrom reportlab.pdfgen import canvas\nb=io.BytesIO()\nc=canvas.Canvas(b)\nc.drawString(72,700,"Follow up in two weeks.")\nc.save()\nsys.stdout.buffer.write(b.getvalue())';
  const generated = spawnSync(python,['-c',code],{maxBuffer:1024*1024});
  assert.equal(generated.status,0);
  const doc = await extractDocument(generated.stdout,'visit.pdf');
  assert.match(doc.text,/Follow up in two weeks/);
});

test('locally OCRs a synthetic medicine-label PNG and requires review', async () => {
  const python = '/Users/xinlu/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
  const code = 'import io,sys\nfrom PIL import Image,ImageDraw,ImageFont\ni=Image.new("RGB",(1400,480),"white")\nd=ImageDraw.Draw(i)\nf=ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf",72)\nd.text((70,60),"MEDICINE A",font=f,fill="black")\nf2=ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf",57)\nd.text((70,190),"Take 1 tablet twice daily",font=f2,fill="black")\nb=io.BytesIO()\ni.save(b,format="PNG")\nsys.stdout.buffer.write(b.getvalue())';
  const image = spawnSync(python,['-c',code],{maxBuffer:1024*1024});
  assert.equal(image.status,0);
  const document = await extractDocument(image.stdout,'synthetic-label.png');
  assert.match(document.text,/MEDICINE A/i);
  assert.match(document.text,/1 tablet twice daily/i);
  assert.equal(document.extraction,'ocr');
  assert.equal(document.requiresReview,true);
  const server = createServer({config:{key:'',model:'test-model'}});
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  try {
    const form = new FormData();
    form.append('file',new Blob([image.stdout],{type:'image/png'}),'synthetic-label.png');
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/extract-document`,{method:'POST',body:form});
    assert.equal(response.status,200);
    const body = await response.json();
    assert.equal(body.document.extraction,'ocr');
    assert.equal(body.document.requiresReview,true);
    assert.match(body.document.text,/1 tablet twice daily/i);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('invalid and blank image uploads fail cleanly', async () => {
  await assert.rejects(extractDocument(Buffer.from('not a real png image with letters'), 'bad.png'),{code:'ocr_failed'});
  const python = '/Users/xinlu/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
  const code = 'import io,sys\nfrom PIL import Image\nb=io.BytesIO()\nImage.new("RGB",(400,200),"white").save(b,format="PNG")\nsys.stdout.buffer.write(b.getvalue())';
  const image = spawnSync(python,['-c',code],{maxBuffer:1024*1024});
  assert.equal(image.status,0);
  await assert.rejects(extractDocument(image.stdout,'blank.png'),{code:'scanned_document'});
});

test('Vision OCR reads simplified Chinese and honors JPEG EXIF orientation', async () => {
  const python = '/Users/xinlu/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
  const chinese = 'import io,sys\nfrom PIL import Image,ImageDraw,ImageFont\ni=Image.new("RGB",(1500,450),"white")\nd=ImageDraw.Draw(i)\nf=ImageFont.truetype("/System/Library/Fonts/STHeiti Medium.ttc",72)\nd.text((70,60),"示例药片 A",font=f,fill="black")\nd.text((70,190),"每日2次 早餐后服用",font=f,fill="black")\nb=io.BytesIO()\ni.save(b,format="PNG")\nsys.stdout.buffer.write(b.getvalue())';
  const chineseImage = spawnSync(python,['-c',chinese],{maxBuffer:1024*1024});
  assert.equal(chineseImage.status,0);
  assert.match((await extractDocument(chineseImage.stdout,'chinese-label.png')).text,/每日2次/);
  const rotated = 'import io,sys\nfrom PIL import Image,ImageDraw,ImageFont\ni=Image.new("RGB",(1400,400),"white")\nd=ImageDraw.Draw(i)\nf=ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf",70)\nd.text((60,110),"MEDICINE A 1 TABLET",font=f,fill="black")\ni=i.rotate(90,expand=True)\ne=Image.Exif()\ne[274]=6\nb=io.BytesIO()\ni.save(b,format="JPEG",quality=95,exif=e)\nsys.stdout.buffer.write(b.getvalue())';
  const rotatedImage = spawnSync(python,['-c',rotated],{maxBuffer:1024*1024});
  assert.equal(rotatedImage.status,0);
  assert.match((await extractDocument(rotatedImage.stdout,'rotated.jpg')).text,/MEDICINE A 1 TABLET/);
});

test('exports are downloadable attachments with exact content and no arbitrary file reads',async()=>{
  const server=createServer({config:{key:'test',model:'test'}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const note='Synthetic visit note: original plan and unresolved questions.';
    const prepared=await fetch(base+'/api/exports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'note',text:note})});
    assert.equal(prepared.status,200);const ready=await prepared.json();
    const file=await fetch(base+ready.url);assert.match(file.headers.get('content-disposition'),/attachment/);assert.equal(await file.text(),note);
    const bad=await fetch(base+'/api/download/not-a-token');assert.equal(bad.status,404);
    const calendar=await fetch(base+'/api/exports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'calendar',events:[{id:'synthetic-ics',title:'Fictional medicine',description:'private',start:'2026-10-03T08:00:00',timeZone:'Asia/Shanghai',count:5,minutesBefore:0,kind:'medication'}]})});
    const link=await calendar.json();const ics=await fetch(base+link.url);const text=await ics.text();assert.match(text,/BEGIN:VCALENDAR/);assert.match(text,/COUNT=5/);assert.doesNotMatch(text,/Fictional medicine/);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
