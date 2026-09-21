# Formula Studio — Architecture Registry

สถานะ: working registry; ใช้บันทึก decision ที่ผู้มีอำนาจยืนยันแล้ว

## Decision 1 — Owner ของ `central_job_id`

สถานะ: **CONFIRMED**
วันที่ยืนยัน: 2026-09-18
ผู้ยืนยัน: Project Owner ผ่านบทสนทนานี้

### ข้อตกลง

- `central_job_id` เป็น shared job reference ที่ **Central Job & Activity Core** เป็น Owner
- Formula Studio เป็นเจ้าของเฉพาะ local Formula record และ Formula domain logic
- Formula ต้องเก็บ local ID เดิม เช่น `A00001` ต่อไป
- Mapping ที่ต้องรองรับ:

```text
central_job_id   ↔ local_job_id (เช่น A00001) ↔ source_system=formula
```

- Formula ห้ามสร้าง master `central_job_id` เองเมื่อ Central Job Core มี authority แล้ว
- Formula ห้ามอ่านหรือเขียน Central Job database โดยตรง
- ระหว่างที่ mapping ยังไม่พร้อม ให้ใช้สถานะ `PENDING_MAPPING`
- การผูก owner/assignee กับผู้ใช้กลางจริงต้องรอ Central User Management ออก `central_user_id` และ permission contract

### ผลกระทบที่ยอมรับ

- ระยะนี้แก้เฉพาะเอกสารและ contract; ไม่เปลี่ยน application source, localStorage, Supabase schema หรือ runtime
- Implementation ในอนาคตต้องเป็น additive, backward-compatible และ idempotent
- การเปิด integration จริงต้องผ่าน User Management readiness, contract tests, UAT และ Critical Change governance

## Decision 2 — แหล่งอ้างอิงตัวตนผู้ใช้สำหรับ Formula pilot

สถานะ: **CONFIRMED FOR PILOT**
วันที่ยืนยัน: 2026-09-18
ผู้ยืนยัน: Project Owner ผ่านคำสั่งงานต่อยอด

### ข้อตกลง

- Formula pilot ใช้ **OPC Workflow** เป็นแหล่งอ้างอิงตัวตนผู้ใช้สำหรับ mapping
- ชุดตั้งต้นอ้างอิงจากแท็บ `OPC System Users` ใน Google Sheet ที่ผู้ใช้ระบุ และต้องอ่านแบบ read-only
- ห้ามคัดลอกชื่อ, email, OPC user ID หรือข้อมูลบุคคลจริงจาก Sheet ลง source, test fixture, log หรือ repository
- Supabase ไม่ใช่ mapping source ใน pilot นี้
- Supabase Auth/RLS ยังคงเป็น security boundary ของ Formula ในช่วงที่ feature flag ถูกปิดและระหว่าง transition; OPC reference ห้ามใช้เป็น authorization bypass
- Feature flag ต้องปิดเป็นค่าเริ่มต้น และการเปิดใช้จริงต้องผ่าน approved OPC adapter, synthetic tests, UAT และ owner/security review

### ขอบเขต

ข้อตกลงนี้เป็น pilot integration decision สำหรับ Formula เท่านั้น ไม่ได้เปลี่ยน owner ระยะยาวของ Central IAM โดยอัตโนมัติ และยังไม่อนุญาตให้ deploy production

## Pending decisions

- Owner ของ `central_user_id`
- Owner ของ Formula ID/revision
- Owner และ contract ของ OPC handoff
- Canonical Formula stage/status
- Contract versioning, acknowledgement, retry และ idempotency authority
