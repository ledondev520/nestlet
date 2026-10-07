# PR #14 visual review checklist (Kimi design lane)

Apply to every migrated screen, at 1280px desktop, 390px mobile, and 320px-equivalent reflow, in both zh-CN and en. Reference renders: `docs/design-evidence/archive-workspace/` and `docs/design-system/state-board.html` (+ `state-board-*.png`). Any visible divergence from these references without a documented task reason is a defect.

## Token fidelity

- [ ] All colors resolve to `tokens.css` roles — no one-off hex, no default shadcn slate/gray. Spot-check computed styles, not source intent.
- [ ] `muted-foreground` = `--faint-strong` #5f6350 for metadata; `--ink-soft` for secondary body. `--faint` never carries information.
- [ ] Radius roles preserved: badge 4px / control 8px / panel 14px / overlay 12px; pill shape only on the static model label.
- [ ] Primary button = ink → cinnabar on hover; only one primary per region.
- [ ] Focus ring: 2px `--accent` (ring token), offset 2px, keyboard-only (`:focus-visible`); selected state is tint + inset bar, never the ring.
- [ ] The model pill shows no status dot; connection state lives only in settings/account.

## Typography

- [ ] Page and panel headings use the serif stack (Songti SC → Georgia); Inter/Geist headings are a regression.
- [ ] Mono + tabular-nums for counts, versions, endpoints.
- [ ] No uppercase or wide letter-spacing on CJK text; Latin micro-labels ≤ .08em.
- [ ] Document body is Georgia 14px/1.85, max 68ch; not shrunk to fit on mobile.

## Responsive & interaction

- [ ] Inputs/selects/textarea are 16px at ≤760px (no iOS zoom).
- [ ] Touch targets ≥ 24px everywhere, 44px for high-frequency mobile actions (send, back, list rows).
- [ ] 320px reflow: no two-axis scrolling; long case names / URLs / 50k-char documents wrap inside their own container.
- [ ] Bottom actions and composer respect safe-area and remain reachable with the soft keyboard open (verify on a real device when available; otherwise mark Not run).
- [ ] IME composition (中文输入) never triggers send/premature commit; Enter-vs-composition verified.

## Content & states

- [ ] Chat: real SSE deltas only; waiting-for-first-token, streaming, complete, interrupted and failed are visually distinct; interrupted keeps partial text + warning line; no typewriter simulation.
- [ ] Long English documents render readable (serif sheet, not a code block); source provenance sits beside its fact.
- [ ] Stale final artifact: warning banner + regenerate guidance; no plain download link that 409s.
- [ ] Empty ≠ search-miss ≠ error; each has its own copy and recovery action.
- [ ] One obvious next action per screen; destructive actions (delete case) are de-emphasized and name the consequences (conversations and documents go with it).
- [ ] Skeletons only where content is loading; no decorative KPI cards or activity feeds anywhere.

## Accessibility spot checks

- [ ] Computed contrast: body/secondary/muted ≥ 4.5:1; focus ring and selected indicators ≥ 3:1 against neighbors.
- [ ] Status messages announced via `role="status"`/`role="alert"` without moving focus; errors identify the field in text.
- [ ] Page `lang` follows the UI locale; English documents inside a Chinese page carry `lang="en"`.
- [ ] Reduced-motion disables caret blink and all transitions.
