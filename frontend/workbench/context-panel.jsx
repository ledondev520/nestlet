import { useEffect, useState } from 'react';
import { useSession } from '@/lib/session';
import { AgencyGuidance } from '@/components/agency-guidance';

const copy = {
  zh: { readiness: '文书准备度', artifacts: '文书版本', guidance: '官方资料参考', empty: '选择一个事项后，这里显示它的事实、材料和文书状态。', none: '还没有已保存的文书版本。', error: '暂时无法加载上下文，请重试。', final: '完成版', draft: '草稿', loadCase: '未选择事项' },
  en: { readiness: 'Document readiness', artifacts: 'Document versions', guidance: 'Official source references', empty: 'Select a case to see its facts, materials and document status here.', none: 'No saved document versions yet.', error: 'The context could not load. Try again.', final: 'Final', draft: 'Draft', loadCase: 'No case selected' }
};

/** Read-only context panel: current case readiness, artifact versions and the
 *  collapsed official-reference panel. No writes; status is reported, not edited. */
export function ContextPanel({ lang = 'zh', caseId, guidanceAgency, onAgencyChange }) {
  const t = copy[lang] || copy.zh;
  const { api } = useSession();
  const [state, setState] = useState({ loading: false, error: null, readiness: null, artifacts: [] });

  useEffect(() => {
    if (!caseId) { setState({ loading: false, error: null, readiness: null, artifacts: [] }); return; }
    const controller = new AbortController();
    setState(previous => ({ ...previous, loading: true, error: null }));
    Promise.all([
      api.get(`/api/cases/${encodeURIComponent(caseId)}/readiness?locale=${lang === 'en' ? 'en' : 'zh'}`, { signal: controller.signal }),
      api.get(`/api/cases/${encodeURIComponent(caseId)}/artifacts`, { signal: controller.signal })
    ]).then(([readiness, artifacts]) => {
      setState({ loading: false, error: null, readiness, artifacts: artifacts.artifacts || [] });
    }).catch(failure => {
      if (failure.name !== 'AbortError') setState(previous => ({ ...previous, loading: false, error: failure }));
    });
    return () => controller.abort();
  }, [api, caseId]);

  return (
    <div className="wb-context-inner">
      {!caseId && <p className="wb-case-meta">{t.empty}</p>}
      {caseId && state.error && <p role="alert" className="wb-case-meta">{t.error}</p>}
      {caseId && state.readiness && (
        <section className="wb-context-section" aria-label={t.readiness}>
          <p className="wb-context-heading">{t.readiness}</p>
          <p className="wb-case-meta">{state.readiness.summary || ''}</p>
          {Array.isArray(state.readiness.missing) && state.readiness.missing.length > 0 && (
            <ul className="wb-case-meta">
              {state.readiness.missing.map(item => <li key={typeof item === 'string' ? item : item.key}>{typeof item === 'string' ? item : item.label || item.key}</li>)}
            </ul>
          )}
        </section>
      )}
      {caseId && (
        <section className="wb-context-section" aria-label={t.artifacts}>
          <p className="wb-context-heading">{t.artifacts}</p>
          {state.artifacts.length === 0 && !state.loading && <p className="wb-case-meta">{t.none}</p>}
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
