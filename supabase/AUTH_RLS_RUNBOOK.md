# Formula Studio Auth/RLS rollout runbook

เอกสารนี้เป็นขั้นตอนปฏิบัติสำหรับ System Owner, CODEOWNER และ Runtime Operator โดยไม่รวม secret หรือ production data งานนี้เป็น Critical Change และห้ามบุคคลเดียวทำ Code + Final Approve + Deploy

## ผู้รับผิดชอบ

| Gate | ผู้รับผิดชอบ | หลักฐานขั้นต่ำ |
| --- | --- | --- |
| Repository/settings | System Owner `@phossatron` | Private repo, collaborator, ruleset screenshot/URL |
| Code/schema review | CODEOWNER `@phossatron` หรือผู้แทนที่แต่งตั้ง | Approved PR, checks ผ่าน, rollback reviewed |
| Supabase staging/production | Supabase Owner | backup reference, SQL execution record, membership/UAT evidence |
| Release/deploy/rollback | Runtime / Platform Operator | immutable commit, time, health check, rollback target |
| Correlation | Hermes (read-only) | Task → PR → commit → release → deployment/incident |

## 1. GitHub one-time controls — System Owner

1. เปลี่ยน repository เป็น **Private** ก่อนนำข้อมูลภายในหรือ config เพิ่มเติมขึ้น GitHub
2. ให้สิทธิ์ Write แก่ development identity ที่อนุมัติ (ปัจจุบัน `piyawatv-cloud` มีเพียง Read) โดยไม่ให้ Admin/secret access
3. ยืนยันว่า `.github/CODEOWNERS` ชี้ critical paths ไปที่ `@phossatron`
4. สร้าง ruleset/branch protection สำหรับ `main`:
   - Require pull request และอย่างน้อย 1 approval
   - Require review from CODEOWNERS และ dismiss stale approvals
   - Require conversation resolution
   - Block force push และ branch deletion
   - จำกัด bypass ให้เฉพาะ break-glass ที่มี Incident ID
5. หลัง workflow นี้ merge ครั้งแรก ให้เพิ่ม required checks ชื่อ `Browser auth tests` และ `PostgreSQL RLS tests` (PR แรกใช้ผล local ที่ reviewer ตรวจได้ แล้วเปิด required checks ทันทีหลัง workflow อยู่บน default branch)

## 2. Supabase staging — Supabase Owner

1. สร้าง backup/restore point และบันทึก reference; ห้ามส่ง dump หรือ credential เข้า Issue/PR/prompt
2. ปิด public signup/anonymous sign-in ตาม Auth policy ขององค์กร
3. เชิญ Auth users ใน staging ผ่าน Dashboard ก่อน migration โดยใช้อีเมลให้ตรงกับ `fs_users.data.email`
4. ตรวจ PR, commit SHA และผล checks แล้วรัน `supabase/schema.sql` ทั้งไฟล์ใน staging SQL Editor
5. ตรวจว่าเฉพาะอีเมลที่ match ถูกสร้างใน `fs_memberships`; unmatched user ต้องไม่มีสิทธิ์
6. ผู้ใช้ใหม่หลัง migration ให้ Owner เพิ่ม membership จาก Auth user ที่มีอยู่แล้ว ตัวอย่างที่ต้องแทนค่าด้วยข้อมูลที่อนุมัติ:

```sql
insert into public.fs_memberships(user_id,name,role,active)
select id, '<approved-name>', '<approved-role>', true
from auth.users
where lower(email)=lower('<approved-email>');
```

7. ห้ามนำ `service_role`, secret key, database password หรือ user JWT ไปใส่ใน `index.html`; browser ใช้ได้เฉพาะ Project URL + publishable/anon key ภายใต้ RLS

## 3. Staging verification — Owner + Reviewer

รัน automated checks จาก clean checkout:

```sh
node harness.js
./tests/run-sql-tests.sh
```

ทำ UAT ด้วยบัญชี synthetic/staging แยก Role และเก็บเฉพาะ sanitized evidence:

