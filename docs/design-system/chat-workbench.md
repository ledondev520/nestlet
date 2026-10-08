# Chat-first workbench — layout and component contract (v2, 2026-10-08)

Status: proposed. Implements dispatch 2026-10-08 r2 (Issue #31) with the
owner-approved warm-forest reference (PR #35, head `6cf14c9`). Supersedes the
"working paper" beige/serif direction for the product UI; the v1.1 documents
remain as historical record. Design/lane owner: Kimi. Functional integration,
auth, API contracts, persistence and state remain root-owned.

## Translation of the approved reference

The poster (warm cream field, deep forest green, one apricot user bubble,
compact sans-serif) translates into the application as:

| Poster element | Application token role |
| --- | --- |
| Warm cream field | `--paper` canvas, `--sheet` surfaces (warm neutral white) |
| Deep forest field | `--forest` — navigation, primary actions, focus ring, selected state |
| Apricot user bubble | `--apricot-tint` — user bubbles, highlight marks (restrained) |
| Coral underline stroke | `--coral-deep` — error status, accent text on light fills |
| Poster headline/photo/plants | **Not imported.** No photography, no poster-scale type in the workbench |

Contrast floor: body text ≥ 4.5:1, large/bold ≥ 3:1; forest `#1f4a33` on
warm white `#fdfcf8` ≈ 10:1; muted informational text `--faint-strong`
`#5b6355` ≈ 5.5:1. Status colors are never the only signal (text labels
always accompany).

## Architecture

Desktop (≥ 961px): three columns —

1. **Left rail (264px):** customers/cases list. Whole-row 44px targets,
   selected row = forest tint + 3px inset bar. Read-only presentation;
   selection reports upward.
2. **Center (fluid):** the conversation is the primary workspace. Sticky case
   identity header (blurred warm sheet), messages, docked composer. No
   permanent workflow/search forms stacked above the conversation.
3. **Right context panel (320px, collapsible):** current facts/readiness,
   files/materials status, artifact versions, and the official-reference
   panel (collapsed by default). Contextual, never blocking the center.

Mobile (≤ 960px): single center column; rail and context become modal drawers
(scrim, Escape closes, focus returns to the toggle, safe-area insets
respected). Composer and primary actions stay reachable at 320px and 390px.

## Interaction contract (good-css vetted checklist applied)

- Keyboard: every control focusable with a 2px forest `:focus-visible`
  outline; drawer Escape/close/return-focus; tab order rail → center →
  context.
- Hit areas: icon buttons and rail rows ≥ 44px; adjacent targets do not
  overlap; overflow does not clip focus rings.
- Motion: 180–220ms named-property transitions only, gated behind
  `prefers-reduced-motion: no-preference`; state is fully conveyed without
  animation.
- Text: long Chinese/English titles ellipsize with full text in `title`;
  200% zoom and 320px width verified without horizontal overflow.
- Scroll: center column owns conversation scrolling with
  `scroll-padding-block-end: 140px` so anchored or focused content (proposal
  cards, apply/cancel) never lands under the sticky composer — this repairs
  the r1 full-page-capture concern at the layout level.
- Status notices: neutral information is recessed (`--note-info-bg`), success
  uses `--ok-tint`, conflict/warning keeps the accent wash — resolving
  PR #27 finding F1 at the token layer.

## Preserved gates (unchanged, root-owned)

Explicit apply/cancel on conversation proposals, version/conflict handling,
dirty-input protection, provenance display, privacy/consent checkboxes, and
all auth/email behaviors remain functionally byte-identical; the workbench
reuses the real feature components without editing them.

## Phasing

- **Phase 1 (this draft PR):** `frontend/workbench/**` + `workbench.html` +
  `vite.workbench.config.mjs` + this document + evidence. New files only; the
  production static allowlist and all shared runtime files are untouched. The
  preview runs on the dev server / separate preview bundle, never through the
  production allowlist.
- **Phase 2 (root-coordinated):** precise presentation-only hunk proposals
  for `frontend/styles.css` (token swap), `frontend/App.jsx` /
  `components/application-shell.jsx` (shell adoption), chat `index.jsx`
  (header/composer mounting). No edit before the hunk handoff is ACKed.
