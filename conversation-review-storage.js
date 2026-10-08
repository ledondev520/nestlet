/** Durable, scoped UI review intents. No provider/model entrypoint can consume these. */
import {randomUUID,createHash} from 'node:crypto';
import {loadConversationAction} from './conversation-action-contract.js';
import {reviewFail as fail,reviewKeys as keys,reviewId,reviewRows,interpretReviewAnswer,reviewedPayload,casePayload} from './conversation-review.js';
export const REVIEW_SCHEMA_SQL=`
CREATE TABLE conversation_review_intents (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id),
 case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
 conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 request_key TEXT NOT NULL,
 request_json TEXT NOT NULL CHECK(json_valid(request_json)),
 rows_json TEXT NOT NULL CHECK(json_valid(rows_json)),
 expected_version INTEGER NOT NULL CHECK(expected_version>0),
 prompt_message_id TEXT NOT NULL REFERENCES messages(id),
 expires_at INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','applied','cancelled','expired','undone')),
 answer_key TEXT,
 answer_text TEXT,
 answer_message_id TEXT REFERENCES messages(id),
 applied_version INTEGER,
 before_json TEXT CHECK(before_json IS NULL OR json_valid(before_json)),
 undo_key TEXT,
 undo_message_id TEXT REFERENCES messages(id),
 UNIQUE(user_id,request_key)
) STRICT;
CREATE UNIQUE INDEX conversation_review_one_pending ON conversation_review_intents(user_id,conversation_id) WHERE state='pending';
CREATE INDEX conversation_review_case ON conversation_review_intents(user_id,case_id);
CREATE TRIGGER conversation_review_binding_immutable BEFORE UPDATE ON conversation_review_intents
 WHEN NEW.id IS NOT OLD.id OR NEW.user_id IS NOT OLD.user_id OR NEW.case_id IS NOT OLD.case_id
 OR NEW.conversation_id IS NOT OLD.conversation_id OR NEW.request_key IS NOT OLD.request_key
 OR NEW.request_json IS NOT OLD.request_json OR NEW.rows_json IS NOT OLD.rows_json
 OR NEW.expected_version IS NOT OLD.expected_version OR NEW.prompt_message_id IS NOT OLD.prompt_message_id
 OR NEW.expires_at IS NOT OLD.expires_at
 BEGIN SELECT RAISE(ABORT,'Review intent binding is immutable'); END;
PRAGMA user_version=7;`;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const publicIntent=row=>({id:row.id,caseId:row.case_id,conversationId:row.conversation_id,expectedVersion:row.expected_version,promptMessageId:row.prompt_message_id,expiresAt:row.expires_at,state:row.state,rows:JSON.parse(row.rows_json),sourceMessageId:JSON.parse(row.request_json).sourceMessageId,appliedVersion:row.applied_version,answerMessageId:row.answer_message_id});
const labels={property:['Property address','物业地址'],owner:['Owner','业主'],pha:['Housing authority','住房机构'],caseReference:['Case reference','案例编号'],rent:['Requested rent','申请租金']};
export function createConversationReviewStorage({db,transaction,api,now=()=>Date.now()}) {
 const own=(userId,caseId)=>{const record=api.getCase(userId,caseId);if(!record)fail('CASE_NOT_FOUND',404);return record;};
 const get=(userId,caseId,id)=>{own(userId,caseId);if(!reviewId(id))fail();const row=db.prepare('SELECT * FROM conversation_review_intents WHERE user_id=? AND case_id=? AND id=?').get(userId,caseId,id);if(!row)fail('CONVERSATION_REVIEW_NOT_FOUND',404);return row;};
 const message=(userId,row,id)=>api.listMessages(userId,row.conversation_id)?.find(m=>m.id===id);
 const result=(userId,row,replayed=false)=>({intent:publicIntent(row),case:own(userId,row.case_id),message:message(userId,row,row.undo_message_id||row.answer_message_id||row.prompt_message_id),replayed});
 const expire=()=>db.prepare("UPDATE conversation_review_intents SET state='expired' WHERE state='pending' AND expires_at<=?").run(now());
 return {
  prepare(userId,caseId,input){
   keys(input,['conversationAction','clientRequestId','locale']);
   if(!reviewId(input.clientRequestId)||!['zh','en'].includes(input.locale))fail();
   return transaction(()=>{
    const record=own(userId,caseId);
    const previous=db.prepare('SELECT * FROM conversation_review_intents WHERE user_id=? AND request_key=?').get(userId,input.clientRequestId);
    if(previous){if(previous.case_id!==caseId||hash(JSON.parse(previous.request_json))!==hash(input.conversationAction))fail('CONVERSATION_REVIEW_REPLAY_MISMATCH',409);expire();return result(userId,get(userId,caseId,previous.id),true);}
    const proposal=loadConversationAction(api,userId,record,input.conversationAction),rows=reviewRows(proposal);
    if(!rows.length)return {intent:null,case:record,unchanged:true};
    expire();
    const history=api.listMessages(userId,proposal.sourceConversationId),last=history.at(-1);
    const pending=db.prepare("SELECT id,prompt_message_id FROM conversation_review_intents WHERE user_id=? AND conversation_id=? AND state='pending'").get(userId,proposal.sourceConversationId);
    if(pending){
     // A new completed conversational turn invalidates, rather than silently answers, an old question.
     if(last?.role==='assistant'&&last.state==='complete'&&last.id!==pending.prompt_message_id)db.prepare("UPDATE conversation_review_intents SET state='expired' WHERE id=?").run(pending.id);
     else fail('CONVERSATION_REVIEW_PENDING',409);
    }
    if(!last||last.role!=='assistant'||last.state!=='complete'||history.some(m=>m.role==='user'&&m.requestId&&!history.some(a=>a.role==='assistant'&&a.requestId===m.requestId)))fail('CONVERSATION_REVIEW_BUSY',409);
    const usage=db.prepare('SELECT COUNT(*) AS count,COALESCE(SUM(length(CAST(request_json AS BLOB))+length(CAST(rows_json AS BLOB))+length(CAST(COALESCE(before_json,\'\') AS BLOB))),0) AS bytes FROM conversation_review_intents WHERE user_id=?').get(userId);
    if(usage.count>=500||usage.bytes+Buffer.byteLength(JSON.stringify([proposal.request,rows,record.fields,record.documentContext]))>4*1024*1024)fail('CAPACITY_REACHED',409);
    const id=randomUUID(),en=input.locale==='en';
    const content=(en?'Please confirm these details, or correct the single detail with “change to …”.':'这些信息对吗？若只有一项，也可回复“改为……”更正。')+'\n'+rows.map(row=>`${labels[row.key]?.[en?0:1]||row.key}: ${row.after||(en?'[missing]':'[待补充]')}${row.conflict?` (${en?'replaces':'替换'}: ${row.before})`:''}`).join('\n')+'\n'+(en?'Confirming records your review only, not agency approval or submission.':'确认仅记录您的核对，不代表机构批准，也不会提交。');
    const prompt=api.appendMessage(userId,proposal.sourceConversationId,{role:'assistant',state:'complete',content});
    db.prepare(`INSERT INTO conversation_review_intents(id,user_id,case_id,conversation_id,request_key,request_json,rows_json,expected_version,prompt_message_id,expires_at,state) VALUES(?,?,?,?,?,?,?,?,?,?,'pending')`).run(id,userId,caseId,proposal.sourceConversationId,input.clientRequestId,JSON.stringify(proposal.request),JSON.stringify(rows),record.version,prompt.id,now()+15*60*1000);
    return result(userId,get(userId,caseId,id));
   });
  },
  read(userId,caseId,id){return transaction(()=>{expire();return result(userId,get(userId,caseId,id));});},
  reply(userId,caseId,id,input){
   keys(input,['conversationId','expectedVersion','clientMessageId','answer']);
   if(!reviewId(input.conversationId)||!reviewId(input.clientMessageId)||!Number.isSafeInteger(input.expectedVersion)||typeof input.answer!=='string')fail();
   return transaction(()=>{
    const row=get(userId,caseId,id);
    if(row.conversation_id!==input.conversationId||row.expected_version!==input.expectedVersion)fail('CONVERSATION_REVIEW_SCOPE',409);
    if(row.answer_key){if(row.answer_key!==input.clientMessageId||row.answer_text!==input.answer.trim())fail('CONVERSATION_REVIEW_REPLAY_MISMATCH',409);return result(userId,row,true);}
    if(row.state!=='pending'||row.expires_at<=now())fail('CONVERSATION_REVIEW_EXPIRED',409);
    const record=own(userId,caseId);
    const answer=interpretReviewAnswer(input.answer,JSON.parse(row.rows_json));
    if(answer.kind!=='cancel'){
     if(record.version!==row.expected_version)fail('CASE_CONFLICT',409);
     if(api.listMessages(userId,row.conversation_id).at(-1)?.id!==row.prompt_message_id)fail('CONVERSATION_REVIEW_SCOPE',409);
     // Reread the immutable source through ownership/version validation before writing.
     loadConversationAction(api,userId,record,JSON.parse(row.request_json));
    }
    const reply=api.appendMessage(userId,row.conversation_id,{role:'user',state:'complete',content:answer.text,clientMessageId:input.clientMessageId});
    let updated=record;
    if(answer.kind==='confirm')updated=api.updateCase(userId,caseId,reviewedPayload(record,answer.rows,{answerMessageId:reply.id,sourceMessageId:JSON.parse(row.request_json).sourceMessageId,conversationId:row.conversation_id,intentId:id,now:new Date(now()).toISOString()}),record.version,{archiveLegacyDraft:true});
    db.prepare('UPDATE conversation_review_intents SET state=?,answer_key=?,answer_text=?,answer_message_id=?,applied_version=?,before_json=? WHERE id=?').run(answer.kind==='cancel'?'cancelled':'applied',input.clientMessageId,answer.text,reply.id,updated.version,answer.kind==='confirm'?JSON.stringify({fields:record.fields,documentContext:record.documentContext||{}}):null,id);
    return result(userId,get(userId,caseId,id));
   });
  },
  undo(userId,caseId,id,input){
   keys(input,['conversationId','expectedVersion','clientMessageId']);
   if(!reviewId(input.conversationId)||!reviewId(input.clientMessageId)||!Number.isSafeInteger(input.expectedVersion))fail();
   return transaction(()=>{
    const row=get(userId,caseId,id);
    if(row.conversation_id!==input.conversationId)fail('CONVERSATION_REVIEW_SCOPE',409);
    if(row.undo_key){if(row.undo_key!==input.clientMessageId)fail('CONVERSATION_REVIEW_REPLAY_MISMATCH',409);return result(userId,row,true);}
    const record=own(userId,caseId);
    if(row.state!=='applied'||row.applied_version!==input.expectedVersion||record.version!==input.expectedVersion)fail('CASE_CONFLICT',409);
    const reply=api.appendMessage(userId,row.conversation_id,{role:'user',state:'complete',content:'Withdraw my review of question '+id,clientMessageId:input.clientMessageId});
    api.updateCase(userId,caseId,{...casePayload(record),...JSON.parse(row.before_json)},record.version,{archiveLegacyDraft:true});
    db.prepare("UPDATE conversation_review_intents SET state='undone',undo_key=?,undo_message_id=? WHERE id=?").run(input.clientMessageId,reply.id,id);
    return result(userId,get(userId,caseId,id));
   });
  }
 };
}
