# SQLite runtime and private trial setup

Nestlet requires Node.js 24 or newer and uses its built-in `node:sqlite`; there is no additional database npm dependency. Local startup uses `NESTLET_DB_PATH=./data/nestlet.sqlite` from `.env.example`. An absent local data directory is created privately; an existing directory or database with unsafe ownership, permissions or links is rejected instead of silently repaired. Local data and SQLite journal files are ignored by Git and excluded from the image's explicit source allowlist.

```sh
npm ci
node --env-file=.env server.js
```

Populate only the intended private configuration in `.env`. The user sets their operator credential privately through the operator setup helper. Do not copy credentials, case data or database files into Git or chat.

## Container persistence

`compose.yaml` mounts exactly one project-scoped named volume, `case_data`, at `/data`, and sets `NESTLET_DB_PATH=/data/nestlet.sqlite`. In the production Compose project `nestlet`, that volume is `nestlet_case_data`. The image's `/data` directory is owned by runtime UID/GID 1000 and has mode 0700; the application database is mode 0600. Other runtime paths remain read-only except the bounded temporary filesystem.

This volume persists accounts and saved case records across container recreation. Raw uploaded PDF/workbook binaries are not persisted by this storage layer. Provider keys entered in Settings remain process-memory-only and disappear on restart; the database is not a key vault. SQLite files are private local files, not application-level encrypted storage.

Never run `docker compose down --volumes`, `docker volume rm`, or volume pruning on the production project. Those operations can destroy saved cases. Routine upgrades preserve the dedicated volume. A rollback to the earlier stateless application leaves the volume intact, but that older application cannot display the saved cases. Future incompatible schema migrations require their own reviewed backup and recovery plan; the first-persistence rollout is not a general migration framework. No automated production backup is configured by this package.

## Web registration and optional private trial setup

After owner setup and trusted HTTPS are ready, the web registration screen lets a visitor create a trial account by entering and confirming their own password. Registration never grants the owner role or provider-settings access. Server-side validation, bounded registration attempts and the account limit apply. This route still needs its release-specific CI/browser/deployment evidence.

The private CLI below remains an optional owner-managed creation/rotation path. It is a user-controlled credential handoff, after the SQLite-enabled release has passed CI and has been deployed. The operator personally enters and confirms the trial password. The assistant must not receive or submit it. There is no default trial password. Owner setup must already be complete before registration and named trial sign-in are enabled.

The deployed image includes `scripts/setup-trial-user.js` and its support module. From an authorized private server terminal, verify the dedicated volume exists, select the current deployed image, and run the isolated helper:

```sh
release=$(readlink -f /opt/nestlet/current)
revision=$(basename "$release")
printf '%s' "$revision" | grep -Eq '^[a-f0-9]{40}$' || exit 1
docker volume inspect nestlet_case_data >/dev/null || exit 1
container=$(docker ps -q --filter label=com.docker.compose.project=nestlet --filter label=com.docker.compose.service=nestlet)
administrator_username=$(docker exec "$container" node -p 'process.env.NESTLET_OPERATOR_USERNAME || "owner"')
read -r -p 'Trial username: ' trial_username
docker run --rm -it --pull never --init \
  --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true --log-driver none \
  --pids-limit 32 --memory 256m --cpus 1 \
  --user 1000:1000 \
  --env NESTLET_OPERATOR_USERNAME="$administrator_username" \
  --mount type=volume,src=nestlet_case_data,dst=/data \
  "nestlet:$revision" node scripts/setup-trial-user.js /data/nestlet.sqlite "$trial_username"
```

UID 1000 is the database owner in the supplied image. If deployment ownership differs, stop and verify the actual owner rather than broadening permissions. The helper requires an already initialized private database. It has no network or mounted Docker socket. Only the nonsecret administrator alias is passed from the running application so the helper reserves that username; no API key or password hash is passed. Only the dedicated database volume is writable.

Usernames are normalized to lowercase, use 3–64 letters/digits/underscore/dot/hyphen characters, start with a letter or digit, and cannot be `owner`. The operator enters the hidden password twice, then personally types `SET TRIAL USER`. Creating a user grants the trial role and access to that user's own saved cases. Rotating the same username preserves its identity/cases and revokes its prior sessions. Trial accounts cannot manage provider keys. Use a unique trial password and share access only through an approved private channel.

The trial credential is read from SQLite; a container recreation is not required merely to create or rotate it. Owner-password changes in `runtime.env` are different: those require a Nestlet-only recreation to reload environment variables. See [operator setup](operator-setup.md).

## Verification limits

Container CI is configured to use its own disposable project/volume, test a real SQLite file across container recreation, and exercise both credential helpers through actual pseudo-terminals using public test-only credentials. Those new-image checks must actually pass for the release; preparing the workflow is not a completed Docker test. Local unit tests cover real SQLite storage and user isolation. These tests do not create production credentials, configure production backups, or establish that a particular VPS has received the new release. Consult the release's actual CI and deployment evidence before claiming readiness.
