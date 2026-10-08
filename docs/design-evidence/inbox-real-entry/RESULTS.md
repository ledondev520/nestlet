# Visual retest — integrated candidate PR #42, head `10179fb`

Reviewer: Kimi (visual lane, PR39 runtime ownership released). Date: 2026-10-08.
Candidate: draft PR #42, exact head `10179fb064a95a75be43c630b23c3009b0ec0299`, real main entry `/`, production build served by the real server. Local source-build review — not a deployment claim. Fixtures: one synthetic case, one seeded 6-message synthetic conversation (direct SQLite insert, same method as the repo's browser specs), one draft artifact saved through the real message action. No provider calls; DeepSeek stayed unconfigured (composer honestly disabled).

## Verdict summary

The integration holds up visually: three-column Inbox on desktop, single-center + modal drawers on mobile, warm-neutral/forest/apricot system coherent across all five views in both languages, zero console errors anywhere. Two **Failed** items and three polish notes below.

## Passed

| Check | Evidence |
| --- | --- |
| Compact composer without checkbox stacks; disclosure + settings link present; honest DeepSeek-unconfigured state | r10, r23 |
| First-use library permission: explicit opt-in dialog (取消 / continue without / allow), default off, no silent enable, revocable, Escape does not grant | r29 |
| Composer/action reachability, populated thread: last message → composer gap 96px at absolute bottom; `scroll-padding-bottom: 140px`; focused message actions never covered | r20, r23, measured rects |
| Drawers (390/320px): `role=dialog` + `aria-modal`, initial focus inside, Tab containment, inert background | r21, r22, r26, r27 + measurements |
| Model popover: click + keyboard (Enter opens, Escape closes, focus returns), body portal correctly themed to warm tokens (bg #faf9f6, forest #1f4a33) | r04, r14 |
| One current-case identity (single visible title; other matches are hidden views) | measured |
| Horizontal overflow: none at 320/390 across all five views, both languages | measured |
| Facts/material/source discovery in context panel (readiness + facts + materials + versions + official references collapsed) | r03, r15 |
| Long bilingual content: long SFHA titles wrap inside the panel; CJK/Latin mixed thread renders cleanly | r02, r15 |
| Console errors | none on any surface/viewport/language |

## Failed

1. **Rail drawer Escape does not return focus to its toggle (390px).** Focus inside → Escape closes the drawer but focus lands on `main.wb-center` instead of the "打开客户与事项列表" trigger. The context drawer returns focus correctly — asymmetric. (In frozen PR39 this returned correctly, so the regression likely lives in the integration's rail-close path.) Keyboard users lose their place after closing the case list.
2. **English right-panel CTA overflows its panel (1280px, en).** "Finish and preview English document" renders 276px wide and clips 4px past the viewport's right edge (r16). The zh equivalent fits. Likely needs `min-width: 0`/wrap on the action in the narrow panel.

## Polish notes (not blocking)

3. **320px topbar wraps to four rows** (~200px tall, ~29% of the viewport) — toggle/brand, account cluster, EN, panel toggle (r25). Consider a tighter two-row arrangement at ≤390px.
4. **Permission dialog a11y nits:** `aria-modal` is absent (background uses `aria-hidden` on siblings instead — acceptable pattern, but `aria-modal="true"` on the dialog is the clearer contract), and Escape does not restore focus to the trigger (lands on `document.body`).
5. **Model popover tab order:** reachable only after ~36 Tabs from the top (it follows the entire right panel). Operable, but a skip-link or earlier position would help keyboard-heavy owners.

## Not run (honest)

Live DeepSeek streaming, proposal/review cards in motion (no provider key; composer send disabled throughout), real-device soft keyboard, screen readers. The library-permission grant was exercised and then revoked to restore state; the state label now reads "已关闭" (revoked) instead of pristine "尚未授权".

## Screenshot index

r02 chat populated zh (baseline) · r03 documents zh · r04 model popover zh · r10–r13 chat/materials/customers/settings zh 1280 · r14 model popover open · r15 official references expanded · r16–r19 chat/materials/documents/settings en 1280 · r20–r23 chat/rail drawer/context drawer/composer 390 zh · r24 chat en 390 · r25–r27 chat/rail/context 320 zh · r28 chat en 320 · r29 library permission dialog
