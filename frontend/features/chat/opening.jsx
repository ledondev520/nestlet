import { conversationHref, openingSuggestions } from '@/lib/conversation-index';
export function ConversationOpening({lang='zh',state,onOpen,onPrompt,disabled=false}){
 const en=lang==='en', suggestions=openingSuggestions(state?.data||[]);
 const reason={interrupted:en?'Pick up the interrupted reply':"继续对话",draft:en?'Review the saved draft':"核对草稿",recent:en?'Continue our conversation':"继续对话"};
 const starters=en?['Help me organize the materials I have','Help me prepare an English follow-up draft']:['帮我整理手头的材料','帮我准备一份英文跟进草稿'];
 return <div className="chat-empty" data-conversation-opening>
  <h1>{en?'Hi, I’m Nestlet.':'你好，我是巢小秘。'}</h1>
  <p className="whitespace-pre-line text-sm text-muted-foreground">{en?'I can help organize materials, check facts with you, and prepare English document drafts. What would you like to work on today?':"整理材料、核对信息、准备英文草稿。\n今天想先处理什么？"}</p>
  {state?.phase==='loading'&&<p className="whitespace-pre-line" role="status">{en?'Checking our recent conversations…':"正在读取最近对话…"}</p>}
  {state?.phase==='error'&&<p className="whitespace-pre-line" role="status">{en?'I couldn’t load our past conversations. You can still start something new.':"暂时无法读取历史对话。\n你可以直接开始新对话。"}</p>}
  {suggestions.length>0?<><p className="whitespace-pre-line text-sm">{en?'Here are a few places we can pick up:':"也可以接着上次聊："}</p><ul className="space-y-2 text-left">{suggestions.map(row=><li key={row.id}><a className="underline break-words" href={conversationHref(row.id)} aria-disabled={disabled} onClick={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();if(!disabled)onOpen?.(row);}}>{reason[row.reason]} · {row.title}</a></li>)}</ul></>:state?.phase!=='loading'&&<div className="flex flex-wrap justify-center gap-2">{starters.map((prompt,index)=><button className="rounded border px-3 py-2 text-sm" disabled={disabled} key={prompt} type="button" onClick={()=>onPrompt(prompt)}>{en?prompt:['整理材料','跟进草稿'][index]}</button>)}</div>}
 </div>;
}
