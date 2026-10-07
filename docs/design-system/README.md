# Nestlet design system — "working paper" v1

Status: implemented and browser-verified in `public/style.css` on `design/kimi-k3-frontend` (tip `d137191`, 2026-10-07). This document is the reusable contract for the React/Vite/shadcn migration. `tokens.css` is canonical; `tokens.json` mirrors it for JS consumption.

## Principles

1. **A desk, not a dashboard.** The product is one case's paperwork. Warm paper canvas, ink text, sheets as panels, hairline rules. Nothing glows, nothing gradients.
2. **One accent.** Cinnabar `#b8402a` (the seal/stamp color of Chinese official paper) marks the current step, the primary action on hover, focus rings, and the DRAFT stamp. No second accent, ever.
3. **Honest states over decoration.** Empty, loading, disabled, error, conflict, unknown and stale are designed states, not afterthoughts. Motion never hides request state.
4. **Bilingual by construction.** zh-CN first. CJK text never gets uppercase transforms or wide letter-spacing; Latin small labels may use them. Generated formal documents stay English regardless of UI language.
5. **Serif for voice, sans for work, mono for data.** Display/headings use the serif stack; body and controls use the sans stack; numbers, endpoints, counts and source excerpts use the mono stack with tabular figures.

## Color and surfaces

- Canvas `--paper`, raised surface `--sheet`, recessed `--paper-deep`. No pure white, no pure black, no dark sections inside the light page.
- Borders are hairlines (`--hairline`); interactive borders strengthen to `--hairline-strong` and then `--ink` on focus/hover.
- Shadows are warm-tinted (`--shadow-sheet`), suggesting one light source.
- Contrast floor: informational text ≥ 4.5:1 (use `--faint-strong`, never `--faint`, for anything meaningful; `--faint` is decoration-only). Measured: faint-strong is 5.6:1 on sheet, 5.2:1 on paper.
- Status: success `--ok`/`--ok-tint`, warning `--warn`/`--warn-tint`, error/conflict `--accent-deep`/`--accent-tint`. Error banners are left-railed (3px accent bar), not filled red blocks.

## Typography

| Role | Spec | Usage |
| --- | --- | --- |
| Display | 700 30px/1.3 serif | workspace h1 only |
| Title | 700 19px/1.35 serif | panel headings, brand wordmark (23px) |
| Body | 400 14px/1.75 sans | default UI text |
| Small | 400 12px/1.65 sans | metadata, help, hints |
| Micro | 10–11px sans | badges, format labels (letter-spacing ≤ .08em, Latin only) |
| Data | 11px mono, tabular-nums | char counts, review tallies, endpoints, versions |

Orphan control: `text-wrap: balance` on display headings. Inputs on mobile are 16px to prevent iOS zoom.

## Layout

- Shell max 960px, single centered column; one stage visible at a time (the staged flow is a product invariant, not a style choice).
- Step rail: 3 steps share a bottom hairline; current step has a cinnabar underline and filled number disc; completed steps get ink numbers; upcoming steps are readable muted (no compounded opacity).
- Panels are sheets: `--sheet` bg, 1px hairline, `--radius-panel`, `--shadow-sheet`, padding 30/34 desktop → 20/18 mobile.
- Breakpoint 760px. At mobile: tools compress, the model pill hides, step labels shrink, card grids collapse to one column, rows wrap. 320px must remain usable (WCAG 1.4.10).
- No sticky panels covering actions; no horizontal overflow; long user content always `overflow-wrap: anywhere` inside `min-width: 0` tracks.

## Component states

Every interactive component ships: default / hover / active (`scale(.97–.98)`) / focus-visible (2px `--accent` outline, 2px offset) / disabled (opacity .42, no color-only signal).

- **Primary button:** ink bg, paper text; hover turns cinnabar. One per view.
- **Secondary:** recessed bg + strong border. **Ghost:** sheet bg + strong border. **Link:** accent-deep text, underline appears on hover.
- **Badges** (review status): square-ish 4px radius, 10px, tinted backgrounds — reviewed = ok-tint, conflict = accent-tint + accent-deep text, unknown/needs-review = paper-deep.
- **Inputs/textareas/selects:** recessed bg → sheet bg on focus; border strengthens to ink. Never placeholder-as-label.
- **Disclosures** (`<details>`): small accent-deep summary; content indented with hairline-left source blocks (mono) for evidence.
- **Chat:** user bubbles right-aligned, recessed fill, `--radius-bubble-user`; assistant replies left, unboxed, serif-adjacent calm; streaming cursor is a cinnabar caret (disabled under reduced-motion); interrupted replies keep partial text + a warning line, never a success style.
- **DRAFT stamp:** the only rotated element in the system (−1.5deg), cinnabar border + tint, letterspaced Latin small-caps. Use once per artifact panel.

## Motion

180–250ms `--ease-standard` on color/border/transform only. No layout-thrashing properties. No entrance animations on nodes that re-render per keystroke. `prefers-reduced-motion`: all transitions/animations off, smooth scrolling off.

## Accessibility commitments

Keyboard-visible focus everywhere (verified with real Tab navigation, not programmatic focus alone); status updates use `role="status"`/`role="alert"` without moving focus; pointer targets ≥ 24px via label padding where the control itself is smaller; programmatic page language follows the UI locale; print stylesheet isolates the export artifact.

## For the shadcn/Vite migration

- shadcn's HSL CSS-var theme maps cleanly: set `--background`/`--card`/`--popover` = paper/sheet family, `--primary` = ink (hover accent), `--destructive` = accent-deep, `--ring` = accent, `--muted(-foreground)` = paper-deep/faint-strong, `--border`/`--input` = hairline/strong. Keep hex values from `tokens.json`; do not adopt the default shadcn gray/slate palette.
- Default shadcn radius (0.5rem) → use `--radius-control`/`--radius-panel` as given; badges are 4px, not pills (pill reserved for the static model label).
- The model pill carries **no status dot** — connection state lives only in the settings panel (reviewed finding O1).
- Serif display + CJK rules above are part of brand identity; a migrated screen using Inter/Geist for headings is a regression, not a variant.
- Logo (`public/logo.svg`) is original artwork: ink rounded square, paper roof-line, three document lines, cinnabar last line. Keep geometry; recolor only via tokens.
