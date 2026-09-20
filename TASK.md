# PR #2 Rework on Current Main — Task Tracker

Branch: `feat/rework-pr2-on-main`

Base: `origin/main` (`6267255c3bc630ea6babc54db346b4a70f6f6957`)

## Ordered tasks

- [ ] Capture clean baseline and add the ported deterministic harness/tests; run the first red suite and record failures.
- [ ] Port secure Auth bootstrap, membership authority, session refresh, 401/403 handling, and role gates into the current `index.html` without removing current-main features.
- [ ] Port local-first sync hardening, activity dedupe/dead-letter behavior, and secure Chat event outbox/RPC integration.
- [ ] Port optional workspace loader and CSP/session fencing with default-disabled configuration.
- [ ] Add the idempotent Supabase schema, RLS/guard functions, event RPCs, isolated SQL test fixtures, and rollback script.
- [ ] Add local runtime generated-site deployment, healthcheck, rollback, and document-root safety checks.
- [ ] Run full focused and regression checks; inspect diff for locked-contract, permission, secret, dependency, and runtime violations.
- [ ] Prepare PR evidence and stop for independent CODEOWNER review; do not deploy from Codex.

## Verification commands

```sh
node harness.js
LC_ALL=C ./tests/run-sql-tests.sh
./runtime/check-document-root.sh
git diff --check
```

## Explicit stop conditions

- Any locked localStorage/JSON contract change
- Any production credential, data, migration, IAM, or runtime patch request
- Any current-main feature lost during merge
- Any test/security check skipped or weakened to obtain green output
