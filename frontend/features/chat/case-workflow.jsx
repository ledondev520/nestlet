import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { documentCopy, documentErrorText } from '@/features/documents/copy';

/** Read-only progress for this saved case; the existing editors own all writes. */
export function ChatCaseWorkflow({ api, lang, caseId, userId, disabled, active = true, refreshKey, onOpenMaterials, onOpenDocuments, onSavedTitle }) {
  const en = lang === 'en', words = documentCopy(lang);
  const [snapshot, setSnapshot] = useState(null), [loading, setLoading] = useState(false), [error, setError] = useState(null), [revision, setRevision] = useState(0);
  const scope = `${userId}:${caseId}:${lang}`, currentScope = useRef(scope); currentScope.current = scope;
  useEffect(() => {
    if (!caseId || !active) return;
    const controller = new AbortController(), captured = scope;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
    const current = () => !controller.signal.aborted && currentScope.current === captured;
    setLoading(true); setError(null);
    (async () => {
      const result = await api.get(`/api/cases/${caseId}`, { signal });
      if (!current()) return;
      if (result.case?.id !== caseId || !Number.isSafeInteger(result.case.version) || !Array.isArray(result.case.fields) || typeof result.case.title !== 'string' || result.case.title.length > 120) throw { code: 'INVALID_RESPONSE' };
      // Reuse this scoped canonical read; never reload the conversation or composer.
      onSavedTitle?.(result.case.title);
      const readiness = await api.get(`/api/cases/${caseId}/readiness?kind=${encodeURIComponent(result.case.draftType)}&locale=${en ? 'en' : 'zh'}`, { signal });
      if (!current()) return;
      if (typeof readiness.ready !== 'boolean' || !Array.isArray(readiness.missing) || readiness.missing.some(item => typeof item.question !== 'string' || !Object.hasOwn(words.fields, item.key))) throw { code: 'INVALID_RESPONSE' };
      setSnapshot({ scope: captured, record: result.case, readiness });
    })().catch(failure => { if (current()) setError(failure); }).finally(() => { if (current()) setLoading(false); });
    return () => controller.abort();
  }, [api, scope, active, refreshKey, revision, onSavedTitle]);
  const saved = snapshot?.scope === scope ? snapshot : null;
  const confirmed = saved ? [...saved.record.fields, ...Object.entries(saved.record.documentContext || {}).map(([key, detail]) => ({ ...detail, key }))].filter(field => field.confirmed && !field.conflict && (field.value || field.notApplicable)) : [];
  const resolved = (saved?.record.caseIssues || []).filter(issue => issue.status === 'resolved');
  return <Card data-testid="chat-case-workflow" className="mb-5">
    <CardHeader className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="text-base">{en ? 'Continue this case' : '继续办理当前案例'}</CardTitle>{saved && <Badge variant="outline">v{saved.record.version}</Badge>}</div>
      <CardDescription>{en ? 'Review the case information, then finish an English document. Conversation answers need your review before they become facts.' : '先核对案例资料，再完成英文文书。对话回答须经你核实，才可作为案例事实。'}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {!caseId && <p className="text-sm text-muted-foreground">{en ? 'Send your first message to save a case, or start with materials.' : '发送第一条消息即可保存案例，也可以先添加材料。'}</p>}
      {loading && <p role="status" className="text-sm text-muted-foreground">{en ? 'Checking saved case details…' : '正在检查已保存的案例资料…'}</p>}
      {error && <Alert variant="destructive"><AlertDescription>{documentErrorText(error, lang)}<Button size="sm" variant="ghost" disabled={disabled || loading} onClick={() => setRevision(value => value + 1)}>{words.retry}</Button></AlertDescription></Alert>}
      {saved && !error && <>
        <p className="text-sm font-medium">{saved.readiness.ready ? (en ? 'Saved details are ready for document generation.' : '已保存的关键资料已齐备，可以进入文书生成。') : (en ? 'Still needed for this document' : '这份文书还需要')}</p>
        {!!saved.readiness.missing.length && <ul className="space-y-2 text-sm text-muted-foreground">{saved.readiness.missing.map(item => <li key={item.key}>{item.question}</li>)}</ul>}
        {!!confirmed.length && <details className="rounded border px-3 py-2"><summary className="cursor-pointer text-sm">{en ? 'Already confirmed in this case' : '当前案例已确认的资料'} · {confirmed.length}</summary><dl className="mt-3 grid gap-3 sm:grid-cols-2">{confirmed.map(field => <div key={field.key} className="min-w-0"><dt className="text-xs text-muted-foreground">{words.fields[field.key]}</dt><dd className="break-words text-sm">{field.notApplicable ? words.notApplicable : field.value}</dd></div>)}</dl></details>}
        {!!resolved.length && <details className="rounded border px-3 py-2"><summary className="cursor-pointer text-sm">{en ? 'Already resolved' : '已解决的问题'} · {resolved.length}</summary><ul className="mt-3 space-y-3 text-sm">{resolved.map(issue => <li key={issue.id}><p>{issue.question}</p><p className="whitespace-pre-wrap break-words text-muted-foreground">{issue.resolution}</p></li>)}</ul></details>}
      </>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={disabled} onClick={onOpenMaterials}>{en ? 'Review facts and materials' : '核对事实与材料'}</Button>
        <Button disabled={disabled || !caseId} onClick={() => onOpenDocuments?.({ userId, caseId })}>{en ? 'Finish and preview English document' : '补齐并预览英文文书'}</Button>
      </div>
      <p className="text-xs text-muted-foreground">{en ? 'Only saved details are shown here. If material edits are pending, the next step returns to them first. Nothing is sent to a recipient.' : '这里仅显示已保存的资料。如有材料尚未保存，下一步会先返回处理；不会发送给收件人。'}</p>
    </CardContent>
  </Card>;
}
