import {FIELDS, DRAFT_TYPES, mapSpreadsheetRow, hasCJKText, extract, canDraft, draft, parseCSV, exportCSV} from './core.js';
import {AGENCY_OPTIONS, DEFAULT_GUIDANCE_AGENCY, GUIDANCE_COPY, getAgencyGuidance} from './agency-guidance.js';

const copy = {
  zh: {
    workspaceTitle: '从材料到英文草稿', safeShort: '仅限虚构或去标识化资料', inputShort: '放入材料', sampleShort: '试用示例', pasteShort: '或在这里粘贴去标识化文本…', inputHelp: '支持格式与处理方式', nextReview: 'AI 提取并核对', reviewShort: '核对五项事实', sourceHint: '原文可展开查看', check: '确认', editedShort: '人工修改 · 查看出处', missingShort: '待补充：', missingScope: '仅表示本次材料未提供，并非机构缺件通知', nextHelp: '后续事项与导出说明', draftTypeShort: '草稿类型', backInput: '返回材料', backReview: '返回核对', gateShort: '请确认每一项；未知信息可保留空白', draftShort: '可直接编辑。辅助文书，非官方表格；请人工复核后使用。', footerShort: '仅生成草稿 · 不自动发送或提交',
    settings: '设置', modelLabel: '模型', endpointLabel: '接口', readyStatus: '提取已启用', configStatus: '尚未启用 AI', backendStatus: '后端未连接', checkingStatus: '正在检查连接', configHelp: '在服务器设置 DEEPSEEK_API_KEY，并将 ENABLE_LIVE_AI 设为 true 后重启。密钥仅保留在服务器，不在浏览器保存。', manualAction: '按标签手动整理', errorConfig: 'DeepSeek 尚未启用。请在设置中查看服务器配置步骤；不会自动切换到模拟结果。', errorBackend: '尚未连接到处理服务器。请启动完整服务后再使用 AI 或文件处理。', filePick: '上传文件', workbookHint: 'Excel 文件上传至服务器读取工作表；需选择单行并确认字段映射。不会执行公式或宏。', workbookConsent: '此 Excel 文件将上传至本服务器以读取工作表和单元格，不会自动发送至 DeepSeek。请确认仅含虚构或去标识化资料。继续？', mapTitle: '选择一行，映射字段', sheetLabel: '工作表', rowLabel: '数据行', columnLabel: '列', skipColumn: '不导入', applyMapping: '确认映射并核对', cancelMapping: '取消导入', errorWorkbook: '无法读取此工作簿。请使用未加密的 XLSX / XLS，或导出为单案例 CSV。', errorMapping: '请选择有效数据行和不重复的列；公式、隐藏或合并单元格不能导入。', workbookLimited: '仅预览前 200 行、50 列；其余内容未载入', workbookBlocked: '部分单元格不可导入，请选择普通可见值',
    operatorSetup: '请先配置操作员账户', operatorSetupHelp: '请在服务器配置 NESTLET_OPERATOR_PASSWORD_HASH 与 HTTPS 的 PUBLIC_ORIGIN，再重启服务。', signInRequired: '请先登录', operatorPassword: '操作员密码', signIn: '登录', signOut: '退出登录', refreshStatus: '刷新状态', apiKey: 'DeepSeek API Key', replaceKey: '更换 API Key（可选）', keepExistingKey: '留空以保留现有密钥', saveSettings: '保存设置', enableLive: '启用 DeepSeek 提取', keyMemoryNotice: '网页填写的密钥仅存于服务器内存，服务重启后需重新填写；浏览器不保存密钥。', keyEnvironment: '密钥：服务器环境', keyMemory: '密钥：服务器内存', keyMissing: '尚未配置密钥', testConnection: '测试连接', connectionVerified: '模型访问已验证，尚未测试文本生成', settingsSaved: '设置已保存，连接验证状态单独显示', connectionSuccess: '已确认账户可访问 DeepSeek Flash，未调用文本生成', loginSuccess: '已登录，可继续原来的操作', logoutSuccess: '已退出，当前案例已清空', logoutConfirm: '退出登录将清空当前未导出的案例和草稿。继续？', errorAuth: '请登录后重新执行刚才的操作。', errorSession: '登录状态已失效，请重新登录。', errorHttps: '密码和密钥设置仅在可信 HTTPS 页面开放。请先完成服务器 HTTPS 配置。', errorCredentials: '密码不正确，或操作员账户尚未配置。', errorRateLimit: '操作过于频繁，请一分钟后重试。', errorSettings: '设置无效，请检查 API Key 格式。', errorKeyRequired: '请先填写并保存 API Key。', errorConnection: '连接验证失败。请检查密钥和账户访问权限；未测试文本生成。', errorModel: '此账户未返回 DeepSeek Flash 的访问权限，请核实后重试。',
    workflowFocus: '资料参考', localLoginNotice: '本机开发登录。API 密钥的网页录入仍要求已认证的 HTTPS 页面。',
    brand: '巢小秘', tag: '一份材料 · 向前一步', demo: '手动整理', liveMode: 'DeepSeek 实时提取',
    title: '少一点文书，多一点进展。', subtitle: '保留熟悉的文件夹和表格。一次处理一个案例，把零散材料整理成可核对的事实和英文草稿。',
    eyebrow: '租赁手续，有个小帮手', privacy: '仅限虚构或去标识化资料。请勿输入真实租客、税号、银行或证件信息。本原型不主动保存案例；刷新页面会清空当前工作。下载文件由你保管。',
    steps: ['放入材料', '核对事实', '带走英文草稿'], workflow: '处理步骤',
    input: '从手头的材料开始', inputHint: '粘贴文本，或导入一个案例的 TXT / CSV（最大 50 KB）。', pdfHint: '也支持可选中文本的 PDF（最大 5 MB），不支持扫描件、图片或 OCR。PDF 在服务器提取文本，不会自动发送至 DeepSeek。', noPdfHint: '当前不支持 PDF、图片或 OCR。',
    sample: '试用虚构示例', upload: '选择 TXT / CSV', uploadPdf: '选择 TXT / CSV / PDF',
    placeholder: '粘贴去标识化材料…\n本地演示识别以下英文行标签：\nProperty:\nOwner:\nPHA:\nCase reference:\nProposed rent:',
    localHint: '手动整理只识别下列英文行标签，不使用 AI。自由格式文字请使用 DeepSeek 提取，再核对原文。',
    extract: '整理演示字段', live: '通过 DeepSeek 提取', liveUnavailable: '实时 AI 未启用；可先完整体验本地演示', busy: '正在处理…', cancel: '取消处理',
    loaded: '材料已载入，请选择提取方式', synthetic: '虚构示例 · 非真实案例', sourceText: '当前材料', characters: '字符',
    resultMethod: '候选事实提取方式', errorSensitive: '检测到可能的敏感标识，未发送至模型。请移除真实身份、税务或银行信息，只使用虚构或去标识化资料。', errorBusy: '服务正在处理其他请求，请稍后重试。当前案例未被替换。', review: '每个事实，都有出处', reviewHint: '逐项对照原文后确认。未在本次材料中提供，不代表没有向住房机构提交。',
    empty: '先放入一份材料', emptyHint: '提取后，在这里核对候选事实和出处。未知信息会保持未知。',
    unknown: '本次材料未提供', source: '原文摘录', noSource: '未找到支持这一项的原文。可人工补充，或确认保留未知。',
    manual: '人工修改 · 请独立核实；不是原文已验证的信息', originalSource: '提取时的原文',
    conflict: '发现冲突。请对照原文，编辑为正确值或清空，再确认。',
    confirmValue: '我已核对这一项', confirmUnknown: '我已核对，暂时保留未知', confirmed: '已核对', needsReview: '待核对', conflictBadge: '有冲突', unknownBadge: '未提供',
    progress: '项已核对', missing: '本次材料还不完整', missingHint: '以下信息仍为空。可继续生成带占位符的草稿，不应将它理解为机构的缺件通知。', complete: '五项事实都有值；仍需核实当地要求和附件',
    checklist: '下一步参考 · 非官方 PHA 要求清单', checks: ['确认负责的住房机构与收件人', '核对当前 RFTA 表格和当地官方说明', '向经核实的机构确认附件及提交方式'],
    draftType: '需要哪种英文草稿？', types: ['PHA 跟进函', '资料补充请求', '案例状态摘要'],
    generate: '生成英文草稿', gate: '请先核对全部五项；未知项也需要确认', ready: '已核对全部项目，可以生成草稿',
    draftTitle: '可以带走的英文草稿', draftHint: '这是可编辑的英文辅助文书模板，不是官方表格或合规认证。发送前核对占位符、事实、收件人和实际附件。', template: '英文模板 · 待人工复核',
    copy: '复制草稿', download: '下载 TXT', print: '打印 / 保存 PDF', csv: '导出案例 CSV', csvHint: 'CSV 含英文草稿标识和五项字段，不包含原文或核对状态；重新导入后需再次核对。',
    reset: '清空案例', resetAsk: '清空当前材料、已核对字段和草稿？未下载的内容将丢失。', replaceAsk: '用新材料替换当前案例？当前核对结果和草稿将被清空。',
    copied: '英文草稿已复制', copyFail: '复制失败，请手动选中草稿复制', cancelled: '处理已取消，未应用新结果',
    errorFile: '请使用 UTF-8 TXT / 单案例 CSV（最大 50 KB），或当前支持的 PDF / XLSX / XLS。', errorCSV: 'CSV 需要列头 property, owner, pha, caseReference, rent，以及一行案例数据。', errorEmpty: '请先粘贴文本或导入文件。',
    errorLive: '实时 AI 不可用或请求失败。未应用新建议，可重试或选择手动整理。', errorPdf: '无法提取此 PDF。请改为粘贴去标识化文本，或使用可选中文本的 PDF。',
    errorScanned: '未找到可提取的文本，此 PDF 可能是扫描件。本原型不支持 OCR，请改为粘贴去标识化文本。', errorEncrypted: '不支持加密 PDF。请使用可读取的去标识化文本。', errorSize: '文件过大。TXT / CSV 最大 50 KB，PDF / Excel 最大 5 MB。', errorGeneric: '操作未完成，请重试。',
    consent: '继续会把本次全部文本发送给 DeepSeek。仅限虚构或去标识化资料；真实敏感资料尚未获得隐私与安全许可。你是否已确认数据处理条款和授权，并同意发送本次文本？',
    pdfConsent: '此 PDF 将上传至本原型服务器，仅用于提取文本，不会自动发送到 DeepSeek。请确认文件仅包含虚构或去标识化资料。继续？',
    footer: '工作名，尚未完成商标核查 · 不筛选租客、不判断资格、不自动发送', reference: 'HUD 官方 HCV 资料',
    draftWarning: '导出会保留英文 DRAFT 与人工复核提示。草稿由模板生成；请保持正文为英文。',
    englishRequired: '请先人工核实英文表述。拟议租金等描述应为英文；有原文支持的姓名、机构、地址和编号可以保留。不会自动翻译事实。', nameReview: '我确认中日韩文字仅用于已核实的姓名、机构、地址或编号，须按原文保留；文书正文使用英文', draftEnglishRequired: '草稿含有未经确认的中日韩文字。已核实的专名可保留；请将其他正文人工改为英文后再导出。',
    fields: ['房源地址', '业主', '住房机构 PHA', '案例编号', '拟议租金']
  },
  en: {
    workspaceTitle: 'From document to English draft', safeShort: 'Synthetic or de-identified information only', inputShort: 'Add your document', sampleShort: 'Try sample', pasteShort: 'Or paste de-identified text here…', inputHelp: 'Formats and processing details', nextReview: 'Extract & review with AI', reviewShort: 'Review five facts', sourceHint: 'Expand a source to check it', check: 'Confirm', editedShort: 'Edited · View source', missingShort: 'To confirm:', missingScope: 'Not provided in this review, not an agency missing-document notice', nextHelp: 'Next steps and export details', draftTypeShort: 'Draft type', backInput: 'Back to document', backReview: 'Back to review', gateShort: 'Confirm every field. Unknown information can stay blank.', draftShort: 'Edit directly. Supplementary draft, not an official form. Review before use.', footerShort: 'Drafts only · Nothing is sent or submitted automatically',
    settings: 'Settings', modelLabel: 'Model', endpointLabel: 'Endpoint', readyStatus: 'Extraction enabled', configStatus: 'AI is not enabled', backendStatus: 'Backend not connected', checkingStatus: 'Checking connection', configHelp: 'Set DEEPSEEK_API_KEY and ENABLE_LIVE_AI=true on the server, then restart. Credentials stay on the server and are never stored in the browser.', manualAction: 'Process labels manually', errorConfig: 'DeepSeek is not enabled. Open Settings for server configuration steps. No simulated result will be substituted.', errorBackend: 'The processing backend is not connected. Start the complete service before using AI or server-side file processing.', filePick: 'Upload a file', workbookHint: 'Excel files are read on the server. Select one row and confirm the field mapping. Formulas and macros are not executed.', workbookConsent: 'This Excel file will be uploaded to the server to read worksheets and cells, not automatically sent to DeepSeek. Confirm that it contains only synthetic or de-identified information. Continue?', mapTitle: 'Choose one row and map its fields', sheetLabel: 'Worksheet', rowLabel: 'Data row', columnLabel: 'Column', skipColumn: 'Skip this field', applyMapping: 'Confirm mapping & review', cancelMapping: 'Cancel import', errorWorkbook: 'Could not read this workbook. Use an unencrypted XLSX / XLS file, or export one case as CSV.', errorMapping: 'Choose a valid row and distinct columns. Formula, hidden, or merged cells cannot be imported.', workbookLimited: 'Preview limited to the first 200 rows and 50 columns', workbookBlocked: 'Some cells cannot be imported. Choose ordinary visible values.',
    operatorSetup: 'Operator setup required', operatorSetupHelp: 'Configure NESTLET_OPERATOR_PASSWORD_HASH and an HTTPS PUBLIC_ORIGIN on the server, then restart.', signInRequired: 'Sign in to continue', operatorPassword: 'Operator password', signIn: 'Sign in', signOut: 'Sign out', refreshStatus: 'Refresh status', apiKey: 'DeepSeek API Key', replaceKey: 'Replace API key (optional)', keepExistingKey: 'Leave blank to keep the existing key', saveSettings: 'Save settings', enableLive: 'Enable DeepSeek extraction', keyMemoryNotice: 'Keys entered here stay only in server memory and must be entered again after a server restart. The browser does not store them.', keyEnvironment: 'Key: server environment', keyMemory: 'Key: server memory', keyMissing: 'No key configured', testConnection: 'Test connection', connectionVerified: 'Model access verified; text generation not tested', settingsSaved: 'Settings saved. Connection verification is shown separately.', connectionSuccess: 'DeepSeek Flash model access verified. No text generation was called.', loginSuccess: 'Signed in. You can resume your previous action.', logoutSuccess: 'Signed out. The current case has been cleared.', logoutConfirm: 'Signing out clears the current case and draft. Continue?', errorAuth: 'Sign in, then retry your previous action.', errorSession: 'Your session has expired. Sign in again.', errorHttps: 'Password and key settings require a trusted HTTPS page. Configure server HTTPS first.', errorCredentials: 'Incorrect password, or the operator account is not configured.', errorRateLimit: 'Too many attempts. Wait one minute before retrying.', errorSettings: 'Invalid settings. Check the API key format.', errorKeyRequired: 'Enter and save an API key first.', errorConnection: 'Connection verification failed. Check the key and account access. Text generation was not tested.', errorModel: 'DeepSeek Flash was not listed for this account. Verify access before retrying.',
    workflowFocus: 'Reference focus', localLoginNotice: 'Local development sign-in. Browser API-key entry still requires an authenticated HTTPS page.',
    brand: 'Nestlet', tag: 'ONE DOCUMENT. ONE STEP FORWARD.', demo: 'Manual processing', liveMode: 'DeepSeek live extraction',
    title: 'Less paperwork. More progress.', subtitle: 'Keep your folders and spreadsheets. Work through one case at a time, turning loose notes into reviewable facts and an English draft.',
    eyebrow: 'A LITTLE HELP WITH LEASE-UP', privacy: 'Synthetic or de-identified information only. Do not enter real tenant details, tax IDs, bank details, or identity documents. This prototype does not intentionally save cases; refreshing clears your work. You control downloaded files.',
    steps: ['Add a document', 'Review the facts', 'Take an English draft'], workflow: 'Workflow',
    input: 'Start with what you have', inputHint: 'Paste text or import one case as TXT / CSV (up to 50 KB).', pdfHint: 'Text-based PDFs are also supported (up to 5 MB). No scans, images, or OCR. PDF text is extracted on the server and is not automatically sent to DeepSeek.', noPdfHint: 'PDF, images, and OCR are not currently supported.',
    sample: 'Try synthetic sample', upload: 'Choose TXT / CSV', uploadPdf: 'Choose TXT / CSV / PDF',
    placeholder: 'Paste de-identified text…\nLocal demo recognizes these English line labels:\nProperty:\nOwner:\nPHA:\nCase reference:\nProposed rent:',
    localHint: 'Manual processing recognizes the English line labels below and does not use AI. Use DeepSeek for free-form text, then check the source.',
    extract: 'Extract demo fields', live: 'Extract with DeepSeek', liveUnavailable: 'Live AI is not enabled; the complete local demo is available', busy: 'Processing…', cancel: 'Cancel processing',
    loaded: 'Document loaded. Choose an extraction method.', synthetic: 'Synthetic sample · Not a real case', sourceText: 'Current document', characters: 'characters',
    resultMethod: 'Candidate extraction mode', errorSensitive: 'Potential sensitive identifiers were detected. Nothing was sent to the model. Remove real identity, tax, or banking information and use only synthetic or de-identified material.', errorBusy: 'The service is processing other requests. Please try again shortly. Your current case has not been replaced.', review: 'Every fact has a source', reviewHint: 'Compare each suggestion with the source, then confirm. Not provided in this review does not mean not submitted to the housing authority.',
    empty: 'Start with a document', emptyHint: 'Extracted candidate facts and source snippets will appear here. Unknown information stays unknown.',
    unknown: 'Not provided in this review', source: 'Source excerpt', noSource: 'No supporting source found. Add verified information or confirm that it remains unknown.',
    manual: 'Operator edited · Verify independently; this is not source-verified', originalSource: 'Original extraction source',
    conflict: 'Conflicting sources. Check the original, edit to the correct value or clear it, then confirm.',
    confirmValue: 'I have checked this field', confirmUnknown: 'I have checked; leave unknown for now', confirmed: 'Reviewed', needsReview: 'Needs review', conflictBadge: 'Conflict', unknownBadge: 'Not provided',
    progress: 'fields reviewed', missing: 'Information still missing from this review', missingHint: 'These fields are blank. You can create a draft with placeholders. This is not a missing-document notice from the agency.', complete: 'All five fields have values. Local requirements and attachments still need verification.',
    checklist: 'Suggested next steps · Not official PHA requirements', checks: ['Confirm the responsible housing authority and recipient', 'Verify the current RFTA and official local instructions', 'Confirm attachments and submission method with the verified agency'],
    draftType: 'Which English draft do you need?', types: ['PHA follow-up', 'Information request', 'Case status summary'],
    generate: 'Create English draft', gate: 'Review all five fields first, including any unknowns', ready: 'All fields reviewed. Ready to create a draft.',
    draftTitle: 'An English draft to take with you', draftHint: 'An editable English correspondence template, not an official form or compliance certification. Check placeholders, facts, recipient, and actual attachments before use.', template: 'ENGLISH TEMPLATE · HUMAN REVIEW REQUIRED',
    copy: 'Copy draft', download: 'Download TXT', print: 'Print / Save PDF', csv: 'Export case CSV', csvHint: 'CSV includes an English draft-notice row and five field values, not sources or review status. Imported values must be reviewed again.',
    reset: 'Clear case', resetAsk: 'Clear the current document, reviewed facts, and draft? Content you have not downloaded will be lost.', replaceAsk: 'Replace the current case with new material? Current review decisions and the draft will be cleared.',
    copied: 'English draft copied', copyFail: 'Copy failed. Please select and copy the draft manually.', cancelled: 'Processing cancelled. No new results were applied.',
    errorFile: 'Use UTF-8 TXT / one-case CSV (up to 50 KB), or a currently supported PDF / XLSX / XLS.', errorCSV: 'CSV requires the headers property, owner, pha, caseReference, rent, followed by one case row.', errorEmpty: 'Paste text or import a file first.',
    errorLive: 'Live AI is unavailable or failed. No new suggestions were applied. Retry or choose manual processing.', errorPdf: 'Could not extract this PDF. Paste de-identified text or use a text-based PDF instead.',
    errorScanned: 'No extractable text found. This may be a scanned PDF. OCR is not supported; paste de-identified text instead.', errorEncrypted: 'Encrypted PDFs are not supported. Use readable, de-identified text instead.', errorSize: 'File too large. TXT / CSV: up to 50 KB. PDF / Excel: up to 5 MB.', errorGeneric: 'Could not complete this action. Please try again.',
    consent: 'This sends all the current text to DeepSeek. Use only synthetic or de-identified information; real sensitive documents have not been cleared for privacy and security. Have you verified the data-processing terms and authorization, and do you agree to send this text?',
    pdfConsent: 'This PDF will be uploaded to the prototype server for text extraction. It will not automatically be sent to DeepSeek. Confirm that it contains only synthetic or de-identified information. Continue?',
    footer: 'Working name; not trademark-cleared · No screening, eligibility decisions, or automatic sending', reference: 'Official HUD HCV resources',
    draftWarning: 'Exports retain the English DRAFT and human-review notices. Drafts use a template; keep the edited body in English.',
    englishRequired: 'Verify English wording before creating the draft. Descriptions such as proposed rent must be in English. Source-supported names, authorities, addresses, and references may remain verbatim. Facts are not automatically translated.', nameReview: 'I confirm that CJK text is limited to verified names, authorities, addresses, or references that must remain verbatim; the document body will be in English', draftEnglishRequired: 'The draft contains unreviewed CJK text. Verified proper names may remain; manually render other prose in English before exporting.',
    fields: ['Property', 'Owner', 'Housing authority (PHA)', 'Case reference', 'Proposed rent']
  }
};

