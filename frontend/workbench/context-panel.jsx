import { useState } from 'react';
import { useSession } from '@/lib/session';
import { AgencyGuidance } from '@/components/agency-guidance';
import { documentCopy } from '@/features/documents/copy';
import { useScopedRead } from '@/lib/use-scoped-read';
import { readInboxContext, readinessReasonLabel } from '@/lib/inbox-read-model';
const copy={zh:{readiness:'文书准备度',ready:'已保存的资料已齐备',missing:'仍需补充',facts:'案例事实',materials:'材料',artifacts:'文书版本',empty:'选择事项后可查看已保存的上下文。',none:'暂无已保存记录',error:'暂时无法加载上下文，请重试。',loading:'正在载入…',refresh:'刷新上下文',final:'完成版',draft:'草稿',historical:'历史版本',reviewed:'已核对',unreviewed:'待核对',conflict:'有冲突',openMaterials:'查看材料与事实',openDocuments:'查看文书'},en:{readiness:'Document readiness',ready:'Saved details are ready',missing:'Still needed',facts:'Case facts',materials:'Materials',artifacts:'Document versions',empty:'Select a case to see its saved context.',none:'No saved records yet',error:'The context could not load. Try again.',loading:'Loading…',refresh:'Refresh context',final:'Final',draft:'Draft',historical:'Historical version',reviewed:'Reviewed',unreviewed:'Needs review',conflict:'Conflicting',openMaterials:'View materials and facts',openDocuments:'View documents'}};
export function ContextPanel({lang='zh',caseId,guidanceAgency,onAgencyChange,onOpenMaterials,onOpenDocuments,refreshKey='',showCaseDetails=true,showGuidance=true}){
 const t=copy[lang]||copy.zh,d=documentCopy(lang),{api,status,dataRevision=0}=useSession(),[retry,setRetry]=useState(0);
 const key=status.authenticated&&status.userId&&caseId?JSON.stringify([status.userId,caseId,lang,refreshKey,dataRevision,retry]):null;
 const state=useScopedRead(api,key,signal=>readInboxContext(api,caseId,lang,signal)),data=state.data;
 return <div className="wb-context-inner">
  {caseId&&<button type="button" className="wb-tab" onClick={()=>setRetry(value=>value+1)}>{t.refresh}</button>}
  {!caseId&&<p className="wb-case-meta">{t.empty}</p>}
  {state.phase==='loading'&&<p role="status" className="wb-case-meta">{t.loading}</p>}
  {state.phase==='error'&&<p role="alert" className="wb-case-meta">{t.error}</p>}
  {data&&<>
   {showCaseDetails&&<section className="wb-context-section" aria-label={t.readiness}><h2 className="wb-context-heading">{t.readiness}</h2><p className="wb-case-meta">{data.readiness.ready?t.ready:t.missing}</p><ul className="wb-case-meta">{data.readiness.missing.map(item=><li key={item.key}>{readinessReasonLabel(item.reason,lang)?<>{d.fields[item.key]||item.label} · <span data-readiness-reason={item.reason} className={item.reason==='conflict'?'text-destructive':''}>{readinessReasonLabel(item.reason,lang)}</span></>:item.question}</li>)}</ul>{!!data.readiness.missing.length&&<details className="wb-case-meta"><summary>{lang==='en'?'Full questions':'查看完整问题'} · {data.readiness.missing.length}</summary><ul>{data.readiness.missing.map(item=><li key={item.key}>{item.question}</li>)}</ul></details>}</section>}
   {showCaseDetails&&<section className="wb-context-section" aria-label={t.facts}><h2 className="wb-context-heading">{t.facts}</h2><dl className="wb-case-meta">{data.record.fields.map(field=><div key={field.key}><dt>{d.fields[field.key]||field.key} · {field.conflict?t.conflict:field.confirmed?t.reviewed:t.unreviewed}</dt><dd className="break-words">{field.value||'—'}</dd></div>)}</dl></section>}
   <section className="wb-context-section" aria-label={t.materials}><h2 className="wb-context-heading">{t.materials}</h2><ul className="wb-case-meta">{data.assets.map(asset=><li className="break-words" key={asset.id}>{asset.originalFilename}</li>)}</ul>{!data.assets.length&&<p className="wb-case-meta">{t.none}</p>}{onOpenMaterials&&<button type="button" className="wb-tab" onClick={onOpenMaterials}>{t.openMaterials}</button>}</section>
   <section className="wb-context-section" aria-label={t.artifacts}><h2 className="wb-context-heading">{t.artifacts}</h2>{data.artifacts.map(artifact=><p className="wb-case-meta break-words" key={artifact.id}>{artifact.title||artifact.kind} · {artifact.status==='final'?t.final:t.draft} · v{artifact.version}{artifact.isStale?` · ${t.historical}`:''}</p>)}{!data.artifacts.length&&<p className="wb-case-meta">{t.none}</p>}{onOpenDocuments&&<button type="button" className="wb-tab" onClick={onOpenDocuments}>{t.openDocuments}</button>}</section>
  </>}
  {showGuidance&&<AgencyGuidance lang={lang} agency={guidanceAgency} onAgencyChange={onAgencyChange}/>}
 </div>;
}
