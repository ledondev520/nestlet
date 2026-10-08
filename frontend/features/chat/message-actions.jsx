import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { conversationDraft, conversationHandoff, reviewableMessage, caseWriteDefinitelyRejected } from '@/lib/conversation-handoff';
import { DOCUMENT_KINDS, hasUnreviewedCJK } from '@/features/documents/helpers';
import { documentErrorText } from '@/features/documents/copy';

/** Explicit draft-only save through the existing immutable, source-linked artifact API. */
export function ChatMessageActions({ message, api, userId, caseId, conversationId, disabled, lang, onReviewMessage, onOpenDocuments, claimOperation, releaseOperation }) {
  const en = lang === 'en';
  const [saved, setSaved] = useState(null), [error, setError] = useState(null), [phase, setPhase] = useState(''), [uncertain, setUncertain] = useState(false), [checkedMissing, setCheckedMissing] = useState(false);
  const mounted = useRef(false), operation = useRef(null), callbacks = useRef({ releaseOperation }); callbacks.current = { releaseOperation };
  const identity = `${userId}:${caseId}:${conversationId}:${message.id}`, identityRef = useRef(identity); identityRef.current = identity;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; operation.current?.controller.abort(); if (operation.current) callbacks.current.releaseOperation?.(operation.current.lock); };
  }, []);
  if (!reviewableMessage(message) || !caseId || !conversationId) return null;
  const title = message.displayId ? `Conversation draft · ${message.displayId}` : 'Conversation draft';
  async function save(checkOnly = false) {
    if (operation.current || disabled) return;
    const lock = claimOperation?.(); if (claimOperation && !lock) return;
    const controller = new AbortController(), captured = identity, token = { controller, lock };
    operation.current = token; setPhase('checking'); setError(null); setCheckedMissing(false);
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]);
    const current = () => mounted.current && identityRef.current === captured && operation.current === token;
    const verify = () => { if (!current() || signal.aborted) throw new DOMException('Context changed', 'AbortError'); };
    let writeStarted = false;
    try {
      const [caseResult, history, versions] = await Promise.all([
        api.get(`/api/cases/${caseId}`, { signal }),
        api.get(`/api/conversations/${conversationId}`, { signal }),
        api.get(`/api/cases/${caseId}/artifacts`, { signal })
      ]);
      verify();
      const record = caseResult.case, source = history.messages?.find(item => item.id === message.id);
      if (record?.id !== caseId || !Number.isSafeInteger(record.version) || !DOCUMENT_KINDS.includes(record.draftType) || history.conversation?.id !== conversationId || history.conversation.caseId !== caseId || !reviewableMessage(source) || source.role !== 'assistant' || source.content !== message.content || !Array.isArray(versions.artifacts)) throw { code: 'INVALID_RESPONSE' };
      const content = conversationDraft(source);
      if (hasUnreviewedCJK(content, record)) throw { code: 'DOCUMENT_ENGLISH_REQUIRED' };
      // Repeated clicks and uncertain writes reconcile by exact durable source/content.
      for (const item of versions.artifacts.filter(item => item.caseId === caseId && item.sourceConversationId === conversationId && item.sourceMessageId === message.id && item.status === 'draft' && item.title === title)) {
        const result = await api.get(`/api/artifacts/${item.id}`, { signal }); verify();
        if (result.artifact?.caseId === caseId && result.artifact.content === content && result.artifact.status === 'draft' && result.artifact.sourceMessageId === message.id && result.artifact.sourceConversationId === conversationId) {
          setSaved(result.artifact); setUncertain(false); return;
        }
      }
      if (checkOnly) { setCheckedMissing(true); return; }
      verify(); setPhase('saving'); writeStarted = true;
      const result = await api.post(`/api/cases/${caseId}/artifacts`, { kind: record.draftType, title, status: 'draft', content, sourceConversationId: conversationId, sourceMessageId: message.id, expectedCaseVersion: record.version }, { signal });
      verify();
      const artifact = result.artifact;
      if (artifact?.caseId !== caseId || artifact.sourceMessageId !== message.id || artifact.sourceConversationId !== conversationId || artifact.status !== 'draft' || artifact.content !== content || !artifact.id || !Number.isSafeInteger(artifact.version)) throw { code: 'INVALID_RESPONSE' };
      setSaved(artifact); setUncertain(false);
    } catch (failure) {
      if (current()) {
        // A lost/cancelled POST can already be committed. Never retry it blindly.
        if (writeStarted && !caseWriteDefinitelyRejected(failure)) setUncertain(true);
        setError(failure.name === 'AbortError' || failure.name === 'TimeoutError' ? { code: 'NETWORK_ERROR' } : failure);
      }
    } finally {
      if (current()) { operation.current = null; setPhase(''); }
      releaseOperation?.(lock);
    }
  }
  return <div className="mt-3 space-y-2 border-t pt-3" data-testid="chat-message-actions">
    <div className="flex flex-wrap gap-2">
      {onReviewMessage && <Button variant="outline" size="xs" disabled={disabled} onClick={() => { const request = conversationHandoff(message, { userId, caseId, conversationId }); if (request) onReviewMessage(request); }}>{en ? 'Review for this case' : '用于案例核对'}</Button>}
      {message.role === 'assistant' && !saved && !uncertain && <Button variant="outline" size="xs" disabled={disabled} onClick={() => save(false)}>{en ? 'Save answer as unreviewed draft' : '将回答另存为待核实草稿'}</Button>}
      {uncertain && <Button variant="outline" size="xs" disabled={disabled} onClick={() => save(true)}>{en ? 'Check saved draft status' : '检查草稿保存状态'}</Button>}
      {phase && <Button variant="ghost" size="xs" onClick={() => operation.current?.controller.abort()}>{en ? 'Cancel draft action' : '取消草稿操作'}</Button>}
      {(saved || uncertain) && onOpenDocuments && <Button variant="ghost" size="xs" disabled={disabled} onClick={() => onOpenDocuments({ userId, caseId })}>{en ? 'Open case document versions' : '打开本案例文书版本'}</Button>}
    </div>
    {phase && <p role="status" className="text-xs text-muted-foreground">{en ? 'Checking and saving this answer…' : '正在核对并保存本条回答…'}</p>}
    {saved && <p role="status" className="text-xs text-muted-foreground">{en ? `Unreviewed draft saved: ${saved.title}, v${saved.version}. Open that version in Documents to preview it. No case facts were confirmed.` : `待核实草稿已保存：${saved.title}，v${saved.version}。在文书页打开该版本可预览；没有确认任何案例事实。`}</p>}
    {uncertain && <p role="status" className="text-xs text-destructive">{en ? 'Save status is unconfirmed. Check saved versions before trying to save again.' : '尚未确认是否保存成功，请先检查已存版本，不要重复保存。'}</p>}
    {checkedMissing && <p role="status" className="text-xs text-muted-foreground">{en ? 'No matching saved draft was found yet. You can check again or inspect Documents; this action did not create another version.' : '暂未找到对应草稿，可再次检查或查看文书页。本次检查没有新建版本。'}</p>}
    {error && <p role="alert" className="text-xs text-destructive">{documentErrorText(error, lang)}</p>}
  </div>;
}
