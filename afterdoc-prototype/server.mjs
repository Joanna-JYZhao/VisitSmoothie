import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {AppError, completeJson, loadProviderConfig} from './server/provider.mjs';
import {extractDocument} from './server/extract.mjs';
import {createCalendarConnector} from './server/calendar.mjs';
import {calendarFile} from './public/calendar.js';
import {validateDocuments, validateIntake, validatePlan, validateAnswer, validateCheck, promptFor, validatePreviousVisit} from './server/agent.mjs';

const APP_DIR = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(APP_DIR, 'public');
const CONFIG = loadProviderConfig(APP_DIR);
const MIME = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2'};

function security(res) {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
}

function json(res, status, object) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'});
  res.end(JSON.stringify(object));
}

function checkHost(req) {
  const host = req.headers.host;
  if (!host || !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(host)) throw new AppError('forbidden_host', 'Local access only.', 403);
  if (req.method === 'POST' && req.headers.origin) {
    let origin;
    try { origin = new URL(req.headers.origin); } catch { throw new AppError('forbidden_origin', 'Request origin is not allowed.', 403); }
    if (origin.protocol !== 'http:' || !['localhost','127.0.0.1','[::1]'].includes(origin.hostname) || origin.host !== host) throw new AppError('forbidden_origin', 'Request origin is not allowed.', 403);
  }
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new AppError('body_too_large', 'Request is too large.', 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req,limit=256*1024) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw new AppError('bad_input', 'Send JSON data.', 415);
  try {
    const body = JSON.parse((await readBody(req,limit)).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('shape');
    return body;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('bad_input', 'Invalid JSON request.', 400);
  }
}

function parseMultipart(buffer, boundary) {
  if (!boundary || boundary.length > 150) throw new AppError('bad_input', 'Invalid upload form.', 400);
  const marker = Buffer.from(`--${boundary}`);
  const pieces = [];
  let from = buffer.indexOf(marker);
  if (from < 0) throw new AppError('bad_input', 'Invalid upload form.', 400);
  while (from >= 0) {
    const start = from + marker.length;
    if (buffer.subarray(start, start + 2).toString() === '--') break;
    if (buffer.subarray(start, start + 2).toString() !== '\r\n') throw new AppError('bad_input', 'Invalid upload form.', 400);
    const next = buffer.indexOf(marker, start + 2);
    if (next < 0) break;
    pieces.push(buffer.subarray(start + 2, next - 2));
    from = next;
  }
  return pieces.map(piece => {
    const split = piece.indexOf(Buffer.from('\r\n\r\n'));
    if (split < 0) return null;
    const header = piece.subarray(0, split).toString('latin1');
    const name = /\bname="([^"]+)"/i.exec(header)?.[1];
    const filename = /\bfilename="([^"]*)"/i.exec(header)?.[1];
    return {name, filename, data:piece.subarray(split + 4)};
  }).filter(Boolean);
}

async function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') throw new AppError('not_found', 'Not found.', 404);
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { throw new AppError('not_found', 'Not found.', 404); }
  if (decoded.includes('\0') || decoded.includes('\\') || decoded.split('/').includes('..')) throw new AppError('not_found', 'Not found.', 404);
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  if (!MIME[path.extname(relative).toLowerCase()]) throw new AppError('not_found', 'Not found.', 404);
  const publicReal = await fs.realpath(PUBLIC).catch(() => null);
  if (!publicReal) throw new AppError('not_found', 'Not found.', 404);
  const target = path.resolve(PUBLIC, relative);
  const real = await fs.realpath(target).catch(() => null);
  if (!real || !real.startsWith(`${publicReal}${path.sep}`)) throw new AppError('not_found', 'Not found.', 404);
  const info = await fs.stat(real);
  if (!info.isFile()) throw new AppError('not_found', 'Not found.', 404);
  const body = await fs.readFile(real);
  res.writeHead(200, {'Content-Type':MIME[path.extname(relative).toLowerCase()], 'Content-Length':body.length});
  res.end(req.method === 'HEAD' ? undefined : body);
}

