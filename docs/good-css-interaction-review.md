# Nestlet interaction review, based on vetted good-css

Source: https://good-css.com/ and https://github.com/vojtaholik/good-css
Reviewed version: 6d16d2fd27f4892e2aea4b5c5c2b016f45be7eef (2026-10-07).
This is a review checklist, not evidence that Nestlet passed it. No Nestlet product code was changed for this review.

## Priority 1: predictable, accessible controls
- Review every button/link/input: visible keyboard focus using outline; preserve forced-colors support. Ensure focused controls are not clipped by overflow containers.
- Restrict hover-only effects to hover-capable fine pointers. Provide an explicit, subtle press state that still communicates action on touch.
- Target a 44px hit area for password visibility, close, menu and other small icon controls. Verify adjacent hit regions do not overlap and parent overflow does not clip them.
- Form labels and errors must remain readable text, associated with the input; do not rely on red/green alone. Use :user-invalid as appropriate without replacing server validation or hiding existing business validation.
- Verify keyboard order and submit/error/retry behavior, including loading, disabled, success and failure states. This state coverage is an additional product requirement; CSS alone does not establish it.

## Priority 2: restrained motion and stable layers
- Define shared timing/easing tokens. Avoid transition:all; list changed properties. Use brief control feedback, no ornamental animation without a purpose.
- Put movement and scaling transitions under prefers-reduced-motion:no-preference. State changes must remain clear without animation.
- Verify dialogs and menus with keyboard, Escape, focus entry/return and scrolling. CSS animation is optional; opening, closing and focus management must work without it.
- Limit dialog/drawer height and scroll the body while keeping actions reachable; use min-block-size:0 only where needed in nested flex layouts.
- Use native dialog/popover/details when appropriate for existing architecture. Native popover is not automatically a full keyboard menu widget; preserve required semantics and behavior.

## Priority 3: professional visual consistency
- Reuse project tokens for colors, type, spacing, radii and motion. Consider OKLCH/color-mix for new derived tokens after contrast checks, not an unreviewed whole-theme conversion.
- Prefer logical properties, parent-owned gap and intrinsic grids over repeated special-case offsets/breakpoints.
- Handle long Chinese/English labels, URLs, filenames and output: correct wrapping, no clipped important text, accessible full text when truncated. Keep icons from shrinking.
- Ensure mobile inputs avoid iOS focus zoom without disabling user zoom. Verify 200% text enlargement and narrow layouts.
- Preserve app scrolling, safe-area insets, sticky header offsets and long-content behavior.

## Do not apply mechanically
- Existing projects: change reset rules individually, with screenshots and regressions. Global min-width:0, font rules, tap-highlight removal and text-box trimming can alter behavior.
- overflow:clip disables programmatic scrolling. Keep auto/hidden where scrolling, resizing or an existing interaction requires it.
- Inspect actual target-browser support before field-sizing, anchor positioning, text-box, interpolate-size, scroll timelines or display/overlay transition changes. Site support claims are source claims, not our compatibility test results.
- Treat unsupported animation as instant state change; never let progressive enhancement remove content, focus, navigation or essential feedback.
- Do not mechanically replace tested JavaScript behavior merely because the guide prefers CSS.
- Do not install the separate motion skills mentioned by the guide unless separately authorized.

## Evidence required
Before/after screenshots at desktop and mobile widths; keyboard-only pass; reduced-motion pass; long-content/200% zoom pass; touch-target check; relevant unit/integration tests; real browser evidence for affected flows. Record exactly what was not tested.
