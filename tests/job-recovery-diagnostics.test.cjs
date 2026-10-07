'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function run(overrides = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../scripts/inspect-job-recovery.js'), 'utf8');
  const sensitive = 'SYNTHETIC_CONFIDENTIAL_VALUE';
  const record = {id:'A03132',createdBy:sensitive,customer:sensitive,phone:sensitive,
    rows:[{name:sensitive,w:sensitive}],createdAt:1790922181604};
  const stored = {fs_records:JSON.stringify([record]),fs_chats:JSON.stringify([{jobId:'A03132',messages:[{text:sensitive}]}]),
    fs_recbak:JSON.stringify({A03132:[{ts:1790922181604,by:sensitive,why:sensitive,data:record}]})};
  const output = [], reads = [];
  const context = {
    location:{hostname:'formula.beyond-workflow.com'},navigator:{onLine:true},
    document:{querySelector:()=>({textContent:'Formula Studio build 2026-09-23.1'})},
    records:[record],chats:[{jobId:'A03132',messages:[{text:sensitive}],approvals:{}}],
    activities:[{job:'A03132',cat:'job',action:'สร้างชุดข้อมูลใหม่',ts:1790922181604,detail:sensitive,user:sensitive}],
    recBak:{A03132:[{ts:1790922181604,data:record,by:sensitive,why:sensitive}]},
    recTouched:{A03132:1},sbSnap:{records:{A03132:JSON.stringify(record)}},
    currentUser:sensitive,currentRole:()=> 'sales',sbErr:sensitive,
    localStorage:{getItem:key=>{reads.push(key);return stored[key] || null;},setItem(){throw Error('storage write');},removeItem(){throw Error('storage delete');},clear(){throw Error('storage clear');}},
    sessionStorage:{getItem(){throw Error('credential access');}},
    fetch(){throw Error('network request');},XMLHttpRequest(){throw Error('network request');},
    saveRecordsStore(){throw Error('save');},sbManualSync(){throw Error('sync');},
    console:{log:value=>output.push(value)},
    ...overrides
  };
  vm.createContext(context); vm.runInContext(source,context);
  assert.equal(output.length,1);
  return {report:JSON.parse(output[0]),output:output[0],reads,context,sensitive};
}

test('target metadata and backup availability are reported without confidential fields',()=>{
  const result=run(); const target=result.report.targets[0];
  assert.equal(target.id,'A03132'); assert.equal(target.recordInMemory,true);
  assert.equal(target.recordInLocalStorage,true); assert.equal(target.backupStoredVersions,1);
  assert.equal(target.currentUserIsCreator,true); assert.equal(target.formulaRowCount,1);
  assert.equal(result.report.targets.length,2);
  assert.equal(result.output.includes(result.sensitive),false);
  for(const field of ['customer','brand','phone','rows','messages','detail','createdBy','access_token','password'])
    assert.equal(new RegExp('"'+field+'"\\s*:').test(result.output),false,field+' leaked');
});
test('inspection performs no writes, network calls or credential-store reads',()=>{
  const result=run(); assert.deepEqual(result.reads.sort(),['fs_chats','fs_recbak','fs_records']);
});
test('malformed storage yields a fixed error code rather than its contents',()=>{
  const result=run({localStorage:{getItem:()=>'{SYNTHETIC_CONFIDENTIAL_VALUE'}});
  assert.equal(result.report.storageStatus.records,'INVALID_JSON');
  assert.equal(result.output.includes(result.sensitive),false);
});
test('blocked storage access is distinct from malformed JSON and contains no error text',()=>{
  const result=run({localStorage:{getItem(){throw Error('SYNTHETIC_CONFIDENTIAL_VALUE');}}});
  assert.equal(result.report.storageStatus.records,'UNAVAILABLE');
  assert.equal(result.output.includes(result.sensitive),false);
});
test('cached snapshot equality is canonical and never labelled server confirmation',()=>{
  const result=run({sbSnap:{records:{A03132:JSON.stringify({createdAt:1790922181604,rows:[{w:'SYNTHETIC_CONFIDENTIAL_VALUE',name:'SYNTHETIC_CONFIDENTIAL_VALUE'}],phone:'SYNTHETIC_CONFIDENTIAL_VALUE',customer:'SYNTHETIC_CONFIDENTIAL_VALUE',createdBy:'SYNTHETIC_CONFIDENTIAL_VALUE',id:'A03132'})}}});
  assert.equal(result.report.targets[0].matchesCachedSnapshot,true);
  assert.equal(result.report.cachedSnapshotIsSaveProof,false);
});
test('storage-only record remains distinguishable from memory and backup-only candidates',()=>{
  const result=run({records:[],chats:[],recBak:{}});
  assert.equal(result.report.targets[0].recordInMemory,false);
  assert.equal(result.report.targets[0].recordInLocalStorage,true);
  assert.equal(result.report.targets[0].backupMemoryVersions,0);
  assert.equal(result.report.targets[0].backupStoredVersions,1);
});
test('running on another origin stops before reading any storage',()=>{
  const result=run({location:{hostname:'other.example.test'}});
  assert.equal(result.report.status,'WRONG_ORIGIN'); assert.deepEqual(result.reads,[]);
});
test('unrecognized role, action and error text never escape into the report',()=>{
  const result=run({currentRole:()=> 'SYNTHETIC_CONFIDENTIAL_VALUE',activities:[{job:'A03132',cat:'job',action:'SYNTHETIC_CONFIDENTIAL_VALUE',ts:1790922181604}]});
  assert.equal(result.report.role,'unknown'); assert.equal(result.report.syncErrorPresent,true);
  assert.equal(result.output.includes(result.sensitive),false);
});
