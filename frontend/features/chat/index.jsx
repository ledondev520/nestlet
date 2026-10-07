import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useSession } from '@/lib/session';
import { CHAT_BOUNDS, ChatClientError, buildChatTurn, newCasePayload, normalizeMessages, readChatEvents, restoredMessages, validateImageFile, imageDimensions } from './logic.js';
import { chatCopy, chatErrorText } from './copy.js';

const idValid = value => typeof value === 'string' && /^[0-9a-f-]{36}$/u.test(value);
const timeoutSignal = (signal, milliseconds=15000) => AbortSignal.any([signal,AbortSignal.timeout(milliseconds)]);

/** Durable conversation UI. Case facts and document/source buffers have separate owners. */
export function ChatPage({ lang='zh', caseId=null, onCaseChange, onDirtyChange, onImportFiles }) {
  const { status, api, refresh } = useSession();
  const words = chatCopy[lang] || chatCopy.zh;
  const inputId = useId(), fileId = useId(), consentId = useId(), threadId = useId();
  const [input,setInput] = useState('');
  const [images,setImages] = useState([]);
  const [messages,setMessages] = useState([]);
  const [conversations,setConversations] = useState([]);
  const [conversationId,setConversationId] = useState(null);
  const [title,setTitle] = useState('');
  const [phase,setPhase] = useState('idle');
  const [imagePending,setImagePending] = useState(0);
  const [consent,setConsent] = useState(false);
  const [error,setError] = useState(null);
  const [notice,setNotice] = useState('');
  const [dragging,setDragging] = useState(false);
  const [reloadVersion,setReloadVersion] = useState(0);
  const mounted = useRef(true), epoch = useRef(0), controller = useRef(null), controllers = useRef(new Set());
  const caseRef = useRef(caseId), conversationRef = useRef(null), ownerRef = useRef(status.userId);
  const statusRef = useRef(status), incomingCase = useRef(caseId), adoption = useRef(null), initialized = useRef(false);
  const imageRef = useRef([]), messageRef = useRef([]), inputRef = useRef(''), previewUrls = useRef(new Set());
  const stopRequested = useRef(false), workflowRef = useRef(null), lastTurn = useRef(null), phaseRef = useRef('idle');
  const fileInput = useRef(null), composer = useRef(null), endOfThread = useRef(null);
  statusRef.current = status; incomingCase.current = caseId; inputRef.current=input;
  const busy = phase !== 'idle';
  const dirty = Boolean(input || images.length || imagePending || ['saving','streaming','refreshing'].includes(phase));
  const scoped = () => ({epoch:epoch.current,userId:statusRef.current.userId,caseId:caseRef.current,conversationId:conversationRef.current});
  const current = scope => mounted.current && scope.epoch === epoch.current && statusRef.current.authenticated && scope.userId === statusRef.current.userId && scope.caseId === caseRef.current && scope.conversationId === conversationRef.current &&
    (incomingCase.current === caseRef.current || adoption.current?.id === caseRef.current && incomingCase.current === adoption.current.previousProp);
  const requireCurrent = scope => { if (!current(scope)) throw new DOMException('Context changed','AbortError'); };
  const updatePhase = next => {phaseRef.current=next; setPhase(next);};
  const updateImages = next => {imageRef.current=next; setImages(next);};
  const updateMessages = next => {messageRef.current=next; setMessages(next);};
  const revoke = preview => {if (previewUrls.current.delete(preview)) URL.revokeObjectURL(preview);};
  const revokeMessages = () => {for (const message of messageRef.current) for (const image of message.images || []) revoke(image.preview);};
  const managedController = () => {const next=new AbortController(); controllers.current.add(next); return next;};

  const invalidate = useCallback((nextCaseId, render=true) => {
    epoch.current++;
    for (const active of controllers.current) active.abort(); controllers.current.clear(); controller.current=null;
    for (const preview of previewUrls.current) URL.revokeObjectURL(preview); previewUrls.current.clear();
    caseRef.current=nextCaseId; conversationRef.current=null; adoption.current=null; stopRequested.current=false;
    workflowRef.current=null; lastTurn.current=null; imageRef.current=[]; messageRef.current=[]; inputRef.current=''; phaseRef.current='idle';
    if (render && mounted.current) {setInput('');setImages([]);setMessages([]);setConversationId(null);setConversations([]);setTitle('');setPhase('idle');setImagePending(0);setConsent(false);setError(null);setNotice('');setDragging(false);}
  },[]);

  useEffect(() => {
    mounted.current=true;
    return () => {mounted.current=false; invalidate(null,false);};
  },[invalidate]);
  useEffect(() => {onDirtyChange?.(dirty); return () => onDirtyChange?.(false);},[dirty,onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const guard=event=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);
  },[dirty]);

  async function readConversation(id,scope,signal,{preserveLocal=false}={}) {
    const result=await api.get(`/api/conversations/${encodeURIComponent(id)}`,{signal});requireCurrent(scope);
    if (result.conversation?.id!==id || result.conversation.caseId!==scope.caseId) throw new ChatClientError('INVALID_RESPONSE');
    let rows=normalizeMessages(result.messages);
    if (preserveLocal && lastTurn.current) {
      rows=restoredMessages(result.messages,lastTurn.current.user,lastTurn.current.assistant);
      if (!rows) {setNotice('refreshFailed');return false;}
    }
    revokeMessages();updateMessages(rows);return true;
  }

  useEffect(() => {
    const nextCase=caseId || null;
    if (!status.authenticated) {ownerRef.current=status.userId;initialized.current=false;invalidate(nextCase);return;}
    if (initialized.current && ownerRef.current===status.userId && nextCase===caseRef.current && !reloadVersion) {adoption.current=null;return;}
    if (adoption.current?.id===nextCase && ownerRef.current===status.userId) {adoption.current=null;return;}
    const preserveComposition=initialized.current && ownerRef.current===status.userId && !caseRef.current && nextCase && !conversationRef.current && messageRef.current.length===0 && phaseRef.current==='idle';
    initialized.current=true;ownerRef.current=status.userId;
    if(preserveComposition){
      // App remounts true case switches. A null→ID binding here is the same workspace saved by Intake.
      epoch.current++;for(const active of controllers.current)active.abort();controllers.current.clear();controller.current=null;
      caseRef.current=nextCase;adoption.current=null;workflowRef.current=null;lastTurn.current=null;setImagePending(0);setConsent(false);setError(null);setNotice('');
    } else invalidate(nextCase);
    if (!nextCase) return;
    const scope=scoped(), load=managedController();updatePhase('loading');
    (async()=>{
      try {
        const [record,result]=await Promise.all([api.get(`/api/cases/${encodeURIComponent(nextCase)}`,{signal:timeoutSignal(load.signal)}),api.get(`/api/cases/${encodeURIComponent(nextCase)}/conversations`,{signal:timeoutSignal(load.signal)})]);
        requireCurrent(scope);
        if (record.case?.id!==nextCase || !Array.isArray(result.conversations) || result.conversations.length>10 || result.conversations.some(item=>!idValid(item.id)||item.caseId!==nextCase)) throw new ChatClientError('INVALID_RESPONSE');
        setTitle(record.case.title);setConversations(result.conversations);
        if (result.conversations.length) {
          const id=result.conversations[0].id;conversationRef.current=id;scope.conversationId=id;setConversationId(id);
          await readConversation(id,scope,timeoutSignal(load.signal));
        }
      } catch (failure) {if (current(scope) && failure.name!=='AbortError') setError(failure);}
      finally {controllers.current.delete(load);if(current(scope))updatePhase('idle');}
    })();
    // Identity/case transitions own invalidation; unrelated capability refreshes do not reset drafts.
  },[caseId,status.userId,status.authenticated,reloadVersion,api,invalidate]);

  async function chooseConversation(id) {
    if (dirty && !window.confirm(words.resetAsk)) return;
    const currentCase=caseRef.current, priorConversations=conversations, priorTitle=title;
    invalidate(currentCase);setConversations(priorConversations);setTitle(priorTitle);
    if (!id) return;
    conversationRef.current=id;setConversationId(id);
    const scope=scoped(), load=managedController();controller.current=load;updatePhase('loading');
    try {await readConversation(id,scope,timeoutSignal(load.signal));}
    catch(failure){if(current(scope)&&failure.name!=='AbortError')setError(failure);}
    finally {controllers.current.delete(load);if(current(scope)){controller.current=null;updatePhase('idle');}}
  }

  async function addImages(files) {
    if (!statusRef.current.authenticated || phaseRef.current!=='idle') return;
    const all=Array.from(files || []);if(!all.length)return;
    const scope=scoped(), decode=managedController();setImagePending(count=>count+1);setError(null);
    try {
      for(const file of all){
        requireCurrent(scope);if(imageRef.current.length>=CHAT_BOUNDS.images)throw new ChatClientError('CHAT_TOO_LARGE');validateImageFile(file);
        const bytes=new Uint8Array(await file.arrayBuffer());requireCurrent(scope);imageDimensions(bytes,file.type);
        const bitmap=await createImageBitmap(new Blob([bytes],{type:file.type}));
        const valid=bitmap.width>0&&bitmap.height>0&&bitmap.width<=CHAT_BOUNDS.imageSide&&bitmap.height<=CHAT_BOUNDS.imageSide;bitmap.close();requireCurrent(scope);
        if(!valid)throw new ChatClientError('CHAT_IMAGE_INVALID');
        if(phaseRef.current!=='idle')return;
        let binary='';for(let index=0;index<bytes.length;index+=8192)binary+=String.fromCharCode(...bytes.subarray(index,index+8192));
        if(imageRef.current.length>=CHAT_BOUNDS.images)throw new ChatClientError('CHAT_TOO_LARGE');
        const preview=URL.createObjectURL(file);previewUrls.current.add(preview);
        if(!current(scope)){revoke(preview);return;}
        updateImages([...imageRef.current,{id:crypto.randomUUID(),mimeType:file.type,data:btoa(binary),preview}]);
      }
    } catch(failure){if(current(scope))setError(failure instanceof ChatClientError?failure:new ChatClientError('CHAT_IMAGE_INVALID'));}
    finally{controllers.current.delete(decode);if(current(scope))setImagePending(count=>Math.max(0,count-1));}
  }
  function removeImage(id){const removed=imageRef.current.find(image=>image.id===id);if(removed)revoke(removed.preview);updateImages(imageRef.current.filter(image=>image.id!==id));}
  function receiveFiles(files){
    if(!statusRef.current.authenticated||phaseRef.current!=='idle')return;
    const all=Array.from(files||[]), accepted=all.filter(file=>['image/png','image/jpeg'].includes(file.type));
    const documents=all.filter(file=>!accepted.includes(file)&&/\.(pdf|txt|csv|xlsx|xls)$/iu.test(file.name));
    if(all.length!==accepted.length+documents.length)setNotice('unsupportedFile');
    if(accepted.length)addImages(accepted);
    if(documents.length){if(onImportFiles){onImportFiles(documents,{caseId:caseRef.current,userId:statusRef.current.userId});setNotice('openingDocuments');}else setNotice('documents');}
  }

  async function reloadConversation(){
    if(busy)return;
    if(!conversationRef.current){if(dirty&&!window.confirm(words.resetAsk))return;setReloadVersion(value=>value+1);return;}
    const scope=scoped(), load=managedController();controller.current=load;updatePhase('loading');setError(null);
    try{const restored=await readConversation(scope.conversationId,scope,timeoutSignal(load.signal),{preserveLocal:true});if(restored)setNotice('restored');}
    catch(failure){if(current(scope)&&failure.name!=='AbortError')setError(failure);}
    finally{controllers.current.delete(load);if(current(scope)){controller.current=null;updatePhase('idle');}}
  }

  async function send(event){
    event?.preventDefault();
    if(phaseRef.current!=='idle'||imagePending)return;
    if(!statusRef.current.authenticated){setError(new ChatClientError('AUTH_REQUIRED'));return;}
    if(!statusRef.current.liveEnabled){setError(new ChatClientError('LIVE_DISABLED'));return;}
    if(!consent)return;
    const text=inputRef.current.trim(), attached=[...imageRef.current];
    if(!text&&!attached.length){setError(new ChatClientError('CHAT_EMPTY'));return;}
    if(text.length>CHAT_BOUNDS.text){setError(new ChatClientError('CHAT_TOO_LARGE'));return;}
    const scope=scoped(), active=managedController();controller.current=active;stopRequested.current=false;
    let user=null,assistant=null,completed=false;updatePhase('saving');setError(null);setNotice('');
    try{
      if(!scope.caseId){
        const result=await api.post('/api/cases',newCasePayload(words.untitledCase),{signal:timeoutSignal(active.signal)});requireCurrent(scope);
        if(!idValid(result.case?.id))throw new ChatClientError('INVALID_RESPONSE');
        adoption.current={id:result.case.id,previousProp:incomingCase.current};caseRef.current=result.case.id;scope.caseId=result.case.id;setTitle(result.case.title);
        onCaseChange?.(result.case.id);requireCurrent(scope);
      }
      if(!scope.conversationId){
        const result=await api.post(`/api/cases/${encodeURIComponent(scope.caseId)}/conversations`,{title:words.untitledConversation},{signal:timeoutSignal(active.signal)});requireCurrent(scope);
        if(!idValid(result.conversation?.id)||result.conversation.caseId!==scope.caseId)throw new ChatClientError('INVALID_RESPONSE');
        conversationRef.current=result.conversation.id;scope.conversationId=result.conversation.id;setConversationId(result.conversation.id);setConversations(rows=>[result.conversation,...rows]);
      }
      const clientMessageId=crypto.randomUUID();
      const payload=buildChatTurn({caseId:scope.caseId,conversationId:scope.conversationId,clientMessageId,text,images:attached,lang});
      user={id:crypto.randomUUID(),clientMessageId,role:'user',content:text,images:attached,state:'complete',localOnly:true};
      assistant={id:crypto.randomUUID(),role:'assistant',content:'',state:'interrupted',streaming:true,localOnly:true};
      lastTurn.current={user,assistant};updateMessages([...messageRef.current,user,assistant]);updateImages([]);setInput('');inputRef.current='';updatePhase('streaming');
      const signal=timeoutSignal(active.signal,95000);
      const response=await fetch('/api/chat',{method:'POST',credentials:'same-origin',cache:'no-store',signal,
        headers:{'Content-Type':'application/json',Accept:'text/event-stream','X-CSRF-Token':statusRef.current.csrfToken,...(workflowRef.current?{'X-Workflow-Id':workflowRef.current}:{})},body:JSON.stringify(payload)});
      requireCurrent(scope);
      const returnedWorkflow=response.headers.get('X-Workflow-Id');if(idValid(returnedWorkflow))workflowRef.current=returnedWorkflow;
      if(!response.ok){const result=await response.json().catch(()=>({}));requireCurrent(scope);if(response.status===401)await refresh().catch(()=>{});throw new ChatClientError(result.code||'CHAT_PROVIDER_FAILED');}
      if(!(response.headers.get('content-type')||'').includes('text/event-stream'))throw new ChatClientError('CHAT_STREAM_FAILED');
      for await(const packet of readChatEvents(response.body,signal)){
        requireCurrent(scope);
        if(packet.type==='delta'){assistant.content+=packet.text;updateMessages([...messageRef.current]);}
        else if(packet.type==='conversation'){if(packet.conversationId!==scope.conversationId)throw new ChatClientError('CHAT_STREAM_FAILED');user.id=packet.userMessageId;}
        else if(packet.type==='done'){completed=true;assistant.id=packet.assistantMessageId;assistant.state='complete';assistant.localOnly=false;assistant.streaming=false;user.localOnly=false;updateMessages([...messageRef.current]);}
        else if(packet.type==='error')throw new ChatClientError(packet.code);
      }
      if(!completed)throw new ChatClientError('CHAT_INCOMPLETE');
      setNotice('saved');
    }catch(failure){
      if(!current(scope))return;
      if(assistant){assistant.streaming=false;assistant.state=completed?'complete':stopRequested.current?'interrupted':'failed';updateMessages([...messageRef.current]);}
      if(stopRequested.current)setNotice('stopped');else setError(failure instanceof ChatClientError||failure.code?failure:new ChatClientError(failure.name==='AbortError'||failure.name==='TimeoutError'?'CHAT_INCOMPLETE':'NETWORK_ERROR'));
      if(!user){setInput(text);inputRef.current=text;}
    }finally{
      controllers.current.delete(active);
      if(current(scope)){
        if(assistant)assistant.streaming=false;
        if(user){
          const reload=managedController();controller.current=reload;updatePhase('refreshing');
          try{await readConversation(scope.conversationId,scope,timeoutSignal(reload.signal),{preserveLocal:true});}
          catch{if(current(scope))setNotice('refreshFailed');}
          finally{controllers.current.delete(reload);}
        }
        if(current(scope)){controller.current=null;updatePhase('idle');}
      }
    }
  }
  function retry(){const last=[...messageRef.current].reverse().find(message=>message.role==='user');if(!last)return;setInput(last.content);inputRef.current=last.content;setNotice(last.imageMetadata?.length?'oldImage':'retryNote');setError(null);composer.current?.focus();}
  async function copyMessage(content){const scope=scoped();try{await navigator.clipboard.writeText(content);if(current(scope))setNotice('copied');}catch{if(current(scope))setNotice('copyFailed');}}
  const stop=()=>{stopRequested.current=true;controller.current?.abort();};

  if(!status.authenticated)return <Card className="paper-card"><CardContent><p>{words.signIn}</p></CardContent></Card>;
  return <section className="space-y-5" aria-label={words.title} data-feature="chat">
    <div className="space-y-2"><h1 className="paper-title text-2xl font-semibold">{words.title}</h1><p className="text-sm text-muted-foreground">{words.subtitle}</p></div>
    <Card className="paper-card">
      <CardHeader className="gap-3"><CardTitle className="paper-title">{title||words.untitledCase}</CardTitle><CardDescription>{caseRef.current?words.saved:words.subtitle}</CardDescription>
        <div className="flex flex-wrap items-center gap-3"><Label htmlFor={`${inputId}-conversation`}>{words.conversation}</Label>
          <NativeSelect id={`${inputId}-conversation`} value={conversationId||''} onChange={event=>chooseConversation(event.target.value)} disabled={phase==='loading'} className="min-w-48">
            <NativeSelectOption value="">{words.newConversation}</NativeSelectOption>{conversations.map(item=><NativeSelectOption key={item.id} value={item.id}>{item.title}</NativeSelectOption>)}
          </NativeSelect><Button variant="outline" size="sm" type="button" onClick={()=>chooseConversation('')}>{words.newConversation}</Button>
          <Button variant="ghost" size="sm" type="button" disabled={busy} onClick={reloadConversation}>{words.reload}</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {phase==='loading'&&<p role="status" className="text-sm text-muted-foreground">{words.loading}</p>}
        <div id={threadId} className="space-y-4" aria-live="polite" aria-relevant="additions text">
          {!messages.length&&phase!=='loading'&&<p className="py-8 text-sm text-muted-foreground">{words.empty}</p>}
          {messages.map(message=><article key={message.id} className={`rounded-lg border p-4 ${message.role==='user'?'bg-muted/40':'bg-card'}`} aria-label={message.role==='user'?words.you:words.assistant}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{message.role==='user'?words.you:words.assistant}</span>{message.role==='assistant'&&message.content&&<Button type="button" variant="ghost" size="xs" onClick={()=>copyMessage(message.content)}>{words.copy}</Button>}</div>
            {!!message.images?.length&&<div className="mb-3 flex flex-wrap gap-2">{message.images.map(image=><img key={image.id} src={image.preview} alt={words.imageOnly} className="h-24 w-24 rounded border object-contain" />)}</div>}
            {!!message.imageMetadata?.length&&<p className="mb-2 text-xs text-muted-foreground">{words.oldImage}</p>}
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content}{message.streaming&&<span aria-hidden="true"> ▍</span>}</p>
            {!message.streaming&&message.state!=='complete'&&<Badge variant="outline" className="mt-3 whitespace-normal text-destructive">{words.incomplete}</Badge>}
            {message.localOnly&&!message.streaming&&<p className="mt-2 text-xs text-muted-foreground">{words.localOnly}</p>}
          </article>)}
          <div ref={endOfThread}/>
        </div>
        {error&&<Alert variant="destructive"><AlertDescription>{chatErrorText(error,lang)}</AlertDescription></Alert>}
        {notice&&<p role="status" className="paper-note rounded px-3 py-2 text-sm">{words[notice]}</p>}
        {(error||notice==='stopped')&&messages.some(message=>message.role==='user')&&<Button variant="outline" type="button" disabled={busy} onClick={retry}>{words.retry}</Button>}
        <form className="space-y-3 border-t pt-5" onSubmit={send} onDragOver={event=>{event.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={event=>{event.preventDefault();setDragging(false);receiveFiles(event.dataTransfer.files);}}>
          <Label htmlFor={inputId}>{words.composer}</Label>
          <Textarea ref={composer} id={inputId} value={input} maxLength={CHAT_BOUNDS.text} disabled={busy} className={`min-h-32 resize-y ${dragging?'ring-2 ring-ring':''}`} placeholder={words.placeholder}
            onChange={event=>{inputRef.current=event.target.value;setInput(event.target.value);}}
            onPaste={event=>{const files=Array.from(event.clipboardData.files||[]);if(files.length){event.preventDefault();const text=event.clipboardData.getData('text/plain');if(text){const next=(inputRef.current+text).slice(0,CHAT_BOUNDS.text);inputRef.current=next;setInput(next);}receiveFiles(files);}}}/>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{input.length.toLocaleString(lang==='zh'?'zh-CN':'en-US')} / 8,000</span>{imagePending>0&&<span role="status">{words.decoding}</span>}</div>
          {!!images.length&&<div className="flex flex-wrap gap-3">{images.map(image=><div key={image.id} className="flex items-center gap-2 rounded border p-2"><img src={image.preview} alt={words.imageOnly} className="h-16 w-16 object-contain"/><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={()=>removeImage(image.id)} aria-label={words.remove}>{words.remove}</Button></div>)}</div>}
          <div className="flex items-start gap-2"><Checkbox id={consentId} checked={consent} disabled={busy} onCheckedChange={value=>setConsent(value===true)}/><Label htmlFor={consentId} className="text-xs leading-relaxed">{words.consent}</Label></div>
          <div className="flex flex-wrap items-center gap-2"><Button type="submit" disabled={busy||imagePending>0||!consent||!status.liveEnabled||(!input.trim()&&!images.length)}>{words.send}</Button>
            <Button type="button" variant="outline" disabled={busy} onClick={()=>fileInput.current?.click()}>{words.attach}</Button>
            {busy&&phase!=='loading'&&<Button type="button" variant="secondary" onClick={stop}>{words.stop}</Button>}
            <input id={fileId} ref={fileInput} className="sr-only" type="file" accept="image/png,image/jpeg,.pdf,.txt,.csv,.xlsx,.xls" multiple onChange={event=>{receiveFiles(event.target.files);event.target.value='';}}/>
          </div>
          {['saving','streaming','refreshing'].includes(phase)&&<p role="status" className="text-xs text-muted-foreground">{phase==='saving'?words.saving:phase==='streaming'?words.sending:words.loading}</p>}
          {!status.liveEnabled&&<p className="text-sm text-destructive">{words.unavailable}</p>}
          <p className="text-xs leading-relaxed text-muted-foreground">{words.privacy}</p><p className="text-xs leading-relaxed text-muted-foreground">{words.documents}</p>
        </form>
      </CardContent>
    </Card>
  </section>;
}
