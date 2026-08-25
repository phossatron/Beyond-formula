# Formula Studio — กฎการแก้ไขโปรเจกต์

เครื่องมือ R&D Briefing ของ Beyond Laboratory · ไฟล์เดียว `index.html` (HTML + CSS + JS วานิลลา ไม่มี build step)
ข้อมูลเก็บใน `localStorage` เป็น local-first และอาจซิงก์กับ Supabase เมื่อเปิดใช้ server configuration

ก่อนทำงานทุกครั้งต้องอ่าน `AGENTS.md` ก่อน ไฟล์นั้นกำหนด **กฎเหล็กอันดับ 1: GitHub-Centered Development & Runtime Governance** และมีลำดับเหนือกฎเฉพาะ Formula Studio ในไฟล์นี้

---

## กฎเหล็กอันดับ 1 — GitHub-Centered Development & Runtime Governance

> GitHub เป็น Source of Truth ของการเปลี่ยนแปลงระบบ · Codex เป็น Development Agent · Hermes เป็น Governance Monitor · Runtime Operator เป็นผู้ deploy approved release

- ทำงานบน feature branch ผ่าน Pull Request และ independent review ตามระดับความเสี่ยง ห้าม direct push/force push ไป protected `main`
- Codex ห้าม final approve งานตัวเอง ห้าม deploy production ห้ามเข้าถึง production secret/data ที่ไม่ mask และห้าม patch source ที่ runtime
- Critical Change รวม auth/permission, Supabase/schema/sync, runtime/deployment, CI/CD, secret handling, backup/restore และ audit integrity
- Critical Change ต้องขอ independent approval จาก CODEOWNER `@phossatron` หรือผู้ทดแทนที่ System Owner แต่งตั้งอย่างเป็นทางการ
- ห้ามฝัง secret หรือ production/confidential data ลง repository, commit, PR, log หรือ prompt
- Browser ใช้ได้เฉพาะ Supabase publishable/anon key ภายใต้ RLS และ least-privilege grants; ห้ามฝัง `service_role`, secret key หรือ privileged token
- ทุกงานต้องรายงาน traceability, files changed, tests, impacts, rollback, risks และ PR reference ตาม contract ใน `AGENTS.md`
- หากพบ scope conflict, forbidden path, secret หรือ production credential ให้หยุดด้วย `BLOCKED_GOVERNANCE` และแจ้ง System Owner

รายละเอียดบังคับทั้งหมดอยู่ใน `AGENTS.md`; เอกสาร governance ฉบับเต็มเป็น `Internal Confidential` และห้ามคัดลอกเข้า public repository

---

## กฎเหล็กอันดับ 2 — ห้ามแก้ไขโครงสร้างข้อมูล

> **ห้ามเปลี่ยน / เปลี่ยนชื่อ / ลบ key ของ localStorage, ชื่อฟิลด์ หรือชนิดข้อมูลของ object ที่ระบุไว้ในหัวข้อ "โครงสร้างข้อมูลที่ถูกล็อก" โดยเด็ดขาด**

ข้อมูลจริงของผู้ใช้อยู่ในเครื่องผู้ใช้เท่านั้น ถ้าเปลี่ยนโครงสร้าง = **ข้อมูลเก่าที่บันทึกไว้แล้วอ่านไม่ออก / หายถาวร กู้คืนไม่ได้**

### ทำได้
- **เพิ่ม** ฟิลด์ใหม่เข้าไปใน object เดิม (ฟิลด์ใหม่ต้อง optional และโค้ดต้องทำงานได้เมื่อค่าเป็น `undefined`)
- แก้ UI / CSS / ข้อความ / ตัวเลือกใน dropdown / ลำดับการแสดงผล
- เพิ่มฟังก์ชัน, เพิ่มหน้าจอ, เพิ่มสิทธิ์ Role, เพิ่มคอลัมน์ Export (ต่อท้ายเสมอ)

