# Seven-day inactivity alert — isolated PR

Status: PASS_LOCAL_CHECKS; human review, business UAT and release pending.
Task/Issue ID: none assigned. Owner/reviewer: @phossatron.
Base: origin/main at d80041f. Source idea: idle-alert portion of 0724d93;
that mixed commit is not cherry-picked. Auth, chat-save gates, runtime, schema and
migration changes are excluded from this PR.

## Rule and implementation

An open job turns red only after **more than** 7 × 24 hours without business
movement. Exactly seven days does not warn. Closed and rejected jobs do not warn.
Use existing visibility (`canSeeRecord` / `visibleRecords` / `visibleChats`); do not
grant additional roles access. Show red rows/cards, sidebar icon/tooltip and a Thai
warning with the latest timestamp in job details, dashboard, chat and modify/picker
views. Refresh warning nodes each minute and on return to the tab, preserving form
nodes, draft text and focus.

Latest movement considers creation/edit timestamps, optional record/chat
`lastActivityAt`, messages, approvals and retained legacy business activity entries.
Reading, presence, printing/export, login and synchronization do not advance it.
Record/formula/status business logs persist through existing `saveRecordsStore`,
including active editor copies. Bulk tag edits stamp only actually changed jobs.
Chat/approval actions persist through existing `saveChats`, **without changing the
confirmed parent record**. This avoids turning chat-only users' records into writes
that their role cannot commit. Approval withdrawal survives removal of the approval
object through the optional chat timestamp. Authorized room deletion retains a
record timestamp after the room is gone.

Storage keys, IDs and existing field types stay unchanged. The two added timestamp
fields are optional JSON numbers; old records/chats remain readable without them.
No dependency, database schema, runtime, permission or secret changes.

## Evidence

- `node --test tests/job-idle-alert.test.mjs`: **21 pass, 0 fail, 0 skip**.
  Executes application functions and compiles all inline JavaScript. Covers the
  time boundary, legacy/malformed timestamps, terminal states, visibility,
  clock persistence, read-only roles, calls to existing persistence boundaries, bulk tags,
  non-mutating refresh and sidebar tooltip transitions.
- `git diff --check`: exit 0.
- Actual synthetic browser UI: Admin sees permitted old jobs; Sales sees only its
  own jobs. Old jobs are red, fresh jobs normal, closed job has no warning.
- Desktop, tablet 768×1024 and mobile 390×844 inspected. The chat list remains
  within the mobile/tablet page width; text and icon supplement color, with
  `role=status` for the message and contrast 6.85:1 on pale red.
- In an open room, typing then refreshing only warnings retained the same draft
  and `chatInput` focus. Sending the synthetic message removed the warning.
- Browser console: no captured warning/error entries in the exercised flow.
- Evidence PNGs and digests: `docs/evidence/idle-alert-2026-10-07/`.

The current main branch contains neither `harness.js`, `test.html` nor a SQL test
runner. Those legacy named checks could not be run; the new focused executable
suite and browser checks are not described as a full legacy regression suite.
No SQL changed. Browser fixture was served only on loopback with server config
removed and synthetic records/users; the fixture itself is not committed.

## Review, release and rollback

Critical review scope: application business movement metadata and existing
visibility/storage boundaries. Require independent human approval. Do not merge
or deploy solely from local tests. Runtime Operator must package the approved
application source as a sealed release; production continues using its current
bundle until controlled release. Combined UAT with runtime PR #9 is still needed.

Rollback: revert this isolated commit or deploy the previous approved sealed
bundle. Preserve local/business data. Optional timestamps can stay; older versions
ignore them. No destructive migration or database restore is needed.

Remaining limits: uses browser time; historical movement not retained anywhere
cannot be reconstructed. Records with no usable timestamp do not receive an
invented age. This is an in-application alert, not an email/push notification.
