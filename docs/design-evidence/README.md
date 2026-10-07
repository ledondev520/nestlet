# Kimi K3 design-lane evidence (2026-10-07)

Synthetic fixtures only; no real case data. Browser: headless Chromium (Playwright `chrome-headless-shell`, current stable) on macOS arm64.

- `before-*`: base commit `b431ea5` (main at implementation start), served on 127.0.0.1:4174
- `after-*`: design branch tip, served on 127.0.0.1:4173
- Viewports: 1280x900 desktop, 390x844 mobile
- `after-en-*` are genuinely English locale (toggled via the UI button); `after-zh-conflict.png` is a zh-CN conflict state (two conflicting Owner labels)
- `after-mobile-focus.png`: keyboard-focus ring state on a review checkbox
- Not run: live DeepSeek extraction (no authorized credential — by design this is a visible blocker, not a simulated success); PDF/XLSX real-file flows in the browser (require an authenticated session; parser paths unchanged by this lane)
