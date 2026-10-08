# Workbench evidence — design/inbox-warm-forest

Round 2 head: after first-review iteration (data-integrity, drawer dialog semantics, visual hierarchy). Base `main` @ `05923a88156d8d2d1c497d22c3ef56414452d063`.
Rendered via the preview-only vite config against a real local backend with deterministic synthetic fixtures (direct SQLite seeding, same method as the repo's browser specs; no provider calls). Source-build design preview — not a production deployment, not functional acceptance.

## Synthetic fixtures used

- One synthetic case ("Synthetic review case", id `09928ba2-…`), five reviewed facts.
- One seeded conversation (6 messages, zh+en mixed, clearly synthetic content) inserted directly into the disposable local database — no live model involved.
- One draft artifact ("Conversation draft · ed73a5d1", v1) saved through the real "save answer as unreviewed draft" message action.

## Screenshot index (round 2)

| File | Surface / state |
| --- | --- |
| w40-d-chat-populated-zh | Populated conversation, compact side-by-side consent (desktop zh) |
| w41-d-chat-scrolled-bottom-zh | Scrolled to absolute bottom: last message clears composer by 80px |
| w42-d-chat-midscroll-zh | Mid-thread: composer docked (expected sticky behavior) |
| w43-d-chat-artifact-context-zh | Context panel showing readiness + saved draft artifact |
| w44-d-chat-populated-en | Populated conversation (desktop en) |
| w45-d-documents-with-draft-zh | Documents with the saved draft version (desktop zh) |
| w46-m-chat-populated-zh / w47-m-chat-bottom-zh | Populated chat top / bottom (390px zh) |
| w48-m-rail-drawer-zh / w49-m-context-drawer-zh | Modal drawers with dialog semantics (390px zh) |
| w50-s-chat-en | Chat (320px en) |
| w51-s-rail-drawer-en | Rail drawer (320px en) |
| w31-640-reflow-zh | 640px CSS width (= 200% browser zoom at 1280): single-column reflow |

Round-1 shots w10–w30 remain in git history for reference.

## Interaction checklist (round 2, re-verified on the current head)

| Check | Result | Evidence |
| --- | --- | --- |
| Drawer dialog semantics | **Passed** — `role="dialog"` + `aria-modal`, background inert while open | w48/w49 + attribute inspection |
| Drawer initial focus / Tab containment / Escape / focus return | **Passed** — initial focus lands on first rail item; Tab cycles inside; Escape and scrim close with focus back on the owning toggle; rail selection closes the drawer and moves focus to the center | measured `document.activeElement` per step |
| Hidden drawers non-focusable | **Passed** — `inert` + `visibility:hidden` when closed | attribute inspection |
| Mobile initial load does not auto-open the desktop-expanded panel | **Passed** — `data-open="false"` at 390px on load | measured |
| Composer reachability with populated thread | **Passed** — at absolute scroll bottom, last message bottom → composer top gap = 80px; `scroll-padding-block-end: 140px` keeps focused targets clear | measured rects (w41) |
| 44px hit areas | **Passed** — icon buttons 44×44, tabs 50×44, rail rows 239×44 | measured |
| Horizontal overflow 320/390, zh+en | **Passed** — `scrollWidth == clientWidth` on all views | measured |
| 200% zoom | **Passed with method note** — CSS `zoom` probes do not reflow media queries; real browser zoom was verified by its CSS-pixel equivalent (640px width → single column + drawers, w31). Claim scoped accordingly. | w31 |
| Reduced motion | **Passed (static)** — all motion gated behind `prefers-reduced-motion: no-preference`; visibility flips instantly on drawer open so focus never lands in a hidden element | workbench.css |
| Live model streaming / proposal cards | **Not run** — no provider key in this environment; consent affordances render unchecked and explicit | w40 |
| Real device / screen reader | **Not run** | — |

## Round-2 changes prompted by the first review

1. Data integrity (`context-panel.jsx`, `case-rail.jsx`): state keyed to the exact (userId, caseId, lang, refreshTick) request; switching identity clears immediately; late responses discarded; explicit loading/error states; manual refresh control.
2. Drawer accessibility (`shell.jsx`): full modal semantics as listed above; mobile drawer state separated from desktop panel state.
3. Visual iteration: canvas moved to warm neutral white (`#faf9f6`, yellow cast removed); selected view tab is solid forest; duplicated chat-surface heading removed; consent boxes compacted (side-by-side on wide centers) with all consent text, unchecked defaults and consequences intact; mobile empty-state height reduced.

## Known Phase-1 limitations (for Phase-2 coordination)

- The workbench composition is a preview: production adoption must wrap the existing `AccountWorkspace` (root-owned) so dirty-input guards, workspace epochs, draft vault and handoff callbacks are preserved. ChatPage's optional workflow/lookup/import callbacks are unwired here by design; its notice fallbacks apply.
- The view tab strip scrolls horizontally at ≤390px; acceptable for Phase 1.
- Context panel refreshes on case/language change or manual refresh; event-driven refresh after saves elsewhere is Phase-2 functional wiring (root coordination).
