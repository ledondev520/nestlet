# Grounded current-turn fact review

The specialized lane handles a deliberately small, action-dominant command grammar. It does not classify arbitrary language, infer permission from history, or replace general chat.

## Supported command boundary

A saved conversation and explicit action consent are still required. Only the **current user message** selects the lane; no model output or historical message can select it. There is no new client-supplied privilege or database schema.

Supported commands include:

- `请帮我准备一张冲突核对预览。`
- `请准备一张核对预览，并简单告诉我接下来该怎么做。`
- `请帮我准备一张核对预览，先预览、不要保存。`
- `Prepare a review card. Do not save.`
- `Please prepare a conflict review preview. Keep the current rent unchanged.`
- `能帮我准备一张冲突核对预览吗？` / `Could you prepare a review card?`
- `物业地址：128 Example Lane。业主：Synthetic Property LLC。收件人邮箱：recipient@example.invalid。请帮我准备一张核对预览。`
- `The current rent is USD 2,100.50. I saw an unverified rent of $2,200.75. Could you prepare a conflict review preview?`

One command can be accompanied only by the explicitly recognized next-step/safety qualifiers, numeric-rent evidence/preservation sentences, or known property/owner/recipient/sender/contact labels followed by scalar evidence. Labelled evidence is retained as data, not treated as another command; unquoted coordination clauses are rejected. Quoted scalar values support punctuation other than sentence terminators. The authored live regression's prior confirmed rent and newly unverified rent preamble is included in that grammar. Comma-grouped integer and one/two-decimal amounts with supported dollar/USD/yuan markers are accepted. Explicit polite action requests above are supported; capability/how-to questions are not. Arbitrary field preambles, unfamiliar currency/number formats, unusual syntax, quoted commands/examples, multiple commands, or additional substantive work are **not** broadly inferred. They retain the existing ordinary-chat path. For example, adding “summarize the conversation”, “列出还缺哪些材料”, or “不过我只是举个例子” does not select this lane. This is bounded command coverage, not a universal natural-language guarantee.

All original user messages remain stored unchanged. Existing bounded history selection limits still apply. Only this lane projects known assistant operational/protocol commentary out of provider replay and source-catalogue excerpts. The projection is not a declaration that an old action failed: historical transient successes also lack durable receipts. Source IDs, eligibility, case facts, stored history and canonical selected assistant draft bytes are unchanged. Ordinary conversation context is unchanged.

## Provider contract and orchestration

The [official DeepSeek Chat Completions API](https://api-docs.deepseek.com/api/create-chat-completion/) documents named function choice with `tool_choice: {type: 'function', function: {name: 'prepare_case_suggestion'}}`. Its forced choices require non-thinking mode; the existing adapter sends `thinking: {type: 'disabled'}`. The configured endpoint and model remain unchanged. No beta endpoint or strict mode is enabled. Documentation was checked on 2026-10-08; this is contract verification, not live-provider acceptance.

Only the read-only prepare tool is advertised in this lane. Model text is discarded rather than streamed or saved. Arguments still pass the existing ownership, source, shape, version and aggregate-budget validation. Invalid calls may receive the existing bounded repair guidance for at most three rounds. A successful preparation completes immediately without another provider prose round. A no-tool stop, no source or exhausted repair yields a truthful server-authored no-preview acknowledgement; unsupported provider responses never silently fall back to free prose.

New clients explicitly advertise `reviewResultVersion: 1`; unknown versions fail validation. Existing clients without the capability receive their familiar proposal/text/done events only after the same validation and assistant persistence. Their existing UI requires done before enabling a card, and interruption clears pending actions. This avoids silent loss of results on already-open older pages, without forcing re-login.

The server revalidates proposals against current scoped case state, saves the neutral historical assistant acknowledgement, and only then sends one complete `done.reviewResult` frame to capable clients containing the exact proposals, text and receipt. The browser validates the entire envelope, every proposal and identity, before expanding it into existing proposal/text/completion events. A partial frame cannot expose a card or success text. A save failure or cancellation cannot turn hidden model narration into saved success. A save followed by lost delivery may retain the neutral preparation record, but it never claims that transient controls are currently displayed. Current confirmation/cancel instructions remain on the actually delivered review card.

No case fact, document, approval or submission is written by preparation. Existing explicit human review controls remain the sole mutation path.

## Content-free evidence

Scoped requests emit an allowlisted `review_operation` operational log and, after successful persistence/delivery, a request-correlated receipt in the atomic completion. Counters distinguish provider requests, prepare/other tool calls, repair attempts/errors, validated proposals and emitted proposals, with bounded finish/outcome/reason enums. They exclude arguments, message text, source IDs, document content and credentials. “Emitted” describes server delivery, not proof a browser rendered or a person saw it. Failed/cancelled requests retain separate outcomes. No durable action-audit schema is introduced; this cannot reconstruct old tool calls from historical prose.

Ordinary no-action chat retains normal streaming and gains no extra status card or receipt UI. Canonical preparation acknowledgements are historical and do not assert visible controls on reload.

## Verification boundary and rollback

Synthetic protocol tests, actual local HTTP/SQLite tests, parser tests and official Chromium fixtures exercise polluted history, false pre-tool narration, no-tool stops, invalid-source repair/exhaustion, provider rejection, persistence failure, cancellation, atomic frame parsing, source/identity preservation, neutral reload history and ordinary-chat compatibility. Browser fixtures author provider output and make no live model call. Actual historical-conversation provider acceptance remains separate.

Rollback is a revert of the bounded code change and rebuilt assets. No database migration or data rollback is needed.
