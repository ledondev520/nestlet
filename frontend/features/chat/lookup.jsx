import { Search } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChatSourceNavigation } from './source-navigation.jsx';
import { normalizeLibrarySources } from './retrieval.js';
import { sourceNavigationCopy, sourceNavigationError } from './source-navigation.js';

/** Explicit, read-only lookup. A search never sends a model turn or creates a case. */
export function ChatLookup({ api, userId, caseId, lang, active, disabled, onOpenSourceCase, claimOperation, releaseOperation, compact = false }) {
  const en = lang === 'en', id = useId();
  const [query, setQuery] = useState(''), [sources, setSources] = useState(null), [pending, setPending] = useState(false), [notice, setNotice] = useState('');
  const operation = useRef(null), context = useRef(null);
  context.current = { api, userId, caseId, active, disabled };
  function cancel() {
    const token = operation.current; operation.current = null; token?.controller.abort();
    if (token) token.release?.(token.claim);
    setPending(false);
  }
  useEffect(() => { cancel(); setSources(null); setNotice(''); }, [api, userId, caseId, active, disabled]);
  useEffect(() => () => { const token = operation.current; operation.current = null; token?.controller.abort(); if (token) token.release?.(token.claim); }, []);
  async function search(event) {
    event.preventDefault();
    if (!active || disabled || operation.current || !query.trim()) return;
    const claim = claimOperation?.(); if (claimOperation && claim == null) return;
    const token = { ...context.current, controller: new AbortController(), claim, release: releaseOperation };
    operation.current = token; setPending(true); setSources(null); setNotice('');
    const current = () => operation.current === token && !token.controller.signal.aborted && Object.entries(context.current).every(([key, value]) => value === token[key]);
    try {
      const signal = AbortSignal.any([token.controller.signal, AbortSignal.timeout(15000)]);
      const [clients, cases] = await Promise.all([api.get(`/api/clients?search=${encodeURIComponent(query.trim())}&limit=24`, { signal }), api.get('/api/cases', { signal })]);
      if (!current()) return;
      if (!Array.isArray(clients?.clients) || !Array.isArray(cases?.cases) || clients.clients.length > 24 || cases.cases.length > 100) throw { code: 'SOURCE_INVALID' };
      const match = query.trim().toLocaleLowerCase();
      const rows = [...clients.clients.map(record => ({ kind: 'client', record })), ...cases.cases.filter(record => typeof record.title === 'string' && record.title.toLocaleLowerCase().includes(match)).slice(0, 24).map(record => ({ kind: 'case', record }))];
      if (!rows.length) { setNotice(en ? 'No matching saved customers or cases.' : '未找到匹配的已保存客户或案例。'); return; }
      const result = normalizeLibrarySources({ requestId: crypto.randomUUID(), appendix: '', items: rows.map(({ kind, record }, index) => ({
        sourceId: `S${index + 1}`, kind, id: record.id, ...(record.displayId?{displayId:record.displayId}:{}), version: record.version, title: kind === 'client' ? record.displayName : record.title,
        titleTruncated: false, retrievalState: 'metadata', ...(record.clientId ? { clientId: record.clientId } : {})
      })) });
      setSources(result);
    } catch (error) { if (current() && error.name !== 'AbortError') setNotice(sourceNavigationError(error, sourceNavigationCopy[en ? 'en' : 'zh'])); }
    finally { if (operation.current === token) { operation.current = null; token.release?.(token.claim); setPending(false); } }
  }
  return <section className="chat-record-search space-y-3" aria-label={en ? 'Find a saved customer or case' : '查找已保存的客户或案例'}>
    <form onSubmit={search} className="space-y-2">
      <Label className={compact?'sr-only':undefined} htmlFor={id}>{en ? 'Customer name or case title' : '客户名称或案例标题'}</Label>
      <div className="chat-record-search-row"><Input id={id} placeholder={en?'Search saved records':'搜索已保存记录'} type="search" maxLength={120} value={query} disabled={disabled || pending || !active}
        onChange={event => { setQuery(event.target.value); setSources(null); setNotice(''); }} />
        <Button type="submit" variant="outline" aria-label={en ? 'Find saved records' : '查找已保存记录'} disabled={disabled || pending || !active || !query.trim()}>{compact ? <Search aria-hidden="true" size={18}/> : (en ? 'Find saved records' : '查找已保存记录')}</Button></div>

    </form>
    {pending && <div role="status">{en ? 'Searching saved records…' : '正在查找已保存记录…'} <Button type="button" variant="ghost" onClick={cancel}>{en ? 'Cancel lookup' : '取消查找'}</Button></div>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {sources && <ChatSourceNavigation {...{ api, userId, caseId, lang, active, disabled, sources, onOpenSourceCase, claimOperation, releaseOperation }} />}
  </section>;
}
