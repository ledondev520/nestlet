import { ConversationFactReview } from './conversation-fact-review.jsx';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { caseWriteDefinitelyRejected } from '@/lib/conversation-handoff';
import { conversationActionError, proposalMatchesScope } from './conversation-actions.js';

const labels={property:['Property address','物业地址'],owner:['Owner','业主'],pha:['Housing authority','住房机构'],caseReference:['Case reference','案例编号'],rent:['Requested rent','申请租金'],documentDate:['Document date','文书日期'],recipientName:['Recipient name','收件人姓名'],recipientContact:['Recipient contact','收件人联系方式'],recipientOrganization:['Recipient organization','收件机构'],salutation:['Salutation','称呼'],senderName:['Sender name','发件人姓名'],senderContact:['Sender contact','发件人联系方式'],senderRole:['Sender role','发件人身份'],senderOrganization:['Sender organization','发件机构'],attachments:['Attachments','附件'],nextActionOwner:['Next action owner','下一步负责人'],targetDate:['Target date','目标日期']};
/** A preview never writes. Only this explicit apply button can call a derived, scoped endpoint. */
export function ConversationActionReview({proposal,userId,caseId,conversationId,ready,api,lang='zh',disabled=false,claimOperation,releaseOperation,onApplied,onOpenDocuments,onOpenMaterials,onReplyTarget}) {
  const en=lang==='en', identity=`${userId}:${caseId}:${conversationId}`;
  const identityRef=useRef(identity), mounted=useRef(true), operation=useRef(null);
  identityRef.current=identity;
  const [state,setState]=useState('preview'),[error,setError]=useState(null),[reviewCompleted,setReviewCompleted]=useState(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;operation.current?.controller.abort();};},[]);
  const matches=proposalMatchesScope(proposal,{caseId,conversationId});
  if(!matches||state==='cancelled')return null;
  const suggestion=proposal.action==='prepare_case_suggestion';
  const apply=async()=>{
    if(disabled||!ready||state!=='preview'||operation.current||proposal.conflicts.length||!matches)return;
    const lock=claimOperation?.();if(claimOperation&&!lock)return;
    const controller=new AbortController(),token={controller,lock},captured=identity;
    operation.current=token;setState('applying');setError(null);
    const current=()=>mounted.current&&identityRef.current===captured&&operation.current===token;
    try{
      // Never use a model-supplied URL or method, even after protocol validation.
      const path=`/api/cases/${caseId}/${suggestion?'document-context':'artifacts'}`;
      const result=await api[suggestion?'patch':'post'](path,{conversationAction:proposal.request},{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])});
      if(!current())return;
      if(suggestion){
        if(result.case?.id!==caseId||!Number.isSafeInteger(result.case.version)||result.case.version<=proposal.expectedVersion)throw {code:'INVALID_RESPONSE'};
      }else if(result.artifact?.caseId!==caseId||result.artifact.status!=='draft'||result.artifact.sourceMessageId!==proposal.sourceMessageId||result.artifact.sourceConversationId!==conversationId||result.artifact.content!==proposal.content)throw {code:'INVALID_RESPONSE'};
      setState('saved');onApplied?.(result);
    }catch(failure){
      if(current()){setError(failure);setState(caseWriteDefinitelyRejected(failure)||failure.status>=400&&failure.status<500&&['DOCUMENT_CONTEXT_CONFLICT','CONVERSATION_ACTION_SOURCE_NOT_FOUND','CONVERSATION_ACTION_SOURCE_INCOMPLETE','CONVERSATION_ACTION_INVALID','DOCUMENT_ENGLISH_REQUIRED'].includes(failure.code)?'rejected':'uncertain');}
    }finally{
      if(current())operation.current=null;
      releaseOperation?.(lock);
    }
  };
  return <section data-testid="conversation-action-review" className="space-y-3 rounded border p-3" aria-label={en?'Review proposed action':'核对建议操作'}>
    <h2 className="text-sm font-semibold">{suggestion?(en?'Suggested case updates':'案例更新建议'):(en?'English draft preview':'英文草稿预览')}</h2>
    <p className="text-xs text-muted-foreground">{en?'Unreviewed suggestion. You can answer below to review facts, or keep them as unreviewed suggestions. No message or form is sent.':'待核实建议。可直接回答来核对事实，也可保留为待核实建议。不会发送消息或提交表格。'}</p>
    <p className="break-all text-xs text-muted-foreground">{en?'Saved source message':'已存来源消息'}: {proposal.sourceDisplayId||(en?'Saved message':'已保存消息')} · {en?'Case version':'案例版本'} {proposal.expectedVersion}</p>
    {suggestion?<ul className="space-y-2 text-sm">{proposal.preview.map(row=><li key={`${row.group}:${row.key}`}>
      <strong>{labels[row.key]?.[en?0:1]||row.key}</strong>
      <p className="whitespace-pre-wrap break-words">{en?'Current':'当前'}: {row.before||(en?'Not provided':'未提供')}</p>
      <p className="whitespace-pre-wrap break-words">{en?'Suggested':'建议'}: {row.after||(en?'Empty':'空值')}</p>
      {(row.confirmed||row.conflict)&&<p className={row.conflict?'text-destructive':'text-muted-foreground'}>{row.conflict?(en?'Conflicting evidence needs review. Your answer below can resolve the different values.':'这些信息不一致，可以直接在下面回答来解决。'):(en?'Reviewed value is unchanged.':'已核实值保持不变。')}</p>}
    </li>)}</ul>:<p className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm">{proposal.content}</p>}
    {suggestion&&state==='preview'&&<ConversationFactReview proposal={proposal} userId={userId} caseId={caseId} conversationId={conversationId} ready={ready} disabled={disabled} api={api} lang={lang} claimOperation={claimOperation} releaseOperation={releaseOperation} onStarted={()=>setReviewCompleted(true)} onReplyTarget={onReplyTarget} onApplied={result=>{setReviewCompleted(true);onApplied?.(result);}} />}
    {!ready&&state==='preview'&&<p role="status" className="text-xs text-muted-foreground">{en?'Wait for the complete saved answer before applying.':'请等待回答完整保存后再应用。'}</p>}
    {state==='preview'&&!reviewCompleted&&(!suggestion||proposal.preview.some(row=>!row.confirmed||row.conflict||row.before!==row.after))&&<div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" disabled={disabled||!ready||Boolean(proposal.conflicts.length)} onClick={apply}>{suggestion?(en?'Apply as unreviewed suggestions':'应用为待核实建议'):(en?'Save unreviewed English draft':'保存待核实英文草稿')}</Button>
      <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={()=>setState('cancelled')}>{en?'Cancel proposal':'取消建议'}</Button>
    </div>}
    {state==='applying'&&<p role="status" className="text-sm">{en?'Applying your reviewed proposal…':'正在应用您核对后的建议…'}</p>}
    {state==='saved'&&<p role="status" className="text-sm">{suggestion?(en?'Suggestions saved as unreviewed. You can ask about missing details here.':'已存为待核实建议，可以继续在这里补充信息。'):(en?'English draft saved as unreviewed. Open Documents to preview this version.':'英文草稿已存为待核实版本，可在文书中预览。')}</p>}
    {state==='uncertain'&&<p role="alert" className="text-sm text-destructive">{en?'Save status is uncertain. Check the saved case or document versions before requesting another action. This proposal cannot be applied again.':'尚未确认保存状态。请先检查已存案例或文书版本，再请求其他操作。此建议不能重复应用。'}</p>}
    {error&&<p role="alert" className="text-sm text-destructive">{conversationActionError(error,lang)}</p>}
    {['saved','uncertain','rejected'].includes(state)&&<div className="flex flex-wrap gap-2">
      {suggestion&&onOpenMaterials&&<Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={()=>onOpenMaterials({userId,caseId})}>{en?'Open Materials & facts':'打开材料与事实'}</Button>}
      {!suggestion&&onOpenDocuments&&<Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={()=>onOpenDocuments({userId,caseId})}>{en?'Open case document versions':'打开本案例文书版本'}</Button>}
    </div>}
  </section>;
}