- ไม่มี session: Data API ไม่ถูกเรียกและข้อมูล cache ถูก login overlay ปิด
- Admin: อ่าน activity และจัดการ membership ได้
- Sales: แก้งานของตนได้ แต่แก้งานของ Sales อื่น/ลบงานไม่ได้
- PD: แก้ `rows`/formula ได้ แต่แก้ customer/owner ไม่ได้
- RA/RD/Sales: เปลี่ยนได้เฉพาะ approval ของ Role ตน
- Non-Admin: append activity ของตนได้ แต่อ่าน/แก้ log ไม่ได้
- Logout/401/403: session ถูกล้างและต้อง login ใหม่
- Network loss หลัง login: แก้ local ได้ และ reconnect แล้ว merge โดยไม่เขียนทับ offline delta
- Chat: ส่งสองข้อความจากสอง session พร้อมกันแล้วต้องเห็นครบทั้งสองข้อความ; ส่ง event เดิมซ้ำต้องไม่สร้างข้อความซ้ำ
- Chat: เปลี่ยน approval ผ่าน RPC เท่านั้น, ชื่อผู้อนุมัติต้องเป็น membership จริง, และแก้สูตรแล้ว approval เดิมต้องถูกล้าง
- Chat: อ่านห้องแล้ว read marker ต้องเป็นของ user นั้นเท่านั้น; direct write ของ `fs_chats` จาก browser ต้องถูกปฏิเสธ

Reviewer ต้องตรวจว่า `fs_users.data.pass` ยังมี key แต่เป็น JSON `null`, anon ไม่มี table grants และไม่มี privileged credential ใน diff/log

## 4. Production rollout — Owner + Runtime Operator

ใช้ maintenance window เพราะ schema ต้อง secure ก่อน application Auth build:

1. Owner ยืนยัน approved PR/commit, backup และ staging UAT
2. Supabase Owner รัน `supabase/schema.sql` ที่ reviewed commit ใน production และบันทึกเวลา/ผู้รัน
3. Runtime Operator deploy เฉพาะ immutable approved commit ตาม `RUNTIME_OPERATIONS.md`
4. ตรวจ health endpoint/static page, login, membership, role-negative case และ sync status โดยไม่บันทึก token
5. บันทึก commit, PR, release/artifact, deployer/time, health evidence และ rollback target ให้ Hermes correlate

## 5. Rollback

ทางเลือกที่ปลอดภัยที่สุดคือ forward fix. ถ้าจำเป็นต้อง rollback:

1. Runtime Operator ย้อน application ไป approved commit ก่อนหน้า
2. Supabase Owner ใช้ `supabase/rollback_auth_rls.sql` เฉพาะเมื่อ Incident/approval อนุญาต
3. Rollback SQL ไม่ลบ table/data แต่ **เปิด anonymous CRUD แบบ legacy อีกครั้ง** จึงต้องจำกัดเวลา, เฝ้าระวัง และรีบกลับสู่ secure desired state
4. ตรวจ health/data count จาก sanitized evidence, revoke break-glass access และทำ post-incident review

## 6. Chat event store rollout

`supabase/schema.sql` เพิ่ม `fs_chat_events` และ `fs_chat_reads` แบบ additive และทำ legacy backfill แบบ rerunnable โดยคง `fs_chats` เป็น projection เดิมไว้

1. ทำ backup/restore point ก่อนรัน migration
2. รัน `supabase/schema.sql` ใน staging และตรวจจำนวน event ต่อห้องเทียบกับข้อความ/approval ใน `fs_chats`
3. ตรวจว่า browser role `authenticated` มีสิทธิ์อ่าน `fs_chats` แต่ไม่มี direct insert/update/delete และมีสิทธิ์ execute เฉพาะ RPC ที่กำหนด
4. ทำ concurrent Chat UAT อย่างน้อย 2 session และทดสอบ network loss/retry ของ outbox
5. เมื่อตรวจผ่านแล้ว Runtime Operator จึง deploy application commit เดียวกับ schema ที่อนุมัติ

Rollback ของ application สามารถย้อนกลับไปอ่าน projection `fs_chats` ได้ แต่การลบ event/read tables ต้องใช้ migration rollback ที่ผ่าน approval แยกต่างหากเท่านั้น

Codex ไม่มีอำนาจเปลี่ยน repository visibility/settings, รัน production SQL, final approve, merge หรือ deploy
