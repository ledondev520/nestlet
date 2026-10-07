import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Owns one read, including debounce and abort. Epoch checks also protect against
 * transports that deliver a result after abort. A new key never renders old data. */
export function useApiResource(api, path, field, { delay = 0 } = {}) {
  const [revision, setRevision] = useState(0);
  const key = `${path}\n${revision}`;
  const [state, setState] = useState({ key: null, data: null, loading: true, error: null });
  const request = useRef({ epoch: 0, controller: null });
  const currentKey = useRef(key);
  currentKey.current = key;
  useEffect(() => {
    const epoch = ++request.current.epoch;
    const controller = new AbortController();
    request.current.controller = controller;
    setState({ key, data: null, loading: true, error: null });
    const timer = setTimeout(async () => {
      try {
        const result = await api.get(path, { signal: controller.signal });
        if (request.current.epoch === epoch && !controller.signal.aborted && currentKey.current === key) {
          const data = result?.[field];
          const valid = field === 'client'
            ? data && typeof data.id === 'string' && typeof data.displayName === 'string' && Number.isSafeInteger(data.version)
            : Array.isArray(data) && data.every(record => record && typeof record.id === 'string' && (field !== 'clients' || typeof record.displayName === 'string') && (field !== 'artifacts' || typeof record.caseId === 'string'));
          if (!valid) throw Object.assign(new Error('INVALID_RESPONSE'), { code: 'INVALID_RESPONSE' });
          setState({ key, data: result[field], loading: false, error: null });
        }
      } catch (error) {
        if (error.name !== 'AbortError' && request.current.epoch === epoch && !controller.signal.aborted && currentKey.current === key) {
          setState({ key, data: null, loading: false, error });
        }
      }
    }, delay);
    return () => { clearTimeout(timer); controller.abort(); request.current.epoch++; };
  }, [api, path, field, delay, key]);
  const refresh = useCallback(() => {
    request.current.controller?.abort();
    request.current.epoch++;
    setRevision(value => value + 1);
  }, []);
  const replace = useCallback(data => {
    request.current.controller?.abort();
    request.current.epoch++;
    setState({ key: currentKey.current, data, loading: false, error: null });
  }, []);
  return { ...(state.key === key ? state : { data: null, loading: true, error: null }), refresh, replace };
}

/** Duplicate-click lock is synchronous. Unmounting (selection/account/navigation)
 * suppresses all completion callbacks, including late responses from old writes. */
export function useScopedMutation() {
  const active = useRef(false);
  const lock = useRef(false);
  const controller = useRef(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  useLayoutEffect(() => {
    active.current = true;
    return () => { active.current = false; controller.current?.abort(); };
  }, []);
  const run = async (action, onSuccess, onFailure) => {
    if (!active.current || lock.current) return;
    lock.current = true;
    const current = new AbortController();
    controller.current = current;
    setPending(true); setError(null);
    try {
      const result = await action(current.signal);
      if (active.current && !current.signal.aborted) onSuccess?.(result);
    } catch (failure) {
      if (active.current && !current.signal.aborted && failure.name !== 'AbortError') {
        setError(failure); onFailure?.(failure);
      }
    } finally {
      lock.current = false;
      if (active.current && !current.signal.aborted) setPending(false);
    }
  };
  return { run, pending, error, clearError: () => setError(null) };
}

/** In-page editors return keyboard focus to their trigger after save/cancel. */
export function useReturnFocus(open, trigger) {
  const wasOpen = useRef(false);
  useLayoutEffect(() => {
    if (wasOpen.current && !open) trigger.current?.focus();
    wasOpen.current = open;
  }, [open, trigger]);
}
