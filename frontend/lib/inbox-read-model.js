const kinds = new Set(['followup', 'missing-documents', 'status-summary']);
const invalid = () => { throw new Error('INVALID_RESPONSE'); };
const list = (value, limit = 100) => Array.isArray(value) && value.length <= limit ? value : invalid();
export async function readInboxRail(api, signal) {
  const [saved, customers] = await Promise.all([api.get('/api/cases', {signal}), api.get('/api/clients?limit=100', {signal})]);
  const cases=list(saved.cases), clients=list(customers.clients);
  if(cases.some(row=>typeof row.id!=='string'||typeof row.title!=='string') || clients.some(row=>typeof row.id!=='string'||typeof row.displayName!=='string')) invalid();
  return {cases, clients};
}
export async function readInboxContext(api, caseId, lang, signal) {
  const path = `/api/cases/${encodeURIComponent(caseId)}`;
  const {case:record} = await api.get(path, {signal});
  if(!record || record.id!==caseId || !Number.isSafeInteger(record.version) || !Array.isArray(record.fields) || !kinds.has(record.draftType)) invalid();
  const [readiness, versions, originals] = await Promise.all([
    api.get(`${path}/readiness?kind=${encodeURIComponent(record.draftType)}&locale=${lang === 'en' ? 'en' : 'zh'}`, {signal}),
    api.get(`${path}/artifacts`, {signal}),
    api.get(`/api/assets?caseId=${encodeURIComponent(caseId)}&limit=100`, {signal})
  ]);
  if(typeof readiness.ready!=='boolean' || !Array.isArray(readiness.missing) || readiness.missing.some(item=>typeof item.key!=='string'||typeof item.question!=='string')) invalid();
  const artifacts=list(versions.artifacts), assets=list(originals.assets);
  if(artifacts.some(row=>typeof row.id!=='string'||row.caseId!==caseId)||assets.some(row=>typeof row.id!=='string'||row.caseId!==caseId)) invalid();
  return {record,readiness,artifacts,assets};
}

/** Preserve the reason a concise readiness item is blocked, not only its label. */
export function readinessReasonLabel(reason, lang = 'zh') {
 const labels = {missing:['Missing','待补充'],unconfirmed:['Needs confirmation','待核对'],conflict:['Conflict','有冲突'],english_review:['English review','需核对英文']};
 return Object.hasOwn(labels, reason) ? labels[reason][lang === 'en' ? 0 : 1] : null;
}
