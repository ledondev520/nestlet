# Remembered library permission (schema9)

Status: local candidate implementation and synthetic tests; no production deployment, migration, real-user grant, or live DeepSeek acceptance is established here.

## Privacy boundary

The user must explicitly allow Nestlet to send bounded excerpts of this account's saved clients, cases, extracted asset text, and artifacts to DeepSeek for read-only retrieval. The permission is tied to the authenticated account, provider identity, exact endpoint, model, policy version, and the `saved-library-excerpts` category. Absence, legacy checkbox state, provider/policy/category mismatch, decline, and revocation do not authorize retrieval. Neither administrators nor another account can grant on the user's behalf through this endpoint.

The ordinary chat disclosure remains distinct: submitting a chat sends the current message/attachments, selected case evidence, and bounded history of the selected conversation. Read-only proposal tools can also use the same conversation's bounded source catalogue (recent/eligible message previews and related artifact metadata). They cannot retrieve another case or conversation without library permission, cannot write by themselves, and do not replace separate confirmation to save/apply/finalize. Revoking library retrieval does not erase context already sent or remove existing text from conversation history.

## HTTP contract

`GET /api/library-permission` requires authentication and passes the existing origin guard. It returns:

```json
{
  "decision": "unset",
  "version": 0,
  "provider": {
    "id": "deepseek",
    "endpoint": "https://api.deepseek.com/chat/completions",
    "model": "deepseek-flash"
  },
  "policyVersion": "library-retrieval-v1",
  "category": "saved-library-excerpts",
  "updatedAt": null
}
```

The UI names recipient DeepSeek and the bounded data category; it need not expose the endpoint. Only use returned provider/policy/category values, not client-generated alternatives.

`PUT /api/library-permission` requires a same-origin request with explicit Origin, authenticated session, CSRF token, and application/json (maximum 4096 bytes). The exact body is `{decision: "allow" | "deny", expectedVersion, provider, policyVersion, category}`. Unknown fields, wrong types, and malformed values fail with 400 `LIBRARY_PERMISSION_INVALID`. The session is revalidated after body receipt. Stale version or mismatched scope fails with 409 `LIBRARY_PERMISSION_CONFLICT`. A successful explicit choice increments a monotonically increasing account version and returns the GET shape. A decline is persisted. This is not an idempotent blind retry: after response loss, GET the latest state before considering another user-authorized change.

`POST /api/chat` with `libraryConsent:true` additionally requires `libraryPermissionVersion` matching a persisted allow exactly. A boolean alone cannot authorize a provider call. Missing consent yields 403 `LIBRARY_CONSENT_REQUIRED`; stale grant revision yields 409 `LIBRARY_PERMISSION_CONFLICT`. The frontend should re-read state before a send and must not silently convert a conflict into a grant. When retrieval is disabled, omit `libraryPermissionVersion`.

## Revocation and session lifetime

The server rechecks the exact originating session and persisted grant before the initial provider request, while consuming the stream, before tool execution, and immediately before every provider follow-up. Session checks do not extend idle lifetime or write last-used timestamps.

Any successful permission change immediately aborts all active library requests for that account in the current server, including a revoke/regrant race. Logout immediately aborts requests belonging to that particular session. A bounded 250 ms in-flight check also aborts a silent stream after another process changes grant/session/credentials; it is additional to, never a substitute for, synchronous outbound guards. Other accounts remain unaffected. Checks and timers are removed when the request exits. Already transmitted bytes cannot be recalled.

SSE can report `LIBRARY_PERMISSION_REVOKED`, `LIBRARY_CONSENT_REQUIRED`, or `LIBRARY_PERMISSION_CONFLICT`. A stopped response is not marked complete. A prepared read-only tool wrapper cannot smuggle library retrieval tools into a turn with retrieval disabled.

## Schema and recovery

Schema8→9 is one additive STRICT `library_permissions` table inside the existing migration transaction. No existing user/business/auth row is rewritten; the new table starts empty. Its foreign key cascades on account deletion. It stores no source excerpts, provider key, password, or session token.

Backup tooling recognizes schemas1–9, never upgrades the source, and preserves permission records in the snapshot. Restore clears both remembered choices and bearer sessions in the restored copy before it is usable, so a snapshot cannot resurrect a revoked grant. Users must sign in and explicitly choose again. The original snapshot and source remain unchanged.

Before a separately authorized deployment: verify an untouched schema8 pre-upgrade snapshot, rehearse migration/restore with originals, review exact-SHA CI/browser evidence, and agree downtime/recovery. Schema8 binaries must refuse schema9. Rollback requires a verified pre-upgrade snapshot and an explicit decision about later writes; never decrement `user_version`, strip the permission table in place, or overwrite a running database. Future schema10 and manifests are refused.

## Evidence

See the dated entry in [validation](validation.md). Tests use synthetic accounts/material, real local SQLite/HTTP, and authored SSE provider responses. They are not live-provider acceptance and do not create real-user authorization.