const kinds = DRAFT_TYPES;
const state = {lang: 'zh', stage: 0, guidanceAgency: DEFAULT_GUIDANCE_AGENCY, guidanceOpen: false, text: '', fields: [], draftText: '', generated: false, error: '', message: '', busy: false, liveEnabled: false, pdfEnabled: false, workbookEnabled: false, workbook: null, sheetIndex: 0, rowIndex: 0, mapping: {}, settingsOpen: false, settingsBusy: false, settingsError: '', settingsMessage: '', authConfigured: false, authenticated: false, secureSettings: false, configured: false, csrfToken: '', connectionVerifiedAt: null, keyStorage: 'none', statusChecked: false, statusError: false, model: 'deepseek-flash', providerEndpoint: 'https://api.deepseek.com/chat/completions', mode: 'demo', source: '', sample: false, namesVerified: false, kind: 'followup', generatedKind: 'followup', version: 0, controller: null};
const t = () => copy[state.lang];
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const byId = id => document.getElementById(id);
const labelFor = key => t().fields[FIELDS.indexOf(key)] || key;
const nameFields = () => state.fields.filter(field => field.key !== 'rent' && hasCJKText(field.value));
const fieldsNeedEnglish = () => state.fields.some(field => field.key === 'rent' && hasCJKText(field.value)) || nameFields().length > 0 && !state.namesVerified;
function draftNeedsEnglish() {
  let body = state.draftText;
  if (state.namesVerified) {
    for (const field of nameFields()) body = body.split(field.value).join('');
  }
  return hasCJKText(body);
}

