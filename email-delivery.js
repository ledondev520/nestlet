import { createHmac, randomUUID } from 'node:crypto';

// DirectMail RPC only. Configure a sender approved for Nestlet separately from other apps.
// A valid receipt confirms provider acceptance, never inbox delivery. No automatic retries.
const ENDPOINT = 'https://dm.aliyuncs.com/';
const TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 64 * 1024;
const encode = value => encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
const value = entry => typeof entry === 'string' ? entry.trim() : '';
const unavailable = () => Object.assign(new Error('Email delivery is unavailable or unconfirmed.'), {
  code: 'EMAIL_DELIVERY_UNAVAILABLE', status: 503,
});

function singleEmail(email) {
  return typeof email === 'string' && email.length <= 254
    && /^[^\s@,;<>()[\]\\"]+@[^\s@,;<>()[\]\\"]+\.[^\s@,;<>()[\]\\"]+$/.test(email)
    && !/[\x00-\x1f\x7f]/.test(email);
}

function validLink(link) {
  if (typeof link !== 'string' || link.length > 4096 || /[\s\x00-\x1f\x7f]/.test(link)) return false;
  try {
    const url = new URL(link);
    return !url.username && !url.password && (url.protocol === 'https:'
      || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)));
  } catch { return false; }
}

function configuration(env) {
  const keyId = value(env.ALIBABA_CLOUD_ACCESS_KEY_ID);
  const keySecret = value(env.ALIBABA_CLOUD_ACCESS_KEY_SECRET);
  const sender = value(env.NESTLET_EMAIL_FROM);
  return {
    keyId, keySecret, sender, securityToken: value(env.ALIBABA_CLOUD_SECURITY_TOKEN),
    configured: Boolean(keyId && keySecret && singleEmail(sender)),
  };
}

function mailContent(link, purpose) {
  const reset = purpose === 'reset';
  return {
    Subject: reset ? 'Nestlet 密码重置 / Reset your password' : 'Nestlet 邮箱验证 / Verify your email',
    TextBody: reset
      ? `请打开以下链接重置你的 Nestlet 密码：\n${link}\n\n链接仅可使用一次，并将在页面提示的时间内失效。重置密码后，已有登录会话将失效。若非本人操作，请忽略此邮件。\n\nOpen this link to reset your Nestlet password. This link is single-use and expires as stated on the request page. Resetting your password ends existing sign-in sessions. If you did not request this, ignore this email.`
      : `请打开以下链接验证你的 Nestlet 邮箱：\n${link}\n\n链接仅可使用一次，并将在页面提示的时间内失效。若非本人操作，请忽略此邮件。\n\nOpen this link to verify your Nestlet email. This link is single-use and expires as stated on the request page. If you did not request this, ignore this email.`,
  };
}

function discardBody(response) {
  // Cleanup must never extend the deadline or surface provider errors.
  try { Promise.resolve(response?.body?.cancel()).catch(() => {}); } catch { /* no logging */ }
}

async function readReceipt(response, signal) {
  const contentLength = response.headers?.get('content-length');
  if (!response.ok || !response.body || (contentLength !== null && contentLength !== undefined
    && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_RESPONSE_BYTES))) {
    discardBody(response);
    throw unavailable();
  }
  const reader = response.body.getReader();
  const cancel = () => { try { Promise.resolve(reader.cancel()).catch(() => {}); } catch { /* no logging */ } };
  signal.addEventListener('abort', cancel, { once: true });
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const part = await reader.read();
      signal.throwIfAborted();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > MAX_RESPONSE_BYTES) throw unavailable();
      chunks.push(Buffer.from(part.value));
    }
    const receipt = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, length)));
    if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)
      || Object.hasOwn(receipt, 'Code')
      || typeof receipt.RequestId !== 'string' || !receipt.RequestId.trim()
      || typeof receipt.EnvId !== 'string' || !receipt.EnvId.trim()) throw unavailable();
  } finally {
    signal.removeEventListener('abort', cancel);
    cancel();
    reader.releaseLock();
  }
}

export function createEmailDelivery({ env = process.env, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  let lastAttemptStatus = 'never-attempted';
  let lastAttemptAt;
  let attemptSequence = 0;
  return {
    get configured() { return configuration(env).configured; },
    status() {
      return { configured: configuration(env).configured, lastAttemptStatus, ...(lastAttemptAt ? { lastAttemptAt } : {}) };
    },
    async send(input = {}) {
      const attempt = ++attemptSequence;
      lastAttemptAt = new Date(now()).toISOString();
      lastAttemptStatus = 'provider-unconfirmed';
      const config = configuration(env);
      if (!config.configured) {
        lastAttemptStatus = 'not-configured';
        throw unavailable();
      }
      let timer;
      const controller = new AbortController();
      try {
        const { email, link, purpose } = input || {};
        if (!singleEmail(email) || !validLink(link) || !['verify', 'reset'].includes(purpose)) throw unavailable();
        const params = {
          AccessKeyId: config.keyId, Action: 'SingleSendMail', Version: '2015-11-23',
          RegionId: 'cn-hangzhou', Format: 'JSON', SignatureMethod: 'HMAC-SHA1', SignatureVersion: '1.0',
          SignatureNonce: randomUUID(), Timestamp: lastAttemptAt.replace(/\.\d{3}Z$/, 'Z'),
          AccountName: config.sender, AddressType: '1', ReplyToAddress: 'false', FromAlias: 'Nestlet',
          ToAddress: email, ...mailContent(link, purpose),
        };
        if (config.securityToken) params.SecurityToken = config.securityToken;
        const canonical = Object.keys(params).sort().map(key => `${encode(key)}=${encode(params[key])}`).join('&');
        params.Signature = createHmac('sha1', `${config.keySecret}&`).update(`POST&%2F&${encode(canonical)}`).digest('base64');
        const deadline = new Promise((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(unavailable()); }, TIMEOUT_MS);
        });
        const request = (async () => {
          const response = await fetchImpl(ENDPOINT, {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(params).toString(), redirect: 'error', signal: controller.signal,
          });
          if (controller.signal.aborted) { discardBody(response); throw unavailable(); }
          await readReceipt(response, controller.signal);
        })();
        await Promise.race([request, deadline]);
        if (attempt === attemptSequence) lastAttemptStatus = 'provider-accepted';
        return { accepted: true };
      } catch {
        if (attempt === attemptSequence) lastAttemptStatus = 'provider-unconfirmed';
        // Never expose upstream bodies, credentials, recipient, or one-time links as errors/causes.
        throw unavailable();
      } finally { clearTimeout(timer); }
    },
  };
}
