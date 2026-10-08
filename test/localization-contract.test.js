// Source-contract inspection only: no DOM, browser, network, or response mocks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const copyMatch = source.match(/const copy = (\{[\s\S]*?\n\});\s*\n\s*const kinds/);
assert.ok(copyMatch, 'Expected the bilingual interface-copy declaration');
// Evaluate only the actual static object literal, never the application or a simulated response.
const copy = vm.runInNewContext('(' + copyMatch[1] + ')', Object.create(null), { timeout: 1000 });
const errorMapMatch = source.match(/const authErrorKeys = (\{[\s\S]*?\n\});/);
assert.ok(errorMapMatch);
const errorMap = vm.runInNewContext('(' + errorMapMatch[1] + ')', Object.create(null), { timeout: 1000 });
const caseMapMatch = source.match(/const caseErrorKeys = (\{[^;]+\});/);
assert.ok(caseMapMatch, 'Expected the case-route error map');
const caseMap = vm.runInNewContext('(' + caseMapMatch[1] + ')', Object.create(null), { timeout: 1000 });
const containsHan = value => /[\p{Script=Han}]/u.test(value);

function strings(value) { return Array.isArray(value) ? value.flatMap(strings) : typeof value === 'string' ? [value] : []; }

test('interface dictionaries expose matching complete keys and English copy has no Chinese prose', () => {
  assert.deepEqual(Object.keys(copy.zh).sort(), Object.keys(copy.en).sort());
  for (const key of Object.keys(copy.en)) {
    assert.equal(typeof copy.zh[key], typeof copy.en[key], key);
    assert.ok(strings(copy.zh[key]).every(text => text.length > 0), key);
    assert.ok(strings(copy.en[key]).every(text => text.length > 0 && !containsHan(text)), key);
    if (Array.isArray(copy.en[key])) assert.equal(copy.zh[key].length, copy.en[key].length, key);
  }
});

test('every UI error key and mapped authentication/settings error has Chinese and English wording', () => {
  const usedKeys = new Set([...Object.keys(copy.en).filter(key => /^error|^operatorSetupHelp$/.test(key)), ...Object.values(errorMap), ...Object.values(caseMap)]);
  for (const key of usedKeys) {
    assert.equal(typeof copy.zh[key], 'string', key);
    assert.equal(typeof copy.en[key], 'string', key);
    assert.ok(containsHan(copy.zh[key]), `Chinese prose missing for ${key}`);
    assert.equal(containsHan(copy.en[key]), false, key);
  }
  for (const code of ['AUTH_REQUIRED', 'CSRF_REJECTED', 'OPERATOR_SETUP_REQUIRED', 'HTTPS_REQUIRED', 'INVALID_CREDENTIALS', 'LOGIN_RATE_LIMITED', 'SETTINGS_RATE_LIMITED', 'INVALID_SETTINGS', 'API_KEY_REQUIRED', 'CONNECTION_FAILED', 'MODEL_UNAVAILABLE', 'BUSY', 'LIVE_DISABLED']) {
    assert.ok(errorMap[code], `Missing explicit error mapping for ${code}`);
  }
});

test('unknown backend errors use local fallback keys and server error messages or stacks are never rendered', () => {
  assert.match(source, /(?:const|let) key = authErrorKeys\[result\?\.code\] \|\| fallback;/);
  assert.match(source, /state\.settingsError = copy\.en\[error\.message\] \? error\.message : 'errorGeneric'/);
  assert.match(source, /state\.error \? d\[state\.error\] \|\| d\.errorGeneric : ''/);
  assert.match(source, /state\.settingsError \? d\[state\.settingsError\] \|\| d\.errorGeneric : ''/);
  assert.doesNotMatch(source, /\bresult\??\.(?:error|message|stack)\b/);
  assert.doesNotMatch(source, /\berror\.stack\b/);
  for (const key of ['errorPdf', 'errorWorkbook', 'errorScanned', 'errorEncrypted', 'errorSize', 'errorCSV', 'errorFile', 'errorLive', 'errorSensitive', 'errorGeneric']) {
    assert.ok(containsHan(copy.zh[key]) && !containsHan(copy.en[key]), key);
  }
});

