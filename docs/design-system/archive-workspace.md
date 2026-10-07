# Finder-style archive workspace — information architecture v1

2026-10-07 · Kimi design lane · DESIGN REFERENCE, not functional product proof. Reference render: `docs/design-evidence/archive-workspace/archive-workspace.html` (self-contained, tokens only); screenshots in the same directory. All labels synthetic. Tokens: `docs/design-system/tokens.css` @ `2154dd9`.

## Why Finder-style

The product is now a persistent workspace (customer → case → conversation/artifact), not a one-shot generator. The user's recurring questions are: *where am I, what was I working on, is this document current?* A three-region navigation / list / preview model answers all three without leaving the screen, and it degrades cleanly to a single-pane stack with a back path on phones.

## Desktop IA (≥ 760px)

Three regions, one screen:

1. **Navigation (230px, recessed paper).** Search field on top (customers and cases, literal substring, server-backed). Two groups: 客户 (customer rows: name, case count, mono count right-aligned) and 最近案例 (recent cases with relative time). Counts and times come from the server, never fabricated. Selected item: accent-tint fill + 2px inset cinnabar bar (selected ≠ focus: focus keeps the 2px outline).
2. **List (300px, sheet).** Scoped to the selected customer or case. Document/conversation rows: title line (ellipsis, full text via tooltip/focus) + meta line (status badge, kind, version, relative time, mono). 44px rows (touch target). Badges: 草稿 / 完成版 / 已过期 per the status token roles — no other badge kinds.
3. **Preview (flexible, sheet).** Breadcrumb first (客户 / Johnny / DEMO-104 / 文档·v2), then the content:
   - **Document preview:** title + version meta, DRAFT stamp where applicable, stale banner when the case moved on (guidance to regenerate, history stays readable), the artifact body in the Georgia document style at 68ch max, and a stable action row (primary = the one next action, e.g. 重新生成当前版本; secondary = copy; link = download history).
   - **Conversation preview:** the chat thread with the composer docked at the bottom (max 46vh thread, composer input min 110px). The composer is the primary action in this context; extraction/document actions appear in context, never competing side-by-side with 发送.

Hierarchy rules: one primary action per region; the current customer/case/document is readable from the breadcrumb alone; a stale document says so before the user reads the body.

## Mobile IA (< 760px)

Single pane with an explicit back path — the three regions become a navigation stack, never three compressed columns:

- Customers list → (tap) → case/document list → (tap) → preview.
- Top bar: back control left (‹ + parent name, 44px target, real label not an icon-only chevron), current title centered-left with ellipsis.
- Document preview on mobile: full-width serif body (no fixed paper width), stale banner above the body, actions wrap with the primary action taking full row width.
- Search stays reachable at the top of the root list. Safe-area padding applies to the bottom action row; the composer/preview must remain reachable with the soft keyboard open.

## States (each region, designed not implied)

- **Empty:** distinguished "还没有客户" (nothing yet) vs "没有匹配「x」的结果" (search miss, keeps the query, offers clear-search/create). Empty preview: one line, choose a case or document.
- **Loading:** skeleton rows only in the area being loaded; no fake percentages; existing content stays interactive; cancel path preserved.
- **Error:** left-railed banner naming what failed ("案例列表加载失败"), what survives, and a 重试 action. Never an empty directory masquerading as an error or vice versa.
- **Selected:** accent-tint + inset bar in nav and list; preview updates breadcrumb immediately.
- **Stale document:** warning banner + regenerate guidance; download of a stale final is replaced by guidance (the server would 409), historical draft downloads remain.

## Interaction notes for engineering

- Nav and list are link/button semantics with roving-free simple Tab order; arrow-key navigation optional enhancement, not required for operability.
- Search input is 16px on mobile; results update the list region only (no full-page re-render).
- Opening another case protects unsaved edits through the existing confirm path; cancel returns to the exact previous context (breadcrumb unchanged).
- Deleting a case says clearly that its conversations and documents go with it.
- Chat continuity: reopening a case selects its most recent conversation; interrupted messages render with the interrupted style from the state board.

## Explicit non-goals

No KPI cards, no activity feeds, no decorative charts, no multi-action toolbars, no dashboard grid. Every panel earns its place by answering where/what/current.
