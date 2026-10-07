# Workflow telemetry contract v1

Status: frozen integration contract; implementation and acceptance are in progress and not yet deployed.

This increment records operational metadata only. It never stores passwords, API keys, document text, draft text, filenames, arbitrary metadata, stack traces, or full request URLs. There is no third-party tracking.

## Identity and request headers

All workflow/event endpoints require the existing session; mutations require the existing `X-CSRF-Token` and same-Origin protection. Identities come only from the server session.

Every HTTP response includes `X-Request-Id` (server-generated UUID). For PDF/workbook parsing, AI extraction, and case CRUD, send `X-Workflow-Id` when a workflow is available. The server accepts a supplied workflow only when it belongs to the current user. It returns `X-Workflow-Id` for the tracking context it actually used.

Without this header the business operation still works; the server may create a separate bounded workflow. The frontend should create and reuse a workflow to correlate one complete unit/case journey. Do not reuse a workflow across users or across unrelated cases.

Telemetry persistence failures never turn a successful case save into a failed save. `X-Telemetry-Status` can be `active`, `unavailable`, or `ignored-invalid-workflow`; business responses remain authoritative. The dedicated telemetry endpoints report their own errors normally. Client code must not clear work, retry a paid operation, or claim a case save failed solely because telemetry failed.

## Routes

| Route | Request | Success |
| --- | --- | --- |
| `POST /api/workflows` | `{}` | 201 `{workflowId}` |
| `POST /api/workflows/:workflowId/bind` | `{caseId}` | 200 `{workflowId,caseId}` |
| `POST /api/workflows/:workflowId/events` | `{events:[...]}` | 201 `{accepted:number}` |
| `GET /api/workflows/:workflowId/events?limit=100&beforeId=123` | No body | 200 `{events:[...],nextBeforeId:number|null}` |
| `GET /api/cases/:caseId/events?limit=100&beforeId=123` | No body | 200 `{events:[...],nextBeforeId:number|null}` |
| `GET /api/admin/telemetry?caseId=...&workflowId=...&userId=...&limit=100&beforeId=123` | Optional exact-ID filters | 200 `{events:[...],nextBeforeId:number|null}` |

Bindings verify ownership of both workflow and case. A workflow may be bound once; rebinding to the same case is idempotent, while another case returns 409. Saving a case does not depend on this separate binding call. The server also attempts a non-blocking association for a successful case creation/update/read when an appropriate tracking context exists.

Ordinary accounts can read only their own workflow/case metadata. The administrator may query cross-user operational metadata through the administrator route. This does not grant access to other users' case contents or drafts. All returned IDs are opaque; no usernames, titles or document snippets appear in logs.

## Client event payload

Each event has exactly the following allowed keys:

```json
{
  "event": "review.confirm",
  "outcome": "success",
  "clientActiveMs": 4200,
  "clientWaitMs": 350,
  "requestId": "optional UUID from a related response",
  "errorCode": "optional fixed error code"
}
```

`event` and `outcome` are required. Other keys are optional. Unknown keys are rejected. At most 10 events and 4096 request bytes are accepted per batch.

Allowed client events:
- `input.paste`
- `input.file`
- `input.mapping`
- `review.confirm`
- `draft.generate`
- `draft.edit`
- `export.copy`
- `export.download`
- `export.print`
- `case.open`
- `case.save`
- `case.delete`

Allowed outcomes: `success`, `failure`.

`clientActiveMs`: integer 0–86,400,000; self-reported active interaction time. Pause accumulation when the page is hidden or the relevant step is inactive. Do not emit an event for every keystroke.

`clientWaitMs`: integer 0–300,000; self-reported elapsed wait around a relevant request or browser operation. It is not server processing time.

`requestId`, when supplied, must reference a previously recorded server request owned by the same user and workflow. The client cannot attach its event to another user's request.

Client `errorCode` is optional and limited to: `CLIENT_CANCELLED`, `CLIENT_VALIDATION`, `CLIPBOARD_FAILED`, `DOWNLOAD_FAILED`, `PRINT_FAILED`, `UNKNOWN_CLIENT_ERROR`. Use the related requestId to inspect the authoritative backend error code instead of copying arbitrary error text.

## Stored/read event shape

```json
{
  "id": 123,
  "workflowId": "UUID",
  "caseId": "UUID or null",
  "userId": "opaque user ID",
  "requestId": "UUID or null",
  "source": "server or client",
  "event": "request.extract",
  "outcome": "success or failure",
  "httpStatus": 200,
  "errorCode": null,
  "serverElapsedMs": 528,
  "clientActiveMs": null,
  "clientWaitMs": null,
  "createdAt": "server UTC timestamp"
}
```

Server event names are fixed: `request.pdf_parse`, `request.workbook_parse`, `request.extract`, `request.case_create`, `request.case_read`, `request.case_update`, `request.case_delete`, `request.case_list`.

`serverElapsedMs` is measured by the server from handling the request to completion/abort. It includes body receipt, parsing and upstream waits where applicable; it is not CPU time. Only the server writes this field and the authoritative HTTP/error result. Client observations are explicitly marked `source:"client"` and cannot overwrite server results. Active dwell time alone is never described as a stall or performance failure.

## Bounds and errors

Default retention: 30 days. Caps: 200 events per workflow, 2,000 per user, 20,000 globally, 100 workflows per user. Oldest metadata is removed when a cap is reached; case contents are unaffected. Expired metadata is pruned on telemetry writes and reads, and at startup.

Client event submissions are limited to 60 events per user per minute; workflow creation is limited to 20 per user per minute. Reads return at most 100 rows, newest first, with a descending numeric cursor. Request/bind IDs must be UUIDs. No arbitrary text search or metadata field is accepted.

Errors: `TELEMETRY_INVALID`400, `WORKFLOW_NOT_FOUND`404, `CASE_NOT_FOUND`404, `WORKFLOW_ALREADY_BOUND`409, `TELEMETRY_REQUEST_MISMATCH`400, `TELEMETRY_RATE_LIMITED`429, `TELEMETRY_UNAVAILABLE`503; existing authentication/CSRF/origin errors remain applicable. Administrator-only reads return `OWNER_REQUIRED`403 for ordinary accounts.

## Integration order

1. After login, create a workflow when beginning a new unit/case journey
2. Reuse its ID on parser/extraction/case requests and capture response request IDs
3. Emit bounded client step events without copying input, draft, filename, credentials or exception messages
4. Once a case is saved, bind the workflow to that returned case ID
5. Opening a saved case may create a new workflow and bind it to the same case, preserving separate visits
6. Explicit logout or identity changes discard browser workflow IDs along with prior-user work buffers

Frontend instrumentation may ship later. Existing parsing, review, drafting and persistence remain functional without it.
