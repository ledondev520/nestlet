import { useLayoutEffect, useRef } from 'react';

/** Component-local reading state: never persisted, shared across accounts or used to fetch history. */
export function useThreadPosition({ scope, active, loading, messages }) {
  const element = useRef(null);
  const reading = useRef({ scope: null, initialized: false, following: true, top: 0 });
  useLayoutEffect(() => {
    if (reading.current.scope !== scope) reading.current = { scope, initialized: false, following: true, top: 0 };
    const node = element.current, state = reading.current;
    if (!node || !active || loading || !scope) return;
    const place = () => {
      if (state !== reading.current) return;
      node.scrollTop = state.following ? node.scrollHeight : state.top;
      state.top = node.scrollTop;
      state.initialized = true;
    };
    place();
    // Images/markdown can settle after the message commit. Only follow when the
    // reader was already at the end; an explicit upward scroll always wins.
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(place) : null;
    if (node.firstElementChild) observer?.observe(node.firstElementChild);
    return () => observer?.disconnect();
  }, [scope, active, loading, messages]);
  const onScroll = () => {
    const node = element.current, state = reading.current;
    if (!node || !active || loading || !state.initialized || state.scope !== scope) return;
    state.top = node.scrollTop;
    state.following = node.scrollHeight - node.clientHeight - node.scrollTop <= 24;
  };
  return { ref: element, onScroll };
}
