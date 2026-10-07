# Debug log

## 2026-09-05 — Private workspace session isolation

- Task: Beyond Science OS / approved ticket 2; issue: [opc-workflow #5](https://github.com/piyawatv-cloud/opc-workflow/issues/5).
- Candidate: local changes on `feat/formula-science-workspace-loader`, baseline `3a9c32d`.
- Classification: Critical authorization change. Local synthetic browser and throwaway SQL only.
- Allowed: generic loader in `index.html`, focused browser tests, this evidence. Forbidden: existing feature behavior/storage contracts, production, secrets, schema/deployment, unrelated working files.
- Owner/reviewer: System Owner / CODEOWNER `@phossatron`; independent agent QA is supporting evidence, not final approval.

### Reproduction and first failure

`node harness.js` executes the actual application in headless Chrome with synthetic fetch responses and session identities. Deferred responses make concurrency deterministic without time-based sleeps.

Before the source fix, the expanded suite returned **38 passed / 5 failed**. An active `sales` membership sent one request; a pending bundle could recreate state after a token/identity change; a late mount handle retained a listener; an old 403 response removed the newer workspace. The logout test also demonstrated that requests carried no abort signal. Existing mode-change behavior passed.

QA then identified that an active membership could belong to the previous principal. Added missing/mismatched membership identity cases failed **45 passed / 1 failed**, requesting a manifest with no matching membership identity. The preflight now requires equality between membership `user_id` and session `user.id`.

### Cause and change

The loader trusted mutable global session state across awaits, used only version/mode as its reuse key, and had no ownership fence for cleanup. Preflight did not check membership or deny roles locally.

Each load now captures principal, token, origin, role, and membership identity, owns an AbortController, and rechecks ownership and context after every asynchronous boundary. Logout cancels pending work even before DOM exists. Stale errors cannot remove a successor's state. A late async mount handle is destroyed instead of attached; cooperative bundles receive an abort signal. State removal detaches its handle before invoking cleanup to make teardown reentrant. Token or membership changes trigger additive teardown hooks. Reuse also requires the captured context. The exported `mount`/`default` contract replaces the global fallback, which could carry an earlier bundle's function across sessions.

Local preflight requires a real session principal and matching active membership in `rd`, `ra`, or `admin`; all still need server authorization. No browser role grants content access. Denied/unknown roles and missing, inactive, or mismatched memberships send zero requests. No schema, stored-data, dependency, or permission expansion occurs. Header build stamp is `2026-09-05.2`.

### Verification

- `node harness.js`: **48/48 PASS**. Coverage includes exact whole-document before/after snapshots for disabled/denied states; logout at manifest response/body, bundle body, dynamic import, and async mount; token/principal/role/origin/local-mode change; equal-version context and mode replacement; stale denial/rejection; immediate token-update teardown; listener/handle cleanup; existing application flows.
- `LC_ALL=C ./tests/run-sql-tests.sh`: exit 0, **PASS SQL authorization and rollback contract**. Throwaway cluster only; no schema changes.
- `git diff --check`: exit 0.
- Local raw receipts: `/tmp/formula-issue5-red.json`, `/tmp/formula-issue5-membership-red.json`, `/tmp/formula-issue5-final.json`, `/tmp/formula-issue5-sql.log`. They are transient and not release evidence by themselves.

### Remaining gates and rollback

This is local G4 evidence, not UAT/release approval. Independent QA and CODEOWNER review remain required before higher gates; no PR was opened, merged, or deployed by this change. The approved origin remains unconfigured. Same-origin imported code can execute its module body before an outstanding import settles, and uncooperative bundle code can escape the host DOM; the existing CSP/sandbox architecture decision remains with the System Owner. Loader fencing does not claim to sandbox trusted modules.

Rollback: revert the eventual isolated change commit through normal review, retaining feature origin disabled. There are no data/schema changes to reverse. Do not reset the shared checkout or touch unrelated files.

## 2026-09-05 — Authenticated transport for the additive workspace

Issue: [opc-workflow #7](https://github.com/piyawatv-cloud/opc-workflow/issues/7), local Critical authorization change on top of #5. Only the generic loader and its tests change; task-specific UI remains in the private repository's emitted bundle.

The bundle previously received no API transport. It now receives `options.request(path, {method, body})`, limited to GET/POST under `/api/private-workspaces/` on the captured approved origin. The loader supplies its captured bearer token internally, omits cookies, disables caching and redirects, and checks workspace ownership/session again after response and JSON awaits. No token is passed to bundle options. Removed handles cannot issue requests. 401/403/404 withdraw the workspace; stale requests cannot remove a successor. The 404 case matters because private APIs deliberately conceal authorization denial as not found.

Focused browser tests failed before implementation **48 passed / 2 failed** (missing transport). QA's 404 regression then failed **49 passed / 1 failed**, and now passes after unavailable-status cleanup. Final `node harness.js`: **50/50 PASS**; `LC_ALL=C ./tests/run-sql-tests.sh`: **PASS**, `git diff --check`: clean. Header build stamp `2026-09-05.3`. Receipts: `/tmp/formula-issue7-final.json`, `/tmp/formula-issue7-sql.log`.

Rendered evidence uses sanitized actual Formula HTML, its real loader, the emitted private workspace bundle, synthetic responses, and the existing showcase's licensed embedded fonts. Noto Sans Thai 400/500/700 and Roboto 400/500 all loaded; computed inherited font stack matches Formula. Screenshots: `/tmp/science-formula-host-1440.png`, `-390.png`, `-360.png`; metrics `/tmp/science-formula-host-evidence.json`, reproduction `/tmp/science-formula-host.mjs`. No external requests or page errors. This is local visual verification, not UAT. The private repository has separate real-handler/application-role PostgreSQL integration evidence.

No schema/storage/dependency or existing feature-flow changes. Rollback is a reviewed revert of this isolated change with origin disabled. Independent QA and CODEOWNER approval remain separate; no merge, release, production access or deployment. Same-origin bundle/CSP isolation remains an owner decision; transport fencing does not sandbox module code.

## 2026-09-25 — ช่องค้นหารหัสงานหน้าแชท: พิมพ์อยู่แล้วข้อความหาย / รายการปิดเอง
รายงานโดย: ผู้ใช้ (ทดลองใช้ build 2026-09-19.1 บน branch `feat/chat-job-search`)
อาการ: พิมพ์คำค้นในช่องค้นหารหัสงาน แล้วข้อความหายหรือเด้งกลับเป็นชื่อห้องเดิม รายการผลค้นหาปิดเอง และช่องหลุด focus
ทำให้เกิดซ้ำ: เปิดหน้า Chat → พิมพ์ในช่องค้นหา → เรียก `sbRerender()` (sync ทุก 5 วินาทีเรียกเมื่อมีข้อมูลใหม่จากเซิร์ฟเวอร์) → คำค้นหาย (เทสต์ใหม่พัง 60/2 ก่อนแก้)
สาเหตุจริง (มี 2 ชั้น):
1. `index.html` `sbRerender()` วาดหน้าแชทใหม่ด้วย `innerHTML` และเก็บค่าไว้เฉพาะ `#chatInput` ทำให้ `#chatPickInput` ถูกสร้างใหม่ด้วยค่าเริ่มต้น
2. ช่องเดิมที่ถูกถอดออกยิง `blur` → `setTimeout(chatPickClose,150)` ซึ่งไปปิดรายการของช่องใหม่ (หา element จาก id) แม้ผู้ใช้ยัง focus อยู่
แก้อย่างไร: `sbRerender()` เก็บและคืนค่า value/selection/focus ของ `#chatPickInput` (focus กลับจะเรียก `chatPickFilter()` เปิดรายการตามคำค้นเอง) และ onblur เรียก `chatPickBlur()` ที่ปิดรายการเฉพาะเมื่อช่องค้นหาไม่ได้ focus อยู่จริง · build stamp `2026-09-25.1`
test ที่เพิ่ม: `sync ต้องไม่ล้างคำค้นในช่องค้นหารหัสงาน` ทั้งหน้ารายการแชทและในห้องแชท (รอเลย 150ms เพื่อจับชั้นที่ 2) · ก่อนแก้ 60 ผ่าน / 2 พัง → แก้ชั้น 1 แล้วยังพัง 2 (รายการปิดเอง) → หลังแก้ครบ `node harness.js` 62/62 ผ่าน, `./tests/run-sql-tests.sh` ผ่าน
ผลกระทบอื่น: ไม่แตะโครงสร้างข้อมูลหรือ storage · `chatPickClose()` ที่ใช้กับ Escape/เลือกรายการยังปิดทันทีเหมือนเดิม · เรื่อง sync ข้ามแท็บที่ค้างไว้ ปิดแล้วในเคสถัดไป

## 2026-09-25 — แท็บอื่นแก้แชทแล้วข้อความที่พิมพ์ค้างหาย + กันเกิดซ้ำทั้งตระกูล
รายงานโดย: งานค้างจากเคสก่อนหน้า (พบระหว่างไล่ช่องค้นหารหัสงาน)
อาการ: เปิดแอปหลายแท็บ เมื่อแท็บอื่นแก้ `fs_chats`/`fs_records` ข้อความที่พิมพ์ค้างในห้องแชทและคำค้นหายพร้อมหลุด focus
ทำให้เกิดซ้ำ: พิมพ์ใน `#chatInput` → ยิง `StorageEvent('storage',{key:'fs_chats'})` → ช่องว่าง (เทสต์ใหม่พัง 63/1 กับโค้ดก่อนแก้)
สาเหตุจริง: `index.html` ตัวฟัง `window 'storage'` เรียก `renderChat()` ตรง ๆ โดยไม่เก็บค่าใด ๆ · ต้นตอร่วมของทั้งสองเคสคือการเก็บค่าแบบลงชื่อ id ทีละช่องไว้ใน `sbRerender()` เท่านั้น ช่องใหม่หรือเส้นทางวาดใหม่อื่นจึงหลุดได้เสมอ
แก้อย่างไร: เพิ่ม `preserveTypedFields(render)` เก็บทุก `input[id]`/`textarea[id]` ที่กำลังพิมพ์ (ค่า ≠ defaultValue) หรือถูก focus แล้วคืนค่า/เคอร์เซอร์/focus ให้ช่องที่ถูกสร้างใหม่ ข้าม checkbox/radio/file ฯลฯ และไม่แตะช่องที่ผู้ใช้ไม่ได้พิมพ์ (ค่าใหม่จากเซิร์ฟเวอร์ยังแสดงได้) · `sbRerender()` และตัวฟัง `storage` ใช้ helper ตัวเดียวกัน
กติกาใหม่: ทุกจุดที่วาดหน้าใหม่เบื้องหลังโดยผู้ใช้ไม่ได้สั่ง ต้องห่อด้วย `preserveTypedFields()`
test ที่เพิ่ม: `แท็บอื่นแก้แชท ต้องไม่ล้างข้อความที่พิมพ์ค้างในห้องแชท` และ `preserveTypedFields เก็บทุกช่องที่กำลังพิมพ์ แต่ไม่ยุ่งกับช่องที่ไม่ได้แตะ` · ก่อนแก้ 63/1 → หลังแก้ `node harness.js` 64/64 ผ่าน, `./tests/run-sql-tests.sh` ผ่าน, OPC adapter 3/3, headless Chrome โหลด `index.html` ไม่มี console error
ผลกระทบอื่น: ไม่แตะโครงสร้างข้อมูล/storage/dependency · build stamp `2026-09-25.1` (ยังไม่ได้ปล่อย จึงไม่ขยับเลข)

## 2026-10-07 — ใบงาน A03132 ไม่ปรากฏแก่ Admin; Sales สร้าง A03430 แทน

Scope: read-only diagnosis from user-supplied screenshots, the earlier sanitized audit and synthetic visibility checks. No production record/API query, Supabase Dashboard access, runtime patch, localStorage mutation or deployment. Task/Issue IDs were not supplied. Allowed change: this diagnostic history only; owner/reviewer: System Owner / `@phossatron`.

### Evidence and clarification

- All three supplied screenshots show deployed build `2026-09-23.1`. The local save gate and inactivity warning are in commit `0724d93`, build `2026-10-07.1`; they have not been deployed.
- The user explicitly clarified that Sales created **a new A03430 to replace A03132**, rather than the system renumbering the same record.
- The third screenshot shows Admin inside A03430's Chat with 7 participants, 3 messages and 1/4 approvals. This verifies that this new room was visible to Admin at capture time. It does not establish visibility on every account.
- The first screenshot is filtered for A03358, the second for A03132. Those log rows are not proof of A03430's save history or a record-ID change. No customer/formula/message content is copied into this report.
- Earlier sanitized evidence in `docs/AUDIT_2026-10-07.md` found an A03132 room but no associated record in the Admin-loaded record collection. That observation is historical, not a fresh server query.
- A fresh unauthenticated GET of the public page for source comparison returned HTTP 403. No access-control bypass or credential use was attempted; the deployed source was not freshly recertified in this turn.

### Reproduction and cause boundaries

An isolated Node VM extracted `canSeeRecord` and `visibleChats` from commit `43b5cfb`, whose visibility rule matched the earlier deployed-source audit. Synthetic inputs: one room, initially no matching record, then a matching record, then creator and different Sales identities. **5 assertions passed**: orphan room hidden even for Admin; undefined record fails visibility; Admin sees a room once its record is loaded; creator sees it; other Sales does not. Receipt: `/tmp/formula-orphan-recheck-20261007.json`. No business data or network calls were used.

The direct reason for an orphan room being hidden is the record prerequisite in `visibleChats`: a room is included only when its matching record passes `canSeeRecord`; a missing record returns false even for Admin. A Sales browser retaining a local record can consequently see a room that another browser cannot see when it lacks that record.

The earlier deployed-source audit also identified a consistency gap: record upload can be held by `recTouched`/bulk guards while Chat and activity writes proceed independently. A creation log alone therefore does not demonstrate a successfully saved shared record. This is a supported possible mechanism, **not the proven cause of A03132's missing record**. The record might never have been uploaded, might have been deleted, or might be missing from that client's read/sync result; no incident-specific save response or deletion evidence resolves those alternatives.

### Fix status and next evidence

Creating A03430 is a workaround that establishes a different record/room. It neither restores A03132 nor transfers its history/approvals. The previously implemented save gate is prevention for future writes on the reviewed source; it does not reconstruct missing historical records, and it is not active on the build shown in the screenshots.

No source fix was added in this turn because the first failing record-save/read operation for A03132 has not been reproduced. To prove that root cause, an authorized operator must provide sanitized evidence from the original Sales browser: whether record A03132 still exists locally, whether it is pending, the relevant record-write response/status and environment identity, plus any corresponding deletion event. Keep formulas, personal data and credentials out of the evidence. If an authoritative original record survives, prepare a reviewed recovery that preserves A03132; do not reconstruct it from log text or silently copy A03430 over it.

Release of the local prevention change still requires an approved frontend/API base, independent Critical Change review and staging UAT. The starting branch had 22 earlier commits outside origin main, and the previously inspected deployed client used a different Chat transport. Runtime Operator deployment remains separate.

```yaml
status: PARTIAL_DIAGNOSIS_CONFIRMED_RECORD_LOSS_CAUSE_UNVERIFIED
task_id: null
issue_id: null
files_changed: [docs/DEBUG_LOG.md]
tests_run: [synthetic_visibility_recheck_5_assertions, git_diff_check]
test_result: PASS_FOR_VISIBILITY_MECHANISM_ONLY; INCIDENT_SAVE_FAILURE_NOT_REPRODUCED
security_impact: None; no credentials or production data queried
database_impact: None
permission_impact: None
dependency_impact: None
rollback: Revert this documentation addition; no runtime or data change
open_risks:
  - A03132 record-save/read/deletion cause requires sanitized incident evidence
  - A03430 visibility is verified only in the supplied Admin screenshot
  - Local prevention remains undeployed; release base and review pending
pr_reference: null
```

### Follow-up — original-browser recovery preparation

The user authorized the next step and confirmed that the original Sales browser is on another computer. The connected Chrome tab on this iMac is Admin. Read-only expressions returned only sanitized existence/count/timestamp metadata; they did not return customer names, formula rows, message contents, usernames, configuration values or credentials. No new Data API request, manual sync, page navigation, storage write or recovery was performed.

At 2026-10-07 16:59:05 Asia/Bangkok, this Admin browser held 227 records and 233 rooms, including 7 rooms without a matching record. A03132 still had a room with 2 messages, but neither a memory record nor a `fs_records` entry or record snapshot. The local `fs_recbak` inspection found zero A03132 versions. A03430 had both record and room, was visible, matched its cached snapshot and had 6 local backup versions. These are client observations, not confirmation of server completeness. Empty observed deletion metadata is not proof that no deletion occurred.

Source correlation is now materially stronger than the earlier build-label check. The runtime's main inline application hashes to `3f1050409657af61764251114a527e30e4b61d1d1c7eaa2bf136ad6b5f7aa148`. After omitting only the two `SB_URL`/`SB_KEY` configuration declarations, its SHA-256 is `ba6644959c62b54ef0989b9b1c5e2f6808d716b53ecb5d0c3d08e366a6ebf74e`, exactly matching commit `196c15fc890a556391e381f31ffea4d104f5764d`. Five selected function hashes also match. This identifies the application code candidate; it does not certify configuration, deployment approval, headers or database schema. `origin/main` is `d80041f`, build `2026-10-03.1`, with a different application, and is not the application currently loaded in the checked tab.

The exact `sbPush` extracted from that matching commit was executed in an isolated VM against synthetic storage and mock writes. Four characterization scenarios passed: (1) an untouched cached record with no snapshot is held, yet its room and activity upload; (2) the server-choice guard holds even a touched record while Chat uploads; (3) a fresh touched job is uploaded before its Chat; (4) a thrown record-write error stops that push before Chat. Thus the prerequisite gap is reproduced in the deployed code lineage, but the original A03132 failure has not been proven. Receipt: `/tmp/formula-deployed-job-gate-repro-20261007.json`; durable sanitized observations: `docs/evidence/job-recovery-2026-10-07.json`.

#### Operator action on the original Sales browser

1. Use the original computer and Chrome profile/tab that created A03132. Preserve its current site data while inspecting; clearing site data would remove potential local recovery evidence.
2. Open Chrome DevTools → Sources → Snippets, create a snippet, and use the contents of `scripts/inspect-job-recovery.js`. Run it with Cmd+Enter (macOS) or Ctrl+Enter. It accepts only the Formula hostname and reads only `fs_records`, `fs_chats`, `fs_recbak` plus already-loaded job/snapshot metadata. It does not save, sync, export business content, read credentials or make network requests.
3. Return only the JSON report printed by the snippet. It describes A03132/A03430 availability, candidate backup counts and cached-snapshot comparison. A cached match explicitly is not treated as proof of successful server saving. Do not send raw localStorage, request headers, formulas or credentials.
4. If A03132 exists in memory/storage or backup candidates, an authorized operator can preserve its original data in protected storage outside Git and the web document root. Prepare a reviewed recovery using the original ID, with validation and a fresh write acknowledgement. Preserve the existing room/history and obtain the business owner's decision on A03430; copying or merging approvals across different records is outside this read-only step.
5. If no original candidate survives, stop reconstruction from log alone and inspect an authorized protected backup/audit source through sanitized evidence. No complete recovery payload exists in the currently connected Admin browser.

The diagnostic snippet was tested with synthetic confidential sentinel values and protected stubs: **8/8 PASS** via `node --test tests/job-recovery-diagnostics.test.cjs`. Cases cover content redaction, no writes/network/credential reads, corrupt JSON, blocked storage access, canonical cached comparison, storage-only candidates, wrong-origin refusal and unrecognized role/action/error redaction. The blocked-storage case first failed because all read failures were labelled invalid JSON; it now returns a distinct fixed `UNAVAILABLE` status without error contents. No application source, schema, role permissions or runtime configuration was changed in this follow-up. Before release, port/review the preventive change against the approved legacy/main transport rather than deploying the unrelated Auth/event-RPC branch wholesale.

```yaml
status: DIAGNOSTICS_READY_AWAITING_ORIGINAL_SALES_BROWSER_EVIDENCE
task_id: null
issue_id: null
files_changed:
  - scripts/inspect-job-recovery.js
  - tests/job-recovery-diagnostics.test.cjs
  - docs/evidence/job-recovery-2026-10-07.json
  - docs/DEBUG_LOG.md
tests_run:
  - node --test tests/job-recovery-diagnostics.test.cjs
  - matching_deployed_sbPush_synthetic_characterization_4_scenarios
  - normalized_runtime_source_hash_comparison
  - git diff --check
test_result: 8 privacy checks PASS; 4 characterization checks PASS; normalized application hash matches candidate commit
security_impact: Read-only masked metadata; no credentials, business-content output or network calls from snippet
database_impact: None; no database queries or mutations initiated
permission_impact: None
dependency_impact: None
rollback: Revert diagnostic files and documentation addition; no business-data rollback needed
open_risks:
  - Original Sales computer is not connected; recovery candidate and incident-specific failure remain unknown
  - Matching application source does not certify deployed configuration/schema/approval
  - Preventive rules remain on a different undeployed branch and require transport-compatible review
pr_reference: null
```
