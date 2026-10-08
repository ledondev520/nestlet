import { conversationHref } from '@/lib/conversation-index';
export function ConversationRail({lang='zh',state,selectedId,onOpen,onRetry}){
 const en=lang==='en';
 return <nav className="wb-rail-section" aria-label={en?'Conversations':'对话记录'}>
  <p className="wb-rail-heading">{en?'Conversations':'对话记录'}</p>
  <button type="button" className="wb-tab" onClick={onRetry}>{en?'Refresh list':'刷新列表'}</button>
  {state.phase==='loading'&&<p role="status" className="wb-case-meta">{en?'Loading conversations…':'正在读取对话…'}</p>}
  {state.phase==='error'&&<p role="alert" className="wb-case-meta">{en?'Conversation history could not load. Try again.':'暂时无法读取对话记录，请重试。'}</p>}
  {state.data?.length===0&&<p className="wb-case-meta">{en?'Your conversations will appear here.':'聊过的内容会保存在这里。'}</p>}
  {state.data?.map(row=><a key={row.id} href={conversationHref(row.id)} className="wb-rail-item" aria-current={selectedId===row.id?'page':undefined} onClick={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();onOpen(row);}}><span className="wb-rail-item-label">{row.title}</span></a>)}
 </nav>;
}
