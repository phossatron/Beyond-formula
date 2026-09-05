(function(){
  'use strict';

  const tests = [];
  function test(name, fn){ tests.push({name, fn}); }
  function assert(value, message){ if(!value) throw new Error(message); }
  function equal(actual, expected, message){
    if(actual !== expected) throw new Error((message || 'values differ') + ` (expected ${expected}, got ${actual})`);
  }
  function reset(){
    if(typeof teardownPrivateWorkspace === 'function') teardownPrivateWorkspace();
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

  // ---- Private workspace loader (ของเสริมล้วน ไม่แตะของเดิม) ----
  //
  // ข้อบังคับจากเจ้าของ: "ทำเสริมปุ่มหน้าใหม่ไม่แตะของเดิมนะ เข้าผ่าน user และ role
  // ที่กำหนดเท่านั้น" · เทสต์ชุดนี้พิสูจน์ทั้งสองครึ่ง — ครึ่งที่เพิ่มเข้ามา และครึ่งที่
  // ต้องไม่เปลี่ยนเลยเมื่อไม่มีสิทธิ์หรือไม่ได้ตั้งค่า

  function domFingerprint(){
    return document.documentElement.outerHTML;
  }

  function workspaceSession(){
    authSession = {access_token:'ws-token', refresh_token:'r', expires_at:Date.now()/1000+3600,
      user:{id:'55555555-5555-5555-5555-555555555555', email:'rd@example.test'}};
    authMembership = {user_id:authSession.user.id, name:'อาร์แอนด์ดี', role:'rd', active:true};
    currentUser = 'อาร์แอนด์ดี';
  }

  test('index.html ไม่มีคำว่า RD Science หรือเนื้อหา Science แบบ static เลย', function(){
    reset();
    // คนที่เปิด view-source โดยไม่มีสิทธิ์ ต้องไม่เห็นแม้แต่ร่องรอยว่ามีระบบนี้อยู่
    // นับเฉพาะเนื้อของ index.html จริง ๆ · ตัวเทสต์กับ mock ของ harness ถูกฉีดเข้ามา
    // ในหน้าเดียวกัน และมีคำเหล่านี้อยู่ในชื่อเทสต์ ซึ่งไม่ได้ถูกส่งขึ้น deployment
    const shipped = document.documentElement.cloneNode(true);
    shipped.querySelectorAll('#fs-test-suite,#fs-test-prelude,#fs-test-results').forEach(function(node){ node.remove(); });
    const source = shipped.outerHTML;
    assert(!/RD Science/i.test(source), 'index.html มีป้าย RD Science ฝังอยู่');
    assert(!/science[_-]?case|scienceWorkspace|escalation/i.test(source.replace(/SCIENCE_WORKSPACE_API_ORIGIN/g,'')),
      'index.html มีคำเฉพาะของงาน Science ฝังอยู่');
  });

  test('ไม่ได้ตั้งค่า origin = ไม่ส่ง request และไม่แตะ DOM เลย', async function(){
    reset();
    workspaceSession();
    SCIENCE_WORKSPACE_API_ORIGIN = '';
    const before = domFingerprint();

    await mountPrivateWorkspace();

    equal(window.__fetchCalls.length, 0, 'ยิง request ทั้งที่ยังไม่ได้ตั้งค่า');
    equal(domFingerprint(), before, 'DOM ของเดิมเปลี่ยนไป');
    equal(document.getElementById('pwsNav'), null, 'สร้างปุ่มทั้งที่ปิดอยู่');
    equal(document.getElementById('pwsPanel'), null, 'สร้าง panel ทั้งที่ปิดอยู่');
  });

  test('local-only mode ไม่ส่ง manifest request', async function(){
    reset();
    SB_URL = ''; SB_KEY = '';
    SCIENCE_WORKSPACE_API_ORIGIN = 'https://opc.example.test';
    authSession = null;
    await mountPrivateWorkspace();
    equal(window.__fetchCalls.length, 0, 'local-only mode ยังยิง request');
  });

  test('origin ที่ไม่ใช่ HTTPS หรือไม่ใช่ origin เปล่า ๆ ถูกปฏิเสธก่อนยิง request', async function(){
    for(const bad of ['http://opc.example.test','https://opc.example.test/path','https://*.example.test',
                      'https://user:pw@opc.example.test','opc.example.test','javascript:alert(1)']){
      reset();
      workspaceSession();
      SCIENCE_WORKSPACE_API_ORIGIN = bad;
      await mountPrivateWorkspace();
      equal(window.__fetchCalls.length, 0, 'ยอมรับ origin ที่ไม่ปลอดภัย: ' + bad);
      equal(document.getElementById('pwsNav'), null, 'สร้างปุ่มจาก origin ที่ไม่ปลอดภัย: ' + bad);
    }
  });

  test('ผู้ไม่มีสิทธิ์ไม่เห็นปุ่ม ไม่เห็น panel และไม่มีอะไรเหลือในเครื่อง', async function(){
    reset();
    workspaceSession();
    SCIENCE_WORKSPACE_API_ORIGIN = 'https://opc.example.test';
    const before = domFingerprint();
    // เซิร์ฟเวอร์ตอบ 404 เปล่า ๆ เหมือนไม่มีอะไรอยู่ตรงนั้นเลย
    window.__fetchQueue.push(window.__mockResponse(404, {error:'NOT_FOUND'}));

    await mountPrivateWorkspace();

    equal(document.getElementById('pwsNav'), null, 'ผู้ไม่มีสิทธิ์ได้ปุ่ม');
    equal(document.getElementById('pwsPanel'), null, 'ผู้ไม่มีสิทธิ์ได้ panel');
    equal(domFingerprint(), before, 'DOM ของเดิมเปลี่ยนไปสำหรับผู้ไม่มีสิทธิ์');
    equal(window.__fetchCalls.length, 1, 'ควรถาม manifest ครั้งเดียวแล้วหยุด');
    // ห้ามดึง bundle ต่อ
    assert(!window.__fetchCalls.some(c=>c.url.includes('/bundle')), 'ผู้ไม่มีสิทธิ์ยังไปดึง bundle');
    // ห้ามทิ้งร่องรอยใน localStorage
    assert(!Object.keys(localStorage).some(k=>/pws|science|workspace/i.test(k)), 'มี key ค้างใน localStorage');
  });

  function deferred(){
    let resolve;
    const promise = new Promise(r=>{ resolve=r; });
    return {promise, resolve};
  }
  function allowWorkspace(mode='workspace'){
    return window.__mockResponse(200, {allowed:true,label:'Private test',
      bundleUrl:'/bundle',version:'1',mode});
  }
  function prepareWorkspace(){
    reset(); workspaceSession(); SCIENCE_WORKSPACE_API_ORIGIN='https://opc.example.test';
  }

  test('denied roles, inactive and missing membership make zero requests and preserve exact DOM', async function(){
    for(const role of ['sales','opc','crm','monitor','pd','mkt','marketing','purchasing','unknown','toString','']){
      prepareWorkspace(); authMembership.role=role;
      const before=domFingerprint();
      await mountPrivateWorkspace();
      equal(window.__fetchCalls.length,0,'request for denied role '+role);
      equal(domFingerprint(),before,'DOM changed for '+role);
    }
    for(const membership of [null,{role:'rd',active:false},{role:'rd',active:true},
      {role:'rd',active:true,user_id:'different-user'}]){
      prepareWorkspace(); authMembership=membership;
      const before=domFingerprint();
      await mountPrivateWorkspace();
      equal(window.__fetchCalls.length,0,'request without active membership');
      equal(domFingerprint(),before,'DOM changed without active membership');
    }
  });

  test('logout during manifest response, manifest body or bundle body cannot recreate workspace', async function(){
    for(const stage of ['response','manifest','bundle']){
      prepareWorkspace(); const before=domFingerprint();
      const entered=deferred(), release=deferred();
      if(stage==='response') window.__fetchQueue.push(()=>{entered.resolve(); return release.promise;});
      else if(stage==='manifest') window.__fetchQueue.push({ok:true,json:()=>{entered.resolve();return release.promise;}});
      else {
        window.__fetchQueue.push(allowWorkspace());
        window.__fetchQueue.push({ok:true,text:()=>{entered.resolve();return release.promise;}});
      }
      const pending=mountPrivateWorkspace(); await entered.promise;
      authClearSession();
      release.resolve(stage==='response'?allowWorkspace():stage==='manifest'?
        {allowed:true,label:'Private test',bundleUrl:'/bundle',version:'1',mode:'workspace'}:
        'export function mount(host){host.textContent="late";}');
      await pending;
      equal(pwsState,null,'late state at '+stage);
      equal(domFingerprint(),before,'late DOM at '+stage);
      equal(window.__fetchCalls.length,stage==='bundle'?2:1,'extra request after logout');
      assert(window.__fetchCalls[0].options.signal.aborted,'request was not aborted');
    }
  });

  test('logout while async mount is pending destroys the late handle and listener', async function(){
    prepareWorkspace(); const before=domFingerprint();
    window.__lateMountEntered=deferred(); window.__lateMountRelease=deferred();
    window.__lateHandleDestroyed=0; window.__lateEventCount=0;
    window.__fetchQueue.push(allowWorkspace());
    window.__fetchQueue.push(window.__mockResponse(200, `export async function mount(host){
      const listener=()=>window.__lateEventCount++;
      window.addEventListener('private-test-event',listener);
      window.__lateMountEntered.resolve(); await window.__lateMountRelease.promise;
      return {destroy(){window.__lateHandleDestroyed++;window.removeEventListener('private-test-event',listener);}};
    }`));
    const pending=mountPrivateWorkspace(); await window.__lateMountEntered.promise;
    authClearSession(); window.__lateMountRelease.resolve(); await pending;
    window.dispatchEvent(new Event('private-test-event'));
    equal(window.__lateHandleDestroyed,1,'late handle not destroyed once');
    equal(window.__lateEventCount,0,'late listener retained');
    equal(pwsState,null,'late handle retained'); equal(domFingerprint(),before,'late DOM retained');
  });

  test('logout during module import cannot call mount or attach its handle', async function(){
    prepareWorkspace();const before=domFingerprint();
    window.__importEntered=deferred();window.__importRelease=deferred();window.__importMounts=0;
    window.__fetchQueue.push(allowWorkspace());
    window.__fetchQueue.push(window.__mockResponse(200, `
      window.__importEntered.resolve();await window.__importRelease.promise;
      export function mount(){window.__importMounts++;return {destroy(){}};}
    `));
    const pending=mountPrivateWorkspace();await window.__importEntered.promise;
    authClearSession();window.__importRelease.resolve();await pending;
    equal(window.__importMounts,0,'stale module called mount');
    equal(pwsState,null,'stale import retained state');equal(domFingerprint(),before,'stale import changed DOM');
  });

  test('mounted workspace is replaced on token or identity change despite equal version and mode', async function(){
    for(const change of [()=>authSession.access_token='next-token',()=>{authSession.user.id='next-user';authMembership.user_id='next-user';}]){
      prepareWorkspace();window.__replacedDestroyed=0;
      window.__fetchQueue.push(allowWorkspace());
      window.__fetchQueue.push(window.__mockResponse(200,'export function mount(){return {destroy(){window.__replacedDestroyed++;}};}'));
      await mountPrivateWorkspace();const old=pwsState;change();
      window.__fetchQueue.push(allowWorkspace());
      window.__fetchQueue.push(window.__mockResponse(200,'export function mount(host){host.textContent="new context";}'));
      await mountPrivateWorkspace();
      assert(pwsState!==old,'stale same-version state reused');
      equal(window.__replacedDestroyed,1,'old handle not removed');
      equal(pwsState.panelEl.textContent,'new context','new identity not rendered');
    }
  });

  test('session storage update immediately withdraws the mounted workspace', async function(){
    prepareWorkspace();window.__fetchQueue.push(allowWorkspace());
    window.__fetchQueue.push(window.__mockResponse(200,'export function mount(){return {destroy(){}};}'));
    await mountPrivateWorkspace();assert(pwsState,'setup failed');
    authStoreSession({...authSession,access_token:'refreshed-token'});
    equal(pwsState,null,'token update retained workspace');
    equal(document.getElementById('pwsPanel'),null,'token update retained panel');
    clearTimeout(authRefreshTimer);
  });

  test('older denied response cannot tear down a newer identity workspace', async function(){
    prepareWorkspace(); const entered=deferred(),release=deferred();
    window.__fetchQueue.push(()=>{entered.resolve();return release.promise;});
    const old=mountPrivateWorkspace(); await entered.promise;
    authSession={...authSession,access_token:'new-token',user:{...authSession.user,id:'66666666-6666-6666-6666-666666666666'}};
    authMembership={...authMembership,user_id:authSession.user.id};
    window.__fetchQueue.push(allowWorkspace());
    window.__fetchQueue.push(window.__mockResponse(200,'export function mount(host){host.textContent="new identity";}'));
    await mountPrivateWorkspace();
    const state=pwsState; assert(state,'new identity did not mount');
    release.resolve(window.__mockResponse(403,{})); await old;
    equal(pwsState,state,'older denial tore down newer state');
    equal(state.panelEl.textContent,'new identity','wrong identity rendered');
  });

  test('older network rejection cannot remove a newer workspace', async function(){
    prepareWorkspace();const entered=deferred();let rejectOld;
    window.__fetchQueue.push(()=>{entered.resolve();return new Promise((resolve,reject)=>{rejectOld=reject;});});
    const old=mountPrivateWorkspace();await entered.promise;
    authSession.access_token='new-token';
    window.__fetchQueue.push(allowWorkspace());
    window.__fetchQueue.push(window.__mockResponse(200,'export function mount(host){host.textContent="current";}'));
    await mountPrivateWorkspace();const state=pwsState;
    rejectOld(new Error('synthetic old failure'));await old;
    equal(pwsState,state,'old catch removed new workspace');
    equal(state.panelEl.textContent,'current','new workspace changed');
  });

  test('eligible roles still require server permission before fetching a bundle', async function(){
    for(const role of ['rd','ra','admin']){
      prepareWorkspace();authMembership.role=role;const before=domFingerprint();
      window.__fetchQueue.push(window.__mockResponse(403,{}));await mountPrivateWorkspace();
      equal(window.__fetchCalls.length,1,'did not stop after server denial for '+role);
      equal(domFingerprint(),before,'server denied role changed DOM');
    }
  });

  test('token, identity, membership, origin and local-mode changes fence pending bundle results', async function(){
    for(const change of [()=>authSession.access_token='replacement',()=>authSession.user.id='replacement',
      ()=>authMembership.role='ra',()=>authMembership.active=false,()=>{SB_URL='';SB_KEY='';},
      ()=>SCIENCE_WORKSPACE_API_ORIGIN='https://other.example.test']){
      prepareWorkspace(); const entered=deferred(),release=deferred();
      window.__fetchQueue.push(allowWorkspace());
      window.__fetchQueue.push({ok:true,text:()=>{entered.resolve();return release.promise;}});
      const pending=mountPrivateWorkspace();await entered.promise;change();
      release.resolve('export function mount(host){host.textContent="stale";}');await pending;
      equal(pwsState,null,'changed context retained stale state');
      equal(document.getElementById('pwsPanel'),null,'changed context created panel');
    }
  });

  test('mode change replaces the old handle even when version stays the same', async function(){
    prepareWorkspace();window.__oldModeDestroyed=0;
    window.__fetchQueue.push(allowWorkspace('first'));
    window.__fetchQueue.push(window.__mockResponse(200,'export function mount(){return {destroy(){window.__oldModeDestroyed++;}};}'));
    await mountPrivateWorkspace();const old=pwsState;
    window.__fetchQueue.push(allowWorkspace('second'));
    window.__fetchQueue.push(window.__mockResponse(200,'export function mount(host,{mode}){host.textContent=mode;}'));
    await mountPrivateWorkspace();
    assert(pwsState!==old,'old mode reused');equal(window.__oldModeDestroyed,1,'old mode not destroyed');
    equal(pwsState.panelEl.textContent,'second','wrong mode');
  });

  test('bundle request transport confines origin, captures auth, and expires with its workspace', async function(){
    prepareWorkspace();window.__privateRequest=null;
    window.__fetchQueue.push(allowWorkspace());
    window.__fetchQueue.push(window.__mockResponse(200,'export function mount(host,options){window.__privateRequest=options.request;return {destroy(){}};}'));
    await mountPrivateWorkspace();assert(typeof window.__privateRequest==='function','missing transport');
    const request=window.__privateRequest;
    window.__fetchQueue.push(window.__mockResponse(200,{value:'ok'}));
    const result=await request('/api/private-workspaces/test',{method:'POST',body:{question:'synthetic'}});
    equal(result.value,'ok','response missing');
    const call=window.__fetchCalls[2];
    equal(call.options.headers.Authorization,'Bearer ws-token','wrong bearer');
    equal(call.options.credentials,'omit','credentials attached');
    equal(call.options.cache,'no-store','cache allowed');
    equal(call.options.redirect,'error','redirect allowed');
    equal(JSON.parse(call.options.body).question,'synthetic','body changed');
    for(const path of ['https://evil.test/x','//evil.test/x','/api/other','/api/private-workspaces/../../other']){
      let denied=false;try{await request(path);}catch(err){denied=true;}
      assert(denied,'unsafe path accepted');
    }
    equal(window.__fetchCalls.length,3,'unsafe path requested');
    authClearSession();let denied=false;try{await request('/api/private-workspaces/test');}catch(err){denied=true;}
    assert(denied,'stale transport accepted');equal(window.__fetchCalls.length,3,'stale transport requested');
  });

  test('late transport JSON is discarded and denied status withdraws its own workspace', async function(){
    prepareWorkspace();window.__privateRequest=null;
    window.__fetchQueue.push(allowWorkspace());
    window.__fetchQueue.push(window.__mockResponse(200,'export function mount(host,options){window.__privateRequest=options.request;return {destroy(){}};}'));
    await mountPrivateWorkspace();assert(window.__privateRequest,'missing transport');
    const entered=deferred(),release=deferred();
    window.__fetchQueue.push({ok:true,status:200,json:()=>{entered.resolve();return release.promise;}});
    const pending=window.__privateRequest('/api/private-workspaces/test').then(()=>false,()=>true);
    await entered.promise;authClearSession();release.resolve({private:'old'});
    assert(await pending,'stale JSON released');
    for(const status of [401,403,404]){
      prepareWorkspace();window.__fetchQueue.push(allowWorkspace());
      window.__fetchQueue.push(window.__mockResponse(200,'export function mount(host,options){window.__privateRequest=options.request;return {destroy(){}};}'));
      await mountPrivateWorkspace();window.__fetchQueue.push(window.__mockResponse(status,{}));
      let denied=false;try{await window.__privateRequest('/api/private-workspaces/test');}catch(err){denied=true;}
      assert(denied,'denial accepted');equal(pwsState,null,'denial retained workspace: '+status);
    }
  });

  test('manifest request ใช้ bearer token ของผู้ใช้ ไม่ส่ง cookie และไม่ cache', async function(){
    reset();
    workspaceSession();
    SCIENCE_WORKSPACE_API_ORIGIN = 'https://opc.example.test';
    window.__fetchQueue.push(window.__mockResponse(404, {error:'NOT_FOUND'}));

    await mountPrivateWorkspace();

    const call = window.__fetchCalls[0];
    assert(call.url.startsWith('https://opc.example.test/'), 'ยิงผิด origin: ' + call.url);
    equal(call.options.headers.Authorization, 'Bearer ws-token', 'ไม่ได้ใช้ token ของผู้ใช้');
    equal(call.options.credentials, 'omit', 'ยังแนบ credential ไปด้วย');
    equal(call.options.cache, 'no-store', 'ยอมให้ cache คำตอบส่วนตัว');
  });

  test('ผู้มีสิทธิ์ได้ปุ่มกับ panel ใหม่ โดยของเดิมยังอยู่ครบเท่าเดิม', async function(){
    reset();
    workspaceSession();
    SCIENCE_WORKSPACE_API_ORIGIN = 'https://opc.example.test';
    const navBefore = [...document.querySelectorAll('.side-item')].map(el=>el.textContent.trim());

    window.__fetchQueue.push(window.__mockResponse(200, {
      allowed:true, label:'RD Science', bundleUrl:'/api/private-workspaces/formula/bundle',
      version:'1', mode:'workspace'
    }));
    window.__fetchQueue.push(window.__mockResponse(200,
      'export function mount(host){ host.textContent = "workspace ready"; }'));

    await mountPrivateWorkspace();

    const nav = document.getElementById('pwsNav');
    assert(nav, 'ผู้มีสิทธิ์ไม่ได้ปุ่ม');
    equal(nav.textContent, 'RD Science', 'ป้ายปุ่มไม่ได้มาจาก manifest');
    assert(document.getElementById('pwsPanel'), 'ไม่มี panel');

    // ปุ่มเดิมทุกปุ่มยังอยู่ครบและข้อความไม่เปลี่ยน
    const navAfter = [...document.querySelectorAll('.side-item')].map(el=>el.textContent.trim());
    navBefore.forEach(function(label){
      assert(navAfter.includes(label), 'ปุ่มเดิมหายไป: ' + label);
    });
  });

  test('ป้ายจากเซิร์ฟเวอร์ถูกใส่ด้วย textContent ไม่ใช่ HTML', async function(){
    reset();
    workspaceSession();
    SCIENCE_WORKSPACE_API_ORIGIN = 'https://opc.example.test';
    window.__fetchQueue.push(window.__mockResponse(200, {
      allowed:true, label:'<img src=x onerror="window.__pwsXss=1">', 
      bundleUrl:'/api/private-workspaces/formula/bundle', version:'1', mode:'workspace'
    }));
    window.__fetchQueue.push(window.__mockResponse(200, 'export function mount(){}'));

    await mountPrivateWorkspace();

    const nav = document.getElementById('pwsNav');
    assert(nav, 'ไม่ได้สร้างปุ่ม');
    equal(nav.querySelector('img'), null, 'ป้ายจากเซิร์ฟเวอร์ถูก render เป็น HTML');
    equal(window.__pwsXss, undefined, 'สคริปต์จากป้ายทำงานได้');
  });

  test('bundleUrl ที่ชี้ออกนอก origin ที่อนุมัติถูกปฏิเสธ', async function(){
    for(const bad of ['https://evil.test/bundle.js','http://opc.example.test/bundle.js',
                      'javascript:alert(1)','//evil.test/x.js']){
      reset();
      workspaceSession();
      SCIENCE_WORKSPACE_API_ORIGIN = 'https://opc.example.test';
      window.__fetchQueue.push(window.__mockResponse(200, {
        allowed:true, label:'RD Science', bundleUrl:bad, version:'1', mode:'workspace'
      }));
      await mountPrivateWorkspace();
      equal(document.getElementById('pwsNav'), null, 'ยอมรับ bundleUrl อันตราย: ' + bad);
      assert(!window.__fetchCalls.some(c=>c.url.includes('evil.test')), 'ยิงไปที่ ' + bad);
    }
  });

  test('ออกจากระบบแล้วต้องถอนปุ่ม panel และ Blob URL ให้หมด', async function(){
    reset();
    workspaceSession();
    SCIENCE_WORKSPACE_API_ORIGIN = 'https://opc.example.test';
    const before = domFingerprint();
    window.__fetchQueue.push(window.__mockResponse(200, {
      allowed:true, label:'RD Science', bundleUrl:'/api/private-workspaces/formula/bundle',
      version:'1', mode:'workspace'
    }));
    window.__fetchQueue.push(window.__mockResponse(200, 'export function mount(){}'));
    await mountPrivateWorkspace();
    assert(document.getElementById('pwsNav'), 'setup: ไม่ได้ mount');

    authClearSession();

    equal(document.getElementById('pwsNav'), null, 'ปุ่มยังอยู่หลังออกจากระบบ');
    equal(document.getElementById('pwsPanel'), null, 'panel ยังอยู่หลังออกจากระบบ');
    equal(domFingerprint(), before, 'DOM ไม่กลับไปเหมือนเดิมหลังออกจากระบบ');
  });

  test('membership หายหรือ role เปลี่ยน = ถอนออกทันที', async function(){
    reset();
    workspaceSession();
    SCIENCE_WORKSPACE_API_ORIGIN = 'https://opc.example.test';
    window.__fetchQueue.push(window.__mockResponse(200, {
      allowed:true, label:'RD Science', bundleUrl:'/api/private-workspaces/formula/bundle',
      version:'1', mode:'workspace'
    }));
    window.__fetchQueue.push(window.__mockResponse(200, 'export function mount(){}'));
    await mountPrivateWorkspace();
    assert(document.getElementById('pwsNav'), 'setup: ไม่ได้ mount');

    // เซิร์ฟเวอร์เปลี่ยนใจ: รอบถัดไปตอบ 404
    window.__fetchQueue.push(window.__mockResponse(404, {error:'NOT_FOUND'}));
    await mountPrivateWorkspace();

    equal(document.getElementById('pwsNav'), null, 'สิทธิ์หายแล้วปุ่มยังอยู่');
    equal(document.getElementById('pwsPanel'), null, 'สิทธิ์หายแล้ว panel ยังอยู่');
  });

  test('switchView ของเดิมยังทำงานเหมือนเดิมเมื่อมี panel ใหม่อยู่', async function(){
    reset();
    workspaceSession();
    SCIENCE_WORKSPACE_API_ORIGIN = 'https://opc.example.test';
    window.__fetchQueue.push(window.__mockResponse(200, {
      allowed:true, label:'RD Science', bundleUrl:'/api/private-workspaces/formula/bundle',
      version:'1', mode:'workspace'
    }));
    window.__fetchQueue.push(window.__mockResponse(200, 'export function mount(){}'));
    await mountPrivateWorkspace();

    // repo นี้ใช้ class 'on' เป็นตัวบอกว่า view ไหนเปิดอยู่ ไม่ใช่ attribute hidden
    switchView('dash');
    const panel = document.getElementById('pwsPanel');
    assert(panel && !panel.classList.contains('on'), 'เปลี่ยนไปหน้าอื่นแล้ว panel ใหม่ยังโชว์อยู่');
    const dash = document.getElementById('dashView');
    assert(dash && dash.classList.contains('on'), 'หน้าเดิมเปิดไม่ได้เมื่อมี panel ใหม่');

    // แล้วกดกลับเข้า workspace ต้องเปิดได้จริง ไม่ใช่ตกไปหน้า Customer Data
    switchView('pws');
    assert(panel.classList.contains('on'), 'กดปุ่ม workspace แล้วไม่เปิด');
    const input = document.getElementById('inputView');
    assert(input && !input.classList.contains('on'), 'กดปุ่ม workspace แล้วตกไปหน้าเดิม');
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

  // ---------- Content-Security-Policy ของหน้า (QA3 I3) ----------
  // bundle ถูก import() เข้ามารันใน origin เดียวกับ Formula จึงอ่าน
  // sessionStorage.fs_auth_session ได้ · CSP กันไม่ได้ว่าอ่าน แต่กันได้ว่าส่งออกไปไหน

  function cspMeta(){ return document.querySelector('meta[http-equiv="Content-Security-Policy"]'); }

  test('หน้ามี CSP ที่ยังมีความหมาย ไม่มี unsafe-eval และไม่มี wildcard', function(){
    const meta = cspMeta();
    assert(meta, 'หน้าไม่มี Content-Security-Policy เลย');
    const csp = meta.getAttribute('content');
    assert(!/unsafe-eval/.test(csp), 'CSP ยอมให้ eval ได้');
    assert(!/script-src[^;]*\s\*(\s|;|$)/.test(csp), 'script-src เป็น wildcard');
    assert(!/connect-src[^;]*\s\*(\s|;|$)/.test(csp), 'connect-src เป็น wildcard');
    assert(/object-src 'none'/.test(csp), 'CSP ไม่ได้ปิด object-src');
    assert(/base-uri 'none'/.test(csp), 'CSP ไม่ได้ปิด base-uri');
    assert(/connect-src /.test(csp), 'CSP ไม่ได้จำกัดปลายทางของ request');
  });

  test('connect-src ยอมเฉพาะ origin ที่ประกาศไว้', function(){
    assert(pwsCspAllowsConnect('https://opc.example.test'), 'origin ที่ประกาศไว้กลับถูกปฏิเสธ');
    assert(!pwsCspAllowsConnect('https://evil.test'), 'origin ที่ไม่ได้ประกาศกลับผ่าน');
    assert(!pwsCspAllowsConnect('http://opc.example.test'), 'ยอมรับ origin ที่ไม่ใช่ HTTPS');
    assert(!pwsCspAllowsConnect('not a url'), 'ยอมรับค่าที่ไม่ใช่ URL');
  });

  test('wildcard host ใน connect-src ต้องแมตช์เฉพาะ subdomain จริง', function(){
    assert(pwsCspAllowsConnect('https://uumk.supabase.co'), 'subdomain ที่ถูกต้องกลับถูกปฏิเสธ');
    assert(!pwsCspAllowsConnect('https://supabase.co'), 'โดเมนแม่ผ่าน wildcard ได้');
    assert(!pwsCspAllowsConnect('https://evil-supabase.co'), 'โดเมนที่แค่ลงท้ายคล้ายกันผ่านได้');
    assert(!pwsCspAllowsConnect('https://supabase.co.evil.test'), 'suffix ถูกใช้เป็น prefix ได้');
  });

  test('ไม่มี CSP ให้ตรวจ = ปฏิเสธไว้ก่อน', function(){
    const meta = cspMeta();
    const saved = meta.getAttribute('content');
    try{
      meta.setAttribute('content', "default-src 'self'");
      equal(pwsCspConnectSrc(), null, 'ไม่มี connect-src แต่ยังตอบว่ารู้');
      assert(!pwsCspAllowsConnect('https://opc.example.test'), 'ไม่มี connect-src แต่กลับปล่อยผ่าน');
    }finally{
      meta.setAttribute('content', saved);
    }
  });

  test('origin ที่ CSP ไม่อนุญาต ต้องไม่ mount และไม่ยิง request', async function(){
    reset();
    workspaceSession();
    // origin นี้ถูกต้องตามกฎ HTTPS ทุกข้อ ต่างกันแค่ไม่ได้อยู่ใน connect-src
    SCIENCE_WORKSPACE_API_ORIGIN = 'https://evil.test';
    const before = domFingerprint();

    equal(pwsApprovedOrigin(), '', 'origin นอก CSP ผ่าน preflight ไปได้');
    await mountPrivateWorkspace();

    equal(window.__fetchCalls.length, 0, 'ยิง request ไป origin ที่ CSP บล็อกอยู่ดี');
    equal(domFingerprint(), before, 'DOM ของเดิมเปลี่ยนไป');
    equal(document.getElementById('pwsNav'), null, 'สร้างปุ่มทั้งที่ mount ไม่ได้');
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
