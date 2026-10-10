export const copy = {
  zh: {
    eyebrow: '客户资料', title: "客户",
    intro: "查找客户及相关事项、文档。",
    private: '仅自己可见', search: '搜索客户', searchPlaceholder: '输入客户称呼',
    addCustomer: '新建客户', customerName: '客户称呼', customerNameHint: "最多 120 个字符",
    namePlaceholder: '输入便于查找的称呼', createCustomer: '新建客户', creating: '正在创建…',
    saveUncertain: '尚未确认是否保存，请勿重复新建。\n请先刷新并检查记录，再决定是否重试。',
    cancel: '取消', save: '保存称呼', saving: '正在保存…', rename: '改称呼',
    loadingCustomers: '正在查找客户…', customersEmpty: '暂无客户',
    customersEmptyHint: "添加客户，开始整理资料。",
    noMatches: '没找到相关客户', noMatchesHint: '换个称呼搜索，或添加新客户。',
    directory: '客户列表', results: count => `${count} 位客户`, clearSearch: '清空搜索',
    selectedEmpty: '选择客户', selectedEmptyHint: '选择客户，查看相关事项和文档。',
    customerRecord: '客户资料', recordId: '记录编号', updated: '更新时间', created: '保存时间',
    refresh: '刷新', retry: '重试', loading: '正在加载…', customerLoading: '正在打开客户记录…',
    newCase: '新建事项', caseTitle: '事项名称', caseTitlePlaceholder: '输入便于查找的事项名称',
    caseHint: "为当前客户添加事项。",
    createCase: '新建事项', caseCreated: '事项已创建，可从下方打开。',
    cases: '相关事项', casesEmpty: '当前客户暂无事项', casesEmptyHint: '新建事项，开始整理材料或对话。',
    openCase: '打开事项', documents: '已存文档', artifactsEmpty: '暂无文档',
    artifactsEmptyHint: "保存的文档会显示在这里。",
    artifactCount: count => `${count} 个文档版本`, caseCount: count => `${count} 个事项`,
    draft: '草稿', final: '完成版', stale: '历史版本', staleHint: '事项已更新，此版保留作历史记录。\n完成版需重新生成。',
    artifactHint: "查看已保存的文档版本。",
    belongingCase: '所属事项', openArtifactCase: '打开事项', version: n => `第 ${n} 版`,
    sourceCaseVersion: n => `基于事项第 ${n} 版`,
    kinds: { followup: '跟进信', 'missing-documents': '资料确认', 'status-summary': '进度摘要' },
    unknownKind: '文档', unnamedCase: '未命名',
    clientCreated: name => `已创建客户“${name}”`, renamed: '客户称呼已保存',
    conflict: '称呼已在别处更新，输入仍保留。\n请读取最新称呼，核对后再保存。',
    latestName: name => `当前保存的称呼：${name}`, reloadLatest: '刷新称呼', latestLoaded: '已载入最新版本；核对后可再次保存。',
    invalidName: '请输入 1–120 个字符的客户称呼。', invalidTitle: '请输入 1–120 个字符的事项名称。',
    signIn: '登录后查看自己的客户记录',
    errors: {
      CLIENT_INVALID: '客户称呼无效，请检查长度和内容。',
      CLIENT_NOT_FOUND: '这条客户记录不存在，\n或当前账号无权访问。',
      CLIENT_CONFLICT: '客户资料已在别处更新。\n请读取最新版本后再保存。',
      CASE_INVALID: '事项名称或资料格式无效，\n请检查后重试。',
      CASE_NOT_FOUND: '这条事项不存在，或当前账号无权访问。',
      CASE_LIMIT_REACHED: '本账号已有100个事项，已达上限。\n请先整理已有事项。',
      CAPACITY_REACHED: '本账号保存空间已满。\n请先整理已有记录。',
      SESSION_REFRESHED:'连接已恢复，操作未自动重试。\n请核对后再试。', AUTH_REQUIRED: '登录已失效，请重新登录。',
      CSRF_REJECTED: '登录状态已变化，请刷新页面后重试。',
      NETWORK_ERROR: '暂时无法连接。请检查网络后重试。',
      generic: "操作失败，请重试。"
    }
  },
  en: {
    eyebrow: 'CLIENT RECORDS', title: "Customers",
    intro: "Find customers, cases, and documents.",
    private: 'Only your account', search: 'Search customers', searchPlaceholder: 'Type a customer name',
    addCustomer: 'New customer', customerName: 'Customer label', customerNameHint: "Up to 120 characters",
    namePlaceholder: 'Enter a searchable label', createCustomer: 'Create customer', creating: 'Creating…',
    saveUncertain: 'The save could not be confirmed. Refresh and check your records before retrying to avoid creating a duplicate.',
    cancel: 'Cancel', save: 'Save name', saving: 'Saving…', rename: 'Rename',
    loadingCustomers: 'Finding customers…', customersEmpty: 'No customer records yet',
    customersEmptyHint: "Create a customer to organize their records.",
    noMatches: 'No matching customers', noMatchesHint: 'Try a different name or create a new record.',
    directory: 'Customer directory', results: count => `${count} customer${count === 1 ? '' : 's'}`, clearSearch: 'Clear search',
    selectedEmpty: 'Start with a customer', selectedEmptyHint: 'Select or search for a customer to see their linked cases and saved documents.',
    customerRecord: 'Customer record', recordId: 'Record ID', updated: 'Updated', created: 'Saved',
    refresh: 'Refresh', retry: 'Retry', loading: 'Loading…', customerLoading: 'Opening customer record…',
    newCase: 'New case', caseTitle: 'Case title', caseTitlePlaceholder: 'Give this work a title',
    caseHint: "Add a case for this customer.",
    createCase: 'Create and open', caseCreated: 'Case created. Open it from the list below.',
    cases: 'Linked cases', casesEmpty: 'No cases for this customer yet', casesEmptyHint: 'Create an empty case to start organizing material or a conversation.',
    openCase: 'Open case', documents: 'Saved documents', artifactsEmpty: 'No saved documents yet',
    artifactsEmptyHint: "Saved documents will appear here.",
    artifactCount: count => `${count} document version${count === 1 ? '' : 's'}`, caseCount: count => `${count} case${count === 1 ? '' : 's'}`,
    draft: 'Draft', final: 'Final', stale: 'Historical version', staleHint: 'The case has changed. This version is retained as history; regenerate before using a final document.',
    artifactHint: "View or open saved versions.",
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
      SESSION_REFRESHED:'Connection restored. Your action was not retried. Review and try again.', AUTH_REQUIRED: 'Your session has expired. Please sign in again.',
      CSRF_REJECTED: 'Your session has changed. Refresh the page and try again.',
      NETWORK_ERROR: 'Cannot connect right now. Check your connection and try again.',
      generic: "The action failed. Try again."
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
