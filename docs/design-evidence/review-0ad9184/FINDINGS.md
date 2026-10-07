# Visual/layout review — main @ 0ad9184 (PR #26 integrated)

Reviewer: Kimi (design lane). Date: 2026-10-08.
Source reviewed: `main` @ `0ad91847e8c04f379f071e76bf8c325f9bb12233`, built and run locally (source-build review — **not** a production-deployment claim). Supplementary evidence: official synthetic Chromium artifact from actions run 37700251919.

## Scope (bounded, as acknowledged on Issue #3)

- Surfaces: chat → materials → documents journey, customer library, owner/account settings, login/forgot-password; the compact/collapsible official-reference panel (`[data-testid="agency-guidance"]`) in Chat, Materials and Documents, collapsed and expanded.
- Viewports: 1280×900 desktop, 390×844 and 320×700 mobile. Languages: zh-CN and English (320px zh only).
- Method: authorized local source build + synthetic fixtures only; no auth/database/provider/API changes, no account actions beyond the synthetic review case, no merge/deploy.
- Fixture: one synthetic case ("Synthetic review case", record `13e2cb39-e8da-4d10-9f60-3e6820867f8c`), one server-generated synthetic final document (v2). No real customer data.

## What checks out against the design system (v1.1)

- **Palette / type / spacing hold everywhere.** Warm paper canvas, ink text, hairlines, single cinnabar accent; serif display for page/case titles, sans body, mono with tabular figures for record IDs (`d13-customers-zh`).
- **One-main-action holds** in the case-workflow panel (`d14`): one ink primary ("补齐并预览英文文书"), one secondary; disabled state uses muted styling with an explicit reason, never color-only.
- **Reference panel is one consistent component** across Chat / Materials / Documents, in both languages, at all three widths. Collapsed = one-line bar with agency + applicability status; expanded = sheet with agency select ("不代表本案例所属机构"), scope disclaimers, per-source version metadata, OMB-expiration caution, retrieval date (`d15`, `d17`, `d19`, `m02`, `s02`). The reference-agency-choice vs confirmed-case-fact distinction is preserved in copy.
- **320px stays usable** (WCAG 1.4.10): no horizontal overflow on any surface (JS-verified `scrollWidth === clientWidth` on login, chat, materials, documents, settings at 320px, spot-checked at 390px); long source titles wrap cleanly (`s02`, `s04`); header wraps without overlap.
- **Keyboard/focus:** 2px solid cinnabar (`#b8402a`) focus-visible outline verified on the panel summary and the agency select (`k01`); disclosure toggles, select and links are natively focusable.
- **Composer geometry matches the ratified tokens** (20px floating bar, attachment left, send right, keyboard hint between) — `k01` shows the collapsed-composer state.
- **Honest unavailable states:** DeepSeek unconfigured → send disabled + "请先在设置中连接 DeepSeek。"; registration/mail flows disabled with an explicit notice (`d01`, `m00b`, `d10`). Zero console errors on every visited surface.

## Findings (visual/layout only — no code changed in this review)

1. **P2 — Status notices all wear the conflict color.** `.paper-note` (`frontend/styles.css:126`) hardcodes a cinnabar left border + `--accent-tint` background for *every* status notice: success ("已保存。" / "Final document saved.", `d22`), neutral info ("已载入最新案件…", `d19`; owner-recovery note, `m00b`). But the token set assigns `--accent-tint` to `--status-error-bg` and already defines `--status-success-bg: var(--ok-tint)`. Result: success and info are visually indistinguishable from conflict/error. **Design decision (mine, for root engineering to implement):** success notices → `--status-success` border + `--status-success-bg`; neutral information → recessed `--paper-deep` fill with a hairline border (no accent); keep cinnabar tint exclusively for conflict/error/warning semantics. This needs call-site classification (the notice element is shared), so it is engineering work against this spec, not a silent restyle.
2. **P3 — Collapsed panel summary is missing a separator.** `frontend/components/agency-guidance.jsx:12-13` renders `· {label}` then the applicability label with whitespace only → "Official source references · San Francisco · SFHA  Applicability unconfirmed" (double space, no interpunct; identical in zh: `d14`, `d22`). Suggest a `·` before the applicability span.
3. **P3 — Version badge label is inconsistent.** Within zh UI the chat case panel shows "v1" (`d14`) while Materials shows "版本 1" (`d17`); English shows "v2" (`d22`). Pick one convention per language (suggest localized "版本 n" / "v n") and apply it to all three surfaces.
4. **P3 (optional) — Settings "服务设置" panel is thin.** At desktop it repeats header content (owner / 退出) with large dead space (`d20`). Consider folding the owner row into the account-recovery panel header. Not blocking.

## Not run (honest labels)

- Live DeepSeek conversation / streaming states — no API key in the review environment; the honest disabled state was captured instead (`d10`, `k01`).
- Real screen-reader pass and real-device soft-keyboard behavior — no authorized devices; keyboard checks were synthetic-browser only.
- File-upload parsing path in Materials — reviewed via pasted synthetic source text instead.

## Evidence index (this directory)

| File | Surface / state |
| --- | --- |
| d01-login-zh | Login, mail-unavailable honest state |
| d14 / d15 | Chat, ref panel collapsed / expanded (zh, desktop) |
| d17 / d19 | Materials / Documents, ref panel expanded (zh, desktop) |
| d20 | Owner settings (zh, desktop) |
| d22 | Documents, generated final v2 + success-notice tint evidence (en) |
| d10 | Chat, typed-but-disabled send, DeepSeek unconnected (en) |
| m02 / m04 | Chat / Materials, ref panel expanded (zh, 390px) |
| m07 | Settings (zh, 390px) |
| m00b | Forgot-password, info notice in cinnabar tint (zh, 390px) |
| s02 / s04 | Chat / Materials, ref panel expanded (zh, 320px) |
| k01 | Focus-visible ring on ref panel summary + composer geometry |
