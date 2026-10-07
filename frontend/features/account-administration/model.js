/** Capability presentation is independent of the persisted owner/trial role. */
export function canManageAccounts(status) {
  return status?.authenticated === true && status.userId === 'owner' && status.role === 'owner' && status.canManageAccounts === true;
}

/** A changed session token remounts the panel without retaining the old roster. */
export function accountSessionKey(status) {
  return JSON.stringify([status?.authenticated === true, status?.userId, status?.role, status?.csrfToken, status?.canManageAccounts === true, status?.canViewDiagnostics === true]);
}

export function accountLabel(account) {
  return account.role === 'owner' ? 'owner' : account.administrator ? 'administrator' : 'ordinary';
}

export function verifiedEmail(account) {
  return typeof account?.email === 'string' && account.email.length > 0 && Number.isSafeInteger(account.emailVerifiedAt) && account.emailVerifiedAt >= 0;
}

export function canChangeAdministrator(account, userId = 'owner') {
  return account?.role === 'trial' && typeof account.id === 'string' && account.id.length > 0 && account.id !== 'owner' && account.id !== userId &&
    Number.isSafeInteger(account.capabilityVersion) && account.capabilityVersion >= 0 &&
    (account.administrator === true || (account.administrator === false && account.canGrantAdministrator === true && verifiedEmail(account)));
}

const invalid = () => { throw Object.assign(new Error('INVALID_RESPONSE'), { code: 'INVALID_RESPONSE' }); };
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value);
const timestamp = value => Number.isSafeInteger(value) && value >= 0;

export function readAccount(value) {
  if (!value || !text(value.id, 128) || !text(value.username, 320) || !['owner', 'trial'].includes(value.role) ||
      (value.role === 'owner') !== (value.id === 'owner') ||
      !(value.email === null || text(value.email, 254)) ||
      !(value.emailVerifiedAt === null || timestamp(value.emailVerifiedAt)) ||
      (value.emailVerifiedAt !== null && value.email === null) ||
      !((timestamp(value.createdAt) && Number.isFinite(new Date(value.createdAt).getTime())) || (typeof value.createdAt === 'string' && value.createdAt.length <= 40 && Number.isFinite(Date.parse(value.createdAt)))) ||
      typeof value.administrator !== 'boolean' || typeof value.canGrantAdministrator !== 'boolean' ||
      !timestamp(value.capabilityVersion)) return invalid();
  // Keep only the account-directory contract, never arbitrary backend fields.
  const { id, username, role, email, emailVerifiedAt, createdAt, administrator, capabilityVersion, canGrantAdministrator } = value;
  return { id, username, role, email, emailVerifiedAt, createdAt, administrator, capabilityVersion, canGrantAdministrator };
}

export function readAccounts(value) {
  if (!value || !Array.isArray(value.accounts)) return invalid();
  const accounts = value.accounts.map(readAccount);
  if (new Set(accounts.map(account => account.id)).size !== accounts.length) return invalid();
  return accounts;
}

export function readAdministratorChange(value, selected, administrator) {
  if (!value || typeof value.changed !== 'boolean') return invalid();
  const account = readAccount(value.account);
  if (account.id !== selected.id || account.role !== 'trial' || account.administrator !== administrator ||
      account.capabilityVersion < selected.capabilityVersion) return invalid();
  return { account, changed: value.changed };
}

export function changeFailure(error) {
  if (error?.status === 409 || ['VERSION_CONFLICT', 'CAPABILITY_VERSION_CONFLICT', 'ACCOUNT_VERSION_CONFLICT'].includes(error?.code)) return 'conflict';
  if ([401, 403].includes(error?.status)) return 'permission';
  return 'uncertain';
}

export function canViewDiagnostics(status) {
  return status?.authenticated === true && typeof status.userId === 'string' && status.userId.length > 0 && status.canViewDiagnostics === true;
}

export function readDiagnostics(value) {
  if (!value || value.model !== 'deepseek-flash' || !['liveEnabled', 'pdfEnabled', 'workbookEnabled'].every(field => typeof value[field] === 'boolean') ||
      !timestamp(value.uptimeSeconds) || !value.activeRequests || !['chat', 'extraction', 'pdf', 'workbook'].every(field => timestamp(value.activeRequests[field]))) return invalid();
  const { model, liveEnabled, pdfEnabled, workbookEnabled, uptimeSeconds } = value;
  const { chat, extraction, pdf, workbook } = value.activeRequests;
  return { model, liveEnabled, pdfEnabled, workbookEnabled, uptimeSeconds, activeRequests: { chat, extraction, pdf, workbook } };
}
