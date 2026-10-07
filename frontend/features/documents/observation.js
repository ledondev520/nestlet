import { useLayoutEffect, useRef } from 'react';

const actions = new Set(['review.confirm', 'draft.generate', 'draft.edit', 'export.copy', 'export.download', 'export.print']);
const controls = 'input, textarea, select, button, summary, [role="checkbox"]';
const noop = Object.freeze({ finish() {} });

/** Fixed metadata only. An optional/broken observer must not change document work. */
export function beginDocumentAction(journey, event, signal) {
  let observation, finished = false;
  try { observation = journey?.beginAction(event, {signal}); } catch { return noop; }
  return { finish(detail) {
    if (finished) return;
    finished = true;
    try { observation?.finish(detail); } catch { /* Business results stay authoritative. */ }
  } };
}

export function documentFailure(name, error) {
  const validation = ['UNSAVED_ARTIFACT', 'DOCUMENT_ENGLISH_REQUIRED', 'DOCUMENT_DETAILS_REQUIRED', 'CASE_CONFLICT', 'LOCAL_CHANGED'].includes(error?.code);
  return {ok:false, cancelled:error?.name === 'AbortError',
    ...(Number.isInteger(error?.status) && error.status > 0 ? {httpStatus:error.status} : {}),
    errorCode:validation ? 'CLIENT_VALIDATION' : ({copy:'CLIPBOARD_FAILED', download:'DOWNLOAD_FAILED', print:'PRINT_FAILED'}[name] || 'UNKNOWN_CLIENT_ERROR')};
}

/** Focus owns dwell. Navigation, text changes and background refreshes never activate it. */
export function useDocumentObservation(journey, visible, identity) {
  const ref = useRef(null), ownsFocus = useRef(false), visibleRef = useRef(visible);
  visibleRef.current = visible;
  const activate = event => { try { journey?.activateStep(event); } catch { /* Optional metadata only. */ } };
  const focusedStep = target => {
    if (!visibleRef.current || document.visibilityState === 'hidden' || !ref.current?.contains(target) ||
      !target?.matches?.(controls) || target.disabled || target.closest('[hidden], [aria-hidden="true"]')) return null;
    const event = target.closest('[data-journey-action]')?.getAttribute('data-journey-action');
    return actions.has(event) ? event : null;
  };
  const focus = target => {
    const event = focusedStep(target);
    if (event || ownsFocus.current) activate(event);
    ownsFocus.current = Boolean(event);
  };
  useLayoutEffect(() => () => {
    // An old kept-mounted page must not clear a newer page's already-focused step.
    const current = document.activeElement;
    if (ownsFocus.current && (!current || current === document.body || ref.current?.contains(current))) activate(null);
    ownsFocus.current = false;
  }, [journey, visible, identity]);
  return {ref,
    onFocusCapture:event => focus(event.target),
    onBlurCapture:event => {
      if (visibleRef.current) focus(event.relatedTarget);
      else ownsFocus.current = false;
    },
    begin:(event, signal) => visibleRef.current && document.visibilityState !== 'hidden' && actions.has(event)
      ? beginDocumentAction(journey, event, signal) : noop};
}
