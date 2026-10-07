import { useCallback, useEffect, useRef, useState } from 'react';

/** Independent read boundary for the incremental original-file API. No fallback
 * data is generated when the deployed server does not implement this endpoint. */
export function useAssetRead(api, path, validate, { delay = 0, refreshKey = 0 } = {}) {
  const [revision, setRevision] = useState(0);
  const key = `${path}\n${revision}\n${refreshKey}`;
  const currentKey = useRef(key); currentKey.current = key;
  const epoch = useRef(0);
  const [state, setState] = useState({ key: null, data: null, error: null, loading: true });
  useEffect(() => {
    const generation = ++epoch.current;
    const controller = new AbortController();
    if (!path) { setState({ key, data: null, error: null, loading: false }); return () => controller.abort(); }
    setState({ key, data: null, error: null, loading: true });
    const timer = setTimeout(async () => {
      try {
        const value = await api.get(path, { signal: controller.signal });
        if (controller.signal.aborted || epoch.current !== generation || currentKey.current !== key) return;
        if (!validate(value)) throw Object.assign(new Error('INVALID_RESPONSE'), { code: 'INVALID_RESPONSE' });
        setState({ key, data: value, error: null, loading: false });
      } catch (error) {
        if (error.name !== 'AbortError' && !controller.signal.aborted && epoch.current === generation && currentKey.current === key) setState({ key, data: null, error, loading: false });
      }
    }, delay);
    return () => { clearTimeout(timer); controller.abort(); epoch.current++; };
  }, [api, path, validate, key, delay]);
  const refresh = useCallback(() => { epoch.current++; setRevision(value => value + 1); }, []);
  return { ...(state.key === key ? state : { data: null, error: null, loading: Boolean(path) }), refresh };
}
