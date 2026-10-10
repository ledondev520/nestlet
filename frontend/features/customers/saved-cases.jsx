import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, FolderOpen, RefreshCw, Search, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from './copy';
import { useApiResource } from './hooks';
import { casesCopy } from './saved-cases-copy';
import { savedCasePage } from './saved-cases-model';

export function SavedCases({ api, lang = 'zh', onOpenCase, active = true, refreshKey = 0, onRecords, onManageCase, managementBusy = false }) {
  const t = casesCopy(lang), inputId = useId();
  const list = useApiResource(api, '/api/cases', 'cases');
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('all');
  const [page, setPage] = useState(0);
  const previous = useRef({ active, refreshKey });
  useEffect(() => {
    if ((active && !previous.current.active) || refreshKey !== previous.current.refreshKey) list.refresh();
    previous.current = { active, refreshKey };
  }, [active, refreshKey, list.refresh]);
  useEffect(() => { onRecords?.(list.data || []); }, [list.data, onRecords]);
  const view = savedCasePage(list.data || [], { query, scope, page });
  function search(value) { setQuery(value); setPage(0); }
  const emptyTitle = query.trim() ? t.noMatches : scope === 'unassigned' && view.total > 0 ? t.emptyUnassigned : t.empty;
  const emptyHint = query.trim() ? t.noMatchesHint : scope === 'unassigned' && view.total > 0 ? t.emptyUnassignedHint : t.emptyHint;
  return <Card className="paper-card gap-4" role="region" aria-label={t.title}>
    <CardHeader><div className="flex items-start justify-between gap-3"><div><h2 className="paper-title text-xl">{t.title}</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.intro}</p></div><Button type="button" variant="ghost" size="icon-sm" aria-label={t.refresh} disabled={list.loading} onClick={list.refresh}><RefreshCw aria-hidden="true" /></Button></div></CardHeader>
    <CardContent className="space-y-4">
      <div role="group" aria-label={t.scope} className="flex flex-wrap gap-2">{[['all', t.all], ['recent', t.recent], ['unassigned', t.unassigned]].map(([value, label]) => <Button type="button" key={value} variant={scope === value ? 'secondary' : 'ghost'} size="sm" aria-pressed={scope === value} onClick={() => { setScope(value); setPage(0); }}>{label}</Button>)}</div>
      <div className="space-y-2"><Label htmlFor={inputId}>{t.search}</Label><div className="relative"><Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" aria-hidden="true" /><Input id={inputId} type="search" autoComplete="off" maxLength={120} value={query} placeholder={t.placeholder} className="pl-9" aria-describedby={`${inputId}-hint`} onChange={event => search(event.target.value)} /></div><p id={`${inputId}-hint`} className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{scope === 'recent' ? t.recentHint : t.searchHint}</p></div>
      {query && <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => search('')}><X className="size-3" aria-hidden="true" />{t.clear}</Button>}
      {list.loading && <div role="status" className="space-y-3 py-3"><p className="text-sm text-muted-foreground">{t.loading}</p><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></div>}
      {list.error && <Alert variant="destructive"><AlertDescription><p className="whitespace-pre-line">{list.error.status === 401 ? t.sessionExpired : t.failed}</p><Button type="button" variant="outline" size="sm" className="mt-2 justify-self-start" onClick={list.refresh}>{t.retry}</Button></AlertDescription></Alert>}
      {list.data && <>
        <p role="status" className="whitespace-pre-line text-xs text-muted-foreground">{t.count(view.records.length, view.filteredTotal, view.total)}</p>
        {view.records.length === 0 ? <div className="py-7 text-center"><FolderOpen className="mx-auto mb-3 size-7 text-muted-foreground" aria-hidden="true" /><h3 className="paper-title text-lg">{emptyTitle}</h3><p className="mx-auto mt-2 max-w-lg whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{emptyHint}</p></div> : <ul className="divide-y divide-border" aria-label={t.title}>{view.records.map(record => <li key={record.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="w-full min-w-0 sm:w-auto sm:flex-1"><div className="flex flex-wrap items-start gap-2"><h3 className="min-w-0 break-words text-sm font-medium">{record.title || t.unnamed}</h3><Badge variant="outline">{record.clientId == null ? t.unassigned : t.linked}</Badge></div><p className="mt-1 break-all text-xs text-muted-foreground">{t.recordId}: {record.displayId||'—'}</p><p className="mt-1 text-xs text-muted-foreground">{t.updated} <time dateTime={record.updatedAt}>{formatDate(record.updatedAt, lang)}</time></p></div><Button type="button" variant="ghost" size="sm" disabled={!onOpenCase || !active} aria-label={`${t.open}: ${record.title || t.unnamed}`} onClick={() => { if (active) onOpenCase?.(record.id); }}>{t.open}<ArrowUpRight aria-hidden="true" /></Button><Button type="button" variant="outline" size="sm" disabled={!active||managementBusy||!onManageCase} aria-label={`${t.manage}: ${record.title || t.unnamed}`} onClick={event=>onManageCase?.(record.id,undefined,event.currentTarget)}>{t.manage}</Button></li>)}</ul>}
        {view.pages > 1 && <nav aria-label={t.title} className="flex flex-wrap items-center justify-between gap-3 border-t pt-3"><Button type="button" variant="outline" size="sm" disabled={view.page === 0} onClick={() => setPage(view.page - 1)}>{t.previous}</Button><span className="text-xs text-muted-foreground">{t.page(view.page + 1, view.pages)}</span><Button type="button" variant="outline" size="sm" disabled={view.page === view.pages - 1} onClick={() => setPage(view.page + 1)}>{t.next}</Button></nav>}
      </>}
    </CardContent>
  </Card>;
}
