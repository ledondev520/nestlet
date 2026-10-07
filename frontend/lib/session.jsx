import { createContext, useCallback, useContext, useMemo, useRef, useState, useEffect } from 'react';
import { createApiClient } from './api.js';

const SessionContext = createContext(null);
const emptySession = { authenticated: false, userId: null, role: null, csrfToken: '' };

/** The only owner of account state. Feature modules never store credentials. */
export function SessionProvider({ children }) {
  const [status, setStatus] = useState(emptySession);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const statusRef = useRef(emptySession);
  const generation = useRef(0);
  const update = useCallback(next => {
    statusRef.current = next;
    setStatus(next);
  }, []);
  const api = useMemo(() => createApiClient({
    getCsrfToken: () => statusRef.current.csrfToken || '',
    onUnauthorized: () => { generation.current++; update(emptySession); }
  }), [update]);

  const refresh = useCallback(async ({ signal } = {}) => {
    const current = ++generation.current;
    try {
      const next = await api.get('/api/status', { signal });
      if (current === generation.current) { update(next); setError(null); }
      return next;
    } catch (failure) {
      if (failure.name !== 'AbortError' && current === generation.current) setError(failure);
      throw failure;
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [api, update]);

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
    await api.post('/api/logout', {});
    generation.current++;
    update(emptySession);
    await refresh().catch(() => {});
  }, [api, refresh, update]);

  const value = useMemo(() => ({ status, loading, error, api, refresh, login, register, logout }), [status, loading, error, api, refresh, login, register, logout]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession requires SessionProvider');
  return session;
}
