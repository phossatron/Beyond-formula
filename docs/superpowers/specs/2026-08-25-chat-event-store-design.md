# Chat Event Store Design

## Goal

Make secure-mode Chat concurrent-safe and auditable without breaking the locked
`fs_chats` JSON contract or local-first mode.

## Design

Additive Supabase objects will store append-only Chat events and per-user read
markers. The existing `fs_chats` row remains as a backward-compatible read
projection for current and older clients. A security-definer RPC will validate
the authenticated membership, canonicalize the actor and timestamp, append the
event idempotently, and update the projection under a row lock in one database
transaction.

Secure-mode browsers will stop writing `fs_chats` directly. Chat mutations will
be queued locally and flushed through the RPC. Local-only mode keeps the current
`localStorage` behavior. Failed event calls remain queued and visible as a sync
error; successful events are reconciled from the projection on the next pull.

## Data contract

- `fs_chat_events(event_id, job_id, seq, data, created_at)` is append-only.
- Event `data` contains `version`, `type`, `actor`, `ts`, and event-specific
  payload. The server, not the browser, owns `actor` and `ts`.
- `fs_chat_reads(user_id, job_id, seen_ts, updated_at)` stores read markers via
  an RPC only.
- Existing `fs_chats(job_id, data)` remains unchanged and is updated only by
  the event RPC in secure mode.
- A rerunnable backfill creates deterministic legacy event IDs from existing
  message indexes and approval keys.

## Allowed events

- `message`: authenticated Chat member; text is trimmed and capped at 10,000
  characters.
- `approval_set` / `approval_revoke`: only the role matching `pd`, `ra`, `rd`,
  or `sales`; the server writes the approval actor and timestamp.
- `system`: only approved actions (`chat_created`, `formula_change`,
  `close_job`, `reopen_job`) with the existing role permissions.

## Compatibility and rollback

The migration is idempotent and does not alter or delete the locked tables.
Older clients can continue reading `fs_chats`; rollback consists of disabling
the new client path and leaving the projection intact. Event/read tables and
RPCs can be removed only through an approved rollback migration after verifying
that no newer client depends on them.

## Acceptance criteria

1. Concurrent event writes serialize and neither message is lost.
2. Duplicate event IDs return the original canonical event without duplicating
   the projection.
3. Approval actor spoofing is rejected and server stamps the real actor.
4. Legacy Chat rows backfill idempotently.
5. Secure-mode client uses the RPC path and does not directly update Chat rows.
6. Local-only mode and all existing tests remain green.
