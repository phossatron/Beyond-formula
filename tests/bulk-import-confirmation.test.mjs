import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function inlineFunction(name){
  const start=html.indexOf('function '+name+'(');
  assert.ok(start>=0,'missing function '+name);
  const end=html.indexOf('\n}',start);
  assert.ok(end>start,'missing function end '+name);
  return html.slice(start,end+2);
}
function context(){
  const c={sbConfirmedRecords:{},jobRecordFingerprint:record=>JSON.stringify(record)};
  vm.createContext(c);
  vm.runInContext(inlineFunction('bulkImportRecordConfirmed'),c);
  vm.runInContext(inlineFunction('bulkImportSummary'),c);
  return c;
}
function record(id){return {id,customer:'Synthetic customer',createdBy:'Admin',createdAt:1000,rows:[]};}

test('partial bulk import reports each source row and never claims complete success',()=>{
  const c=context(),first=record('A00092'),second=record('A00093');
  c.sbConfirmedRecords[first.id]=JSON.stringify(first);
  const summary=c.bulkImportSummary([
    {sourceJobId:'1',record:first},
    {sourceJobId:'2',record:second}
  ],true);
  assert.match(summary,/ระบบกลางยืนยัน 1\/2 งาน/);
  assert.match(summary,/JobID 1 → A00092: บันทึกยืนยันแล้ว/);
  assert.match(summary,/JobID 2 → A00093: ยังค้าง/);
  assert.doesNotMatch(summary,/นำเข้าสำเร็จ 2 รายการ/);
});

test('bulk import says success only when every row matches a fresh server acknowledgement',()=>{
  const c=context(),first=record('A00092'),second=record('A00093');
  c.sbConfirmedRecords[first.id]=JSON.stringify(first);
  c.sbConfirmedRecords[second.id]=JSON.stringify(second);
  const summary=c.bulkImportSummary([
    {sourceJobId:'1',record:first},
    {sourceJobId:'2',record:second}
  ],true);
  assert.match(summary,/นำเข้าสำเร็จ 2 รายการ/);
  assert.match(summary,/JobID 1 → A00092: บันทึกยืนยันแล้ว/);
  assert.match(summary,/JobID 2 → A00093: บันทึกยืนยันแล้ว/);
});

test('bulk import reports locally rejected rows instead of omitting them',()=>{
  const c=context();
  const summary=c.bulkImportSummary([{sourceJobId:'4',rowNumber:5,record:null,error:'รหัสงานซ้ำในไฟล์'}],true);
  assert.match(summary,/ไม่มีรายการที่สร้างได้/);
  assert.match(summary,/JobID 4 → —: ไม่ได้สร้าง: รหัสงานซ้ำในไฟล์/);
  assert.doesNotMatch(summary,/นำเข้าสำเร็จ/);
});
