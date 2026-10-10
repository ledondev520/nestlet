import {getAgencyGuidance} from '../../../public/agency-guidance.js';
import {savedAgencyId,caseReviewRows} from '@/lib/case-review-status';
import {documentCopy} from './copy';

/** A reference worksheet, never a field mapping certified for an official template. */
export function OfficialPreparation({record,lang='zh'}){
 const en=lang==='en',agency=savedAgencyId(record),guidance=getAgencyGuidance(agency||'unknown',en?'en':'zh'),d=documentCopy(lang);
 return <details className="rounded-lg border bg-card p-4" data-testid="official-preparation">
  <summary className="cursor-pointer text-sm font-medium">{en?'Prepare official forms':'官方表格'}</summary>
  <div className="mt-4 space-y-4 text-sm">
   <p className="whitespace-pre-line">{en?'Nestlet generates supplementary letters, not completed RTA forms. Use this worksheet beside the official form; verify each field and the accepted edition with the responsible agency.':'本工具生成英文补充信函。\n不会填写或替代官方RTA表格。\n请用下表对照官方表格。\n字段含义及受理版本须向机构核实。'}</p>
   <ol className="list-decimal space-y-2 pl-5">
    <li>{en?'Confirm the responsible agency and the voucher deadline; a document date is not a voucher deadline.':'确认负责机构和凭证到期日。文书日期不等于凭证到期日。'}</li>
    <li>{en?'Obtain the agency’s currently accepted forms and checklist using its official sources below.':'从下方官方来源获取表格。向机构确认当前材料清单。'}</li>
    <li>{en?'Compare saved facts below with the form. Fill missing details and arrange any required signatures separately.':'对照已存信息填写，补充缺项。所需签署请另行安排。'}</li>
    <li>{en?'Check the submission channel, attachments and deadline with the agency. Downloaded letters have not been submitted.':'向机构核对递交渠道和期限。检查附件，下载文书不代表已提交。'}</li>
   </ol>
   <p className="whitespace-pre-line text-xs text-muted-foreground">{en?'Reference links follow the saved case agency when recognized. Applicability and accepted editions remain unconfirmed.':'参考链接按已存机构信息显示。\n适用性与受理版本仍待确认。'} · {guidance.label}</p>
   <ul className="space-y-2">{guidance.links.map(link=><li key={link.id}><a className="break-words underline underline-offset-4" href={link.url} target="_blank" rel="noreferrer noopener">{link.title} ↗</a></li>)}</ul>
   <h3 className="font-medium">{en?'Saved facts to compare':'填写对照'}</h3>
   <dl className="space-y-3">{caseReviewRows(record).map(row=><div key={row.key}><dt className="font-medium">{d.fields[row.key]}</dt><dd className="break-words">{row.state==='reviewed'?row.value:(en?'Check this fact before copying':'请先核对此项再填写')}</dd>{row.state==='reviewed'&&row.source&&<dd className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">{en?'Source: ':'出处：'}{row.source}</dd>}</div>)}</dl>
   <p className="whitespace-pre-line text-xs text-muted-foreground">{en?'This is not an exhaustive official checklist. Handle tax IDs and bank details through the agency’s approved secure channel, outside this chat.':'这不是完整的官方材料清单。\n税号和银行资料请走机构安全渠道。\n不要在对话中填写这些号码。'}</p>
  </div>
 </details>;
}
