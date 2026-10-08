import { FIELDS, DRAFT_TYPES, hasCJKText } from '../../../public/core.js';
import { DOCUMENT_DETAIL_KEYS } from '../../../document-context.js';
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
const fail = () => { throw Object.assign(new Error('CHAT_STREAM_FAILED'), {code:'CHAT_STREAM_FAILED'}); };
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const same = (left,right) => JSON.stringify(left) === JSON.stringify(right);
/** Treat model-derived previews and destinations as untrusted protocol data. */
export function normalizeConversationProposal(packet) {
  const p = packet?.proposal, r = p?.request;
  if (!uuid(packet?.requestId) || !plain(p) || !plain(r) || !uuid(p.caseId) || !uuid(p.sourceConversationId) || !uuid(p.sourceMessageId) || !Number.isSafeInteger(p.expectedVersion) || p.expectedVersion < 1 || p.requiresExplicitApply !== true || !['prepare_case_suggestion','prepare_answer_draft'].includes(p.action)) fail();
  const request = {action:p.action,expectedVersion:p.expectedVersion,sourceConversationId:p.sourceConversationId,sourceMessageId:p.sourceMessageId};
  for (const key of Object.keys(request)) if (r[key] !== request[key]) fail();
  const display={};for(const [key,prefix]of [['sourceDisplayId','XX'],['conversationDisplayId','DH']])if(p[key]!==undefined){if(typeof p[key]!=='string'||!new RegExp('^'+prefix+'\\d{8}$','u').test(p[key]))fail();display[key]=p[key];}
  let preview;
  if (p.action === 'prepare_case_suggestion') {
    if (p.confirm !== false || !Array.isArray(p.preview) || p.preview.length < 1 || p.preview.length > 17) fail();
    preview=[];
    for (const [group,allowed,limit] of [['factChanges',FIELDS,3000],['changes',DOCUMENT_DETAIL_KEYS,1000]]) {
      if (!plain(r[group])) fail();
      request[group]={};
      for (const [key,change] of Object.entries(r[group])) {
        if (!allowed.includes(key) || !plain(change) || Object.keys(change).length !== 1 || typeof change.value !== 'string' || change.value.length > limit || /[\u0000-\u001f\u007f\u2028\u2029]/u.test(change.value)) fail();
        request[group][key]={value:change.value};
        const matches=p.preview.filter(row=>row.group===group&&row.key===key);
        if(matches.length!==1)fail();
        const row=matches[0];
        if(typeof row.before!=='string'||row.before.length>limit||row.after!==change.value||typeof row.confirmed!=='boolean'||typeof row.conflict!=='boolean'||row.confirmed&&row.before!==row.after&&!row.conflict)fail();
        preview.push({group,key,before:row.before,after:row.after,confirmed:row.confirmed,conflict:row.conflict});
      }
    }
    if(preview.length!==p.preview.length)fail();
    if(!Array.isArray(p.conflicts)||!same([...p.conflicts].sort(),preview.filter(row=>row.conflict).map(row=>row.key).sort()))fail();
  } else {
    if(!DRAFT_TYPES.includes(p.kind)||r.kind!==p.kind||p.status!=='draft'||typeof p.content!=='string'||!p.content.startsWith('DRAFT — UNREVIEWED CONVERSATION ANSWER\n')||p.content.length>50000||hasCJKText(p.content)||typeof p.title!=='string'||p.title.length>200||!Array.isArray(p.conflicts)||p.conflicts.length)fail();
    request.kind=p.kind;
  }
  if(Object.keys(r).length!==Object.keys(request).length)fail();
  const method=p.action==='prepare_case_suggestion'?'PATCH':'POST';
  const path=`/api/cases/${p.caseId}/${method==='PATCH'?'document-context':'artifacts'}`;
  if(p.apply?.method!==method||p.apply.path!==path||!plain(p.apply.body)||!same(p.apply.body.conversationAction,r))fail();
  return {requestId:packet.requestId,proposal:{...display,action:p.action,caseId:p.caseId,expectedVersion:p.expectedVersion,sourceConversationId:p.sourceConversationId,sourceMessageId:p.sourceMessageId,requiresExplicitApply:true,request,conflicts:[...p.conflicts],...(preview?{preview}:{kind:p.kind,status:'draft',title:p.title,content:p.content}),apply:{method,path,body:{conversationAction:request}}}};
}
export function proposalMatchesScope(proposal,{caseId,conversationId}) {
  return proposal.caseId===caseId && proposal.sourceConversationId===conversationId;
}
export function conversationActionError(error,lang='zh') {
  const en=lang==='en';
  if(['CASE_CONFLICT','DOCUMENT_CONTEXT_CONFLICT'].includes(error?.code))return en?'This case changed or contains reviewed conflicts. Review the latest facts and request a new proposal. Nothing was overwritten.':'案例已更新或存在已核实的冲突。请核对最新事实并重新请求建议，没有覆盖原值。';
  if(error?.code==='CONVERSATION_ACTION_INVALID')return en?'This proposal could not be validated. Request a new preview; no action was applied.':'无法验证此建议，请重新请求预览；没有应用任何操作。';
  if(error?.code==='DOCUMENT_ENGLISH_REQUIRED')return en?'The draft must be in English. Ask for an English answer first.':'草稿必须为英文，请先请求英文回答。';
  if(error?.code==='AUTH_REQUIRED')return en?'Sign in again before continuing.':'请重新登录后继续。';
  if(['CONVERSATION_ACTION_SOURCE_NOT_FOUND','CONVERSATION_ACTION_SOURCE_INCOMPLETE'].includes(error?.code))return en?'The saved source is unavailable or incomplete. Request a new proposal.':'已存来源不可用或不完整，请重新请求建议。';
  return en?'The action could not be verified. Your conversation and input are preserved.':'无法核实本次操作。对话和输入已保留。';
}
