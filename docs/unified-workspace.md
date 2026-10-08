# Unified workspace

## User-facing structure

- Global app navigation: Conversation, Materials & facts, Customers, Documents. Desktop navigation is in the top bar; small screens keep the same navigation in a row directly below it, outside the conversation panel.
- Top-right controls: model (owner capability only), settings, language, account/sign out. Settings is an independent page with a selected gear and an explicit return action. Return preserves the prior route and mounted conversation/editor state.
- Left rail: new conversation, saved-record search, one conversation history. Search input and its action stay on one row. Saved conversations open their exact persisted IDs rather than whichever conversation happens to be newest in a case.
- Center: active conversation, messages, review actions, composer. An empty workspace introduces the assistant and offers up to three grounded continuation links. New accounts receive a small set of starter prompts; clicking a starter fills the composer rather than silently sending it.
- Optional right context: saved case facts/materials/documents and references, with its existing mobile drawer and review boundaries.

## Data ownership

A conversation owns its persisted messages. Existing case/customer associations remain unchanged and are still enforced server-side. Canonical materials, reviewed facts and document versions remain in their existing editors. AI suggestions do not silently overwrite those records. Existing provenance, version checks, permission dialogs and account isolation remain authoritative.

The history index is read-only metadata from the authenticated account. It does not load full transcripts or call a provider. Suggestions call a conversation unfinished only when its last assistant response is incomplete or its current linked document version remains a draft. Ordinary history is described as continuation, without inventing tasks or deadlines.

Conversation titles come from the canonical title field; case names are not used as conversation titles. AI generation is a separate bounded post-reply operation. The client can perform two scoped title refresh reads (1 and 5 seconds) without replacing transcript or composer state.

## Acceptance journey

1. Sign in and inspect the welcome/history. Opening or searching must not call a provider or create records.
2. Open an exact prior conversation; revisit the same item without resetting a typed draft.
3. Start a new conversation, send a genuine turn, and verify automatic title generation separately from primary reply/save success.
4. Open an exact source, edit/save in the authoritative editor, then return to the original conversation without losing unsent text.
5. Open Settings, verify selected state and stable owner model entry, then return to the same route, conversation and scroll position.
6. Repeat at desktop, 390px and 320px; inspect actual screenshots, composer visibility, top navigation, inline search, popover bounds, focus/Escape and drawer dismissal.
7. Check dirty-switch cancel/accept, deleted or foreign links, account changes, Back/Forward and interrupted-save/session recovery.

## Evidence boundary

The older PR42 desktop capture was inspected as a historical reference, not as evidence of this candidate. Current local Chromium cannot launch because executor socket access is blocked. The updated `inbox-entry.spec.js` and model-popover scenarios must run in the official browser CI on the final integrated SHA before visual acceptance. Local HTTP, SQLite, React DOM and build checks are useful functional evidence, not a replacement for that browser review.

Reference patterns: [shadcn sidebar composition](https://ui.shadcn.com/docs/components/base/sidebar) and [Slack simplified top navigation](https://slack.com/help/articles/41214514885907-Use-simplified-layout-mode-in-Slack). These informed the separation of global app navigation, history and focused content; the existing Nestlet warm-white, forest and apricot palette is retained.
