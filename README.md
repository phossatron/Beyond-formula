# Formula Studio

เครื่องมือ R&D Briefing ของ **Beyond Laboratory** — รวมงานตั้งแต่รับบรีฟจากลูกค้า → สร้างชุดข้อมูลงาน → คุยและอนุมัติในห้องแชท → ปิดงาน ไว้ในหน้าเดียว

## ใช้งาน

เปิดไฟล์ `index.html` ด้วยเบราว์เซอร์ได้เลย ไม่ต้องติดตั้งหรือ build อะไรทั้งสิ้น

## ความสามารถหลัก

- **หน้าเข้าใช้งาน (Login)** — Supabase Auth email/password เมื่อเปิด server mode; ครอบทั้งจอจนกว่าจะตรวจ session + membership สำเร็จ
- **Customer Data** — ฟอร์มบันทึกบรีฟลูกค้า (ลูกค้า & แบรนด์, รายละเอียดสินค้า, ลักษณะสินค้า & บรรจุภัณฑ์, กลุ่มเป้าหมาย & ราคา, สรรพคุณ / ข้อจำกัด / หมายเหตุ) พร้อมสูตรส่วนผสม
- **Dashboard** — สรุปงานทั้งหมด, งานที่ปิดแล้ว, ค้นหา / กรอง / Export Excel
- **Chat Message** — ห้องแชทต่อ 1 งาน พร้อมประวัติการแก้ไขชุดข้อมูล และการอนุมัติ 4 ฝ่าย (PD / RA / RD / Sales)
- **Activities log** — บันทึกทุกการกระทำในระบบ (Admin)
- **จัดการผู้ใช้** — ใน secure mode แสดงสมาชิกแบบ read-only; การเชิญ/Role/รหัสผ่านเป็นหน้าที่ Owner ผ่าน Supabase
- **สวมบทบาทผู้ใช้** — ใช้ได้เฉพาะ local-only mode; secure mode ปิดเพื่อไม่ให้ browser ข้าม database role
- **ออกจากระบบ** — เมนูล่างสุดของแถบซ้าย ยืนยันก่อนออก แล้วกลับไปหน้า Login

## Role

`Admin` · `PD` · `RA` · `RD` · `Sales` · `OPC` · `MKT` · `Purchasing`

UI ตรวจผ่าน `ROLES`/`can()`/`requirePerm()` และ secure mode บังคับซ้ำที่ฐานข้อมูลด้วย membership, grants, RLS และ JSON mutation guards

### เมนูไหนใครเห็น

| เมนู | Role ที่เข้าถึงได้ |
|---|---|
| Dashboard · Chat Message | ทุก Role |
| Customer Data | Admin · Sales · OPC · MKT |
| Activities log | Admin |
| สวมบทบาทผู้ใช้ | Admin เฉพาะ local-only mode |
| จัดการผู้ใช้ | Secure mode = read-only และ Owner จัดการผ่าน Supabase Dashboard |

## การยืนยันตัวตน

- Secure mode ใช้ Supabase Auth; token อยู่ใน `sessionStorage` เท่านั้น และ Data API ใช้ user JWT ไม่ใช้ publishable key เป็น bearer
- `fs_users.data.pass` คง key ไว้เพื่อ compatibility แต่ server บังคับให้เป็น JSON `null`
- เชิญผู้ใช้/รีเซ็ตหรือกู้รหัสผ่านผ่าน Supabase Dashboard ตาม [Auth/RLS runbook](supabase/AUTH_RLS_RUNBOOK.md)
- local-only mode ที่ไม่ตั้ง Supabase ยังรองรับ password hash เดิมเพื่อ backward compatibility เท่านั้น

## เว็บใช้งานจริง

Production URL เดิมคือ https://beyond-formula.vercel.app แต่การ release ต้องผ่าน approved PR/CODEOWNER/checks และ Runtime Operator ตาม governance; ห้ามถือว่า push ใด ๆ คือ production complete

## ข้อมูล

เก็บใน `localStorage` ของเบราว์เซอร์เสมอ และถ้าตั้งค่าเซิร์ฟเวอร์กลางไว้ จะซิงก์ให้ทุกเครื่องเห็นข้อมูลชุดเดียวกัน

**ก่อนทำงานทุกครั้ง อ่าน [AGENTS.md](AGENTS.md) ก่อน — กฎเหล็กอันดับ 1 คือ GitHub-Centered Development & Runtime Governance แล้วจึงอ่าน [CLAUDE.md](CLAUDE.md) สำหรับกฎข้อมูลและสถาปัตยกรรมเฉพาะ Formula Studio**

## ตั้งค่าซิงก์ข้อมูลข้ามเครื่อง (Supabase)

ถ้าไม่ตั้งค่า แอปยังใช้งานได้ปกติ แต่ข้อมูลจะอยู่แค่ในเครื่องที่กรอก ไม่มีใครเห็นด้วย

1. สมัคร https://supabase.com (ฟรี) → **New project** → ตั้งชื่อ เช่น `beyond-formula` → เลือก region **Southeast Asia (Singapore)**
2. ทำตาม [supabase/AUTH_RLS_RUNBOOK.md](supabase/AUTH_RLS_RUNBOOK.md): สร้าง Auth users ให้ email ตรงกับผู้ใช้เดิมก่อน แล้วรัน [supabase/schema.sql](supabase/schema.sql) ใน staging
3. ตรวจ membership, RLS negative cases และ UAT ใน staging แล้วจึงทำ production rollout ตาม approval
4. เข้า **Project Settings → Data API** คัดลอก **Project URL** และ **publishable/anon key** (ห้ามใช้ secret/service-role key)
5. เปิด `index.html` แก้ 2 บรรทัดบนสุดของแท็ก `<script>`
   ```js
   let SB_URL = 'https://xxxxxxxx.supabase.co';
   let SB_KEY = 'sb_publishable_...';
   ```
6. เปิด PR ให้ checks ผ่านและ `@phossatron` approve; Runtime Operator จึง deploy approved immutable commit

### การซิงก์ทำงานยังไง
- **เขียน:** ทุกครั้งที่บันทึก จะส่งขึ้นเซิร์ฟเวอร์เฉพาะรายการที่เปลี่ยนจริง (รวบการบันทึกที่ติดกันภายใน 0.4 วินาทีเป็นครั้งเดียว)
- **อ่าน:** ดึงข้อมูลใหม่ทุก 5 วินาที และทันทีที่สลับกลับมาที่แท็บ
- **เน็ตหลุด:** ใช้ข้อมูลในเครื่องต่อได้ ป้ายสถานะเป็นสีแดง พอเน็ตกลับมาจะซิงก์ให้เอง
- **merge:** ใช้ snapshot ล่าสุดแยก remote cache ออกจาก offline delta จึงไม่เขียนทับงานที่แก้ตอนเน็ตหลุด

### ความปลอดภัย

Publishable key มองเห็นได้ใน browser จึงเป็นเพียง project identifier ไม่ใช่สิทธิ์เข้าถึง ระบบบังคับ Supabase Auth, active membership, least-privilege grants, RLS และ mutation guards ที่ฐานข้อมูล ส่วน secret/service-role key ห้ามเข้า browser/repository โดยเด็ดขาด
