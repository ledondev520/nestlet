# Nestlet design system — "working paper" v1

Status: canonical on main. v1.1 (2026-10-07): ratified the chat-polish floating composer and 20px user-bubble radius as intentional roles after design review of the merged build (PR #17). This document is the reusable contract for the React/Vite/shadcn migration. `tokens.css` is canonical; `tokens.json` mirrors it for JS consumption.

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
- **Chat:** user bubbles right-aligned, recessed fill, `--radius-bubble-user` (20px floating idiom, ratified from the merged chat-polish implementation); assistant replies left, unboxed, calm body text; the composer docks sticky at the bottom as a 20px-radius floating bar (`--radius-composer`) with a soft warm shadow, attachment action left, send right, keyboard hint between (hidden ≤640px); streaming cursor is a cinnabar caret (disabled under reduced-motion); interrupted replies keep partial text + a warning line, never a success style.
- **DRAFT stamp:** the only rotated element in the system (−1.5deg), cinnabar border + tint, letterspaced Latin small-caps. Use once per artifact panel.

## Motion

180–250ms `--ease-standard` on color/border/transform only. No layout-thrashing properties. No entrance animations on nodes that re-render per keystroke. `prefers-reduced-motion`: all transitions/animations off, smooth scrolling off.

## Accessibility commitments

Keyboard-visible focus everywhere (verified with real Tab navigation, not programmatic focus alone); status updates use `role="status"`/`role="alert"` without moving focus; pointer targets ≥ 24px via label padding where the control itself is smaller; programmatic page language follows the UI locale; print stylesheet isolates the export artifact.

## Role map per the design-system contract (§2)

Single source: role → value → where it is used → states. Components consume roles only; exceptions need a task reason.

### Color roles

| Role | Token / value | Used for | States |
| --- | --- | --- | --- |
| 页面 page | `--paper` #f6f1e6 | canvas, recessed inputs | — |
| 正文 foreground | `--ink` #252a20 | all primary text | — |
| 次级正文 | `--ink-soft` #575d4a (4.9:1 on paper) | secondary text, placeholders-as-hints | — |
| 辅助文字 muted | `--faint-strong` #5f6350 (5.6:1 sheet / 5.2:1 paper) | metadata, summaries, counts | hover → `--accent-deep` when interactive |
| 装饰 muted-decor | `--faint` #8d9080 (3.2:1) | non-informational markers only | never for meaning |
| 卡片 card | `--sheet` #fffdf6 | panels, draft sheet, settings drawer | — |
| 浮层 popover | `--bg-overlay` sheet + `--border-overlay` + `--shadow-overlay` + `--scrim` rgba(37,42,32,.32) | dialogs, dropdown surfaces | open/closed; focus trapped only when truly modal |
| 主操作 primary | bg `--ink`, text `--paper` | one per view | hover → `--accent` bg; active scale .98; busy keeps label + spinner-free honest text; disabled .42 opacity + reason in text |
| 次操作 secondary | bg `--paper-deep`, border `--hairline-strong` | supporting actions | hover darkens one step |
| 低强调 ghost/link | sheet+strong border / `--accent-deep` text | tertiary, navigation | link underline on hover |
| 交互高亮 accent | `--accent` #b8402a / `--accent-tint` | current step, focus ring, primary hover, DRAFT stamp | — |
| 边界 border | `--hairline` / hover `--hairline-strong` / focus `--ink` | all separators and fields | — |
| 输入 input | bg `--paper` → focus `--sheet`; border `--input-border` → focus `--ink` | every field | invalid: border `--accent-deep` + linked text error |
| 焦点 ring | 2px `--accent`, offset 2px | every interactive element | keyboard-only (`:focus-visible`); never removed |

### Status roles (信息/等待/成功/警告/错误)

| Status | Text / bg | Used for | Notes |
| --- | --- | --- | --- |
| 信息 info | `--info` #3d5a6c / `--info-tint` | neutral notices, guidance blocks | icon + text, not color-only |
| 等待 waiting/busy | `--ink-soft` / `--paper-deep` + 处理中… text | in-progress rows, progress track | no fake percentages; cancellable path visible |
| 成功 success | `--ok` / `--ok-tint` | saved, reviewed badges | "已保存" only after server success |
| 警告 warning | `--warn` / `--warn-tint` | missing info, stale versions | pairs with guidance text |
| 错误/破坏 error | `--accent-deep` / `--accent-tint`, 3px left rail | failures, conflicts, destructive | says what failed, what survives, next step |

### Typography roles

| Role | Stack / size / weight / line-height | Usage |
| --- | --- | --- |
| 页面标题 | display serif, 30px/700/1.3, `text-wrap: balance` | workspace h1 |
| 区块标题 | display serif, 19px/700/1.35 | panel h2, wordmark 23px |
| 正文/会话 | body sans, 14px/400/1.75 | UI text, chat |
| 字段标签 | body sans, 12px/600 | labels, table heads |
| 辅助文字 | body sans, 12px/400/1.65 | hints, metadata |
| 文档正文 | Georgia serif, 14px/1.85 (print 11–12pt/1.5) | English draft/artifact reading |
| 等宽数据 | mono, 11px, tabular-nums | counts, endpoints, versions, excerpts |

CJK: no uppercase transform, letter-spacing ≤ .02em. Latin micro-labels: ≤ .08em, small-caps allowed.

### Spacing / size roles

| Role | Value | Usage |
| --- | --- | --- |
| 页边距 page margin | 40px desktop / 16px mobile | shell padding |
| 区块距 section gap | 20–24px | between panels and major blocks |
| 组内距 group gap | 10–16px | action rows, field groups |
| 控件内距 control padding | 10–12px vertical / 14–20px horizontal | buttons, inputs |
| 目录密度 directory | 44px rows, 12px text, chevron/link actions | customer/case/conversation lists |
| 阅读宽度 reading | 68ch max | draft/document body |
| composer | thread max 46vh; input min 110px auto-grow to 30vh | chat area |

### Radius / elevation roles

| Role | Value | Usage |
| --- | --- | --- |
| 控件 control | 8px | buttons, inputs, chips |
| 容器 container | 12–14px | panels, drawers, bubbles |
| 徽章 badge | 4px | status tags (never pills; pill = static model label only) |
| 浮层 overlay | 12px + `--shadow-overlay` + scrim | dialogs/popovers |
| 分隔 separator | 1px `--hairline` | preferred over shadows for grouping |

### Focus / motion

focus-visible 2px cinnabar outline (offset 2px) — distinct from selected (filled disc / accent underline). pressed = scale .97–.98. disabled = .42 opacity + textual reason where not obvious. busy = label text change (正在处理…), no fake spinner-only state. Feedback 180–250ms `--ease-standard`; reduced-motion removes all of it including the streaming caret blink.

## For the shadcn/Vite migration

- shadcn's HSL CSS-var theme maps cleanly: set `--background`/`--card`/`--popover` = paper/sheet family, `--primary` = ink (hover accent), `--destructive` = accent-deep, `--ring` = accent, `--muted(-foreground)` = paper-deep/faint-strong, `--border`/`--input` = hairline/strong. Keep hex values from `tokens.json`; do not adopt the default shadcn gray/slate palette.
- Default shadcn radius (0.5rem) → use `--radius-control`/`--radius-panel` as given; badges are 4px, not pills (pill reserved for the static model label).
- The model pill carries **no status dot** — connection state lives only in the settings panel (reviewed finding O1).
- Serif display + CJK rules above are part of brand identity; a migrated screen using Inter/Geist for headings is a regression, not a variant.
- Logo (`public/logo.svg`) is original artwork: ink rounded square, paper roof-line, three document lines, cinnabar last line. Keep geometry; recolor only via tokens.
