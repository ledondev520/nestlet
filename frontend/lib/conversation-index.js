const uuid=value=>typeof value==='string'&&/^[0-9a-f-]{36}$/u.test(value);
export function conversationHref(id){return `#chat?conversation=${encodeURIComponent(id)}`;}
export function conversationFromHash(hash){
  const match=/^#chat\?conversation=([0-9a-f-]{36})$/u.exec(hash);
  return match?.[1] || null;
}
export async function readConversationIndex(api,signal){
  const result=await api.get('/api/conversations',{signal});
  if(!Array.isArray(result.conversations)||result.conversations.length>1000||result.conversations.some(row=>!uuid(row.id)||!uuid(row.caseId)||typeof row.title!=='string'||row.title.length>120||!Number.isSafeInteger(row.draftCount)||row.draftCount<0||row.lastMessage!==null&&(!row.lastMessage||!['user','assistant'].includes(row.lastMessage.role)||!['complete','interrupted','failed'].includes(row.lastMessage.state)||typeof row.lastMessage.preview!=='string'||[...row.lastMessage.preview].length>160)))throw new Error('INVALID_RESPONSE');
  return result.conversations;
}
/** Only a persisted unfinished reply or current draft earns an unfinished label. */
export function openingSuggestions(rows){
  return rows.filter(row=>row.lastMessage).map((row,index)=>({...row,reason:row.lastMessage.role==='assistant'&&row.lastMessage.state!=='complete'?'interrupted':row.draftCount>0?'draft':'recent',index}))
    .sort((a,b)=>(a.reason==='recent')-(b.reason==='recent')||a.index-b.index).slice(0,3);
}
