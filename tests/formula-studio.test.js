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

  test('401/403 clears authorization instead of falling back to publishable bearer', async function(){
    reset();
    authSession = {access_token:'denied-token',refresh_token:'refresh-test',expires_at:Date.now()/1000+3600};
    window.__fetchQueue.push(window.__mockResponse(403, {message:'denied'}));
    let failed = false;
    try{ await sbReq('fs_records?select=id'); }catch(err){ failed = true; }
    assert(failed, 'forbidden request unexpectedly succeeded');
    equal(authSession, null, 'forbidden session was retained');
    equal(sessionStorage.getItem('fs_auth_session'), null, 'forbidden token remained in storage');
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
