# Workbench evidence — design/inbox-warm-forest Phase 1

Source: branch `design/inbox-warm-forest`, base `main` @ `05923a88156d8d2d1c497d22c3ef56414452d063`.
Rendered via the preview-only vite config (`vite.workbench.config.mjs`, dev server) against a real local backend (main @ 05923a8) with synthetic fixtures only. This is a source-build design preview — not a production deployment, not functional acceptance.

## Screenshot index

| File | Surface / state |
| --- | --- |
| w11-d-chat-case-zh | Chat, case selected (desktop zh) |
| w12/w13/w14/w15-d-*-zh | Materials / Documents / Customers / Settings (desktop zh) |
| w16-d-chat-context-collapsed-zh | Right context panel collapsed |
| w17-d-chat-context-open-officialref-zh | Context open, official references expanded |
| w18/w19/w20/w21-d-*-en | Chat / Materials / Documents / Settings (desktop en) |
| w23-m-chat-case-zh · w27-m-chat-case-en | Chat, case selected (390px, zh + en) |
| w24-m-rail-drawer-open-zh | Rail drawer open (390px) |
| w25-m-context-drawer-open-zh | Context drawer open (390px) |
| w28-s-chat-case-zh | Chat, case selected (320px) |
| w29-s-rail-drawer-open-zh | Rail drawer open (320px) |
| w31-640-reflow-zh | 640px CSS width = real 200% browser zoom at 1280: single-column reflow |
| w22-d-chat-zoom200 | body-zoom-2 artifact capture (kept for the record; see findings) |

## Interaction checklist results (good-css vetted checklist)

| Check | Result | Evidence |
| --- | --- | --- |
| Keyboard focus visible (2px forest outline, `:focus-visible`) | **Passed** — tabs, rail items, drawer toggles | w24, measured `outline: 2px solid rgb(31,74,51)` |
| 44px hit areas (icon buttons, tabs, rail rows) | **Passed** — all ≥ 44×44px | measured offsets |
| Drawer Escape close + focus return to trigger | **Passed** — both drawers, 390px | activeElement aria-label verified |
| Horizontal overflow 320/390px, all views, zh+en | **Passed** — `scrollWidth == clientWidth` everywhere | measured |
| Composer/action reachability (scroll-padding) | **Passed** — `.wb-center` has `scroll-padding-block-end: 140px`; composer in-flow after messages; last interactive content clears the stuck composer | measured rects |
| 200% text enlargement | **Passed** via real-viewport equivalent (640px CSS width reflows to single column + drawers) | w31 |
| Reduced motion | **Passed (static)** — all transitions gated behind `prefers-reduced-motion: no-preference`; no animation carries information | `workbench.css` |
| Long bilingual content | **Passed** — rail items ellipsize; long SFHA source titles wrap inside the context panel | w17, w25 |
| Console errors during evidence pass | **Passed** — zero errors across all views/viewports | browse console |
| Live model streaming / proposal-card rendering | **Not run** — DeepSeek not configured in the review environment (honest disabled state visible in shots) | w11 |
| Real device / screen reader | **Not run** — no authorized devices | — |

## Findings and resolutions in this pass

1. **200% zoom center crush (initially reported):** caused by the `body.style.zoom=2` probe method, which doubles content without changing CSS viewport width. Real browser zoom changes CSS pixels; verified at the equivalent 640px CSS width that the single-column + drawer layout engages (w31). No defect after method correction; capture kept as w22 for transparency.
2. **320px brand wrap ("秘" dropping to a second line): fixed** — `.wb-brand` now `white-space: nowrap` with compact padding ≤640px; re-verified no overflow.
3. **Mixed-language readiness labels in en UI: fixed** — context panel now passes `?locale=` to the readiness endpoint.
4. Known, accepted for Phase 1: the view tab strip scrolls horizontally at 390/320px (no document overflow); drawer open state persists across viewport resizes (no functional impact).

## Feature preservation note

All center surfaces are the real production feature components imported unchanged
(`ChatPage`, `IntakeWorkspace`, `CustomerWorkspace`, `DocumentsPage`, `SettingsPage`,
`AuthPanel`, `AgencyGuidance`). The workbench composition omits ChatPage's optional
`onOpenMaterials`/`onOpenDocuments`/`onOpenSourceCase`/`onImportFiles` callbacks so the
permanent workflow card and search form no longer stack above the conversation; the same
destinations remain reachable through the view tabs and the context panel, and ChatPage's
built-in fallbacks (notice instead of import handoff) apply. No functional file is edited.