function fieldMarkup(field, index) {
  const d = t();
  const badge = field.conflict ? d.conflictBadge : field.confirmed ? d.confirmed : !field.value.trim() ? d.unknownBadge : d.needsReview;
  return `<article class="field compact-field ${field.confirmed ? 'is-reviewed' : ''}">
    <div class="field-head"><label for="field-${index}">${labelFor(field.key)}</label><span class="field-status ${field.conflict ? 'warning' : ''}">${badge}</span></div>
    <div class="field-value"><input type="text" id="field-${index}" data-field="${index}" value="${esc(field.value)}" placeholder="${d.unknown}" maxlength="3000" ${state.busy ? 'disabled' : ''} aria-describedby="source-${index}"><label class="confirm"><input type="checkbox" id="confirm-${index}" data-confirm="${index}" ${field.confirmed ? 'checked' : ''} ${field.conflict || state.busy ? 'disabled' : ''}><span>${d.check}</span></label></div>
    <details class="source-details" ${field.conflict ? 'open' : ''}><summary>${field.edited ? d.editedShort : d.source}</summary><div class="source" id="source-${index}">${field.edited ? `<p class="edited">${d.manual}</p>` : ''}${field.source ? `<p>${esc(field.source)}</p>` : `<p>${d.noSource}</p>`}</div></details>
    ${field.conflict ? `<p class="error">${d.conflict}</p>` : ''}
  </article>`;
}

