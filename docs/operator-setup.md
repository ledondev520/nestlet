# Initial operator setup: user-run private step

**Release status, October 7, 2026, 05:42 UTC:** The user-run operator setup helper passed independent review and was published in PR #6, merged as main commit `b431ea59405cbbf9ab6ec9945010f66f655b1781`. Exact PR and main Node/container CI passed, including actual Docker/PTY helper checks. The helper release is staged on the private loopback service: corrected [upgrade run 37577482526](https://github.com/ledondev520/jiesong-system/actions/runs/37577482526) succeeded at 05:40:48 UTC, with a healthy container, fail-closed HTTP checks, helper-module checks and current-release pointer verified; existing runtime configuration was preserved. The earlier attempt rolled back safely and is no longer a blocker. Publication, real-container verification and private VPS staging are complete for the helper release. The instructions below are the remaining user-controlled credential handoff, not evidence that credentials have already been configured.

This helper prepares configuration for the existing single-operator sign-in flow. It does not add public enrollment, create a default password, or generate an API key.

## Before the handoff

The deployment owner prepares an existing private `/opt/nestlet/shared/runtime.env` with the nonsecret runtime settings and mode 0600. Its directory chain must not be writable by other users. Disposable tests may use a private directory below root-owned sticky /tmp. The file and its path must not be symlinks; hard-linked files are rejected too.

From the checked-out release directory, the operator personally runs:

```sh
npm run setup-operator -- /opt/nestlet/shared/runtime.env [administrator-username]
```

Use the file owner's account. If the runtime file belongs to root, use the corresponding privileged terminal or `sudo npm run setup-operator -- /opt/nestlet/shared/runtime.env`. Do not run this against the VPS on the user's behalf and do not ask them to send a password or hash through chat.

## Docker-only private terminal (no host Node/npm)

The published helper-enabled image includes the two setup modules, verified by real-container CI and PTY checks. That release is confirmed staged on the private VPS service. The operator can run the command below personally in a private server terminal. The account must own `runtime.env` and have permission to run Docker; for a root-owned deployment, use the owner's privileged terminal. Do not change ownership or broaden file permissions to make setup work.

```sh
release=$(readlink -f /opt/nestlet/current)
revision=$(basename "$release")
printf '%s' "$revision" | grep -Eq '^[a-f0-9]{40}$' || exit 1
owner=$(stat -c '%u:%g' /opt/nestlet/shared/runtime.env)
docker run --rm -it --pull never --init \
  --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true --log-driver none \
  --pids-limit 32 --memory 256m --cpus 1 \
  --user "$owner" \
  --mount type=bind,src=/opt/nestlet/shared,dst=/runtime \
  "nestlet:$revision" node scripts/setup-operator.js /runtime/runtime.env
```

The displayed `/runtime/runtime.env` is the private host file `/opt/nestlet/shared/runtime.env`. Only its parent directory is mounted writable, because the helper needs to create a sibling temporary file and atomically rename it. A file-only bind mount does not support that operation. The helper container has no network, no mounted Docker socket, a read-only root filesystem, and no extra capabilities. It runs with the file owner's numeric UID and GID. Do not add an environment-file option: the helper reads the one file directly and never needs the application credentials as container environment variables.

This is an explicit user handoff: the operator enters both hidden password prompts and types the final confirmation. No assistant should enter, capture, or submit those values. The command neither restarts the application nor enables live AI. A separately approved Nestlet-only recreation is required after setup; `docker compose restart` alone does not reload environment-file values into an existing container.

An optional final username argument sets the administrator login alias together with the password hash. Omit it to preserve the existing alias (default `owner`). In the Docker command, append the chosen username after `/runtime/runtime.env`. The user confirms both changes in the same private prompt; the internal owner identity and its saved cases do not change. The square brackets in the native command denote an optional argument and must not be typed literally.

## What the user does

1. Check the displayed target path
2. Enter a password of 6–256 characters; input is hidden
3. Enter the same password again
4. Type `SET OPERATOR` to approve the final write
5. Recreate the Nestlet container (or restart a directly hosted process) through the approved deployment workflow, then open the HTTPS site and sign in

After signing in, Settings can save the DeepSeek key in process memory. The user enters and submits that key directly in the authenticated HTTPS screen. A saved key is not a verified connection; use the explicit connection check separately.

## What the helper changes

The `NESTLET_OPERATOR_PASSWORD_HASH` assignment is inserted or replaced, plus `NESTLET_OPERATOR_USERNAME` only when the optional alias is explicitly supplied. Unrelated keys, values, comments and line endings are preserved. The helper does not print the password, hash, file contents or API credential. It writes a private sibling temporary file, fsyncs it, rechecks that the original has not changed, and atomically renames it over the target.

Wrong permissions/ownership, duplicate operator declarations, malformed encoding, multiline environment values, symlinks, hard links, unexpected filenames, unconfirmed input and mismatched passwords fail closed. Changes detected during the pre-write checks also stop setup. Do not run deployment/configuration writers concurrently: a same-owner writer can still race the final recheck and rename; this helper does not provide a shared lock protocol. The helper neither creates a missing runtime file nor changes insecure permissions automatically.

The helper creates no backup containing old secrets. Cancel or Ctrl-C before the final confirmation leaves the target unchanged. The running server reads its operator hash at startup. Recreate the Docker container to load changed environment-file values, or restart a directly hosted process. Changing the operator password invalidates existing owner sessions. From schema8 onward, routine restart with unchanged credentials preserves unexpired login sessions; API keys saved only in server memory are still discarded.

## Verification boundary

Automated setup tests use disposable local files and public test-only passwords with actual cryptography and filesystem operations. Those tests do not configure a production credential. Actual VPS password entry, configuration and Nestlet-only container recreation remain a user-controlled handoff. Independent review and actual Docker/PTY verification passed for the published helper. Private VPS staging is also verified. Public trusted HTTPS, user-controlled credentials and a real provider call remain separate pending gates.
