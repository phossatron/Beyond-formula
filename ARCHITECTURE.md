# โครงสร้างโปรเจกต์ — Formula Studio

แผนที่ของ repo สำหรับคนที่ต้องเข้ามาแก้ไข · อ่านคู่กับ [README.md](README.md) (ฟีเจอร์ที่ผู้ใช้เห็น) และ [CLAUDE.md](CLAUDE.md) (กฎที่ห้ามละเมิด)

> **เลขบรรทัดในเอกสารนี้เปลี่ยนได้ทุกครั้งที่แก้ไฟล์** — ให้ค้นด้วย *ข้อความหัวข้อ* ที่ระบุไว้แทน เช่น `grep -n "SUPABASE SYNC" index.html`

---

## 1. ไฟล์ใน repo

| ไฟล์ | หน้าที่ |
|---|---|
| **`index.html`** | **ตัวแอปทั้งหมด** — HTML + CSS + JS วานิลลาในไฟล์เดียว ~7,800 บรรทัด ไม่มี build step |
| `supabase/schema.sql` | สคีมาเซิร์ฟเวอร์กลาง — ตาราง, ดัชนี, ฟังก์ชันแจกเลขงาน, trigger `updated_at` |
| `vercel.json` | ตั้ง `Cache-Control: max-age=0, must-revalidate` ให้ `index.html` เพื่อให้ hard refresh ได้เวอร์ชันใหม่จริง |
| `README.md` | คู่มือฟีเจอร์สำหรับผู้ใช้และผู้ดูแล |
| `CLAUDE.md` | กฎการแก้ไขโปรเจกต์ — **อ่านก่อนแตะโค้ดเสมอ** |
| `formula_brief_template.xlsx` | เทมเพลต Excel สำหรับกรอกงานเดียว (ผู้ใช้ดาวน์โหลดจากหน้า Customer Data) |
| `formula_brief_multi_job_template.xlsx` | เทมเพลตแบบหลายงานในไฟล์เดียว (bulk import) |
| `example_export_A00001.xlsx` | ตัวอย่างไฟล์ที่ระบบ Export ออกมา ใช้เทียบเวลาปรับคอลัมน์ |
| `print_test.html` | หน้าทดสอบการพิมพ์ (ไม่ได้ deploy) |

