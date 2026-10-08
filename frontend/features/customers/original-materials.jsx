import { useCallback, useId, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpRight, File, FileImage, FileText, FolderSearch, RefreshCw, Search, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from './copy';
import { useReturnFocus } from './hooks';
import { originalCopy } from './assets-copy';
import { ASSET_PAGE_SIZE, ASSET_SEARCH_LENGTH, assetPath, assetSearchPath, assetsError, sizeLabel, unavailableAssets, validAssetPage } from './assets-model';
import { useAssetRead } from './assets-hooks';

function TextPreview({ api, asset, t, onClose }) {
  const path = assetPath(asset.id, 'text');
  const validText = useCallback(value => value && typeof value.text === 'string' && value.asset?.id === asset.id, [asset.id]);
  const result = useAssetRead(api, path, validText);
  return <section aria-label={`${t.textPreview}: ${asset.originalFilename}`} className="space-y-3 rounded-lg border bg-background p-4">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-all font-medium">{asset.originalFilename}</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t.textNote}</p></div><Button type="button" variant="ghost" size="icon-sm" autoFocus aria-label={t.closeText} onClick={onClose}><X aria-hidden="true" /></Button></div>
    {result.loading && <p role="status" className="text-sm text-muted-foreground">{t.textLoading}</p>}
    {result.error && <Alert variant="destructive"><AlertDescription><p className="whitespace-pre-line">{assetsError(result.error, t, 'text')}</p><Button type="button" variant="outline" size="sm" className="mt-2 justify-self-start" onClick={result.refresh}>{t.retryText}</Button></AlertDescription></Alert>}
    {result.data && <>{result.data.asset.textTruncated && <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{t.extractionLimited}</p>}{result.data.text ? <pre className="max-h-80 overflow-auto rounded-md border bg-card p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">{result.data.text}</pre> : <p role="status" className="text-sm text-muted-foreground">{t.emptyText}</p>}</>}
  </section>;
}

/** Finder-style original-file section. All resource URLs are constructed from a
 * validated asset ID on this origin; no public URLs or external viewers are used. */
export function OriginalMaterials({ api, clientId, cases = [], lang = 'zh', refreshKey = 0 }) {
  const t = originalCopy(lang);
  const title = clientId ? t.title : t.allTitle, intro = clientId ? t.intro : t.allIntro;
  const id = useId();
  const [query, setQuery] = useState('');
  const [caseId, setCaseId] = useState('');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState(null);
  const textTrigger = useRef(null);
  useReturnFocus(Boolean(selected), textTrigger);
  const path = assetSearchPath({ clientId, caseId, q: query, offset });
  const result = useAssetRead(api, path, validAssetPage, { delay: query ? 180 : 0, refreshKey });
  const names = new Map(cases.map(record => [record.id, record.title]));
  const page = result.data;
  function filter(value, kind) {
    if (kind === 'query') setQuery(value); else setCaseId(value);
    setOffset(0); setSelected(null);
  }
  function changePage(next) { setOffset(next); setSelected(null); }
  function refresh() { result.refresh(); setSelected(null); }
  return <Card className="paper-card gap-4" aria-label={title}>
    <CardHeader><div className="flex items-start justify-between gap-3"><div><h2 className="paper-title text-xl">{title}</h2><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{intro}</p></div><Button type="button" variant="ghost" size="icon-sm" aria-label={t.refresh} disabled={result.loading} onClick={refresh}><RefreshCw aria-hidden="true" /></Button></div></CardHeader>
    <CardContent className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor={`${id}-search`}>{t.search}</Label><div className="relative"><Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" aria-hidden="true" /><Input id={`${id}-search`} type="search" autoComplete="off" maxLength={ASSET_SEARCH_LENGTH} value={query} className="pl-9" onChange={event => filter(event.target.value, 'query')} placeholder={t.searchPlaceholder} aria-describedby={`${id}-hint`} /></div></div>
        <div className="min-w-0 space-y-2 [&_[data-slot=native-select-wrapper]]:w-full"><Label htmlFor={`${id}-case`}>{t.caseFilter}</Label><NativeSelect id={`${id}-case`} value={caseId} onChange={event => filter(event.target.value, 'case')} className="max-w-full"><NativeSelectOption value="">{clientId ? t.allCases : t.allScopes}</NativeSelectOption>{cases.map(record => <NativeSelectOption key={record.id} value={record.id}>{record.title || t.unknownCase} · {record.displayId||'—'}</NativeSelectOption>)}</NativeSelect></div>
      </div>
      <p id={`${id}-hint`} className="text-xs leading-relaxed text-muted-foreground">{t.searchHint}</p>
      {query && <Button type="button" size="sm" variant="link" className="h-auto p-0 text-xs" onClick={() => filter('', 'query')}><X className="size-3" aria-hidden="true" />{t.clear}</Button>}
      {result.loading && <div role="status" className="space-y-3 py-3"><p className="text-sm text-muted-foreground">{t.loading}</p><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></div>}
      {result.error && (unavailableAssets(result.error) ? <Alert><FolderSearch aria-hidden="true" /><AlertTitle>{t.unavailable}</AlertTitle><AlertDescription><p>{t.unavailableHint}</p><Button type="button" variant="outline" size="sm" className="mt-2 justify-self-start" onClick={refresh}>{t.retry}</Button></AlertDescription></Alert> : <Alert variant="destructive"><AlertDescription><p className="whitespace-pre-line">{assetsError(result.error, t)}</p><Button type="button" variant="outline" size="sm" className="mt-2 justify-self-start" onClick={refresh}>{t.retry}</Button></AlertDescription></Alert>)}
      {page && <>
        <p role="status" className="whitespace-pre-line text-xs text-muted-foreground">{t.page(Math.floor(offset / ASSET_PAGE_SIZE) + 1, page.assets.length, page.total)}</p>
        {page.assets.length === 0 ? <div className="py-7 text-center"><FolderSearch className="mx-auto mb-3 size-7 text-muted-foreground" aria-hidden="true" /><h3 className="paper-title text-lg">{query.trim() || caseId ? t.noMatches : t.empty}</h3><p className="mx-auto mt-2 max-w-sm whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{query.trim() || caseId ? t.noMatchesHint : t.emptyHint}</p></div> : <ul className="divide-y divide-border" aria-label={title}>{page.assets.map(asset => {
          const Icon = asset.previewKind === 'image' ? FileImage : asset.previewKind === 'pdf' ? File : FileText;
          const searchable = asset.textStatus === 'ready';
          return <li key={asset.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
            <div className="flex items-start gap-3"><Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" /><div className="min-w-0 flex-1"><h3 className="break-all text-sm font-medium">{asset.originalFilename}</h3><p className="mt-1 break-words text-xs text-muted-foreground">{asset.mimeType} · <span aria-label={t.fileSize}>{sizeLabel(asset.sizeBytes, lang)}</span></p><p className="mt-1 break-words text-xs text-muted-foreground">{asset.caseId ? `${t.caseLabel}: ${names.get(asset.caseId) || t.unknownCase}` : asset.clientId ? t.customerOnly : t.unassignedOriginal}</p><p className="mt-1 text-xs text-muted-foreground">{t.saved} <time dateTime={asset.createdAt}>{formatDate(asset.createdAt, lang)}</time> · {t.recordId}: {asset.displayId||'—'}</p></div></div>
            <div className="flex flex-wrap gap-2"><Badge variant="outline">{searchable ? t.textReady : asset.textStatus === 'unavailable' ? t.textUnavailable : t.textPending}</Badge>{asset.textTruncated && <Badge variant="outline">{t.truncated}</Badge>}</div>
            {query.trim() && typeof asset.snippet === 'string' && asset.snippet && <p className="line-clamp-3 break-words text-xs leading-relaxed text-muted-foreground"><span className="font-medium">{t.match}: </span>{asset.snippet}</p>}
            {Array.isArray(asset.warnings) && asset.warnings.length > 0 && <details className="text-xs leading-relaxed text-muted-foreground"><summary className="cursor-pointer">{t.warnings(asset.warnings.length)}</summary><ul className="mt-2 list-disc space-y-1 pl-4">{asset.warnings.filter(warning => typeof warning === 'string').map((warning, index) => <li key={index} className="break-words">{warning}</li>)}</ul></details>}
            {!searchable && <p className="text-xs leading-relaxed text-muted-foreground">{t.textUnavailableHint}</p>}
            <div className="flex flex-wrap gap-2">
              {asset.previewKind !== 'text' && <Button size="sm" variant="outline" asChild><a href={assetPath(asset.id, 'preview')} target="_blank" rel="noopener noreferrer" aria-label={`${t.previewNewTab}: ${asset.originalFilename}`}>{t.preview}<ArrowUpRight aria-hidden="true" /></a></Button>}
              {searchable && <Button type="button" size="sm" variant="outline" aria-label={`${t.textPreview}: ${asset.originalFilename}`} aria-expanded={selected?.id === asset.id} onClick={event => { textTrigger.current = event.currentTarget; setSelected(asset); }}>{t.textPreview}</Button>}
              <Button size="sm" variant="ghost" asChild><a href={assetPath(asset.id, 'download')} download aria-label={`${t.download}: ${asset.originalFilename}`}><ArrowDownToLine aria-hidden="true" />{t.download}</a></Button>
            </div>
          </li>;
        })}</ul>}
        {(offset > 0 || page.total > ASSET_PAGE_SIZE) && <div className="flex justify-between gap-3 border-t pt-3"><Button type="button" variant="outline" size="sm" disabled={offset === 0 || result.loading} onClick={() => changePage(Math.max(0, offset - ASSET_PAGE_SIZE))}>{t.previous}</Button><Button type="button" variant="outline" size="sm" disabled={result.loading || page.assets.length === 0 || offset + page.assets.length >= page.total} onClick={() => changePage(offset + ASSET_PAGE_SIZE)}>{t.next}</Button></div>}
      </>}
      {selected && <TextPreview key={selected.id} api={api} asset={selected} t={t} onClose={() => setSelected(null)} />}
    </CardContent>
  </Card>;
}
