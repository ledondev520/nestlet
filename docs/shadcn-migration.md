# JavaScript / shadcn migration checkpoint

## Scope at the foundation checkpoint, 2026-10-07 09:33 UTC

Implemented: React 19 / Vite 8 / Tailwind 4 build, JavaScript/JSX component sources, `components.json` with `tsx:false`, aliases, same-origin API/session helpers, preserved Working Paper tokens, explicit static-asset allowlisting, Docker frontend build, and frontend CI checks.

The default `/` entry is unchanged. `/next/` is an explicitly labeled component integration preview. **No login, conversation, customer, review, or document business page is claimed migrated by this foundation commit.** Those feature modules have separate owners and must be wired and tested before a full migration claim or entrypoint switch.

## Official component provenance

The official CLI (`shadcn` 4.21.3 from npm) was attempted against `ui.shadcn.com/r/styles/new-york-v4/`. That endpoint returned a SOCKS connection refusal. The working official source was GitHub at immutable revision [`04b5af3c0ec02fc6a4330e4f441c15571adfdb76`](https://github.com/shadcn-ui/ui/tree/04b5af3c0ec02fc6a4330e4f441c15571adfdb76/apps/v4/registry/new-york-v4/ui).

Fourteen official components are vendored: Button, Input, Card, Dialog, Label, Textarea, Tabs, Select, NativeSelect, Badge, Alert, Separator, Checkbox, and Skeleton. `frontend/components/ui/provenance.json` records each source URL and SHA-256. The upstream MIT license is retained. `scripts/vendor-shadcn.mjs` strips TypeScript types while preserving JSX and changes only local `cn` and component import paths. This is source-vendored shadcn, not custom HTML relabeled as shadcn.

Official references: [JavaScript support](https://ui.shadcn.com/docs/javascript), [Vite setup](https://ui.shadcn.com/docs/installation/vite), [React incremental adoption](https://react.dev/learn/add-react-to-an-existing-project).

## Verification evidence

- `npm run build`: passed; actual JS/CSS/HTML output, approximately 305 kB JS / 97 kB gzip at this checkpoint
- `npm run check`: passed existing JavaScript syntax checks
- `npm run test:frontend`: 7 passed, including CSRF, abort, delayed old-account 401, API errors, provenance, and build/allowlist contracts
- `npm test`: 229 passed / 1 failed on the combined starting source; existing `CASE_ISSUE_NOT_FOUND` legacy localization failure, outside this lane. Integration must rerun with the separately reported engineering fix
- `npm audit --omit=dev`: zero reported production dependency vulnerabilities at this checkpoint; not a security certification
- Playwright HTTP-only test: real backend served compiled assets and rejected frontend source/server/source-map paths
- Actual browser checks: attempted, but Chromium failed before page load with `socket() failed: Operation not permitted`, including an approved retry. Rendering, focus, screenshots, modal CSP and responsive appearance are **not verified** here. Continue only through the supported browser QA environment
- Docker build: not run here; no Docker executable is available
- No production credentials, real customer information, email, or model generation were used

The browser tests require the supported browser-capable QA environment. Dialog/Select scroll-lock behavior is gated on production-CSP checks. This change adds no `unsafe-inline`, inline scripts, broad static-files handler, or API bypass. Core flows should use in-page panels and NativeSelect until portal compatibility is established.

## Build and rollback

Run `npm ci --ignore-scripts`, `npm run build`, then `npm start`. Docker builds assets independently from source. `public/next/` is Git-ignored. Compiled assets have explicit allowed names; source maps and source modules are not served.

Restore the earlier foundation commit/image for rollback. The legacy entry stays intact during this stage. No database migration or deletion is introduced; preserve the existing SQLite volume in any deployment or rollback.

Shared feature contracts are in [frontend/README.md](../frontend/README.md).
