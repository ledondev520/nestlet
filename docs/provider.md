# DeepSeek adapter notes

Public documentation checkpoint: October 7, 2026. Configuration and account-specific access must be verified at use time. No paid/authenticated live request was performed for this documentation.

## Current implementation

`server.js` is the only provider caller. It sends explicitly consented, bounded text to `https://api.deepseek.com/chat/completions`, requests JSON, and validates source-linked fields with `validateSuggestions` before returning them. The model defaults to `deepseek-v4-pro` and is configurable with `DEEPSEEK_MODEL`. The key is read from the server environment. Missing configuration disables the live path; it does not pretend the demo is an API result.

The provider is used for extraction, not autonomous actions or final correspondence. Deterministic English templates remain in `public/core.js`. The app does not call model-returned tools, connect to portals, send messages or approve case facts. See server.js for exact input limits, timeout and error behavior; do not infer retries or account health from configuration alone.

## Verified public-source distinctions

- [DeepSeek documentation](https://api-docs.deepseek.com/) and [model documentation](https://api-docs.deepseek.com/quick_start/pricing/) identify the configurable model choices; verify account availability separately
- [JSON mode](https://api-docs.deepseek.com/guides/json_mode/) requires an explicit JSON instruction; JSON formatting is not schema, factual or semantic validation
- [Tool calling](https://api-docs.deepseek.com/guides/tool_calls/) does not imply an application should execute model instructions; Nestlet does not do so
- [List models](https://api-docs.deepseek.com/api/list-models/) can help check access once an authorized secure account setup is available; that check has not been run here

## Privacy release gate

The [general privacy policy](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html) does not establish API-specific zero retention, no training, US data residency or a suitable data-processing agreement for this project. Before any production tenant material is transmitted, verify account-specific terms, processing geography, retention/deletion, training use, downstream disclosures, access controls and authorization. A masked identifier or in-app checkbox does not establish those conditions.

Use synthetic text for adapter verification. Keep credentials outside source, browser code, screenshots and logs. Offline tests with a mocked provider prove response handling only. They do not prove real model availability, extraction quality, latency, cost or privacy suitability.
