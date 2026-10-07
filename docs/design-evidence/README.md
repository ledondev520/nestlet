# Kimi K3 design-lane evidence (2026-10-07)

Synthetic fixtures only; no real case data. Browser: headless Chromium (Playwright `chrome-headless-shell`, current stable) on macOS arm64.

- `before-*`: base commit `b431ea5` (main at implementation start), served on 127.0.0.1:4174
- `after-*`: design branch tip, served on 127.0.0.1:4173
- Viewports: 1280x900 desktop, 390x844 mobile
- `after-en-*` are genuinely English locale (toggled via the UI button); `after-zh-conflict.png` is a zh-CN conflict state (two conflicting Owner labels)
- `after-mobile-focus.png`: real keyboard focus — Tab-navigated to `confirm-0`, `:focus-visible` matched, cinnabar outline verified programmatically and visually
- Not run: live DeepSeek extraction (no authorized credential — by design this is a visible blocker, not a simulated success); PDF/XLSX real-file flows in the browser (require an authenticated session; parser paths unchanged by this lane)
- `merge-*` (added 2026-10-07 ~06:55 UTC): local merge-preview of design tip + PR #11 functional baseline `2c13615234e924acf04bb4d6178d0ea4cb1a9227`, served on 127.0.0.1:4175 with a disposable local operator hash and trial account (preview-trial); verifies the case-save controls, registration form and sample downloads render correctly under the design system. These are integration previews, not design-branch deliverables.
