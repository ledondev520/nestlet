import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { originalRetentionCopy, originalRetentionError } from './original-retention-copy.js';
import { findSavedChatOriginal, originalFilename, originalId, originalUploadDefinitelyRejected, prepareChatOriginal, uploadChatOriginal } from './original-retention.js';

/** Composer-only retention. Files and results stay in this mounted workspace. */
export function ChatOriginalRetention({ api, userId, authenticated, caseId = null, images = [], lang = 'zh', disabled = false, ensureCase, onBusyChange, onOpenMaterials }) {
  const words = originalRetentionCopy[lang] || originalRetentionCopy.zh;
  const [records, setRecords] = useState({ userId, caseId, entries: {} });
  const [pendingId, setPendingId] = useState(null);
  const mounted = useRef(false), active = useRef(null), epoch = useRef(0);
  const latest = useRef(null), previousScope = useRef({ userId, authenticated, caseId });
  latest.current = { api, userId, authenticated, caseId, images, disabled, ensureCase, onBusyChange, onOpenMaterials };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false; epoch.current++;
      active.current?.controller.abort(); active.current = null;
      latest.current.onBusyChange?.(false);
    };
  }, []);
  useEffect(() => {
    const before = previousScope.current;
    previousScope.current = { userId, authenticated, caseId };
    // An empty workspace acquiring its first saved ID is the same case. A true
    // case switch or session boundary discards all local retention state.
    if (before.userId !== userId || !authenticated || before.authenticated !== authenticated ||
        before.caseId && before.caseId !== caseId) {
      epoch.current++; active.current?.controller.abort(); active.current = null;
      setRecords({ userId, caseId, entries: {} }); setPendingId(null);
      latest.current.onBusyChange?.(false);
    }
  }, [userId, authenticated, caseId]);

  useEffect(() => {
    const visible = new Set(images.map(image => image.id));
    setRecords(previous => {
      const entries = Object.fromEntries(Object.entries(previous.entries).filter(([id]) => visible.has(id)));
      return Object.keys(entries).length === Object.keys(previous.entries).length ? previous : { ...previous, entries };
    });
  }, [images]);

  const scopeVisible = authenticated && records.userId === userId && (!records.caseId || records.caseId === caseId);
  const entries = scopeVisible ? records.entries : {};
  function current(token) {
    const now = latest.current;
    return mounted.current && active.current === token && epoch.current === token.epoch &&
      now.authenticated && now.userId === token.userId && now.api === token.api &&
      (now.caseId === token.caseId || !token.initialCaseId && (!now.caseId || token.phase === 'ensure')) &&
      now.images.some(image => image.id === token.id && image.originalFile === token.file);
  }
  function requireCurrent(token) {
    if (!current(token)) throw new DOMException('Context changed', 'AbortError');
  }
  function update(token, entry) {
    if (!current(token)) return;
    setRecords(previous => ({ userId: token.userId, caseId: token.caseId,
      entries: { ...(previous.userId === token.userId && (!previous.caseId || previous.caseId === token.caseId) ? previous.entries : {}), [token.id]: entry } }));
  }
  async function retain(image, checkOnly = false) {
    const now = latest.current;
    if (active.current || now.disabled || !now.authenticated || !now.images.includes(image)) return;
    const previous = entries[image.id];
    if (previous?.state === 'saved' || previous?.state === 'uncertain' && !checkOnly) return;
    const token = { id: image.id, file: image.originalFile, userId: now.userId, api: now.api,
      initialCaseId: now.caseId, caseId: now.caseId, epoch: epoch.current, controller: new AbortController(), phase: 'prepare', uploaded: false };
    active.current = token; setPendingId(image.id); now.onBusyChange?.(true);
    update(token, { state: checkOnly ? 'checking' : 'saving', caseId: token.caseId });
    const signal = AbortSignal.any([token.controller.signal, AbortSignal.timeout(60000)]);
    try {
      const original = await prepareChatOriginal(image, { signal }); requireCurrent(token);
      token.phase = 'ensure';
      if (!token.caseId) {
        if (typeof now.ensureCase !== 'function') throw Object.assign(new Error(), { code: 'ORIGINAL_CASE_REQUIRED' });
        const bound = await now.ensureCase(signal); requireCurrent(token);
        if (!originalId(bound?.caseId) || bound.userId !== token.userId || latest.current.caseId && latest.current.caseId !== bound.caseId)
          throw Object.assign(new Error(), { code: 'ORIGINAL_CASE_REQUIRED' });
        token.caseId = bound.caseId;
      }
      token.phase = 'check'; requireCurrent(token);
      const found = await findSavedChatOriginal(token.api, original, token.caseId, { signal }); requireCurrent(token);
      if (found) { update(token, { state: 'saved', asset: found, caseId: token.caseId }); return; }
      if (checkOnly) { update(token, { state: 'uncertain', unresolved: true, caseId: token.caseId }); return; }
      token.phase = 'upload'; token.uploaded = true;
      const asset = await uploadChatOriginal(token.api, original, token.caseId, { signal }); requireCurrent(token);
      update(token, { state: 'saved', asset, caseId: token.caseId });
    } catch (error) {
      if (!current(token)) return;
      const uncertain = checkOnly || token.uploaded && !originalUploadDefinitelyRejected(error);
      update(token, { state: uncertain ? 'uncertain' : 'failed', error: uncertain ? null : error, caseId: token.caseId });
    } finally {
      if (active.current === token) {
        active.current = null;
        if (mounted.current) { setPendingId(null); latest.current.onBusyChange?.(false); }
      }
    }
  }

  if (!authenticated || !images.length) return null;
  return <section className="space-y-3 rounded border p-3" aria-label={words.title}>
    <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{words.boundary}</p>
    <ul className="space-y-3">{images.map(image => {
      const entry = entries[image.id], pending = pendingId === image.id && scopeVisible;
      return <li key={image.id} className="space-y-2 text-xs">
        <p className="whitespace-pre-line break-all font-medium">{originalFilename(image)}</p>
        {entry?.state === 'saved' ? <div className="space-y-2">
          <p className="whitespace-pre-line" role="status">{words.saved}</p>
          <div className="flex flex-wrap gap-3">
            <a className="underline underline-offset-4" href={`/api/assets/${entry.asset.id}/preview`} target="_blank" rel="noopener noreferrer">{words.preview}</a>
            <a className="underline underline-offset-4" href={`/api/assets/${entry.asset.id}/download`}>{words.download}</a>
          </div>
        </div> : <>
          {pending && <p className="whitespace-pre-line" role="status">{entry?.state === 'checking' ? words.checking : words.saving}</p>}
          {entry?.state === 'failed' && <p className="whitespace-pre-line" role="alert">{originalRetentionError(entry.error, words)}</p>}
          {entry?.state === 'uncertain' && <p className="whitespace-pre-line" role="status">{entry.unresolved ? words.unresolved : words.uncertain}</p>}
          {pending ? <Button type="button" size="sm" variant="outline" onClick={() => active.current?.controller.abort()}>{words.cancel}</Button> :
            <Button type="button" size="sm" variant="outline" disabled={disabled || Boolean(pendingId)} onClick={() => retain(image, entry?.state === 'uncertain')}>
              {entry?.state === 'uncertain' ? words.check : entry?.state === 'failed' ? words.retry : words.save}
            </Button>}
        </>}
      </li>;
    })}</ul>
    {onOpenMaterials && caseId && <Button type="button" size="sm" variant="ghost" disabled={disabled || Boolean(pendingId)} onClick={() => onOpenMaterials()}>{words.materials}</Button>}
  </section>;
}
