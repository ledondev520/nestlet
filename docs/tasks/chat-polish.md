# Chat and sign-in polish

Owner: local Codex. Base: c540c89862bbd4c5534b09e083f1db03de36eaac. Scope: chat presentation, global footer, login convenience, optional session idle policy, and related tests. Separate checkout and branch codex/chat-polish.

The owner requests removal of repeated consent checkbox prose, sensitive-data warnings, attachment footnotes and synthetic-material/no-auto-submit footer text. Make the conversation feel like a regular chat, and offer convenient remembered accounts/password autofill.

Implementation keeps the existing palette and application navigation. Explicit Send starts the existing provider call without an extra checkbox. There are no background sends. Existing upload limits, account isolation, API errors and retry semantics remain. Messages align by role, the compact composer has attachment/send controls, and Enter sends except while composing with an IME; Shift+Enter adds a line.

Sign-in remembers only the username when selected, uses native autocomplete fields compatible with browser password managers, and offers a show/hide control. Optional rememberMe skips the 30-minute idle expiry within the existing absolute 8-hour session lifetime. Sessions remain server-memory sessions: server restart or sign-out ends them. No password or bearer token is stored in localStorage.

Acceptance: actual form autofill values survive checkbox interaction and are submitted correctly; password never enters web storage; omitted/non-boolean rememberMe retains normal expiry; remembered session respects absolute expiry and logout; chat sends require a user action; desktop/mobile layout remains usable without horizontal overflow.
