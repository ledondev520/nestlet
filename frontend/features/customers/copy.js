export const copy = {
  zh: {
    eyebrow: '客户资料', title: '每位客户，一份有序的记录',
    intro: '从客户找到事项、对话和已保存的文档，接着上次的工作继续。',
    private: '仅当前账户可见', search: '搜索客户', searchPlaceholder: '输入客户称呼',
    addCustomer: '新建客户', customerName: '客户称呼', customerNameHint: '用于查找的名称，最多 120 个字符。可以重名，请用记录编号区分。',
    identityNote: '客户称呼仅用于整理资料，不会自动作为已核实的法律姓名、收件人或身份。',
    namePlaceholder: '输入便于查找的称呼', createCustomer: '创建客户', creating: '正在创建…',
    saveUncertain: '尚无法确认是否已保存。请先刷新并检查记录，再决定是否重试，以免重复创建。',
    cancel: '取消', save: '保存名称', saving: '正在保存…', rename: '重命名',
    loadingCustomers: '正在查找客户…', customersEmpty: '还没有客户记录',
    customersEmptyHint: '新建一位客户，再为其添加事项。记录会保存到当前账户。',
    noMatches: '没有找到匹配的客户', noMatchesHint: '换一个称呼试试，或创建一条新记录。',
    directory: '客户列表', results: count => `${count} 位客户`, clearSearch: '清空搜索',
    selectedEmpty: '从一位客户开始', selectedEmptyHint: '在左侧选择或搜索客户，查看关联事项与保存过的文档。',
    customerRecord: '客户记录', recordId: '记录编号', updated: '更新于', created: '保存于',
    refresh: '刷新', retry: '重试', loading: '正在加载…', customerLoading: '正在打开客户记录…',
    newCase: '新建事项', caseTitle: '事项名称', caseTitlePlaceholder: '为这项工作取一个名称',
    caseHint: '创建空白事项并关联这位客户。资料、姓名和文书信息需要在事项内另行填写与核实。',
    createCase: '创建并打开', caseCreated: '事项已创建。可从下方列表打开。',
    cases: '关联事项', casesEmpty: '这位客户还没有事项', casesEmptyHint: '新建一个空白事项，开始整理材料或对话。',
    openCase: '打开事项', documents: '已保存文档', artifactsEmpty: '还没有已保存文档',
    artifactsEmptyHint: '事项中保存的文档版本会出现在这里。未保存的编辑不会列出。',
    artifactCount: count => `${count} 个文档版本`, caseCount: count => `${count} 个事项`,
    draft: '草稿', final: '定稿', stale: '历史版本', staleHint: '事项已更新；此版本仍保留为历史记录，定稿需重新生成。',
    artifactHint: '每次保存保留独立版本。请在所属事项中查看、核对或生成新版本。',
    belongingCase: '所属事项', openArtifactCase: '打开所属事项', version: n => `第 ${n} 版`,
    sourceCaseVersion: n => `基于事项第 ${n} 版`,
    kinds: { followup: '跟进信', 'missing-documents': '缺失材料说明', 'status-summary': '状态摘要' },
    unknownKind: '文档', unnamedCase: '未命名事项',
    clientCreated: name => `已创建客户“${name}”`, renamed: '客户称呼已保存',
    conflict: '这个名称已在另一处更新。你的输入已保留，请先载入最新名称，核对后再次保存。',
    latestName: name => `当前保存的称呼：${name}`, reloadLatest: '载入最新名称', latestLoaded: '已载入最新版本；核对后可再次保存。',
    invalidName: '请输入 1–120 个字符的客户称呼。', invalidTitle: '请输入 1–120 个字符的事项名称。',
    signIn: '登录后查看自己的客户记录',
    errors: {
      CLIENT_INVALID: '客户称呼无效，请检查长度和内容。',
      CLIENT_NOT_FOUND: '这条客户记录不存在，或当前账户无权访问。',
      CLIENT_CONFLICT: '客户记录已在另一处更新。请载入最新版本后再保存。',
      CASE_INVALID: '事项名称或资料格式无效，请检查后重试。',
      CASE_NOT_FOUND: '这条事项不存在，或当前账户无权访问。',
      CASE_LIMIT_REACHED: '当前账户已达到 100 个事项的上限。请先整理已有事项。',
      CAPACITY_REACHED: '当前账户已达到保存上限。请先整理已有记录。',
      AUTH_REQUIRED: '登录已失效，请重新登录。',
      CSRF_REJECTED: '登录状态已变化，请刷新页面后重试。',
      NETWORK_ERROR: '暂时无法连接。请检查网络后重试。',
      generic: '暂时无法完成操作，请重试。已有记录不会被替换为示例数据。'
    }
  },
  en: {
    eyebrow: 'CLIENT RECORDS', title: 'A clear record for every customer',
    intro: 'Find each customer’s cases, conversations, and saved documents, then pick up where you left off.',
    private: 'Only your account', search: 'Search customers', searchPlaceholder: 'Type a customer name',
    addCustomer: 'New customer', customerName: 'Customer label', customerNameHint: 'A searchable label, up to 120 characters. Duplicate labels are allowed; use the record ID to distinguish them.',
    identityNote: 'Customer labels organize records. They do not automatically become verified legal names, recipients, or identities.',
    namePlaceholder: 'Enter a searchable label', createCustomer: 'Create customer', creating: 'Creating…',
    saveUncertain: 'The save could not be confirmed. Refresh and check your records before retrying to avoid creating a duplicate.',
    cancel: 'Cancel', save: 'Save name', saving: 'Saving…', rename: 'Rename',
    loadingCustomers: 'Finding customers…', customersEmpty: 'No customer records yet',
    customersEmptyHint: 'Create a customer, then add a case. Records are saved to your account.',
    noMatches: 'No matching customers', noMatchesHint: 'Try a different name or create a new record.',
    directory: 'Customer directory', results: count => `${count} customer${count === 1 ? '' : 's'}`, clearSearch: 'Clear search',
    selectedEmpty: 'Start with a customer', selectedEmptyHint: 'Select or search for a customer to see their linked cases and saved documents.',
    customerRecord: 'Customer record', recordId: 'Record ID', updated: 'Updated', created: 'Saved',
    refresh: 'Refresh', retry: 'Retry', loading: 'Loading…', customerLoading: 'Opening customer record…',
    newCase: 'New case', caseTitle: 'Case title', caseTitlePlaceholder: 'Give this work a title',
    caseHint: 'Create an empty case linked to this customer. Case facts, names, and document details must be entered and reviewed separately.',
    createCase: 'Create and open', caseCreated: 'Case created. Open it from the list below.',
    cases: 'Linked cases', casesEmpty: 'No cases for this customer yet', casesEmptyHint: 'Create an empty case to start organizing material or a conversation.',
    openCase: 'Open case', documents: 'Saved documents', artifactsEmpty: 'No saved documents yet',
    artifactsEmptyHint: 'Document versions saved in a case appear here. Unsaved edits are not listed.',
    artifactCount: count => `${count} document version${count === 1 ? '' : 's'}`, caseCount: count => `${count} case${count === 1 ? '' : 's'}`,
    draft: 'Draft', final: 'Final', stale: 'Historical version', staleHint: 'The case has changed. This version is retained as history; regenerate before using a final document.',
    artifactHint: 'Each save preserves a separate version. Open its case to review it or generate a new version.',
    belongingCase: 'Case', openArtifactCase: 'Open document’s case', version: n => `Version ${n}`,
    sourceCaseVersion: n => `From case version ${n}`,
    kinds: { followup: 'Follow-up letter', 'missing-documents': 'Missing documents', 'status-summary': 'Status summary' },
    unknownKind: 'Document', unnamedCase: 'Untitled case',
    clientCreated: name => `Customer “${name}” created`, renamed: 'Customer label saved',
    conflict: 'This name was updated elsewhere. Your input is preserved. Load the latest name, review it, then save again.',
    latestName: name => `Currently saved label: ${name}`, reloadLatest: 'Load latest name', latestLoaded: 'Latest version loaded. Review it before saving again.',
    invalidName: 'Enter a customer label of 1–120 characters.', invalidTitle: 'Enter a case title of 1–120 characters.',
    signIn: 'Sign in to view your customer records',
    errors: {
      CLIENT_INVALID: 'The customer label is invalid. Check its length and content.',
      CLIENT_NOT_FOUND: 'This customer does not exist or is not available to this account.',
      CLIENT_CONFLICT: 'This customer was updated elsewhere. Load the latest version before saving.',
      CASE_INVALID: 'The case title or data is invalid. Check it and try again.',
      CASE_NOT_FOUND: 'This case does not exist or is not available to this account.',
      CASE_LIMIT_REACHED: 'Your account has reached its 100-case limit. Review existing cases first.',
      CAPACITY_REACHED: 'Your account has reached its storage limit. Review existing records first.',
      AUTH_REQUIRED: 'Your session has expired. Please sign in again.',
      CSRF_REJECTED: 'Your session has changed. Refresh the page and try again.',
      NETWORK_ERROR: 'Cannot connect right now. Check your connection and try again.',
      generic: 'The request could not be completed. Please retry. Existing records are never replaced with sample data.'
    }
  }
};

export const localeCopy = lang => copy[lang === 'en' ? 'en' : 'zh'];
export function errorCopy(error, t) {
  if (error?.status === 401) return t.errors.AUTH_REQUIRED;
  return t.errors[error?.code] || t.errors.generic;
}
export function formatDate(value, lang) {
  if (!value || !Number.isFinite(Date.parse(value))) return '—';
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value));
}
export const validLabel = value => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 120 && !/[\r\n\u0000-\u001f\u007f]/u.test(value);
export const clientSearchPath = search => `/api/clients?${new URLSearchParams({ search: search.trim(), limit: '100' })}`;
export const emptyCasePayload = (title, clientId) => ({ title: title.trim(), sourceText: '', fields: [], draftType: 'followup', draftText: '', clientId });
