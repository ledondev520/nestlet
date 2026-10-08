import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {conversationActionError} from './conversation-actions.js';
import {documentCopy} from '../documents/copy.js';
const rowsFor=proposal=>proposal.preview.filter(row=>!(row.confirmed&&!row.conflict&&row.before===row.after));
const uuid=()=>crypto.randomUUID();
const errorText=(failure,en)=>({
 CONVERSATION_REVIEW_CLARIFY:en?'Reply “confirm”, “cancel”, or use “change to …” for one detail. Nothing changed.':"请回复「确认」或「取消」。\n只有一项时，也可回复「改为……」。\n目前尚未修改。",
 CONVERSATION_REVIEW_MISSING:en?'A value is missing. For one detail, reply “change to …” with the answer.':"还有信息未填写。\n只有一项时，可回复「改为……」。",
 CONVERSATION_REVIEW_PENDING:en?'Another question is pending in this conversation. Answer or cancel it first.':"还有一个问题待回答，请先回答或取消。",
 CONVERSATION_REVIEW_SCOPE:en?'The conversation changed. Ask for a new question before confirming.':'对话已变化，请重新提问后再确认。',
 CONVERSATION_REVIEW_EXPIRED:en?'This question expired. Ask for a fresh question.':'这个问题已过期，请重新提问。'
}[failure?.code]||conversationActionError(failure,en?'en':'zh'));
/** A fresh human reply is targeted to this visible value set, never interpreted by a model. */
export function ConversationFactReview({proposal,userId,caseId,conversationId,ready,disabled,api,lang,claimOperation,releaseOperation,onApplied,onReplyTarget,onStarted}) {
 const en=lang==='en',rows=rowsFor(proposal),scope=`${userId}:${caseId}:${conversationId}`;
 const scopeRef=useRef(scope),alive=useRef(true),operation=useRef(null),requestKey=useRef(null),pending=useRef(null),savedReply=useRef(null),undoKey=useRef(null);
 scopeRef.current=scope;
 const [state,setState]=useState('question'),[answer,setAnswer]=useState(''),[error,setError]=useState(null),[receipt,setReceipt]=useState(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;operation.current?.abort();};},[]);
 const validIntent=intent=>intent&&intent.caseId===caseId&&intent.conversationId===conversationId&&intent.expectedVersion===proposal.expectedVersion&&intent.sourceMessageId===proposal.sourceMessageId&&JSON.stringify(intent.rows)===JSON.stringify(rows);
 async function submit(text,{retry=false,undo=false}={}) {
  if(disabled||!ready||operation.current||!['question','uncertain','saved'].includes(state))return;
  const lock=claimOperation?.();if(claimOperation&&!lock)return;
  const controller=new AbortController(),captured=scope;operation.current=controller;setState('saving');setError(null);
  const current=()=>alive.current&&scopeRef.current===captured&&operation.current===controller;
  const options={signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])};
  try {
   // Capture the human answer before any request: prepare itself can commit and lose its response.
   if(!undo&&!retry)savedReply.current={conversationId,expectedVersion:proposal.expectedVersion,clientMessageId:uuid(),answer:text};
   if(!undo&&!savedReply.current)throw {code:'INVALID_RESPONSE'};
   if(!pending.current){
    requestKey.current ||= uuid();
    const prepared=await api.post(`/api/cases/${caseId}/conversation-reviews`,{conversationAction:proposal.request,clientRequestId:requestKey.current,locale:en?'en':'zh'},options);
    if(!current())return;
    if(prepared.unchanged){setState('saved');onApplied?.(prepared);return true;}
    if(!validIntent(prepared.intent))throw {code:'INVALID_RESPONSE'};
    pending.current=prepared.intent;onStarted?.();
   }
   let result;
   if(undo){
    undoKey.current ||= uuid();
    result=await api.post(`/api/cases/${caseId}/conversation-reviews/${pending.current.id}/undo`,{conversationId,expectedVersion:receipt.intent.appliedVersion,clientMessageId:undoKey.current},options);
   }else{
    if(!savedReply.current)throw {code:'INVALID_RESPONSE'};
    result=await api.post(`/api/cases/${caseId}/conversation-reviews/${pending.current.id}/reply`,savedReply.current,options);
   }
   if(!current())return;
   if(!validIntent(result.intent)||result.case?.id!==caseId||!['applied','cancelled','undone'].includes(result.intent.state))throw {code:'INVALID_RESPONSE'};
   setReceipt(result);setState(result.intent.state==='applied'?(result.case.version===result.intent.appliedVersion?'saved':'superseded'):result.intent.state);setAnswer('');onApplied?.(result);return true;
  }catch(failure){
   if(current()){
    setError(failure);
    // Keep the exact answer and idempotency key on any uncertain response.
    setState(failure.status>=400&&failure.status<500?'question':'uncertain');
   }
  }finally{if(current())operation.current=null;releaseOperation?.(lock);}
 }
 useEffect(()=>{
  if(!onReplyTarget)return;
  if(rows.length&&ready&&state==='question')onReplyTarget({scope,submit});
  else onReplyTarget(null);
  return ()=>onReplyTarget(null);
 },[onReplyTarget,scope,ready,state,disabled]);
 if(!rows.length)return <p role="status" className="whitespace-pre-line text-sm">{en?'These details are already reviewed. You can continue.':'这些信息已经核对过，可以继续。'}</p>;
 return <div className="space-y-2" data-testid="conversation-fact-review">
  {state==='question'&&<>
   <p className="whitespace-pre-line text-sm">{en?'Are the details above correct? Your answer can save them here without another review page.':"这些信息对吗？\n回答后可在这里保存。"}</p>
   <div className="flex flex-wrap gap-2">
    <Button type="button" size="sm" disabled={disabled||!ready||rows.some(row=>!row.after.trim())} onClick={()=>submit(en?'confirm':'确认以上信息')}>{en?'Correct, save these facts':"确认保存"}</Button>
    <Button type="button" size="sm" variant="ghost" disabled={disabled||!ready} onClick={()=>submit('cancel')}>{en?'Leave unchanged':"暂不修改"}</Button>
   </div>
   {!onReplyTarget&&<><label className="block text-sm">{en?'Reply to this question':"你的回答"}
    <textarea className="mt-1 w-full rounded border bg-background p-2 text-sm" value={answer} disabled={disabled||!ready} onChange={event=>setAnswer(event.target.value)} placeholder={rows.length===1?(en?'For example: change to $2100':'例如：改为 $2100'):(en?'confirm or cancel':'确认，或取消')} />
   </label>
   <Button type="button" variant="outline" size="sm" disabled={disabled||!ready||!answer.trim()} onClick={()=>submit(answer)}>{en?'Send answer':'发送回答'}</Button></>}
  </>}
  {state==='saving'&&<p className="whitespace-pre-line" role="status">{en?'Saving your answer…':'正在保存您的回答…'}</p>}
  {state==='saved'&&<><p className="whitespace-pre-line" role="status">{en?'Saved as reviewed. Continue the conversation here. This is not agency approval or a submission.':"已保存为你核对过的信息。\n不代表机构批准，也不会提交。"}</p>{receipt&&<ul className="text-sm">{receipt.intent.rows.map(row=><li key={`${row.group}:${row.key}`}>{documentCopy(en?'en':'zh').fields[row.key] || row.key}: {row.group==='factChanges'?receipt.case.fields.find(field=>field.key===row.key)?.value:receipt.case.documentContext?.[row.key]?.value}</li>)}</ul>}{receipt?.intent.state==='applied'&&<Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={()=>submit('',{undo:true})}>{en?'Undo this review':"撤销核对"}</Button>}</>}
  {state==='superseded'&&<p className="whitespace-pre-line" role="status">{en?'Your answer was saved earlier, but the case has since changed. Ask about the current facts before continuing.':"这次回答已保存，但事项后来有更新。\n请依据当前信息继续提问。"}</p>}
  {['cancelled','undone'].includes(state)&&<p className="whitespace-pre-line" role="status">{state==='undone'?(en?'Review withdrawn. Your original facts are restored.':'已撤销本次核对，原事实已恢复。'):(en?'Left unchanged. Your answer is saved.':'保持原状，已记录您的回答。')}</p>}
  {state==='uncertain'&&<><p className="whitespace-pre-line" role="alert">{en?'The response was interrupted. Check this exact answer safely without applying twice.':"回复中断，可核对这次回答的保存结果。\n不会重复修改。"}</p><Button type="button" variant="outline" size="sm" disabled={disabled} onClick={()=>submit('',{retry:true,undo:Boolean(undoKey.current)})}>{en?'Check saved answer':"核对保存"}</Button></>}
  {error&&<p role="alert" className="whitespace-pre-line text-sm text-destructive">{errorText(error,en)}</p>}
 </div>;
}
