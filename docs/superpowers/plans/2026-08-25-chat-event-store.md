# Chat Event Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Add a server-side append-only Chat event path that is concurrency-safe, auditable, idempotent, and backward-compatible with the locked `fs_chats` projection.

**Architecture:** Supabase stores immutable Chat events and per-user read markers. A security-definer RPC validates membership/role, stamps actor/time, inserts an event once, and updates the existing `fs_chats` JSON projection under a row lock. Secure-mode browser mutations use a local outbox and RPC; local-only mode remains unchanged.

**Tech Stack:** Vanilla JavaScript in `index.html`, Supabase PostgreSQL/RLS/RPC, existing Node browser harness, local PostgreSQL SQL tests.

**Spec:** `docs/superpowers/specs/2026-08-25-chat-event-store-design.md`

## Global Constraints

- Keep the locked `fs_chats` key and JSON shape backward-compatible.
- Keep local-first mode working without Auth, Supabase, AI, or new dependencies.
- Do not add a build step or split application code out of `index.html`.
- Use membership/RLS as the secure-mode authority and validate permissions server-side.
- Do not deploy, merge, or final-approve this Critical Change from Codex.
- Run `node harness.js`, `./tests/run-sql-tests.sh`, `./runtime/healthcheck.sh`, and `git diff --check` before handoff.

### Task 1: Add failing database tests for event append and approval identity

**Files:**
- Modify: `tests/sql/auth_rls_test.sql`

**Interfaces:**
- Test `public.fs_append_chat_event(text,text,jsonb)`.
- Test `public.fs_mark_chat_seen(text,bigint)`.

- [ ] **Step 1: Add tests for two-message append, idempotency, approval actor validation, and read-marker isolation.**
- [ ] **Step 2: Run `./tests/run-sql-tests.sh` and verify the new tests fail because the RPC/tables do not exist.**

### Task 2: Add additive event/read schema, RPCs, guards, grants, and backfill

**Files:**
- Modify: `supabase/schema.sql`

**Interfaces:**
- `public.fs_append_chat_event(p_event_id text, p_job_id text, p_payload jsonb) returns jsonb`
- `public.fs_mark_chat_seen(p_job_id text, p_seen_ts bigint) returns boolean`
- `public.fs_delete_chat(p_job_id text) returns boolean`

- [ ] **Step 1: Create the append-only `fs_chat_events` and `fs_chat_reads` tables and indexes idempotently.**
- [ ] **Step 2: Add RLS so active members can read, but only RPCs can write.**
- [ ] **Step 3: Add the RPC validation/canonicalization and locked projection update.**
- [ ] **Step 4: Tighten approval validation so `approvals.<role>.by` must equal the authenticated membership name.**
- [ ] **Step 5: Add deterministic, rerunnable legacy backfill from `fs_chats`.**
- [ ] **Step 6: Run the focused SQL tests and verify they pass.**

### Task 3: Add failing browser tests for the secure Chat outbox boundary

**Files:**
- Modify: `tests/formula-studio.test.js`

**Interfaces:**
- `sbChatEventsOn()` returns boolean.
- `queueChatEvent(jobId, payload)` queues a canonical client request.
- `sbPushChatEvents()` flushes the queue through the RPC.

- [ ] **Step 1: Add tests proving secure Chat flushes through `/rest/v1/rpc/fs_append_chat_event`, preserves payload text, and removes only successful events.**
- [ ] **Step 2: Run `node harness.js` and verify the new tests fail because the outbox boundary does not exist.**

### Task 4: Implement secure-mode Chat outbox and RPC integration

**Files:**
- Modify: `index.html` at Chat state/mutation and Supabase sync functions.

**Interfaces:**
- Secure mode keeps local Chat rendering immediate while persisting event requests in `fs_chat_event_outbox`.
- `sbPush()` skips direct `fs_chats` upserts/deletes in secure mode and flushes event/delete/read RPCs first.
- Existing Chat functions queue message, approval, system, and read events without changing local-only behavior.

- [ ] **Step 1: Implement the outbox persistence and RPC flush.**
- [ ] **Step 2: Route message, approval, formula-change, close/reopen, and create system events through the outbox.**
- [ ] **Step 3: Route secure reads and Admin Chat deletion through RPCs.**
- [ ] **Step 4: Reconcile successful secure Chat state from the server projection while retaining pending local events.**
- [ ] **Step 5: Update the build stamp and keep all user-controlled Chat text escaped.**
- [ ] **Step 6: Run browser tests and confirm they pass.**

### Task 5: Full verification and handoff

**Files:**
- No additional source files.

- [ ] **Step 1: Run `node harness.js`.**
- [ ] **Step 2: Run `./tests/run-sql-tests.sh` twice to verify idempotence.**
- [ ] **Step 3: Run `./runtime/healthcheck.sh` and `git diff --check`.**
- [ ] **Step 4: Review `git diff` for secrets, forbidden direct production changes, and accidental contract changes.**
- [ ] **Step 5: Commit the implementation on the feature branch and report the commit/PR limitation.**
