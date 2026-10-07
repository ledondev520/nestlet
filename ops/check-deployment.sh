#!/bin/sh
# Read-only preflight. Never prints expanded config, credentials, or API keys.
set -eu
cd "$(dirname "$0")/.."
command -v docker >/dev/null 2>&1 || { echo 'Docker is not installed or not on PATH; container validation not run.' >&2; exit 1; }
docker compose version >/dev/null
if [ ! -f .env ]; then
    echo 'Create a private .env from .env.example and configure the deployment first.' >&2
    exit 1
fi
docker compose --env-file .env config --quiet
echo 'Compose config parses. This does not verify image build, authentication, HTTPS, or provider access.'
echo 'Before public ingress: verify authentication, exact PUBLIC_ORIGIN, and loopback-only port 4173.'
