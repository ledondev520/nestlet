/** Explicit capabilities, separate from immutable authentication identities and case ownership. */
export class AccountAdministrationError extends Error {
  constructor(code = 'ACCOUNT_ADMIN_INVALID', status = 400) {
    super(code); this.name = 'AccountAdministrationError'; this.code = code; this.status = status;
  }
}
export function isBootstrapOwner(session) {
  return session?.userId === 'owner' && session?.role === 'owner';
}
export function accountPermissions(session, administrator = false) {
  const owner = isBootstrapOwner(session);
  const granted = Boolean(session && session.role === 'trial' && session.userId !== 'owner' && administrator === true);
  return { administrator: owner || granted, canManageAccounts: owner, canViewDiagnostics: owner || granted };
}
export function requireAccountOwner(session) {
  if (!isBootstrapOwner(session)) throw new AccountAdministrationError('OWNER_REQUIRED', 403);
}
export function administratorChange(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(input)) ||
      Object.keys(input).length !== 2 || !Object.hasOwn(input, 'administrator') || !Object.hasOwn(input, 'expectedVersion') ||
      typeof input.administrator !== 'boolean' || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new AccountAdministrationError();
  }
  return { administrator: input.administrator, expectedVersion: input.expectedVersion };
}
