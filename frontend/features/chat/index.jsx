import { serviceAvailabilityError } from './service-availability.js';
import { ConversationOpening } from './opening.jsx';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ArrowUp, Paperclip, Plus, RefreshCw, Square } from 'lucide-react';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useSession } from '@/lib/session';
import { useSuspendedDraft } from '@/lib/suspended-draft';
import {pendingTurns,turnSnapshot,restoredTurn,reconcilePendingTurns} from './recovery.js';
import { CHAT_BOUNDS, ChatClientError, buildChatTurn, newCasePayload, normalizeMessages, readChatEvents, restoredMessages, validateImageFile, imageDimensions } from './logic.js';
import { chatCopy, chatErrorText, libraryActivityText } from './copy.js';
import { caseWriteDefinitelyRejected } from '@/lib/conversation-handoff';
import { ChatCaseWorkflow } from './case-workflow.jsx';
import { ChatMessageActions } from './message-actions.jsx';
import { AssistantMarkdown } from './assistant-markdown.jsx';
import { ConversationActionReview } from './conversation-actions.jsx';
import { proposalMatchesScope } from './conversation-actions.js';
import { ChatOriginalRetention } from './original-retention.jsx';
import { ChatLookup } from './lookup.jsx';
import { ChatSourceNavigation } from './source-navigation.jsx';
import { sourceNavigationCopy } from './source-navigation.js';
import { LibraryPermissionDialog, useLibraryPermission } from './library-permission.jsx';

const idValid = value => typeof value === 'string' && /^[0-9a-f-]{36}$/u.test(value);
const timeoutSignal = (signal, milliseconds=15000) => AbortSignal.any([signal,AbortSignal.timeout(milliseconds)]);

