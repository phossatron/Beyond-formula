# PR #2 Rework on Current Main Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the necessary secure Auth/RLS/workspace/runtime behavior from PR #2 onto current `origin/main` while preserving PR #3 and current-main behavior.

**Architecture:** Keep the existing single-file deterministic Formula Studio runtime. Add secure Supabase behavior as an optional boundary around the current local-first stores, keep the server JSON contract and role authority in PostgreSQL, and run optional workspace code only after server permission plus origin/CSP validation. Serve local runtime from a generated site directory containing only the approved static artifact.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, browser `localStorage`/`sessionStorage`, Supabase REST/RPC/PostgreSQL RLS, Node deterministic harness, PostgreSQL CLI test fixture, macOS launchd/Python standard-library HTTP server.

**Spec:** `SPEC.md`

## Global Constraints

- Preserve locked localStorage keys and JSON fields from `CLAUDE.md`.
- Preserve current-main features and PR #3 search behavior.
- Browser may use only publishable/anon Supabase configuration under RLS; never embed privileged secrets.
- Workspace origin remains empty/disabled by default.
- No production schema/data/secret/IAM change and no Vercel deploy in this implementation turn.
- Critical changes require independent CODEOWNER review; Codex does not final-approve or deploy production.

## Review Focus

- Merge safety: Tag, Reject, version recovery, Oversea, current sync protections and PR #3 search must remain in `index.html`.
- Auth boundary: expired token, 401, 403, inactive membership, role change, logout and stale async responses must fence access without deleting local data.
- Data integrity: local outboxes, activities, recCounter and server JSON remain backward-compatible and idempotent.
- SQL authority: anonymous/unknown/inactive users, role field guards, actor spoofing, append-only chat events and rollback must be denied or restored as specified.
- Runtime safety: dirty checkout and repository-confidential files must prevent unsafe serving; generated site must contain only approved `index.html`.

### Task 1: Baseline harness and ported regression tests

**Files:**
- Create: `harness.js`
- Create: `tests/formula-studio.test.js`
- Create: `tests/run-sql-tests.sh`
- Create: `tests/sql/bootstrap.sql`
- Create: `tests/sql/auth_rls_test.sql`

**Interfaces:**
- Harness loads the single-file app and exposes deterministic browser assertions.
- SQL runner creates an isolated temporary PostgreSQL cluster and runs bootstrap/schema/tests/rollback.

- [ ] Copy only the reusable PR #2 test seam, remove OPC adapter-only tests, and add assertions that current-main Tag/Reject/search markers remain present.
- [ ] Run `node harness.js` and record the expected red failures for missing secure behavior.
- [ ] Add SQL fixture/test runner with explicit `LC_ALL=C` fallback and run it against the current schema baseline.

### Task 2: Secure Auth and sync boundary

**Files:**
- Modify: `index.html` at the existing configuration, auth, sync, and bootstrap sections.
- Test: `tests/formula-studio.test.js`

**Interfaces:**
- Secure mode uses `authSession`, `authMembership`, `authFetchMembership()`, `sbReq()`, and existing local stores.
- Existing `can()`/`requirePerm()` remain the UI capability surface; secure membership is the authority.

- [ ] Add failing tests for local-only boot, secure login/session-only storage, 401 clearing, 403 preservation, inactive membership, token refresh, and offline local-data preservation.
- [ ] Port the smallest Auth/session implementation from PR #2 and adapt names/anchors to current main.
- [ ] Port sync guards, activity sent-set/dead-letter behavior, message length cap, and error redaction without changing locked keys.
- [ ] Run focused harness tests, then the complete harness.

### Task 3: Secure Chat event store

**Files:**
- Modify: `index.html` chat sync/outbox functions.
- Modify: `supabase/schema.sql` event tables/RPCs.
- Test: `tests/formula-studio.test.js`, `tests/sql/auth_rls_test.sql`

