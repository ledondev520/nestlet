/** Schema 5 adds email authentication without rebuilding or changing existing users/cases. */
import { randomBytes, randomUUID } from 'node:crypto';
import { EMAIL_LIMITS, EmailAuthError, normalizeEmail, digest, HASH_PATTERN } from './email-auth-domain.js';
export const EMAIL_SCHEMA_SQL = `
CREATE TABLE email_identities (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id),
  email TEXT NOT NULL UNIQUE CHECK(email=lower(email) AND length(email) BETWEEN 3 AND 254),
  verified_at INTEGER NOT NULL
) STRICT;
CREATE TABLE email_actions (
  token_hash TEXT PRIMARY KEY NOT NULL CHECK(length(token_hash)=64),
  kind TEXT NOT NULL CHECK(kind IN ('register','bind','reset')),
  email TEXT NOT NULL CHECK(email=lower(email) AND length(email) BETWEEN 3 AND 254),
  user_id TEXT REFERENCES users(id),
  password_hash TEXT,
  credential_fingerprint TEXT,
  ready INTEGER NOT NULL DEFAULT 0 CHECK(ready IN (0,1)),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK(expires_at>created_at),
  UNIQUE(kind,email),
  CHECK((kind='register' AND user_id IS NULL AND password_hash IS NOT NULL AND credential_fingerprint IS NULL)
    OR (kind IN ('bind','reset') AND user_id IS NOT NULL AND password_hash IS NULL AND credential_fingerprint IS NOT NULL))
) STRICT;
CREATE INDEX email_actions_expiry ON email_actions(expires_at);
CREATE TABLE email_rate_buckets (
  bucket_hash TEXT PRIMARY KEY NOT NULL CHECK(length(bucket_hash)=64),
  count INTEGER NOT NULL CHECK(count>0),
  expires_at INTEGER NOT NULL
) STRICT;
CREATE INDEX email_rate_expiry ON email_rate_buckets(expires_at);
PRAGMA user_version=5;`;