### ห้ามทำ
- เปลี่ยนชื่อ key: `fs_records`, `fs_reccounter`, `fs_user`, `fs_userlist`, `fs_chats`, `fs_activities`, `fs_imp`
- เปลี่ยนชื่อฟิลด์ เช่น `salesOwner` → `sales_owner`, `uw` → `unitWeight`
- เปลี่ยนชนิดข้อมูล เช่น string → number, object → array, array → object
- ลบฟิลด์เดิมทิ้ง แม้จะเลิกใช้แล้ว (ให้หยุดแสดงผลแทน — ข้อมูลเก่ายังต้องอยู่ครบ)
- เปลี่ยนรูปแบบรหัสงาน `A00001` (prefix ตัวอักษร A–Z + เลข 5 หลัก) หรือแก้ตัวนับ `fs_reccounter` ให้ย้อนกลับ
- เขียนทับ / เคลียร์ store ใด ๆ ตอน load — โดยเฉพาะ **ห้ามเรียก `saveRecordsStore()` ก่อนที่ `loadRecords()` จะทำงานเสร็จ**
  (เคยเกือบทำให้ records ทั้งหมดถูกเขียนทับด้วย array ว่างมาแล้ว — ดูกฎข้อ 4)

### ถ้าจำเป็นต้องเปลี่ยนจริง ๆ
1. ถามเจ้าของโปรเจกต์ก่อนเสมอ ห้ามตัดสินใจเอง
2. เขียนโค้ด migrate ค่าเดิม → ค่าใหม่ ให้รันตอน load และต้องรันซ้ำได้โดยไม่พัง (idempotent)
3. ต้องอ่านข้อมูลรูปแบบเก่าได้ต่อไป (backward compatible) เช่นเดียวกับที่ทำกับ `userList` แบบ string เดิม และหัวคอลัมน์ Excel เก่า

---

## โครงสร้างข้อมูลที่ถูกล็อก

### localStorage keys
| Key | เก็บอะไร |
|---|---|
| `fs_records` | array ของ record (ชุดข้อมูลงาน) |
| `fs_reccounter` | ตัวนับเลขรันของรหัสงาน (number) |
| `fs_user` | ชื่อผู้ใช้ที่ล็อกอินอยู่ (string) |
| `fs_userlist` | array ของ user object |
| `fs_chats` | array ของห้องแชท |
| `fs_activities` | array ของ activity log (ใหม่สุดอยู่หน้าสุด, จำกัด `ACT_MAX`) |
| `fs_imp` | ชื่อผู้ที่กำลัง impersonate (string) |

Optional state ที่เพิ่มแบบ backward compatible: `sessionStorage.fs_auth_session` เก็บ Auth session เฉพาะ tab/session และ `localStorage.fs_sync_snapshot` เก็บ server snapshot ที่ไม่มี token เพื่อ merge offline delta
และ `localStorage.fs_chat_event_outbox`, `fs_chat_read_outbox`, `fs_chat_delete_outbox` เก็บรายการ Chat ที่รอ RPC แบบ local-first; รายการเหล่านี้ต้องล้างได้เฉพาะเมื่อ server ตอบสำเร็จ

### record (`fs_records[]`)
```
id createdAt createdBy updatedAt updatedBy date metaDate
brand customer salesOwner phone
form size sizeUnit uw uwUnit gender price notes
cat subcat priority fdaType color scent flavor packType widthCm lengthCm
conceptStr allConcepts finalTarget
allBenefits allSP cons
rows          // array ของสาร: {num, name, w, o, p, actual, note, hero, fda}
modNote       // {text, savedBy, savedAt}
closed        // {by, at, ts} — มีเมื่อปิดงานแล้วเท่านั้น
```

### user (`fs_userlist[]`)
```
{ name, role, email, pass }      // secure server: pass = null; local-only legacy: pwHash() ได้
```

### chat (`fs_chats[]`)
```
{ jobId, createdAt, createdBy, messages[], parts[], approvals:{pd, ra, rd} }
messages[] = { type:'sys'|'msg', user?, text, ts, ... }
```

### activity (`fs_activities[]`)
```
{ ts, at, user, role, cat, action, detail, job, via }
```

---

### เซิร์ฟเวอร์กลาง (Supabase) ก็ล็อกโครงสร้างเดียวกัน

ตารางบนเซิร์ฟเวอร์เก็บ object รูปทรงเดิม**ทั้งก้อน**ไว้ในคอลัมน์ `data jsonb` — ไม่แตกฟิลด์เป็นคอลัมน์
ดังนั้นเพิ่มฟิลด์ใหม่ในแอปได้โดยไม่ต้องแก้ฐานข้อมูล และกฎข้อ 2 ยังคุมทั้งสองฝั่งด้วยกติกาชุดเดียว

