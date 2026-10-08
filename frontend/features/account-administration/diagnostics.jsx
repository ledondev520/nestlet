import { useCallback, useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSession } from '@/lib/session';
import { useOperation } from '../auth/use-operation.js';
import { accountSessionKey, canViewDiagnostics, readDiagnostics } from './model.js';
import { operationalDiagnosticsCopy } from './copy.js';

function Diagnostics({ api, lang }) {
  const t = operationalDiagnosticsCopy(lang), id = useId(), operation = useOperation();
  const [view, setView] = useState(null), [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    const task = operation.start(); if (!task) return;
    setView(null); setBusy(true); setFailed(false);
    try {
      const result = readDiagnostics(await api.get('/api/admin/diagnostics', { signal: task.controller.signal }));
      if (operation.current(task)) setView(result);
    } catch {
      if (operation.current(task)) setFailed(true);
    } finally {
      if (operation.current(task)) setBusy(false);
      operation.finish(task);
    }
  }, [api, operation]);
  useEffect(() => { load(); return () => operation.cancel(); }, [load, operation]);
  useEffect(() => {
    const clear = () => { operation.cancel(); setView(null); setBusy(false); setFailed(true); };
    window.addEventListener('pagehide', clear);
    return () => window.removeEventListener('pagehide', clear);
  }, [operation]);
  return <Card className="paper-card" aria-labelledby={`${id}-title`}>
    <CardHeader><CardTitle id={`${id}-title`} className="paper-title text-xl">{t.title}</CardTitle><CardDescription className="whitespace-pre-line">{t.description}</CardDescription></CardHeader>
    <CardContent className="space-y-4" aria-busy={busy}>
      {busy && <p role="status" className="whitespace-pre-line text-sm text-muted-foreground">{t.loading}</p>}
      {failed && <p role="alert" className="whitespace-pre-line text-sm text-destructive">{t.error}</p>}
      {view && <>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">{t.model}</dt><dd>{view.model}</dd></div>
          <div><dt className="text-muted-foreground">{t.uptime}</dt><dd>{view.uptimeSeconds}{lang === 'zh' ? ' 秒' : ''}</dd></div>
          {['liveEnabled', 'pdfEnabled', 'workbookEnabled'].map((field, index) => <div key={field}><dt className="text-muted-foreground">{t[['live', 'pdf', 'workbook'][index]]}{lang === 'zh' && field === 'pdfEnabled' && <span className="text-xs"> · PDF</span>}</dt><dd>{view[field] ? t.enabled : t.disabled}</dd></div>)}
        </dl>
        <section aria-labelledby={`${id}-requests`} className="space-y-2 rounded-lg border p-3">
          <h3 id={`${id}-requests`} className="text-sm font-medium">{t.active}</h3>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">{Object.entries(view.activeRequests).map(([kind, count]) => <div key={kind}><dt className="text-muted-foreground">{t[kind]}{lang === 'zh' && kind === 'pdf' && <span className="text-xs"> · PDF</span>}</dt><dd>{count}</dd></div>)}</dl>
        </section>
      </>}
      <Button type="button" variant="ghost" disabled={busy} onClick={load}>{t.reload}</Button>
    </CardContent>
  </Card>;
}

export function OperationalDiagnosticsPanel({ api, status, lang = 'zh', active = true }) {
  if (!active || !canViewDiagnostics(status)) return null;
  return <Diagnostics key={accountSessionKey(status)} api={api} lang={lang} />;
}

export function OperationalDiagnostics({ lang = 'zh', active = true }) {
  const { api, status } = useSession();
  return <OperationalDiagnosticsPanel api={api} status={status} lang={lang} active={active} />;
}
