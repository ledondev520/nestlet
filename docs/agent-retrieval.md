# Bounded library retrieval contract

Implementation checkpoint: October 7, 2026. The module is now integrated into the opt-in chat path described in [chat-library-api.md](chat-library-api.md). Deployment, actual paid-provider tool calling and browser acceptance remain separate gates; local protocol fixtures do not establish them.

## Runtime choice

Preserve `deepseek-flash`, the existing same-origin authenticated chat route and explicit non-thinking mode. Add a server-owned, bounded function-calling loop rather than replacing the provider or adding a general-purpose coding runtime.

- [DeepSeek tool calls](https://api-docs.deepseek.com/guides/tool_calls/) documents Flash function calling. [The API contract](https://api-docs.deepseek.com/api/create-chat-completion/) warns that function argument JSON can be invalid or contain unsupported parameters, so application validation remains mandatory. Beta strict mode requires separate endpoint/configuration handling; this implementation does not depend on it.
- [Codex SDK](https://github.com/openai/codex/blob/main/sdk/typescript/README.md) wraps the Codex CLI. [DeepSeek's current Codex integration](https://api-docs.deepseek.com/quick_start/agent_integrations/codex/) supports DeepSeek through Responses; Codex plus DeepSeek is possible. For this narrow read-only workflow, the extra runtime and configuration surface are unnecessary.
- [OpenAI Agents JavaScript model configuration](https://openai.github.io/openai-agents-js/guides/models/) supports custom providers/base URLs and Chat Completions. It is a potential later orchestration option, with provider compatibility and tracing/privacy settings requiring deliberate verification. It is not installed or used here.

These are architectural choices, not a benchmark or a claim that one framework is universally safer or faster.

## Exported interface

`agent-library-tools.js` exports:

- `LIBRARY_TOOL_DEFINITIONS`: deeply frozen Chat Completions function schemas
- `LIBRARY_AGENT_LIMITS`: fixed bounds
- `LIBRARY_SYSTEM_PROMPT`: retrieval-specific addition to the existing product/system prompt
- `LibraryToolError`: a sanitized error with a stable `code`
- `assertLibraryOutboundSafe(value)`: conservative outbound identifier screening
- `createLibraryToolSession({storage,userId,libraryConsent=false,currentCaseId=null,signal,now=Date.now})`

Only the server may construct this session. `userId` comes from the authenticated session, never the browser request or model. `storage` is the application's existing own-user-scoped storage object. The optional current case is checked again on read; seeding its ID does not bypass ownership.

The returned object has:

- `tools`: the two definitions when `libraryConsent === true`; an empty array otherwise
- `executeRound(toolCalls)`: accepts one or two complete Chat Completions function call objects, each exactly `{id,type:'function',function:{name,arguments}}`
- `getSources()`: a detached, JSON-serializable array of bounded source references
- `getStats()`: `{rounds,calls,resultChars,sourceCount}`

`executeRound` returns `{messages,activities,sources,stats}`. Each message is `{role:'tool',tool_call_id,content}` where content is the serialized bounded result or `{ok:false,error:{code}}`. Append those messages after the matching assistant tool-call message before the next provider request. Preserve call IDs, but do not log them as arbitrary model text.

Malformed envelopes, missing consent, exhausted rounds, cancellation and timeout throw `LibraryToolError`. Individual argument, record or storage errors become sanitized tool results. Do not turn an error into successful retrieval. The module calls only allowlisted storage reads; it does not call a provider, filesystem, logger or network, and cannot mutate records.

## Two tools

### search_library

Arguments are exactly `{kind,query,clientId,caseId}`. Kind is `all`, `client`, `case`, `asset` or `artifact`; query is at most 120 characters; association filters are a UUID or null. Unknown keys, control characters, invalid IDs and missing properties are rejected. Filters check current ownership, and a case/customer mismatch returns `LIBRARY_NOT_FOUND`.

Literal case-insensitive, NFC-normalized matching covers:

- Customers: display names
- Cases: titles
- Assets: original filenames and existing extracted-text index
- Artifacts: titles and document kinds

It does not search case bodies, artifact bodies, conversation history, binary pixels, embeddings or the web. It does not accept SQL, regex, wildcard syntax or model-selected result limits. A query containing punctuation is a literal string.

At most eight total results are returned, each with allowlisted metadata, `sourceId`, a plain-text snippet of at most 240 characters and `matchScope`. Titles are limited to 160 characters with explicit `titleTruncated`. `truncated` marks omitted result rows; `exhaustive:false` is always explicit. Broad all-category searches may need a narrower category/query. Existing storage caps bound internal scans to 100 customers, 100 cases, 200 assets and 500 artifacts per user.

### read_library

Arguments are exactly `{kind,id,offset}`. Kind excludes `all`; ID is a UUID; offset is an integer 0..50,000. Client/case offsets must be zero. Asset/artifact offsets select sanitized extracted-text windows and count JavaScript UTF-16 code units, not PDF pages or spreadsheet cells.

The record must have been returned during this request or be the server-selected current case. A fresh scoped lookup runs for every read. A guessed, undiscovered, foreign or deleted record returns the same `LIBRARY_NOT_FOUND` code.

Client reads expose bounded metadata. Case reads expose a total text allowance of 6,000 characters across allowlisted fields, confirmation/conflict flags, document context, issues and source text; each shortened value carries its own truncation flag. They do not include legacy drafts, messages or unrestricted provenance.

Asset/artifact reads expose at most 6,000 text characters plus `offset`, `endOffset`, `textLength`, `offsetBasis`, `textStatus` and `truncated`. Asset metadata preserves extraction-unavailable/truncated flags. No original bytes are read or sent. A stored image without OCR remains unreadable by this tool. Artifact metadata includes draft/final status, immutable version, source/current case versions, staleness and regeneration flags. A historical document is not presented as current approval.

## Fixed request limits and failure behavior

- Three tool rounds, two calls per round, six calls total
- 4,096 characters per serialized argument string
- 24,000 serialized tool-result characters across all tool messages, with space reserved for remaining error envelopes
- At most 48 source references; at most six read-window references per source
- 90-second session deadline and abort-signal checks

The surrounding chat route must retain its own whole-request 90-second abort deadline, including provider waiting, plus its existing quota, concurrency and persisted-turn deduplication checks. Never create a new tool session per provider round; that would reset its security budgets. A bounded module does not make an unbounded provider loop safe. End tool use at the limit and produce an honest limited/incomplete outcome or a final tool-free answer. Do not silently retry a partially emitted paid request.

Relevant codes: `LIBRARY_CONTEXT_INVALID`, `LIBRARY_CONSENT_REQUIRED`, `LIBRARY_ARGUMENT_INVALID`, `LIBRARY_TOOL_UNKNOWN`, `LIBRARY_NOT_FOUND`, `LIBRARY_SENSITIVE_DATA`, `LIBRARY_UNAVAILABLE`, `LIBRARY_RESULT_LIMIT`, `LIBRARY_TOOL_LIMIT`, `LIBRARY_ABORTED`, `LIBRARY_TIMEOUT`. Raw database exceptions, SQL, filesystem paths and credential values never appear in these errors.

## Consent, prompt safety and data minimization

Explicitly saving a private original is separate from sending its text to a model. Add a request-level `libraryConsent` boolean, default false, with UI wording explaining that relevant saved-record excerpts will be sent to DeepSeek. The existing general chat consent alone must not silently enable the library. Do not accept model-provided system prompts, owners, SQL, filesystem paths or provider options.

The current product remains limited to synthetic or thoroughly de-identified working inputs until production data-processing terms and authorization are resolved. The module rejects obvious sensitive identifiers/credential labels in outbound titles, snippets and full source text before clipping, including sensitive suffixes beyond the selected excerpt. This is a conservative safety gate, not complete PII detection, de-identification or a production privacy certification.

Retrieved documents and filenames are untrusted evidence. Control and bidirectional override characters are removed from displayed excerpts; HTML-like text is preserved as literal data and must be rendered with text APIs, never HTML execution. Prompt injection cannot authorize broader retrieval, writes or network access. Sanitization is not a claim that malicious instructions disappear from prose.

Use `LIBRARY_SYSTEM_PROMPT` alongside existing HCV boundaries, locale handling and English formal-draft rules. It requires source-grounded answers, honest search/read limits, visible unknown/conflicting/stale facts, reuse of resolved context, and no automatic fact confirmation, saved artifacts, sending, signing, screening, eligibility or rent decisions. It never asks for or exposes hidden reasoning.

## Source references and activities

Source labels such as `S1` are server-issued and request-scoped. References contain only allowlisted kind/record ID/version/title/date/status metadata, retrieval state and bounded excerpt positions. They contain no fabricated URLs, original path, owner ID, raw body, provenance snapshot or binary data. A new record version gets a distinct label. Caller mutation cannot alter internal reference state.

For durable citations, the integration must persist references with the assistant message and its server `requestId`, retaining the pair `(requestId, sourceId)`. References are persistence-capable data; this module does not itself write them. Do not render transient labels as durable sources if that storage integration is missing. Any later open action must recheck authorization and current status.

`activities` contains fixed `phase` values (`searching`, `reading`, `retrieving`), fixed `state` values (`started`, `completed`, `error`), and only an optional result count or stable error code. Forward these as an SSE activity event; never expose raw tool arguments, query text, filenames, document text, model reasoning or provider payloads. These synchronous read activities can be delivered together after the bounded round completes. Do not fabricate incremental progress or token animation.

Log only server request metadata, allowlisted tool name, count, duration and sanitized outcome. The module logs nothing itself. Existing answer `delta` events must continue to come from actual provider content, and `done` must remain contingent on durable assistant storage where persistent chat is enabled.

## Evidence and remaining integration work

Run `node --test agent-library-tools.test.js` for real temporary SQLite tests covering ownership/admin isolation, explicit consent, literal/association search, malformed arguments, prompt-injection filenames/text, outbound identifier screening, stale versions, case review flags, unavailable text, record deletion/fresh reads, bounds, cancellation and sanitized storage failures. Asset fixture metadata is deliberately authored for retrieval tests; those fixtures are not parser or image-decoder acceptance.

The standalone suite does not prove paid DeepSeek tool calling, provider schema support, HTTP/SSE integration, persisted citation storage, browser rendering, UI consent, deployment or production privacy readiness. Those remain explicit integration/release gates. Add the suite to the aggregate test command and add the module to the syntax-check command when integrating; those shared package scripts are outside this isolated slice.

Observed local evidence on October 7, 2026, with Node 24.19.0 and pinned dependencies installed using `npm ci --ignore-scripts`: the 12 new retrieval tests passed; the existing `npm run check` passed; all 251 existing `npm test` checks passed. The new module and test also passed separate `node --check` commands. The first aggregate attempt before dependency installation failed on missing image/workbook packages; the installed-dependency rerun is the passing result above. No real provider request, browser acceptance or deployment was performed for this slice.
