# Job inactivity warnings and saved-job Chat gate

Date: 2026-10-07. Scope: the two rules approved by the user in this task. Local source build: `2026-10-07.1`, branch `codex/job-alerts-chat-save`, starting commit `43b5cfb`.

Status: local implementation and automated checks PASS; independent review, staging UAT and release are pending. This is a Critical Change because it touches synchronization and database authorization guards. No production deployment, production credentials, production data mutation, or Supabase Dashboard access was performed.

## Scope and accepted behavior

- Open jobs warn in red after strictly more than seven days without movement. Closed jobs are exempt. Warnings follow existing job visibility rules.
- Creation/editing of a job or formula, Chat messages/approvals and job status changes count as movement. Reading does not. A minute timer refreshes the warning while the application is open.
- Creating, entering and using Chat requires a valid job and a fresh server response confirming the same record payload under the current authenticated membership. A cached snapshot cannot unlock Chat. A local edit locks it again until confirmed.
- Offline/local-only mode can retain drafts; Chat remains unavailable. Pending Chat events remain queued until their job is confirmed.
- Validation reuses the job ID, creator, customer-or-brand and formula-array requirements. It does not certify regulatory acceptance, formula suitability or business approval.
- No new localStorage keys, table columns, dependencies or role matrix. `record.lastActivityAt` is optional; existing records use available timestamps. The SQL change adds an internal guard and permits this movement field in existing PD edits.

Task ID and Issue ID: not supplied; neither was invented. Allowed paths: application source, existing schema, focused tests, compatibility documentation and synthetic evidence. Forbidden: production runtime/data/secrets, deployment configuration, repository security controls and unrelated working files. Environment: local development/test on macOS; browser network responses mocked, SQL on disposable local PostgreSQL. Data classification: source and synthetic fixtures. Review owner: `@phossatron`; deployment owner: authorized Runtime Operator.

## Verification evidence

| Check | Result | Evidence |
| --- | --- | --- |
| `node harness.js` | PASS, 79 tests, 0 failures; 15 added cases | `tests/formula-studio.test.js`; final local log `/tmp/job-rules-verified-browser.log` |
| `./tests/run-sql-tests.sh` | PASS, authorization and rollback contract; schema applied twice | `tests/sql/auth_rls_test.sql`; final local log `/tmp/job-rules-final2-sql.log` |
| `git diff --check` | PASS | Local command exit 0 |
| Chrome rendered UI | PASS for changed warning/lock surfaces | `docs/evidence/job-rules-2026-10-07/desktop.png`, `locked.png`, `mobile.png`, `tablet.png` |
| Responsive layout | PASS at CSS viewport widths 390 and 768 | Body scroll width equals viewport; lock buttons 44px high; no Chat input while locked |
| Accessibility checks of changed surfaces | PASS for text/icon warnings, status roles, accessible button names and keyboard focus | AX tree includes warning and recovery labels; keyboard Tab reaches Customer Data with native focus outline. No full application accessibility certification claimed |
| Console errors in preview | None observed | Browser developer log query returned an empty error list |

The added cases were exercised as failing checks before implementation. Existing search/draft/permission tests remain in the suite; fixtures that previously assumed Chat could open from local-only jobs now supply server-confirmed synthetic jobs. Screenshots contain only synthetic data and demonstrate presentation, while the automated tests exercise save acknowledgements and failures.

## Eight-dimension review

