/** Deterministic review of an explicitly targeted human reply. Never called by model tools. */
import { FIELDS } from './public/core.js';
import { DocumentContextError, mergeDocumentContext } from './document-context.js';
export const reviewFail = (code='CONVERSATION_REVIEW_INVALID',status=400) => { throw new DocumentContextError(code,status); };
export const reviewId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
export function reviewKeys(value, allowed, required=allowed) {
  if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(key=>!allowed.includes(key)) || required.some(key=>!Object.hasOwn(value,key))) reviewFail();
}
export const casePayload = record => Object.fromEntries(['title','sourceText','fields','draftType','draftText','extractionMode','namesVerified','clientId','documentContext','caseIssues'].filter(key=>Object.hasOwn(record,key)).map(key=>[key,record[key]]));
export function reviewRows(proposal) {
  if(proposal.action!=='prepare_case_suggestion') reviewFail();
  return proposal.preview.filter(row=>!(row.confirmed && !row.conflict && row.before===row.after));
}
export function interpretReviewAnswer(answer,rows) {
  if(typeof answer!=='string' || answer.length>3100) reviewFail();
  const text=answer.trim();
  if(/^(取消|先不改|cancel)$/iu.test(text)) return {kind:'cancel',text};
  if(/^(确认以上信息|确认|正确|没错|confirm|yes)$/iu.test(text)) {
    if(rows.some(row=>!row.after.trim())) reviewFail('CONVERSATION_REVIEW_MISSING',409);
    return {kind:'confirm',text,rows};
  }
  const correction=/^(?:改为|更正为|change to):?\s*(.+)$/iu.exec(text);
  if(correction && rows.length===1) {
    const value=correction[1].trim(),limit=rows[0].group==='factChanges'?3000:1000;
    if(!value || value.length>limit || /[\u0000-\u001f\u007f\u2028\u2029]/u.test(value)) reviewFail();
    return {kind:'confirm',text,rows:[{...rows[0],after:value}]};
  }
  reviewFail('CONVERSATION_REVIEW_CLARIFY',409);
}
export function reviewedPayload(record,rows,{answerMessageId,sourceMessageId,conversationId,intentId,now}) {
  const source=`Human reply ${answerMessageId}; question ${intentId}; source ${sourceMessageId}; conversation ${conversationId}`;
  const fields=FIELDS.map(key=>({...record.fields.find(field=>field.key===key)||{key,value:'',source:'',confirmed:false,conflict:false}}));
  const changes={};
  for(const row of rows) {
    if(row.group==='changes') changes[row.key]={value:row.after,source,sourceMessageId:answerMessageId};
    else {
      const field=fields.find(field=>field.key===row.key);
      if(field.value!==row.after){delete field.sourceCell;delete field.sources;}
      Object.assign(field,{value:row.after,source,confirmed:true,conflict:false,edited:true});
    }
  }
  return {...casePayload(record),fields,documentContext:mergeDocumentContext(record.documentContext||{},changes,{confirm:true,confirmedAt:now,replaceConfirmed:true})};
}
