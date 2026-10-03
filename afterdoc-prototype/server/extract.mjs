import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {AppError} from './provider.mjs';

const PYTHON = '/Users/xinlu/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
const RUNTIME = path.resolve(import.meta.dirname, '..', '.runtime');
const VISION_SOURCE = path.join(import.meta.dirname, 'vision_ocr.swift');
const VISION_BINARY = path.join(RUNTIME, 'vision-ocr');
const SWIFT_SDK = '/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk';
let compilePromise;

function runBounded(command, args, {timeoutMs, maxBytes, env}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {stdio:['ignore','pipe','pipe'],env});
    const chunks = [];
    let bytes = 0;
    let timedOut = false;
    let oversized = false;
    let settled = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > maxBytes) { oversized = true; child.kill('SIGKILL'); }
      else chunks.push(chunk);
    });
    child.stderr.resume();
    child.on('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new AppError('ocr_unavailable', 'Local image reading is unavailable. Paste the text instead.', 503));
    });
    child.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (timedOut) return reject(new AppError('ocr_timeout', 'Image reading timed out. Try a clearer or smaller photo.', 504));
      if (oversized) return reject(new AppError('document_too_long', 'This image contains too much text. Use a shorter excerpt.', 413));
      if (code !== 0) return reject(new AppError(code === 3 ? 'image_too_large' : 'ocr_failed', code === 3 ? 'This image has too many pixels. Use a smaller photo.' : 'Could not read this image. Try a clearer photo or paste the text.', 422));
      resolve(Buffer.concat(chunks));
    });
  });
}

async function ensureVisionBinary() {
  if (compilePromise) return compilePromise;
  compilePromise = (async () => {
    await fs.mkdir(RUNTIME, {recursive:true,mode:0o700});
    const [sourceStat, binaryStat] = await Promise.all([fs.stat(VISION_SOURCE),fs.stat(VISION_BINARY).catch(() => null)]);
    if (binaryStat && binaryStat.mtimeMs >= sourceStat.mtimeMs) return VISION_BINARY;
    const temporaryBinary = path.join(RUNTIME, `vision-ocr-${process.pid}-${crypto.randomUUID().slice(0,8)}`);
    try {
      await runBounded('/usr/bin/swiftc',['-sdk',SWIFT_SDK,'-O',VISION_SOURCE,'-o',temporaryBinary],{
        timeoutMs:90000,maxBytes:32768,
        env:{PATH:'/usr/bin:/bin',CLANG_MODULE_CACHE_PATH:path.join(RUNTIME,'clang-cache'),SWIFT_MODULE_CACHE_PATH:path.join(RUNTIME,'swift-cache')},
      });
      await fs.rename(temporaryBinary,VISION_BINARY);
      return VISION_BINARY;
    } catch {
      throw new AppError('ocr_unavailable', 'Local image reading is unavailable. Paste the text instead.', 503);
    } finally {
      await fs.rm(temporaryBinary,{force:true}).catch(() => {});
    }
  })();
  try { return await compilePromise; } finally { compilePromise = undefined; }
}

async function visionExtract(buffer, ext) {
  const binary = await ensureVisionBinary();
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),'afterdoc-ocr-'));
  try {
    const file = path.join(directory,`upload${ext}`);
    await fs.writeFile(file,buffer,{mode:0o600});
    const output = await runBounded(binary,[file],{timeoutMs:30000,maxBytes:140000,env:{PATH:'/usr/bin:/bin'}});
    return new TextDecoder('utf-8',{fatal:true}).decode(output);
  } finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
}

function decodePlain(buffer) {
  const text = new TextDecoder('utf-8', {fatal: true}).decode(buffer);
  if (text.includes('\0') || /[\x01-\x08\x0b\x0c\x0e-\x1f]/.test(text)) throw new AppError('unsupported_document', 'This file does not contain readable text. Paste its text instead.', 415);
  return text;
}

function pythonExtract(buffer, ext) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, [path.join(import.meta.dirname, 'extract_document.py'), ext], {stdio: ['pipe', 'pipe', 'pipe']});
    const chunks = [];
    let outBytes = 0;
    const timer = setTimeout(() => child.kill('SIGKILL'), 20000);
    child.stdout.on('data', data => {
      outBytes += data.length;
      if (outBytes > 250000) child.kill('SIGKILL');
      else chunks.push(data);
    });
    child.stderr.resume();
    child.on('error', () => { clearTimeout(timer); reject(new AppError('extract_failed', 'Could not read this file. Paste its text instead.', 422)); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new AppError('extract_failed', 'Could not read this file. Paste its text instead.', 422));
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    child.stdin.end(buffer);
  });
}

export async function extractDocument(buffer, filename) {
  const title = path.basename(String(filename || 'document')).slice(0, 160);
  const ext = path.extname(title).toLowerCase();
  if (!buffer.length || buffer.length > 8 * 1024 * 1024) throw new AppError('upload_size', 'Choose a file smaller than 8 MB.', 413);
  let text;
  let ocr = false;
  if (ext === '.txt' || ext === '.md') text = decodePlain(buffer);
  else if (ext === '.pdf' || ext === '.docx') text = await pythonExtract(buffer, ext);
  else if (['.png', '.jpg', '.jpeg', '.webp', '.heic', '.heif'].includes(ext)) {
    text = await visionExtract(buffer, ext);
    ocr = true;
  }
  else throw new AppError('unsupported_document', 'Use a TXT, Markdown, machine-readable PDF, DOCX, PNG, JPEG, WebP, or HEIC file.', 415);
  text = text.replace(/\r\n?/g, '\n').trim();
  if (text.length < 12) throw new AppError('scanned_document', ocr ? 'No readable text was found. Try a clearer photo or paste the text.' : 'No readable text was found. Paste the document text instead.', 422);
  if (text.length > 30000) throw new AppError('document_too_long', 'This document exceeds 30,000 characters. Paste a shorter excerpt.', 413);
  return {id: `doc-${crypto.randomUUID().slice(0, 8)}`, title, text, ...(ocr ? {extraction:'ocr',requiresReview:true} : {})};
}
