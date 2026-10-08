import { useEffect, useState } from 'react';
import { useSession } from '@/lib/session';

const copy = {
  zh: { cases: '事项', empty: '还没有已保存的事项。', error: '暂时无法加载列表，请重试。', loading: '正在载入…', untitled: '未命名事项' },
  en: { cases: 'Cases', empty: 'No saved cases yet.', error: 'The list could not load. Try again.', loading: 'Loading…', untitled: 'Untitled case' }
};

/** Presentational case/customer rail. Read-only GETs via the existing session
 *  API client; selection is reported upward, never written here. List data is
 *  scoped to the exact user identity: an account switch clears the old list
 *  immediately and late responses for a stale identity are discarded. */
export function CaseRail({ lang = 'zh', selectedCaseId, onSelectCase }) {
  const t = copy[lang] || copy.zh;
  const { api, status } = useSession();
  const [state, setState] = useState({ key: null, phase: 'idle', cases: [], clients: [] });

  useEffect(() => {
    const key = status.userId;
    const controller = new AbortController();
    setState({ key, phase: 'loading', cases: [], clients: [] });
    Promise.all([
      api.get('/api/cases', { signal: controller.signal }),
      api.get('/api/clients', { signal: controller.signal })
    ]).then(([casesResult, clientsResult]) => {
      setState(previous => previous.key === key
        ? { key, phase: 'ready', cases: casesResult.cases || [], clients: clientsResult.clients || [] }
        : previous);
    }).catch(failure => {
      if (failure.name === 'AbortError') return;
      setState(previous => previous.key === key ? { key, phase: 'error', cases: [], clients: [] } : previous);
    });
    return () => controller.abort();
  }, [api, status.userId, selectedCaseId]);

  const clientName = id => state.clients.find(client => client.id === id)?.displayName || null;

  return (
    <nav className="wb-rail-section" aria-label={t.cases}>
      <p className="wb-rail-heading">{t.cases}</p>
      {state.phase === 'loading' && <p className="wb-rail-heading" role="status">{t.loading}</p>}
      {state.phase === 'error' && <p className="wb-rail-heading" role="alert">{t.error}</p>}
      {state.phase === 'ready' && state.cases.length === 0 && <p className="wb-rail-heading">{t.empty}</p>}
      {state.phase === 'ready' && state.cases.map(record => (
        <button
          key={record.id}
          type="button"
          className="wb-rail-item"
          aria-current={record.id === selectedCaseId ? 'true' : undefined}
          onClick={() => onSelectCase(record.id, record.title || '')}
        >
          <span className="wb-rail-item-label">{record.title || t.untitled}</span>
          {record.clientId && clientName(record.clientId) && <span className="wb-case-meta">{clientName(record.clientId)}</span>}
        </button>
      ))}
    </nav>
  );
}
