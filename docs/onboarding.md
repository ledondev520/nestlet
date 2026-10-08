# First operator session

Checkpoint: October 7, 2026. Keep the existing process. If a first actual administrative case reveals a concrete difficulty, optionally try assistance with appropriately de-identified material. No ROI or time saving has been demonstrated; do not expand scope before checking whether the reviewed result is useful.

## 1. Establish a trusted entry point

The initial private loopback container deployment is separate from public access. Certificate issuance has completed, but public HTTPS activation is still being verified. Do not treat issuance alone as a working public entry point. Do not enter an operator password or API key on an untrusted/IP-only public page or bypass a certificate warning.

Application authentication already exists. Production operator configuration is a separate private setup, not automatic enrollment. The user-run operator setup helper passed independent review and was published in PR #6, merged as main commit `b431ea59405cbbf9ab6ec9945010f66f655b1781`. Exact PR and main Node/container CI passed, including actual Docker/PTY helper checks. The helper release is staged on the private loopback service: corrected [upgrade run 37577482526](https://github.com/ledondev520/jiesong-system/actions/runs/37577482526) succeeded at 05:40:48 UTC, with a healthy container, fail-closed HTTP checks, helper-module checks and current-release pointer verified; existing runtime configuration was preserved. The earlier attempt rolled back safely and is no longer a blocker. The helper is now privately staged; follow its private operator handoff only through the authorized user-controlled setup. Trusted public HTTPS and live-provider verification remain pending. No default password or API key is created.

## 2. Sign in as the owner first

Once the operator hash and trusted HTTPS entry are configured, open Settings and sign in with the operator password. The application uses a server-memory session, HttpOnly/SameSite=Strict cookie, Secure under HTTPS, and CSRF protection. Missing setup or authentication blocks server parsing, extraction and settings instead of falling back to demo output.

The operator personally enters and submits credentials. Do not send passwords, hashes or API keys through chat, source files, screenshots or support logs.

## 3. Owner configures and verifies the model separately

Authenticated HTTPS Settings can accept a DeepSeek key and explicit live-extraction preference. The key is held in server process memory only and is not returned to the browser. A server restart drops browser-submitted RAM-only keys but preserves unexpired schema8 sessions; a separately configured environment key may load again on startup.

Only `deepseek-flash` is supported. Saving a key means **configured**, not **verified**. The explicit connection check queries the provider’s model list. Success verifies model access, not chat completion, billing availability, extraction quality or privacy suitability. A real consented extraction is a further check. No real-key check or model completion has yet been established in this project’s acceptance.

## 4. Ordinary-user registration and optional named trials

Self-service web username/password registration is implemented, with final release verification pending. The server assigns an ordinary role; users cannot choose administrator rights. Wait for final CI/browser/deployment verification before treating the new registration flow as available. After registration, sign in and use only your own saved cases. Only the administrator controls the shared provider connection.

### Existing optional named-trial setup

Named trial users and SQLite persistence are implemented, pending final CI/browser/deployment verification. Complete the owner password and provider setup first. No real trial credentials have been created by this documentation or its development tests.

After the reviewed trial-enabled release is ready, an authorized operator can personally run:

```sh
node scripts/setup-trial-user.js /absolute/nestlet.sqlite username
```

Use the actual private database path and its authorized account; see [SQLite runtime](sqlite-runtime.md) for the Docker path/mount procedure. The CLI uses hidden password entry and confirmation plus a final `SET TRIAL USER` approval. Do not put passwords in command arguments or chat. Creating/rotating a named trial credential does not give access to provider settings. A rotation preserves that user’s saved cases and invalidates its existing sessions.

Trial users sign in with their own username/password, see only their own cases and use the owner-configured extraction service. The owner likewise sees only owner cases, not an all-user administrative case list. Web registration is the new ordinary-user enrollment path pending final release verification; team sharing and CRM remain out of scope. Trial extraction is capped at ten requests per user/hour and thirty across trial users/hour in server memory; restarts reset these counters. These are abuse controls, not guaranteed billing limits.

## 5. Work through one case

- Start empty and paste reviewed text or import an actual TXT/CSV/PDF/XLSX/XLS file
- PDF/Excel bytes go to this app’s backend for parsing; text-PDF parsing is not OCR
- Select and map the workbook’s actual sheet/row where needed
- Send only authorized minimal de-identified text for live extraction
- Review every fact and source; resolve conflicts, preserve unknowns and confirm values explicitly
- Produce an English supplementary draft, then inspect facts, placeholders, recipient and attachments before export

SFHA is the initial research focus, but the case’s actual PHA must come from evidence. The five fields do not establish an official packet’s completeness. Actual de-identified material is not automatically labeled synthetic. No email or government submission happens in the app.

## 6. Save only when useful

Preview, edit, copy, download and print remain the primary workflow. **Save case** explicitly stores the title, source text, reviewed fields and draft in server-local SQLite; it does not retain the original PDF/Excel binary. **Open** loads one of your saved cases. **Delete** removes your selected saved case after the application’s confirmation; clearing the workspace or signing out does not delete saved cases.

There is a 100-case cap per user. Updates/deletes carry the last saved `expectedVersion`; an HTTP 409 conflict means another edit occurred and your changes were not silently overwritten. Copy/export work you need to keep, then reopen the latest version to compare. The dedicated database volume survives restarts, but automatic backups are not implemented. Never delete/prune that volume during deployment or rollback.

## 7. Judge usefulness before expanding

Do not require an upload, another questionnaire or five-field review merely to prove there is a need. If the operator requests help at a concrete point of friction, check the resulting draft against the original material and actual agency instructions. Record corrections and total hands-on time, including review. For a first case, the question is whether this helps the operator complete a task they actually own accurately, with less total effort after review. If the existing task remains quick and reliable, leave the tool optional and do not force adoption or expand scope. The five-case protocol is a later structured measurement plan, not a completed study or proof of ROI.

Local Codex’s reported retake against `8b429` covers real browser login, PDF/Excel and exports, with 87 core and five independent HTTP checks. That evidence does not establish production DNS/TLS, a working real key or an agency-accepted document. Consult [validation](validation.md), [authentication](auth-contract.md), [provider](provider.md) and [deployment](deployment.md) for the current evidence boundaries.