function secureSettingsAvailable() {
  return state.secureSettings && window.location.protocol === 'https:';
}
function localDevelopmentLogin() {
  return window.location.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]', '::1'].includes(window.location.hostname);
}
function operatorLoginAvailable() {
  return secureSettingsAvailable() || localDevelopmentLogin();
}
function settingsMarkup() {
  if (!state.settingsOpen) return '';
  const d = t();
  const disabled = state.settingsBusy || state.busy ? 'disabled' : '';
  const statusLabel = !state.statusChecked ? d.checkingStatus : state.statusError ? d.backendStatus : !state.authConfigured ? d.operatorSetup : !state.authenticated ? d.signInRequired : state.liveEnabled ? d.readyStatus : d.configStatus;
  let controls = '';
  if (state.statusError) controls = `<p>${d.errorBackend}</p>`;
  else if (!state.authConfigured) controls = `<p>${d.operatorSetupHelp}</p>`;
  else if (!state.authenticated) {
    controls = operatorLoginAvailable() ? `${localDevelopmentLogin() ? `<p class="small">${d.localLoginNotice}</p>` : ''}<form id="login-form" autocomplete="off"><label for="operator-password">${d.operatorPassword}</label><div class="credential-row"><input id="operator-password" name="operator-password" type="password" autocomplete="off" minlength="12" maxlength="256" required ${disabled}><button class="primary" type="submit" ${disabled}>${d.signIn}</button></div></form>` : `<p>${d.errorHttps}</p>`;
  } else if (!secureSettingsAvailable()) {
    controls = `<p>${localDevelopmentLogin() ? d.localLoginNotice : d.errorHttps}</p><p class="small">${state.configured ? state.keyStorage === 'server-environment' ? d.keyEnvironment : d.keyMemory : d.keyMissing}</p><button id="logout" class="link" ${disabled}>${d.signOut}</button>`;
  } else {
    controls = `<form id="key-form" autocomplete="off"><label for="api-key">${state.configured ? d.replaceKey : d.apiKey}</label><div class="credential-row"><input id="api-key" name="api-key" type="password" autocomplete="off" spellcheck="false" autocapitalize="off" maxlength="256" ${state.configured ? '' : 'required'} placeholder="${state.configured ? d.keepExistingKey : ''}" ${disabled}><button class="primary" type="submit" ${disabled}>${d.saveSettings}</button></div><label class="confirm settings-enable"><input id="enable-live" type="checkbox" ${state.liveEnabled || !state.configured ? 'checked' : ''} ${disabled}>${d.enableLive}</label></form><p class="small">${d.keyMemoryNotice}</p><div class="settings-actions"><button id="test-connection" class="secondary" ${disabled || !state.configured ? 'disabled' : ''}>${d.testConnection}</button><button id="logout" class="link" ${disabled}>${d.signOut}</button><span class="small">${state.configured ? state.keyStorage === 'server-environment' ? d.keyEnvironment : d.keyMemory : d.keyMissing}</span></div>${state.connectionVerifiedAt ? `<p class="small">${d.connectionVerified} · ${esc(new Date(state.connectionVerifiedAt).toLocaleString(state.lang === 'zh' ? 'zh-CN' : 'en-US'))}</p>` : ''}`;
  }
  return `<aside class="settings-panel" aria-label="${d.settings}"><div class="settings-header"><strong class="settings-status">${statusLabel}</strong><button id="refresh-status" class="link" ${disabled}>${d.refreshStatus}</button></div><dl><dt>${d.modelLabel}</dt><dd>${esc(state.model)}</dd><dt>${d.endpointLabel}</dt><dd>${esc(state.providerEndpoint)}</dd></dl>${controls}<div class="error" role="alert">${state.settingsError ? d[state.settingsError] || d.errorGeneric : ''}</div><div class="success" role="status">${state.settingsBusy ? d.busy : state.settingsMessage ? d[state.settingsMessage] : ''}</div></aside>`;
}

