import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, Check, FileText, FolderOpen, Pencil, Plus, RefreshCw, Search, ShieldCheck, UserRound, Users, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { clientSearchPath, emptyCasePayload, errorCopy, formatDate, localeCopy, validLabel } from './copy';
import { useApiResource, useReturnFocus, useScopedMutation } from './hooks';
import { OriginalMaterials } from './original-materials';
import { SavedCases } from './saved-cases';
import { casesCopy } from './saved-cases-copy';

function ErrorNotice({ error, t, onRetry, write = false }) {
  if (!error) return null;
  return <Alert variant="destructive" className="break-words">
    <AlertDescription><p>{write && ['NETWORK_ERROR', 'INVALID_RESPONSE'].includes(error.code) ? t.saveUncertain : errorCopy(error, t)}</p>{onRetry && <Button type="button" size="sm" variant="outline" className="mt-2 justify-self-start" onClick={onRetry}>{t.retry}</Button>}</AlertDescription>
  </Alert>;
}
function Loading({ label }) {
  return <div role="status" aria-label={label} className="space-y-3 py-4"><p className="text-sm text-muted-foreground">{label}</p><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></div>;
}
function Empty({ icon: Icon, title, description, children }) {
  return <div className="flex flex-col items-center px-4 py-10 text-center"><Icon className="mb-4 size-7 text-muted-foreground" strokeWidth={1.4} aria-hidden="true" /><h3 className="paper-title text-lg">{title}</h3><p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>{children}</div>;
}
function RecordDate({ value, label, lang }) {
  return <span>{label} <time dateTime={value || undefined}>{formatDate(value, lang)}</time></span>;
}

function CreateCustomer({ api, t, intent, onCreated, onCancel }) {
  const id = useId();
  const [name, setName] = useState('');
  const [validation, setValidation] = useState(false);
  const mutation = useScopedMutation();
  function submit(event) {
    event.preventDefault();
    if (!validLabel(name)) { setValidation(true); return; }
    setValidation(false);
    const startedIntent = intent.current;
    mutation.run(signal => api.post('/api/clients', { displayName: name.trim() }, { signal }), result => onCreated(result.client, startedIntent));
  }
  return <form onSubmit={submit} className="space-y-3 rounded-lg border border-border bg-background p-4" aria-label={t.addCustomer}>
    <div className="space-y-2"><Label htmlFor={id}>{t.customerName}</Label><Input id={id} autoFocus value={name} maxLength={120} autoComplete="off" disabled={mutation.pending} onChange={event => { setName(event.target.value); setValidation(false); }} aria-describedby={`${id}-hint`} aria-invalid={!!validation} placeholder={t.namePlaceholder} /><p id={`${id}-hint`} className="text-xs leading-relaxed text-muted-foreground">{t.customerNameHint}</p></div>
    {validation && <p role="alert" className="text-sm text-destructive">{t.invalidName}</p>}
    <ErrorNotice error={mutation.error} t={t} write />
    <div className="flex flex-wrap gap-2"><Button type="submit" size="sm" disabled={mutation.pending}>{mutation.pending ? t.creating : t.createCustomer}</Button><Button type="button" size="sm" variant="ghost" disabled={mutation.pending} onClick={onCancel}>{t.cancel}</Button></div>
  </form>;
}

