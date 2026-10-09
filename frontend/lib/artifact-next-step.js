/** Read-only presentation. A stored artifact version is not a case version, and
 * readiness alone says nothing about whether a document already exists. */
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
const positive = value => Number.isSafeInteger(value) && value > 0;
const kinds = ['followup', 'missing-documents', 'status-summary'];
export function artifactNextStep(record, artifacts, kind = record?.draftType) {
  const unknown = { phase: 'unknown', artifact: null, newerDraft: null };
  if (!uuid(record?.id) || !positive(record.version) || !kinds.includes(kind) || !Array.isArray(artifacts)) return unknown;
  if (artifacts.some(item => !uuid(item?.id) || item.caseId !== record.id || !positive(item.version) || !positive(item.sourceCaseVersion) || !positive(item.currentCaseVersion) || !kinds.includes(item.kind) || !['draft','final'].includes(item.status) || typeof item.isStale !== 'boolean' || typeof item.needsRegeneration !== 'boolean' || item.currentCaseVersion !== record.version || item.isStale !== (item.sourceCaseVersion !== item.currentCaseVersion) || item.needsRegeneration !== (item.status === 'final' && item.isStale))) return unknown;
  const versions = artifacts.filter(item => item.kind === kind).sort((a, b) => b.version - a.version);
  const current = versions.filter(item => item.sourceCaseVersion === record.version && item.isStale === false && item.needsRegeneration === false);
  const final = current.find(item => item.status === 'final');
  const draft = current.find(item => item.status === 'draft');
  if (final) return { phase: 'final', artifact: final, newerDraft: draft?.version > final.version ? draft : null };
  if (draft) return { phase: 'draft', artifact: draft, newerDraft: null };
  return versions.length ? { phase: 'historical', artifact: versions[0], newerDraft: null } : { phase: 'empty', artifact: null, newerDraft: null };
}
export const artifactNextStepCopy = {
  zh: {final:'已有当前资料的完成版。', draft:'已有草稿，仍需核对。', historical:'已有文档对应旧资料，需更新。', unknown:'暂时无法核实文档版本，请刷新。', newerDraft:'另有较新草稿，尚未完成。', view:'查看文档', openFinal:'查看完成版', openDraft:'继续草稿', generateAnother:'另建文档'},
  en: {final:'A final document matches the saved case.', draft:'A saved draft still needs review.', historical:'Saved documents use older case details and need updating.', unknown:'Document versions could not be verified. Refresh to check.', newerDraft:'A newer draft is also saved and is not final.', view:'View saved documents', openFinal:'Open current final', openDraft:'Continue saved draft', generateAnother:'Generate another document'}
};
