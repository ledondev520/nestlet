# First operator session

Checkpoint: October 7, 2026. Keep the existing process. If a first actual administrative case reveals a concrete difficulty, optionally try assistance with appropriately de-identified material. No ROI or time saving has been demonstrated; do not expand scope before checking whether the reviewed result is useful.

## 1. Establish a trusted entry point

The initial private loopback container deployment is separate from public access. The selected subdomain’s DNS and trusted HTTPS still need owner action and verification. Do not enter an operator password or API key on an untrusted/IP-only public page or bypass a certificate warning.

Application authentication already exists. Production operator configuration is a separate private setup, not automatic enrollment. The user-run operator setup helper has passed independent code review after the unsafe-ancestor and hidden-input fixes. Packaging and real-container CI verification are still pending; the next release PR has not yet been published. Code-review approval is not a published or deployed helper release. Wait for the helper-enabled release to be published, container-verified and staged before following its production instructions. No default password or API key is created.

## 2. Sign in

Once the operator hash and trusted HTTPS entry are configured, open Settings and sign in with the operator password. The application uses a server-memory session, HttpOnly/SameSite=Strict cookie, Secure under HTTPS, and CSRF protection. Missing setup or authentication blocks server parsing, extraction and settings instead of falling back to demo output.

The operator personally enters and submits credentials. Do not send passwords, hashes or API keys through chat, source files, screenshots or support logs.

## 3. Configure and verify the model separately

Authenticated HTTPS Settings can accept a DeepSeek key and explicit live-extraction preference. The key is held in server process memory only and is not returned to the browser. A server restart drops browser-saved keys and sessions; a separately configured environment key may load again on startup.

Only `deepseek-flash` is supported. Saving a key means **configured**, not **verified**. The explicit connection check queries the provider’s model list. Success verifies model access, not chat completion, billing availability, extraction quality or privacy suitability. A real consented extraction is a further check. No real-key check or model completion has yet been established in this project’s acceptance.

## 4. Work through one case

- Start empty and paste reviewed text or import an actual TXT/CSV/PDF/XLSX/XLS file
- PDF/Excel bytes go to this app’s backend for parsing; text-PDF parsing is not OCR
- Select and map the workbook’s actual sheet/row where needed
- Send only authorized minimal de-identified text for live extraction
- Review every fact and source; resolve conflicts, preserve unknowns and confirm values explicitly
- Produce an English supplementary draft, then inspect facts, placeholders, recipient and attachments before export

SFHA is the initial research focus, but the case’s actual PHA must come from evidence. The five fields do not establish an official packet’s completeness. Actual de-identified material is not automatically labeled synthetic. No email or government submission happens in the app.

## 5. Judge usefulness before expanding

Do not require an upload, another questionnaire or five-field review merely to prove there is a need. If the operator requests help at a concrete point of friction, check the resulting draft against the original material and actual agency instructions. Record corrections and total hands-on time, including review. For a first case, the question is whether this helps the operator complete a task they actually own accurately, with less total effort after review. If the existing task remains quick and reliable, leave the tool optional and do not force adoption or expand scope. The five-case protocol is a later structured measurement plan, not a completed study or proof of ROI.

Local Codex’s reported retake against `8b429` covers real browser login, PDF/Excel and exports, with 87 core and five independent HTTP checks. That evidence does not establish production DNS/TLS, a working real key or an agency-accepted document. Consult [validation](validation.md), [authentication](auth-contract.md), [provider](provider.md) and [deployment](deployment.md) for the current evidence boundaries.
