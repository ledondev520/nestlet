import { createContext, useCallback, useContext, useMemo, useRef, useState, useEffect } from 'react';
import { createApiClient } from './api.js';
import { draftVault } from './draft-vault.js';

const SessionContext = createContext(null);
const emptySession = { authenticated: false, userId: null, role: null, csrfToken: '' };

/** The only owner of account state. Feature modules never store credentials. */
export function SessionProvider({ children }) {
  const [status, setStatus] = useState(emptySession);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [recovery, setRecovery] = useState(null);
  const statusRef = useRef(emptySession);
  const generation = useRef(0);
  const update = useCallback(next => {
    if (next.authenticated && typeof next.userId === 'string' && next.userId) {
      const resumed = draftVault.verifyUser(next.userId);
      setRecovery(previous => resumed ? 'restored' : previous === 'suspended' ? null : previous);
    }
    statusRef.current = next;
    setStatus(next);
  }, []);
  const expire = useCallback(() => {
    const previous = statusRef.current;
    if (previous.authenticated && previous.userId) {
      const retained = draftVault.suspend(previous.userId);
      setRecovery(retained ? 'suspended' : null);
    }
    generation.current++;
    // Only public sign-in capabilities survive expiry, never account/provider data.
    const capabilities = Object.fromEntries(['authConfigured', 'secureLogin', 'registrationEnabled'].filter(key => Object.hasOwn(previous, key)).map(key => [key, previous[key]]));
    update({ ...emptySession, ...capabilities });
  }, [update]);
  const api = useMemo(() => createApiClient({
    getCsrfToken: () => statusRef.current.csrfToken || '',
    onUnauthorized: expire
  }), [expire]);

  const refresh = useCallback(async ({ signal } = {}) => {
    const current = ++generation.current;
    try {
      const next = await api.get('/api/status', { signal });
      if (current === generation.current) {
        if (!next.authenticated && statusRef.current.authenticated) expire();
        update(next); setError(null);
      }
      return next;
    } catch (failure) {
      if (failure.name !== 'AbortError' && current === generation.current) setError(failure);
      throw failure;
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [api, expire, update]);

  useEffect(() => {
    const controller = new AbortController();
    refresh({ signal: controller.signal }).catch(() => {});
    return () => controller.abort();
  }, [refresh]);

  const authenticate = useCallback(async (path, credentials) => {
    const current = ++generation.current;
    const result = await api.post(path, credentials);
    if (current !== generation.current) return result;
    update({ ...emptySession, ...result });
    // Login succeeded even if a later capability refresh is unavailable.
    await refresh().catch(() => {});
    return result;
  }, [api, refresh, update]);
  const login = useCallback(credentials => authenticate('/api/login', credentials), [authenticate]);
  const register = useCallback(credentials => authenticate('/api/register', credentials), [authenticate]);
  const logout = useCallback(async () => {
    // This method is called only after explicit sign-out confirmation. Even an
    // uncertain network result must not retain a user-requested discard cache.
    draftVault.clear();
    setRecovery(null);
    await api.post('/api/logout', {});
    generation.current++;
    update(emptySession);
    await refresh().catch(() => {});
  }, [api, refresh, update]);

  const value = useMemo(() => ({ status, loading, error, recovery, api, refresh, login, register, logout }), [status, loading, error, recovery, api, refresh, login, register, logout]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession requires SessionProvider');
  return session;
}
