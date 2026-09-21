# Formula Studio — Integration Contracts

สถานะ: contract proposal / boundary definition only
ห้ามตีความว่า endpoint, event bus หรือ field ใดที่ยังไม่พบใน source เป็นระบบที่มีอยู่แล้ว

## 1. Contract rules

- Formula Studio owns Formula/R&D domain logic only.
- Central IAM owns identity and permission authority.
- Central Job Core owns `central_job_id` and cross-system job reference.
- OPC owns OPC workflow state.
- Reporting consumes events and does not change Formula business logic.
- No system may read or write another system's database directly.
- All new contracts are versioned, authenticated, authorization-checked, idempotent and observable.
- Payloads use synthetic examples in development; never place production/confidential data in fixtures or logs.

## 2. Identity mapping contract

### Purpose

Resolve legacy Formula values to shared identifiers without destroying backward compatibility.

### Proposed request/response

```json
{
  "schema_version": "identity-mapping.v1",
  "source_system": "formula",
  "source_record_id": "A00001",
  "legacy_user_ref": "legacy-name-or-auth-uuid",
  "requested_by": "central_user_id",
  "correlation_id": "request-correlation-id"
}
```

```json
{
  "status": "MATCHED|PENDING_MAPPING|REJECTED",
  "central_job_id": "central-job-id-or-null",
  "central_user_id": "central-user-id-or-null",
  "matched_source_system": "formula",
  "matched_source_record_id": "A00001",
  "mapping_version": 1,
  "resolved_at": "timestamp"
}
```

No match may be inferred from a display name alone. `PENDING_MAPPING` is a valid operational state.

## 2.1 Formula pilot — OPC user reference

For the Formula pilot, OPC Workflow is the reference source for user mapping. The
initial read-only dataset is the `OPC System Users` tab supplied by the project
owner. The repository stores only the contract shape, never real user rows.

Minimum adapter fields:

```text
opc_user_id
name
department
role_reference
opc_login_email and/or cloudflare_access_email
status
```

Formula resolves the authenticated user's email against an active OPC reference
row and retains the result in memory only. Display names and Formula legacy
records remain unchanged. The reference does not grant permissions; Formula's
current Auth/RLS boundary remains authoritative until a separately approved
identity transition changes it. Disabled flag, missing provider, inactive row,
duplicate ID or ambiguous email must fail closed.

## 3. Formula event contract

### Envelope

```json
{
  "schema_version": "formula-event.v1",
  "event_id": "globally-unique-id",
  "event_type": "BRIEF_CREATED",
  "source_system": "formula",
  "source_record_id": "A00001",
  "central_job_id": "central-job-id-or-null",
  "actor_user_id": "central-user-id",
  "owner_user_id": "central-user-id-or-null",
  "assignee_user_id": "central-user-id-or-null",
  "stage": "BRIEF",
  "status": "DRAFT",
  "event_at": "timestamp",
  "delay_reason_code": null,
  "delay_remark": null,
  "correlation_id": "trace-id",
  "payload": {}
}
```

### Minimum event types

| Event | Producer | Required meaning |
|---|---|---|
| `BRIEF_CREATED` | Formula | A new brief was accepted by Formula |
| `REVIEW_STARTED` | Formula | A review stage began |
| `REQUIREMENT_COMPLETED` | Formula | Required Formula inputs were completed |
| `FORMULA_READY` | Formula | A specific Formula revision passed Formula-owned readiness rules |
| `OWNER_CHANGED` | Formula/IAM | Owner reference changed |
| `ASSIGNEE_CHANGED` | Formula/IAM | Assignee reference changed |
| `DELAY_REASON_ADDED` | Formula | A structured delay reason was recorded |
| `OPC_HANDOFF_REQUESTED` | Formula adapter | A specific revision was sent to OPC |
| `OPC_HANDOFF_ACCEPTED` | OPC | OPC accepted the handoff |
| `OPC_HANDOFF_REJECTED` | OPC/adapter | OPC rejected it with reason |

Existing `fs_activities` and `fs_chat_events` remain raw/legacy evidence until a reviewed projection is implemented. Their `cat/action` and `type/action` values must not silently be treated as the canonical vocabulary without an adapter.