export function createServer({config = CONFIG, complete = completeJson} = {}) {
  const calendar=createCalendarConnector();
  const exports=new Map();
  return http.createServer(async (req, res) => {
    security(res);
    try {
      checkHost(req);
      const pathname = new URL(req.url || '/', 'http://localhost').pathname;
      if(pathname==='/api/exports'&&req.method==='POST'){
        const body=await readJson(req,8*1024*1024);let content,filename,type;
        if(body.type==='calendar'){try{content=calendarFile(body.events,{includeDetails:body.includeDetails===true});}catch(e){throw new AppError('export_input',e.message,400);}filename='AfterDoc-reminders.ics';type='text/calendar; charset=utf-8';}
        else if(body.type==='note'&&typeof body.text==='string'&&body.text.length<=100000){content=body.text;filename='AfterDoc-visit-note.txt';type='text/plain; charset=utf-8';}
        // Preserve even unreadable stored JSON exactly so recovery never rewrites it.
        else if(body.type==='backup'&&typeof body.text==='string'&&Buffer.byteLength(body.text,'utf8')<=8*1024*1024){content=body.text;filename='AfterDoc-visit-history.json';type='application/json; charset=utf-8';}
        else throw new AppError('export_input','Choose a valid note, history backup or calendar export.',400);
        for(const [id,file] of exports)if(Date.now()>file.expires)exports.delete(id);
        if(exports.size>=10)exports.delete(exports.keys().next().value);
        const id=crypto.randomUUID();exports.set(id,{content,filename,type,expires:Date.now()+600000});
        return json(res,200,{ok:true,url:'/api/download/'+id,filename});
      }
      if(pathname.startsWith('/api/download/')&&req.method==='GET'){
        const file=exports.get(pathname.slice('/api/download/'.length));
        if(!file||Date.now()>file.expires)throw new AppError('export_expired','This download expired. Export it again from your session.',404);
        res.writeHead(200,{'Content-Type':file.type,'Content-Disposition':`attachment; filename="${file.filename}"`});return res.end(file.content);
      }
      if(pathname==='/api/calendar/status'&&req.method==='GET')return json(res,200,{ok:true,...calendar.status()});
      if(pathname==='/api/calendar/google/authorize'&&req.method==='POST'){await readJson(req);return json(res,200,{ok:true,...calendar.authorize()});}
      if(pathname==='/api/calendar/google/events'&&req.method==='POST')return json(res,200,{ok:true,...await calendar.insert(await readJson(req))});
      if(pathname==='/api/calendar/disconnect'&&req.method==='POST'){await readJson(req);return json(res,200,{ok:true,...calendar.disconnect()});}
      if(pathname==='/api/calendar/google/callback'&&req.method==='GET'){
        await calendar.callback(new URL(req.url,'http://localhost').searchParams);
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
        return res.end('<!doctype html><meta charset="utf-8"><title>AfterDoc Calendar</title><h1>Google Calendar connected</h1><p>Return to the original AfterDoc tab and refresh the calendar connection status. You can close this tab.</p><p>已连接。请回到原来的 AfterDoc 页面，点击“刷新连接状态”。</p>');
      }
      if (req.method === 'GET' && pathname === '/api/health') return json(res, 200, {ok:true, configured:Boolean(config.key), provider:'DeepSeek', model:config.model});
      if (req.method === 'POST' && pathname === '/api/extract-document') {
        const type = req.headers['content-type'] || '';
        const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(type)?.slice(1).find(Boolean);
        if (!/^multipart\/form-data\b/i.test(type)) throw new AppError('bad_input', 'Send a multipart file upload.', 415);
        const parts = parseMultipart(await readBody(req, 8 * 1024 * 1024 + 16384), boundary);
        const file = parts.find(part => part.name === 'file' && part.filename);
        if (!file) throw new AppError('bad_input', 'Choose a document file.', 400);
        return json(res, 200, {ok:true, document:await extractDocument(file.data, file.filename)});
      }
      if (req.method === 'POST' && pathname === '/api/agent') {
        const body = await readJson(req);
        const {task, language = 'en', payload} = body;
        if (!['zh','en'].includes(language) || !['intake','extract_plan','ask_plan','check_understanding'].includes(task) || !payload || typeof payload !== 'object' || Array.isArray(payload)) throw new AppError('bad_input', 'Invalid task, language, or payload.', 400);
        let documents;
        let input = payload;
        if (task !== 'intake') documents = validateDocuments(payload.documents);
        if (task === 'intake') {
          if (!Array.isArray(payload.messages) || payload.messages.length > 30 || payload.messages.some(m => !['user','assistant'].includes(m?.role) || typeof m.content !== 'string' || m.content.length > 5000)) throw new AppError('bad_input', 'Invalid intake messages.', 400);
          const records = validateDocuments(payload.records ?? [], {allowEmpty:true});
          if (records.some(record => record.id === 'patient')) throw new AppError('bad_input', 'Record ID patient is reserved.', 400);
          input = {...payload, records, previousVisit:validatePreviousVisit(payload.previousVisit)};
        }
        if (task === 'ask_plan' && (!stringPresent(payload.question) || !['brief','detail'].includes(payload.preference) || !payload.plan || typeof payload.plan !== 'object')) throw new AppError('bad_input', 'Invalid plan question.', 400);
        if (task === 'check_understanding' && (!payload.item || typeof payload.item !== 'object' || !stringPresent(payload.question) || typeof payload.answer !== 'string')) throw new AppError('bad_input', 'Invalid understanding check.', 400);
        const response = await complete(config, promptFor(task, language), input);
        let result;
        if (task === 'intake') result = validateIntake(response.result, input, language);
        if (task === 'extract_plan') result = validatePlan(response.result, documents, language);
        if (task === 'ask_plan') result = validateAnswer(response.result, documents, payload.question, language);
        if (task === 'check_understanding') result = validateCheck(response.result, documents, payload.item, payload.answer, language);
        return json(res, 200, {ok:true, result, meta:{provider:'DeepSeek', model:config.model, latencyMs:response.latencyMs}});
      }
      if (pathname.startsWith('/api/')) throw new AppError('not_found', 'Not found.', 404);
      return await serveStatic(req, res, pathname);
    } catch (error) {
      const known = error instanceof AppError ? error : new AppError('server_error', 'The request could not be completed.', 500);
      if (!res.headersSent) json(res, known.status, {ok:false, error:{code:known.code, message:known.message}});
      else res.end();
    }
  });
}

function stringPresent(value) { return typeof value === 'string' && Boolean(value.trim()) && value.length <= 5000; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4173);
  createServer().listen(port, '127.0.0.1', () => {
    process.stdout.write(`AfterDoc listening on http://127.0.0.1:${port}\n`);
  });
}
