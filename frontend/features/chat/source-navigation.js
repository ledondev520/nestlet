import { normalizeLibrarySources } from './retrieval.js';
import { assetPath } from '../customers/assets-model.js';

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
const fail = code => { throw Object.assign(new Error(code), { code }); };
const version = value => Number.isSafeInteger(value) && value > 0;
const title = value => typeof value === 'string' && value.length <= 500 && !/[\u0000-\u001f\u007f]/u.test(value);
const association = value => value == null || uuid(value);

/** Only the structured server source envelope is actionable. Never parse IDs or
 * URLs out of assistant prose, saved appendices, filenames, or document bodies. */
export function sourceFromEnvelope(envelope, sourceId) {
  const source = normalizeLibrarySources({ ...envelope, appendix: '' }).items.find(item => item.sourceId === sourceId);
  if (!source) fail('SOURCE_INVALID');
  return source;
}

function validateRecord(record, expected, name) {
  if (!record || record.id !== expected.id || !uuid(record.id) || !version(record.version) || !title(record[name]) ||
      !association(record.caseId) || !association(record.clientId)) fail('SOURCE_INVALID');
  if (record.version !== expected.version || ['caseId', 'clientId'].some(key => (record[key] ?? null) !== (expected[key] ?? null))) fail('SOURCE_CHANGED');
  return record;
}

/** Authentication and ownership remain enforced by the existing read APIs.
 * Every action repeats the read: old search metadata never grants access. */
export async function inspectSource(api, envelope, sourceId, { signal } = {}) {
  const source = sourceFromEnvelope(envelope, sourceId);
  const collection = { client: 'clients', case: 'cases', asset: 'assets', artifact: 'artifacts' }[source.kind];
  const result = await api.get(`/api/${collection}/${source.id}`, { signal });
  const name = source.kind === 'client' ? 'displayName' : source.kind === 'asset' ? 'originalFilename' : 'title';
  const record = validateRecord(result?.[source.kind], source, name);
  if (source.kind === 'client') {
    const page = await api.get(`/api/clients/${record.id}/cases`, { signal });
    if (!Array.isArray(page?.cases) || page.cases.length > 100 || page.cases.some(item => !uuid(item?.id) ||
        !version(item.version) || !title(item.title) || item.clientId !== record.id)) fail('SOURCE_INVALID');
    return { source, title: record.displayName, cases: page.cases.map(item => ({ id: item.id, title: item.title, version: item.version, clientId: item.clientId })) };
  }
  if (source.kind === 'asset') return { source, title: record.originalFilename, preview: assetPath(record.id, 'preview'), download: assetPath(record.id, 'download') };
  if (source.kind === 'artifact') {
    if (!uuid(record.caseId) || !['draft', 'final'].includes(record.status) || typeof record.content !== 'string' || record.content.length > 50000) fail('SOURCE_INVALID');
    return { source, title: record.title, content: record.content, stale: record.isStale === true || record.needsRegeneration === true, status: record.status };
  }
  return { source, title: record.title };
}

/** A customer result lists every returned case. Selection is a separate explicit
 * action; no first match or case inferred from model text is adopted. */
export async function sourceCase(api, inspected, selectedCaseId, { signal } = {}) {
  const source = inspected.source;
  const candidate = source.kind === 'client' ? inspected.cases.find(item => item.id === selectedCaseId) : null;
  const id = candidate?.id || (source.kind === 'case' ? source.id : source.caseId);
  if (!uuid(id) || (source.kind === 'client' && !candidate)) fail('SOURCE_INVALID');
  const result = await api.get(`/api/cases/${id}`, { signal });
  const record = result?.case;
  if (!record || record.id !== id || !title(record.title) || !version(record.version) || !association(record.clientId)) fail('SOURCE_INVALID');
  if (candidate && (record.clientId !== source.id || record.version !== candidate.version) ||
      source.clientId && source.kind !== 'client' && record.clientId !== source.clientId ||
      source.kind === 'case' && (record.version !== source.version || (record.clientId ?? null) !== (source.clientId ?? null))) fail('SOURCE_CHANGED');
  return { id: record.id, title: record.title, version: record.version };
}

export const sourceNavigationCopy = {
  zh: {
    history: '已保存回复中的引用仅保留为文本。重新检索后，才可使用经过核对的来源操作。',
    inspect: '查看来源', choose: '选择客户案例', openCase: '打开案例', documents: '打开案例文档', preview: '预览原件（新标签页）', download: '下载原件',
    loading: '正在核对当前来源…', cancel: '取消来源操作', close: '关闭来源详情', empty: '此客户没有已保存的案例。',
    chooseNote: '请选择要继续处理的案例。打开后，后续核对和文档操作将使用该案例。', current: '当前案例',
    changed: '来源版本或所属案例已变化。请重新检索后再选择；当前工作未改变。',
    missing: '来源不存在或当前账号无权访问。当前工作未改变。',
    error: '无法核对来源，请重试。当前工作未改变。',
    historical: '这是历史文档，只供核对。请在案例文档页检查当前版本；现有编辑不会被替换。',
    denied: '已保留当前未保存的内容，未切换案例。',
    signIn: '请重新登录后查看来源。'
  },
  en: {
    history: 'References in saved replies are text only. Search again to enable verified source actions.',
    inspect: 'Inspect source', choose: 'Choose a customer case', openCase: 'Open case', documents: 'Open case documents', preview: 'Preview original (new tab)', download: 'Download original',
    loading: 'Checking the current source…', cancel: 'Cancel source action', close: 'Close source details', empty: 'This customer has no saved cases.',
    chooseNote: 'Choose the case to continue. Subsequent review and document actions will use the case you open.', current: 'Current case',
    changed: 'The source version or case association changed. Search again before selecting it. Your current work is unchanged.',
    missing: 'The source is missing or unavailable to this account. Your current work is unchanged.',
    error: 'The source could not be checked. Try again. Your current work is unchanged.',
    historical: 'This is a saved historical document for review. Check the current version in case documents; existing edits will be preserved.',
    denied: 'Your unsaved work was kept. The case was not switched.',
    signIn: 'Sign in again before opening sources.'
  }
};

export function sourceNavigationError(error, words) {
  if (error?.status === 401 || error?.code === 'AUTH_REQUIRED') return words.signIn;
  if ([403, 404].includes(error?.status)) return words.missing;
  if (error?.code === 'SOURCE_CHANGED') return words.changed;
  return words.error;
}
