/** Schema 6 is additive: never rebuild users, mutate identity roles, or touch user-owned records. */
import { AccountAdministrationError, administratorChange, requireAccountOwner } from './account-administration.js';
export const ACCOUNT_ADMINISTRATION_SCHEMA_SQL = `
CREATE TABLE user_capabilities (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) CHECK(user_id != 'owner'),
  administrator INTEGER NOT NULL CHECK(administrator IN (0,1)),
  version INTEGER NOT NULL CHECK(version > 0),
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE account_capability_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id TEXT NOT NULL REFERENCES users(id) CHECK(actor_user_id = 'owner'),
  target_user_id TEXT NOT NULL REFERENCES users(id) CHECK(target_user_id != 'owner'),
  administrator INTEGER NOT NULL CHECK(administrator IN (0,1)),
  version INTEGER NOT NULL CHECK(version > 0),
  created_at TEXT NOT NULL,
  UNIQUE(target_user_id,version)
) STRICT;
CREATE TRIGGER account_capability_audit_no_update BEFORE UPDATE ON account_capability_audit
  BEGIN SELECT RAISE(ABORT,'Capability audit is append-only'); END;
CREATE TRIGGER account_capability_audit_no_delete BEFORE DELETE ON account_capability_audit
  BEGIN SELECT RAISE(ABORT,'Capability audit is append-only'); END;
PRAGMA user_version=6;`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const fail = (code, status) => { throw new AccountAdministrationError(code, status); };
export function createAccountAdministrationStorage({ db, transaction }) {
  // Explicit select lists exclude credential hashes, email-action tokens and every customer record.
  const columns = `u.id,u.username,u.role,u.created_at AS createdAt,e.email,e.verified_at AS emailVerifiedAt,
    COALESCE(c.administrator,0) AS administrator,COALESCE(c.version,0) AS capabilityVersion`;
  const from = 'FROM users u LEFT JOIN email_identities e ON e.user_id=u.id LEFT JOIN user_capabilities c ON c.user_id=u.id';
  const account = row => row ? { ...row, administrator: row.role === 'owner' || row.administrator === 1,
    canGrantAdministrator: row.role === 'trial' && row.email !== null && row.emailVerifiedAt !== null } : null;
  const find = id => account(db.prepare(`SELECT ${columns} ${from} WHERE u.id=?`).get(id));
  const requireOwner = session => {
    requireAccountOwner(session);
    if (!db.prepare("SELECT 1 FROM users WHERE id='owner' AND username='owner' AND role='owner' AND password_hash IS NULL").get()) fail('OWNER_REQUIRED', 403);
  };
  return {
    administrator(id) {
      // Used after credential/session validation, on every request. Never cached in the cookie or session.
      return db.prepare("SELECT 1 FROM user_capabilities c JOIN users u ON u.id=c.user_id WHERE c.user_id=? AND c.administrator=1 AND u.role='trial' AND u.id!='owner'").get(id) !== undefined;
    },
    listAccounts(session) {
      requireOwner(session);
      return { accounts: db.prepare(`SELECT ${columns} ${from} ORDER BY CASE WHEN u.id='owner' THEN 0 ELSE 1 END,u.created_at,u.id LIMIT 101`).all().map(account) };
    },
    setAdministrator(session, targetId, input) {
      requireOwner(session);
      const change = administratorChange(input);
      if (targetId === 'owner') fail('OWNER_IMMUTABLE', 403);
      if (typeof targetId !== 'string' || !UUID.test(targetId)) fail('ACCOUNT_ADMIN_INVALID', 400);
      return transaction(() => {
        requireOwner(session);
        const target = find(targetId);
        if (!target || target.role !== 'trial') fail('ACCOUNT_NOT_FOUND', 404);
        if (target.capabilityVersion !== change.expectedVersion) {
          // Exact response-loss replay is idempotent; older history/ABA still conflicts.
          if (target.capabilityVersion === change.expectedVersion + 1 && target.administrator === change.administrator) {
            return { account: target, changed: false };
          }
          fail('ACCOUNT_CAPABILITY_CONFLICT', 409);
        }
        if (target.administrator === change.administrator) return { account: target, changed: false };
        if (change.administrator && !target.canGrantAdministrator) fail('ACCOUNT_EMAIL_REQUIRED', 409);
        if (target.capabilityVersion >= Number.MAX_SAFE_INTEGER) fail('ACCOUNT_CAPABILITY_CONFLICT', 409);
        const version = target.capabilityVersion + 1, now = new Date().toISOString();
        db.prepare(`INSERT INTO user_capabilities(user_id,administrator,version,updated_at) VALUES(?,?,?,?)
          ON CONFLICT(user_id) DO UPDATE SET administrator=excluded.administrator,version=excluded.version,updated_at=excluded.updated_at`)
          .run(targetId, Number(change.administrator), version, now);
        // The grant and its minimal audit are one transaction; audit failure rolls back the grant.
        db.prepare('INSERT INTO account_capability_audit(actor_user_id,target_user_id,administrator,version,created_at) VALUES(?,?,?,?,?)')
          .run(session.userId, targetId, Number(change.administrator), version, now);
        return { account: find(targetId), changed: true };
      });
    },
    audit(session, { before = null, limit = 50 } = {}) {
      requireOwner(session);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
          (before !== null && (!Number.isSafeInteger(before) || before < 1))) fail('ACCOUNT_ADMIN_INVALID', 400);
      const rows = db.prepare(`SELECT id,actor_user_id AS actorUserId,target_user_id AS targetUserId,
        administrator,version,created_at AS createdAt FROM account_capability_audit
        WHERE (? IS NULL OR id < ?) ORDER BY id DESC LIMIT ?`).all(before, before, limit + 1);
      const events = rows.slice(0, limit).map(row => ({ ...row, administrator: row.administrator === 1 }));
      return { events, nextBefore: rows.length > limit ? events.at(-1).id : null };
    },
  };
}
