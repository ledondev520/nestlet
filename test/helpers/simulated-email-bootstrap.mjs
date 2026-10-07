// Test-only preload for actual server.js. This file is never imported by production.
// It exercises real DirectMail signing/receipt parsing with an explicitly simulated
// provider receipt. No network send, delivery claim, debug route, or raw-token log.
if (process.env.NODE_ENV !== 'test' || typeof process.send !== 'function'
  || process.env.ALIBABA_CLOUD_ACCESS_KEY_ID !== 'public-synthetic-test-key-id'
  || process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET !== 'public-synthetic-test-key-secret'
  || process.env.NESTLET_EMAIL_FROM !== 'sender@example.invalid'
  || !/^http:\/\/127\.0\.0\.1:\d+$/u.test(process.env.PUBLIC_ORIGIN || '')) {
  throw new Error('Synthetic mail harness requires private disposable loopback test configuration');
}
globalThis.fetch = async (target, init = {}) => {
  // Fail closed for any accidental model/provider/network use, rather than falling
  // through to native fetch with public test credentials.
  if (String(target) !== 'https://dm.aliyuncs.com/' || init.method !== 'POST') throw new Error('Unexpected outbound request in synthetic mail fixture');
  const form = new URLSearchParams(init.body);
  const email = form.get('ToAddress');
  if (form.get('Action') !== 'SingleSendMail' || form.get('AccountName') !== 'sender@example.invalid'
    || form.get('AccessKeyId') !== 'public-synthetic-test-key-id' || !email?.endsWith('@example.invalid')) throw new Error('Invalid synthetic mail request');
  const line = form.get('TextBody')?.split('\n').find(value => value.startsWith(process.env.PUBLIC_ORIGIN + '/#'));
  if (!line) throw new Error('Missing synthetic one-time link');
  const url = new URL(line), params = new URLSearchParams(url.hash.slice(1));
  const purpose = params.get('auth');
  if (url.origin !== process.env.PUBLIC_ORIGIN || !['verify', 'reset'].includes(purpose)
    || !/^[A-Za-z0-9_-]{43}$/u.test(params.get('token') || '')) throw new Error('Invalid synthetic one-time link');
  process.send({ type: 'synthetic-mail-accepted', email, purpose, link: line });
  return new Response(JSON.stringify({ RequestId: 'synthetic-test-receipt', EnvId: 'synthetic-test-envelope' }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  });
};
