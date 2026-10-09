# DeepSeek adapter notes

Public documentation checkpoint: October 7, 2026. Configuration and account-specific access must be verified at use time. No paid/authenticated live request was performed for this documentation.

## Implementation and final contract

`server.js` is the only provider caller. It sends explicitly consented, bounded text to `https://api.deepseek.com/chat/completions`, requests JSON, and validates source-linked fields with `validateSuggestions` before returning them. The product supports `deepseek-flash` only. No legacy model alias is maintained; unsupported configuration must fail visibly rather than select a different model. The initial key can be read from the server environment; an authenticated HTTPS settings save validates its replacement and commits an encrypted provider-settings record before activation. A separately provisioned private wrapping-key file is required; see [durable provider settings](provider-config-storage.md). The browser input is cleared and the server never returns the key. Missing configuration disables the live path and must surface a configuration blocker. The final user flow has no sample/mock/local-extractor fallback. Isolated provider fakes belong only in tests.

The provider is used for extraction, not autonomous actions or final correspondence. Deterministic English templates remain in `public/core.js`. The app does not call model-returned tools, connect to portals, send messages or approve case facts. See server.js for exact input limits, timeout and error behavior; do not infer retries or account health from configuration alone.

Operator login, session/CSRF enforcement, Flash-only startup validation, protected extraction and HTTPS settings are implemented. Missing operator configuration or credentials fails closed; the final UI starts empty rather than substituting a demonstration result.

`POST /api/settings/test` performs a real, explicit `GET /models` request when an authorized key is available. A successful result establishes model access only and includes `chatCompletionTested:false`; it is not an extraction, billing or quality test. Saving a key marks it configured, not verified. No real-key model-access check or chat completion has been established by this project’s reported acceptance. See [authentication contract](auth-contract.md) and [onboarding](onboarding.md).

## Verified public-source distinctions

- [DeepSeek documentation](https://api-docs.deepseek.com/) and [model documentation](https://api-docs.deepseek.com/quick_start/pricing/) identify the configurable model choices; verify account availability separately
- [JSON mode](https://api-docs.deepseek.com/guides/json_mode/) requires an explicit JSON instruction; JSON formatting is not schema, factual or semantic validation
- [Tool calling](https://api-docs.deepseek.com/guides/tool_calls/) does not imply an application should execute model instructions; Nestlet does not do so
- [List models](https://api-docs.deepseek.com/api/list-models/) can help check access once an authorized secure account setup is available; that check has not been run here

## Privacy release gate

The [general privacy policy](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html) does not establish API-specific zero retention, no training, US data residency or a suitable data-processing agreement for this project. Before any production tenant material is transmitted, verify account-specific terms, processing geography, retention/deletion, training use, downstream disclosures, access controls and authorization. A masked identifier or in-app checkbox does not establish those conditions.

Use authored non-sensitive text or appropriately de-identified working inputs for authorized verification; do not falsely label actual de-identified material as synthetic. Keep credentials outside source, browser code, screenshots and logs. Offline tests with a mocked provider prove response handling only. They do not prove real model availability, extraction quality, latency, cost or privacy suitability.