const authErrorKeys = {
  AUTH_REQUIRED: 'errorAuth', CSRF_REJECTED: 'errorSession', OPERATOR_SETUP_REQUIRED: 'operatorSetupHelp', HTTPS_REQUIRED: 'errorHttps',
  INVALID_CREDENTIALS: 'errorCredentials', LOGIN_RATE_LIMITED: 'errorRateLimit', SETTINGS_RATE_LIMITED: 'errorRateLimit',
  INVALID_SETTINGS: 'errorSettings', API_KEY_REQUIRED: 'errorKeyRequired', CONNECTION_FAILED: 'errorConnection', MODEL_UNAVAILABLE: 'errorModel',
  BUSY: 'errorBusy', LIVE_DISABLED: 'errorConfig'
};
function responseError(result, fallback) {
  const key = authErrorKeys[result?.code] || fallback;
  if (['AUTH_REQUIRED', 'CSRF_REJECTED', 'OPERATOR_SETUP_REQUIRED', 'HTTPS_REQUIRED'].includes(result?.code)) {
    state.authenticated = false;
    state.csrfToken = '';
    state.settingsOpen = true;
    state.settingsError = key;
  }
  return new Error(key);
}
function requestHeaders(extra = {}) {
  return {...extra, ...(state.csrfToken ? {'X-CSRF-Token': state.csrfToken} : {})};
}
function applyStatus(status) {
  for (const key of ['liveEnabled', 'pdfEnabled', 'workbookEnabled', 'authConfigured', 'authenticated', 'secureSettings', 'configured']) {
    if (key in status) state[key] = status[key] === true;
  }
  state.csrfToken = typeof status.csrfToken === 'string' ? status.csrfToken : '';
  state.connectionVerifiedAt = typeof status.connectionVerifiedAt === 'string' ? status.connectionVerifiedAt : null;
  state.keyStorage = typeof status.keyStorage === 'string' ? status.keyStorage : 'none';
  state.model = typeof status.model === 'string' ? status.model : 'deepseek-flash';
  state.providerEndpoint = typeof status.providerEndpoint === 'string' ? status.providerEndpoint : state.providerEndpoint;
  state.statusChecked = true;
  state.statusError = false;
}
async function refreshStatus() {
  try {
    const response = await fetch('/api/status', {cache: 'no-store'});
    if (!response.ok) throw new Error();
    applyStatus(await response.json());
  } catch {state.statusChecked = true; state.statusError = true; state.liveEnabled = false;}
  render();
}
async function settingsRequest(path, payload, successKey) {
  if (state.settingsBusy) return;
  state.settingsBusy = true;
  state.settingsError = '';
  state.settingsMessage = '';
  // The form values are never copied into application state or browser storage.
  const body = JSON.stringify(payload);
  if ('password' in payload) payload.password = '';
  if ('apiKey' in payload) payload.apiKey = '';
  render();
  try {
    const response = await fetch(path, {method: 'POST', headers: requestHeaders({'Content-Type': 'application/json'}), body});
    const result = await response.json();
    if (!response.ok) throw responseError(result, 'errorGeneric');
    if (path.endsWith('/test')) {
      if (result.ok !== true || result.check !== 'model-access' || result.chatCompletionTested !== false || result.model !== 'deepseek-flash' || typeof result.verifiedAt !== 'string' || !Number.isFinite(Date.parse(result.verifiedAt))) throw new Error('errorConnection');
      state.connectionVerifiedAt = result.verifiedAt;
    } else if (path === '/api/logout') {
      replaceText(''); state.authenticated = false; state.csrfToken = ''; await refreshStatus();
    } else if (path === '/api/login') {
      state.csrfToken = typeof result.csrfToken === 'string' ? result.csrfToken : '';
      await refreshStatus();
      if (!state.authenticated) throw new Error('errorAuth');
    } else {
      if (result.authenticated !== true || typeof result.configured !== 'boolean' || result.model !== 'deepseek-flash') throw new Error('errorSettings');
      applyStatus(result);
    }
    state.settingsMessage = successKey;
  } catch (error) {state.settingsError = copy.en[error.message] ? error.message : 'errorGeneric';}
  finally {state.settingsBusy = false; render();}
}

function agencyMarkup() {
  const d = GUIDANCE_COPY[state.lang];
  const guidance = getAgencyGuidance(state.guidanceAgency, state.lang);
  return `<details class="help-details agency-references" id="agency-references" ${state.guidanceOpen ? 'open' : ''}><summary>${d.title}</summary><label for="guidance-agency">${d.selectLabel}</label><select id="guidance-agency">${AGENCY_OPTIONS.map(item => `<option value="${item.id}" ${item.id === state.guidanceAgency ? 'selected' : ''}>${esc(item.label[state.lang])}</option>`).join('')}</select><p>${d.scope}</p><ul>${guidance.links.map(link => `<li><a href="${esc(link.url)}" target="_blank" rel="noreferrer">${esc(link.title)} ↗</a><small>${d.editionLabel}: ${esc(link.edition)}</small></li>`).join('')}</ul><p>${d.acceptance}</p>${guidance.links.some(link => link.printedOMBExpiration) ? `<p>${d.versionCaution}</p>` : ''}<details><summary>${d.conditionsLabel}</summary><ul>${guidance.notes.map(note => `<li>${esc(note)}</li>`).join('')}</ul></details><p class="small">${d.checkedLabel}: ${guidance.checkedAt}</p></details>`;
}

