# Standalone VPS deployment plan

**Checkpoint: October 7, 2026, 05:28 UTC.** The owner selected the same VPS as the existing Jiesong service, with Nestlet as an independent service. Initial deployment of source `8b429` to a private loopback container was reported successful at 04:48 UTC in [run 37573150783](https://github.com/ledondev520/nestlet/actions/runs/37573150783). The release coordinator is separately checking the actual logs; this documentation update did not repeat deployment.

| Layer | Current evidence/status |
| --- | --- |
| Application implementation | Operator auth, protected routes, Flash-only provider and HTTPS RAM-key settings implemented |
| Private container deployment | Initial `8b429` loopback deployment reported successful; log verification tracked by release coordinator |
| Operator configuration | Production user-run setup remains a separate private step; no configured production credential is claimed here |
| Public entry | New subdomain DNS/trusted TLS pending owner action and verification |
| Real provider | No real-key model-access check or chat completion verified |
| User value | First-case usefulness/time saving and ROI not yet measured |

Private infrastructure addresses, access details and credentials remain outside this public repo. A private container success is not a usable trusted-HTTPS public release.

Nestlet's JavaScript frontend and backend belong to the same repository. Sites is temporary preview hosting, not an API dependency, production backend or prerequisite for VPS operation.

## Runtime requirements

- Node.js 24 (the container runtime); install locked dependencies with `npm ci`
- Poppler `pdftotext` for real text-PDF extraction
- SheetJS dependency and `workbook-worker.js` for XLSX/XLS parsing
- Outbound HTTPS to the configured DeepSeek API; only `deepseek-flash` is supported
- Server-only environment configuration and explicit input-transmission consent
- Exact `PUBLIC_ORIGIN` when a trusted HTTPS reverse proxy fronts the loopback server
- Authenticated/private access in front of the service before it can be reached remotely

Direct local launch uses loopback by default. Docker requires the explicit container-internal bind contract described below. It implements single-operator authentication, but has no durable case audit trail or multi-user tenant isolation. Do not open its port directly or assume CORS/origin checks are authentication. Public access to a configured model endpoint creates cost and abuse risks.

## Native process option

On the explicitly selected VPS, an authorized operator can install Node and Poppler from approved official package sources, clone the reviewed commit into a dedicated non-root application directory, run `npm ci`, and execute the test suite. Start the service with a private environment file via `node --env-file=/absolute/private/environment-file server.js`; the file must remain outside the checkout and contain no values in shell history or logs.

Supervision, reverse proxy, HTTPS certificate, authentication, firewall and domain changes need a reviewed host-specific plan. This document does not silently enable them. Record the exact deployed commit and use a dedicated operating-system user; never run the app as root merely because SSH uses root.

## Repository Docker/Compose assets

The repository now includes `Dockerfile`, `compose.yaml`, `.dockerignore`, `ops/healthcheck.mjs`, `ops/check-deployment.sh` and `ops/Caddyfile.example`. Their presence alone is not deployment evidence; use the exact run/source checkpoint above and subsequent release records.

- Node 24 Bookworm slim; two-stage build with `npm ci --omit=dev --ignore-scripts`
- Poppler and Linux resource-limiting tools included
- Non-root runtime, narrow source-copy allowlist and no secrets embedded in the image
- Read-only filesystem, bounded `/tmp`, process/CPU/memory limits and dropped capabilities
- Compose publishes the application on the **host's loopback** `127.0.0.1:4173`, not all interfaces
- Container-internal `HOST=0.0.0.0` and `/api/health` are implemented backend interfaces; verify them in the built container before calling deployment functional

The health probe checks application liveness without provider access. It does not prove parser readiness, authentication or a working DeepSeek key.

On an explicitly approved target with Docker Engine and Compose already installed, an operator can build/start the reviewed commit with a private environment file:

```sh
./ops/check-deployment.sh
docker compose --env-file /absolute/private/environment-file up --build -d
docker compose ps
docker compose exec nestlet node ops/healthcheck.mjs
```

This documentation task did not execute these commands. The deployment coordinator reported the initial loopback run above; do not confuse that result with completed public ingress or live-provider verification. Set a reviewed `NESTLET_IMAGE_TAG` and retain the exact commit/image digest. Do not share rendered `docker compose config`: it can expand secret values. Docker administrators can inspect container configuration; control that access. [Docker run/environment reference](https://docs.docker.com/reference/cli/docker/container/run/)

### Protected ingress

`ops/Caddyfile.example` is for Caddy installed on the **same host**, proxying to host-loopback port 4173. It provides a proposed HTTPS reverse proxy with private `NESTLET_DOMAIN`. Additional proxy basic authentication is optional and commented out; it does not replace application authentication. It strips the proxy Authorization header upstream. This example is not evidence that production credentials, new-domain DNS or trusted TLS are configured. Follow the actual selected host’s existing proxy topology; do not install a competing proxy over another service.

A containerized proxy needs a different upstream; its `127.0.0.1` means that proxy container, not the app or host. Do not copy this example blindly to another topology. Host-network mode is not used by the shipped Compose file. [Docker networking distinction](https://docs.docker.com/engine/network/drivers/host/)

The selected security design is single-operator backend authentication, an operator-provided password hash, HttpOnly SameSite=Strict session cookies and CSRF checks. Paid/settings routes must fail closed; proxy identity headers are not authentication. The implementation uses `NESTLET_OPERATOR_PASSWORD_HASH`, with backend/UI authentication and protected-route behavior present. Local real-browser retake evidence covers login and file/export flows against `8b429`; production credential/HTTPS configuration and live-provider checks remain separate.

Authenticated HTTPS browser key setup is implemented. The operator personally enters and submits a key in Settings; the backend holds it in process memory and does not return it. The key is not saved in browser storage and disappears on restart unless independently supplied by server environment. This feature is blocked without a configured trusted HTTPS origin and operator session/CSRF. It is not yet verified with a real production key.

## Environment contract

| Variable | Intended value / rule |
| --- | --- |
| `DEEPSEEK_API_KEY` | Authorized server-side secret, never committed or returned to browser |
| `DEEPSEEK_MODEL` | `deepseek-flash` only; no old alias support |
| `ENABLE_LIVE_AI` | `true` only after secure setup and data-handling authorization |
| `PORT` | App port; default 4173 |
| `HOST` | Loopback for direct local launch; `0.0.0.0` only inside the reviewed container topology |
| `NESTLET_IMAGE_TAG` | Reviewed deployment tag, linked to the exact commit/image |
| `NESTLET_OPERATOR_PASSWORD_HASH` | Operator-provided scrypt hash; see format and quoting below |
| `PUBLIC_ORIGIN` | Exact selected HTTPS origin, without an arbitrary wildcard |

The password-hash contract is `scrypt$<base64url16bytesalt>$<base64url32bytehash>`. This is a format description, not a usable credential. The operator supplies it through an authorized secure setup; no password or hash is generated by these docs. Single-quote the whole value in a `.env` file so literal `$` separators are preserved by Compose interpolation. Treat the hash as private, never commit it or paste it into review evidence. Missing configured authentication must block paid/settings routes.

`PUBLIC_ORIGIN` must exactly match the selected HTTPS origin, with no trailing slash, for secure browser key settings. The secure session cookie is HttpOnly and SameSite=Strict; HTTPS deployments require Secure. Those implemented controls have local test/browser evidence; verify the same behavior on the deployed trusted-HTTPS origin before operational use.

`npm start` reads the process environment; it does not implicitly parse `.env`. Node's explicit `--env-file` option is a separate launch mode. [Node CLI documentation](https://nodejs.org/api/cli.html#--env-filefile)

## Release checklist

1. Confirm the selected independent-service target, approved access and current host identity; do not change the existing Jiesong service
2. Authorize any connection, install, credentials provisioning and security/network changes through the appropriate approval path
3. Test the exact release commit: syntax, all automated tests, actual browser E2E and real document imports
4. Confirm PDF and workbook availability from `/api/status`, then parse authored safe PDF/XLSX/XLS/CSV files
5. Verify only `deepseek-flash` can run; missing key, malformed response, timeout or provider failure must not produce substitute success
6. Real provider acceptance needs an authorized secure key and a consented non-sensitive request; mocks cannot satisfy it
7. Verify zh/en labels and errors, English artifacts, unknown/conflict review, invalidation, export warnings and reset/race behavior
8. Verify authentication, HTTPS/origin handling, request limits, rate/abuse protection, logging without case bodies, and no secret routes
9. Record tested image/commit and local health response; separately verify protected remote access
10. Do not admit real tenant material until the separate privacy/security readiness gates are met

## Rollback and limits

Preserve the previous reviewed image/commit and its non-secret configuration reference. Revert the service to that artifact if the new release fails; never overwrite private settings or delete unrelated host data as cleanup. Because no database is currently used, there is no schema migration to roll back, but operator downloads and external provider transmissions cannot be recalled by restarting the app.

Initial private container deployment is reported in the checkpoint above. Public proxy/DNS/trusted TLS, production operator setup, real provider calls and production load tests remain unverified here. Report these layers separately rather than describing either all deployment as unrun or the entire service as production-ready.

## Operator setup helper status

The user-run operator setup helper has passed independent code review after the unsafe-ancestor and hidden-input fixes. Packaging and real-container CI verification are still pending; the next release PR has not yet been published. Code-review approval is not a published or deployed helper release. Do not treat the local `setup-operator` script as a published/staged production procedure until the helper-enabled release passes container verification and is published/staged. Existing operator authentication is already implemented; this helper only prepares its private password-hash configuration. [First-session gates](onboarding.md) explain the sequence without exposing secrets.
