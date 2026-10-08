import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { normalizeConversationProposal } from './conversation-actions.js';
import { buildChatTurn, readChatEvents } from './logic.js';
export function fixtureProposal() {
  const caseId=randomUUID(),sourceConversationId=randomUUID(),sourceMessageId=randomUUID();
  const request={action:'prepare_case_suggestion',expectedVersion:1,sourceConversationId,sourceMessageId,factChanges:{property:{value:'128 Synthetic Lane'}},changes:{}};
  return {requestId:randomUUID(),proposal:{...request,caseId,requiresExplicitApply:true,request,confirm:false,preview:[{group:'factChanges',key:'property',before:'',after:'128 Synthetic Lane',confirmed:false,conflict:false}],conflicts:[],apply:{method:'PATCH',path:`/api/cases/${caseId}/document-context`,body:{conversationAction:request}}}};
}
const frame=(name,value)=>`event: ${name}\ndata: ${JSON.stringify(value)}\n\n`;
const collect=async(text)=>{const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(text));c.close();}}),rows=[];for await(const packet of readChatEvents(stream))rows.push(packet);return rows;};
test('action consent is explicit, per message, and requires saved scoped IDs',()=>{
 const turn={caseId:randomUUID(),conversationId:randomUUID(),clientMessageId:randomUUID(),text:'Prepare a reviewable change'};
 assert.equal('actionConsent' in buildChatTurn(turn),false);
 assert.equal(buildChatTurn({...turn,actionConsent:true}).actionConsent,true);
 for(const value of [null,'true',1,{}])assert.throws(()=>buildChatTurn({...turn,actionConsent:value}),{code:'CHAT_INVALID'});
 assert.throws(()=>buildChatTurn({...turn,actionConsent:true,conversationId:null}),{code:'CHAT_INVALID'});
});
test('proposal normalization rejects executable destinations, mismatched previews, forged review status and unbounded data',()=>{
 const original=fixtureProposal();assert.equal(normalizeConversationProposal(original).proposal.preview[0].after,'128 Synthetic Lane');
 for(const mutate of [p=>p.apply.path='/api/other',p=>p.apply.method='DELETE',p=>p.request.sourceMessageId=randomUUID(),p=>p.requiresExplicitApply=false,p=>p.preview[0].after='Not the value that will be applied',p=>p.preview[0].conflict='true',p=>p.preview.push(p.preview[0]),p=>p.request.factChanges.owner={value:'x'.repeat(3001)},p=>p.request.unknown=true]){
   const packet=structuredClone(original);mutate(packet.proposal);assert.throws(()=>normalizeConversationProposal(packet),{code:'CHAT_STREAM_FAILED'});
 }
 const conflict=fixtureProposal();conflict.proposal.preview[0].before='Reviewed address';conflict.proposal.preview[0].confirmed=true;conflict.proposal.preview[0].conflict=true;conflict.proposal.conflicts=['property'];assert.deepEqual(normalizeConversationProposal(conflict).proposal.conflicts,['property']);
});
test('proposal stream must finish with matching request ID; incomplete, duplicate terminal and oversized proposal sequences fail',async()=>{
 const packet=fixtureProposal(),done={requestId:packet.requestId,assistantMessageId:randomUUID()};
 assert.deepEqual((await collect(frame('proposal',packet)+frame('delta',{text:'Review this proposal.'})+frame('done',done))).map(row=>row.type),['proposal','delta','done']);
 for(const text of [frame('proposal',packet),frame('proposal',packet)+frame('done',{...done,requestId:randomUUID()}),frame('done',done)+frame('proposal',packet),frame('proposal',packet).repeat(9)+frame('done',done)])await assert.rejects(collect(text));
});
