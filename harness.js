#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = __dirname;
const sourcePath = path.join(root, 'index.html');
const testPath = path.join(root, 'test.html');
const browser = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let html = fs.readFileSync(sourcePath, 'utf8');
const originalUrl = (html.match(/let SB_URL = '([^']*)';/) || [,''])[1];
const originalKey = (html.match(/let SB_KEY = '([^']*)';/) || [,''])[1];
html = html
  .replace(/let SB_URL = '[^']*';/, "let SB_URL = 'https://test-project.supabase.co';")
  .replace(/let SB_KEY = '[^']*';/, "let SB_KEY = 'sb_publishable_test_only';");

// CSP ของ index.html ต้องคงคุณสมบัติที่ทำให้มันมีความหมาย ก่อนจะถูกดัดแปลงเพื่อเทสต์
const cspMatch = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/);
if(!cspMatch){
  throw new Error('index.html no longer declares a Content-Security-Policy');
}
const productionCsp = cspMatch[1];
for(const forbidden of ['unsafe-eval', "script-src *", "connect-src *", "default-src *"]){
  if(productionCsp.includes(forbidden)){
    throw new Error('The Content-Security-Policy in index.html is too permissive: ' + forbidden);
  }
}
for(const required of ["object-src 'none'", "base-uri 'none'", 'connect-src ']){
  if(!productionCsp.includes(required)){
    throw new Error('The Content-Security-Policy in index.html is missing ' + required);
  }
}
// origin ทดสอบต้องถูกอนุญาตเหมือน origin จริงของ deployment มิฉะนั้น loader จะ
// ปฏิเสธ mount แบบ fail-closed และเทสต์ workspace ทั้งชุดจะวัดอะไรไม่ได้เลย
// `https://evil.test` จงใจไม่อยู่ในรายการ เพื่อให้เทสต์ทางลบยังพิสูจน์ได้จริง
html = html.replace(/(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(">)/, function(match, open, policy, close){
  let rewritten = policy;
  // นโยบายจริงปักหมุด Supabase host ของ deployment ไว้ ต้องเปลี่ยนเป็นของเทสต์
  // ด้วย มิฉะนั้น config ของ production จะติดไปกับไฟล์เทสต์
  if(originalUrl) rewritten = rewritten.split(originalUrl).join('https://test-project.supabase.co');
  return open + rewritten.replace('connect-src ', 'connect-src https://opc.example.test https://other.example.test ') + close;
});

const mockPrelude = `<script id="fs-test-prelude">
window.__FS_TEST__ = true;
window.__fetchCalls = [];
window.__fetchQueue = [];
window.__mockResponse = function(status, body){
  const text = body == null ? '' : (typeof body === 'string' ? body : JSON.stringify(body));
  return {ok:status >= 200 && status < 300,status:status,text:async()=>text,json:async()=>text?JSON.parse(text):null};
};
window.fetch = async function(url, options){
  const call = {url:String(url),options:options||{}};
  window.__fetchCalls.push(call);
  const next = window.__fetchQueue.shift();
  if(typeof next === 'function') return next(call);
  if(next) return next;
  return window.__mockResponse(200, []);
};
</script>`;

html = html.replace(/<script>\s*\/\/ ===================================================================/, mockPrelude + '\n<script>\n// ===================================================================');
// เทสต์ต้อง inline · หน้าเปิดผ่าน file:// ซึ่ง 'self' ของ CSP ไม่แมตช์ไฟล์ข้างเคียง
// ถ้าใช้ <script src> แทน เทสต์จะถูก CSP บล็อกและ harness จะเงียบไปเฉย ๆ
const suiteSource = fs.readFileSync(path.join(root, 'tests', 'formula-studio.test.js'), 'utf8');
if(suiteSource.includes('</script')){
  throw new Error('The test suite cannot be inlined because it contains a script end tag');
}
html = html.replace('</body>', '<script id="fs-test-suite">\n' + suiteSource + '\n</script>\n</body>');

if(!html.includes('window.__FS_TEST__ = true') || !html.includes(suiteSource)){
  throw new Error('Could not inject the deterministic browser harness');
}
if((originalUrl && html.includes(originalUrl)) || (originalKey && html.includes(originalKey))){
  throw new Error('The generated harness still contains production configuration');
}

fs.writeFileSync(testPath, html);

const result = spawnSync(browser, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--disable-background-networking',
  '--virtual-time-budget=7000',
  '--dump-dom',
  'file://' + testPath
], {encoding:'utf8', maxBuffer:32 * 1024 * 1024});

if(result.error) throw result.error;
const output = result.stdout || '';
const match = output.match(/<pre id="fs-test-results">([\s\S]*?)<\/pre>/);
const report = match ? match[1]
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : '';

if(report) process.stdout.write(report + '\n');
if(result.status !== 0 || !/<html[^>]*data-test-status="passed"/.test(output)){
  if(!report) process.stderr.write((result.stderr || 'Browser test did not produce a report') + '\n');
  process.exit(1);
}
