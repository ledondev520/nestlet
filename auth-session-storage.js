/** Private server-side session records. Only SHA-256 bearer digests reach SQLite. */
export const AUTH_SESSION_SCHEMA_SQL = `
CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY CHECK(length(token_hash)=64 AND token_hash NOT GLOB '*[^0-9a-f]*'),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','trial')),
  credential_fingerprint TEXT NOT NULL CHECK(length(credential_fingerprint)=64),
  csrf_token TEXT NOT NULL CHECK(length(csrf_token)=43),
  remember_me INTEGER NOT NULL CHECK(remember_me IN (0,1)),
  created INTEGER NOT NULL CHECK(created>=0),
  last_used INTEGER NOT NULL CHECK(last_used>=created)
) STRICT;
CREATE INDEX auth_sessions_user_created ON auth_sessions(user_id,created);
CREATE TRIGGER auth_sessions_revoke_credentials AFTER UPDATE OF password_hash,role ON users
WHEN OLD.password_hash IS NOT NEW.password_hash OR OLD.role IS NOT NEW.role
BEGIN DELETE FROM auth_sessions WHERE user_id=NEW.id; END;
PRAGMA user_version=8;
`;

export function createAuthSessionStorage({db,transaction}) {
  const columns = `token_hash AS tokenHash,user_id AS userId,username,role,
    credential_fingerprint AS credentialFingerprint,csrf_token AS csrfToken,
    remember_me AS rememberMe,created,last_used AS lastUsed`;
  const decode = row => row && ({...row,rememberMe:Boolean(row.rememberMe)});
  return {
    transaction,
    // Registration uses the same connection/transaction; no row is externally
    // visible until the account and proof transaction successfully commits.
    stageRegistration: transaction,
    get size() { return db.prepare('SELECT COUNT(*) AS count FROM auth_sessions').get().count; },
    get(hash) { return decode(db.prepare(`SELECT ${columns} FROM auth_sessions WHERE token_hash=?`).get(hash)); },
    set(hash, record) {
      db.prepare(`INSERT INTO auth_sessions(token_hash,user_id,username,role,credential_fingerprint,csrf_token,remember_me,created,last_used)
        VALUES(?,?,?,?,?,?,?,?,?)`)
        .run(hash,record.userId,record.username,record.role,record.credentialFingerprint,record.csrfToken,Number(record.rememberMe),record.created,record.lastUsed);
    },
    touch(hash, lastUsed) { db.prepare('UPDATE auth_sessions SET last_used=? WHERE token_hash=?').run(lastUsed,hash); },
    delete(hash) { db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(hash); },
    clear() { db.exec('DELETE FROM auth_sessions'); },
    *[Symbol.iterator]() {
      for (const row of db.prepare(`SELECT ${columns} FROM auth_sessions ORDER BY created,rowid`).all()) yield [row.tokenHash,decode(row)];
    },
  };
}
