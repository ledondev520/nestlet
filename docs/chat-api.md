# Case chat / native streaming API v1

`POST /api/chat` uses the existing authenticated session, exact allowed Origin, `X-CSRF-Token`, configured/enabled administrator API key, and ordinary-account AI quota. Optional `X-Workflow-Id` correlates operational metadata. No registration, credential, extraction, or case-save API is replaced.

## Request

```json
{
  "caseId": "optional own-case UUID",
  "locale": "zh",
  "consent": true,
  "messages": [
    {"role":"user","content":"Please explain the next administrative step."}
  ]
}
```

Allowed top-level keys are exactly `caseId`, `locale`, `consent`, `messages`. `locale` is `zh` or `en`; `consent` must be true. Only `user` and `assistant` message roles are accepted, with a user message last. At most 12 messages, 8,000 characters per message and 24,000 characters in total. No client system prompt, tools, arbitrary provider options or API key is accepted.

When caseId is provided, ownership is checked before any provider request. Only bounded working-copy fields and up to 12,000 characters of the case source text are attached. Case source beyond that limit is explicitly marked incomplete in the model context. Full drafts are not attached automatically. Chat never changes facts, review confirmations, drafts, or saved cases automatically. Conversation history is supplied by the browser for each request and is not saved to SQLite by this endpoint.

Official Flash image support is verified; this product accepts only PNG/JPEG inline images, at most 2 total per request, 2 MiB decoded bytes each, and 8192 pixels per side: a user message may carry `images:[{mimeType,data}]`, where data is raw base64 (not a remote URL). Other formats, remote URLs and provider file IDs are rejected explicitly, never silently omitted. Images are sent only with the user's explicit consent and are not persisted or logged. PDF/Excel/TXT/CSV drag/drop should use existing parsers and add reviewed text; binary documents are not sent as if they were images.

## Response / true SSE

Before streaming starts, ordinary JSON errors use the existing `{error,code}` shape. On success the response uses `Content-Type: text/event-stream`, `Cache-Control: no-store`, and `X-Accel-Buffering: no`. Every response includes server-generated `X-Request-Id`.

The browser must use `fetch` with a streaming response reader, not EventSource (the request is POST and carries CSRF/body).

```text
event: delta
data: {"text":"actual provider content chunk"}

event: done
data: {"requestId":"UUID"}
```

If an upstream/network/validation problem occurs after streaming has started:

```text
event: error
data: {"code":"CHAT_STREAM_FAILED","requestId":"UUID","retryable":true}
```

The partial text may remain visible as incomplete. Do not save it or label it complete automatically. Retrying is a new explicit user action; the backend never silently restarts a partially streamed paid request. Disconnect/abort cancels the upstream request. No synthetic token animation is used: delta events come from actual DeepSeek stream chunks. No reasoning_content/private chain-of-thought is forwarded or simulated.

## Limits and safety

- Explicit non-thinking mode, no tools or external actions
- Overall upstream timeout 90 seconds
- Bounded generated output and SSE frame buffer
- Images, when enabled, have independent byte/count limits; no external image URLs
- Synthetic or de-identified inputs only; obvious sensitive text identifiers are blocked before transmission
- Replies support administrative assistance and human-reviewed English formal drafts; no tenant screening, eligibility/rent decisions, legal compliance claims, or government submission
- No raw chat/image content is written to telemetry; only fixed request metadata may be recorded

Additional errors: `CHAT_INVALID`, `CHAT_TOO_LARGE`, `CHAT_IMAGE_INVALID`, `CHAT_IMAGE_UNSUPPORTED`, `CHAT_PROVIDER_FAILED`, `CHAT_STREAM_FAILED`, `CHAT_INCOMPLETE`, `CHAT_UNSUPPORTED_OUTPUT`. Existing authentication, Origin, CSRF, case-ownership, live-disabled, concurrency and quota errors remain applicable.