| ตาราง | คีย์ | มาจาก |
|---|---|---|
| `fs_records` | `id` | `records[]` |
| `fs_chats` | `job_id` | `chats[]` |
| `fs_users` | `name` | `userList[]` |
| `fs_activities` | `uid` (+`ts`) | `activities[]` — append only |
| `fs_meta` | `key` | `reccounter` |
| `fs_memberships` | `user_id` | Auth authorization แยกจาก locked JSON |

ห้ามแตกฟิลด์ออกเป็นคอลัมน์จริง ห้ามเปลี่ยนชื่อตาราง/คีย์ ห้ามเก็บ `currentUser` / `impersonator` ขึ้นเซิร์ฟเวอร์
(เป็นสถานะของเครื่องนั้น ๆ ไม่ใช่ข้อมูลร่วม) โครงสร้างเต็มอยู่ที่ `supabase/schema.sql`

---

## กฎข้ออื่น ๆ

**3. ไฟล์เดียว** — งาน application ทั้งหมดอยู่ใน `index.html` ห้ามแตกไฟล์ ห้ามเพิ่ม build step ห้ามเพิ่ม dependency ใหม่
(dependency ที่มีอยู่โหลดจาก CDN: SheetJS และชุดสร้าง PDF ที่โหลดเมื่อใช้งาน)

**4. ห้ามเขียนทับข้อมูลตอน load** — ฟังก์ชัน migrate ต้องแยกกันตามชนิดข้อมูล และเรียกหลังจาก loader ของชนิดนั้นทำงานเสร็จแล้วเท่านั้น
(เช่น `migrateUserNames()` ใน `loadUsers()` ห้ามแตะ records — ต้องใช้ `migrateRecordOwners()` ที่เรียกหลัง `loadRecords()`)

**5. Export Excel เพิ่มคอลัมน์ได้เฉพาะต่อท้าย** — ห้ามแทรกกลางหรือสลับลำดับ เพราะ index ของคอลัมน์ถูกอ้างอิงอยู่ทั้งขาเข้า (import) และเทสต์

**6. escape ทุกค่าที่มาจากผู้ใช้** — ใช้ `esc()` ทุกครั้งที่ประกอบ HTML จาก template literal

**7. รันเทสต์ก่อนส่งงานเสมอ** — `node harness.js` และ `./tests/run-sql-tests.sh` ต้องผ่าน 100%; browser console ต้องไม่มี error
ถ้าแก้อะไรแล้วเทสต์เดิมพัง ให้ตรวจก่อนว่าเป็น regression จริงหรือแค่ความคาดหวังเก่าที่ต้องอัปเดต

**8. สิทธิ์ผู้ใช้ตรวจที่ `can()` / `requirePerm()` เสมอ** — ห้ามซ่อนปุ่มอย่างเดียวโดยไม่เช็คสิทธิ์ในฟังก์ชันที่ทำงานจริง
เมนูที่จำกัด Role ต้องกัน 3 ชั้น: ซ่อนปุ่ม + กันตอนเปิดหน้า/ป๊อปอัพ + กันในฟังก์ชันที่ลงมือทำจริง
Secure mode ต้องใช้ `authMembership.role` เป็น authority และปิด impersonation; local-only mode ที่สวมบทบาทให้ตรวจ Role ตัวจริงก่อนทำงานระดับ Admin

**8.1 หน้า Login คุมทางเข้าเดียว** — `renderLoginView()` แสดงเมื่อ `currentUser` ว่าง และเรียกจาก `renderUserUI()` เท่านั้น
ห้ามเพิ่มทางเข้าที่ตั้ง `currentUser` โดยไม่ผ่าน Supabase Auth + active membership (หรือ legacy password เฉพาะ local-only mode) และห้าม sync `currentUser` / `impersonator` ขึ้นเซิร์ฟเวอร์
ระหว่างที่ข้อมูลผู้ใช้ยังโหลดจากเซิร์ฟเวอร์ไม่เสร็จ ห้ามแสดงฟอร์มสร้าง Admin คนแรก (จะสร้างทับของเดิม)

**9. `pwHash()` ใช้ได้เฉพาะ local-only compatibility** — เป็นแค่การอำพรางฝั่ง client ห้ามใช้เป็น authorization ของ server; secure mode ต้องใช้ Supabase Auth + RLS

**10. อัปเดต build stamp บน header ทุกครั้งที่แก้ application** — ผู้ใช้ใช้ตัวนี้ยืนยันว่าได้เวอร์ชันใหม่แล้วหลัง hard refresh
