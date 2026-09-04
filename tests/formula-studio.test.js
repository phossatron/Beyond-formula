(function(){
  'use strict';

  const tests = [];
  function test(name, fn){ tests.push({name, fn}); }
  function assert(value, message){ if(!value) throw new Error(message); }
  function equal(actual, expected, message){
    if(actual !== expected) throw new Error((message || 'values differ') + ` (expected ${expected}, got ${actual})`);
  }
  function reset(){
    localStorage.clear();
    sessionStorage.clear();
    window.__fetchCalls.length = 0;
    window.__fetchQueue.length = 0;
    SB_URL = 'https://test-project.supabase.co';
    SB_KEY = 'sb_publishable_test_only';
    if(typeof authSession !== 'undefined') authSession = null;
    if(typeof authMembership !== 'undefined') authMembership = null;
    if(typeof authChecking !== 'undefined') authChecking = false;
    currentUser = '';
    impersonator = '';
    userList = [];
    if(typeof chatEventOutbox !== 'undefined') chatEventOutbox = [];
    if(typeof chatReadOutbox !== 'undefined') chatReadOutbox = [];
    if(typeof chatDeleteOutbox !== 'undefined') chatDeleteOutbox = [];
    sbReady = false;
    sbErr = '';
  }

  test('secure mode exposes the required Auth boundary', function(){
    ['authSignIn','authRestoreSession','authRefreshSession','authSignOut','authFetchMembership','authDataHeaders']
      .forEach(name=>assert(typeof window[name] === 'function', `${name} is missing`));
  });

  test('secure boot never reads protected data without a session', async function(){
    reset();
    await sbBoot();
    const restCalls = window.__fetchCalls.filter(call=>call.url.includes('/rest/v1/'));
    equal(restCalls.length, 0, 'unauthenticated boot reached the Data API');
    equal(currentUser, '', 'cached browser identity was trusted');
  });

  test('password sign-in uses Auth API and stores session only in sessionStorage', async function(){
    reset();
    window.__fetchQueue.push(window.__mockResponse(200, {
      access_token:'access-test', refresh_token:'refresh-test', expires_in:3600,
      user:{id:'11111111-1111-1111-1111-111111111111', email:'owner@example.test'}
    }));
    const session = await authSignIn('owner@example.test', 'correct horse');
    assert(session && session.access_token === 'access-test', 'sign-in did not return the session');
    const call = window.__fetchCalls[0];
    assert(call.url.endsWith('/auth/v1/token?grant_type=password'), 'wrong Auth password endpoint');
    equal(call.options.method, 'POST', 'password grant must use POST');
    equal(call.options.headers.apikey, SB_KEY, 'publishable key missing from Auth request');
    assert(sessionStorage.getItem('fs_auth_session'), 'session was not stored in sessionStorage');
    equal(localStorage.getItem('fs_auth_session'), null, 'session leaked into localStorage');
    equal(localStorage.getItem('fs_user'), null, 'legacy identity was persisted');
  });

  test('Data API headers separate publishable key and user bearer token', function(){
    reset();
    authSession = {access_token:'user-jwt-test'};
    const headers = authDataHeaders();
    equal(headers.apikey, SB_KEY, 'Data API apikey is wrong');
    equal(headers.Authorization, 'Bearer user-jwt-test', 'Data API bearer is not the user token');
    assert(!headers.Authorization.includes(SB_KEY), 'publishable key was used as authorization');
  });

  test('expired sessions refresh through Auth and remain session-only', async function(){
    reset();
    authSession = {access_token:'expired',refresh_token:'refresh-old',expires_at:1};
    sessionStorage.setItem('fs_auth_session', JSON.stringify(authSession));
    window.__fetchQueue.push(window.__mockResponse(200, {
      access_token:'access-new',refresh_token:'refresh-new',expires_in:3600,
      user:{id:'11111111-1111-1111-1111-111111111111',email:'owner@example.test'}
    }));
    const session = await authRefreshSession();
    equal(session.access_token, 'access-new', 'refresh did not replace the token');
    assert(window.__fetchCalls[0].url.endsWith('/auth/v1/token?grant_type=refresh_token'), 'wrong refresh endpoint');
    equal(localStorage.getItem('fs_auth_session'), null, 'refreshed session leaked into localStorage');
  });

  test('401 clears authorization instead of falling back to publishable bearer', async function(){
    reset();
    // ไม่มี refresh_token → ต่ออายุไม่ได้ ต้องล้าง session ทันที
    authSession = {access_token:'expired-token',expires_at:Date.now()/1000+3600};
    window.__fetchQueue.push(window.__mockResponse(401, {message:'jwt expired'}));
    let failed = false;
    try{ await sbReq('fs_records?select=id'); }catch(err){ failed = true; }
    assert(failed, 'unauthenticated request unexpectedly succeeded');
    equal(authSession, null, 'expired session was retained');
    equal(sessionStorage.getItem('fs_auth_session'), null, 'expired token remained in storage');
    // และต้องไม่มีทางส่ง publishable key เป็น Bearer แทนตัวตนผู้ใช้
    let threw = false;
    try{ authDataHeaders(); }catch(err){ threw = true; }
    assert(threw, 'header builder fell back to a session-less request');
  });

  test('403 is an authorization denial and must NOT destroy the session', async function(){
    // PostgREST ตอบ 403 ทุกครั้งที่ RLS/guard trigger ปฏิเสธ ซึ่งเป็นเรื่อง "สิทธิ์"
    // ไม่ใช่ "ตัวตน" · ถ้าล้าง session ตรงนี้ ผู้ใช้จะถูกเด้งออกหน้า login แล้ว delta
    // ที่ถูกปฏิเสธยังค้างอยู่ พอล็อกอินใหม่ก็ push ซ้ำแล้วเด้งอีก วนไม่จบ
    reset();
    authSession = {access_token:'valid-token',refresh_token:'refresh-test',expires_at:Date.now()/1000+3600};
    window.__fetchQueue.push(window.__mockResponse(403, {message:'record mutation exceeds role permission'}));
    let caught = null;
    try{ await sbReq('fs_records?select=id'); }catch(err){ caught = err; }
    assert(caught, 'forbidden request unexpectedly succeeded');
    assert(authSession && authSession.access_token === 'valid-token', 'authorization denial destroyed the session');
    equal(caught.sbStatus, 403, 'status was not reported to the caller');
    assert(caught.sbPermanent === true, 'a role denial was marked retryable');
    // ยังต้องใช้ token ของผู้ใช้เองเท่านั้น ไม่ถอยไปใช้ publishable key เป็น Bearer
    equal(authDataHeaders().Authorization, 'Bearer valid-token', 'fell back to a different bearer');
  });

  // ---- อาการ "ล็อกอินแล้วเด้งออก ใช้งานไม่ได้" ที่พบจาก /code-review ----

  function activeSession(role){
    authSession = {access_token:'valid-token',refresh_token:'refresh-test',expires_at:Date.now()/1000+3600,
      user:{id:'22222222-2222-2222-2222-222222222222',email:'user@example.test'}};
    authMembership = {name:'ผู้ใช้ทดสอบ',role:role,active:true};
    currentUser = 'ผู้ใช้ทดสอบ';
    sbReady = true;
  }

  test('role ที่เขียน fs_meta ไม่ได้ ต้องไม่ push reccounter (เดิมโดน 403 ตั้งแต่ sync แรก)', async function(){
    // schema ไม่ได้ seed fs_meta ค่าจากเซิร์ฟเวอร์จึงเป็น null ส่วน recCounter เริ่มที่ 0
    // เดิมเทียบด้วย !== ตรง ๆ จึง "ต่างกัน" เสมอ แล้วทุก sync จะยิง fs_meta
    for(const role of ['pd','ra','rd','purchasing']){
      reset();
      activeSession(role);
      records = []; chats = []; activities = []; recCounter = 0;
      sbSnap = {records:{},chats:{},users:{},acts:{},counter:null};
      const pushed = await sbPush();
      const metaCalls = window.__fetchCalls.filter(c=>c.url.includes('fs_meta'));
      equal(metaCalls.length, 0, role + ' ยังพยายามเขียน fs_meta');
      equal(pushed, false, role + ' คิดว่ามีอะไรต้อง push ทั้งที่ไม่มี');
    }
  });

  test('role ที่ไม่มีสิทธิ์เขียน record ต้องไม่ส่ง record ขึ้นเซิร์ฟเวอร์', async function(){
    for(const role of ['ra','rd','purchasing']){
      reset();
      activeSession(role);
      records = [{id:'A00001', customer:'ลูกค้าเก่าในเครื่อง'}];
      chats = []; activities = []; recCounter = 1;
      sbSnap = {records:{},chats:{},users:{},acts:{},counter:1};
      await sbPush();
      const recCalls = window.__fetchCalls.filter(c=>c.url.includes('fs_records') && c.options.method==='POST');
      equal(recCalls.length, 0, role + ' ส่ง record ที่เซิร์ฟเวอร์จะปฏิเสธแน่ ๆ');
      equal(records.length, 1, role + ' ทำ record ในเครื่องหาย');
    }
  });

  test('activity ที่ push แล้วต้องไม่ถูกส่งซ้ำ แม้ pull จะคืนรายการเปล่า', async function(){
    // fs_activities ให้ SELECT เฉพาะ admin · role อื่นได้ 200 [] กลับมา ถ้าจำว่า
    // "ส่งแล้ว" ไว้ใน snapshot ที่มาจากการ pull ร่องรอยจะหายทุกรอบแล้วส่งซ้ำตลอดไป
    reset();
    activeSession('sales');
    records = []; chats = []; recCounter = 0;
    activities = [{ts:1000, at:'x', user:'ผู้ใช้ทดสอบ', role:'sales', cat:'auth', action:'เข้าใช้งาน', detail:'', job:'', via:''}];
    sbSnap = {records:{},chats:{},users:{},acts:{},counter:0};
    window.__fetchQueue.push(window.__mockResponse(200, null));
    equal(await sbPush(), true, 'รอบแรกควรมี activity ให้ส่ง');

    // จำลองการ pull ที่คืน acts เปล่า (RLS ปฏิเสธแบบเงียบ)
    sbSnap = {records:{},chats:{},users:{},acts:{},counter:0};
    equal(await sbPush(), false, 'ส่ง activity ซ้ำอีกรอบ (loop ทุก 5 วินาที)');
  });

  test('การล็อกอินของ non-admin ต้องไม่ล้าง activity ในเครื่อง', async function(){
    reset();
    activities = [{ts:1, at:'x', user:'ใครสักคน', role:'sales', cat:'job', action:'สร้างงาน', detail:'', job:'A00001', via:''}];
    saveActivities();
    authSession = {access_token:'t', refresh_token:'r', expires_at:Date.now()/1000+3600,
      user:{id:'33333333-3333-3333-3333-333333333333', email:'sales@example.test'}};
    window.__fetchQueue.push(window.__mockResponse(200, [
      {user_id:'33333333-3333-3333-3333-333333333333', name:'เซลส์ทดสอบ', role:'sales', active:true}
    ]));
    await authFetchMembership();
    equal(activities.length, 1, 'activity ในเครื่องถูกล้างทิ้งตอนล็อกอิน');
    assert(localStorage.getItem('fs_activities'), 'fs_activities ถูกลบออกจาก localStorage');
  });

  test('บัญชีที่ยังไม่มีสิทธิ์ ต้องบอกสาเหตุให้ต่างจากรหัสผ่านผิดและเน็ตล่ม', async function(){
    reset();
    authSession = {access_token:'t', refresh_token:'r', expires_at:Date.now()/1000+3600,
      user:{id:'44444444-4444-4444-4444-444444444444', email:'new@example.test'}};
    window.__fetchQueue.push(window.__mockResponse(200, []));
    let caught = null;
    try{ await authFetchMembership(); }catch(err){ caught = err; }
    assert(caught, 'ล็อกอินสำเร็จทั้งที่ไม่มี membership');
    const friendly = authFriendlyError(caught);
    assert(friendly.includes('fs_memberships'), 'ข้อความไม่ได้บอกว่าต้องเพิ่ม membership: ' + friendly);
    assert(!friendly.includes('อินเทอร์เน็ต'), 'ยังโทษอินเทอร์เน็ตอยู่');
  });

  test('chat event ที่ถูกปฏิเสธถาวร ต้องไม่ทำให้ทั้ง sbPush ค้าง', async function(){
    reset();
    activeSession('sales');
    records = []; chats = []; activities = []; recCounter = 0;
    sbSnap = {records:{},chats:{},users:{},acts:{},counter:0};
    chatEventOutbox = [{eventId:'ev-1', jobId:'A00001', payload:{type:'message', text:'ยาวเกิน'}}];
    // RPC ปฏิเสธถาวร แล้วตามด้วย 200 ของ upsert อื่น ๆ
    window.__fetchQueue.push(window.__mockResponse(400, {message:'chat message must be 1 to 10000 characters'}));
    let threw = false;
    try{ await sbPushChatEvents(); }catch(err){ threw = true; }
    assert(!threw, 'ข้อความเดียวที่ถูกปฏิเสธทำให้ทั้ง sbPush หยุด');
    equal(chatEventOutbox.length, 0, 'รายการที่ปฏิเสธถาวรยังค้างใน outbox');
    assert(chatDeadLetter.length === 1, 'ไม่ได้เก็บรายการที่ถูกปฏิเสธไว้ตรวจ');
  });

  test('ข้อความระบบที่ยาวเกินถูกตัดก่อนเข้า outbox', function(){
    reset();
    activeSession('sales');
    const c = {jobId:'A00001', messages:[], parts:[], approvals:{}};
    pushSys(c, 'x'.repeat(9000), {action:'job_edit', skipQueue:true});
    assert(c.messages[0].text.length <= 5000, 'ข้อความระบบยาวเกินขีดจำกัดของเซิร์ฟเวอร์');
  });

  test('local-only mode works without Auth or network', async function(){
    reset();
    SB_URL = '';
    SB_KEY = '';
    localStorage.setItem('fs_records', JSON.stringify([{id:'local-1',customer:'Synthetic'}]));
    loadRecords();
    await sbBoot();
    equal(records.length, 1, 'local record was not loaded');
    equal(window.__fetchCalls.length, 0, 'local-only mode used the network');
  });

  test('secure mode never offers first-Admin browser creation', function(){
    reset();
    authChecking = false;
    renderLoginView();
    const body = document.getElementById('loginBody').textContent;
    assert(!body.includes('สร้างผู้ใช้ Admin คนแรก'), 'secure login offered browser Admin creation');
    assert(body.includes('อีเมล'), 'secure login did not request Auth email');
  });

  test('secure user management is Dashboard-owned and has no local reset controls', function(){
    reset();
    authSession = {access_token:'admin-token'};
    authMembership = {name:'Admin Owner',role:'admin',active:true};
    currentUser = 'Admin Owner';
    userList = [{name:'Admin Owner',role:'admin',email:'admin@example.test',pass:null}];
    renderUserList();
    const html = document.getElementById('userListWrap').innerHTML;
    assert(html.includes('Supabase Dashboard'), 'Dashboard ownership guidance is missing');
    assert(!/resetUserPassword|resetAllPasswords|seedTeamUsers|loginUserAt/.test(html), 'legacy account control remains active');
  });

  test('secure reconciliation preserves offline changes and merges remote additions', function(){
    reset();
    authSession = {access_token:'member-token'};
    authMembership = {name:'Sales One',role:'sales',active:true};
    currentUser = 'Sales One';
    const baseline = {id:'A00001',customer:'Before',createdBy:'Sales One'};
    const changed = {id:'A00001',customer:'Offline edit',createdBy:'Sales One'};
    records = [changed,{id:'A00003',customer:'Offline new',createdBy:'Sales One'}];
    chats=[]; userList=[]; activities=[]; recCounter=3;
    sbSnap = {records:{A00001:JSON.stringify(baseline)},chats:{},users:{},acts:{},counter:1};
    sbApply({
      records:[baseline,{id:'A00002',customer:'Remote new',createdBy:'Sales Two'}],
      chats:[],users:[],acts:[],counter:2,empty:false
    });
    equal(records.find(r=>r.id==='A00001').customer, 'Offline edit', 'offline edit was overwritten');
    assert(records.some(r=>r.id==='A00002'), 'remote addition was not merged');
    assert(records.some(r=>r.id==='A00003'), 'offline addition was lost');
    equal(recCounter, 3, 'record counter moved backward');
  });

  test('secure Chat event outbox flushes through the RPC and clears only after success', async function(){
    reset();
    authSession = {access_token:'member-token'};
    authMembership = {name:'Sales One',role:'sales',active:true};
    currentUser = 'Sales One';
    window.__fetchQueue.push(window.__mockResponse(200, {
      version:1,type:'message',actor:'Sales One',ts:1,text:'hello',event_id:'evt-1'
    }));
    queueChatEvent('A00001', {type:'message',text:'hello'}, 'evt-1');
    equal(chatEventOutbox.length, 1, 'Chat event was not queued');
    await sbPushChatEvents();
    const call = window.__fetchCalls[0];
    assert(call.url.endsWith('/rest/v1/rpc/fs_append_chat_event'), 'Chat did not use append RPC');
    const body = JSON.parse(call.options.body);
    equal(body.p_event_id, 'evt-1', 'event id was not sent');
    equal(body.p_job_id, 'A00001', 'job id was not sent');
    equal(body.p_payload.text, 'hello', 'message text was changed');
    equal(chatEventOutbox.length, 0, 'successful Chat event remained queued');
  });

  test('secure Chat sync never direct-upserts the legacy fs_chats row', async function(){
    reset();
    authSession = {access_token:'member-token'};
    authMembership = {name:'Sales One',role:'sales',active:true};
    currentUser = 'Sales One';
    records=[]; userList=[]; activities=[]; recCounter=0; chats=[{jobId:'A00001',messages:[{type:'msg',user:'Sales One',text:'local',ts:2}],parts:[],approvals:{}}];
    sbSnap = {records:{},chats:{A00001:JSON.stringify({jobId:'A00001',messages:[]})},users:{},acts:{},counter:0};
    const pushed = await sbPush();
    equal(pushed, false, 'legacy Chat row was treated as a direct sync change');
    assert(!window.__fetchCalls.some(call=>call.url.includes('/fs_chats')), 'secure mode used direct fs_chats REST write');
  });

  test('formula edits invalidate all existing Chat approvals locally', function(){
    reset();
    SB_URL=''; SB_KEY='';
    currentUser='PD One';
    userList=[{name:'PD One',role:'pd'}];
    const record={id:'A00001',rows:[]};
    records=[record];
    chats=[{jobId:'A00001',messages:[],parts:[],approvals:{pd:{by:'PD One'},ra:{by:'RA One'},rd:{by:'RD One'},sales:{by:'Sales One'}}}];
    invalidateChatApprovals(getChat('A00001'));
    assert(CHAT_PARTS.every(part=>!getChat('A00001').approvals[part.key]), 'formula edit retained an old approval');
  });

  test('displayed sync errors redact tokens and credentials', function(){
    reset();
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature-test';
    const clean = safeError(`Bearer ${jwt} refresh_token=refresh-secret sb_publishable_leak`);
    assert(!clean.includes(jwt), 'JWT leaked into displayed error');
    assert(!clean.includes('refresh-secret'), 'refresh token leaked into displayed error');
    assert(!clean.includes('sb_publishable_leak'), 'publishable key leaked into displayed error');
  });

  test('membership role remains authoritative over legacy user JSON', function(){
    reset();
    authMembership = {name:'Sales One',role:'sales',active:true};
    currentUser = 'Sales One';
    userList = [{name:'Sales One',role:'admin',email:'sales@example.test',pass:null}];
    equal(currentRole(), 'sales', 'legacy JSON escalated the authenticated membership role');
  });

  test('user-entered tags and ingredient rows cannot inject HTML', function(){
    reset();
    SB_URL=''; SB_KEY='';
    const tagInput=document.getElementById('ti_claims');
    tagInput.value='<img src=x onerror="window.__xss=1">';
    addTag({key:'Enter',preventDefault:function(){}},'tc_claims','ti_claims');
    assert(!document.querySelector('#tc_claims img'), 'tag input created executable HTML');
    document.getElementById('ingBody').innerHTML='';
    const payload='"><img src=x onerror="window.__xss=2">';
    addRow({name:payload,w:1,o:payload,p:100,note:payload});
    assert(!document.querySelector('#ingBody img'), 'ingredient input created executable HTML');
    equal(document.querySelector('#ingBody input').value,payload,'ingredient value was not preserved as text');
  });

  test('stored record rendering escapes user-controlled dashboard fields', function(){
    reset();
    SB_URL=''; SB_KEY='';
    const payload='<img src=x onerror="window.__xss=3">';
    renderDashboard({
      id:'A00001',createdBy:payload,date:payload,metaDate:payload,
      brand:payload,customer:payload,form:payload,size:'1',sizeUnit:payload,uw:'1',uwUnit:payload,
      conceptStr:payload,allConcepts:[payload],allBenefits:[payload],allSP:[payload],
      finalTarget:payload,gender:payload,price:payload,notes:payload,cons:[payload],
      rows:[{num:1,name:payload,w:1,o:payload,p:100,actual:1,note:payload,hero:true,
        fda:{cls:'fda-unknown',icon:'⚪',tip:payload,status:'unknown'}}]
    });
    assert(!document.querySelector('#dashContent img'), 'stored record created executable dashboard HTML');
    assert(document.getElementById('d_title').textContent.includes('<img'), 'stored text was not preserved');
  });

  async function run(){
    const results = [];
    for(const item of tests){
      try{
        await item.fn();
        results.push({name:item.name, status:'PASS'});
      }catch(error){
        results.push({name:item.name, status:'FAIL', error:String(error && error.message || error)});
      }
    }
    const failed = results.filter(result=>result.status === 'FAIL');
    document.documentElement.dataset.testStatus = failed.length ? 'failed' : 'passed';
    const pre = document.createElement('pre');
    pre.id = 'fs-test-results';
    pre.textContent = JSON.stringify({passed:results.length-failed.length,failed:failed.length,results}, null, 2);
    document.body.appendChild(pre);
  }

  setTimeout(run, 50);
})();