export function createEmailAuthStorage({ db, transaction, maxUsers = 100 }) {
  const user = id => db.prepare('SELECT id,username,role,password_hash AS passwordHash FROM users WHERE id=?').get(id) ?? null;
  const identity = id => db.prepare('SELECT email,verified_at AS verifiedAt FROM email_identities WHERE user_id=?').get(id) ?? null;
  const byEmail = email => db.prepare('SELECT u.id,u.username,u.role,u.password_hash AS passwordHash,e.email,e.verified_at AS emailVerifiedAt FROM email_identities e JOIN users u ON u.id=e.user_id WHERE e.email=?').get(email) ?? null;
  const action = hash => db.prepare('SELECT token_hash AS tokenHash,kind,email,user_id AS userId,password_hash AS passwordHash,credential_fingerprint AS credentialFingerprint,ready,created_at AS createdAt,expires_at AS expiresAt FROM email_actions WHERE token_hash=?').get(hash) ?? null;
  const clean = now => {
    db.prepare('DELETE FROM email_actions WHERE expires_at<=?').run(now);
    db.prepare('DELETE FROM email_rate_buckets WHERE expires_at<=?').run(now);
  };
  const buckets = (specifications, now) => {
    const candidates = specifications.map(([name, maximum, duration]) => ({ key: digest(name), maximum, duration }));
    let newRows = 0;
    for (const candidate of candidates) {
      const previous = db.prepare('SELECT count FROM email_rate_buckets WHERE bucket_hash=?').get(candidate.key);
      if (previous?.count >= candidate.maximum) return false;
      if (!previous) newRows++;
    }
    if (newRows + db.prepare('SELECT count(*) AS n FROM email_rate_buckets').get().n > 4096) return false;
    // All-or-nothing preflight under the caller's write transaction: an exhausted
    // individual IP cannot keep spending everybody else's remaining global quota.
    for (const candidate of candidates) db.prepare('INSERT INTO email_rate_buckets VALUES(?,1,?) ON CONFLICT(bucket_hash) DO UPDATE SET count=count+1').run(candidate.key, now + candidate.duration);
    return true;
  };
  const requireEmail = email => { if (!email || normalizeEmail(email) !== email) throw new EmailAuthError(); };
  const requireHash = hash => { if (typeof hash !== 'string' || !HASH_PATTERN.test(hash)) throw new EmailAuthError(); };
  const requireDigest = value => { if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) throw new EmailAuthError(); };
  return {
    identity, findByEmail: byEmail, getAction: action,
    reserveRequest(email, ip, now = Date.now()) {
      requireEmail(email);
      return transaction(() => {
        clean(now);
        // Account-specific suppression returns the same public 202 as any eligible request.
        if (!buckets([['send:ip:' + ip, EMAIL_LIMITS.requestsPerIpHour, 3600_000], ['send:global', EMAIL_LIMITS.requestsPerHour, 3600_000]], now)) return 'rate-limited';
        if (!buckets([['send:cooldown:' + email, 1, EMAIL_LIMITS.resendMs], ['send:email:' + email, EMAIL_LIMITS.requestsPerEmailHour, 3600_000]], now)) return 'suppressed';
        return 'allowed';
      });
    },
    reserveClaim(ip, now = Date.now()) {
      return transaction(() => {
        clean(now);
        return buckets([['claim:ip:' + ip, 60, 600_000], ['claim:global', 600, 600_000]], now);
      });
    },
    pendingRegistration(email, now = Date.now()) {
      requireEmail(email);
      return db.prepare("SELECT password_hash AS passwordHash FROM email_actions WHERE kind='register' AND email=? AND expires_at>?").get(email, now) ?? null;
    },
    createAction({ kind, email, userId = null, passwordHash = null, credentialFingerprint = null, now = Date.now() }) {
      requireEmail(email);
      if (!['register', 'bind', 'reset'].includes(kind)) throw new EmailAuthError();
      if (kind === 'register') requireHash(passwordHash); else requireDigest(credentialFingerprint);
      return transaction(() => {
        clean(now);
        if (kind === 'register') {
          if (byEmail(email) || db.prepare("SELECT count(*) AS n FROM users WHERE role='trial'").get().n >= maxUsers || db.prepare("SELECT count(*) AS n FROM email_actions WHERE kind='register'").get().n >= maxUsers) return null;
        } else {
          const target = user(userId);
          if (!target || (kind === 'reset' && (target.role !== 'trial' || identity(userId)?.email !== email))) return null;
          if (kind === 'bind' && (identity(userId) || byEmail(email))) return null;
          if (target.role === 'trial' && digest(target.passwordHash) !== credentialFingerprint) return null;
        }
        db.prepare('DELETE FROM email_actions WHERE kind=? AND email=?').run(kind, email);
        if (kind === 'bind') db.prepare("DELETE FROM email_actions WHERE kind='bind' AND user_id=?").run(userId);
        const token = randomBytes(32).toString('base64url'), tokenHash = digest(token);
        const expiresAt = now + (kind === 'reset' ? EMAIL_LIMITS.resetMs : EMAIL_LIMITS.verifyMs);
        db.prepare('INSERT INTO email_actions(token_hash,kind,email,user_id,password_hash,credential_fingerprint,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)')
          .run(tokenHash, kind, email, userId, passwordHash, credentialFingerprint, now, expiresAt);
        return { token, tokenHash, expiresAt };
      });
    },
    markAccepted(tokenHash, now = Date.now()) { requireDigest(tokenHash); return db.prepare('UPDATE email_actions SET ready=1 WHERE token_hash=? AND expires_at>?').run(tokenHash, now).changes === 1; },
    cancel(tokenHash) { requireDigest(tokenHash); db.prepare('DELETE FROM email_actions WHERE token_hash=?').run(tokenHash); },
    verify(tokenHash, { now = Date.now(), ownerFingerprint = null } = {}) {
      requireDigest(tokenHash);
      return transaction(() => {
        const current = action(tokenHash);
        if (!current || !current.ready || current.expiresAt <= now || !['register', 'bind'].includes(current.kind)) return false;
        if (byEmail(current.email)) return false;
        let id = current.userId;
        if (current.kind === 'register') {
          if (db.prepare("SELECT count(*) AS n FROM users WHERE role='trial'").get().n >= maxUsers) return false;
          id = randomUUID();
          db.prepare("INSERT INTO users(id,username,role,password_hash,created_at) VALUES(?,?,'trial',?,?)")
            .run(id, 'email-' + id, current.passwordHash, new Date(now).toISOString());
        } else {
          const target = user(id);
          if (!target || identity(id) || (target.role === 'owner' ? ownerFingerprint : digest(target.passwordHash)) !== current.credentialFingerprint) return false;
        }
        db.prepare('INSERT INTO email_identities VALUES(?,?,?)').run(id, current.email, now);
        db.prepare('DELETE FROM email_actions WHERE token_hash=? OR (email=? AND kind IN (\'register\',\'bind\'))').run(tokenHash, current.email);
        return true;
      });
    },
    reset(tokenHash, passwordHash, now = Date.now()) {
      requireDigest(tokenHash); requireHash(passwordHash);
      return transaction(() => {
        const current = action(tokenHash);
        if (!current || !current.ready || current.kind !== 'reset' || current.expiresAt <= now) return false;
        const target = user(current.userId);
        if (!target || target.role !== 'trial' || identity(target.id)?.email !== current.email || digest(target.passwordHash) !== current.credentialFingerprint) return false;
        const changed = db.prepare("UPDATE users SET password_hash=? WHERE id=? AND role='trial' AND password_hash=?").run(passwordHash, target.id, target.passwordHash);
        if (changed.changes !== 1) return false;
        db.prepare('DELETE FROM email_actions WHERE user_id=?').run(target.id);
        return true;
      });
    },
  };
}
