# Private original assets: API v1, schema4

Frozen for parallel frontend work on 2026-10-07. Implementation and real temporary-file tests are separate from deployment evidence. This contract supersedes the earlier no-original-binary scope only for an explicit private-asset upload. Existing transient parser/chat requests do not silently retain files or send the asset library to a model. No organization layer, public sharing URL, OCR service, third-party viewer or AI asset tool is introduced.

## Scope and storage

Each authenticated user (including the administrator) sees only their own assets. Original PDF, XLSX, XLS, UTF-8 TXT/CSV, PNG and JPEG bytes live under an owner-controlled private directory, never the static root. Paths are random UUIDs, independent of filenames and request paths. SQLite schema4 stores ownership, metadata, extracted text and a normalized literal-search field. It is one transactional additive migration preserving schema3 records.

Limits: 5 MiB/file; 256 MiB/user; 200 files/user; 50,000 indexed characters/file. Excel also retains its existing resource-bounded 12-sheet, 200-row/50-column values-only preview. Formulas/macros never run and external workbook links are not followed. Extracted text may be incomplete and is untrusted. PNG/JPEG receive complete local decoding in an isolated, resource-limited worker and have no OCR; valid image-only PDFs can be stored with unavailable text. Invalid, corrupt or encrypted document parsing rejects the upload rather than reporting a saved asset. No DELETE endpoint exists pending explicit retention/recovery product decisions.

## Metadata

`asset = {id,originalFilename,mimeType,sizeBytes,sha256,createdAt,updatedAt,version,caseId,clientId,textStatus,textTruncated,previewKind,warnings}`

`textStatus`: `ready` or `unavailable`; `previewKind`: `pdf`, `image` or `text`; `caseId`/`clientId` can be null. No disk path or owner identity appears in responses. Search results may add `snippet`, always plain text. UI must render filenames, snippets, extracted text and warnings as text, never HTML.

## Upload

`POST /api/assets?caseId=<UUID>` or `?clientId=<UUID>`; both optional. Raw file bytes, not multipart or JSON/base64. Headers:

- Content-Type: exact supported MIME (optional charset parameter accepted for text)
- X-Asset-Filename: encodeURIComponent(file.name)
- X-Asset-Consent: persist-private
- Cookie, X-CSRF-Token, Origin: current authenticated same-origin session

Requires explicit upload/save action and returns `201 {asset}` only after bytes are fsynced and metadata committed. UTF-8 filename is metadata only; slashes, controls and traversal names are rejected. No userId/owner parameter is accepted. Supported MIME: application/pdf, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel, text/plain, text/csv, image/png, image/jpeg. Extension must match MIME.

An upload can be initially unassigned. With caseId, its customer is derived from that owned case. If clientId is also present it must match. A customer-only upload is supported. A case's later customer change moves its associated assets to that customer. Deleting a case retains its originals as standalone assets with their last customer association.

## Browse and search

`GET /api/assets?q=<literal>&caseId=<UUID>&clientId=<UUID>&limit=50&offset=0`

Returns `{assets,total,limit,offset,searchMode:'literal-substring',usage:{count,bytes},limits:{fileBytes,userBytes,filesPerUser,textChars}}`. All filters are optional. q maximum 200 characters, Unicode NFC and case-insensitive whole-literal substring over filename plus extracted text; no wildcard, regex, FTS expression or semantic search. SQL parameters are bound. This deliberately favors predictable CJK and filename matching at bounded small-team volume. Node24 FTS5 support was directly checked and is available; this version does not need tokenization or FTS extension loading.

limit is integer 1..100, offset 0..200. Unknown/foreign clientId/caseId gives 404. Unknown/repeated query parameters give 400. Results order newest first, id as stable tie-break; a concurrent upload can move offset pages.

## Read, preview and download

- `GET /api/assets/:id` → `200 {asset}`
- `GET /api/assets/:id/text` → `200 {asset,text}`; unavailable text is an empty string, with the limitation in metadata/warnings
- `GET /api/assets/:id/preview` → authenticated inline original PDF/image; Excel/TXT/CSV → safe UTF-8 text/plain extracted preview
- `GET /api/assets/:id/download` → original bytes as application/octet-stream attachment with RFC5987 filename

Direct same-origin links work with the current session cookie; GET does not require CSRF. Each read checks the server session, ownership and cross-site request headers. All responses are no-store and nosniff; binary preview/download verifies size/digest and rejects symlinks/hardlinks. Preview is sandboxed, same-origin only, without script or form permissions. Same-origin iframe or a new tab (`rel=noopener noreferrer`) may be used. Never construct external online viewer URLs. Do not cache a private response in a service worker.

## Associate an existing asset

`PATCH /api/assets/:id {caseId?,clientId?,expectedVersion}` → `{asset}`

At least one association key is required. Omitted association values become null; to detach a case while retaining customer pass `{caseId:null,clientId:<current>,expectedVersion}`. With caseId, clientId may be omitted and is derived. Requires session, Origin and CSRF. Version mismatch: 409 ASSET_CONFLICT. Foreign asset/association is 404.

## Failures

Always `{error,code}`. Relevant codes:

- 400 ASSET_INVALID, ASSET_FILENAME_INVALID, ASSET_CONSENT_REQUIRED, ASSET_ASSOCIATION_MISMATCH
- 401 AUTH_REQUIRED; 403 CSRF_REJECTED / ORIGIN_REJECTED
- 404 ASSET_NOT_FOUND / CASE_NOT_FOUND / CLIENT_NOT_FOUND (foreign records indistinguishable)
- 405 ASSET_METHOD_NOT_ALLOWED (including DELETE)
- 409 ASSET_CONFLICT / ASSET_QUOTA_EXCEEDED
- 413 ASSET_TOO_LARGE / TEXT_TOO_LARGE
- 415 ASSET_TYPE_UNSUPPORTED
- 422 ASSET_EMPTY / ASSET_TEXT_INVALID / ASSET_CSV_INVALID / ASSET_CSV_TOO_COMPLEX / ASSET_IMAGE_INVALID; existing PDF/Excel parser codes preserved
- 429 BUSY
- 503 PDF_UNAVAILABLE / WORKBOOK_UNAVAILABLE / ASSET_FILE_MISSING / ASSET_FILE_UNSAFE / ASSET_INTEGRITY_FAILED

Do not translate parser/preview failure into success. A saved asset with unavailable OCR is a successful private save, not successful extraction. No model call is made by any of these routes.