test('every currently emitted backend error code has an explicit bilingual route fallback or direct mapping', async () => {
  const backend = (await Promise.all(['server.js', 'auth.js', 'workbook-worker.js', 'storage.js', 'telemetry.js', 'case-records.js', 'document-context.js', 'chat.js', 'conversation-action-contract.js'].map(name => readFile(new URL('../' + name, import.meta.url), 'utf8')))).join('\n');
  const emitted = new Set([...backend.matchAll(/(?:new RequestError\([^,]+,\s*|new (?:TelemetryError|ChatError|DocumentContextError|CaseRecordsError)\(\s*|fail\(|error:\s*|code:\s*|code\s*=\s*)'([A-Z_]+)'/g)].map(match => match[1]));
  const routeFallbacks = {
    DOCUMENT_CONSENT_REQUIRED: 'errorFile', EXTRACTION_FAILED: 'errorLive', INPUT_TOO_LARGE: 'errorSize',
    INVALID_INPUT: 'errorLive', INVALID_JSON: 'errorGeneric', INVALID_PDF: 'errorPdf', INVALID_WORKBOOK: 'errorWorkbook',
    OCR_REQUIRED: 'errorScanned', ORIGIN_REJECTED: 'errorGeneric', PDF_ENCRYPTED: 'errorEncrypted', PDF_TIMEOUT: 'errorPdf',
    PDF_UNAVAILABLE: 'errorPdf', PROVIDER_ERROR: 'errorLive', REQUEST_CANCELLED: 'errorFile', SENSITIVE_DATA: 'errorSensitive',
    SETTINGS_CHANGED: 'errorGeneric', METHOD_NOT_ALLOWED: 'errorGeneric', TEXT_TOO_LARGE: 'errorTextSize', UNSUPPORTED_MEDIA_TYPE: 'errorFile',
    WORKBOOK_ENCRYPTED: 'errorWorkbook', WORKBOOK_TIMEOUT: 'errorWorkbook', WORKBOOK_TOO_COMPLEX: 'errorWorkbook',
    WORKBOOK_UNAVAILABLE: 'errorWorkbook', INTERNAL_ERROR: 'errorGeneric', USER_EXISTS: 'errorCredentials',
    STORAGE_PATH_INVALID: 'errorBackend', STORAGE_VERSION_UNSUPPORTED: 'errorBackend',
    WORKFLOW_NOT_FOUND: 'errorGeneric', WORKFLOW_ALREADY_BOUND: 'errorGeneric',
    TELEMETRY_INVALID: 'errorGeneric', TELEMETRY_REQUEST_MISMATCH: 'errorGeneric',
    TELEMETRY_RATE_LIMITED: 'errorGeneric', TELEMETRY_UNAVAILABLE: 'errorGeneric',
  };
  assert.ok(emitted.size >= 30);
  for (const code of emitted) {
    const key = errorMap[code] || caseMap[code] || routeFallbacks[code];
    assert.ok(key, `Review bilingual handling of newly emitted backend code ${code}`);
    assert.ok(containsHan(copy.zh[key]), code);
    assert.ok(copy.en[key] && !containsHan(copy.en[key]), code);
  }
});

test('PDF extracted-text limit takes precedence over generic 413 binary-size copy in both languages', () => {
  assert.match(source, /const codes = \{[^}]*TEXT_TOO_LARGE: 'errorTextSize'[^}]*\}/);
  assert.match(source, /responseError\(result, codes\[result\.code\] \|\| \(response\.status === 413 \? 'errorSize' : 'errorPdf'\)\)/);
  assert.match(source, /if \(result\.text\.length > 50000\) throw new Error\('errorTextSize'\)/);
  assert.match(copy.zh.errorTextSize, /50,000 字符/);
  assert.match(copy.zh.errorTextSize, /拆分 PDF、减少页数/);
  assert.match(copy.en.errorTextSize, /50,000 characters/);
  assert.match(copy.en.errorTextSize, /Split the PDF, use fewer pages/);
  for (const locale of ['zh', 'en']) {
    assert.doesNotMatch(copy[locale].errorTextSize, /5 MiB/);
    assert.match(copy[locale].errorSize, /5 MiB/);
    assert.doesNotMatch(copy[locale].errorSize, /50,000/);
  }
});

// The React conversation surface owns direct action-specific bilingual explanations.
test('conversation action errors have direct bilingual wording without rendering server prose', async () => {
  const {chatErrorText}=await import('../frontend/features/chat/copy.js');
  for(const code of ['CONVERSATION_ACTION_INVALID','CONVERSATION_ACTION_SOURCE_NOT_FOUND','CONVERSATION_ACTION_SOURCE_INCOMPLETE','DOCUMENT_ENGLISH_REQUIRED']){
    assert.ok(containsHan(chatErrorText({code,error:'UNTRUSTED'},'zh')));
    assert.equal(containsHan(chatErrorText({code},'en')),false);
    assert.doesNotMatch(chatErrorText({code},'en'),/UNTRUSTED/);
  }
});
