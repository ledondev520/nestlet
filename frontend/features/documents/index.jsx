import { useEffect, useRef, useState } from 'react';
import { FileText, Copy, Download, Printer, RefreshCw, Plus, Check, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useDocuments } from './use-documents.js';
import { documentCopy, documentErrorText } from './copy.js';
import { FACT_KEYS, DETAIL_KEYS, DOCUMENT_KINDS, ISSUE_STATUSES, currentValue, hasUnreviewedCJK } from './helpers.js';

const dateLabel = (value, lang) => {
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) ? new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'zh-CN', {dateStyle:'medium', timeStyle:'short'}).format(date) : '—';
};
const emptyIssue = () => ({question:'', resolution:'', status:'pending', sourceMessageId:null});

function MessageSource({lang, caseId, value, onChange, conversations, loadMessages, disabled}) {
  const d = documentCopy(lang);
  const [conversationId, setConversationId] = useState(''), [messages, setMessages] = useState([]), [loading, setLoading] = useState(false), [failed, setFailed] = useState(false);
  const loader = useRef(loadMessages); loader.current = loadMessages;
  useEffect(() => {setConversationId(''); setMessages([]);}, [caseId]);
  useEffect(() => {
    const controller = new AbortController(); setMessages([]); setFailed(false);
    if (!conversationId) {setLoading(false); return () => controller.abort();}
    setLoading(true);
    loader.current(conversationId, controller.signal).then(next => {if (!controller.signal.aborted) setMessages(next);})
      .catch(error => {if (error.name !== 'AbortError' && !controller.signal.aborted) setFailed(true);})
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [conversationId, caseId]);
  return <fieldset className="space-y-2 rounded-md border border-border p-3">
    <legend className="px-1 text-sm font-medium">{d.sourceMessage}</legend>
    <NativeSelect aria-label={d.chooseConversation} value={conversationId} disabled={disabled} className="w-full" onChange={event => {setConversationId(event.target.value); onChange(null);}}>
      <NativeSelectOption value="">{d.chooseConversation}</NativeSelectOption>
      {conversations.map(item => <NativeSelectOption key={item.id} value={item.id}>{item.title}</NativeSelectOption>)}
    </NativeSelect>
    {conversationId && <NativeSelect aria-label={d.chooseMessage} value={value || ''} disabled={disabled || loading} className="w-full" onChange={event => onChange(event.target.value || null)}>
      <NativeSelectOption value="">{loading ? d.loading : d.noSource}</NativeSelectOption>
      {messages.map(message => <NativeSelectOption key={message.id} value={message.id}>{message.role === 'user' ? d.user : d.assistant}{message.state === 'complete' ? '' : ` (${d.interrupted})`} · {message.content.replace(/\s+/g, ' ').slice(0, 110)}</NativeSelectOption>)}
    </NativeSelect>}
    {value && !conversationId && <p className="break-all text-xs text-muted-foreground">{d.source}: {value}</p>}
    {failed && <p role="alert" className="text-sm text-destructive">{d.sourceUnavailable}</p>}
  </fieldset>;
}

function ContextDetails({record, lang, disabled, onAdd, form, onForm}) {
  const d = documentCopy(lang);
  const {key,value,notApplicable} = form;
  const context = record.documentContext || {};
  return <details className="rounded-lg border border-border bg-card px-5 py-4">
    <summary className="cursor-pointer text-sm font-medium">{d.confirmedDetails}</summary>
    <dl className="mt-4 grid gap-4 sm:grid-cols-2">
      {[...(record.fields || []).map(field => ({...field, label:d.fields[field.key]})), ...Object.entries(context).map(([name, entry]) => ({...entry, key:name, label:d.fields[name]}))].map(entry => <div key={entry.key} className="min-w-0 space-y-1">
        <dt className="text-xs font-medium text-muted-foreground">{entry.label}</dt>
        <dd className="whitespace-pre-wrap break-words text-sm">{entry.notApplicable ? d.notApplicable : entry.value || '—'}</dd>
        <dd><Badge variant={entry.confirmed && !entry.conflict ? 'secondary' : 'outline'}>{entry.confirmed && !entry.conflict ? d.reviewed : d.pending}</Badge></dd>
        {entry.source && <dd className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{d.source}: {entry.source}</dd>}
        {entry.confirmedAt && <dd className="text-xs text-muted-foreground">{d.confirmedAt}: {dateLabel(entry.confirmedAt, lang)}</dd>}
      </div>)}
    </dl>
    <Separator className="my-4" />
    <form className="space-y-3" onSubmit={event => {event.preventDefault(); if (value.trim() || notApplicable) {onAdd(key, {value:notApplicable ? '' : value, notApplicable}); onForm({key,value:'',notApplicable:false,touched:false});}}}>
      <h3 className="text-sm font-medium">{d.editDetails}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="document-detail-key">{d.detail}</Label><NativeSelect id="document-detail-key" disabled={disabled} value={key} onChange={event => onForm({key:event.target.value,value:currentValue(record,event.target.value),notApplicable:false,touched:false})}>
          {[...FACT_KEYS, ...DETAIL_KEYS].map(name => <NativeSelectOption value={name} key={name}>{d.fields[name]}</NativeSelectOption>)}
        </NativeSelect></div>
        <div className="space-y-1"><Label htmlFor="document-detail-value">{d.answer}</Label><Input id="document-detail-value" value={value} maxLength={FACT_KEYS.includes(key) ? 3000 : 1000} disabled={disabled || notApplicable} onChange={event => onForm({...form,value:event.target.value,touched:true})} /></div>
      </div>
      {['documentDate','salutation','senderRole','senderOrganization','recipientOrganization','attachments','nextActionOwner','targetDate'].includes(key) && <div className="flex items-center gap-2"><Checkbox id="document-detail-na" checked={notApplicable} disabled={disabled} onCheckedChange={checked => onForm({...form,notApplicable:checked === true,touched:true})} /><Label htmlFor="document-detail-na">{d.notApplicable}</Label></div>}
      <Button type="submit" size="sm" variant="outline" disabled={disabled || (!value.trim() && !notApplicable)}>{d.addAnswer}</Button>
    </form>
  </details>;
}

export function DocumentsPage({lang = 'zh', caseId, onDirtyChange, onOpenIntake, active = true}) {
  const page = useDocuments(lang, caseId, onDirtyChange, active);
  const {state, status, patch} = page;
  const d = documentCopy(lang), busy = Boolean(state.busy || state.readinessLoading), record = state.record;
  const missing = state.readiness?.missing || [];
  const questionKeys = [...new Set([...missing.map(item => item.key), ...Object.keys(state.answers)])];
  const languageReview = missing.some(item => item.reason === 'english_review') || Object.values(state.answers).some(answer => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(typeof answer === 'string' ? answer : answer.value));
  const updateAnswer = (key, value) => patch({answers:{...state.answers, [key]:value}});
  const updateIssue = values => patch({issueForm:{...state.issueForm, ...values}});
  const openIssue = issue => {const form = issue ? {id:issue.id, question:issue.question, resolution:issue.resolution, status:issue.status, sourceMessageId:issue.sourceMessageId} : emptyIssue(); patch({issueForm:form, issueBaseline:JSON.stringify(form)});};
  const openVersion = id => {
    if (page.contentDirty && !window.confirm(lang === 'en' ? 'Open another version and discard unsaved document edits?' : '打开其他版本会放弃尚未保存的正文修改，继续吗？')) return;
    page.openArtifact(id);
  };
  const isEnglish = !hasUnreviewedCJK(state.content, record);
  const conflict = ['CASE_CONFLICT', 'DOCUMENT_CONTEXT_CONFLICT', 'CASE_ISSUE_NOT_FOUND'].includes(state.error?.code);

  if (!status.authenticated) return <Card className="paper-card"><CardContent className="pt-1 text-sm text-muted-foreground">{d.signIn}</CardContent></Card>;
  if (!caseId) return <Card className="paper-card"><CardHeader><CardTitle className="paper-title">{d.title}</CardTitle><CardDescription>{d.selectCase}</CardDescription></CardHeader></Card>;
  return <div className="space-y-6" data-testid="documents-page">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-2"><p className="text-xs tracking-widest text-muted-foreground">{d.eyebrow}</p><h1 className="paper-title text-3xl">{record?.title || d.title}</h1><p className="max-w-2xl text-sm text-muted-foreground">{d.subtitle}</p></div>
      <div className="flex flex-wrap gap-2">{onOpenIntake && <Button variant="outline" size="sm" onClick={onOpenIntake}><ArrowUpRight aria-hidden="true" />{d.material}</Button>}<Button variant="ghost" size="sm" disabled={busy} onClick={() => page.reload(true)}><RefreshCw aria-hidden="true" />{d.reload}</Button></div>
    </header>
    {state.error && <Alert variant="destructive" role="alert"><AlertTitle>{conflict ? d.conflict : documentErrorText(state.error, lang)}</AlertTitle>{conflict && <AlertDescription className="space-y-2"><p>{documentErrorText(state.error, lang)}</p><Button size="sm" variant="outline" disabled={busy} onClick={() => page.reload(true)}>{d.reload}</Button></AlertDescription>}</Alert>}
    {state.notice && <p role="status" className="paper-note rounded-md px-4 py-3 text-sm">{d[state.notice] || d.saved}</p>}
    {page.cacheStatus === 'unavailable' && page.dirty && <Alert><AlertDescription>{d.cacheUnavailable}</AlertDescription></Alert>}
    {state.loading && <div role="status" aria-label={d.loading} className="space-y-3"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-44 w-full" /><span className="sr-only">{d.loading}</span></div>}
    {!state.loading && !record && <Button disabled={busy} onClick={() => page.reload(false)}>{d.retry}</Button>}
    {record && <>
      <Card className="paper-card">
        <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="paper-title text-xl">{questionKeys.length ? d.missingTitle : d.ready}</CardTitle><Badge variant="outline">v{record.version}</Badge></div><CardDescription>{d.missingHint}</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1"><Label htmlFor="document-kind">{d.kind}</Label><NativeSelect id="document-kind" disabled={busy} value={state.kind} onChange={event => patch({kind:event.target.value})}>{DOCUMENT_KINDS.map((kind, index) => <NativeSelectOption key={kind} value={kind}>{d.kinds[index]}</NativeSelectOption>)}</NativeSelect></div>
          {questionKeys.length > 0 && <form className="space-y-4" onSubmit={event => {event.preventDefault(); page.confirmAnswers(false);}}>
            <div className="grid gap-4 sm:grid-cols-2">{questionKeys.map(key => {
              const item = missing.find(question => question.key === key), raw = state.answers[key];
              const answer = typeof raw === 'string' ? {value:raw} : raw || {value:currentValue(record, key)};
              return <div key={key} className="space-y-2"><Label htmlFor={`document-answer-${key}`}>{d.fields[key] || item?.label || key}</Label>
                {item?.question && <p className="text-xs text-muted-foreground">{item.question}</p>}
                {key === 'attachments' ? <Textarea id={`document-answer-${key}`} value={answer.value} maxLength={1000} disabled={busy || answer.notApplicable} onChange={event => updateAnswer(key, {...answer, value:event.target.value})} /> : <Input id={`document-answer-${key}`} value={answer.value} maxLength={FACT_KEYS.includes(key) ? 3000 : 1000} disabled={busy || answer.notApplicable} onChange={event => updateAnswer(key, {...answer, value:event.target.value})} />}
                {answer.notApplicable && <p className="text-xs text-muted-foreground">{d.notApplicable}</p>}
                {state.keptEdits && currentValue(record, key) && <p className="break-words text-xs text-muted-foreground">{d.savedValue}: {currentValue(record, key)}</p>}
              </div>;
            })}</div>
            {languageReview && !record.namesVerified && <div className="flex items-start gap-2"><Checkbox id="document-names-verified" checked={state.namesVerified} disabled={busy} onCheckedChange={checked => patch({namesVerified:checked === true})} /><Label htmlFor="document-names-verified" className="text-sm leading-relaxed">{d.namesVerified}</Label></div>}
            <div className="flex flex-wrap gap-2"><Button type="submit" variant="outline" disabled={busy}>{d.confirm}</Button><Button type="button" disabled={busy || page.contentDirty} onClick={() => page.confirmAnswers(true)}><Check aria-hidden="true" />{d.confirmContinue}</Button></div>
          </form>}
          {!questionKeys.length && <Button disabled={busy || !state.readiness?.ready || page.contentDirty} onClick={page.generate}><FileText aria-hidden="true" />{d.generate}</Button>}
          {page.contentDirty && <p className="text-sm text-muted-foreground">{d.saveBeforeExport}</p>}
        </CardContent>
      </Card>
      <ContextDetails key={record.id} record={record} lang={lang} disabled={busy} onAdd={updateAnswer} form={state.detailForm} onForm={detailForm => patch({detailForm})} />
      <Card className="paper-card">
        <CardHeader><div className="flex items-center justify-between gap-3"><CardTitle className="paper-title text-xl">{d.issues}</CardTitle><Button variant="outline" size="sm" disabled={busy || Boolean(state.issueForm)} onClick={() => openIssue()}><Plus aria-hidden="true" />{d.addIssue}</Button></div><CardDescription>{d.issuesHint}</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {!record.caseIssues?.length && !state.issueForm && <p className="text-sm text-muted-foreground">{d.noIssues}</p>}
          {(record.caseIssues || []).map(issue => <article key={issue.id} className="space-y-2 rounded-md border border-border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="min-w-0 break-words text-sm font-medium">{issue.question}</h3><Badge variant={issue.status === 'resolved' ? 'secondary' : 'outline'}>{d.statuses[ISSUE_STATUSES.indexOf(issue.status)]}</Badge></div>
            {issue.resolution && <p className="whitespace-pre-wrap break-words text-sm">{issue.resolution}</p>}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{dateLabel(issue.updatedAt, lang)}{issue.sourceMessageId ? ` · ${d.source}: ${issue.sourceMessageId.slice(0, 8)}` : ''}</span><Button variant="ghost" size="sm" disabled={busy || Boolean(state.issueForm)} onClick={() => openIssue(issue)}>{d.edit}</Button></div>
          </article>)}
          {state.issueForm && <form className="space-y-4 rounded-md border border-border p-4" onSubmit={event => {event.preventDefault(); page.saveIssue();}}>
            <div className="space-y-2"><Label htmlFor="document-issue-question">{d.question}</Label><Textarea id="document-issue-question" value={state.issueForm.question} maxLength={500} disabled={busy} onChange={event => updateIssue({question:event.target.value})} required /></div>
            <div className="space-y-2"><Label htmlFor="document-issue-status">{d.issueStatus}</Label><NativeSelect id="document-issue-status" value={state.issueForm.status} disabled={busy} onChange={event => updateIssue({status:event.target.value})}>{ISSUE_STATUSES.map((item, index) => <NativeSelectOption key={item} value={item}>{d.statuses[index]}</NativeSelectOption>)}</NativeSelect></div>
            <div className="space-y-2"><Label htmlFor="document-issue-resolution">{d.resolution}</Label><Textarea id="document-issue-resolution" value={state.issueForm.resolution} maxLength={2000} disabled={busy} required={state.issueForm.status === 'resolved'} onChange={event => updateIssue({resolution:event.target.value})} /></div>
            <MessageSource lang={lang} caseId={caseId} value={state.issueForm.sourceMessageId} onChange={sourceMessageId => updateIssue({sourceMessageId})} conversations={state.conversations} loadMessages={page.sourceMessages} disabled={busy} />
            <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>{d.saveIssue}</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => patch({issueForm:null, issueBaseline:''})}>{d.cancel}</Button></div>
          </form>}
        </CardContent>
      </Card>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <Card className="paper-card min-w-0">
          <CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="paper-title text-xl">{d.preview}</CardTitle>{state.content && <Badge variant="outline">{page.contentDirty ? d.edited : state.selected?.status === 'final' ? d.final : d.draft}</Badge>}</div><CardDescription>{d.previewHint}</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            {state.selected?.isStale && <Alert><AlertTitle>{d.historical}</AlertTitle><AlertDescription>{d.stale}</AlertDescription></Alert>}
            {state.content || state.selected ? <>
              <div className="space-y-2"><Label htmlFor="document-artifact-title">{d.artifactTitle}</Label><Input id="document-artifact-title" value={state.artifactTitle} maxLength={120} disabled={busy} onChange={event => page.editArtifact({artifactTitle:event.target.value})} /></div>
              <div className="space-y-2"><Label htmlFor="document-body">{d.content}</Label><Textarea id="document-body" lang="en" value={state.content} maxLength={50000} rows={24} className="min-h-96 font-serif leading-relaxed" disabled={busy} onChange={event => page.editArtifact({content:event.target.value})} /></div>
              {!isEnglish && <p role="alert" className="text-sm text-destructive">{d.errors.DOCUMENT_ENGLISH_REQUIRED}</p>}
              <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={busy || !state.content || !isEnglish} onClick={page.copy}><Copy aria-hidden="true" />{d.copy}</Button><Button variant="outline" size="sm" disabled={busy || !state.selected || page.contentDirty || !isEnglish} onClick={page.download}><Download aria-hidden="true" />{d.download}</Button><Button variant="outline" size="sm" disabled={busy || !state.selected || page.contentDirty || !isEnglish} onClick={page.print}><Printer aria-hidden="true" />{d.print}</Button></div>
              <Separator />
              <div className="flex flex-wrap items-end gap-3"><div className="space-y-1"><Label htmlFor="document-save-status">{d.saveStatus}</Label><NativeSelect id="document-save-status" value={state.saveStatus} disabled={busy} onChange={event => patch({saveStatus:event.target.value})}><NativeSelectOption value="draft">{d.draft}</NativeSelectOption><NativeSelectOption value="final">{d.final}</NativeSelectOption></NativeSelect></div><Button disabled={busy || !state.content.trim() || !isEnglish} onClick={page.saveArtifact}>{d.saveVersion}</Button></div>
            </> : <p className="py-10 text-center text-sm text-muted-foreground">{d.noPreview}</p>}
          </CardContent>
        </Card>
        <Card className="paper-card min-w-0"><CardHeader><CardTitle className="paper-title text-xl">{d.versions}</CardTitle></CardHeader><CardContent className="space-y-3">
          {!state.artifacts.length && <p className="text-sm text-muted-foreground">{d.noVersions}</p>}
          {state.artifacts.map(artifact => <article key={artifact.id} data-artifact-id={artifact.id} className="space-y-2 border-b border-border pb-3 last:border-0">
            <p className="break-words text-sm font-medium">{artifact.title || d.kinds[DOCUMENT_KINDS.indexOf(artifact.kind)]}</p>
            <div className="flex flex-wrap gap-1"><Badge variant="outline">v{artifact.version} · {artifact.status === 'final' ? d.final : d.draft}</Badge>{artifact.isStale && <Badge variant="secondary">{d.historical}</Badge>}</div>
            <p className="text-xs text-muted-foreground">{dateLabel(artifact.createdAt, lang)}</p>
            <Button variant="ghost" size="sm" disabled={busy || artifact.id === state.selected?.id} onClick={() => openVersion(artifact.id)}>{d.open}</Button>
          </article>)}
        </CardContent></Card>
      </div>
      {state.keptEdits && <details className="rounded-md border border-border p-4"><summary className="cursor-pointer text-sm font-medium">{d.savedMaterial}</summary><pre className="mt-3 whitespace-pre-wrap break-words text-xs text-muted-foreground">{record.sourceText}</pre></details>}
    </>}
    {busy && <p role="status" className="text-sm text-muted-foreground">{d.busy}</p>}
  </div>;
}
