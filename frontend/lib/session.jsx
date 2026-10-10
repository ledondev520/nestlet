import { createContext, useCallback, useContext, useMemo, useRef, useState, useEffect } from 'react';
import { createApiClient } from './api.js';
import { draftVault } from './draft-vault.js';
import { createJourneyTelemetry } from './journey-telemetry.js';

const SessionContext = createContext(null);
const emptySession = { authenticated: false, userId: null, role: null, csrfToken: '' };

/** The only owner of account state. Feature modules never store credentials. */
export function SessionProvider({ children }) {
  const [status, setStatus] = useState(emptySession);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [recovery, setRecovery] = useState(null);
  const [dataRevision, setDataRevision] = useState(0);
  const statusRef = useRef(emptySession);
  const journey = useMemo(() => createJourneyTelemetry({ getSession: () => statusRef.current }), []);
  const generation = useRef(0), apiRef = useRef(null), recoveryRead = useRef(null), identityAction = useRef(null);
  const update = useCallback(next => {
    if (next.authenticated && typeof next.userId === 'string' && next.userId) {
      const resumed = draftVault.verifyUser(next.userId);
      setRecovery(previous => resumed ? 'restored' : previous === 'suspended' ? null : previous);
    }
    statusRef.current = next;
    try { journey.syncIdentity(); } catch { /* Metadata cannot interrupt authentication. */ }
    setStatus(next);
  }, [journey]);
  const expire = useCallback(() => {
    const previous = statusRef.current;
    if (previous.authenticated && previous.userId) {
      const retained = draftVault.suspend(previous.userId);
      setRecovery(retained ? 'suspended' : null);
    }
    generation.current++;
    // Only public sign-in capabilities survive expiry, never account/provider data.
    const capabilities = Object.fromEntries(['authConfigured', 'secureLogin', 'registrationEnabled', 'emailDeliveryConfigured'].filter(key => Object.hasOwn(previous, key)).map(key => [key, previous[key]]));
    update({ ...emptySession, ...capabilities });
  }, [update]);
  const reconcileUnauthorized = useCallback(({path, recoveryAttempted}) => {
    // A background denial cannot supersede an explicit account transition.
    if(identityAction.current)return null;
    const previous=statusRef.current;
    if(!previous.authenticated || path==='/api/status' || path==='/api/logout' || recoveryAttempted){expire();return null;}
    const pending=recoveryRead.current;
    if(pending && pending.generation===generation.current && pending.userId===previous.userId && pending.csrfToken===previous.csrfToken)return pending.promise;
    const operation={generation:++generation.current,userId:previous.userId,csrfToken:previous.csrfToken};
    recoveryRead.current=operation;
    const current=()=>generation.current===operation.generation && statusRef.current.userId===previous.userId && statusRef.current.csrfToken===previous.csrfToken;
    operation.promise=(async()=>{
      try{
        const next=await apiRef.current.get('/api/status',{signal:AbortSignal.timeout(15000),telemetry:false});
        if(!current())return null;
        if(!next.authenticated || typeof next.userId!=='string' || !next.userId || typeof next.csrfToken!=='string' || !next.csrfToken){expire();return null;}
        update(next);setError(null);
        // Another verified account replaces private state but cannot authorize
        // a retry of the previous account's request.
        return next.userId===previous.userId?{sameUser:true,csrfToken:next.csrfToken}:null;
      }catch(failure){if(current()){expire();setError(failure);}return null;}
      finally{if(recoveryRead.current===operation)recoveryRead.current=null;}
    })();
    return operation.promise;
  },[expire,update]);
  const api = useMemo(() => createApiClient({
    getCsrfToken: () => statusRef.current.csrfToken || '',
    onUnauthorized: reconcileUnauthorized,
    onMutation: ({ path }) => { if (/^\/api\/(cases|clients|assets|artifacts|conversations)(?:\/|$|\?)/u.test(path)) setDataRevision(value => value + 1); },
    getJourney: () => journey
  }), [reconcileUnauthorized, journey]);
  apiRef.current=api;

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
    try { journey.connect(); } catch { /* Observation is optional. */ }
    return () => { try { journey.dispose(); } catch {} };
  }, [journey]);

  useEffect(() => {
    const controller = new AbortController();
    refresh({ signal: controller.signal }).catch(() => {});
    return () => controller.abort();
  }, [refresh]);

  const authenticate = useCallback(async (path, credentials, options) => {
    const action={};identityAction.current=action;
    const current = ++generation.current;
    try {
      const result = await api.post(path, credentials, options);
      if (current !== generation.current) return result;
      update({ ...emptySession, ...result });
      // Login succeeded even if a later capability refresh is unavailable.
      await refresh().catch(() => {});
      return result;
    } finally {if(identityAction.current===action)identityAction.current=null;}
  }, [api, refresh, update]);
  const verifyEmail = useCallback(async (proof, options) => {
    const action={};identityAction.current=action;
    const current = ++generation.current;
    try {
      const result = await api.post('/api/auth/email/verify', proof, { ...options, telemetry: false });
      if (result?.verified !== true || typeof result.authenticated !== 'boolean' ||
        (result.authenticated && (!result.userId || result.role !== 'trial' || !result.csrfToken))) throw { code: 'INVALID_RESPONSE' };
      if (current !== generation.current || options?.signal?.aborted) return result;
      if (result.authenticated) update({ ...emptySession, ...result });
      await refresh({ signal: options?.signal }).catch(() => {});
      return result;
    } finally {if(identityAction.current===action)identityAction.current=null;}
  }, [api, refresh, update]);
  const login = useCallback((credentials, options) => authenticate('/api/login', credentials, options), [authenticate]);
  // Registration only requests verification. A 202 never creates a browser session.
  const register = useCallback((credentials, options) => api.post('/api/register', credentials, options), [api]);
  const logout = useCallback(async () => {
    const action={};identityAction.current=action;
    const current=++generation.current;
    // Explicit sign-out discards recovery even if its network result is uncertain.
    draftVault.clear();setRecovery(null);
    try { journey.reset(); } catch { /* Sign-out remains authoritative. */ }
    try {
      await api.post('/api/logout', {});
      if(current!==generation.current)return;
      update(emptySession);
      await refresh().catch(() => {});
    } catch(failure) {
      if(failure.status===401 && current===generation.current)expire();
      throw failure;
    } finally {if(identityAction.current===action)identityAction.current=null;}
  }, [api, refresh, update, journey, expire]);


  const value = useMemo(() => ({ status, loading, error, recovery, dataRevision, api, journey, refresh, login, register, verifyEmail, logout }), [status, loading, error, recovery, dataRevision, api, journey, refresh, login, register, verifyEmail, logout]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession requires SessionProvider');
  return session;
}
