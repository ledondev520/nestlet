/** Email identity policy. No provider keys, mailbox-specific alias folding or raw-token persistence. */
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export const EMAIL_LIMITS = Object.freeze({ verifyMs: 10 * 60_000, resetMs: 30 * 60_000, resendMs: 60_000, requestsPerEmailHour: 5, requestsPerIpHour: 20, requestsPerHour: 60 });
export const HASH_PATTERN = /^scrypt\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{43})$/u;
export class EmailAuthError extends Error {
  constructor(code = 'EMAIL_AUTH_INVALID', status = 400) { super(code); this.name = 'EmailAuthError'; this.code = code; this.status = status; }
}
export function normalizeEmail(value) {
  if (typeof value !== 'string' || value.length > 254 || /[^\x20-\x7e]/u.test(value)) return null;
  const email = value.trim().toLowerCase();
  const at = email.indexOf('@');
  if (at < 1 || at > 64 || at !== email.lastIndexOf('@')) return null;
  const local = email.slice(0, at), domain = email.slice(at + 1);
  if (!/^[a-z0-9.!#$%&'*+\-/=?^_`{|}~]+$/u.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null;
  if (domain.length > 253 || !domain.includes('.') || domain.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label))) return null;
  return email;
}
export const digest = value => createHash('sha256').update(value).digest('hex');
export const validToken = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/u.test(value) && Buffer.from(value, 'base64url').toString('base64url') === value;
export const validPassword = value => typeof value === 'string' && value.length >= 6 && value.length <= 256 && !/[\u0000-\u001f\u007f]/u.test(value);
export async function hashPassword(password) {
  if (!validPassword(password)) throw new EmailAuthError();
  const salt = randomBytes(16);
  const key = await derive(password, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}
export async function checkPassword(password, hash) {
  const match = typeof hash === 'string' && HASH_PATTERN.exec(hash);
  if (!match || !validPassword(password)) return false;
  const key = await derive(password, Buffer.from(match[1], 'base64url'), 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(key, Buffer.from(match[2], 'base64url'));
}
export function assertFields(input, allowed, required = allowed) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(input, key))) throw new EmailAuthError();
}
