/** Text-only suspended edits. Never a cache of server case records or history. */
import { DOCUMENT_KINDS, FACT_KEYS, DETAIL_KEYS, ISSUE_STATUSES } from './helpers.js';
const allowed = ['caseId','baseVersion','kind','content','artifactTitle','saveStatus','answers','namesVerified','issueForm','issueBaseline','selectedArtifactId','detailForm'];
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype,null].includes(Object.getPrototypeOf(value));
const text = (value, max) => typeof value === 'string' && value.length <= max && !value.includes('\u0000');
const keys = (value, names) => plain(value) && Object.keys(value).every(key => names.includes(key));
const field = key => [...FACT_KEYS,...DETAIL_KEYS].includes(key);

export function validDocumentRecovery(value, caseId) {
  if (!keys(value,allowed) || !uuid(value.caseId) || value.caseId !== caseId || !Number.isSafeInteger(value.baseVersion) || value.baseVersion < 1 || !DOCUMENT_KINDS.includes(value.kind)) return false;
  if (Object.hasOwn(value,'content') && !text(value.content,50000)) return false;
  if (Object.hasOwn(value,'artifactTitle') && !text(value.artifactTitle,120)) return false;
  if (value.saveStatus !== undefined && !['draft','final'].includes(value.saveStatus)) return false;
  if (value.namesVerified !== undefined && typeof value.namesVerified !== 'boolean') return false;
  if (value.selectedArtifactId !== undefined && value.selectedArtifactId !== null && !uuid(value.selectedArtifactId)) return false;
  if (value.answers !== undefined) {
    if (!plain(value.answers) || Object.keys(value.answers).some(key => !field(key))) return false;
    for (const [key, answer] of Object.entries(value.answers)) {
      const max = FACT_KEYS.includes(key) ? 3000 : 1000;
      if (typeof answer === 'string') {if (!text(answer,max)) return false; continue;}
      if (!keys(answer,['value','notApplicable','sourceMessageId']) || !text(answer.value,max) || (answer.notApplicable !== undefined && typeof answer.notApplicable !== 'boolean') || (answer.sourceMessageId !== undefined && answer.sourceMessageId !== null && !uuid(answer.sourceMessageId))) return false;
    }
  }
  if (value.issueForm !== undefined && value.issueForm !== null) {
    const issue = value.issueForm;
    if (!keys(issue,['id','question','resolution','status','sourceMessageId']) || (issue.id !== undefined && !uuid(issue.id)) || !text(issue.question,500) || !text(issue.resolution,2000) || !ISSUE_STATUSES.includes(issue.status) || (issue.sourceMessageId !== undefined && issue.sourceMessageId !== null && !uuid(issue.sourceMessageId))) return false;
  }
  if (value.issueBaseline !== undefined && !text(value.issueBaseline,6000)) return false;
  if (value.detailForm !== undefined && value.detailForm !== null) {
    const form = value.detailForm;
    if (!keys(form,['key','value','notApplicable','touched']) || !field(form.key) || !text(form.value,FACT_KEYS.includes(form.key) ? 3000 : 1000) || typeof form.notApplicable !== 'boolean' || typeof form.touched !== 'boolean') return false;
  }
  return new TextEncoder().encode(JSON.stringify(value)).byteLength <= 512 * 1024;
}

export function documentDraftSnapshot(state) {
  if (!state.record) return null;
  const baseContent = state.selected?.content ?? state.record.draftText;
  const baseTitle = state.selected?.title || '';
  const editedBody = state.content !== baseContent, editedTitle = state.artifactTitle !== baseTitle;
  const issueDirty = state.issueForm && JSON.stringify(state.issueForm) !== state.issueBaseline;
  const result = {caseId:state.record.id,baseVersion:state.recoveryBaseVersion ?? state.record.version,kind:state.kind,
    ...(Object.keys(state.answers).length ? {answers:state.answers} : {}),
    ...(state.namesVerified !== state.record.namesVerified ? {namesVerified:state.namesVerified} : {}),
    ...(editedBody ? {content:state.content} : {}), ...(editedTitle ? {artifactTitle:state.artifactTitle} : {}),
    ...(editedBody || editedTitle ? {selectedArtifactId:state.selected?.id || null,saveStatus:state.saveStatus} : {}),
    ...(issueDirty ? {issueForm:state.issueForm,issueBaseline:state.issueBaseline} : {}),
    ...(state.detailForm?.touched ? {detailForm:state.detailForm} : {})};
  return validDocumentRecovery(result,state.record.id) ? result : null;
}
