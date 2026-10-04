import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HttpError } from './validation.mjs';

const bundledPython='/Users/xinlu/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
const renderer=fileURLToPath(new URL('./pdf.py',import.meta.url));

// Health text travels through stdin only, never shell arguments or a temporary file.
export function renderBriefPdf(brief,{demo=false}={}){
  const python=process.env.JOURNAL_PYTHON || (existsSync(bundledPython)?bundledPython:'python3');
  return new Promise((resolve,reject)=>{
    const child=spawn(python,[renderer],{stdio:['pipe','pipe','pipe'],shell:false});
    const chunks=[];let size=0;let settled=false;
    const fail=()=>{if(settled)return;settled=true;clearTimeout(timer);child.kill();reject(new HttpError(503,'PDF export is unavailable. Your saved brief is safe; you can still copy or print it.','PDF_UNAVAILABLE'))};
    const timer=setTimeout(fail,20_000);timer.unref();
    child.on('error',fail);child.stdin.on('error',fail);
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>8*1024*1024)fail();else chunks.push(chunk)});
    child.stderr.resume(); // Do not expose document content or internal diagnostics.
    child.on('close',code=>{
      if(settled)return;
      if(code!==0){fail();return}
      const output=Buffer.concat(chunks);
      if(output.subarray(0,5).toString()!=='%PDF-'){fail();return}
      settled=true;clearTimeout(timer);resolve(output);
    });
    child.stdin.end(JSON.stringify({text:brief.text,locale:brief.locale,version:brief.version,createdAt:brief.createdAt,demo}));
  });
}