| Dimension / case | Evidence | Result | Severity if unresolved | Owner / remediation |
| --- | --- | --- | --- | --- |
| 1. Input/boundaries: exactly seven days vs seven days plus 1ms; closed jobs; bad timestamps | Tests `inactivity warns only after seven days and never for closed work` and `reading does not reset inactivity; edits, messages and approvals do` | PASS | Medium | Development: preserve strict boundary and fallback |
| 1. Input/encoding: malformed identifier in locked recovery UI | Test `locked invalid identifiers cannot inject code through recovery buttons`; escaped heading, valid-ID-only recovery actions | PASS | High | Development: retain regression test |
| 2. Identity/permissions: Admin cannot bypass pending save; Sales cannot access another creator's job; hidden warnings do not disclose jobs | Browser tests for unsaved Admin, invalid data/wrong owner, visible-job warning; SQL negative owner case; existing Auth/RLS tests | PASS | High | CODEOWNER: independently review guard and PD movement-field allowance |
| 3. State: confirmed job creates one room; edits relock; an already-open room cannot send or approve; closed jobs are exempt | Focused browser tests and locked UI screenshots | PASS | High | Development: retain state transition tests |
| 4. Data integrity: persisted snapshot is not acknowledgement; omitted returned rows remain pending; JSONB key reordering accepted | Focused cache/omitted-row/JSONB tests; canonical fingerprints and record snapshot handling | PASS | High | Development: only acknowledge actual returned payloads |
| 4. Compatibility/migration: optional movement field; idempotent SQL application; existing keys retained | `CLAUDE.md`, schema test applied twice, existing SQL contract checks | PASS locally | High | CODEOWNER/Platform: review and stage frontend plus SQL together |
| 5. Failure/recovery: failed network refresh locks Chat; successful refresh unlocks; pending events stay queued | Tests `a failed server refresh locks previously confirmed Chat until recovery` and `pending Chat events are retained until their record is saved`; existing permanent RPC denial check | PASS locally | High | Platform: exercise real transport failure and recovery in staging |
| 6. Concurrency: edit during a write cannot be confirmed by the older response | Test `an in-flight edit is not confirmed by the acknowledgement of the older payload`; request data deep-copied before await | PASS | High | Development: preserve immutable request payload |
| 6. Concurrency: validating a Chat mutation vs parallel deletion/update | `private.fs_require_chat_job` locks the record `FOR SHARE` inside the mutation transaction; SQL accepts saved jobs and rejects missing ones | Mechanism reviewed; simultaneous independent database sessions not tested (BLOCKED for release evidence) | High | QA/Platform: run concurrent record-delete/Chat-event scenario in staging |
| 7. Environment: local-only/offline policy; mocked Auth/transport; 390/768 UI | Browser suite and responsive screenshot measurements | PASS in tested environment | Medium | QA: test real offline transition and two browsers/users in staging |
| 7. Upgrade: deployed build/source and legacy direct-write Chat path compatibility | Earlier sanitized build/transport observations show different implementation; this change targets the repository's authenticated event RPC path | BLOCKED for production rollout | High | Owner/Platform: identify approved deployed commit and stage matching frontend/schema; verify or retire old clients/direct-write routes |
| 8. Operations: quiet jobs refresh without a new server update; warnings explain latest time; lock panel supports recovery | Minute refresh in source, synthetic rendered UI, safe sync-error reason | PASS locally | Medium | Operations: include idle-job and pending-save scenarios in UAT |
| 8. Historical data: missing legacy movement timestamp or orphan Chat room | Fallback uses only known record/message/approval timestamps; missing records cannot pass save gate | Limitation documented; historical reconstruction/repair outside this change | Medium | Owner: authorize a separate reconciliation task if needed |
| 8. Release/rollback: approval and immutable release correlation | Branch source, tests and evidence available; independent review and release have not occurred | BLOCKED for release | High | CODEOWNER review, staging UAT, approved release and Runtime Operator deployment |

## Remaining acceptance and rollback

Staging must verify two users entitled to the same job see the same stale warning, hidden jobs stay hidden, create/save acknowledgement unlocks Chat, failed or invalid save keeps it locked, and editing/approval/message/status changes reset inactivity while reading does not. Verify the deployed artifact matches the reviewed source and API. Existing older direct-write clients are outside the new event RPC guard and must be addressed before claiming this rule is enforced in production.

This change does not restore a missing job or prove that historical job A03132 is complete on the server. Existing records without a movement timestamp cannot reveal unrecorded historical formula edits. Existing record deletion/reconciliation and server pagination behavior were not expanded in this task.

GitHub base check: after fetching `origin/main`, the starting checkout contains 22 earlier commits absent from that remote main. The starting feature branch `feat/chat-job-search` is not present as an origin branch. A PR straight to main would therefore include earlier authorization/runtime/workspace work, not just these two rules. Owner must establish the approved review/release base before publishing a PR. The local feature commit keeps this task's diff separate; no earlier commits were rebased or reset.

Rollback: prepare an approved revert of this feature commit and restore the previous Chat RPC/private-helper definitions from the approved prior artifact; retain existing records and the optional movement field. Do not use an authorization rollback that reopens anonymous access as the rollback for this feature. Runtime Operator executes rollback only after approval. No production rollback was attempted.

## Delivery contract

```yaml
status: LOCAL_CHECKS_PASS_REVIEW_AND_RELEASE_PENDING
task_id: null
issue_id: null
critical_change: true
files_changed:
  - index.html
  - supabase/schema.sql
  - tests/formula-studio.test.js
  - tests/sql/auth_rls_test.sql
  - README.md
  - CLAUDE.md
  - docs/EDGECASE_REPORT_2026-10-07.md
  - docs/evidence/job-rules-2026-10-07/desktop.png
  - docs/evidence/job-rules-2026-10-07/locked.png
  - docs/evidence/job-rules-2026-10-07/mobile.png
  - docs/evidence/job-rules-2026-10-07/tablet.png
tests_run:
  - node harness.js
  - ./tests/run-sql-tests.sh
  - git diff --check
  - Chrome synthetic UI and responsive inspection
test_result: 79 browser checks PASS; local SQL contract PASS; rendered changed surfaces PASS
security_impact: Fresh authenticated save proof; valid visible job required by Chat mutation/read RPC; no new credentials or grants
database_impact: Internal validation helper and RPC guards; optional JSON movement field; no new tables or columns; no production execution
permission_impact: Existing role visibility retained; PD may persist movement timestamp; pending jobs unavailable in Chat to all roles
dependency_impact: None
rollback: Approved source revert and prior RPC definitions; retain business data and optional field; authorized operator only
open_risks:
  - Independent Critical Change review pending
  - Staging multi-user and database concurrency UAT pending
  - Match deployed frontend/schema and verify legacy client routes before rollout
  - Establish approved PR/release base; 22 earlier commits are absent from origin main
  - Historical missing-record repair and missing movement history outside scope
pr_reference: null
```
