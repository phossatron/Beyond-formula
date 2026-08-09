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

**8. รหัสผ่านในระบบนี้ไม่ใช่ระบบความปลอดภัยจริง** — `pwHash()` เป็นแค่การอำพรางฝั่ง client เก็บใน localStorage
ห้ามนำไปใช้เก็บข้อมูลลับ และห้ามโฆษณาว่าปลอดภัย

**9. อัปเดต build stamp บน header ทุกครั้งที่แก้** — ผู้ใช้ใช้ตัวนี้ยืนยันว่าได้เวอร์ชันใหม่แล้วหลัง hard refresh
