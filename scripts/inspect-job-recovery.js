// Run as a DevTools Snippet on the original Formula browser/profile.
// Read-only: no network, saves, storage writes, credentials or business-content output.
(function(){
  'use strict';
  if(location.hostname !== 'formula.beyond-workflow.com'){
    console.log(JSON.stringify({version:1,status:'WRONG_ORIGIN'}));
    return;
  }
  const targets=['A03132','A03430'];
  function readStore(key, array){
    let raw;
    try{ raw=localStorage.getItem(key); }
    catch(e){ return {status:'UNAVAILABLE',value:array?[]:{}}; }
    try{
      if(raw===null) return {status:'ABSENT',value:array?[]:{}};
      const value=JSON.parse(raw);
      const valid=array?Array.isArray(value):value&&typeof value==='object'&&!Array.isArray(value);
      return valid?{status:'OK',value}:{status:'INVALID_SHAPE',value:array?[]:{}};
    }catch(e){ return {status:'INVALID_JSON',value:array?[]:{}}; }
  }
  function ts(value){ return typeof value==='number'&&Number.isFinite(value)&&value>0?value:null; }
  function canonical(value){
    if(Array.isArray(value)) return value.map(canonical);
    if(value&&typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
    return value;
  }
  function snapshotMatches(record, snapshot){
    if(!record||typeof snapshot!=='string') return null;
    try{ return JSON.stringify(canonical(record))===JSON.stringify(canonical(JSON.parse(snapshot))); }
    catch(e){ return null; }
  }
  const storedRecords=readStore('fs_records',true),storedChats=readStore('fs_chats',true),storedBackup=readStore('fs_recbak',false);
  const memoryRecords=typeof records!=='undefined'&&Array.isArray(records)?records:[];
  const memoryChats=typeof chats!=='undefined'&&Array.isArray(chats)?chats:[];
  const logs=typeof activities!=='undefined'&&Array.isArray(activities)?activities:[];
  const backups=typeof recBak!=='undefined'&&recBak&&typeof recBak==='object'?recBak:{};
  const snapshots=typeof sbSnap!=='undefined'&&sbSnap&&sbSnap.records?sbSnap.records:{};
  let role='unknown';
  try{
    const candidate=typeof currentRole==='function'?currentRole():null;
    if(['admin','sales','opc','mkt','pd','ra','rd','oversea'].includes(candidate)) role=candidate;
  }catch(e){}
  const header=document.querySelector('.hdr-sub');
  const build=header&&String(header.textContent||'').match(/[0-9]{4}-[0-9]{2}-[0-9]{2}[.][0-9]+/);
  const report={
    version:1,status:'READ_ONLY_METADATA',capturedAt:new Date().toISOString(),
    origin:'https://formula.beyond-workflow.com',build:build?build[0]:null,role,
    online:typeof navigator!=='undefined'?!!navigator.onLine:null,
    syncErrorPresent:typeof sbErr!=='undefined'?!!sbErr:null,
    cachedSnapshotIsSaveProof:false,
    storageStatus:{records:storedRecords.status,chats:storedChats.status,backups:storedBackup.status},
    targets:targets.map(id=>{
      const memory=memoryRecords.find(r=>r&&r.id===id),stored=storedRecords.value.find(r=>r&&r.id===id);
      const record=memory||stored,chat=memoryChats.find(c=>c&&c.jobId===id);
      const memoryBackups=Array.isArray(backups[id])?backups[id]:[];
      const savedBackups=Array.isArray(storedBackup.value[id])?storedBackup.value[id]:[];
      const events=logs.filter(e=>e&&(e.job===id||e.jobId===id));
      return {
        id,recordInMemory:!!memory,recordInLocalStorage:!!stored,
        chatInMemory:!!chat,chatInLocalStorage:storedChats.value.some(c=>c&&c.jobId===id),
        recordCreatedAt:record?ts(record.createdAt):null,recordUpdatedAt:record?ts(record.updatedAt):null,
        currentUserIsCreator:!!record&&typeof currentUser!=='undefined'&&record.createdBy===currentUser,
        recordHasCreator:!!(record&&typeof record.createdBy==='string'&&record.createdBy.trim()),
        recordHasCustomerOrBrand:!!(record&&((typeof record.customer==='string'&&record.customer.trim())||(typeof record.brand==='string'&&record.brand.trim()))),
        formulaRowsIsArray:!!record&&Array.isArray(record.rows),
        formulaRowCount:record&&Array.isArray(record.rows)?record.rows.length:null,
        closed:!!(record&&record.closed),chatMessageCount:chat&&Array.isArray(chat.messages)?chat.messages.length:null,
        snapshotHasRecord:Object.prototype.hasOwnProperty.call(snapshots,id),
        matchesCachedSnapshot:snapshotMatches(memory,snapshots[id]),
        locallyTouched:typeof recTouched!=='undefined'&&recTouched?!!recTouched[id]:null,
        backupMemoryVersions:memoryBackups.length,backupStoredVersions:savedBackups.length,
        backupCandidates:savedBackups.filter(v=>v&&v.data&&v.data.id===id).map(v=>({
          savedAt:ts(v.ts),recordCreatedAt:ts(v.data.createdAt),
          hasCreator:!!(typeof v.data.createdBy==='string'&&v.data.createdBy.trim()),
          hasCustomerOrBrand:!!((typeof v.data.customer==='string'&&v.data.customer.trim())||(typeof v.data.brand==='string'&&v.data.brand.trim())),
          rowsIsArray:Array.isArray(v.data.rows),rowCount:Array.isArray(v.data.rows)?v.data.rows.length:null
        })),
        jobCreationTimes:events.filter(e=>e.cat==='job'&&e.action==='สร้างชุดข้อมูลใหม่').map(e=>ts(e.ts)).filter(Boolean),
        chatCreationTimes:events.filter(e=>e.cat==='chat'&&e.action==='สร้างห้องแชท').map(e=>ts(e.ts)).filter(Boolean),
        jobDeletionTimes:events.filter(e=>e.cat==='job'&&/ลบ.*งาน/.test(e.action||'')).map(e=>ts(e.ts)).filter(Boolean)
      };
    })
  };
  console.log(JSON.stringify(report,null,2));
})();
