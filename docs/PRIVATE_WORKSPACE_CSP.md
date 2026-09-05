# Private workspace — Content-Security-Policy

สถานะ: mitigation ที่ทำได้จริงของ QA3 I3 · ไม่ใช่การปิดช่องทั้งหมด · ต้องผ่าน
CODEOWNER review ตาม `AGENTS.md` ก่อน (แตะ auth boundary = Critical Change)

## ปัญหาที่แก้

`mountPrivateWorkspace()` โหลด bundle จากเซิร์ฟเวอร์แล้วเรียก `await import(blobUrl)`
โมดูลที่ได้จึงรันใน **origin เดียวกับ Formula** ไม่ได้ถูกกั้นไว้ใน `#pwsPanel`
มันอ่าน `sessionStorage.fs_auth_session` (access token ที่ยังใช้ได้) และ `fs_*`
ทุกคีย์ได้เต็มที่ ก่อนหน้านี้ `index.html` ไม่มี CSP เลย จึงไม่มีอะไรจำกัดว่า
โมดูลนั้นจะส่งข้อมูลออกไปที่ไหน

## สิ่งที่ CSP นี้ทำ และไม่ทำ

CSP **ไม่ได้** กันการอ่าน — โค้ดที่รันใน origin เดียวกันอ่าน storage ได้เสมอ
สิ่งที่มันทำคือจำกัด **ปลายทาง** ให้เหลือเฉพาะที่ประกาศไว้:

| directive | ผล |
|---|---|
| `connect-src 'self' https://*.supabase.co` | `fetch`/XHR/WebSocket ไป host อื่นถูกบล็อก |
| `img-src 'self' data: blob:` | ปิดการ exfiltrate ผ่าน image beacon |
| `form-action 'none'` | ปิดการส่งออกผ่าน form submit |
| `object-src 'none'` / `base-uri 'none'` | ปิด plugin และการย้ายฐาน URL ของหน้า |
| `script-src` ไม่มี `unsafe-eval` | โค้ดที่ฉีดเข้ามาสร้างโค้ดใหม่จากสตริงไม่ได้ |

**ช่องที่ยังเหลือ** — CSP ไม่มี directive ที่คุม top-level navigation ที่ใช้ได้จริงแล้ว
(`navigate-to` ถูกถอดออกจากสเปก) โมดูลที่เป็นศัตรูจึงยัง `location = 'https://…?t=' + token`
ได้อยู่ · `script-src` ยังต้องมี `'unsafe-inline'` เพราะแอปมี `onclick=` 126 จุด
การปิดช่องนี้จริง ๆ ต้องย้าย bundle ไปรันใน **sandboxed iframe คนละ origin** แล้วคุยกัน
ผ่าน `postMessage` ซึ่งเปลี่ยนสัญญาของ loader และต้องแก้ bundle ทั้งสองโหมด —
บันทึกไว้เป็นงานถัดไป ไม่ได้ทำในรอบนี้

## กติกาเวลาเปลี่ยน origin

`connect-src` เป็นค่า static ใน `index.html` ส่วน `SCIENCE_WORKSPACE_API_ORIGIN`
เป็นอีกค่าหนึ่ง ถ้าปล่อยให้ไม่ตรงกัน workspace จะยิง request ไม่ออกโดยไม่มีใครรู้สาเหตุ
`pwsApprovedOrigin()` จึงตรวจ CSP ก่อนเสมอ และ **ปฏิเสธการ mount** เมื่อ origin ที่ตั้งไว้
ไม่อยู่ใน `connect-src` พร้อม `console.error` ครั้งเดียว — พังแบบดังกว่าพังแบบเงียบ

ดังนั้นเวลาตั้งค่า deployment ใหม่ต้องแก้ **สองที่คู่กัน**:

1. `let SCIENCE_WORKSPACE_API_ORIGIN = 'https://<approved-host>';`
2. เพิ่ม `https://<approved-host>` ลงใน `connect-src` ของ meta CSP

`pwsCspAllowsConnect()` รับ wildcard host แบบ `https://*.example.com` โดยแมตช์เฉพาะ
subdomain จริงเท่านั้น (`https://example.com` และ `https://evil-example.com` ไม่ผ่าน)

## การพิสูจน์

`node harness.js` — 55 เทสต์ ในนั้นมี 5 เทสต์สำหรับเรื่องนี้: CSP ยังมีความหมาย
(ไม่มี `unsafe-eval`/wildcard), connect-src ยอมเฉพาะที่ประกาศ, wildcard แมตช์
เฉพาะ subdomain, ไม่มี CSP = ปฏิเสธไว้ก่อน, และ origin นอก CSP ต้องไม่ mount
และไม่ยิง request

`harness.js` ยังตรวจ CSP ของ `index.html` ก่อนดัดแปลงเพื่อเทสต์ด้วย — ถ้ามีใครใส่
`unsafe-eval` หรือ wildcard หรือลบ `object-src`/`base-uri`/`connect-src` ออก
harness จะหยุดทันทีพร้อมบอกเหตุผล ไม่ปล่อยให้เทสต์ผ่านแบบไม่มีความหมาย

หมายเหตุสำหรับคนรัน harness: หน้าเทสต์เปิดผ่าน `file://` ซึ่ง `'self'` ไม่แมตช์ไฟล์
ข้างเคียง harness จึง **inline** ชุดเทสต์เข้าไปในหน้าแทนการใช้ `<script src>`
และติด id `fs-test-suite` / `fs-test-prelude` ไว้ เพื่อให้เทสต์ที่ตรวจว่า
"ไม่มีเนื้อหา static ฝังใน index.html" ตัด scaffolding ของ harness ออกได้
