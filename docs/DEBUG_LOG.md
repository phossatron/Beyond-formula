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
