import { useEffect, useMemo, useRef } from 'react';

/** Prevent duplicate submissions and ignore/abort results after the feature unmounts. */
export function useOperation() {
  const mounted = useRef(true);
  const active = useRef(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; active.current?.controller.abort(); active.current = null; };
  }, []);
  return useMemo(() => ({
    start() { if (active.current) return null; const operation = { controller:new AbortController() }; active.current = operation; return operation; },
    current(operation) { return mounted.current && active.current === operation; },
    cancel() { active.current?.controller.abort(); active.current = null; },
    finish(operation) { if (active.current === operation) active.current = null; },
  }), []);
}
