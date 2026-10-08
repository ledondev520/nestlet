import {normalizeMessages} from './logic.js';

export function pendingTurns(earlier=[],current=null){
 const byQuestion=new Map();
 for(const turn of [...earlier,current])if(turn?.assistant?.localOnly&&turn.assistant.content)byQuestion.set(turn.user.clientMessageId,turn);
 return [...byQuestion.values()];
}
export const turnSnapshot=turn=>({userMessageId:turn.user.id,clientMessageId:turn.user.clientMessageId,question:turn.user.content,
 assistantMessageId:turn.assistant.id,reply:turn.assistant.content,requestId:turn.assistant.requestId||null});
export const restoredTurn=turn=>({user:{id:turn.userMessageId,clientMessageId:turn.clientMessageId,role:'user',content:turn.question,state:'complete',localOnly:true},
 assistant:{id:turn.assistantMessageId,requestId:turn.requestId,role:'assistant',content:turn.reply,state:'interrupted',localOnly:true,streaming:false}});

// Reconcile each unconfirmed copy independently. A newer successful answer is
// never evidence that an older received answer was saved. Cards are not revived.
export function reconcilePendingTurns(stored,turns){
 const canonical=normalizeMessages(stored),messages=[...canonical],remaining=[],completed=[];
 for(const turn of pendingTurns(turns)){
  const index=canonical.findIndex(message=>message.clientMessageId===turn.user.clientMessageId);
  const savedUser=canonical[index];
  const saved=index<0?null:canonical.slice(index+1).find(message=>message.role==='assistant'&&
   (message.id===turn.assistant.id||message.requestId&&message.requestId===savedUser.requestId));
  if(saved&&(saved.state==='complete'||saved.content===turn.assistant.content)){
   if(saved.state==='complete')completed.push(turn.user.clientMessageId);
   continue;
  }
  remaining.push(turn);
  let position=messages.findIndex(message=>message.clientMessageId===turn.user.clientMessageId);
  if(position<0){messages.push({...turn.user,images:undefined,localOnly:true});position=messages.length-1;}
  const duplicate=messages.findIndex(message=>message.id===turn.assistant.id);
  if(duplicate>=0){messages.splice(duplicate,1);if(duplicate<=position)position--;}
  messages.splice(position+1,0,{...turn.assistant,state:'interrupted',streaming:false,localOnly:true});
 }
 return {messages,remaining,completed};
}
