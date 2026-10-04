import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBriefPdf } from '../server/pdf.mjs';

test('PDF export produces a real file for reviewed bilingual text', async()=>{
  const pdf=await renderBriefPdf({text:'Visit brief / 就诊摘要\n\n症状变化\n患者报告：饭后腹部不适，持续约 20 分钟。\nAllergies: not recorded / 过敏尚未记录。\nLiteral markup: <script> & <b>patient text</b>',locale:'zh',version:2,createdAt:'2026-10-03T04:00:00Z'},{demo:true});
  assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  assert.ok(pdf.length>2000);
  assert.match(pdf.subarray(-100).toString(),/%%EOF/);
});
