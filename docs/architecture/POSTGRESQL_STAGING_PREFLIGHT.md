# PostgreSQL on iMac — staging preflight

**Status: BLOCKED before implementation and staging.** This note records the source and endpoint checks for Issue #9. It is not a migration, an approved release, a staging rehearsal, or production authorization.

## Evidence checked on 2026-10-02

- The repository at `b01e68d` is a single-file browser application (`index.html`) with direct Supabase REST calls. The client sends the configured Supabase key from the browser.
- Formula login and role state are stored in browser `localStorage`; they are not verified by Supabase Auth. The SQL policy in `supabase/schema.sql` grants broad `anon`/`authenticated` access (`anon_all`) to the Formula tables. Cloudflare Access in front of a future hostname would not by itself add per-user authorization to these direct Supabase calls.
- The checked-in `CLAUDE.md` requires a single-file app, preserves locked localStorage keys/object shapes, and describes no backend or migration script. Moving writes to PostgreSQL on the iMac requires an approved architecture change and a server-side API that authenticates and authorizes every operation. Reusing the current browser key or trusting a client-supplied role is not an acceptable target design.
- This checkout contains no Formula PostgreSQL API, runtime service, migration script, or test harness. A local staging endpoint is not configured here.
- DNS lookup for the proposed `staging.formula.beyond-workflow.com` returned no address, and the HTTPS `/health` check could not resolve the host. This only shows the name was not resolvable from this check; DNS ownership, zone configuration, and iMac state still require verification by the authorized operator.
- GitHub Issue #9 is open. No implementation PR or immutable release exists for staging deployment.

## Required implementation boundary

Before staging can be provisioned, the owning maintainers must approve a design that resolves these points:

1. Server-side Google Workspace / Cloudflare Access identity verification at the Formula API, including deny-by-default behavior and protection against direct-origin bypass.
2. Server-side role/permission checks for each record, chat, approval, user, activity, and job-number operation. The API must not trust Formula roles supplied by the browser.
3. Backward-compatible import of existing localStorage objects and Supabase data, including UUID identity mapping, unique central human job numbers, outage (`OFF`) jobs, chats, approvals, activities, and retry-safe outboxes.
4. Field-level merge behavior, conflict ownership and resolution, idempotency keys, and clear operator-visible sync states.
5. Encrypted, company-controlled backup and a measured restore/reverse-replay path to a controlled Supabase staging target.
6. An isolated iMac runtime/database with separate credentials, a verified Cloudflare Access policy, health checks, and observable logs.

The current single-file/browser contract and target server architecture are in tension. Do not silently edit the contract or claim that changing the database URL is sufficient. The implementation PR must explicitly specify the compatibility/migration path and receive independent CODEOWNER review before staging deployment.

## Gate status

| Gate | Result | Evidence still required |
|---|---|---|
| Source/architecture discovery | Partial | Owner-approved target API/auth design and inventory of runtime outside this checkout |
| Implementation PR | Not started | Reviewed server-side API, migration and outbox changes, checks, rollback reference |
| Independent CODEOWNER approval | Not obtained | Approval by `@phossatron` or formally appointed replacement on the actual implementation PR |
| Staging endpoint and isolation | Not provisioned | DNS/Access proof, iMac service/database inventory, direct-origin deny check |
| Migration/reconciliation rehearsal | Not run | Synthetic production-shaped data, counts/references/checksums and authorization results |
| Restore and Supabase replay | Not run | Two timed staging trials, zero unexplained differences or duplicate effects |
| UAT | Not run | Sequential Sales/PD/RA/RD evidence; independent-user approval remains not testable with one identity |
| Production cutover | No-go | All preceding gates plus accountable human GO decision |

## Stop condition

Do not direct users to a new endpoint or stop Supabase writes until the approved artifact has passed the staging criteria in Issue #9. If those criteria or the measured rollback window are incomplete, retain the existing production route and keep queued browser data intact.
