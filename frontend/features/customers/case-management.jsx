import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useScopedMutation } from './hooks';

const copy = {
  zh: {title:'管理事项', name:'事项名称', customer:'关联客户', none:'暂不关联', save:'保存修改', cancel:'取消', loading:'正在加载…', retry:'重新载入', delete:'删除事项', confirm:'确认删除', busy:'正在处理…', warning:'将删除本事项、对话和文档版本。\n本事项未保存的输入也会清除。\n已存原件保留，可在「全部原件」查看。\n已下载文件和备份不会被清除。\n此操作无法在页面撤销。', failed:'未确认操作结果。\n请重新载入，核对后再操作。', conflict:'事项已在别处更新。\n请重新载入后核对。', gone:'事项已删除或无法访问。', close:'返回列表', hint:'客户称呼仅用于整理事项。\n不会写入文档收件人或已确认事实。'},
  en: {title:'Manage case', name:'Case title', customer:'Customer', none:'Unassigned', save:'Save changes', cancel:'Cancel', loading:'Loading…', retry:'Reload case', delete:'Delete case', confirm:'Confirm deletion', busy:'Working…', warning:'Deletes this case, its conversations and document versions, including unsaved input in this workspace. Saved original files remain in All originals. Downloaded files and backups are not erased. This cannot be undone in this page.', failed:'The outcome is not confirmed. Reload and check before trying again.', conflict:'This case changed elsewhere. Reload and review before continuing.', gone:'This case was deleted or is no longer accessible.', close:'Back to list', hint:'Customer labels organize cases. They do not change document recipients or confirmed facts.'}
};
const editableKeys = ['sourceText','fields','draftType','draftText','extractionMode','namesVerified'];

/** The current canonical version is reviewed before a write. Never replay an uncertain mutation. */
export function CaseManagement({api, caseId, lang='zh', suggestedClientId, onDone, onCancel}) {
  const t=copy[lang==='en'?'en':'zh'], id=useId(), mutation=useScopedMutation(), nameInput=useRef(null);
  const [loaded,setLoaded]=useState(null),[readError,setReadError]=useState(null),[revision,setRevision]=useState(0);
  const [title,setTitle]=useState(''),[clientId,setClientId]=useState(''),[deleting,setDeleting]=useState(false);
  const current=useRef(caseId);current.current=caseId;
  useEffect(()=>{
    const controller=new AbortController();
    const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(15000)]);setLoaded(null);setReadError(null);setDeleting(false);
    Promise.all([api.get(`/api/cases/${caseId}`,{signal}),api.get('/api/clients?limit=100',{signal})]).then(([result,directory])=>{
      if(controller.signal.aborted||current.current!==caseId)return;
      if(result.case?.id!==caseId||!Number.isSafeInteger(result.case.version)||!Array.isArray(directory.clients))throw {code:'INVALID_RESPONSE'};
      setLoaded({record:result.case,clients:directory.clients});setTitle(result.case.title);setClientId(suggestedClientId??result.case.clientId??'');
    }).catch(error=>{if(!controller.signal.aborted)setReadError(error);});
    return()=>controller.abort();
  },[api,caseId,revision,suggestedClientId]);
  useEffect(()=>{if(loaded)nameInput.current?.focus();},[loaded]);
  const error=readError||mutation.error, blocked=mutation.pending||!loaded||Boolean(error);
  function reload(){mutation.clearError();setRevision(value=>value+1);}
  function save(event){
    event.preventDefault();if(blocked||!title.trim()||title.trim().length>120)return;
    const payload=Object.fromEntries(editableKeys.filter(key=>Object.hasOwn(loaded.record,key)).map(key=>[key,loaded.record[key]]));
    mutation.run(signal=>api.put(`/api/cases/${caseId}`,{...payload,title:title.trim(),clientId:clientId||null,expectedVersion:loaded.record.version},{signal}),result=>{
      if(result.case?.id===caseId)onDone?.({case:result.case});else throw {code:'INVALID_RESPONSE'};
    });
  }
  function remove(){if(blocked)return;mutation.run(signal=>api.delete(`/api/cases/${caseId}`,{expectedVersion:loaded.record.version},{signal}),result=>{
    if(result.deleted===true)onDone?.({deleted:caseId});else throw {code:'INVALID_RESPONSE'};
  });}
  return <section aria-label={t.title} className="w-full space-y-4 rounded-lg border bg-background p-4">
    <h3 className="font-medium">{t.title}</h3>
    {!loaded&&!readError&&<p role="status">{t.loading}</p>}
    {error&&<div role="alert" className="space-y-2 text-sm"><p className="whitespace-pre-line">{error.status===404?t.gone:error.code==='CASE_CONFLICT'?t.conflict:t.failed}</p><Button type="button" variant="outline" disabled={mutation.pending} onClick={error.status===404?()=>onDone?.({deleted:caseId}):reload}>{error.status===404?t.close:t.retry}</Button></div>}
    {loaded&&<form onSubmit={save} className="space-y-3">
      <div className="space-y-2"><Label htmlFor={`${id}-name`}>{t.name}</Label><Input ref={nameInput} id={`${id}-name`} value={title} maxLength={120} disabled={blocked||deleting} onChange={event=>setTitle(event.target.value)}/></div>
      <div className="space-y-2"><Label htmlFor={`${id}-customer`}>{t.customer}</Label><NativeSelect id={`${id}-customer`} value={clientId} disabled={blocked||deleting} onChange={event=>setClientId(event.target.value)}><NativeSelectOption value="">{t.none}</NativeSelectOption>{loaded.clients.map(client=><NativeSelectOption key={client.id} value={client.id}>{client.displayName} · {client.displayId||client.id}</NativeSelectOption>)}</NativeSelect><p className="whitespace-pre-line text-xs text-muted-foreground">{t.hint}</p></div>
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={blocked||deleting||!title.trim()}>{mutation.pending?t.busy:t.save}</Button><Button type="button" variant="ghost" disabled={mutation.pending} onClick={onCancel}>{t.cancel}</Button></div>
    </form>}
    <div className="space-y-3 border-t pt-3"><p className="whitespace-pre-line text-xs text-muted-foreground">{t.warning}</p>{deleting&&<p className="break-words text-sm font-medium">{loaded.record.title}</p>}<Button type="button" variant={deleting?'destructive':'outline'} disabled={blocked} onClick={deleting?remove:()=>setDeleting(true)}>{deleting?t.confirm:t.delete}</Button>{deleting&&<Button type="button" variant="ghost" disabled={mutation.pending} onClick={()=>setDeleting(false)}>{t.cancel}</Button>}</div>
  </section>;
}
