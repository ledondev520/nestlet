/** Service availability is separate from identity, administrator roles and record ownership. */
export const SERVICE_LIMITS = Object.freeze({ defaultUserRequests: 10, globalRequests: 30, windowMs: 3600000 });
export class ServiceEntitlementError extends Error {
  constructor(code = 'SERVICE_INVALID', status = 400) { super(code); this.name = 'ServiceEntitlementError'; this.code = code; this.status = status; }
}
export const serviceOwner = session => session?.userId === 'owner' && session?.role === 'owner';
export function requireServiceOwner(session) { if (!serviceOwner(session)) throw new ServiceEntitlementError('OWNER_REQUIRED', 403); }
export function serviceChange(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input)) ||
      Object.keys(input).length !== 4 || !['enabled','expiresAt','requestsPerHour','expectedVersion'].every(key => Object.hasOwn(input,key)) ||
      typeof input.enabled !== 'boolean' || !Number.isSafeInteger(input.requestsPerHour) || input.requestsPerHour < 1 || input.requestsPerHour > SERVICE_LIMITS.globalRequests ||
      !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) throw new ServiceEntitlementError();
  if (input.expiresAt !== null && (typeof input.expiresAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(input.expiresAt) || !Number.isFinite(Date.parse(input.expiresAt)) || new Date(input.expiresAt).toISOString() !== input.expiresAt)) throw new ServiceEntitlementError();
  return { enabled:input.enabled, expiresAt:input.expiresAt, requestsPerHour:input.requestsPerHour, expectedVersion:input.expectedVersion };
}
