# Beyond Formula — PR #2 Rework on Current Main

## Goal

นำความสามารถที่จำเป็นจาก PR #2 มาปรับเข้ากับ `origin/main` ปัจจุบันซึ่งรวม PR #3 แล้ว โดยคงฟีเจอร์ปัจจุบันทั้งหมด ป้องกันข้อมูลรั่วจาก local runtime และทำให้ Auth/RLS เป็น optional secure mode ที่เปิดใช้งานได้เมื่อมีการตั้งค่าที่ได้รับอนุมัติ

## Scope

### In scope

- คงช่องค้นหา Chat จาก PR #3 และฟีเจอร์ปัจจุบันบน `main` ทั้งหมด เช่น Tag, Reject, version recovery, Oversea และสูตร/แชทเดิม
- Port เฉพาะ secure Supabase Auth + active membership authorization ที่จำเป็นจาก PR #2
- Port server sync hardening ที่แก้ 401/403, token refresh, local-first preservation, activity deduplication และ rejected outbox handling
- Port additive Chat event store/RPC สำหรับ secure mode โดยให้ `fs_chats` เป็น backward-compatible projection
- Port optional private workspace loader, CSP enforcement และ session/identity fencing โดย default disabled
- Port idempotent Supabase schema, RLS policies, focused SQL tests และ rollback script
- เพิ่ม deterministic browser harness และ CI checks ให้กับ current main
- ปรับ local runtime ให้เสิร์ฟเฉพาะ generated `runtime/site/index.html` ไม่เสิร์ฟ repository root

### Out of scope

- รัน migration หรือแก้ข้อมูลใน production Supabase
- เปิดใช้ workspace API โดยฝังค่า production origin หรือ secret ใน source
- Port OPC directory adapter จาก PR #2 ในรอบนี้ เพราะเป็น integration เพิ่มเติมที่ไม่จำเป็นต่อ Auth/RLS และ workspace core
- เปลี่ยนชื่อตาราง, localStorage key, field, object type หรือ locked JSON contract
- เปลี่ยน branch protection, IAM, secret manager หรือ deploy Vercel

## Source of truth and ownership

- Application source และ schema: GitHub branch/PR ที่จะสร้างจาก `origin/main`
- Browser data contract: `CLAUDE.md` locked localStorage and JSON contract
- Runtime release: approved immutable commit, generated site artifact, Runtime Operator
- Critical review: independent CODEOWNER review by `@phossatron`; author cannot final-approve own change

## Acceptance criteria

1. Current main behavior and PR #3 search behavior remain available after the rework.
2. Local-only mode works without Supabase/Auth/workspace origin and does not issue secure-mode requests.
3. Secure mode requires Supabase Auth plus active `fs_memberships`; legacy browser password state is not used as server authorization.
4. 401 clears the session; 403 remains an authorization denial and does not destroy a valid session.
5. Role checks remain enforced in UI, view entry, and mutating functions; server RLS/guards remain authoritative.
6. Offline local data is not cleared or overwritten during auth/bootstrap/sync; rejected permanent writes are retained in a visible dead-letter path.
7. Chat event writes use the event RPC in secure mode and clear local outboxes only after successful server acknowledgement.
8. Workspace loader is disabled by default, validates HTTPS/origin/CSP, uses the current session bearer only, and tears down on logout, token, identity, membership, role, mode, or origin changes.
9. Schema is idempotent in isolated PostgreSQL tests, RLS tests cover anonymous, inactive, unknown, role, actor-spoofing, append-only and rollback cases, and no production database is touched.
10. Runtime deployment refuses dirty source, generates `runtime/site/index.html` from the approved commit, serves only that directory on `127.0.0.1:4173`, and healthcheck verifies the generated artifact.
11. `node harness.js`, `LC_ALL=C ./tests/run-sql-tests.sh`, runtime checks, and `git diff --check` pass on the feature branch.

## Risks and mitigations

| Risk | Mitigation | Owner/gate |
|---|---|---|
| Single-file merge drops current main features | Start from `origin/main`; test feature fingerprints and review full diff | Development + CODEOWNER review |
| Auth/RLS mismatch blocks or exposes writes | Keep server role authority, run isolated SQL matrix, no production migration | Supabase owner + independent review |
| Local runtime exposes repository files | Generated dedicated `runtime/site` root and root safety check | Runtime Operator |
| Workspace bundle exfiltrates session/local data | CSP, origin pinning, no default origin, teardown fencing | Security/CODEOWNER review |
| Local-first data loss during sync | Preserve snapshots/outboxes, test 401/403/offline/rejected writes | QA/UAT |

## Release boundary

This work may prepare a branch, tests, schema, runtime scripts and PR evidence. It must stop before production database migration, production secret use, Vercel deploy, or local runtime restart until independent review and Runtime Operator approval are recorded.