function RenameCustomer({ api, client, t, onSaved, onLatest, onCancel }) {
  const id = useId();
  const [name, setName] = useState(client.displayName);
  const [version, setVersion] = useState(client.version);
  const [latestName, setLatestName] = useState(null);
  const [conflicted, setConflicted] = useState(false);
  const [validation, setValidation] = useState(false);
  const mutation = useScopedMutation();
  const reload = useScopedMutation();
  function submit(event) {
    event.preventDefault();
    if (conflicted || reload.pending) return;
    if (!validLabel(name)) { setValidation(true); return; }
    setValidation(false);
    mutation.run(signal => api.put(`/api/clients/${client.id}`, { displayName: name.trim(), expectedVersion: version }, { signal }), result => onSaved(result.client), error => {
      if (error.code === 'CLIENT_CONFLICT') setConflicted(true);
    });
  }
  function loadLatest() {
    reload.run(signal => api.get(`/api/clients/${client.id}`, { signal }), result => {
      setVersion(result.client.version); setLatestName(result.client.displayName); setConflicted(false); mutation.clearError(); onLatest(result.client);
    });
  }
  return <form onSubmit={submit} aria-label={t.rename} className="space-y-3 rounded-lg border bg-background p-4">
    <div className="space-y-2"><Label htmlFor={id}>{t.customerName}</Label><Input id={id} autoFocus autoComplete="off" maxLength={120} value={name} disabled={mutation.pending} onChange={event => { setName(event.target.value); setValidation(false); }} aria-invalid={!!validation} /></div>
    {validation && <p role="alert" className="text-sm text-destructive">{t.invalidName}</p>}
    {conflicted ? <Alert variant="destructive"><AlertDescription><p>{t.conflict}</p><Button type="button" variant="outline" size="sm" className="mt-2 justify-self-start" disabled={reload.pending} onClick={loadLatest}>{reload.pending ? t.loading : t.reloadLatest}</Button></AlertDescription></Alert> : <ErrorNotice error={mutation.error} t={t} write />}
    {latestName !== null && <p role="status" className="break-words text-sm leading-relaxed text-muted-foreground">{t.latestName(latestName)}<br />{t.latestLoaded}</p>}
    <ErrorNotice error={reload.error} t={t} />
    <div className="flex flex-wrap gap-2"><Button type="submit" size="sm" disabled={mutation.pending || reload.pending || conflicted}>{mutation.pending ? t.saving : t.save}</Button><Button type="button" variant="ghost" size="sm" disabled={mutation.pending || reload.pending} onClick={onCancel}>{t.cancel}</Button></div>
  </form>;
}

function CreateCase({ api, clientId, t, onCreated, onCancel }) {
  const id = useId();
  const [title, setTitle] = useState('');
  const [validation, setValidation] = useState(false);
  const mutation = useScopedMutation();
  function submit(event) {
    event.preventDefault();
    if (!validLabel(title)) { setValidation(true); return; }
    setValidation(false);
    mutation.run(signal => api.post('/api/cases', emptyCasePayload(title, clientId), { signal }), result => onCreated(result.case));
  }
  return <form onSubmit={submit} aria-label={t.newCase} className="space-y-3 rounded-lg border bg-background p-4">
    <div className="space-y-2"><Label htmlFor={id}>{t.caseTitle}</Label><Input id={id} autoFocus value={title} maxLength={120} autoComplete="off" disabled={mutation.pending} aria-invalid={!!validation} aria-describedby={`${id}-hint`} placeholder={t.caseTitlePlaceholder} onChange={event => { setTitle(event.target.value); setValidation(false); }} /><p id={`${id}-hint`} className="text-xs leading-relaxed text-muted-foreground">{t.caseHint}</p></div>
    {validation && <p role="alert" className="text-sm text-destructive">{t.invalidTitle}</p>}
    <ErrorNotice error={mutation.error} t={t} write />
    <div className="flex flex-wrap gap-2"><Button type="submit" size="sm" disabled={mutation.pending}>{mutation.pending ? t.creating : t.createCase}</Button><Button type="button" size="sm" variant="ghost" disabled={mutation.pending} onClick={onCancel}>{t.cancel}</Button></div>
  </form>;
}

