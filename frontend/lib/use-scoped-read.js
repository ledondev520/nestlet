import { useEffect, useRef, useState } from 'react';

/** Read-only snapshots never survive an identity/revision change as current data.
 * Cleanup fences each request, including A→B→A and repeated same-key retries. */
export function useScopedRead(api, key, load) {
  const [state, setState] = useState({ key: null, phase: 'idle', data: null });
  const currentKey = useRef(key), loader = useRef(load), sequence = useRef(0);
  currentKey.current = key; loader.current = load;
  useEffect(() => {
    const generation = ++sequence.current;
    if (key === null) { setState({ key, phase: 'idle', data: null }); return; }
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
    const current = () => !controller.signal.aborted && generation === sequence.current && currentKey.current === key;
    setState({ key, phase: 'loading', data: null });
    const read = loader.current;
    Promise.resolve().then(() => read(signal)).then(data => {
      if (current()) setState({ key, phase: 'ready', data });
    }).catch(() => { if (current()) setState({ key, phase: 'error', data: null }); });
    return () => controller.abort();
  }, [api, key]);
  return key === null ? { phase: 'idle', data: null } : state.key === key ? state : { phase: 'loading', data: null };
}
