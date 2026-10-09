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

/** Read-only navigation context, never an invented or persisted conversation title. */
export function conversationDetails(row, lang='zh') {
  const date = typeof row.updatedAt === 'string' && /^\d{4}-\d{2}-\d{2}T/u.test(row.updatedAt) ? new Date(row.updatedAt) : null;
  const time = date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(lang==='en'?'en-GB':'zh-CN', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date) : '';
  const reference = /^DH\d{8}$/u.test(row.displayId || '') ? row.displayId : '';
  const raw = typeof row.lastMessage?.preview === 'string' ? row.lastMessage.preview : '';
  // Do not spread likely pasted credentials into navigation. This is a
  // conservative display guard, not a claim to redact arbitrary private data.
  const sensitive = /(?:\bsk[-_]|\bBearer\s|api[ _-]?key|password|secret|token\s*[:=]|密码|密钥|私钥|-----BEGIN)/iu.test(raw);
  const plain = raw.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/gu,' ').replace(/\s+/gu,' ').trim();
  const chars = [...plain];
  const preview = sensitive ? '' : chars.slice(0,60).join('') + (chars.length>60?'…':'');
  return { metadata: [time,reference].filter(Boolean).join(' · '), preview };
}