function CustomerDetail({ api, customerId, lang, onOpenCase, onRenamed, onCreatedCase, active }) {
  const t = localeCopy(lang);
  const activeRef = useRef(active); activeRef.current = active;
  const wasActive = useRef(active);
  const client = useApiResource(api, `/api/clients/${customerId}`, 'client');
  const cases = useApiResource(api, `/api/clients/${customerId}/cases`, 'cases');
  const artifacts = useApiResource(api, `/api/clients/${customerId}/artifacts`, 'artifacts');
  const [renaming, setRenaming] = useState(false);
  const [creatingCase, setCreatingCase] = useState(false);
  const renameTrigger = useRef(null), caseTrigger = useRef(null);
  useReturnFocus(renaming, renameTrigger); useReturnFocus(creatingCase, caseTrigger);
  const [notice, setNotice] = useState('');
  const [assetRevision, setAssetRevision] = useState(0);
  useEffect(() => {
    if (active && !wasActive.current) {
      if (!renaming && !creatingCase) client.refresh();
      cases.refresh(); artifacts.refresh(); setAssetRevision(value => value + 1);
    }
    wasActive.current = active;
  }, [active, renaming, creatingCase, client.refresh, cases.refresh, artifacts.refresh]);
  const caseNames = new Map((cases.data || []).map(record => [record.id, record.title]));
  function refresh() { client.refresh(); cases.refresh(); artifacts.refresh(); setAssetRevision(value => value + 1); setNotice(''); }
  function renamed(record) { client.replace(record); setRenaming(false); setNotice('renamed'); onRenamed(record); }
  function created(record) {
    cases.refresh(); onCreatedCase?.(record);
    setCreatingCase(false); setNotice('caseCreated'); if (activeRef.current) onOpenCase?.(record.id);
  }
  return <section aria-label={t.customerRecord} className="min-w-0 space-y-5">
    <Card className="paper-card gap-4">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><p className="mb-2 text-xs tracking-widest text-muted-foreground">{t.customerRecord}</p>{client.data && <h2 className="paper-title break-words text-3xl">{client.data.displayName}</h2>}</div><Button type="button" variant="ghost" size="icon-sm" aria-label={t.refresh} onClick={refresh} disabled={renaming || creatingCase || client.loading || cases.loading || artifacts.loading}><RefreshCw className={client.loading ? 'animate-spin' : ''} aria-hidden="true" /></Button></div>
        {client.data && <p className="break-all text-xs text-muted-foreground">{t.recordId}: {client.data.id}<span className="mt-1 block"><RecordDate value={client.data.updatedAt} label={t.updated} lang={lang} /></span></p>}
      </CardHeader>
      <CardContent className="space-y-4">
        {client.loading && <Loading label={t.customerLoading} />}
        <ErrorNotice error={client.error} t={t} onRetry={client.refresh} />
        {client.data && <>
          <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{cases.data ? t.caseCount(cases.data.length) : '—'}</Badge><Badge variant="secondary">{artifacts.data ? t.artifactCount(artifacts.data.length) : '—'}</Badge><Button type="button" size="sm" variant="ghost" ref={renameTrigger} className="ml-auto" disabled={renaming || creatingCase} onClick={() => { setRenaming(true); setNotice(''); }}><Pencil aria-hidden="true" />{t.rename}</Button></div>
          {renaming && <RenameCustomer api={api} client={client.data} t={t} onSaved={renamed} onLatest={record => { client.replace(record); onRenamed(record); }} onCancel={() => setRenaming(false)} />}</>}
        {notice && <p role="status" className="flex items-start gap-2 text-sm"><Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{t[notice]}</p>}
      </CardContent>
    </Card>

    <Card className="paper-card gap-4">
      <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="paper-title text-xl">{t.cases}</h2><Button type="button" size="sm" variant="outline" ref={caseTrigger} disabled={!client.data || creatingCase || renaming} onClick={() => { setCreatingCase(true); setNotice(''); }}><Plus aria-hidden="true" />{t.newCase}</Button></div></CardHeader>
      <CardContent className="space-y-4">
        {creatingCase && <CreateCase api={api} clientId={customerId} t={t} onCreated={created} onCancel={() => setCreatingCase(false)} />}
        {cases.loading && <Loading label={t.loading} />}
        <ErrorNotice error={cases.error} t={t} onRetry={cases.refresh} />
        {cases.data && (cases.data.length === 0 ? <Empty icon={FolderOpen} title={t.casesEmpty} description={t.casesEmptyHint} /> : <ul className="divide-y divide-border">{cases.data.map(record => <li key={record.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
          <div className="min-w-0 flex-1"><h3 className="break-words font-medium">{record.title || t.unnamedCase}</h3><p className="mt-1 text-xs text-muted-foreground"><RecordDate value={record.updatedAt} label={t.updated} lang={lang} /></p><p className="mt-1 break-all text-xs text-muted-foreground">{t.recordId}: {record.id.slice(-8)}</p></div>
          <Button type="button" variant="ghost" size="sm" disabled={!onOpenCase} aria-label={`${t.openCase}: ${record.title || t.unnamedCase}`} onClick={() => onOpenCase?.(record.id)}>{t.openCase}<ArrowUpRight aria-hidden="true" /></Button>
        </li>)}</ul>)}
      </CardContent>
    </Card>

    <OriginalMaterials api={api} clientId={customerId} cases={cases.data || []} lang={lang} refreshKey={assetRevision} />

    <Card className="paper-card gap-4">
      <CardHeader><h2 className="paper-title text-xl">{t.documents}</h2><p className="text-xs leading-relaxed text-muted-foreground">{t.artifactHint}</p></CardHeader>
      <CardContent>
        {artifacts.loading && <Loading label={t.loading} />}
        <ErrorNotice error={artifacts.error} t={t} onRetry={artifacts.refresh} />
        {artifacts.data && (artifacts.data.length === 0 ? <Empty icon={FileText} title={t.artifactsEmpty} description={t.artifactsEmptyHint} /> : <ul className="divide-y divide-border">{artifacts.data.map(artifact => <li key={artifact.id} className="space-y-2 py-4 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="min-w-0 flex-1 break-words font-medium">{artifact.title || t.kinds[artifact.kind] || t.unknownKind}</h3><Badge variant={artifact.status === 'final' ? 'secondary' : 'outline'}>{artifact.status === 'final' ? t.final : t.draft}</Badge></div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>{t.kinds[artifact.kind] || t.unknownKind}</span><span>·</span><span>{t.version(artifact.version)}</span>{artifact.isStale && <Badge variant="outline" className="text-destructive">{t.stale}</Badge>}</div>
          <p className="break-words text-xs text-muted-foreground">{t.belongingCase}: {caseNames.get(artifact.caseId) || artifact.caseId}</p>
          <p className="text-xs text-muted-foreground"><RecordDate value={artifact.createdAt} label={t.created} lang={lang} /> · {t.sourceCaseVersion(artifact.sourceCaseVersion)}</p>
          {artifact.isStale && <p className="text-xs leading-relaxed text-destructive">{t.staleHint}</p>}
          <Button type="button" size="sm" variant="link" className="h-auto p-0 text-xs" disabled={!onOpenCase} aria-label={`${t.openArtifactCase}: ${artifact.title || t.kinds[artifact.kind] || t.unknownKind}`} onClick={() => onOpenCase?.(artifact.caseId)}>{t.openArtifactCase}<ArrowUpRight className="size-3" aria-hidden="true" /></Button>
        </li>)}</ul>)}
      </CardContent>
    </Card>
  </section>;
}

export function CustomerWorkspace({ api, lang = 'zh', onOpenCase, active = true }) {
  const t = localeCopy(lang);
  const searchId = useId();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [caseRevision, setCaseRevision] = useState(0);
  const [allCases, setAllCases] = useState([]);
  const [originalsOpen, setOriginalsOpen] = useState(false);
  const [originalsRevision, setOriginalsRevision] = useState(0);
  const archiveCopy = casesCopy(lang);
  const [creating, setCreating] = useState(false);
  const createTrigger = useRef(null);
  useReturnFocus(creating, createTrigger);
  const [notice, setNotice] = useState('');
  const intent = useRef(0);
  const directory = useApiResource(api, clientSearchPath(query), 'clients', { delay: query ? 180 : 0 });
  const wasActive = useRef(active);
  useEffect(() => { if (active && !wasActive.current) { directory.refresh(); setOriginalsRevision(value => value + 1); } wasActive.current = active; }, [active, directory.refresh]);
  function search(value) { intent.current++; setQuery(value); setNotice(''); }
  function select(id) { intent.current++; setSelectedId(id); setNotice(''); }
  function created(record, startedIntent) {
    setCreating(false); setNotice({ displayName: record.displayName }); directory.refresh();
    if (intent.current === startedIntent) { setQuery(''); setSelectedId(record.id); intent.current++; }
  }
  return <div className="space-y-7">
    <header><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-[11px] font-medium tracking-[.16em] text-muted-foreground">{t.eyebrow}</p><span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="size-3.5" aria-hidden="true" />{t.private}</span></div><h1 className="paper-title text-3xl leading-tight sm:text-4xl">{t.title}</h1><p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">{t.intro}</p></header>
    <SavedCases api={api} lang={lang} onOpenCase={onOpenCase} active={active} refreshKey={caseRevision} onRecords={setAllCases} />
    <details className="rounded-xl border bg-card p-5" onToggle={event => setOriginalsOpen(event.currentTarget.open)}><summary className="cursor-pointer rounded-sm text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">{archiveCopy.allOriginals}</summary><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{archiveCopy.originalsHint}</p>{originalsOpen && <div className="mt-4"><OriginalMaterials api={api} cases={allCases} lang={lang} refreshKey={originalsRevision} /></div>}</details>
    <div className="grid items-start gap-6 md:grid-cols-[260px_minmax(0,1fr)]">
      <Card className="paper-card min-w-0 gap-4">
        <CardHeader><div className="flex items-center justify-between gap-2"><h2 className="paper-title text-xl">{t.directory}</h2><Button type="button" size="icon-sm" variant="ghost" aria-label={t.refresh} disabled={directory.loading} onClick={directory.refresh}><RefreshCw aria-hidden="true" /></Button></div></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label htmlFor={searchId}>{t.search}</Label><div className="relative"><Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" aria-hidden="true" /><Input id={searchId} type="search" maxLength={120} autoComplete="off" value={query} onChange={event => search(event.target.value)} className="pl-9" placeholder={t.searchPlaceholder} /></div>{query && <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => search('')}><X className="size-3" aria-hidden="true" />{t.clearSearch}</Button>}</div>
          <Button type="button" variant="outline" className="w-full" ref={createTrigger} disabled={creating} onClick={() => { setCreating(true); setNotice(''); }}><Plus aria-hidden="true" />{t.addCustomer}</Button>
          {creating && <CreateCustomer api={api} t={t} intent={intent} onCreated={created} onCancel={() => setCreating(false)} />}
          {notice && <p role="status" className="break-words text-xs leading-relaxed">{t.clientCreated(notice.displayName)}</p>}
          {directory.loading && <Loading label={t.loadingCustomers} />}
          <ErrorNotice error={directory.error} t={t} onRetry={directory.refresh} />
          {directory.data && <><p className="text-xs text-muted-foreground" role="status">{t.results(directory.data.length)}</p>{directory.data.length === 0 ? <Empty icon={Users} title={query.trim() ? t.noMatches : t.customersEmpty} description={query.trim() ? t.noMatchesHint : t.customersEmptyHint} /> : <ul className="space-y-1" aria-label={t.directory}>{directory.data.map(client => <li key={client.id}><Button type="button" variant="ghost" aria-pressed={selectedId === client.id} onClick={() => select(client.id)} className={cn('h-auto min-h-16 w-full items-start justify-start gap-3 px-3 py-3 text-left whitespace-normal', selectedId === client.id && 'border-l-2 border-primary bg-secondary')}><UserRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="min-w-0"><span className="block break-words text-sm font-medium">{client.displayName}</span><span className="mt-1 block break-all text-[10px] font-normal text-muted-foreground">{t.recordId}: {client.id.slice(-8)}</span><span className="mt-1 block text-[10px] font-normal text-muted-foreground">{formatDate(client.updatedAt, lang)}</span></span></Button></li>)}</ul>}</>}
        </CardContent>
      </Card>
      {selectedId ? <CustomerDetail key={selectedId} api={api} customerId={selectedId} lang={lang} onOpenCase={onOpenCase} onRenamed={() => directory.refresh()} onCreatedCase={() => setCaseRevision(value => value + 1)} active={active} /> : <Card className="paper-card min-h-80 justify-center"><CardContent><Empty icon={FolderOpen} title={t.selectedEmpty} description={t.selectedEmptyHint} /></CardContent></Card>}
    </div>
  </div>;
}
