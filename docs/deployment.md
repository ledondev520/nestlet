# Standalone VPS deployment plan

**Status: documented proposal, not executed.** No target server, domain, SSH account/port or deployment permission is selected here. Private infrastructure addresses and credentials are deliberately absent from this public repository. The project owner must choose the target and authorize the exact deployment before remote actions.

Nestlet's JavaScript frontend and backend belong to the same repository. Sites is temporary preview hosting, not an API dependency, production backend or prerequisite for VPS operation.

## Runtime requirements

- Node.js 24 (the container runtime); install locked dependencies with `npm ci`
- Poppler `pdftotext` for real text-PDF extraction
- SheetJS dependency and `workbook-worker.js` for XLSX/XLS parsing
- Outbound HTTPS to the configured DeepSeek API; only `deepseek-flash` is supported
- Server-only environment configuration and explicit input-transmission consent
- Exact `PUBLIC_ORIGIN` when a trusted HTTPS reverse proxy fronts the loopback server
- Authenticated/private access in front of the service before it can be reached remotely

Direct local launch uses loopback by default. Docker requires the explicit container-internal bind contract described below. It has no app authentication, durable audit trail or tenant isolation. Do not open its port directly or assume CORS/origin checks are authentication. Public access to a configured model endpoint creates cost and abuse risks.

## Native process option

On the explicitly selected VPS, an authorized operator can install Node and Poppler from approved official package sources, clone the reviewed commit into a dedicated non-root application directory, run `npm ci`, and execute the test suite. Start the service with a private environment file via `node --env-file=/absolute/private/environment-file server.js`; the file must remain outside the checkout and contain no values in shell history or logs.

Supervision, reverse proxy, HTTPS certificate, authentication, firewall and domain changes need a reviewed host-specific plan. This document does not silently enable them. Record the exact deployed commit and use a dedicated operating-system user; never run the app as root merely because SSH uses root.

## Repository Docker/Compose assets

The repository now includes `Dockerfile`, `compose.yaml`, `.dockerignore`, `ops/healthcheck.mjs` and `ops/Caddyfile.example`. They are deployment assets, not proof that an image was built or a server was deployed.

- Node 24 Bookworm slim; two-stage build with `npm ci --omit=dev --ignore-scripts`
- Poppler and Linux resource-limiting tools included
- Non-root runtime, narrow source-copy allowlist and no secrets embedded in the image
- Read-only filesystem, bounded `/tmp`, process/CPU/memory limits and dropped capabilities
- Compose publishes the application on the **host's loopback** `127.0.0.1:4173`, not all interfaces
- Container-internal `HOST=0.0.0.0` and `/api/health` are required backend contracts; verify those are implemented in the exact release before calling the container functional

The health probe checks application liveness without provider access. It does not prove parser readiness, authentication or a working DeepSeek key.

On an explicitly approved target with Docker Engine and Compose already installed, an operator can build/start the reviewed commit with a private environment file:

```sh
docker compose --env-file /absolute/private/environment-file up --build -d
docker compose ps
docker compose exec nestlet node ops/healthcheck.mjs
```

These commands have **not been run on a VPS or through a Docker daemon by this documentation task**. Set a reviewed `NESTLET_IMAGE_TAG` and retain the exact commit/image digest. Do not share rendered `docker compose config`: it can expand secret values. Docker administrators can inspect container configuration; control that access. [Docker run/environment reference](https://docs.docker.com/reference/cli/docker/container/run/)

### Protected ingress

`ops/Caddyfile.example` is for Caddy installed on the **same host**, proxying to host-loopback port 4173. It proposes HTTPS and basic authentication over the whole app, with private `NESTLET_DOMAIN`, `NESTLET_OPERATOR_USER` and `NESTLET_OPERATOR_HASH` variables. It strips the proxy Authorization header upstream. No authentication credential, domain change, certificate or proxy service has been created or installed.

A containerized proxy needs a different upstream; its `127.0.0.1` means that proxy container, not the app or host. Do not copy this example blindly to another topology. Host-network mode is not used by the shipped Compose file. [Docker networking distinction](https://docs.docker.com/engine/network/drivers/host/)

The requested browser-based key setup is a separate, security-sensitive feature. It must be authenticated, use an authorized secret-entry path, remain server-memory-only if that is the accepted design, and never echo, persist or log the key in the client. At this checkpoint it is **pending design/implementation verification**, not an available feature. Do not infer it exists from a configuration comment.

## Environment contract

| Variable | Intended value / rule |
| --- | --- |
| `DEEPSEEK_API_KEY` | Authorized server-side secret, never committed or returned to browser |
| `DEEPSEEK_MODEL` | `deepseek-flash` only; no old alias support |
| `ENABLE_LIVE_AI` | `true` only after secure setup and data-handling authorization |
| `PORT` | App port; default 4173 |
| `HOST` | Loopback for direct local launch; `0.0.0.0` only inside the reviewed container topology |
| `NESTLET_IMAGE_TAG` | Reviewed deployment tag, linked to the exact commit/image |
| `PUBLIC_ORIGIN` | Exact selected HTTPS origin, without an arbitrary wildcard |

`npm start` reads the process environment; it does not implicitly parse `.env`. Node's explicit `--env-file` option is a separate launch mode. [Node CLI documentation](https://nodejs.org/api/cli.html#--env-filefile)

## Release checklist

1. Select the actual target, account, port, domain and authentication design; verify current server identity before connection
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

Container build, host launch, proxy configuration, remote browser access and production load tests are **not run** by this documentation task. Do not call this a deployed service until each relevant check is evidenced.