**Interfaces:**
- Secure mode appends chat events through `fs_append_chat_event` and marks reads through `fs_mark_chat_seen`.
- `fs_chats` remains the backward-compatible projection; outboxes clear only after RPC success.

- [ ] Add failing tests for event append, rejected event retention, read marking, projection compatibility, and no direct legacy-row upsert in secure mode.
- [ ] Port and adapt the minimal event-store client/RPC contract.
- [ ] Run focused harness and SQL tests.

### Task 4: Optional workspace loader and CSP

**Files:**
- Modify: `index.html` CSP/config/workspace loader sections.
- Create: `docs/PRIVATE_WORKSPACE_CSP.md`
- Test: `tests/formula-studio.test.js`

**Interfaces:**
- `SCIENCE_WORKSPACE_API_ORIGIN=''` means no request and no DOM change.
- `mountPrivateWorkspace()` validates origin, membership permission, bearer session, CSP connect target, and teardown fencing.

- [ ] Add failing tests for disabled origin, invalid origin, denied role, 401/403, token/identity/role/mode changes, bundle URL validation, and teardown.
- [ ] Port the generic loader/CSP behavior without hardcoded Science content or production origin.
- [ ] Run browser harness and inspect the actual CSP meta policy.

### Task 5: Idempotent schema, RLS and rollback

**Files:**
- Create/modify: `supabase/schema.sql`
- Create: `supabase/rollback_auth_rls.sql`
- Create: `supabase/AUTH_RLS_RUNBOOK.md`
- Test: `tests/sql/bootstrap.sql`, `tests/sql/auth_rls_test.sql`

**Interfaces:**
- Locked application tables store the existing object in `data jsonb`.
- `fs_memberships` is the auth authority; policies and trigger guards reject unauthorized mutations.

- [ ] Add failing SQL cases for anonymous/unknown/inactive users, ownership/role fields, actor spoofing, append-only events, and rollback.
- [ ] Port schema/RLS/RPC definitions and verify idempotent rerun in the isolated cluster.
- [ ] Run the complete SQL suite twice and confirm no production endpoint is used.

### Task 6: Safe local runtime

**Files:**
- Create: `runtime/check-document-root.sh`
- Create: `runtime/com.beyond-formula.runtime.plist`
- Create: `runtime/deploy-approved-main.sh`
- Create: `runtime/healthcheck.sh`
- Create: `runtime/install-local-runtime.sh`
- Create: `runtime/rollback-to-commit.sh`
- Modify: `.gitignore`
- Test: runtime shell checks

**Interfaces:**
- Deploy refuses dirty source and only fast-forwards approved `origin/main`.
- Deploy copies approved `index.html` to ignored `runtime/site/index.html` and plist serves only `runtime/site` at `127.0.0.1:4173`.

- [ ] Add a test/check that repository-root confidential files are not inside the served generated site.
- [ ] Implement generated-site deployment and healthcheck/rollback without modifying application source at runtime.
- [ ] Run shell syntax, plist lint, document-root check, and healthcheck against a temporary generated site; do not restart the user runtime in this turn.

### Task 7: Full verification and handoff

**Files:**
- Modify: `TASK.md`
- Create/update: `docs/POSTLIVE_YYYY-MM-DD.md` only after an actual approved deployment.

- [ ] Run `node harness.js`, `LC_ALL=C ./tests/run-sql-tests.sh`, runtime checks, and `git diff --check`.
- [ ] Review the full diff for locked contract, secret, permission, dependency, and current-main feature regressions.
- [ ] Prepare PR summary with tests, security/database/permission/dependency impact, rollback, and open risks.
- [ ] Stop at independent review/CODEOWNER gate; do not approve or deploy the branch from Codex.

## Self-review

- The plan starts from current `origin/main`, so PR #3 is not re-applied as a conflicting patch.
- The plan explicitly excludes the optional OPC adapter and production operations.
- Every acceptance criterion has a test or review step.
- Runtime safety is handled by generated-site serving rather than weakening the existing confidential-data check.
