import {caseReviewRows} from '@/lib/case-review-status';
import {documentCopy} from '@/features/documents/copy';
const states={zh:{reviewed:'已核对',missing:'未填写',unconfirmed:'待核对',conflict:'有冲突'},en:{reviewed:'Reviewed',missing:'Not supplied',unconfirmed:'Needs review',conflict:'Conflict'}};
export function CaseReviewStatus({record,readiness,lang='zh'}){
 const en=lang==='en',labels=states[en?'en':'zh'],d=documentCopy(lang),rows=caseReviewRows(record,readiness);
 return <section aria-label={en?'Fact review result':'核对结果'} className="space-y-3 rounded-lg border p-4">
  <h2 className="text-sm font-medium">{en?'Fact review result':'核对结果'}</h2>
  <p className="whitespace-pre-line text-sm">{en?'This checks saved facts. Document requirements depend on the selected letter; official submission requirements remain unverified.':'这里只检查已保存的事项信息。\n文书要求取决于所选类型。\n官方提交材料仍须另行核实。'}</p>
  <dl className="space-y-3">{rows.map(row=><div key={row.key} className="text-sm"><dt className="flex flex-wrap gap-2"><span aria-hidden="true">{row.state==='reviewed'?'✓':'○'}</span><span>{d.fields[row.key]}</span><span className={row.state==='reviewed'?'text-muted-foreground':'text-destructive'}>{labels[row.state]}</span></dt><dd className="mt-1 break-words text-xs text-muted-foreground">{row.value||'—'}{row.blocksDocument?` · ${en?'Required before generating this document':'生成此文书前需补齐'}`:row.omitted?` · ${en?'Optional for this document; omitted from output':'此文书可选，生成时不写入'}`:''}</dd></div>)}</dl>
 </section>;
}
