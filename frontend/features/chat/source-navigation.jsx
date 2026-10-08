import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { chatCopy } from './copy.js';
import { inspectSource, sourceCase, sourceNavigationCopy, sourceNavigationError } from './source-navigation.js';

/** Read-only source actions. App alone owns guarded case switching and editors. */
export function ChatSourceNavigation({ api, sources, userId, caseId, lang = 'zh', active = true, disabled = false, onOpenSourceCase, claimOperation, releaseOperation }) {
  const words = chatCopy[lang] || chatCopy.zh, copy = sourceNavigationCopy[lang] || sourceNavigationCopy.zh;
  const [detail, setDetail] = useState(null), [pending, setPending] = useState(false), [notice, setNotice] = useState('');
  const latest = useRef(null), operation = useRef(null), mounted = useRef(false);
  latest.current = { api, sources, userId, caseId, active, disabled, onOpenSourceCase, claimOperation, releaseOperation };
  function cancel(render = true) {
    const token = operation.current;
    operation.current = null;
    token?.controller.abort();
    if (token) token.release?.(token.claim);
    if (render && mounted.current) setPending(false);
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; cancel(false); }; }, []);
  useEffect(() => { cancel(); setDetail(null); setNotice(''); }, [api, sources, userId, caseId, active, disabled]);
  function current(token) {
    const now = latest.current;
    return mounted.current && operation.current === token && !token.controller.signal.aborted && now.active && !now.disabled &&
      now.api === token.api && now.sources === token.sources && now.userId === token.userId && now.caseId === token.caseId;
  }
  const requireCurrent = token => { if (!current(token)) throw new DOMException('Context changed', 'AbortError'); };
  async function run(source, destination, selected) {
    const now = latest.current;
    if (!now.active || now.disabled || operation.current || !now.userId || !now.sources.items.includes(source)) return;
    const claim = now.claimOperation?.();
    if (now.claimOperation && claim == null) return;
    const token = { ...now, claim, release: now.releaseOperation, controller: new AbortController() };
    operation.current = token; setPending(true); setNotice('');
    const signal = AbortSignal.any([token.controller.signal, AbortSignal.timeout(15000)]);
    try {
      const inspected = await inspectSource(token.api, token.sources, source.sourceId, { signal }); requireCurrent(token);
      if (!destination) { setDetail(inspected); return; }
      // Preserve the exact displayed customer choice/version across the fresh
      // read, instead of quietly adopting a changed list entry.
      const choice = selected ? detail : inspected;
      const record = await sourceCase(token.api, choice, selected, { signal }); requireCurrent(token);
      const opened = token.onOpenSourceCase?.({ userId: token.userId, caseId: token.caseId, targetCaseId: record.id, view: destination });
      if (opened === false && current(token)) setNotice(copy.denied);
    } catch (error) {
      if (current(token) && error.name !== 'AbortError') { setDetail(null); setNotice(sourceNavigationError(error, copy)); }
    } finally {
      if (operation.current === token) { operation.current = null; token.release?.(token.claim); if (mounted.current) setPending(false); }
    }
  }
  const blocked = disabled || pending || !active;
  return <section aria-label={words.librarySources} className="space-y-2 rounded border p-3" data-testid="chat-source-navigation">
    <h2 className="text-sm font-semibold">{words.librarySources}</h2><p className="text-xs text-muted-foreground">{words.librarySourcesNote}</p>
    <ul className="space-y-2 text-xs">{sources.items.map(source => <li key={source.sourceId} className="space-y-2 break-words" data-source-id={source.sourceId}>
      <p><strong>{source.sourceId}</strong> · {words[{ client: 'libraryClient', case: 'libraryCase', asset: 'libraryAsset', artifact: 'libraryArtifact' }[source.kind]]} · {source.title} {source.titleTruncated && `(${words.libraryTitleTruncated})`}</p>
      <p>{words.libraryVersion} {source.version} · {words[{ metadata: 'libraryMetadata', read: 'libraryRead', unavailable: 'libraryUnreadable' }[source.retrievalState]]}{source.truncated && ` · ${words.libraryExcerptTruncated}`}{source.status && ` · ${words[source.status === 'final' ? 'libraryFinal' : 'libraryDraft']}`}{(source.isStale || source.needsRegeneration) && ` · ${words.libraryStale}`}</p>
      <p className="text-muted-foreground">{source.displayId||source.sourceId}{source.kind === 'case' && source.id === caseId && ` · ${copy.current}`}</p>
      <Button type="button" variant="outline" size="sm" disabled={blocked || source.kind === 'case' && !onOpenSourceCase}
        onClick={() => run(source, source.kind === 'case' ? 'chat' : null)}>{source.kind === 'case' ? copy.openCase : source.kind === 'client' ? copy.choose : copy.inspect}</Button>
      {detail?.source.sourceId === source.sourceId && <div className="space-y-2 rounded border p-3">
        <p className="font-medium">{detail.title}</p>
        {detail.cases && <><p>{copy.chooseNote}</p>{!detail.cases.length && <p>{copy.empty}</p>}<ul className="space-y-2">{detail.cases.map(record => <li key={record.id}>
          <p>{record.title} · {record.displayId||'—'} · {words.libraryVersion} {record.version}{record.id === caseId && ` · ${copy.current}`}</p>
          <Button type="button" variant="outline" size="sm" disabled={blocked || !onOpenSourceCase} onClick={() => run(source, 'chat', record.id)} aria-label={`${copy.openCase}: ${record.title} · ${record.displayId||'—'}`}>{copy.openCase}</Button>
        </li>)}</ul></>}
        {detail.preview && <div className="flex flex-wrap gap-3">
          <a className="underline underline-offset-4" href={blocked ? undefined : detail.preview} aria-disabled={blocked} target="_blank" rel="noopener noreferrer">{copy.preview}</a>
          <a className="underline underline-offset-4" href={blocked ? undefined : detail.download} aria-disabled={blocked} download>{copy.download}</a>
        </div>}
        {detail.content !== undefined && <><p>{copy.historical}{detail.stale && ` ${words.libraryStale}`}</p><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">{detail.content}</pre></>}
        {source.caseId && onOpenSourceCase && <Button type="button" variant="outline" size="sm" disabled={blocked} onClick={() => run(source, source.kind === 'artifact' ? 'documents' : 'intake')}>{source.kind === 'artifact' ? copy.documents : copy.openCase}</Button>}
        <Button type="button" variant="ghost" size="sm" onClick={() => { cancel(); setDetail(null); setNotice(''); }}>{copy.close}</Button>
      </div>}
    </li>)}</ul>
    {pending && <div role="status"><p>{copy.loading}</p><Button type="button" variant="outline" size="sm" onClick={() => cancel()}>{copy.cancel}</Button></div>}
    {notice && <p role="status" className="text-sm text-destructive">{notice}</p>}
  </section>;
}
