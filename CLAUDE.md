# Formula Studio — กฎการแก้ไขโปรเจกต์

เครื่องมือ R&D Briefing ของ Beyond Laboratory · ไฟล์เดียว `index.html` (HTML + CSS + JS วานิลลา ไม่มี build step)
ข้อมูลทั้งหมดเก็บใน `localStorage` ของเบราว์เซอร์ผู้ใช้ — **ไม่มีเซิร์ฟเวอร์ ไม่มี migration script**
นั่นคือเหตุผลของกฎข้อ 1 ด้านล่าง

---

## กฎข้อ 1 (สำคัญที่สุด) — ห้ามแก้ไขโครงสร้างข้อมูล

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
  (เคยเกือบทำให้ records ทั้งหมดถูกเขียนทับด้วย array ว่างมาแล้ว — ดูกฎข้อ 3)

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
| `fs_recbak` | ประวัติเวอร์ชันของงาน `{รหัสงาน: [{ts, by, why, data}]}` — **ของเครื่องนี้เท่านั้น ห้ามซิงก์ขึ้นเซิร์ฟเวอร์** · เก็บสูงสุด `RECBAK_PER` เวอร์ชันต่องาน และตัดของเก่าทิ้งเองเมื่อเกินเพดานขนาด · ลบทิ้งได้โดยไม่กระทบข้อมูลจริง แต่จะเสียตาข่ายกู้คืน |
| `fs_tags` | array ของนิยาม Tag `{id, name, color, by?}` (สูงสุด 30) · `by` = ชื่อผู้สร้าง (optional — Tag เก่าที่ไม่มีฟิลด์นี้ถือเป็นของกลาง ทุก Role เห็นได้) |

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
rejected      // {by, at, ts} — มีเมื่อถูก Reject เท่านั้น · Reject แล้วยกเลิกไม่ได้ ห้ามเพิ่มทางลบฟิลด์นี้
tags          // array ของ tag id (optional) — งานเก่าที่ไม่มีฟิลด์นี้ต้องทำงานได้ปกติ
market        // '' | 'Domestic' | 'Oversea' (optional) — ตลาดปลายทาง
country       // string (optional) — ประเทศปลายทาง เก็บเฉพาะเมื่อ market === 'Oversea'
```

### user (`fs_userlist[]`)
```
{ name, role, email, pass }      // pass = pwHash() — ผู้ใช้เก่าที่ไม่มี pass ต้องล็อกอินได้ต่อไป
```

### chat (`fs_chats[]`)
```
{ jobId, createdAt, createdBy, messages[], parts[], approvals:{pd, ra, rd} }
messages[] = { type:'sys'|'msg', text, ts, ... }
```

### activity (`fs_activities[]`)
```
{ ts, at, user, role, cat, action, detail, job, via }
```

---

### เซิร์ฟเวอร์กลาง (Supabase) ก็ล็อกโครงสร้างเดียวกัน

ตารางบนเซิร์ฟเวอร์เก็บ object รูปทรงเดิม**ทั้งก้อน**ไว้ในคอลัมน์ `data jsonb` — ไม่แตกฟิลด์เป็นคอลัมน์
ดังนั้นเพิ่มฟิลด์ใหม่ในแอปได้โดยไม่ต้องแก้ฐานข้อมูล และกฎข้อ 1 ยังคุมทั้งสองฝั่งด้วยกติกาชุดเดียว

| ตาราง | คีย์ | มาจาก |
|---|---|---|
| `fs_records` | `id` | `records[]` |
| `fs_chats` | `job_id` | `chats[]` |
| `fs_users` | `name` | `userList[]` |
| `fs_activities` | `seq` (+`ts`) | `activities[]` — append only |
| `fs_meta` | `key` | `reccounter` + นิยาม Tag ที่ key `tags` |

ห้ามแตกฟิลด์ออกเป็นคอลัมน์จริง ห้ามเปลี่ยนชื่อตาราง/คีย์ ห้ามเก็บ `currentUser` / `impersonator` ขึ้นเซิร์ฟเวอร์
(เป็นสถานะของเครื่องนั้น ๆ ไม่ใช่ข้อมูลร่วม) โครงสร้างเต็มอยู่ที่ `supabase/schema.sql`

---

## กฎข้ออื่น ๆ

**2. ไฟล์เดียว** — งานทั้งหมดอยู่ใน `index.html` ห้ามแตกไฟล์ ห้ามเพิ่ม build step ห้ามเพิ่ม dependency ใหม่
(ที่มีอยู่คือ SheetJS จาก CDN เท่านั้น)

**3. ห้ามเขียนทับข้อมูลตอน load** — ฟังก์ชัน migrate ต้องแยกกันตามชนิดข้อมูล และเรียกหลังจาก loader ของชนิดนั้นทำงานเสร็จแล้วเท่านั้น
(เช่น `migrateUserNames()` ใน `loadUsers()` ห้ามแตะ records — ต้องใช้ `migrateRecordOwners()` ที่เรียกหลัง `loadRecords()`)

**4. Export Excel เพิ่มคอลัมน์ได้เฉพาะต่อท้าย** — ห้ามแทรกกลางหรือสลับลำดับ เพราะ index ของคอลัมน์ถูกอ้างอิงอยู่ทั้งขาเข้า (import) และเทสต์

**5. escape ทุกค่าที่มาจากผู้ใช้** — ใช้ `esc()` ทุกครั้งที่ประกอบ HTML จาก template literal

**6. รันเทสต์ก่อนส่งงานเสมอ** — `node harness.js` แล้วเปิด `test.html` ด้วย headless Chrome ต้องผ่าน 100% และ console ต้องไม่มี error
ถ้าแก้อะไรแล้วเทสต์เดิมพัง ให้ตรวจก่อนว่าเป็น regression จริงหรือแค่ความคาดหวังเก่าที่ต้องอัปเดต

**7. สิทธิ์ผู้ใช้ตรวจที่ `can()` / `requirePerm()` เสมอ** — ห้ามซ่อนปุ่มอย่างเดียวโดยไม่เช็คสิทธิ์ในฟังก์ชันที่ทำงานจริง
เมนูที่จำกัด Role ต้องกัน 3 ชั้น: ซ่อนปุ่ม + กันตอนเปิดหน้า/ป๊อปอัพ + กันในฟังก์ชันที่ลงมือทำจริง
สำหรับสิทธิ์ระดับ Admin ให้ตรวจ **Role ตัวจริง** (`impersonator ? findUser(impersonator).role : currentRole()`)
ไม่ใช่ Role ที่กำลังสวมบทบาทอยู่

**7.1 หน้า Login คุมทางเข้าเดียว** — `renderLoginView()` แสดงเมื่อ `currentUser` ว่าง และเรียกจาก `renderUserUI()` เท่านั้น
ห้ามเพิ่มทางเข้าที่ตั้ง `currentUser` โดยไม่ผ่านการตรวจรหัสผ่าน และห้าม sync `currentUser` / `impersonator` ขึ้นเซิร์ฟเวอร์
ระหว่างที่ข้อมูลผู้ใช้ยังโหลดจากเซิร์ฟเวอร์ไม่เสร็จ ห้ามแสดงฟอร์มสร้าง Admin คนแรก (จะสร้างทับของเดิม)

**8. รหัสผ่านในระบบนี้ไม่ใช่ระบบความปลอดภัยจริง** — `pwHash()` เป็นแค่การอำพรางฝั่ง client เก็บใน localStorage
ห้ามนำไปใช้เก็บข้อมูลลับ และห้ามโฆษณาว่าปลอดภัย

**8.1 ห้ามตั้งชื่อฟังก์ชันซ้ำกัน** — ทั้งไฟล์เป็น scope เดียว ตัวที่ประกาศทีหลังจะทับตัวแรกเงียบ ๆ
(เคยเกิดแล้ว: `addTag()` ของช่องสรรพคุณ/ข้อจำกัด ถูกฟังก์ชันสร้าง Tag ของงานชื่อเดียวกันทับ
ทำให้กด Enter แล้วไม่ขึ้นป้าย และไปสร้าง Tag ชื่อ `[object KeyboardEvent]` แทน — แก้โดยเปลี่ยนตัวใหม่เป็น `createTag()`)
ก่อนเพิ่มฟังก์ชันใหม่ ให้ `grep` ชื่อนั้นก่อนเสมอ

**8.2 ห้ามให้ข้อมูลหายเงียบ ๆ** — ทุกครั้งที่เนื้อหา record เปลี่ยน (คนแก้เอง หรือซิงก์เอาของใหม่มาทับ)
ตัวเดิมต้องถูกเก็บเข้า `fs_recbak` ก่อนเสมอ ผ่าน `trackRecordVersions()` ที่เรียกจาก `saveRecordsStore()` ที่เดียว
ถ้าจะเพิ่มทางเขียน records ทางอื่น ต้องผ่าน `saveRecordsStore()` เท่านั้น ห้ามเขียน `localStorage.fs_records` ตรง ๆ

**8.3 การซิงก์ห้ามทับของที่ยังส่งขึ้นไม่เสร็จ และห้ามดันของเก่าขึ้นไปทับ** — คุมด้วย `recDirty()`
ซึ่งต้องคืน `false` เมื่อยังไม่มีฐานเทียบ (`sbSnap` ของงานใบนั้นยังไม่ถูกตั้ง เช่นเพิ่งเปิดหน้าเว็บ)
และ `SB_GUARD_MAX` กันเครื่องเดียวเขียนทับ "สูตร" หลายงานพร้อมกัน — ทั้งสองเคสนี้เคยทำข้อมูลจริงหายมาแล้ว

**9. อัปเดต build stamp บน header ทุกครั้งที่แก้** — ผู้ใช้ใช้ตัวนี้ยืนยันว่าได้เวอร์ชันใหม่แล้วหลัง hard refresh