function workbookMarkup() {
  if (!state.workbook) return '';
  const d = t();
  const sheet = state.workbook.sheets[state.sheetIndex];
  const row = sheet.rows[state.rowIndex] || [];
  const columnName = index => {
    let name = '';
    for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name;
    return name;
  };
  return `<div class="workbook-map"><h3>${d.mapTitle}</h3><div class="workbook-selectors"><label>${d.sheetLabel}<select id="workbook-sheet">${state.workbook.sheets.map((item, i) => item.hidden || !item.rows.length ? '' : `<option value="${i}" ${i === state.sheetIndex ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label><label>${d.rowLabel}<select id="workbook-row">${sheet.rows.map((cells, i) => `<option value="${i}" ${i === state.rowIndex ? 'selected' : ''}>${i + 1} · ${esc(cells.filter(Boolean).slice(0, 2).join(' / ').slice(0, 65))}</option>`).join('')}</select></label></div>
    <div class="mapping-fields">${FIELDS.map(key => `<label><span>${labelFor(key)}</span><select data-mapping="${key}"><option value="">${d.skipColumn}</option>${row.map((value, column) => `<option value="${column}" ${state.mapping[key] === column ? 'selected' : ''} ${sheet.blockedCells.some(cell => cell.row === state.rowIndex && cell.column === column) ? 'disabled' : ''}>${columnName(column)} · ${esc(value || '—')}</option>`).join('')}</select></label>`).join('')}</div>
    ${sheet.truncated ? `<p class="small">${d.workbookLimited}</p>` : ''}${sheet.blockedCells.length ? `<p class="small">${d.workbookBlocked}</p>` : ''}
    <div class="actions"><button id="apply-mapping" class="primary">${d.applyMapping} →</button><button id="cancel-mapping" class="link">${d.cancelMapping}</button></div></div>`;
}

function render() {
  const active = document.activeElement;
  const focus = active?.id;
  const selection = active && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
  const d = t();
  const {fields, busy} = state;
  const reviewed = fields.filter(field => field.confirmed).length;
  const missing = fields.filter(field => !field.value.trim());
  const needsEnglish = fieldsNeedEnglish();
  const stage = state.stage;
  document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : 'en';
  byId('app').innerHTML = `<div class="shell compact-shell">
    <header><a class="brand" href="#main" aria-label="Nestlet"><img src="/logo.svg" alt=""><div class="wordmark">${d.brand}<span class="small">${state.lang === 'zh' ? ' Nestlet' : ''}</span></div></a><div class="tools"><span class="pill mode">DeepSeek Flash</span><button class="ghost" id="settings" aria-expanded="${state.settingsOpen}">${d.settings}</button><button class="ghost" id="language" lang="${state.lang === 'zh' ? 'en' : 'zh-CN'}" aria-label="${state.lang === 'zh' ? 'Switch interface to English' : '切换界面为中文'}">${state.lang === 'zh' ? 'English' : '中文'}</button></div></header>
    ${settingsMarkup()}
    <div class="workspace-heading"><h1>${d.workspaceTitle}</h1><p>${d.safeShort}<span class="workflow-focus">${d.workflowFocus}: ${esc(getAgencyGuidance(state.guidanceAgency, state.lang).label)}</span></p></div>
    <nav class="steps" aria-label="${d.workflow}">${d.steps.map((step, index) => `<button type="button" data-stage="${index}" class="step ${stage === index ? 'active current' : index < stage ? 'active' : ''}" ${index === 1 && !fields.length || index === 2 && !state.generated ? 'disabled' : ''} ${stage === index ? 'aria-current="step"' : ''}><b>${index + 1}</b>${step}</button>`).join('')}</nav>
    <main id="main" class="grid" ${stage === 2 ? 'hidden' : ''}>
      <section class="panel" id="input-panel" ${stage !== 0 ? 'hidden' : ''}><div class="panel-top"><h2>${d.inputShort}</h2></div>
        <label class="file ${busy ? 'disabled' : ''}"><span aria-hidden="true">↥</span><span>${d.filePick}<small class="file-formats">TXT · CSV${state.pdfEnabled ? ' · PDF' : ''}${state.workbookEnabled ? ' · XLSX · XLS' : ''}</small></span><input type="file" id="file" accept=".txt,.csv,text/plain,text/csv${state.pdfEnabled ? ',.pdf,application/pdf' : ''}${state.workbookEnabled ? ',.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel' : ''}" ${busy ? 'disabled' : ''}></label>
        ${state.workbook || state.source ? `<div class="document-name">${esc(state.workbook?.filename || state.source)}</div>` : ''}
        ${state.workbook ? workbookMarkup() : `
        <label class="sr-only" for="input">${d.input}</label><textarea class="input" id="input" maxlength="50000" placeholder="${d.pasteShort}" ${busy ? 'disabled' : ''}>${esc(state.text)}</textarea>
        <div class="input-meta"><details class="help-details"><summary>${d.inputHelp}</summary><p>${d.inputHint}</p><p>${state.pdfEnabled ? d.pdfHint : d.noPdfHint}</p><p>${state.workbookEnabled ? d.workbookHint : ''}</p><p>${d.localHint}</p><p class="label-list">Property: · Owner: · PHA: · Case reference: · Proposed rent:</p><p>${d.privacy}</p></details><span class="small char-count" id="char-count">${state.text.length.toLocaleString()} / 50,000</span></div>
        <div class="actions"><button class="primary" id="live" ${busy ? 'disabled' : ''}>${d.nextReview} →</button><button class="link" id="extract" ${busy ? 'disabled' : ''}>${d.manualAction}</button>${busy ? `<button class="secondary" id="cancel">${d.cancel}</button>` : ''}<button class="link push-right" id="reset">${d.reset}</button></div>
        `}
        <div class="error" role="alert">${state.error ? d[state.error] || d.errorGeneric : ''}</div><div class="success" role="status">${busy ? d.busy : ['loaded', 'cancelled'].includes(state.message) ? d[state.message] : ''}</div>
      </section>
      <section class="panel" id="review-panel" ${stage !== 1 ? 'hidden' : ''}><div class="panel-top"><h2>${d.reviewShort}</h2><span class="review-count">${reviewed} / ${FIELDS.length} ${d.confirmed}</span></div>
        <div class="review-topline"><span>${state.mode === 'live' ? d.liveMode : d.demo}</span><span>${d.sourceHint}</span></div>
        <div class="review-progress" role="progressbar" aria-label="${d.progress}" aria-valuemin="0" aria-valuemax="${FIELDS.length}" aria-valuenow="${reviewed}"><span class="reviewed-${reviewed}"></span></div>
        <div>${fields.map(fieldMarkup).join('')}</div>
        ${missing.length ? `<div class="missing-compact"><span>${d.missingShort}</span> ${missing.map(field => labelFor(field.key)).join(' · ')}<small>${d.missingScope}</small></div>` : ''}
        <details class="help-details checklist"><summary>${d.nextHelp}</summary><p>${d.checklist}</p><ul>${d.checks.map(item => `<li>${item}</li>`).join('')}</ul><p>${d.csvHint}</p></details>
        ${agencyMarkup()}
        ${nameFields().length ? `<label class="confirm name-preflight"><input type="checkbox" id="names-verified" ${state.namesVerified ? 'checked' : ''} ${busy ? 'disabled' : ''}>${d.nameReview}</label>` : ''}
        <div class="draft-choice"><label for="draft-type">${d.draftTypeShort}</label><select id="draft-type" ${busy ? 'disabled' : ''}>${kinds.map((kind, index) => `<option value="${kind}" ${state.kind === kind ? 'selected' : ''}>${d.types[index]}</option>`).join('')}</select></div>
        <div class="actions"><button id="generate" class="primary" ${canDraft(fields) && !needsEnglish && !busy ? '' : 'disabled'}>${d.generate} →</button><button id="csv" class="link">${d.csv}</button><button id="review-back" class="link push-right">${d.backInput}</button></div>
        ${needsEnglish || !canDraft(fields) ? `<p class="small gate">${needsEnglish ? d.englishRequired : d.gateShort}</p>` : ''}
      </section>
    </main>
    ${state.generated ? `<section class="panel draft-panel" id="draft-panel" ${stage !== 2 ? 'hidden' : ''}><div class="panel-top"><h2>${d.types[kinds.indexOf(state.generatedKind)]}</h2><span class="draft-tag">ENGLISH · DRAFT</span></div><p class="caption">${d.draftShort}</p><label for="draft" class="sr-only">English draft</label><textarea id="draft" class="input draft" lang="en" spellcheck="true">${esc(state.draftText)}</textarea><div class="print-text" hidden lang="en">${esc(exportDraft())}</div><div class="actions"><button id="copy" class="primary" ${draftNeedsEnglish() ? 'disabled' : ''}>${d.copy}</button><button id="download" class="secondary" ${draftNeedsEnglish() ? 'disabled' : ''}>${d.download}</button><button id="print" class="ghost" ${draftNeedsEnglish() ? 'disabled' : ''}>${d.print}</button><button id="draft-back" class="link push-right">${d.backReview}</button></div><p class="error" id="draft-language-error" role="status">${draftNeedsEnglish() ? d.draftEnglishRequired : ''}</p><div class="success" role="status">${['copied', 'copyFail'].includes(state.message) ? d[state.message] : ''}</div></section>` : ''}
    <footer><span>${d.footerShort}</span><a href="https://www.hud.gov/helping-americans/housing-choice-vouchers-tenants" target="_blank" rel="noreferrer">${d.reference} ↗</a></footer>
  </div>`;
  bind();
  if (focus && byId(focus) && !byId(focus).disabled && !byId(focus).closest('[hidden]')) {
    byId(focus).focus({preventScroll: true});
    if (selection && selection[0] !== null) byId(focus).setSelectionRange(...selection);
  }
}

function clearReview() {
  state.fields = [];
  state.namesVerified = false;
  state.draftText = '';
  state.generated = false;
  state.error = '';
  state.message = '';
  state.mode = 'demo';
}
function cancelProcessing() {
  state.version++;
  state.controller?.abort();
  state.controller = null;
  state.busy = false;
}
function replaceText(text, source = '', sample = false) {
  state.stage = 0;
  state.workbook = null;
  cancelProcessing();
  clearReview();
  state.text = text;
  state.source = source;
  state.sample = sample;
}
function exportDraft() {
  if (draftNeedsEnglish()) return 'DRAFT EXPORT UNAVAILABLE\nVerify English renderings of the CJK text before exporting this document.';
  const notices = [
    'DRAFT — FOR HUMAN REVIEW',
    'DE-IDENTIFIED WORKING COPY — NOT FOR SUBMISSION',
    'Operator-prepared supplementary document; not an official government form'
  ];
  // Export notices are immutable even if the editable body is cleared or changed.
  const body = state.draftText.split('\n').filter(line => !notices.includes(line) && line !== 'Supplementary correspondence; not an official government form').join('\n').trimStart();
  return notices.join('\n') + '\n\n' + body;
}

function download(content, name, type) {
  const anchor = document.createElement('a');
  const url = URL.createObjectURL(new Blob([content], {type}));
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function beginProcessing() {
  cancelProcessing();
  state.controller = new AbortController();
  state.busy = true;
  state.error = '';
  state.message = '';
  render();
  return {ticket: state.version, signal: state.controller.signal};
}
function finishProcessing(ticket) {
  if (ticket !== state.version) return;
  state.busy = false;
  state.controller = null;
  render();
}

async function importFile(file) {
  if (!file) return;
  const isPdf = /\.pdf$/i.test(file.name);
  const isWorkbook = /\.xlsx?$/i.test(file.name);
  if (!/\.(txt|csv|pdf|xlsx|xls)$/i.test(file.name) || isPdf && !state.pdfEnabled || isWorkbook && !state.workbookEnabled) {
    state.error = 'errorFile'; render(); return;
  }
  if (file.size > (isPdf || isWorkbook ? 5242880 : 50000)) {state.error = 'errorSize'; render(); return;}
  if ((state.fields.length || state.generated) && !confirm(t().replaceAsk)) {render(); return;}
  if ((isPdf || isWorkbook) && !state.authConfigured) {state.settingsOpen = true; state.settingsError = 'operatorSetupHelp'; render(); return;}
  if ((isPdf || isWorkbook) && !state.authenticated) {state.settingsOpen = true; state.settingsError = 'errorAuth'; render(); return;}
  if (isPdf && !confirm(t().pdfConsent)) {render(); return;}
  if (isWorkbook && !confirm(t().workbookConsent)) {render(); return;}
  const {ticket, signal} = beginProcessing();
  try {
    let next;
    if (isWorkbook) {
      const response = await fetch('/api/workbook', {method: 'POST', headers: requestHeaders({'Content-Type': /\.xlsx$/i.test(file.name) ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/vnd.ms-excel', 'X-Document-Consent': 'synthetic-or-deidentified'}), body: file, signal});
      const result = await response.json();
      if (ticket !== state.version) return;
      if (!response.ok) throw responseError(result, response.status === 413 ? 'errorSize' : 'errorWorkbook');
      if (!Array.isArray(result.sheets) || !result.sheets.some(sheet => sheet.hidden === false && Array.isArray(sheet.rows) && sheet.rows.length)) throw new Error(response.status === 413 ? 'errorSize' : 'errorWorkbook');
      state.workbook = {...result, filename: file.name};
      state.sheetIndex = result.sheets.findIndex(sheet => sheet.hidden === false && sheet.rows.length);
      state.rowIndex = result.sheets[state.sheetIndex].rows.length > 1 ? 1 : 0;
      state.mapping = Object.fromEntries(FIELDS.map(key => [key, null]));
      state.stage = 0;
      return;
    } else if (isPdf) {
      const response = await fetch('/api/document', {method: 'POST', headers: requestHeaders({'Content-Type': 'application/pdf', 'X-Document-Consent': 'synthetic-or-deidentified'}), body: file, signal});
      const result = await response.json();
      if (!response.ok) {
        const codes = {OCR_REQUIRED: 'errorScanned', PDF_ENCRYPTED: 'errorEncrypted', BUSY: 'errorBusy'};
        throw responseError(result, response.status === 413 ? 'errorSize' : codes[result.code] || 'errorPdf');
      }
      if (typeof result.text !== 'string' || result.text.length > 50000) throw new Error('errorPdf');
      next = result.text;
    } else {
      const raw = new TextDecoder('utf-8', {fatal: true}).decode(await file.arrayBuffer());
      next = /\.csv$/i.test(file.name) ? parseCSV(raw) : raw;
    }
    if (ticket !== state.version) return;
    replaceText(next, file.name);
    state.message = 'loaded';
    render();
  } catch (error) {
    if (ticket === state.version) state.error = copy.en[error.message] ? error.message : /\.csv$/i.test(file.name) ? 'errorCSV' : isPdf ? 'errorPdf' : isWorkbook ? 'errorWorkbook' : 'errorFile';
  } finally {finishProcessing(ticket);}
}

async function extractLive() {
  if (state.authConfigured && !state.authenticated) {state.settingsOpen = true; state.settingsError = 'errorAuth'; render(); return;}
  if (!state.liveEnabled) {state.error = state.statusError ? 'errorBackend' : 'errorConfig'; state.settingsOpen = true; render(); return;}
  if (!state.text.trim()) {state.error = 'errorEmpty'; render(); return;}
  if (!confirm(t().consent)) return;
  const {ticket, signal} = beginProcessing();
  try {
    const response = await fetch('/api/extract', {method: 'POST', headers: requestHeaders({'Content-Type': 'application/json'}), body: JSON.stringify({text: state.text, consent: true}), signal});
    const result = await response.json();
    if (ticket !== state.version) return;
    if (!response.ok) throw responseError(result, result.code === 'SENSITIVE_DATA' ? 'errorSensitive' : result.code === 'BUSY' ? 'errorBusy' : 'errorLive');
    if (!Array.isArray(result.fields) || result.fields.length !== FIELDS.length || result.fields.some((field, i) => field.key !== FIELDS[i] || typeof field.value !== 'string' || typeof field.source !== 'string')) throw new Error('Invalid suggestions');
    clearReview();
    state.fields = result.fields.map(field => ({...field, confirmed: false}));
    state.mode = 'live';
    state.stage = 1;
  } catch (error) {if (ticket === state.version) state.error = copy.en[error.message] ? error.message : 'errorLive';}
  finally {finishProcessing(ticket);}
}

function bind() {
  const on = (id, event, handler) => byId(id)?.addEventListener(event, handler);
  const go = stage => {state.stage = stage; render(); byId(stage === 2 ? 'draft-panel' : 'main').scrollIntoView({behavior: 'smooth', block: 'start'});};
  document.querySelectorAll('[data-stage]').forEach(button => button.addEventListener('click', () => go(Number(button.dataset.stage))));
  on('review-back', 'click', () => go(0));
  on('draft-back', 'click', () => go(1));
  on('guidance-agency', 'change', event => {state.guidanceAgency = event.target.value; state.guidanceOpen = true; render();});
  on('agency-references', 'toggle', event => {state.guidanceOpen = event.target.open;});
  on('settings', 'click', () => {state.settingsOpen = !state.settingsOpen; state.settingsError = ''; state.settingsMessage = ''; render();});
  on('refresh-status', 'click', refreshStatus);
  on('login-form', 'submit', event => {
    event.preventDefault();
    if (!operatorLoginAvailable()) return;
    const input = byId('operator-password');
    const payload = {password: input.value};
    input.value = '';
    settingsRequest('/api/login', payload, 'loginSuccess');
  });
  on('key-form', 'submit', event => {
    event.preventDefault();
    if (!secureSettingsAvailable() || !state.authenticated) return;
    const input = byId('api-key');
    const payload = {enableLive: byId('enable-live').checked};
    if (input.value.trim()) payload.apiKey = input.value.trim();
    input.value = '';
    settingsRequest('/api/settings', payload, 'settingsSaved');
  });
  on('test-connection', 'click', () => settingsRequest('/api/settings/test', {}, 'connectionSuccess'));
  on('logout', 'click', () => {
    if ((state.text || state.generated) && !confirm(t().logoutConfirm)) return;
    cancelProcessing();
    settingsRequest('/api/logout', {}, 'logoutSuccess');
  });
  on('language', 'click', () => {state.lang = state.lang === 'zh' ? 'en' : 'zh'; render();});
  on('reset', 'click', () => {
    if ((state.text || state.fields.length || state.busy) && !confirm(t().resetAsk)) return;
    replaceText(''); state.kind = 'followup'; render(); byId('input').focus();
  });
  on('cancel', 'click', () => {cancelProcessing(); state.message = 'cancelled'; render();});
  on('input', 'input', event => {
    state.text = event.target.value;
    const wasSample = state.sample;
    state.sample = false;
    state.error = '';
    state.message = '';
    if (state.fields.length || state.generated || state.source || wasSample) {clearReview(); state.source = ''; render();}
    else byId('char-count').textContent = state.text.length.toLocaleString() + ' / 50,000';
  });
  on('file', 'change', event => importFile(event.target.files[0]));
  on('workbook-sheet', 'change', event => {
    state.sheetIndex = Number(event.target.value);
    state.rowIndex = state.workbook.sheets[state.sheetIndex].rows.length > 1 ? 1 : 0;
    state.mapping = Object.fromEntries(FIELDS.map(key => [key, null]));
    state.error = ''; render();
  });
  on('workbook-row', 'change', event => {state.rowIndex = Number(event.target.value); state.mapping = Object.fromEntries(FIELDS.map(key => [key, null])); state.error = ''; render();});
  document.querySelectorAll('[data-mapping]').forEach(select => select.addEventListener('change', event => {state.mapping[select.dataset.mapping] = event.target.value === '' ? null : Number(event.target.value); state.error = '';}));
  on('cancel-mapping', 'click', () => {state.workbook = null; state.error = ''; render();});
  on('apply-mapping', 'click', () => {
    try {
      const sheet = state.workbook.sheets[state.sheetIndex];
      const result = mapSpreadsheetRow(sheet, {rowIndex: state.rowIndex, mapping: state.mapping});
      const filename = state.workbook.filename;
      replaceText(result.text, filename);
      state.fields = result.fields;
      state.stage = 1;
      render();
    } catch {state.error = 'errorMapping'; render();}
  });
  on('extract', 'click', () => {
    if (!state.text.trim()) {state.error = 'errorEmpty'; render(); byId('input').focus(); return;}
    clearReview(); state.fields = extract(state.text); state.stage = 1; render();
    if (window.matchMedia('(max-width: 760px)').matches) byId('review-panel').scrollIntoView({behavior: 'smooth', block: 'start'});
  });
  on('live', 'click', extractLive);
  document.querySelectorAll('[data-field]').forEach(element => element.addEventListener('input', event => {
    if (event.isComposing) return;
    const field = state.fields[Number(element.dataset.field)];
    field.value = event.target.value;
    field.confirmed = false;
    field.conflict = false;
    field.edited = true;
    state.namesVerified = false;
    state.draftText = ''; state.generated = false; state.message = '';
    render();
  }));
  document.querySelectorAll('[data-confirm]').forEach(element => element.addEventListener('change', () => {
    state.fields[Number(element.dataset.confirm)].confirmed = element.checked;
    state.draftText = ''; state.generated = false; state.message = '';
    render();
  }));
  on('names-verified', 'change', event => {state.namesVerified = event.target.checked; state.draftText = ''; state.generated = false; render();});
  on('draft-type', 'change', event => {state.kind = event.target.value;});
  on('generate', 'click', () => {
    if (!canDraft(state.fields) || fieldsNeedEnglish()) return;
    state.draftText = draft(state.fields, state.kind).split('\n').filter(line => !['DRAFT — FOR HUMAN REVIEW', 'DE-IDENTIFIED WORKING COPY — NOT FOR SUBMISSION', 'Operator-prepared supplementary document; not an official government form', 'Supplementary correspondence; not an official government form'].includes(line)).join('\n').trimStart();
    state.generatedKind = state.kind;
    state.generated = true; state.stage = 2; state.message = ''; render();
    byId('draft-panel').scrollIntoView({behavior: 'smooth', block: 'start'});
    byId('draft').focus({preventScroll: true});
  });
  on('csv', 'click', () => download(exportCSV(state.fields, {includeNotice: true}), 'nestlet-case-DRAFT.csv', 'text/csv;charset=utf-8'));
  on('draft', 'input', event => {state.draftText = event.target.value; state.message = ''; document.querySelector('.print-text').textContent = exportDraft(); document.querySelector('#draft-panel .success').textContent = ''; const blocked = draftNeedsEnglish(); ['copy', 'download', 'print'].forEach(id => byId(id).disabled = blocked); byId('draft-language-error').textContent = blocked ? t().draftEnglishRequired : '';});
  on('download', 'click', () => download(exportDraft(), `nestlet-${state.generatedKind}-DRAFT.txt`, 'text/plain;charset=utf-8'));
  on('print', 'click', () => window.print());
  on('copy', 'click', async () => {
    try {await navigator.clipboard.writeText(exportDraft()); state.message = 'copied';}
    catch {state.message = 'copyFail';}
    render();
  });
}

render();
refreshStatus();

window.addEventListener('beforeprint', () => {document.title = `Nestlet - ${copy.en.types[kinds.indexOf(state.generatedKind)]} - DRAFT`;});
window.addEventListener('afterprint', () => {document.title = 'Nestlet · 巢小秘';});
