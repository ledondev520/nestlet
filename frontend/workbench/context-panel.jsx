import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useSession } from '@/lib/session';
import { AgencyGuidance } from '@/components/agency-guidance';

const copy = {
  zh: { readiness: '文书准备度', artifacts: '文书版本', guidance: '官方资料参考', empty: '选择一个事项后，这里显示它的事实、材料和文书状态。', none: '还没有已保存的文书版本。', error: '暂时无法加载上下文，请重试。', loading: '正在载入…', refresh: '刷新上下文', final: '完成版', draft: '草稿' },
  en: { readiness: 'Document readiness', artifacts: 'Document versions', guidance: 'Official source references', empty: 'Select a case to see its facts, materials and document status here.', none: 'No saved document versions yet.', error: 'The context could not load. Try again.', loading: 'Loading…', refresh: 'Refresh context', final: 'Final', draft: 'Draft' }
};

const emptyData = { readiness: null, artifacts: null };

/** Read-only context panel: current case readiness, artifact versions and the
 *  collapsed official-reference panel. No writes. Data is scoped to the exact
 *  (userId, caseId, lang) request: switching case or language clears the old
 *  case's data immediately, and late responses for a stale identity are
 *  discarded so old facts are never labeled as current. */
export function ContextPanel({ lang = 'zh', caseId, guidanceAgency, onAgencyChange }) {
  const t = copy[lang] || copy.zh;
  const { api, status } = useSession();
  const [state, setState] = useState({ key: null, phase: 'idle', ...emptyData });
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const key = caseId ? `${status.userId}:${caseId}:${lang}:${refreshTick}` : null;
    if (!key) { setState({ key: null, phase: 'idle', ...emptyData }); return; }
    const controller = new AbortController();
    // Clear first: nothing from a previous case/language may render as current.
    setState({ key, phase: 'loading', ...emptyData });
    Promise.all([
      api.get(`/api/cases/${encodeURIComponent(caseId)}/readiness?locale=${lang === 'en' ? 'en' : 'zh'}`, { signal: controller.signal }),
      api.get(`/api/cases/${encodeURIComponent(caseId)}/artifacts`, { signal: controller.signal })
    ]).then(([readiness, artifacts]) => {
      setState(previous => previous.key === key
        ? { key, phase: 'ready', readiness, artifacts: artifacts.artifacts || [] }
        : previous);
    }).catch(failure => {
      if (failure.name === 'AbortError') return;
      setState(previous => previous.key === key ? { key, phase: 'error', ...emptyData } : previous);
    });
    return () => controller.abort();
  }, [api, status.userId, caseId, lang, refreshTick]);

  return (
    <div className="wb-context-inner">
      {caseId && (
        <button type="button" className="wb-tab" style={{ alignSelf: 'flex-end', display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setRefreshTick(tick => tick + 1)} aria-label={t.refresh}>
          <RefreshCw aria-hidden="true" size={14} />{t.refresh}
        </button>
      )}
      {!caseId && <p className="wb-case-meta">{t.empty}</p>}
      {caseId && state.phase === 'loading' && <p role="status" className="wb-case-meta">{t.loading}</p>}
      {caseId && state.phase === 'error' && <p role="alert" className="wb-case-meta">{t.error}</p>}
      {caseId && state.phase === 'ready' && state.readiness && (
        <section className="wb-context-section" aria-label={t.readiness}>
          <p className="wb-context-heading">{t.readiness}</p>
          {state.readiness.summary && <p className="wb-case-meta">{state.readiness.summary}</p>}
          {Array.isArray(state.readiness.missing) && state.readiness.missing.length > 0 && (
            <ul className="wb-case-meta">
              {state.readiness.missing.map(item => <li key={typeof item === 'string' ? item : item.key}>{typeof item === 'string' ? item : item.label || item.key}</li>)}
            </ul>
          )}
        </section>
      )}
      {caseId && state.phase === 'ready' && (
        <section className="wb-context-section" aria-label={t.artifacts}>
          <p className="wb-context-heading">{t.artifacts}</p>
          {state.artifacts.length === 0 && <p className="wb-case-meta">{t.none}</p>}
          {state.artifacts.map(artifact => (
            <p key={artifact.id} className="wb-case-meta">
              {artifact.title || artifact.id} · {artifact.status === 'final' ? t.final : t.draft} · v{artifact.version}
            </p>
          ))}
        </section>
      )}
      <section className="wb-context-section" aria-label={t.guidance}>
        <AgencyGuidance lang={lang} agency={guidanceAgency} onAgencyChange={onAgencyChange} />
      </section>
    </div>
  );
}
