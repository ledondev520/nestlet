/** Account-scoped consent records. No customer material, credentials, or implicit grants. */
export const LIBRARY_PERMISSION_SCOPE = Object.freeze({
  provider: Object.freeze({ id: 'deepseek', endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-flash' }),
  policyVersion: 'library-retrieval-v1',
  category: 'saved-library-excerpts',
});
export const LIBRARY_CONSENT_SCHEMA_SQL = `
CREATE TABLE library_permissions (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK(decision IN ('allow','deny')),
  version INTEGER NOT NULL CHECK(version > 0),
  provider_id TEXT NOT NULL,
  provider_endpoint TEXT NOT NULL,
  provider_model TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  category TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
PRAGMA user_version=9;
`;
export class LibraryPermissionError extends Error {
  constructor(code, status = 400) { super(code); this.name = 'LibraryPermissionError'; this.code = code; this.status = status; }
}
const fail = (code = 'LIBRARY_PERMISSION_INVALID', status = 400) => { throw new LibraryPermissionError(code, status); };
const plain = value => value !== null && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const exact = (value, fields) => {
  if (!plain(value) || Object.keys(value).length !== fields.length || fields.some(key => !Object.hasOwn(value, key))) fail();
};
const sameScope = (left, right) => left.provider.id === right.provider.id &&
  left.provider.endpoint === right.provider.endpoint && left.provider.model === right.provider.model &&
  left.policyVersion === right.policyVersion && left.category === right.category;
function validateChange(input, scope) {
  exact(input, ['decision', 'expectedVersion', 'provider', 'policyVersion', 'category']);
  exact(input.provider, ['id', 'endpoint', 'model']);
  if (!['allow', 'deny'].includes(input.decision) || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0 ||
      [input.provider.id, input.provider.endpoint, input.provider.model, input.policyVersion, input.category]
        .some(value => typeof value !== 'string' || !value || value.length > 300)) fail();
  if (!sameScope(input, scope)) fail('LIBRARY_PERMISSION_CONFLICT', 409);
}
export function createLibraryConsentStorage({ db, transaction, requireUser }) {
  const read = (userId, scope = LIBRARY_PERMISSION_SCOPE) => {
    requireUser(userId);
    const row = db.prepare(`SELECT decision,version,provider_id AS providerId,provider_endpoint AS providerEndpoint,
      provider_model AS providerModel,policy_version AS policyVersion,category,updated_at AS updatedAt
      FROM library_permissions WHERE user_id=?`).get(userId);
    const current = row && sameScope({ provider: { id: row.providerId, endpoint: row.providerEndpoint, model: row.providerModel },
      policyVersion: row.policyVersion, category: row.category }, scope);
    return { decision: current ? row.decision : 'unset', version: row?.version ?? 0,
      provider: { ...scope.provider }, policyVersion: scope.policyVersion, category: scope.category,
      updatedAt: current ? row.updatedAt : null };
  };
  return {
    read,
    set(userId, input, scope = LIBRARY_PERMISSION_SCOPE) {
      validateChange(input, scope);
      return transaction(() => {
        const previous = read(userId, scope);
        if (previous.version !== input.expectedVersion || previous.version >= Number.MAX_SAFE_INTEGER) fail('LIBRARY_PERMISSION_CONFLICT', 409);
        db.prepare(`INSERT INTO library_permissions(user_id,decision,version,provider_id,provider_endpoint,provider_model,policy_version,category,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET decision=excluded.decision,version=excluded.version,
          provider_id=excluded.provider_id,provider_endpoint=excluded.provider_endpoint,provider_model=excluded.provider_model,
          policy_version=excluded.policy_version,category=excluded.category,updated_at=excluded.updated_at`)
          .run(userId, input.decision, previous.version + 1, scope.provider.id, scope.provider.endpoint, scope.provider.model,
            scope.policyVersion, scope.category, new Date().toISOString());
        return read(userId, scope);
      });
    },
    assertAllowed(userId, expectedVersion, scope = LIBRARY_PERMISSION_SCOPE) {
      const current = read(userId, scope);
      if (current.decision !== 'allow') fail('LIBRARY_CONSENT_REQUIRED', 403);
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || current.version !== expectedVersion) fail('LIBRARY_PERMISSION_CONFLICT', 409);
      return current;
    },
  };
}
