import { useState } from 'react';
import { useSession } from '@/lib/session';
import { useScopedRead } from '@/lib/use-scoped-read';
import { readInboxRail } from '@/lib/inbox-read-model';
const copy={zh:{cases:'事项',empty:'还没有已保存的事项。',error:'暂时无法加载列表，请重试。',loading:'正在载入…',retry:'刷新列表',untitled:"未命名"},en:{cases:'Cases',empty:'No saved cases yet.',error:'The list could not load. Try again.',loading:'Loading…',retry:'Refresh list',untitled:'Untitled case'}};
export function CaseRail({lang='zh',selectedCaseId,onSelectCase,refreshKey=''}){
 const t=copy[lang]||copy.zh,{api,status,dataRevision=0}=useSession(),[retry,setRetry]=useState(0);
 const key=status.authenticated&&status.userId?JSON.stringify([status.userId,selectedCaseId,lang,refreshKey,dataRevision,retry]):null;
 const state=useScopedRead(api,key,signal=>readInboxRail(api,signal));
 const data=state.data;
 return <nav className="wb-rail-section" aria-label={t.cases}>
  <p className="wb-rail-heading">{t.cases}</p><button type="button" className="wb-tab" onClick={()=>setRetry(value=>value+1)}>{t.retry}</button>
  {state.phase==='loading'&&<p role="status" className="wb-case-meta">{t.loading}</p>}
  {state.phase==='error'&&<p role="alert" className="wb-case-meta">{t.error}</p>}
  {data&&!data.cases.length&&<p className="wb-case-meta">{t.empty}</p>}
  {data?.cases.map(record=><button key={record.id} type="button" className="wb-rail-item" aria-current={record.id===selectedCaseId?'true':undefined} onClick={event=>{if(onSelectCase?.(record.id,record.title)===false)event.preventDefault();}}>
   <span className="wb-rail-item-label">{record.title||t.untitled}</span>{record.clientId&&<span className="wb-case-meta">{data.clients.find(client=>client.id===record.clientId)?.displayName||''}</span>}
  </button>)}
 </nav>;
}
