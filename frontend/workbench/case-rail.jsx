import { useEffect, useState } from 'react';
import { useSession } from '@/lib/session';

const copy = {
  zh: { cases: '事项', clients: '客户', empty: '还没有已保存的事项。', error: '暂时无法加载列表，请重试。', untitled: '未命名事项' },
  en: { cases: 'Cases', clients: 'Customers', empty: 'No saved cases yet.', error: 'The list could not load. Try again.', untitled: 'Untitled case' }
};

/** Presentational case/customer rail. Read-only GETs via the existing session
 *  API client; selection is reported upward, never written here. */
export function CaseRail({ lang = 'zh', selectedCaseId, onSelectCase }) {
  const t = copy[lang] || copy.zh;
  const { api } = useSession();
  const [state, setState] = useState({ loading: true, error: null, cases: [], clients: [] });

  useEffect(() => {
    const controller = new AbortController();
    setState(previous => ({ ...previous, loading: true, error: null }));
    Promise.all([
      api.get('/api/cases', { signal: controller.signal }),
      api.get('/api/clients', { signal: controller.signal })
    ]).then(([casesResult, clientsResult]) => {
      setState({ loading: false, error: null, cases: casesResult.cases || [], clients: clientsResult.clients || [] });
    }).catch(failure => {
      if (failure.name !== 'AbortError') setState(previous => ({ ...previous, loading: false, error: failure }));
    });
    return () => controller.abort();
  }, [api, selectedCaseId]);

  const clientName = id => state.clients.find(client => client.id === id)?.displayName || null;

  return (
    <nav className="wb-rail-section" aria-label={t.cases}>
      <p className="wb-rail-heading">{t.cases}</p>
      {state.loading && <p className="wb-rail-heading" role="status">…</p>}
      {state.error && <p className="wb-rail-heading" role="alert">{t.error}</p>}
      {!state.loading && !state.error && state.cases.length === 0 && <p className="wb-rail-heading">{t.empty}</p>}
      {state.cases.map(record => (
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
