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