## 4. Formula → OPC handoff contract

### Request

```json
{
  "schema_version": "formula-opc-handoff.v1",
  "idempotency_key": "formula:A00001:revision:3",
  "central_job_id": "central-job-id",
  "formula_id": "formula-id",
  "formula_revision": 3,
  "customer_ref": "customer-reference",
  "requirement_summary": "approved summary",
  "selected_formula_ref": "formula-revision-reference",
  "owner_user_id": "central-user-id",
  "assignee_user_id": "central-user-id",
  "requested_at": "timestamp",
  "attachment_refs": [
    {"attachment_id":"id","version":1,"checksum":"sha256","purpose":"brief|formula|evidence"}
  ],
  "handoff_status": "REQUESTED",
  "correlation_id": "trace-id"
}
```

### Response

```json
{
  "schema_version": "opc-formula-handoff.v1",
  "idempotency_key": "formula:A00001:revision:3",
  "central_job_id": "central-job-id",
  "opc_record_id": "opc-local-id",
  "handoff_status": "ACCEPTED|PENDING|REJECTED",
  "accepted_revision": 3,
  "reason_code": null,
  "reason_remark": null,
  "acknowledged_at": "timestamp",
  "correlation_id": "trace-id"
}
```

Rules:

- The same idempotency key returns the same outcome.
- Formula must not set `OPC_HANDOFF_ACCEPTED` based only on HTTP request success.
- Rejection is retained with a reason; it is not deleted or converted to success.
- Payload is role-filtered and must not expose restricted supplier/cost fields.
- OPC database is not a data source for Formula queries.

## 5. Reporting event adapter

Reporting receives the canonical envelope plus only approved payload fields. The adapter must provide:

- stable event ID and source/correlation IDs;
- actor/owner/assignee central IDs;
- stage/status and event timestamp;
- enough timestamps to calculate duration;
- delay code/remark when present;
- source revision/version;
- redacted error/dead-letter state.

Reporting must calculate cross-system KPI centrally. Formula must not create a second KPI definition or rewrite another system's events.

## 6. Attachment reference contract

Formula stores metadata/reference only:

```json
{
  "attachment_id": "stable-id",
  "source_system": "formula",
  "source_record_id": "A00001",
  "object_key": "opaque-approved-storage-key",
  "version": 1,
  "checksum": "sha256",
  "content_type": "approved-type",
  "classification": "internal|restricted",
  "owner_user_id": "central-user-id",
  "created_at": "timestamp",
  "retention_until": "timestamp-or-null"
}
```

Binary content must be stored in approved object storage with authorization and retention policy. Do not place binary content, credentials or unrestricted URLs in Formula JSON/chat events.

## 7. Adapter interface (implementation-neutral)

```text
resolveIdentity(legacyRef, correlationId) -> MappingResult
resolveJob(localId, correlationId) -> JobMappingResult
emitFormulaEvent(envelope) -> DeliveryResult
requestOpcHandoff(handoff, idempotencyKey) -> HandoffResult
recordAttachmentReference(metadata) -> AttachmentRef
```

The interface may be implemented with REST, an approved event bus or an internal service adapter. The choice requires an architecture decision; no live endpoint is assumed by this document.

## 8. Error and retry contract

| Condition | Formula behavior |
|---|---|
| 2xx accepted | Persist acknowledgement and correlation ID |
| 4xx validation/permission | Mark rejected/action-required; do not retry blindly |
| 401/403 | Stop and surface authorization issue; do not downgrade credentials |
| 408/429/5xx | Retry with bounded backoff and idempotency key |
| timeout/unknown outcome | Mark `PENDING_RECONCILIATION`; reconcile by idempotency key |
| duplicate delivery | Return original event/outcome; no duplicate business transition |
| unmapped identity/job | Keep `PENDING_MAPPING`; do not guess |

## 9. Current implementation boundary

The current repository proves Supabase Auth/REST/RPC and an optional private workspace manifest/bundle boundary, but it does not prove the contracts above exist. Any implementation of these contracts requires G1/G2 owner approval, synthetic fixtures, Critical Change review where source/schema/sync/auth paths are touched, and independent UAT before release.