**ไม่มีใน repo แต่ต้องรู้:** `harness.js` + `test.html` (ชุดเทสต์) อยู่นอก repo — ดูหัวข้อ [เทสต์](#7-เทสต์และการ-deploy)

---

## 2. กายวิภาคของ `index.html`

ไฟล์เดียวแบ่งเป็น 3 ท่อนใหญ่:

```
บรรทัด ~10-713     <style>    CSS ทั้งหมด
บรรทัด ~715-1233   markup     แถบซ้าย + 5 หน้าจอ + ป๊อปอัพ
บรรทัด ~1234-7841  <script>   ตรรกะทั้งหมด
```

### 2.1 CSS — หัวข้อที่มีป้ายกำกับ

ค้นด้วย `/* ===== ชื่อหัวข้อ ===== */`

`CHAT MESSAGE` · `JOB DETAIL` · `IMPERSONATE + ACTIVITY LOG` · `ROLES` · `DASHBOARD STAT CARDS` · `DASHBOARD`

สีหลักอยู่ที่ `:root` ด้านบนสุด — `--or` ส้มหลัก · `--os` ส้มงาน Oversea · `--grd` เขียวเข้ม "ฝ่ายเรา Pass แล้ว" · `--gr` เขียวอนุมัติ · `--re` แดง

### 2.2 Markup — 5 หน้าจอ

ทุกหน้าจอเป็น `<div class="view">` สลับด้วย `switchView()` ทีละอัน

| id | เมนู | ใครเข้าได้ |
|---|---|---|
| `inputView` | Customer Data | Admin · Sales · Oversea · OPC · MKT |
| `dashView` | Dashboard | ทุก Role (หน้าเริ่มต้น) |
| `modifyView` | PD Modify Data | ทุก Role เห็น · แก้ได้เฉพาะ Admin · PD · MKT |
| `chatView` | Chat Message | ทุก Role |
| `actView` | Activities log | Admin |

ป๊อปอัพใช้ร่วมกัน 2 ตัว: `#gModal` (ป๊อปอัพอเนกประสงค์) และ `#userModal` (จัดการผู้ใช้)

### 2.3 JavaScript — แผนที่หัวข้อตามลำดับในไฟล์

ค้นด้วย `// ========== ชื่อหัวข้อ ==========`

| หัวข้อ | เนื้อหา |
|---|---|
| `THAI FDA DATABASE` | ฐานข้อมูลสารตามประกาศ อย. — ใช้ตรวจว่าสารเกินขนาดหรือไม่ (`checkFDA()`) |
| `STATE` | ตัวแปรของฟอร์มหน้า Customer Data (`rows`, `selectedConcepts`) |
| `INGREDIENT DB` · `CONCEPT KNOWLEDGE BASE` | คลังสารและคอนเซปสำเร็จรูปที่ใช้เติมฟอร์มอัตโนมัติ |
| `NAVIGATION` | `switchView()` — ด่านแรกของการกันสิทธิ์เข้าหน้าจอ |
| `TAGS` (ในฟอร์ม) | ป้ายสรรพคุณ/ข้อจำกัดในฟอร์ม — **คนละตัวกับ Tag ของงาน** |
| `INGREDIENT TABLE` · `GET ROW DATA` | ตารางสารในฟอร์มสร้างงาน |
| `GENERATE DASHBOARD` | `generateDash()` — สร้าง/อัปเดต record จากฟอร์ม จุดตรวจความครบถ้วนทั้งหมดอยู่ที่นี่ |
| `RENDER DASHBOARD` | วาดสรุปงานจาก record หนึ่งใบ |
| `USER SYSTEM` | ผู้ใช้ · Role · สิทธิ์ · Login · สวมบทบาท · Activities log · Tag ของงาน |
| `MODIFY DATA` | หน้า PD Modify Data — ตารางสูตรแก้ได้ + บันทึกหลังปรับสูตร |
| `ตัวช่วยกันสูตรที่กำลังพิมพ์หาย` | `fxSnapFocus()` / `fxRestoreFocus()` / `fxMark()` — กฎ 8.4 |
| `CUSTOMER DATA RECORDS` | โหลด/บันทึก records · ประวัติเวอร์ชัน · ตัวออกรหัสงาน |
| `การ์ดสรุปสถานะหน้า Dashboard` | 6 การ์ด (ทั้งหมด · รออนุมัติ · อนุมัติแล้ว · Export · Close job · Reject) + ตัวกรอง (ช่วงวันที่ · ผู้สร้าง · Tag · สถานะ) |
| `POPUP กลาง` | ป๊อปอัพรายละเอียดงาน · แก้รายหมวด · ลบงาน · ประวัติเวอร์ชัน |
| `CHAT MESSAGE` | ห้องแชท · เมนูรหัสงานด้านซ้าย · การอนุมัติ · แก้สูตรในแชท · Reject · ปิดงาน · Export |
| `EXCEL IMPORT / EXPORT` · `TEMPLATE DOWNLOAD` · `BULK IMPORT` | งานไฟล์ Excel ทั้งหมด (ใช้ SheetJS จาก CDN) |
| `PRINT` · `COPY BRIEF` · `MOBILE PDF` | ส่งออกแบบอื่น |
| `SUPABASE SYNC` (ท้ายไฟล์) | ซิงก์กับเซิร์ฟเวอร์กลางทั้งหมด |

---

## 3. ข้อมูลอยู่ที่ไหน

### 3.1 ในเครื่องผู้ใช้ (localStorage)

**ชื่อ key และรูปร่างข้อมูลถูกล็อกไว้ ห้ามเปลี่ยน — ดู CLAUDE.md กฎข้อ 1**

| key | ตัวแปรในโค้ด | เก็บอะไร | ขึ้นเซิร์ฟเวอร์ |
|---|---|---|---|
| `fs_records` | `records[]` | ชุดข้อมูลงานทั้งหมด (รวมสูตรใน `rows[]`) | ✅ |
| `fs_reccounter` | `recCounter` | ตัวนับเลขรันของรหัสงาน | ✅ |
| `fs_chats` | `chats[]` | ห้องแชท ข้อความ ผู้ร่วม สถานะอนุมัติ | ✅ |
| `fs_userlist` | `userList[]` | ผู้ใช้ + Role + อีเมล + รหัสผ่าน (hash) | ✅ |
| `fs_activities` | `activities[]` | บันทึกทุกการกระทำ (append only) | ✅ |
| `fs_tags` | `tagList[]` | นิยาม Tag ของงาน | ✅ (ใน `fs_meta`) |
| `fs_user` | `currentUser` | ใครล็อกอินอยู่ | ❌ สถานะของเครื่องนี้ |
| `fs_imp` | `impersonator` | Admin ตัวจริงระหว่างสวมบทบาท | ❌ สถานะของเครื่องนี้ |
| `fs_recbak` | `recBak{}` | ประวัติเวอร์ชันของงาน (12 เวอร์ชันล่าสุดต่องาน) | ❌ **ห้ามซิงก์** |

### 3.2 บนเซิร์ฟเวอร์ (Supabase / PostgREST)

เก็บ object **รูปทรงเดิมทั้งก้อน** ในคอลัมน์ `data jsonb` — ไม่แตกฟิลด์เป็นคอลัมน์
ทำให้เพิ่มฟิลด์ใหม่ในแอปได้โดยไม่ต้องแก้ฐานข้อมูล

| ตาราง | คีย์ | มาจาก |
|---|---|---|
| `fs_records` | `id` | `records[]` |
| `fs_chats` | `job_id` | ข้อมูลห้อง (ไม่รวมข้อความ) |
| `fs_messages` | `uid` | ข้อความทีละข้อความ — สองคนส่งพร้อมกันไม่ทับกัน |
| `fs_approvals` | `job_id` + `part` | สถานะอนุมัติทีละฝ่าย |
| `fs_users` | `name` | `userList[]` |
| `fs_activities` | `uid` (+`ts`) | `activities[]` — append only |
| `fs_meta` | `key` | `reccounter` และนิยาม Tag ที่ key `tags` |

**`fs_next_rec_seq()`** = ฟังก์ชันบนเซิร์ฟเวอร์ที่แจกเลขงานแบบ atomic สองเครื่องกดสร้างพร้อมกันไม่มีทางได้เลขซ้ำ

---

## 4. ระบบย่อยที่ต้องรู้จัก

### 4.1 สิทธิ์ผู้ใช้

นิยามอยู่ที่ตัวแปร **`ROLES`** ที่เดียว — เพิ่ม Role ใหม่แก้ที่นี่จุดเดียว

```
ROLES = { admin, pd, ra, rd, sales, oversea, opc, mkt, purchasing }
        แต่ละตัวมี { label, desc, can:{...} }
```

ความสามารถ (`can`): `createData` · `editFormula` · `chat` · `approve` · `export` · `manageUsers` · `deleteChat` · `closeJob` · `ownOnly`

ตรวจสิทธิ์ผ่าน **`can(cap)`** / **`requirePerm(cap, ข้อความ)`** / **`canApprove(key)`** เท่านั้น
ตัวช่วยที่เกี่ยวข้อง: `isSalesRole()` (Sales · Oversea · MKT) · `visibleRecords()` / `canSeeRecord()` (`ownOnly`) · `myPassDone()` (เลขงานเขียวในเมนูซ้าย)

> **กฎ 7:** เมนูที่จำกัด Role ต้องกัน 3 ชั้น — ซ่อนปุ่ม + กันตอนเปิด + กันในฟังก์ชันที่ลงมือทำจริง

### 4.2 การซิงก์ — ท่อนที่เปราะที่สุดของระบบ

```
sbBoot()  ──► ดึงทั้งหมดครั้งแรก ตั้ง sbSnap เป็นฐานเทียบ ตั้ง sbReady
   │
   └─► sbSchedule() ──► sbTick() ──► sbCycle()
                                        │
                                        ├─ sbPush()   ส่งเฉพาะสิ่งที่ต่างจาก sbSnap  (เฉพาะเมื่อ sbReady)
                                        └─ sbPull()   ดึงลง แล้ว sbApply() → sbApplyFull / sbApplyDelta
```

| ตัวแปร/ฟังก์ชัน | หน้าที่ |
|---|---|
| `sbSnap` | สำเนา "ของบนเซิร์ฟเวอร์ครั้งล่าสุดที่เรารู้" — เป็นฐานเทียบทั้งขาส่งและขารับ |
| `sbReady` | เคยดึงข้อมูลลงมาสำเร็จหรือยัง · **`false` = ห้ามส่งขึ้นเด็ดขาด** (กฎ 8.5) |
| `recTouched` | งานที่คนในเครื่องนี้แก้จริง — ของที่ไม่มีฐานเทียบและไม่ถูกแตะ ห้ามส่งขึ้น (กฎ 8.5) |
| `recDirty(r)` | แก้ในเครื่องแล้วยังส่งไม่เสร็จ → ห้ามให้เซิร์ฟเวอร์ทับ · **คืน `false` เมื่อไม่มีฐานเทียบ** (กฎ 8.3) |
| `stableStr()` | เรียงคีย์ก่อน serialize — กัน jsonb สลับลำดับคีย์แล้วดูเหมือนข้อมูลเปลี่ยน |
| `SB_GUARD_MAX` | เบรกฉุกเฉิน — เขียนทับ **สูตร** เกิน 3 งานพร้อมกันให้หยุดถามก่อน |
| `sbPendMsg` | ข้อความที่ห้องยังมาไม่ถึง เก็บไว้ลองใหม่รอบหน้า ไม่ทิ้ง |

จังหวะดึงปรับตามการใช้งาน: `SB_POLL_MS` 3 วิ (กำลังคุยกัน) → `SB_IDLE_MS` 10 วิ → `SB_SLEEP_MS` 30 วิ · ดึงทั้งหมดทุก `SB_FULL_MS` 1 นาที

### 4.3 ตาข่ายกันข้อมูลหาย

ทั้งหมดนี้มีเพราะ**เคยทำข้อมูลจริงหายมาแล้ว** — อย่าถอดออก

| กลไก | ทำอะไร | กฎ |
|---|---|---|
| `trackRecordVersions()` | เก็บเวอร์ชันก่อนหน้าทุกครั้งที่เนื้อหางานเปลี่ยน ผูกไว้ที่ `saveRecordsStore()` ที่เดียว | 8.2 |
| `restoreRecord()` | กู้เวอร์ชันเก่ากลับ (Admin · PD · MKT) กู้แล้วยังกู้กลับได้อีก | 8.2 |
| `recDirty()` | กันเซิร์ฟเวอร์ทับของที่ยังส่งขึ้นไม่เสร็จ | 8.3 |
| `sbGuardHold()` | เบรกฉุกเฉินกันเขียนทับหมู่ | 8.3 |
| `fxSnapFocus/RestoreFocus` | กันค่าที่พิมพ์ค้างในตารางสูตรหายตอนหน้าจอวาดใหม่ | 8.4 |
| `sbReady` + `recTouched` | กันเครื่องที่ยังไม่มีฐานเทียบดันสำเนาเก่าขึ้นไปทับ | 8.5 |

---

## 5. ทางเดินของข้อมูล

```
Sales กรอกฟอร์ม
      │  generateDash()
      ▼
  records[]  ──► saveRecordsStore() ──┬─► localStorage 'fs_records'
                                      ├─► trackRecordVersions() ──► 'fs_recbak'
                                      └─► sbQueue() ──► sbCycle() ──► เซิร์ฟเวอร์
      │
      ├─► Dashboard (ตาราง + การ์ดสรุป + ตัวกรอง)
      ├─► PD Modify Data (แก้สูตร)
      └─► Chat Message ──► แก้สูตร / อนุมัติ 4 ฝ่าย ──► Export Excel
```

**ทางเขียน `records` มีทางเดียวคือ `saveRecordsStore()`** — ห้ามเขียน `localStorage.fs_records` ตรง ๆ (กฎ 8.2)

---

## 6. จะแก้เรื่องนี้ ต้องไปดูตรงไหน

| อยากทำ | ไปที่ |
|---|---|
| เพิ่ม/แก้สิทธิ์ Role | ตัวแปร `ROLES` + ตัวเลือกใน `#newUserRole` + สี `.role-badge.<role>` |
| เพิ่มฟิลด์ใหม่ในงาน | ฟอร์มใน `inputView` → `generateDash()` → `jobDetailHTML()` → **ต่อท้าย** `CHAT_XLS_HEAD` (กฎ 4) |
| เพิ่มคอลัมน์ Export | `CHAT_XLS_HEAD` + จุดที่ประกอบแถว — **ต่อท้ายเท่านั้น** ห้ามแทรกกลาง |
| แก้หน้าตา Dashboard | `renderRecordsList()` · `dashStats()` · CSS หัวข้อ `DASHBOARD` |
| แก้ตัวกรอง | `matchStatFilter()` · `matchTagFilter()` · `matchUserFilter()` · `normUserFilter()` |
| แก้เรื่องอนุมัติ | `CHAT_PARTS` · `toggleChatApprove()` · `approveOn()` / `approveOff()` |
| แก้ตารางสูตรในแชท | `chatFormulaEditorHTML()` · `chatApplyIng()` · `chatIngEdit()` · `saveChatFormula()` |
| แก้ตารางสูตรหน้า PD | `renderModify()` · `editIng()` · `applyIngToRecord()` · `saveModifyFormula()` |
| แก้การซิงก์ | หัวข้อ `SUPABASE SYNC` — **อ่านกฎ 8.3 และ 8.5 ก่อนเสมอ** |

---

## 7. เทสต์และการ deploy

**เทสต์** — `harness.js` อ่าน `index.html` → ตัดค่า `SB_URL`/`SB_KEY` ออก (เทสต์ต้องไม่แตะฐานข้อมูลจริง) → ฝังชุดทดสอบต่อท้าย → เขียนเป็น `test.html` พร้อมเซิร์ฟเวอร์ Supabase จำลองในหน่วยความจำ

```
node harness.js
chrome --headless --dump-dom test.html      # ต้องผ่าน 100% และ console ไม่มี error
```

**Deploy** — push ขึ้น GitHub แล้ว Vercel build ให้เอง (ไม่มี build step จริง แค่เสิร์ฟไฟล์)

**ยืนยันว่าได้เวอร์ชันใหม่** — ดู build stamp บน header · **ต้องอัปเดตทุกครั้งที่แก้** (กฎ 9) · ผู้ใช้ต้อง hard refresh (`Cmd/Ctrl + Shift + R`)

---

## 8. ข้อควรระวังด้านความปลอดภัย

- **`pwHash()` ไม่ใช่ระบบความปลอดภัยจริง** — เป็นแค่การอำพรางฝั่ง client เก็บใน localStorage ห้ามใช้เก็บข้อมูลลับ และห้ามโฆษณาว่าปลอดภัย (กฎ 8)
- **คีย์ Supabase ที่ฝังใน `index.html` เป็น publishable key ที่อ่าน/เขียนข้อมูลได้ทั้งหมด** — ใครที่เข้าถึงไฟล์ได้ ก็เข้าถึงข้อมูลได้ **ควรตั้ง repo เป็น private**
- **ห้ามใส่ `service_role` / secret key ลงในไฟล์นี้เด็ดขาด**
- รหัสผ่านเริ่มต้นของทุกคนคือค่าเดียวกัน — ให้ทุกคนเปลี่ยนตั้งแต่เข้าใช้ครั้งแรก