/** Durable conversation UI. Case facts and document/source buffers have separate owners. */
export function ChatPage({ lang='zh', caseId=null, initialConversationId=null, conversationIndex=null, onOpenConversation, onConversationChange, onHistoryChange, onNewConversation, guidanceAgency='unknown', onCaseChange, onDirtyChange, onImportFiles, onReviewMessage, onOpenMaterials, onOpenDocuments, onOpenSourceCase, active = true, workflowTarget = null, lookupTarget = null }) {
  const { status, api, refresh } = useSession();
  const {restored,saveDraft,clearDraft,cacheStatus}=useSuspendedDraft('chat');
  const words = chatCopy[lang] || chatCopy.zh;
  const permission = useLibraryPermission({api,userId:status.userId,authenticated:status.authenticated});
  const [permissionPrompt,setPermissionPrompt] = useState(false), [permissionFailure,setPermissionFailure] = useState(null);
  const permissionPending = useRef(null), permissionGate = useRef(false), permissionFlow = useRef(0), activeRef = useRef(active);
  activeRef.current=active;
  const inputId = useId(), fileId = useId(), threadId = useId();
  const [input,setInput] = useState('');
  const [images,setImages] = useState([]);
  const [messages,setMessages] = useState([]);
  const [conversations,setConversations] = useState([]);
  const [conversationId,setConversationId] = useState(null);
  const [title,setTitle] = useState('');
  const [unavailableExactConversation,setUnavailableExactConversation] = useState(false);
  const unavailableExactRef=useRef(false);
  const markExactUnavailable=value=>{unavailableExactRef.current=value;setUnavailableExactConversation(value);};
  const [phase,setPhase] = useState('idle');
  const [imagePending,setImagePending] = useState(0);
  const [actionBatch,setActionBatch] = useState(null);
  const [actionRevision,setActionRevision] = useState(0);
  const [libraryActivity,setLibraryActivity] = useState(null);
  const [librarySources,setLibrarySources] = useState(null);
  const [error,setError] = useState(null);
  const [notice,setNotice] = useState('');
  const [recoveryUnavailable,setRecoveryUnavailable]=useState(false);
  const [dragging,setDragging] = useState(false);
  const [reloadVersion,setReloadVersion] = useState(0);
  const [retentionBusy,setRetentionBusy] = useState(false);
  const retentionRef = useRef(false);
  const updateRetentionBusy = useCallback(value => { retentionRef.current = value; setRetentionBusy(value); }, []);
  const [sourceBusy,setSourceBusy] = useState(false);
  const sourceOperation = useRef(null), sourceSequence = useRef(0);
  const [bridgeBusy,setBridgeBusy] = useState(false);
  const bridgeOperation = useRef(null), bridgeSequence = useRef(0), caseCreation = useRef(null);
  const restoredApplied=useRef(false), restoreConversation=useRef(null), pendingSendText=useRef(''),earlierTurns=useRef([]);
  const mounted = useRef(true), epoch = useRef(0), controller = useRef(null), controllers = useRef(new Set());
  const caseRef = useRef(caseId), conversationRef = useRef(null), ownerRef = useRef(status.userId);
  const statusRef = useRef(status), incomingCase = useRef(caseId), adoption = useRef(null), initialized = useRef(false);
  const decodeBusy = useRef(false);
  const imageRef = useRef([]), messageRef = useRef([]), inputRef = useRef(''), previewUrls = useRef(new Set());
  const stopRequested = useRef(false), workflowRef = useRef(null), lastTurn = useRef(null), phaseRef = useRef('idle');
  const fileInput = useRef(null), composer = useRef(null), endOfThread = useRef(null);
  statusRef.current = status; incomingCase.current = caseId; inputRef.current=input;
  const busy = phase !== 'idle' || bridgeBusy || retentionBusy || sourceBusy || permission.busy || permissionPrompt;
  const dirty = Boolean(input || images.length || imagePending || messages.some(message=>message.role==='assistant'&&message.localOnly&&message.content) || bridgeBusy || retentionBusy || ['saving','streaming','refreshing'].includes(phase));
  const scoped = () => ({epoch:epoch.current,userId:statusRef.current.userId,caseId:caseRef.current,conversationId:conversationRef.current});
  const current = scope => mounted.current && scope.epoch === epoch.current && statusRef.current.authenticated && scope.userId === statusRef.current.userId && scope.caseId === caseRef.current && scope.conversationId === conversationRef.current &&
    (incomingCase.current === caseRef.current || adoption.current?.id === caseRef.current && incomingCase.current === adoption.current.previousProp);
  const requireCurrent = scope => { if (!current(scope)) throw new DOMException('Context changed','AbortError'); };
  const updatePhase = next => {phaseRef.current=next; setPhase(next);};
  const updateImages = next => {imageRef.current=next; setImages(next);};
  const updateMessages = next => {messageRef.current=next; setMessages(next);retainComposition();};
  const revoke = preview => {if (previewUrls.current.delete(preview)) URL.revokeObjectURL(preview);};
  const revokeMessages = () => {for (const message of messageRef.current) for (const image of message.images || []) revoke(image.preview);};
  const claimBridgeOperation = () => {
    if (phaseRef.current !== 'idle' || bridgeOperation.current || sourceOperation.current || retentionRef.current || !statusRef.current.authenticated) return null;
    const token = ++bridgeSequence.current; bridgeOperation.current = token; setBridgeBusy(true); return token;
  };
  const releaseBridgeOperation = token => { if (bridgeOperation.current === token) { bridgeOperation.current = null; if (mounted.current) setBridgeBusy(false); } };
  const claimSourceOperation = () => {
    if (phaseRef.current !== 'idle' || bridgeOperation.current || sourceOperation.current || retentionRef.current || decodeBusy.current || !statusRef.current.authenticated) return null;
    const token = ++sourceSequence.current; sourceOperation.current = token; setSourceBusy(true); return token;
  };
  const releaseSourceOperation = token => { if (sourceOperation.current === token) { sourceOperation.current = null; if (mounted.current) setSourceBusy(false); } };
  const managedController = () => {const next=new AbortController(); controllers.current.add(next); return next;};

  const invalidate = useCallback((nextCaseId, render=true) => {
    epoch.current++;
    permissionPending.current=null;permissionGate.current=false;if(render&&mounted.current){setPermissionPrompt(false);setPermissionFailure(null);}
    sourceOperation.current = null; if (render && mounted.current) setSourceBusy(false);
    bridgeOperation.current = null; retentionRef.current = false; caseCreation.current = null; if (render && mounted.current) { setBridgeBusy(false); setRetentionBusy(false); }
    for (const active of controllers.current) active.abort(); controllers.current.clear(); controller.current=null;
    for (const preview of previewUrls.current) URL.revokeObjectURL(preview); previewUrls.current.clear();
    unavailableExactRef.current=false;if(render&&mounted.current)setUnavailableExactConversation(false);
    caseRef.current=nextCaseId; conversationRef.current=null; adoption.current=null; stopRequested.current=false;
    workflowRef.current=null; lastTurn.current=null; earlierTurns.current=[];pendingSendText.current=''; decodeBusy.current=false; imageRef.current=[]; messageRef.current=[]; inputRef.current=''; phaseRef.current='idle';
    if (render && mounted.current) {setInput('');setImages([]);setMessages([]);setConversationId(null);setConversations([]);setTitle('');setPhase('idle');setImagePending(0);setActionBatch(null);setLibraryActivity(null);setLibrarySources(null);setError(null);setNotice('');setRecoveryUnavailable(false);setDragging(false);}
  },[]);

  useEffect(() => {
    mounted.current=true;
    return () => {mounted.current=false; invalidate(null,false);};
  },[invalidate]);
  useEffect(()=>{permissionFlow.current++;if(!active){permissionPending.current=null;setPermissionPrompt(false);setPermissionFailure(null);}},[active]);
  useEffect(() => {onDirtyChange?.(dirty); return () => onDirtyChange?.(false);},[dirty,onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const guard=event=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);
  },[dirty]);

  function retainComposition(){
    const text=inputRef.current||pendingSendText.current,scopeConversation=conversationRef.current||restoreConversation.current;
    // Bounded text-only recovery, never images/cards/capabilities. Existing byte
    // limits reject excess copies visibly rather than silently evicting a reply.
    const turns=scopeConversation?pendingTurns(earlierTurns.current,lastTurn.current):[];
    if(text||turns.length)saveDraft({input:text,...(scopeConversation?{conversationId:scopeConversation}:{}),
      ...(turns.length?{pendingTurn:turnSnapshot(turns.at(-1))}:{}),...(turns.length>1?{earlierTurns:turns.slice(0,-1).map(turnSnapshot)}:{})});else clearDraft();
  }
  function restoreComposer(){
    if(restoredApplied.current)return;restoredApplied.current=true;
    if(typeof restored?.input==='string'&&restored.input.length<=CHAT_BOUNDS.text){inputRef.current=restored.input;setInput(restored.input);if(restored.input)setNotice('draftRestored');}
    if(idValid(restored?.conversationId)){
      restoreConversation.current=restored.conversationId;
      const turn=restored.pendingTurn;
      if(turn){
        earlierTurns.current=[...(restored.earlierTurns||[]),turn].map(restoredTurn);lastTurn.current=earlierTurns.current.at(-1);
        pendingSendText.current=turn.question;setRecoveryUnavailable(true);
        // Keep recovery copies visible until their original history reconciles.
        messageRef.current=earlierTurns.current.flatMap(item=>[item.user,item.assistant]);setMessages(messageRef.current);setNotice('replyRestored');
      }
    }
  }
  async function readConversation(id,scope,signal,{preserveLocal=false}={}) {
    const result=await api.get(`/api/conversations/${encodeURIComponent(id)}`,{signal});requireCurrent(scope);
    if (result.conversation?.id!==id || result.conversation.caseId!==scope.caseId) throw new ChatClientError('INVALID_RESPONSE');
    let rows=normalizeMessages(result.messages);setRecoveryUnavailable(false);
    const canonicalTitle=typeof result.conversation.title==='string'&&result.conversation.title||words.title;
    setTitle(canonicalTitle);setConversations(items=>items.map(item=>item.id===id?{...item,title:canonicalTitle}:item));
    if(preserveLocal)onHistoryChange?.();
    if (preserveLocal && lastTurn.current) {
      rows=restoredMessages(result.messages,lastTurn.current.user,lastTurn.current.assistant);
      if (!rows) {if(pendingSendText.current&&!inputRef.current){setInput(pendingSendText.current);inputRef.current=pendingSendText.current;}setNotice('refreshFailed');if(!lastTurn.current.assistant.content)return false;}
    }
    const currentTurn=lastTurn.current;
    const reconciled=reconcilePendingTurns(result.messages,pendingTurns(earlierTurns.current,currentTurn));
    rows=reconciled.messages;earlierTurns.current=reconciled.remaining;
    if(currentTurn&&reconciled.completed.includes(currentTurn.user.clientMessageId))setError(previous=>previous?.code==='CHAT_SAVE_FAILED'?null:previous);
    if(!reconciled.remaining.length)setNotice(previous=>previous==='replyRestored'?'':previous);
    if(preserveLocal&&currentTurn&&rows.some(message=>message.clientMessageId===currentTurn.user.clientMessageId)){
      pendingSendText.current='';if(!reconciled.remaining.includes(currentTurn))lastTurn.current=null;
    }
    revokeMessages();updateMessages(rows);markExactUnavailable(false);return true;
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
      permissionPending.current=null;setPermissionPrompt(false);setPermissionFailure(null);
      epoch.current++;for(const active of controllers.current)active.abort();controllers.current.clear();controller.current=null;
      caseRef.current=nextCase;adoption.current=null;workflowRef.current=null;lastTurn.current=null;decodeBusy.current=false;setImagePending(0);setActionBatch(null);setLibraryActivity(null);setLibrarySources(null);setError(null);setNotice('');
    } else invalidate(nextCase);
    restoreComposer();
    if (!nextCase) return;
    const recoveredId=lastTurn.current&&restoreConversation.current,targetId=recoveredId||initialConversationId;
    if(targetId){conversationRef.current=targetId;setConversationId(targetId);if(!recoveredId)markExactUnavailable(true);}
    const scope=scoped(), load=managedController();updatePhase('loading');
    (async()=>{
      try {
        const [record,result]=await Promise.all([api.get(`/api/cases/${encodeURIComponent(nextCase)}`,{signal:timeoutSignal(load.signal)}),api.get(`/api/cases/${encodeURIComponent(nextCase)}/conversations`,{signal:timeoutSignal(load.signal)})]);
        requireCurrent(scope);
        if (record.case?.id!==nextCase || !Array.isArray(result.conversations) || result.conversations.length>10 || result.conversations.some(item=>!idValid(item.id)||item.caseId!==nextCase)) throw new ChatClientError('INVALID_RESPONSE');
        setConversations(result.conversations);
        if(!recoveredId&&initialConversationId&&!result.conversations.some(item=>item.id===initialConversationId))throw new ChatClientError('CONVERSATION_NOT_FOUND');
        if (result.conversations.length||targetId) {
          // Pending recovered replies remain bound to their original conversation,
          // while explicit exact links must never fall back to another/new thread.
          const id=targetId||result.conversations.find(item=>item.id===restoreConversation.current)?.id||result.conversations[0].id;
          if(recoveredId&&!result.conversations.some(item=>item.id===id))setConversations([...result.conversations,{id,caseId:nextCase,title:words.recoveredConversation}]);
          restoreConversation.current=null;conversationRef.current=id;scope.conversationId=id;setConversationId(id);
          await readConversation(id,scope,timeoutSignal(load.signal),{preserveLocal:Boolean(lastTurn.current)});
        }
      } catch (failure) {if (current(scope) && failure.name!=='AbortError') setError(failure);}
      finally {controllers.current.delete(load);if(current(scope))updatePhase('idle');}
    })();
    // Identity/case transitions own invalidation; unrelated capability refreshes do not reset drafts.
  },[caseId,status.userId,status.authenticated,reloadVersion,api,invalidate]);

  useEffect(()=>{
    if(!restoredApplied.current||!status.authenticated)return;
    retainComposition();
  },[input,conversationId,status.authenticated,saveDraft,clearDraft]);

  useEffect(()=>{onConversationChange?.(conversationId);},[conversationId,onConversationChange]);

  // Titles are generated separately from the primary reply. These two bounded
  // metadata reads never resend a turn or replace the visible transcript/draft.
  useEffect(()=>{
    if(phase!=='idle'||!conversationId||!['Conversation','Case conversation','案例会话','新对话','New conversation','对话'].includes(title)||!messages.some(message=>message.role==='assistant'&&message.state==='complete'))return;
    const scope=scoped(),read=managedController();
    let finished=false;
    const timers=[1000,5000].map(delay=>setTimeout(async()=>{
      if(finished||!current(scope))return;
      try{
        const result=await api.get(`/api/conversations/${encodeURIComponent(scope.conversationId)}`,{signal:timeoutSignal(read.signal)});
        if(finished||read.signal.aborted||!current(scope)||result.conversation?.id!==scope.conversationId||result.conversation.caseId!==scope.caseId)return;
        const next=result.conversation.title;
        if(typeof next==='string'&&next&&next.length<=120&&next!==title){finished=true;setTitle(next);setConversations(rows=>rows.map(row=>row.id===scope.conversationId?{...row,title:next}:row));onHistoryChange?.();}
      }catch{/* Optional title refresh never changes the successful reply state. */}
    },delay));
    return()=>{finished=true;timers.forEach(clearTimeout);read.abort();controllers.current.delete(read);};
  },[conversationId,title,phase,api]);

  async function chooseConversation(id) {
    if(id&&id===conversationRef.current)return;
    if (retentionRef.current || bridgeOperation.current || sourceOperation.current) return;
    if (dirty && !window.confirm(words.resetAsk)) return;
    const currentCase=caseRef.current, priorConversations=conversations, priorTitle=title;
    invalidate(currentCase);setConversations(priorConversations);setTitle(priorTitle);
    if (!id) {setTitle('');return;}
    conversationRef.current=id;setConversationId(id);
    const scope=scoped(), load=managedController();controller.current=load;updatePhase('loading');
    try {await readConversation(id,scope,timeoutSignal(load.signal));}
    catch(failure){if(current(scope)&&failure.name!=='AbortError')setError(failure);}
    finally {controllers.current.delete(load);if(current(scope)){controller.current=null;updatePhase('idle');}}
  }

  async function ensureCase(signal) {
    const scope = scoped(); requireCurrent(scope);
    if (scope.caseId) return { caseId: scope.caseId, userId: scope.userId };
    if (caseCreation.current) throw new ChatClientError(caseCreation.current === 'uncertain' ? 'CASE_SAVE_UNCERTAIN' : 'CHAT_CONVERSATION_BUSY');
    caseCreation.current = 'saving';
    try {
      const result = await api.post('/api/cases', newCasePayload(words.untitledCase), { signal: timeoutSignal(signal) });
      requireCurrent(scope);
      if (!idValid(result.case?.id)) throw new ChatClientError('INVALID_RESPONSE');
      adoption.current = { id: result.case.id, previousProp: incomingCase.current };
      caseRef.current = result.case.id; scope.caseId = result.case.id;
      caseCreation.current = null;
      onCaseChange?.(result.case.id); requireCurrent(scope);
      return { caseId: result.case.id, userId: scope.userId };
    } catch (failure) {
      if (current(scope)) {
        const uncertain = !caseWriteDefinitelyRejected(failure);
        caseCreation.current = uncertain ? 'uncertain' : null;
        if (uncertain) { const error = new ChatClientError('CASE_SAVE_UNCERTAIN'); setError(error); throw error; }
      }
      throw failure;
    }
  }

  async function addImages(files) {
    if (!statusRef.current.authenticated || phaseRef.current!=='idle' || bridgeOperation.current || sourceOperation.current || retentionRef.current) return;
    const all=Array.from(files || []);if(!all.length)return;
    if(decodeBusy.current){setError(new ChatClientError('CHAT_IMAGE_BUSY'));return;}decodeBusy.current=true;
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
        updateImages([...imageRef.current,{id:crypto.randomUUID(),mimeType:file.type,data:btoa(binary),preview,originalFile:file,originalFilename:file.name}]);
      }
    } catch(failure){if(current(scope))setError(failure instanceof ChatClientError?failure:new ChatClientError('CHAT_IMAGE_INVALID'));}
    finally{controllers.current.delete(decode);if(current(scope)){decodeBusy.current=false;setImagePending(count=>Math.max(0,count-1));}}
  }
  function removeImage(id){if (retentionRef.current || bridgeOperation.current || sourceOperation.current || phaseRef.current !== 'idle') return;const removed=imageRef.current.find(image=>image.id===id);if(removed)revoke(removed.preview);updateImages(imageRef.current.filter(image=>image.id!==id));}
  function receiveFiles(files){
    if(!statusRef.current.authenticated){setError(new ChatClientError('AUTH_REQUIRED'));return;}
    if(unavailableExactRef.current||phaseRef.current!=='idle'||bridgeOperation.current||sourceOperation.current||retentionRef.current){setError(new ChatClientError('CHAT_CONVERSATION_BUSY'));return;}
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

  const factReplyTarget=useRef(null);
  const registerFactReply=useCallback(target=>{factReplyTarget.current=target;},[]);

  function closePermission(){
    if(permission.busy)return;permissionPending.current=null;setPermissionPrompt(false);setPermissionFailure(null);
  }
  async function refreshPermission(){
    const pending=permissionPending.current;if(!pending||permission.busy)return;
    try{const next=await permission.load();if(permissionPending.current===pending&&current(pending.scope)){pending.snapshot=next;setPermissionFailure(null);}}catch(failure){if(permissionPending.current===pending&&current(pending.scope))setPermissionFailure(failure);}
  }
  async function choosePermission(decision){
    const pending=permissionPending.current;if(!pending||permission.busy||!current(pending.scope))return;
    try{
      const next=await permission.choose(decision,pending.snapshot);
      if(permissionPending.current!==pending||!current(pending.scope))return;
      permissionPending.current=null;setPermissionPrompt(false);setPermissionFailure(null);
      await send(null,next);
    }catch(failure){
      if(permissionPending.current!==pending||!current(pending.scope))return;
      setPermissionFailure(failure);
      if(failure.code==='LIBRARY_PERMISSION_CONFLICT')try{pending.snapshot=await permission.load();}catch{}
    }
  }
  function sendWithoutLibrary(){
    const pending=permissionPending.current;if(!pending||permission.busy||!current(pending.scope))return;
    permissionPending.current=null;setPermissionPrompt(false);setPermissionFailure(null);void send(null,{decision:'deny'});
  }
  async function send(event,permissionSnapshot){
    event?.preventDefault();
    if(unavailableExactRef.current||recoveryUnavailable||phaseRef.current!=='idle'||bridgeOperation.current||sourceOperation.current||retentionRef.current||imagePending||permissionGate.current||permissionPending.current&&!permissionSnapshot)return;
    if(!statusRef.current.authenticated){setError(new ChatClientError('AUTH_REQUIRED'));return;}
    const serviceFailure=serviceAvailabilityError(statusRef.current);
    if(serviceFailure){setError(new ChatClientError(serviceFailure));return;}
    const targeted=factReplyTarget.current;
    if(targeted&&targeted.scope===`${statusRef.current.userId}:${caseRef.current}:${conversationRef.current}`){
      // Only direct, attachment-free human text is routed to the visible question.
      if(imageRef.current.length){setError(new ChatClientError('CHAT_INVALID'));return;}
      const original=inputRef.current;
      if(await targeted.submit(original)) { if(inputRef.current===original){inputRef.current='';setInput('');} }
      return;
    }
    if(!statusRef.current.liveEnabled){setError(new ChatClientError('LIVE_DISABLED'));return;}
    const text=inputRef.current.trim(), attached=[...imageRef.current];
    if(!text&&!attached.length){setError(new ChatClientError('CHAT_EMPTY'));return;}
    if(text.length>CHAT_BOUNDS.text){setError(new ChatClientError('CHAT_TOO_LARGE'));return;}
    if(statusRef.current.libraryRetrievalEnabled===true&&!permissionSnapshot){
      const initialScope=scoped(), flow=permissionFlow.current;permissionGate.current=true;
      try{
        permissionSnapshot=await permission.load();requireCurrent(initialScope);
        if(!activeRef.current||flow!==permissionFlow.current)return;
        if(permissionSnapshot.decision==='unset'){
          permissionPending.current={scope:initialScope,snapshot:permissionSnapshot};setPermissionFailure(null);setPermissionPrompt(true);return;
        }
      }catch(failure){
        if(current(initialScope)&&activeRef.current&&flow===permissionFlow.current){
          permissionPending.current={scope:initialScope,snapshot:null};setPermissionFailure(failure);setPermissionPrompt(true);
        }
        return;
      }finally{permissionGate.current=false;}
    }
    const retrievalRequested=statusRef.current.libraryRetrievalEnabled===true&&permissionSnapshot?.decision==='allow', actionsRequested=true;
    setActionBatch(null);setLibraryActivity(null);setLibrarySources(null);
    const scope=scoped(), active=managedController();controller.current=active;stopRequested.current=false;
    const proposals=[];
    const priorMessages=[...messageRef.current],priorTurn=lastTurn.current;
    earlierTurns.current=pendingTurns(earlierTurns.current,priorTurn);
    let user=null,assistant=null,completed=false,streamStarted=false;updatePhase('saving');setError(null);setNotice('');
    const restoreRejectedTurn=()=>{
      if(user){lastTurn.current=priorTurn;updateMessages(priorMessages);user=null;assistant=null;}
      if(!inputRef.current){inputRef.current=text;setInput(text);}
      pendingSendText.current='';updateImages(attached);
      retainComposition();
    };
    try{
      if(!scope.caseId){
        const bound = await ensureCase(active.signal); scope.caseId = bound.caseId; requireCurrent(scope);
      }
      if(!scope.conversationId){
        const result=await api.post(`/api/cases/${encodeURIComponent(scope.caseId)}/conversations`,{title:words.untitledConversation},{signal:timeoutSignal(active.signal)});requireCurrent(scope);
        if(!idValid(result.conversation?.id)||result.conversation.caseId!==scope.caseId)throw new ChatClientError('INVALID_RESPONSE');
        conversationRef.current=result.conversation.id;scope.conversationId=result.conversation.id;setConversationId(result.conversation.id);setConversations(rows=>[result.conversation,...rows]);
      }
      const clientMessageId=crypto.randomUUID();
      const payload=buildChatTurn({caseId:scope.caseId,conversationId:scope.conversationId,clientMessageId,text,images:attached,lang,libraryConsent:retrievalRequested,libraryPermissionVersion:retrievalRequested?permissionSnapshot.version:undefined,actionConsent:actionsRequested,guidanceAgency});
      user={id:crypto.randomUUID(),clientMessageId,role:'user',content:text,images:attached,state:'complete',localOnly:true};
      assistant={id:crypto.randomUUID(),role:'assistant',content:'',state:'interrupted',streaming:true,localOnly:true};
      lastTurn.current={user,assistant};pendingSendText.current=text;retainComposition();updateMessages([...messageRef.current,user,assistant]);updateImages([]);setInput('');inputRef.current='';updatePhase('streaming');
      const signal=timeoutSignal(active.signal,95000);
      const response=await fetch('/api/chat',{method:'POST',credentials:'same-origin',cache:'no-store',signal,
        headers:{'Content-Type':'application/json',Accept:'text/event-stream','X-CSRF-Token':statusRef.current.csrfToken,...(workflowRef.current?{'X-Workflow-Id':workflowRef.current}:{})},body:JSON.stringify(payload)});
      requireCurrent(scope);
      const responseRequestId=response.headers.get('X-Request-Id');if(idValid(responseRequestId))assistant.requestId=responseRequestId;
      const returnedWorkflow=response.headers.get('X-Workflow-Id');if(idValid(returnedWorkflow))workflowRef.current=returnedWorkflow;
      if(!response.ok){const result=await response.json().catch(()=>({}));requireCurrent(scope);throw new ChatClientError(result.code||(response.status===401?'AUTH_REQUIRED':'CHAT_PROVIDER_FAILED'));}
      if(retrievalRequested && response.headers.get('X-Library-Retrieval')!=='enabled'){await response.body?.cancel().catch(()=>{});throw new ChatClientError('LIBRARY_UNAVAILABLE');}
      if(!(response.headers.get('content-type')||'').includes('text/event-stream'))throw new ChatClientError('CHAT_STREAM_FAILED');
      streamStarted=true;
      for await(const packet of readChatEvents(response.body,signal)){
        requireCurrent(scope);
        if(packet.type==='delta'){assistant.content+=packet.text;updateMessages([...messageRef.current]);}
        else if(packet.type==='activity'){if(!retrievalRequested)throw new ChatClientError('CHAT_STREAM_FAILED');setLibraryActivity(packet);}
        else if(packet.type==='sources'){if(!retrievalRequested)throw new ChatClientError('CHAT_STREAM_FAILED');assistant.content+=packet.appendix;setLibrarySources({requestId:packet.requestId,items:packet.items});updateMessages([...messageRef.current]);}
        else if(packet.type==='proposal'){
          if(!actionsRequested || !proposalMatchesScope(packet.proposal,scope))throw new ChatClientError('CHAT_STREAM_FAILED');
          proposals.push(packet);setActionBatch({userId:scope.userId,caseId:scope.caseId,conversationId:scope.conversationId,ready:false,items:[...proposals]});
        }
        else if(packet.type==='conversation'){if(packet.conversationId!==scope.conversationId)throw new ChatClientError('CHAT_STREAM_FAILED');user.id=packet.userMessageId;}
        else if(packet.type==='done'){if(actionsRequested&&packet.conversationId!==scope.conversationId)throw new ChatClientError('CHAT_STREAM_FAILED');completed=true;pendingSendText.current='';assistant.id=packet.assistantMessageId;assistant.state='complete';assistant.localOnly=false;assistant.streaming=false;user.localOnly=false;updateMessages([...messageRef.current]);}
        else if(packet.type==='error')throw new ChatClientError(packet.code);
      }
      if(!completed)throw new ChatClientError('CHAT_INCOMPLETE');
      if(proposals.length)setActionBatch({userId:scope.userId,caseId:scope.caseId,conversationId:scope.conversationId,ready:true,items:[...proposals]});
      setNotice('saved');
    }catch(failure){
      if(!current(scope))return;
      setActionBatch(null);
      // Service/quota denials are not authentication failures. They are definite
      // pre-persistence refusals; preserve the question without replay or a
      // misleading failed-history reconciliation.
      if(!streamStarted&&['SERVICE_PAUSED','SERVICE_EXPIRED','TRIAL_LIMIT_REACHED'].includes(failure.code)){restoreRejectedTurn();setError(failure);setNotice('');return;}
      // These rejections happen before provider work. Reconcile session state
      // once, but never replay a chat POST or create another case/conversation.
      if(!streamStarted&&!stopRequested.current&&['CSRF_REJECTED','AUTH_REQUIRED'].includes(failure.code)){
        let next;
        try{next=await refresh({signal:timeoutSignal(active.signal)});}
        catch{failure=new ChatClientError('SESSION_REFRESH_FAILED');}
        if(!current(scope)||next&&(!next.authenticated||next.userId!==scope.userId))return;
        restoreRejectedTurn();
        if(next){setError(null);setNotice('connectionRefreshed');}else setError(failure);
        return;
      }
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
        if(current(scope)){controller.current=null;setLibraryActivity(null);updatePhase('idle');}
      }
    }
  }
  async function checkConnection({serviceOnly=false}={}){
    if(busy)return;
    const scope=scoped(),active=managedController();controller.current=active;updatePhase('checking');setError(null);
    try{await refresh({signal:timeoutSignal(active.signal)});requireCurrent(scope);setNotice(serviceOnly?'serviceRefreshed':'connectionRefreshed');}
    catch(failure){if(current(scope)&&failure.name!=='AbortError')setError(new ChatClientError(serviceOnly?'SERVICE_REFRESH_FAILED':'SESSION_REFRESH_FAILED'));}
    finally{controllers.current.delete(active);if(current(scope)){controller.current=null;updatePhase('idle');}}
  }
  function retry(){const last=[...messageRef.current].reverse().find(message=>message.role==='user');if(!last)return;setInput(last.content);inputRef.current=last.content;setNotice(last.imageMetadata?.length?'oldImage':'retryNote');setError(null);composer.current?.focus();}
  async function copyMessage(content){const scope=scoped();try{await navigator.clipboard.writeText(content);if(current(scope))setNotice('copied');}catch{if(current(scope))setNotice('copyFailed');}}
  const stop=()=>{stopRequested.current=true;controller.current?.abort();};

  if(!status.authenticated)return <Card className="paper-card"><CardContent><p>{words.signIn}</p></CardContent></Card>;
  const serviceFailure=serviceAvailabilityError(status);
  const indexedConversations=conversationIndex?.data||conversations;
  const currentOption=conversationId&&!indexedConversations.some(item=>item.id===conversationId)?conversations.find(item=>item.id===conversationId&&item.caseId===caseRef.current)||{id:conversationId,caseId:caseRef.current,title:recoveryUnavailable?words.recoveredConversation:words.title}:null;
  const listedConversations=currentOption?[currentOption,...indexedConversations]:indexedConversations;
  const workflow = onOpenMaterials && onOpenDocuments ? <ChatCaseWorkflow compact={!!workflowTarget} api={api} lang={lang} caseId={caseId} userId={status.userId} disabled={busy} active={active} refreshKey={`${conversationId}:${messages.length}:${phase === 'idle'}:${actionRevision}`} onOpenMaterials={onOpenMaterials} onOpenDocuments={onOpenDocuments} /> : null;
  const lookup = onOpenSourceCase ? <ChatLookup compact={!!lookupTarget} api={api} userId={status.userId} caseId={caseRef.current} lang={lang} active={active}
      disabled={phase !== 'idle' || bridgeBusy || retentionBusy || imagePending > 0} onOpenSourceCase={onOpenSourceCase} claimOperation={claimSourceOperation} releaseOperation={releaseSourceOperation} /> : null;
  return <section className="chat-workspace" aria-label={words.title} data-feature="chat" data-case-id={caseRef.current||undefined} data-conversation-id={conversationId||undefined}>
    <LibraryPermissionDialog lang={lang} open={permissionPrompt&&active} ready={Boolean(permissionPending.current?.snapshot)} onRetry={refreshPermission} busy={permission.busy} error={permissionFailure} onChoose={choosePermission} onClose={closePermission} onWithoutLibrary={sendWithoutLibrary} />
    {workflow && (workflowTarget ? createPortal(<div hidden={!active} data-chat-workflow-slot>{workflow}</div>, workflowTarget) : workflow)}
    {lookup && (lookupTarget ? createPortal(<div hidden={!active} data-chat-lookup-slot>{lookup}</div>, lookupTarget) : lookup)}
    <Card className="chat-surface">
      <CardHeader className="chat-toolbar"><CardTitle className="truncate text-base">{title||words.title}</CardTitle>
        <div className="flex flex-wrap items-center gap-3"><Label className="sr-only" htmlFor={`${inputId}-conversation`}>{words.conversation}</Label>
          <NativeSelect id={`${inputId}-conversation`} value={conversationId||''} onChange={event=>{const row=conversationIndex?.data?.find(item=>item.id===event.target.value);if(row&&onOpenConversation)onOpenConversation(row);else chooseConversation(event.target.value);}} disabled={busy||!listedConversations.length} aria-describedby={!listedConversations.length&&phase!=='loading'?`${inputId}-conversation-empty`:undefined} className="w-48 max-w-full">
            <NativeSelectOption value="" disabled>{listedConversations.length?words.chooseConversation:words.noConversations}</NativeSelectOption>{listedConversations.map(item=><NativeSelectOption key={item.id} value={item.id}>{item.title}</NativeSelectOption>)}
          </NativeSelect><Button variant="outline" size="sm" type="button" disabled={busy} onClick={()=>onNewConversation?onNewConversation():chooseConversation('')}><Plus aria-hidden="true" />{words.newConversation}</Button>
          <Button variant="ghost" size="sm" type="button" disabled={busy} onClick={reloadConversation} aria-label={words.reload} title={words.reload}><RefreshCw aria-hidden="true" /></Button>
        </div>
        {!listedConversations.length&&phase!=='loading'&&<p id={`${inputId}-conversation-empty`} className="text-xs text-muted-foreground">{words.noConversationsReason}</p>}
      </CardHeader>
      <CardContent className="chat-body">
        <div className="chat-thread" tabIndex={0} aria-label={lang==='en'?'Conversation history':'对话记录'}>
        {phase==='loading'&&<p role="status" className="text-sm text-muted-foreground">{words.loading}</p>}
        <div id={threadId} className="chat-messages" role="log" aria-label={words.conversation} aria-live="polite" aria-relevant="additions text">
          {!messages.length&&phase!=='loading'&&<ConversationOpening lang={lang} state={conversationIndex} onOpen={onOpenConversation} disabled={busy} onPrompt={text=>{inputRef.current=text;setInput(text);composer.current?.focus();}} />}
          {messages.map(message=><article key={message.id} className={`chat-message chat-message--${message.role}`} aria-label={message.role==='user'?words.you:words.assistant}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{message.role==='user'?words.you:words.assistant}</span>{message.role==='assistant'&&message.content&&<Button type="button" variant="ghost" size="xs" onClick={()=>copyMessage(message.content)}>{words.copy}</Button>}</div>
            {!!message.images?.length&&<div className="mb-3 flex flex-wrap gap-2">{message.images.map(image=><img key={image.id} src={image.preview} alt={words.imageOnly} className="h-24 w-24 rounded border object-contain" />)}</div>}
            {!!message.imageMetadata?.length&&<p className="mb-2 text-xs text-muted-foreground">{words.oldImage}</p>}
            <>{message.role==='assistant' ? <AssistantMarkdown content={message.content} streaming={message.streaming} lang={lang} /> : <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content}</p>}</>
            {!message.streaming&&message.state!=='complete'&&<Badge variant="outline" className="mt-3 whitespace-normal text-destructive">{words.incomplete}</Badge>}
            {message.localOnly&&!message.streaming&&<p className="mt-2 text-xs text-muted-foreground">{words.localOnly}</p>}
            {onReviewMessage && <ChatMessageActions key={`${status.userId}:${caseRef.current}:${conversationId}:${message.id}`} message={message} api={api} lang={lang} userId={status.userId} caseId={caseRef.current} conversationId={conversationId} disabled={busy} onReviewMessage={onReviewMessage} onOpenDocuments={onOpenDocuments} claimOperation={claimBridgeOperation} releaseOperation={releaseBridgeOperation} />}
          </article>)}
          <div ref={endOfThread}/>
        </div>
        {actionBatch && actionBatch.userId===status.userId && actionBatch.caseId===caseRef.current && actionBatch.conversationId===conversationId && actionBatch.items.map((packet,index)=><ConversationActionReview key={`${status.userId}:${caseRef.current}:${conversationId}:${packet.requestId}:${index}`} proposal={packet.proposal} api={api} lang={lang} userId={status.userId} caseId={caseRef.current} conversationId={conversationId} ready={actionBatch.ready && phase==='idle'} disabled={busy} claimOperation={claimBridgeOperation} releaseOperation={releaseBridgeOperation} onApplied={result=>{setActionRevision(value=>value+1);if(result.message&&result.message.conversationId===conversationRef.current&&!messageRef.current.some(row=>row.id===result.message.id))updateMessages([...messageRef.current,result.message]);}} onOpenDocuments={onOpenDocuments} onOpenMaterials={onOpenMaterials} onReplyTarget={actionBatch.items.length===1?registerFactReply:undefined} />)}
        {libraryActivity&&<div role="status" className="paper-note rounded px-3 py-2 text-sm" aria-label={words.libraryActivity}>
          <p>{libraryActivityText(libraryActivity,lang)}{libraryActivity.count!==undefined?` · ${words.libraryCount}: ${libraryActivity.count}`:''}</p>
          {libraryActivity.code&&<p>{chatErrorText(libraryActivity,lang)}</p>}
        </div>}
        {librarySources&&<ChatSourceNavigation api={api} sources={librarySources} userId={status.userId} caseId={caseRef.current} lang={lang} active={active}
          disabled={phase !== 'idle' || bridgeBusy || retentionBusy || imagePending > 0} onOpenSourceCase={onOpenSourceCase} claimOperation={claimSourceOperation} releaseOperation={releaseSourceOperation} />}
        {!librarySources && messages.some(message => message.role === 'assistant') && <p className="text-xs text-muted-foreground">{(sourceNavigationCopy[lang] || sourceNavigationCopy.zh).history}</p>}
        {error&&error.code!==serviceFailure&&<Alert variant="destructive"><AlertDescription>{chatErrorText(error,lang)}</AlertDescription></Alert>}
        {unavailableExactConversation&&phase==='idle'&&<p role="status" className="text-sm text-muted-foreground">{lang==='en'?'This conversation could not be loaded. Reload it or start a new conversation to continue.':'这段对话暂时无法读取。请重新读取，或开始新对话。'}</p>}
        {recoveryUnavailable&&<Alert><AlertDescription>{words.recoveryUnavailable}</AlertDescription><Button variant="outline" type="button" disabled={busy} onClick={reloadConversation}>{words.retryOpening}</Button></Alert>}
        {error?.code==='CHAT_SAVE_FAILED'&&<Button variant="outline" type="button" disabled={busy} onClick={reloadConversation}>{words.checkSavedReply}</Button>}
        {serviceFailure&&<Alert><AlertDescription>{chatErrorText({code:serviceFailure},lang)}</AlertDescription><Button type="button" variant="outline" disabled={busy} onClick={()=>checkConnection({serviceOnly:true})}>{words.refreshService}</Button></Alert>}
        {!serviceFailure&&(status.liveEnabled!==true||['CSRF_REJECTED','SESSION_REFRESH_FAILED'].includes(error?.code))&&<Button variant="outline" type="button" disabled={busy} onClick={checkConnection}>{words.checkConnection}</Button>}
        {cacheStatus==='unavailable'&&<p role="status" className="text-sm text-destructive">{words.cacheUnavailable}</p>}
        {notice&&<p role="status" className="paper-note rounded px-3 py-2 text-sm">{words[notice]}</p>}
        {(error||notice==='stopped')&&messages.some(message=>message.role==='user')&&<Button variant="outline" type="button" disabled={busy} onClick={retry}>{words.retry}</Button>}
        </div>
        <form className="chat-composer" onSubmit={send} onDragOver={event=>{event.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={event=>{event.preventDefault();setDragging(false);receiveFiles(event.dataTransfer.files);}}>
          <div className="chat-compose-fields">
          <Label className="sr-only" htmlFor={inputId}>{words.composer}</Label>
          <Textarea ref={composer} id={inputId} value={input} maxLength={CHAT_BOUNDS.text} disabled={busy} className={`chat-input ${dragging?'ring-2 ring-ring':''}`} placeholder={words.placeholder}
            onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing&&event.keyCode!==229){event.preventDefault();send(event);}}}
            onChange={event=>{inputRef.current=event.target.value;setInput(event.target.value);}}
            onPaste={event=>{const files=Array.from(event.clipboardData.files||[]);if(files.length){event.preventDefault();const text=event.clipboardData.getData('text/plain');if(text){const next=(inputRef.current+text).slice(0,CHAT_BOUNDS.text);inputRef.current=next;setInput(next);}receiveFiles(files);}}}/>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">{input.length>7000&&<span>{input.length.toLocaleString()} / 8,000</span>}{imagePending>0&&<span role="status">{words.decoding}</span>}</div>
          {!!images.length&&<div className="flex flex-wrap gap-3">{images.map(image=><div key={image.id} className="flex items-center gap-2 rounded border p-2"><img src={image.preview} alt={words.imageOnly} className="h-16 w-16 object-contain"/><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={()=>removeImage(image.id)} aria-label={words.remove}>{words.remove}</Button></div>)}</div>}
          <ChatOriginalRetention api={api} userId={status.userId} authenticated={status.authenticated} caseId={caseRef.current} images={images} lang={lang} disabled={phase !== 'idle' || bridgeBusy || sourceBusy || imagePending > 0} ensureCase={ensureCase} onBusyChange={updateRetentionBusy} onOpenMaterials={onOpenMaterials} />
          </div>
          <div className="chat-composer-actions">
            <Button type="button" variant="ghost" size="sm" disabled={busy||imagePending>0} onClick={()=>fileInput.current?.click()} title={words.attach}><Paperclip aria-hidden="true" />{words.attach}</Button>
            <div className="flex items-center gap-2"><span className="chat-keyboard-hint">{words.keyboardHint}</span>
            {phase!=='idle'&&phase!=='loading'?<Button type="button" aria-label={words.stop} onClick={stop}><Square aria-hidden="true" />{words.stop}</Button>:<Button type="submit" aria-label={words.send} disabled={busy||Boolean(serviceFailure)||unavailableExactConversation||recoveryUnavailable||imagePending>0||!status.liveEnabled||(!input.trim()&&!images.length)}><ArrowUp aria-hidden="true" />{words.send}</Button>}</div>
            <input id={fileId} ref={fileInput} className="sr-only" type="file" accept="image/png,image/jpeg,.pdf,.txt,.csv,.xlsx,.xls" multiple onChange={event=>{receiveFiles(event.target.files);event.target.value='';}}/>
          </div>
          {['saving','streaming','refreshing','checking'].includes(phase)&&<p role="status" className="text-xs text-muted-foreground">{phase==='saving'?words.saving:phase==='streaming'?words.sending:phase==='checking'?words.checkingConnection:words.loading}</p>}
          {!status.liveEnabled&&!serviceFailure&&<p className="text-sm text-destructive">{words.unavailable}</p>}
        </form>
      </CardContent>
    </Card>
  </section>;
}
