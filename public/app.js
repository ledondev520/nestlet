import {FIELDS, DRAFT_TYPES, mapSpreadsheetRow, hasCJKText, extract, canDraft, draft, parseCSV, exportCSV} from './core.js';
import {AGENCY_OPTIONS, DEFAULT_GUIDANCE_AGENCY, GUIDANCE_COPY, getAgencyGuidance} from './agency-guidance.js';

const copy = {
  zh: {
    errorReadinessUnsaved: '请先保存案件或当前文书的修改，再补齐资料。你的输入仍保留。', errorReadinessChanged: '资料已在服务器保存，但等待期间工作区又有修改。你的本地输入未被覆盖；请先保留修改，再打开最新案件对照。',
    errorCaseIssueNotFound: '这条待办事项不存在或不属于当前案件，请刷新后重试。', artifactOpen: '打开', artifactArchived: '旧稿已保留在文档版本中', generateFinal: '生成完成版', customerCases: '客户案件', artifactHistory: '历史版本，请根据当前案件重新生成',
    workspaceTitle: '从材料到英文草稿', safeShort: '仅限虚构或去标识化资料', inputShort: '放入材料', sampleShort: '试用示例', pasteShort: '或在这里粘贴去标识化文本…', inputHelp: '支持格式与处理方式', nextReview: 'AI 提取并核对', reviewShort: '核对五项事实', sourceHint: '原文可展开查看', check: '确认', editedShort: '人工修改 · 查看出处', missingShort: '待补充：', missingScope: '仅表示本次材料未提供，并非机构缺件通知', nextHelp: '后续事项与导出说明', draftTypeShort: '草稿类型', backInput: '返回材料', backReview: '返回核对', gateShort: '请确认每一项；未知信息可保留空白', draftShort: '可直接编辑。辅助文书，非官方表格；请人工复核后使用。', footerShort: '仅生成草稿 · 不自动发送或提交',
    chatEmpty: '可以直接提问下一步怎么走，或粘贴案例材料后发送。图片与材料也可以拖拽进来。', chatSend: '发送', chatStop: '停止', chatRetry: '重试', chatStreaming: '正在回复…', chatAttachImage: '添加图片', chatImageOnly: '请协助分析附图内容。', chatImageBad: '仅支持 PNG / JPEG 图片，最多 2 张，每张不超过 2 MB、边长不超过 8192 像素。', chatTooLong: '单次对话消息最长 8,000 字符；更长的材料请直接使用提取与核对流程。', chatIncomplete: '回复中断，以上内容不完整。可重试。', errorChat: '对话请求失败。可重试；已输入的内容不会丢失。', chatConsent: '继续会把对话内容、当前材料与所附图片发送给 DeepSeek。仅限虚构或去标识化资料。你是否已确认数据处理条款和授权，并同意发送？', chatYou: '你', chatAssistant: '巢小秘', chatRemoveImage: '移除图片',
    errorClientInvalid: '客户信息不符合要求，请检查后重试。', errorClientNotFound: '未找到该客户，可能已被删除。', errorClientConflict: '该客户记录已在别处更新。当前输入已保留，请刷新核对后再试。', errorConversationInvalid: '对话内容不符合要求。', errorConversationNotFound: '未找到该对话。', errorMessageInvalid: '消息格式无效。', errorChatBusy: '该对话正在处理上一条回复，请稍候。', errorChatTurnExists: '该轮回复已存在，请刷新查看。', errorChatSaveFailed: '对话保存失败；当前内容未丢失，可重试。', errorChatProvider: '模型服务暂时不可用，请稍后重试。', errorChatOutput: '回复格式不受支持，未显示。请重试。', errorDocContext: '文档上下文无效。', errorDocConflict: '文档信息已在别处更新。当前修改已保留，请刷新核对。', errorDocDetails: '文档信息不符合要求，请检查必填项。', errorDocRequired: '还有必填信息未完成，请先补齐。', errorDocContent: '文档内容无效。', errorDocPlaceholders: '文档仍含待填占位符，不能标记为完成。', errorArtifactInvalid: '文档产物无效。', errorArtifactNotFound: '未找到该文档产物。', errorArtifactSource: '生成依据不完整，请先补齐材料。', errorCapacity: '存储容量已满，请清理后再试。', errorArtifactStale: '该文档版本基于旧案例内容，已不可直接下载；请重新生成新版本。',
    customerLabel: '客户', customerSearch: '搜索客户姓名…', customerCreate: '新建客户', customerLinked: '已关联：', conversationLabel: '对话', conversationNew: '新对话', conversationMain: '主对话', artifactSave: '保存文档版本', artifactSavedOk: '文档版本已保存', artifactList: '已存文档版本', artifactDownload: '下载', artifactStaleBadge: '内容已过期', artifactStatusDraft: '草稿', artifactStatusFinal: '完成版', readinessMissing: '生成前请补齐以下信息：', readinessReady: '必填信息已齐备', readinessConfirmAll: '确认并保存', readinessAnswer: '填写…',
    settings: '设置', modelLabel: '模型', endpointLabel: '接口', readyStatus: '提取已启用', configStatus: '尚未启用 AI', backendStatus: '后端未连接', checkingStatus: '正在检查连接', configHelp: '在服务器设置 DEEPSEEK_API_KEY，并将 ENABLE_LIVE_AI 设为 true 后重启。密钥仅保留在服务器，不在浏览器保存。', manualAction: '按标签手动整理', errorConfig: 'DeepSeek 尚未启用。请在设置中查看服务器配置步骤；不会自动切换到模拟结果。', errorBackend: '尚未连接到处理服务器。请启动完整服务后再使用 AI 或文件处理。', filePick: '上传文件', workbookHint: 'Excel 文件上传至服务器读取工作表；需选择单行并确认字段映射。不会执行公式或宏。', workbookConsent: '此 Excel 文件将上传至本服务器以读取工作表和单元格，不会自动发送至 DeepSeek。请确认仅含虚构或去标识化资料。继续？', mapTitle: '选择一行，映射字段', sheetLabel: '工作表', rowLabel: '数据行', columnLabel: '列', skipColumn: '不导入', applyMapping: '确认映射并核对', cancelMapping: '取消导入', errorWorkbook: '无法读取此工作簿。请使用未加密的 XLSX / XLS，或导出为单案例 CSV。', errorMapping: '请选择有效数据行和不重复的列；公式、隐藏或合并单元格不能导入。', workbookLimited: '仅预览前 200 行、50 列；其余内容未载入', workbookBlocked: '部分单元格不可导入，请选择普通可见值',
    operatorSetup: '请先配置操作员账户', operatorSetupHelp: '请在服务器配置 NESTLET_OPERATOR_PASSWORD_HASH 与 HTTPS 的 PUBLIC_ORIGIN，再重启服务。', signInRequired: '请先登录', operatorPassword: '登录密码', signIn: '登录', signOut: '退出登录', refreshStatus: '刷新状态', apiKey: 'DeepSeek API Key', replaceKey: '更换 API Key（可选）', keepExistingKey: '留空以保留现有密钥', saveSettings: '保存设置', enableLive: '启用 DeepSeek 提取', keyMemoryNotice: '网页填写的密钥仅存于服务器内存，服务重启后需重新填写；浏览器不保存密钥。', keyEnvironment: '密钥：服务器环境', keyMemory: '密钥：服务器内存', keyMissing: '尚未配置密钥', testConnection: '测试连接', connectionVerified: '模型访问已验证，尚未测试文本生成', settingsSaved: '设置已保存，连接验证状态单独显示', connectionSuccess: '已确认账户可访问 DeepSeek Flash，未调用文本生成', loginSuccess: '已登录，可继续原来的操作', logoutSuccess: '已退出，工作区已清空；已保存案例仍保留', logoutConfirm: '退出登录会清空工作区，未保存的修改会丢失。已保存的案例仍保留。继续？', errorAuth: '请登录后重新执行刚才的操作。', errorSession: '登录状态已失效，请重新登录。', errorHttps: '密码和密钥设置仅在可信 HTTPS 页面开放。请先完成服务器 HTTPS 配置。', errorCredentials: '用户名或密码不正确，或账户尚未配置。', errorRateLimit: '操作过于频繁，请一分钟后重试。', errorSettings: '设置无效，请检查 API Key 格式。', errorKeyRequired: '请先填写并保存 API Key。', errorConnection: '连接验证失败。请检查密钥和账户访问权限；未测试文本生成。', errorModel: '此账户未返回 DeepSeek Flash 的访问权限，请核实后重试。',
    workflowFocus: '资料参考', localLoginNotice: '本机开发登录。API 密钥的网页录入仍要求已认证的 HTTPS 页面。',
    account: '账户', trialAccess: '普通账号', trialAccountHint: '可以处理自己的案例；服务连接由管理员维护。', loginUsername: '用户名', loginUsernameHint: '普通账号填写用户名；管理员可留空', errorOwnerRequired: '此操作仅管理员可用。', errorTrialUnavailable: '服务暂不可用，请联系管理员。',
    savedCases: '我的已存案例', saveCase: '保存案例', caseName: '案例名称', untitledCase: '未命名案例', chooseCase: '选择已保存案例', openCase: '打开', deleteCase: '删除存档', savedScope: '只保存当前账户的文本、核对事实和草稿，不保存原始文件。不会自动保存。', caseSaved: '已保存', caseNotSaved: '尚未保存', unsavedChanges: '有未保存的修改', caseSaveSuccess: '案例已保存', caseOpened: '已打开保存的案例', caseDeleted: '已删除存档，当前工作区内容仍保留', unsavedOpen: '当前修改尚未保存。打开其他案例会替换工作区，继续？', deleteCaseConfirm: '永久删除这个已保存案例？此操作无法撤销。', errorCaseNotFound: '案例不存在或当前账户无权访问。', errorCaseInvalid: '案例内容无效，请检查名称和字段。', errorCaseTooLarge: '案例总数据不能超过 256 KiB，原文和草稿各不能超过 50,000 字符。请缩短内容后重试。', errorCaseConflict: '此案例已在别处修改，未覆盖当前内容。请先导出或复制需要保留的修改，再打开最新存档核对。', errorCaseStorage: '案例存储暂不可用，当前工作区未改变。请稍后重试。', errorCaseChanged: '工作区在加载期间发生变化，未替换内容。请确认修改后再次打开。', errorTrialLimit: '普通账号的提取次数已达限额，请稍后再试或联系管理员。',
    errorCaseLimit: '当前账户已达到 100 个案例的上限。请先删除不再需要的存档，再添加新案例；现有案例仍可更新。',
    register: '注册普通账号', repeatPassword: '再次输入密码', registerUsernameHint: '3–64 位小写字母或数字，可含 _ . -；owner 保留给管理员', registerPasswordHint: '密码为 6–256 个字符', registrationSuccess: '普通账号已创建并登录', registrationUnavailable: '注册暂未开放，请联系管理员。', errorRegistration: '请使用符合格式的用户名和 6–256 字符密码；两次密码须一致。', errorPasswordMismatch: '两次输入的密码不一致，请检查。', errorUsernameExists: '该用户名已被使用，请换一个。', errorRegistrationRate: '注册请求过于频繁，请稍后重试。',
    sampleDownloads: '下载虚构测试材料', sampleDownloadHint: '仅用于测试。下载后自行导入；不会自动填入案例或调用 AI。', sampleWorkbookHint: 'Excel 请选择 Synthetic case 工作表第 2 行，将 A–E 列依次对应五项字段。',
    signInOrRegister: '登录 / 注册', manageAccount: '管理',
    brand: '巢小秘', tag: '一份材料 · 向前一步', demo: '手动整理', liveMode: 'DeepSeek 实时提取',
    title: '少一点文书，多一点进展。', subtitle: '保留熟悉的文件夹和表格。一次处理一个案例，把零散材料整理成可核对的事实和英文草稿。',
    eyebrow: '租赁手续，有个小帮手', privacy: '仅限虚构或去标识化资料。请勿输入真实租客、税号、银行或证件信息。点击“保存案例”会将文本、核对结果和草稿存到当前账户，供返回编辑；原始文件不保留。未保存的修改会在刷新后丢失。',
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
    reset: '清空案例', resetAsk: '清空当前工作区？未保存的修改会丢失，已保存的案例不会删除。', replaceAsk: '用新材料替换当前案例？当前核对结果和草稿将被清空。',
    copied: '英文草稿已复制', copyFail: '复制失败，请手动选中草稿复制', cancelled: '处理已取消，未应用新结果',
    errorFile: '请使用 UTF-8 TXT / 单案例 CSV（最大 50 KB），或当前支持的 PDF / XLSX / XLS。', errorCSV: 'CSV 需要列头 property, owner, pha, caseReference, rent，以及一行案例数据。', errorEmpty: '请先粘贴文本或导入文件。',
    errorLive: '实时 AI 不可用或请求失败。未应用新建议，可重试或选择手动整理。', errorPdf: '无法提取此 PDF。请改为粘贴去标识化文本，或使用可选中文本的 PDF。',
    errorScanned: '未找到可提取的文本，此 PDF 可能是扫描件。本原型不支持 OCR，请改为粘贴去标识化文本。', errorEncrypted: '不支持加密 PDF。请使用可读取的去标识化文本。', errorSize: '文件大小超限。TXT / CSV 最大 50 KB；PDF / Excel 最大 5 MiB。请压缩或拆分文件后重试。', errorTextSize: 'PDF 提取后的文本超过 50,000 字符。这与文件大小限制不同；请拆分 PDF、减少页数，或粘贴不超过 50,000 字符的相关文本。', errorGeneric: '操作未完成，请重试。',
    consent: '继续会把本次全部文本发送给 DeepSeek。仅限虚构或去标识化资料；真实敏感资料尚未获得隐私与安全许可。你是否已确认数据处理条款和授权，并同意发送本次文本？',
    pdfConsent: '此 PDF 将上传至本原型服务器，仅用于提取文本，不会自动发送到 DeepSeek。请确认文件仅包含虚构或去标识化资料。继续？',
    footer: '工作名，尚未完成商标核查 · 不筛选租客、不判断资格、不自动发送', reference: 'HUD 官方 HCV 资料',
    draftWarning: '导出会保留英文 DRAFT 与人工复核提示。草稿由模板生成；请保持正文为英文。',
    englishRequired: '请先人工核实英文表述。拟议租金等描述应为英文；有原文支持的姓名、机构、地址和编号可以保留。不会自动翻译事实。', nameReview: '我确认中日韩文字仅用于已核实的姓名、机构、地址或编号，须按原文保留；文书正文使用英文', draftEnglishRequired: '草稿含有未经确认的中日韩文字。已核实的专名可保留；请将其他正文人工改为英文后再导出。',
    fields: ['房源地址', '业主', '住房机构 PHA', '案例编号', '拟议租金']
  },
  en: {
    errorReadinessUnsaved: 'Save your case or document edits before completing these details. Your input is preserved.', errorReadinessChanged: 'The details were saved on the server, but the workspace changed while waiting. Your local input was preserved. Keep those edits, then open the latest case to reconcile.',
    errorCaseIssueNotFound: 'This case issue is unavailable. Refresh the case and try again.', artifactOpen: 'Open', artifactArchived: 'The earlier draft is preserved in document versions', generateFinal: 'Generate final document', customerCases: 'Customer cases', artifactHistory: 'Historical version; regenerate from the current case',
    workspaceTitle: 'From document to English draft', safeShort: 'Synthetic or de-identified information only', inputShort: 'Add your document', sampleShort: 'Try sample', pasteShort: 'Or paste de-identified text here…', inputHelp: 'Formats and processing details', nextReview: 'Extract & review with AI', reviewShort: 'Review five facts', sourceHint: 'Expand a source to check it', check: 'Confirm', editedShort: 'Edited · View source', missingShort: 'To confirm:', missingScope: 'Not provided in this review, not an agency missing-document notice', nextHelp: 'Next steps and export details', draftTypeShort: 'Draft type', backInput: 'Back to document', backReview: 'Back to review', gateShort: 'Confirm every field. Unknown information can stay blank.', draftShort: 'Edit directly. Supplementary draft, not an official form. Review before use.', footerShort: 'Drafts only · Nothing is sent or submitted automatically',
    chatEmpty: 'Ask what to do next, or paste case material and send it. You can also drop files or images here.', chatSend: 'Send', chatStop: 'Stop', chatRetry: 'Retry', chatStreaming: 'Replying…', chatAttachImage: 'Add image', chatImageOnly: 'Please help analyze the attached image(s).', chatImageBad: 'Only PNG / JPEG images, at most 2, each up to 2 MB and 8192 px per side.', chatTooLong: 'A chat message is limited to 8,000 characters. Use the extract & review flow for longer material.', chatIncomplete: 'The reply was interrupted; the content above is incomplete. You can retry.', errorChat: 'The conversation request failed. You can retry; your input is preserved.', chatConsent: 'This sends the conversation, current material and attached images to DeepSeek. Use only synthetic or de-identified information. Have you verified the data-processing terms and authorization, and do you agree to send?', chatYou: 'You', chatAssistant: 'Nestlet', chatRemoveImage: 'Remove image',
    errorClientInvalid: 'Customer details are invalid. Check and try again.', errorClientNotFound: 'Customer not found. It may have been deleted.', errorClientConflict: 'This customer record changed elsewhere. Your input is preserved; reload to reconcile and retry.', errorConversationInvalid: 'The conversation content is invalid.', errorConversationNotFound: 'Conversation not found.', errorMessageInvalid: 'The message is invalid.', errorChatBusy: 'This conversation is still processing the previous reply. Please wait.', errorChatTurnExists: 'That turn already exists. Reload to view it.', errorChatSaveFailed: 'Saving the conversation failed; your content is intact. You can retry.', errorChatProvider: 'The model provider is temporarily unavailable. Try again later.', errorChatOutput: 'The reply format is unsupported and was hidden. Please retry.', errorDocContext: 'The document context is invalid.', errorDocConflict: 'Document details changed elsewhere. Your edits are preserved; reload to reconcile.', errorDocDetails: 'Document details are invalid. Check the required items.', errorDocRequired: 'Required information is still missing. Complete it first.', errorDocContent: 'The document content is invalid.', errorDocPlaceholders: 'The document still contains placeholders and cannot be marked final.', errorArtifactInvalid: 'The artifact is invalid.', errorArtifactNotFound: 'Artifact not found.', errorArtifactSource: 'The source material is incomplete. Add it first.', errorCapacity: 'Storage capacity is reached. Free space and retry.', errorArtifactStale: 'This artifact version is based on older case content and cannot be downloaded directly; generate a fresh version.',
    customerLabel: 'Customer', customerSearch: 'Search customer names…', customerCreate: 'Create customer', customerLinked: 'Linked: ', conversationLabel: 'Conversation', conversationNew: 'New', conversationMain: 'Main conversation', artifactSave: 'Save document version', artifactSavedOk: 'Document version saved', artifactList: 'Saved document versions', artifactDownload: 'Download', artifactStaleBadge: 'Stale', artifactStatusDraft: 'Draft', artifactStatusFinal: 'Final', readinessMissing: 'Before generating, please supply:', readinessReady: 'All required information is present', readinessConfirmAll: 'Confirm & save', readinessAnswer: 'Answer…',
    settings: 'Settings', modelLabel: 'Model', endpointLabel: 'Endpoint', readyStatus: 'Extraction enabled', configStatus: 'AI is not enabled', backendStatus: 'Backend not connected', checkingStatus: 'Checking connection', configHelp: 'Set DEEPSEEK_API_KEY and ENABLE_LIVE_AI=true on the server, then restart. Credentials stay on the server and are never stored in the browser.', manualAction: 'Process labels manually', errorConfig: 'DeepSeek is not enabled. Open Settings for server configuration steps. No simulated result will be substituted.', errorBackend: 'The processing backend is not connected. Start the complete service before using AI or server-side file processing.', filePick: 'Upload a file', workbookHint: 'Excel files are read on the server. Select one row and confirm the field mapping. Formulas and macros are not executed.', workbookConsent: 'This Excel file will be uploaded to the server to read worksheets and cells, not automatically sent to DeepSeek. Confirm that it contains only synthetic or de-identified information. Continue?', mapTitle: 'Choose one row and map its fields', sheetLabel: 'Worksheet', rowLabel: 'Data row', columnLabel: 'Column', skipColumn: 'Skip this field', applyMapping: 'Confirm mapping & review', cancelMapping: 'Cancel import', errorWorkbook: 'Could not read this workbook. Use an unencrypted XLSX / XLS file, or export one case as CSV.', errorMapping: 'Choose a valid row and distinct columns. Formula, hidden, or merged cells cannot be imported.', workbookLimited: 'Preview limited to the first 200 rows and 50 columns', workbookBlocked: 'Some cells cannot be imported. Choose ordinary visible values.',
    operatorSetup: 'Operator setup required', operatorSetupHelp: 'Configure NESTLET_OPERATOR_PASSWORD_HASH and an HTTPS PUBLIC_ORIGIN on the server, then restart.', signInRequired: 'Sign in to continue', operatorPassword: 'Access password', signIn: 'Sign in', signOut: 'Sign out', refreshStatus: 'Refresh status', apiKey: 'DeepSeek API Key', replaceKey: 'Replace API key (optional)', keepExistingKey: 'Leave blank to keep the existing key', saveSettings: 'Save settings', enableLive: 'Enable DeepSeek extraction', keyMemoryNotice: 'Keys entered here stay only in server memory and must be entered again after a server restart. The browser does not store them.', keyEnvironment: 'Key: server environment', keyMemory: 'Key: server memory', keyMissing: 'No key configured', testConnection: 'Test connection', connectionVerified: 'Model access verified; text generation not tested', settingsSaved: 'Settings saved. Connection verification is shown separately.', connectionSuccess: 'DeepSeek Flash model access verified. No text generation was called.', loginSuccess: 'Signed in. You can resume your previous action.', logoutSuccess: 'Signed out. The workspace is cleared; saved cases are retained.', logoutConfirm: 'Signing out clears the workspace and loses unsaved changes. Saved cases are retained. Continue?', errorAuth: 'Sign in, then retry your previous action.', errorSession: 'Your session has expired. Sign in again.', errorHttps: 'Password and key settings require a trusted HTTPS page. Configure server HTTPS first.', errorCredentials: 'Incorrect username or password, or the account is not configured.', errorRateLimit: 'Too many attempts. Wait one minute before retrying.', errorSettings: 'Invalid settings. Check the API key format.', errorKeyRequired: 'Enter and save an API key first.', errorConnection: 'Connection verification failed. Check the key and account access. Text generation was not tested.', errorModel: 'DeepSeek Flash was not listed for this account. Verify access before retrying.',
    workflowFocus: 'Reference focus', localLoginNotice: 'Local development sign-in. Browser API-key entry still requires an authenticated HTTPS page.',
    account: 'Account', trialAccess: 'Standard account', trialAccountHint: 'Work with your own cases. The service connection is managed by the owner.', loginUsername: 'Username', loginUsernameHint: 'Enter your account username; admins may leave this blank', errorOwnerRequired: 'This action is available only to the owner.', errorTrialUnavailable: 'The service is unavailable. Contact the administrator.',
    savedCases: 'My saved cases', saveCase: 'Save case', caseName: 'Case name', untitledCase: 'Untitled case', chooseCase: 'Choose a saved case', openCase: 'Open', deleteCase: 'Delete saved case', savedScope: 'Saves text, reviewed facts, and drafts for this account only. Original files are not stored. Saving is manual.', caseSaved: 'Saved', caseNotSaved: 'Not saved yet', unsavedChanges: 'Unsaved changes', caseSaveSuccess: 'Case saved', caseOpened: 'Saved case opened', caseDeleted: 'Saved case deleted. The current workspace content is retained.', unsavedOpen: 'Your changes are not saved. Opening another case replaces the workspace. Continue?', deleteCaseConfirm: 'Permanently delete this saved case? This cannot be undone.', errorCaseNotFound: 'This case does not exist or is not available to this account.', errorCaseInvalid: 'Invalid case content. Check the name and fields.', errorCaseTooLarge: 'Total case data cannot exceed 256 KiB; source text and draft each allow up to 50,000 characters. Shorten the content and retry.', errorCaseConflict: 'This case changed elsewhere. Your work was not overwritten. Export or copy the edits you need to keep, then open the latest saved case to compare.', errorCaseStorage: 'Case storage is unavailable. Your current workspace is unchanged. Try again later.', errorCaseChanged: 'The workspace changed while loading. Nothing was replaced. Review your edits before opening again.', errorTrialLimit: 'The standard-account extraction limit has been reached. Try later or contact the administrator.',
    errorCaseLimit: 'This account has reached the 100-case limit. Delete an unneeded saved case before adding another. Existing cases can still be updated.',
    register: 'Create standard account', repeatPassword: 'Repeat password', registerUsernameHint: '3–64 lowercase letters or digits; _ . - allowed. The name owner is reserved.', registerPasswordHint: 'Use 6–256 characters for your password', registrationSuccess: 'Standard account created. You are signed in.', registrationUnavailable: 'Registration is unavailable. Contact the administrator.', errorRegistration: 'Use a valid username and a 6–256-character password. Both password entries must match.', errorPasswordMismatch: 'The passwords do not match. Please check both entries.', errorUsernameExists: 'This username is taken. Choose another.', errorRegistrationRate: 'Too many registration attempts. Please try again later.',
    sampleDownloads: 'Download synthetic test files', sampleDownloadHint: 'For testing only. Download and import a file yourself; nothing is prefilled and no AI call is automatic.', sampleWorkbookHint: 'For Excel, select row 2 of the Synthetic case sheet and map columns A–E to the five fields in order.',
    signInOrRegister: 'Sign in / Register', manageAccount: 'Manage',
    brand: 'Nestlet', tag: 'ONE DOCUMENT. ONE STEP FORWARD.', demo: 'Manual processing', liveMode: 'DeepSeek live extraction',
    title: 'Less paperwork. More progress.', subtitle: 'Keep your folders and spreadsheets. Work through one case at a time, turning loose notes into reviewable facts and an English draft.',
    eyebrow: 'A LITTLE HELP WITH LEASE-UP', privacy: 'Synthetic or de-identified information only. Do not enter real tenant details, tax IDs, bank details, or identity documents. Save case stores text, reviewed facts, and drafts for this account so you can return to edit. Original files are not retained. Refreshing loses unsaved changes.',
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
    reset: 'Clear case', resetAsk: 'Clear the workspace? Unsaved changes will be lost. Saved cases will not be deleted.', replaceAsk: 'Replace the current case with new material? Current review decisions and the draft will be cleared.',
    copied: 'English draft copied', copyFail: 'Copy failed. Please select and copy the draft manually.', cancelled: 'Processing cancelled. No new results were applied.',
    errorFile: 'Use UTF-8 TXT / one-case CSV (up to 50 KB), or a currently supported PDF / XLSX / XLS.', errorCSV: 'CSV requires the headers property, owner, pha, caseReference, rent, followed by one case row.', errorEmpty: 'Paste text or import a file first.',
    errorLive: 'Live AI is unavailable or failed. No new suggestions were applied. Retry or choose manual processing.', errorPdf: 'Could not extract this PDF. Paste de-identified text or use a text-based PDF instead.',
    errorScanned: 'No extractable text found. This may be a scanned PDF. OCR is not supported; paste de-identified text instead.', errorEncrypted: 'Encrypted PDFs are not supported. Use readable, de-identified text instead.', errorSize: 'File-size limit exceeded. TXT / CSV: up to 50 KB; PDF / Excel: up to 5 MiB. Compress or split the file and try again.', errorTextSize: 'The extracted PDF text exceeds 50,000 characters. This is separate from the file-size limit. Split the PDF, use fewer pages, or paste up to 50,000 characters of relevant text.', errorGeneric: 'Could not complete this action. Please try again.',
    consent: 'This sends all the current text to DeepSeek. Use only synthetic or de-identified information; real sensitive documents have not been cleared for privacy and security. Have you verified the data-processing terms and authorization, and do you agree to send this text?',
    pdfConsent: 'This PDF will be uploaded to the prototype server for text extraction. It will not automatically be sent to DeepSeek. Confirm that it contains only synthetic or de-identified information. Continue?',
    footer: 'Working name; not trademark-cleared · No screening, eligibility decisions, or automatic sending', reference: 'Official HUD HCV resources',
    draftWarning: 'Exports retain the English DRAFT and human-review notices. Drafts use a template; keep the edited body in English.',
    englishRequired: 'Verify English wording before creating the draft. Descriptions such as proposed rent must be in English. Source-supported names, authorities, addresses, and references may remain verbatim. Facts are not automatically translated.', nameReview: 'I confirm that CJK text is limited to verified names, authorities, addresses, or references that must remain verbatim; the document body will be in English', draftEnglishRequired: 'The draft contains unreviewed CJK text. Verified proper names may remain; manually render other prose in English before exporting.',
    fields: ['Property', 'Owner', 'Housing authority (PHA)', 'Case reference', 'Proposed rent']
  }
};

const kinds = DRAFT_TYPES;
const state = {lang: 'zh', stage: 0, guidanceAgency: DEFAULT_GUIDANCE_AGENCY, guidanceOpen: false, text: '', fields: [], draftText: '', generated: false, error: '', message: '', busy: false, liveEnabled: false, pdfEnabled: false, workbookEnabled: false, workbook: null, sheetIndex: 0, rowIndex: 0, mapping: {}, settingsOpen: false, settingsBusy: false, settingsError: '', settingsMessage: '', authConfigured: false, authenticated: false, role: null, canManageSettings: false, userId: null, workspaceOwnerId: null, username: '', loginUsername: '', authForm: 'login', registrationEnabled: false, secureLogin: false, caseStorageEnabled: false, caseId: null, caseVersion: null, caseTitle: '', savedFingerprint: null, cases: [], selectedCaseId: '', casesOpen: false, caseBusy: false, caseError: '', caseMessage: '', caseEpoch: 0, secureSettings: false, configured: false, csrfToken: '', connectionVerifiedAt: null, keyStorage: 'none', statusChecked: false, statusError: false, model: 'deepseek-flash', providerEndpoint: 'https://api.deepseek.com/chat/completions', mode: 'demo', source: '', sample: false, namesVerified: false, kind: 'followup', generatedKind: 'followup', version: 0, controller: null, chatInput: '', chatEpoch: 0, chatImagePending: 0, chatMessages: [], chatImages: [], chatBusy: false, chatError: '', chatIncomplete: false, customers: [], customerId: null, customerQuery: '', conversations: [], conversationId: '', artifacts: [], readiness: null, readinessBusy: false};
Object.assign(state, {documentContext: {}, caseIssues: [], artifactId: null, artifactStatus: 'draft', artifactIsStale: false, artifactSavedContent: '', legacyDraftText: '', libraryBusy: false, readinessAnswers: {}});
let customerSearchVersion = 0;
let draftEditTracked = false;
let chatController = null;
let chatStopRequested = false;
/** Nonblocking client telemetry per docs/telemetry-api.md v1.
    Operational metadata only: never records document text, draft text, filenames,
    passwords, keys, or arbitrary metadata. A telemetry failure must never change
    business state, clear work, or mark anything as failed. */
let workflowId = null;
let workflowUserId = null;
let correlationRequestId = null;
let creating = null;
let disabled = false;
let telemetryEpoch = 0;
let activeMs = 0;
let activeSince = null;
let hooks = { isAuthenticated: () => false, getCsrf: () => '', getUserId: () => null };

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const isVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
function pauseActive() {
  if (activeSince !== null) {
    activeMs += clock() - activeSince;
    activeSince = null;
  }
}
function resumeActive() {
  if (activeSince === null && isVisible()) activeSince = clock();
}
function takeActiveMs() {
  pauseActive();
  const value = Math.min(Math.round(activeMs), 86400000);
  activeMs = 0;
  resumeActive();
  return value;
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => (isVisible() ? resumeActive() : pauseActive()));
  resumeActive();
}

function configureTelemetry(options) {
  hooks = {...hooks, ...options};
}

/** Start a fresh journey: abandon any in-flight creation (its finally guards on
    promise identity, so a newer creation is never cleared by the old one). */
function resetTelemetry() {
  telemetryEpoch++;
  workflowId = null;
  workflowUserId = null;
  correlationRequestId = null;
  creating = null;
  disabled = false;
  activeMs = 0;
  pauseActive();
  activeSince = null;
  resumeActive();
}

/** Headers for business requests that support workflow correlation. */
function telemetryHeaders() {
  return workflowId && workflowUserId === hooks.getUserId() ? { 'X-Workflow-Id': workflowId } : {};
}

/** Observe a business response. A request ID is only correlated when telemetry
    is active, the server used this exact workflow, and the workflow belongs to
    the currently authenticated identity. */
function noteBusinessResponse(response) {
  try {
    const get = response?.headers?.get?.bind(response.headers);
    if (!get) return;
    const returnedWorkflow = get('X-Workflow-Id');
    if (returnedWorkflow && !workflowId && hooks.isAuthenticated()) {
      workflowId = returnedWorkflow;
      workflowUserId = hooks.getUserId();
    }
    if (returnedWorkflow && returnedWorkflow !== workflowId) { correlationRequestId = null; return; }
    if (workflowId && workflowUserId !== hooks.getUserId()) { correlationRequestId = null; return; }
    correlationRequestId = get('X-Telemetry-Status') === 'active' ? get('X-Request-Id') : null;
  } catch { /* telemetry is best-effort */ }
}

async function ensureWorkflow() {
  if (workflowId && workflowUserId === hooks.getUserId()) return workflowId;
  if (disabled || !hooks.isAuthenticated()) return null;
  if (!creating) {
    const epoch = telemetryEpoch;
    const userId = hooks.getUserId();
    const pending = (async () => {
      try {
        const response = await fetch('/api/workflows', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': hooks.getCsrf() }, body: '{}' });
        if (epoch !== telemetryEpoch || userId !== hooks.getUserId()) return null;
        if (!response.ok) { disabled = true; return null; }
        const result = await response.json();
        if (epoch !== telemetryEpoch || userId !== hooks.getUserId()) return null;
        if (typeof result.workflowId === 'string') {
          workflowId = result.workflowId;
          workflowUserId = userId;
        } else disabled = true;
      } catch { if (epoch === telemetryEpoch) disabled = true; }
      return workflowId;
    })();
    creating = pending;
    pending.finally(() => { if (creating === pending) creating = null; });
  }
  return creating;
}

/** Fire-and-forget client event. `extra` may carry waitMs and a fixed errorCode. */
function track(event, outcome, extra = {}) {
  if (disabled || !hooks.isAuthenticated()) return;
  const epoch = telemetryEpoch;
  const userId = hooks.getUserId();
  const payload = { event, outcome, clientActiveMs: takeActiveMs() };
  if (Number.isInteger(extra.waitMs)) payload.clientWaitMs = Math.min(Math.max(extra.waitMs, 0), 300000);
  if (correlationRequestId) payload.requestId = correlationRequestId;
  if (typeof extra.errorCode === 'string') payload.errorCode = extra.errorCode;
  void (async () => {
    const id = await ensureWorkflow();
    if (!id || epoch !== telemetryEpoch || userId !== hooks.getUserId() || !hooks.isAuthenticated()) return;
    try {
      await fetch(`/api/workflows/${encodeURIComponent(id)}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': hooks.getCsrf() },
        body: JSON.stringify({ events: [payload] })
      });
    } catch { /* never surface telemetry failures */ }
  })();
}

configureTelemetry({isAuthenticated: () => state.authenticated, getCsrf: () => state.csrfToken, getUserId: () => state.userId});
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
    for (const key of ['recipientName','recipientOrganization','recipientContact','senderName','senderOrganization','senderContact','nextActionOwner']) {
      const entry = state.documentContext[key];
      if (entry?.confirmed && entry.value && !entry.notApplicable) body = body.split(entry.value).join('');
    }
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

function managesSettings() {
  return state.authenticated && state.role === 'owner' && state.canManageSettings;
}
function secureSettingsAvailable() {
  return state.secureSettings && window.location.protocol === 'https:';
}
function localDevelopmentLogin() {
  return window.location.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]', '::1'].includes(window.location.hostname);
}
function operatorLoginAvailable() {
  return (state.secureLogin && window.location.protocol === 'https:') || secureSettingsAvailable() || localDevelopmentLogin();
}
function settingsMarkup() {
  if (!state.settingsOpen) return '';
  const d = t();
  const disabled = state.settingsBusy || state.busy ? 'disabled' : '';
  const statusLabel = !state.statusChecked ? d.checkingStatus : state.statusError ? d.backendStatus : !state.authConfigured ? d.operatorSetup : !state.authenticated ? d.signInRequired : state.role === 'trial' ? d.trialAccess : state.liveEnabled ? d.readyStatus : d.configStatus;
  let controls = '';
  if (state.statusError) controls = `<p>${d.errorBackend}</p>`;
  else if (!state.authConfigured) controls = `<p>${d.operatorSetupHelp}</p>`;
  else if (!state.authenticated) {
    const registering = state.authForm === 'register' && state.registrationEnabled;
    controls = operatorLoginAvailable() ? `${localDevelopmentLogin() ? `<p class="small">${d.localLoginNotice}</p>` : ''}<div class="actions"><button id="auth-signin" class="link" type="button" ${!registering || disabled ? 'disabled' : ''}>${d.signIn}</button><button id="auth-register" class="link" type="button" ${registering || !state.registrationEnabled || disabled ? 'disabled' : ''}>${d.register}</button></div><form id="login-form" autocomplete="off" novalidate><label for="login-username">${d.loginUsername}</label><input id="login-username" class="input" type="text" autocomplete="off" maxlength="64" value="${esc(state.loginUsername)}" placeholder="${registering ? d.registerUsernameHint : d.loginUsernameHint}" ${disabled}><label for="operator-password">${d.operatorPassword}</label><div class="credential-row"><input id="operator-password" name="operator-password" type="password" autocomplete="off" minlength="6" maxlength="256" ${disabled}>${registering ? '' : `<button class="primary" type="submit" ${disabled}>${d.signIn}</button>`}</div>${registering ? `<p class="small">${d.registerPasswordHint}</p><label for="password-confirmation">${d.repeatPassword}</label><div class="credential-row"><input id="password-confirmation" type="password" autocomplete="off" minlength="6" maxlength="256" ${disabled}><button class="primary" type="submit" ${disabled}>${d.register}</button></div>` : ''}</form>` : `<p>${d.errorHttps}</p>`;
  } else if (!managesSettings()) {
    controls = `<p>${state.role === 'trial' ? d.trialAccountHint : d.errorOwnerRequired}</p><button id="logout" class="link" ${disabled}>${d.signOut}</button>`;
  } else if (!secureSettingsAvailable()) {
    controls = `<p>${localDevelopmentLogin() ? d.localLoginNotice : d.errorHttps}</p><p class="small">${state.configured ? state.keyStorage === 'server-environment' ? d.keyEnvironment : d.keyMemory : d.keyMissing}</p><button id="logout" class="link" ${disabled}>${d.signOut}</button>`;
  } else {
    controls = `<form id="key-form" autocomplete="off"><label for="api-key">${state.configured ? d.replaceKey : d.apiKey}</label><div class="credential-row"><input id="api-key" name="api-key" type="password" autocomplete="off" spellcheck="false" autocapitalize="off" maxlength="256" ${state.configured ? '' : 'required'} placeholder="${state.configured ? d.keepExistingKey : ''}" ${disabled}><button class="primary" type="submit" ${disabled}>${d.saveSettings}</button></div><label class="confirm settings-enable"><input id="enable-live" type="checkbox" ${state.liveEnabled || !state.configured ? 'checked' : ''} ${disabled}>${d.enableLive}</label></form><p class="small">${d.keyMemoryNotice}</p><div class="settings-actions"><button id="test-connection" class="secondary" ${disabled || !state.configured ? 'disabled' : ''}>${d.testConnection}</button><button id="logout" class="link" ${disabled}>${d.signOut}</button><span class="small">${state.configured ? state.keyStorage === 'server-environment' ? d.keyEnvironment : d.keyMemory : d.keyMissing}</span></div>${state.connectionVerifiedAt ? `<p class="small">${d.connectionVerified} · ${esc(new Date(state.connectionVerifiedAt).toLocaleString(state.lang === 'zh' ? 'zh-CN' : 'en-US'))}</p>` : ''}`;
  }
  return `<aside class="settings-panel" aria-label="${managesSettings() ? d.settings : d.account}"><div class="settings-header"><strong class="settings-status">${statusLabel}</strong><button id="refresh-status" class="link" ${disabled}>${d.refreshStatus}</button></div>${!managesSettings() ? '' : `<dl><dt>${d.modelLabel}</dt><dd>${esc(state.model)}</dd><dt>${d.endpointLabel}</dt><dd>${esc(state.providerEndpoint)}</dd></dl>`}${controls}<div id="settings-error" class="error" role="alert">${state.settingsError ? d[state.settingsError] || d.errorGeneric : ''}</div><div class="success" role="status">${state.settingsBusy ? d.busy : state.settingsMessage ? d[state.settingsMessage] : ''}</div></aside>`;
}

const authErrorKeys = {
  REGISTRATION_INVALID: 'errorRegistration', USER_EXISTS: 'errorUsernameExists', USER_LIMIT_REACHED: 'registrationUnavailable', REGISTRATION_RATE_LIMITED: 'errorRegistrationRate',
  TRIAL_LIMIT_REACHED: 'errorTrialLimit', USER_INVALID: 'errorCredentials', OWNER_REQUIRED: 'errorOwnerRequired', AUTH_REQUIRED: 'errorAuth', CSRF_REJECTED: 'errorSession', OPERATOR_SETUP_REQUIRED: 'operatorSetupHelp', HTTPS_REQUIRED: 'errorHttps',
  INVALID_CREDENTIALS: 'errorCredentials', LOGIN_RATE_LIMITED: 'errorRateLimit', SETTINGS_RATE_LIMITED: 'errorRateLimit',
  INVALID_SETTINGS: 'errorSettings', API_KEY_REQUIRED: 'errorKeyRequired', CONNECTION_FAILED: 'errorConnection', MODEL_UNAVAILABLE: 'errorModel',
  BUSY: 'errorBusy', LIVE_DISABLED: 'errorConfig',
  CLIENT_INVALID: 'errorClientInvalid', CLIENT_NOT_FOUND: 'errorClientNotFound', CLIENT_CONFLICT: 'errorClientConflict',
  CONVERSATION_INVALID: 'errorConversationInvalid', CONVERSATION_NOT_FOUND: 'errorConversationNotFound', MESSAGE_INVALID: 'errorMessageInvalid',
  CHAT_CONVERSATION_BUSY: 'errorChatBusy', CHAT_TURN_EXISTS: 'errorChatTurnExists', CHAT_SAVE_FAILED: 'errorChatSaveFailed',
  CHAT_INVALID: 'errorChat', CHAT_TOO_LARGE: 'chatTooLong', CHAT_IMAGE_INVALID: 'chatImageBad', CHAT_IMAGE_UNSUPPORTED: 'chatImageBad',
  CHAT_PROVIDER_FAILED: 'errorChatProvider', CHAT_STREAM_FAILED: 'chatIncomplete', CHAT_INCOMPLETE: 'chatIncomplete', CHAT_UNSUPPORTED_OUTPUT: 'errorChatOutput',
  DOCUMENT_CONTEXT_INVALID: 'errorDocContext', DOCUMENT_CONTEXT_CONFLICT: 'errorDocConflict', DOCUMENT_DETAILS_INVALID: 'errorDocDetails',
  DOCUMENT_DETAILS_REQUIRED: 'errorDocRequired', DOCUMENT_CONTENT_INVALID: 'errorDocContent', DOCUMENT_ENGLISH_REQUIRED: 'draftEnglishRequired',
  DOCUMENT_PLACEHOLDERS_REMAIN: 'errorDocPlaceholders',
  ARTIFACT_INVALID: 'errorArtifactInvalid', ARTIFACT_NOT_FOUND: 'errorArtifactNotFound', ARTIFACT_SOURCE_INCOMPLETE: 'errorArtifactSource',
  DOCUMENT_NOT_READY: 'errorDocRequired', ARTIFACT_STALE: 'errorArtifactStale',
  CAPACITY_REACHED: 'errorCapacity', CASE_ISSUE_NOT_FOUND: 'errorCaseIssueNotFound'
};
function responseError(result, fallback) {
  let key = authErrorKeys[result?.code] || fallback;
  if (state.role === 'trial' && ['errorConfig', 'errorKeyRequired', 'operatorSetupHelp', 'errorSettings'].includes(key)) key = 'errorTrialUnavailable';
  if (result?.code === 'OWNER_REQUIRED') {state.settingsOpen = true; state.settingsError = key;}
  if (['AUTH_REQUIRED', 'CSRF_REJECTED', 'OPERATOR_SETUP_REQUIRED', 'HTTPS_REQUIRED'].includes(result?.code)) {
    resetChat(); resetLibraryState({preserveCaseAssociation:state.workspaceOwnerId === state.userId}); state.authenticated = false;
    state.csrfToken = '';
    state.settingsOpen = true;
    state.settingsError = key; render();
  }
  return new Error(key);
}
function requestHeaders(extra = {}) {
  return {...extra, ...(state.csrfToken ? {'X-CSRF-Token': state.csrfToken} : {})};
}
function applyStatus(status) {
  const previousUserId = state.userId;
  for (const key of ['liveEnabled', 'pdfEnabled', 'workbookEnabled', 'authConfigured', 'authenticated', 'secureSettings', 'secureLogin', 'configured', 'caseStorageEnabled', 'registrationEnabled']) {
    if (key in status) state[key] = status[key] === true;
  }
  state.role = ['owner', 'trial'].includes(status.role) ? status.role : null;
  state.canManageSettings = state.role === 'owner' && status.canManageSettings === true;
  state.userId = typeof status.userId === 'string' ? status.userId : null;
  if (state.userId !== previousUserId || !state.authenticated) {resetChat(); resetLibraryState({preserveCaseAssociation:Boolean(state.workspaceOwnerId && (!state.userId || state.userId === state.workspaceOwnerId))});}
  if (state.userId !== previousUserId) resetTelemetry();
  state.username = typeof status.username === 'string' ? status.username : '';
  if (state.userId && state.workspaceOwnerId && state.userId !== state.workspaceOwnerId) {replaceText(''); forgetCaseIdentity(); state.cases = []; state.selectedCaseId = '';}
  if (state.userId) state.workspaceOwnerId = state.userId;
  if (!state.authenticated) {state.cases = []; state.selectedCaseId = '';}

  state.csrfToken = typeof status.csrfToken === 'string' ? status.csrfToken : '';
  state.connectionVerifiedAt = typeof status.connectionVerifiedAt === 'string' ? status.connectionVerifiedAt : null;
  state.keyStorage = typeof status.keyStorage === 'string' ? status.keyStorage : 'none';
  if (!managesSettings()) {state.configured = false; state.keyStorage = 'none'; state.connectionVerifiedAt = null;}
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
    await refreshCaseList(false);
  } catch {state.statusChecked = true; state.statusError = true; state.liveEnabled = false;}
  render();
}
async function settingsRequest(path, payload, successKey) {
  if (state.settingsBusy) return;
  if (['/api/settings', '/api/settings/test'].includes(path) && !managesSettings()) {state.settingsError = 'errorOwnerRequired'; state.settingsOpen = true; render(); return;}
  state.settingsBusy = true;
  state.settingsError = '';
  state.settingsMessage = '';
  // The form values are never copied into application state or browser storage.
  const body = JSON.stringify(payload);
  if ('password' in payload) payload.password = '';
  if ('passwordConfirmation' in payload) payload.passwordConfirmation = '';
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
      replaceText(''); forgetCaseIdentity(); state.workspaceOwnerId = null; state.cases = []; state.selectedCaseId = ''; state.authenticated = false; state.csrfToken = ''; resetTelemetry(); await refreshStatus();
    } else if (path === '/api/login' || path === '/api/register') {
      state.csrfToken = typeof result.csrfToken === 'string' ? result.csrfToken : '';
      await refreshStatus();
      if (!state.authenticated) throw new Error('errorAuth');
      if (path === '/api/register' && state.role !== 'trial') throw new Error('errorRegistration');
      state.authForm = 'login';
    } else {
      if (result.authenticated !== true || typeof result.configured !== 'boolean' || result.model !== 'deepseek-flash') throw new Error('errorSettings');
      applyStatus(result);
    }
    state.settingsMessage = successKey;
  } catch (error) {state.settingsError = copy.en[error.message] ? error.message : 'errorGeneric';}
  finally {state.settingsBusy = false; render();}
}

function casePayload() {
  return {
    title: state.caseTitle.trim(), sourceText: state.text, fields: state.fields,
    draftType: state.kind, draftText: state.artifactId ? state.legacyDraftText : state.draftText,
    extractionMode: state.mode === 'live' ? 'live' : 'manual', namesVerified: state.namesVerified
  };
}
function caseFingerprint() {return JSON.stringify(casePayload());}
function hasCaseContent() {return Boolean(state.text || state.fields.length || state.draftText);}
function hasUnsavedChanges() {
  return Boolean(state.artifactId && state.draftText !== state.artifactSavedContent) || Boolean(hasCaseContent() || state.caseTitle) && caseFingerprint() !== state.savedFingerprint;
}
function caseStatusLabel() {
  return state.caseBusy ? t().busy : hasUnsavedChanges() ? t().unsavedChanges : state.caseId ? t().caseSaved : t().caseNotSaved;
}
function updateCaseIndicator() {
  if (byId('case-save-status')) byId('case-save-status').textContent = caseStatusLabel();
  if (byId('save-case')) byId('save-case').disabled = state.caseBusy || state.busy || !hasCaseContent();
}
function forgetCaseIdentity() {
  resetChat();
  state.caseId = null; state.caseVersion = null; state.caseTitle = ''; state.savedFingerprint = null;
  state.caseError = ''; state.caseMessage = ''; state.caseEpoch++; state.customerId = null; state.customerQuery = ''; state.conversations = []; state.conversationId = ''; state.artifacts = []; state.readiness = null; state.chatMessages = [];
}
function caseControlsMarkup() {
  if (!state.authenticated || !state.caseStorageEnabled) return '';
  const d = t();
  const disabled = state.caseBusy || state.busy || state.libraryBusy ? 'disabled' : '';
  return `<section class="case-controls" aria-label="${d.savedCases}"><div class="actions"><button id="save-case" class="secondary" ${disabled || !hasCaseContent() ? 'disabled' : ''}>${d.saveCase}</button><details id="case-manager" class="help-details" ${state.casesOpen ? 'open' : ''}><summary>${d.savedCases}</summary><div class="draft-choice"><label for="case-title">${d.caseName}</label><input id="case-title" class="input" maxlength="120" value="${esc(state.caseTitle)}" placeholder="${d.untitledCase}"></div><div class="draft-choice"><label for="saved-case">${d.savedCases}</label><select id="saved-case" ${disabled}><option value="">${d.chooseCase}</option>${state.cases.map(item => `<option value="${esc(item.id)}" ${state.selectedCaseId === item.id ? 'selected' : ''}>${esc(item.title)}</option>`).join('')}</select></div><div class="actions"><button id="open-case" class="secondary" ${disabled || !state.selectedCaseId ? 'disabled' : ''}>${d.openCase}</button><button id="delete-case" class="link" ${disabled || !state.selectedCaseId ? 'disabled' : ''}>${d.deleteCase}</button><button id="refresh-cases" class="link" ${disabled}>${d.refreshStatus}</button></div><p>${d.savedScope}</p></details><span id="case-save-status" class="small" role="status">${caseStatusLabel()}</span></div><div class="customer-row"><label for="customer-query">${d.customerLabel}</label><input id="customer-query" class="input" maxlength="120" placeholder="${d.customerSearch}" value="${esc(state.customerQuery)}" ${disabled}><button id="customer-create" class="link" ${disabled || !state.customerQuery.trim() ? 'disabled' : ''}>${d.customerCreate}</button>${state.customerId ? `<span class="small customer-linked">${d.customerLinked}${esc(state.customers.find(c => c.id === state.customerId)?.displayName || state.customerQuery)}</span>` : ''}${state.customers.length ? `<div class="customer-results">${state.customers.map(c => `<button type="button" class="link" data-customer="${esc(c.id)}" data-name="${esc(c.displayName)}">${esc(c.displayName)}</button>`).join('')}</div>` : ''}</div>${state.customerId && state.cases.length ? `<div class="customer-cases"><h3>${d.customerCases}</h3>${state.cases.map(item => `<button class="link" data-case-open="${esc(item.id)}" ${disabled}>${esc(item.title)}</button>`).join('')}</div>` : ''}${state.caseId ? `<button class="secondary" id="generate-final" ${disabled}>${d.generateFinal}</button>` : ''}${readinessMarkup()}${state.artifacts.length ? `<div class="artifact-list"><h3>${d.artifactList}</h3>${state.artifacts.map(a => `<div class="artifact-row"><span class="artifact-name">${esc(a.title || a.kind)} · v${a.version}</span><span class="field-status">${a.status === 'final' ? d.artifactStatusFinal : d.artifactStatusDraft}</span>${a.isStale ? `<span class="field-status warning">${d.artifactStaleBadge}</span>` : ''}<button class="link" data-artifact-open="${esc(a.id)}" ${disabled}>${d.artifactOpen}</button><button class="link" data-artifact-download="${esc(a.id)}" ${disabled}>${d.artifactDownload}</button></div>`).join('')}</div>` : ''}<div class="error" role="alert">${state.caseError ? d[state.caseError] || d.errorGeneric : ''}</div><div class="success" role="status">${state.caseMessage ? d[state.caseMessage] : ''}</div></section>`;
}
const caseErrorKeys = {CASE_LIMIT_REACHED: 'errorCaseLimit', CASE_NOT_FOUND: 'errorCaseNotFound', CASE_INVALID: 'errorCaseInvalid', CASE_TOO_LARGE: 'errorCaseTooLarge', CASE_CONFLICT: 'errorCaseConflict', CASE_STORAGE_UNAVAILABLE: 'errorCaseStorage'};
async function caseRequest(path, method = 'GET', payload) {
  const requestUserId = state.userId, requestCsrf = state.csrfToken;
  const response = await fetch(path, {method, cache: 'no-store', headers: requestHeaders({...telemetryHeaders(), ...(payload ? {'Content-Type': 'application/json'} : {})}), ...(payload ? {body: JSON.stringify(payload)} : {})});
  noteBusinessResponse(response);
  const result = await response.json();
  if (requestUserId !== state.userId || requestCsrf !== state.csrfToken) throw new Error('errorCaseChanged');
  if (!response.ok) throw responseError(result, caseErrorKeys[result.code] || 'errorCaseStorage');
  return result;
}
async function refreshCaseList(shouldRender = true) {
  if (!state.authenticated || !state.caseStorageEnabled) return;
  const scope = captureLibraryScope();
  try {
    const path = scope.customerId ? `/api/clients/${encodeURIComponent(scope.customerId)}/cases` : '/api/cases';
    const result = await caseRequest(path);
    if (!libraryScopeCurrent(scope)) return;
    if (!Array.isArray(result.cases)) throw new Error('errorCaseStorage');
    state.cases = result.cases;
    if (!state.cases.some(item => item.id === state.selectedCaseId)) state.selectedCaseId = '';
  } catch (error) {if (libraryScopeCurrent(scope)) state.caseError = copy.en[error.message] ? error.message : 'errorCaseStorage';}
  if (shouldRender && libraryScopeCurrent(scope)) render();
}

function validCaseRecord(record) {
  return record && typeof record.id === 'string' && Number.isInteger(record.version) && record.version > 0 &&
    typeof record.title === 'string' && typeof record.sourceText === 'string' && typeof record.draftText === 'string' &&
    kinds.includes(record.draftType) && Array.isArray(record.fields) && (record.fields.length === 0 || record.fields.length === FIELDS.length && FIELDS.every(key => record.fields.filter(field => field.key === key).length === 1) && record.fields.every(field => typeof field.value === 'string' && typeof field.source === 'string' && typeof field.confirmed === 'boolean' && typeof field.conflict === 'boolean'));
}
async function saveCurrentCase() {
  if (state.caseBusy || state.busy || !hasCaseContent()) return;
  if (!state.authenticated || !state.caseStorageEnabled) {state.settingsOpen = true; state.settingsError = 'errorAuth'; render(); return;}
  if (!state.caseTitle.trim()) state.caseTitle = (state.fields.find(field => field.key === 'caseReference')?.value.trim() || state.fields.find(field => field.key === 'property')?.value.trim() || state.source || t().untitledCase).slice(0, 120);
  const payload = JSON.parse(caseFingerprint());
  const fingerprint = JSON.stringify(payload);
  const epoch = state.caseEpoch;
  const userId = state.userId;
  const id = state.caseId;
  state.caseBusy = true; state.caseError = ''; state.caseMessage = ''; render();
  try {
    const saveStart = performance.now();
    const result = await caseRequest(id ? `/api/cases/${encodeURIComponent(id)}` : '/api/cases', id ? 'PUT' : 'POST', {...payload, clientId: state.customerId || null, ...(id ? {expectedVersion: state.caseVersion} : {})});
    if (!validCaseRecord(result.case)) throw new Error('errorCaseStorage');
    if (userId === state.userId && epoch === state.caseEpoch) {
      state.caseId = result.case.id; state.caseVersion = result.case.version; state.savedFingerprint = fingerprint; state.legacyDraftText = result.case.draftText; state.documentContext = result.case.documentContext || {}; state.caseIssues = result.case.caseIssues || [];
      state.selectedCaseId = result.case.id; state.caseMessage = 'caseSaveSuccess';
      track('case.save', 'success', {waitMs: Math.round(performance.now() - saveStart)});
      await loadCaseExtras();
    }
    await refreshCaseList(false);
  } catch (error) {if (userId === state.userId && epoch === state.caseEpoch) {state.caseError = copy.en[error.message] ? error.message : 'errorCaseStorage'; track('case.save', 'failure', {errorCode: 'UNKNOWN_CLIENT_ERROR'});}}
  finally {state.caseBusy = false; render();}
}
async function openSavedCase({discardConfirmed = false} = {}) {
  if (!state.selectedCaseId || state.caseBusy || state.busy) return null;
  if (!discardConfirmed && hasUnsavedChanges() && !confirm(t().unsavedOpen)) return null;
  const selected = state.selectedCaseId;
  resetChat(); state.caseEpoch++;
  const before = caseFingerprint(), epoch = state.caseEpoch, userId = state.userId;
  let appliedEpoch = epoch;
  state.caseBusy = true; state.caseError = ''; state.caseMessage = ''; render();
  try {
    const openStart = performance.now();
    const result = await caseRequest(`/api/cases/${encodeURIComponent(selected)}`);
    if (userId !== state.userId || !state.authenticated || epoch !== state.caseEpoch) return null;
    if (before !== caseFingerprint()) throw new Error('errorCaseChanged');
    if (!validCaseRecord(result.case)) throw new Error('errorCaseStorage');
    replaceText(result.case.sourceText, result.case.title); appliedEpoch = state.caseEpoch;
    applyLoadedCase(result.case);
    state.stage = state.generated ? 2 : state.fields.length ? 1 : 0;
    state.customerQuery = state.customers.find(item => item.id === state.customerId)?.displayName || state.customerQuery;
    state.caseMessage = 'caseOpened'; track('case.open', 'success', {waitMs: Math.round(performance.now() - openStart)});
    await loadCaseExtras();
    return userId === state.userId && appliedEpoch === state.caseEpoch && state.caseId === selected ? {userId, caseEpoch: appliedEpoch, caseId: selected} : null;
  } catch (error) {if (userId === state.userId && appliedEpoch === state.caseEpoch) state.caseError = copy.en[error.message] ? error.message : 'errorCaseStorage'; return null;}
  finally {if (userId === state.userId && appliedEpoch === state.caseEpoch) {state.caseBusy = false; render();}}
}

async function deleteSavedCase() {
  const item = state.cases.find(record => record.id === state.selectedCaseId);
  if (!item || state.caseBusy || state.busy || !confirm(t().deleteCaseConfirm + '\n' + item.title)) return;
  const userId = state.userId;
  state.caseBusy = true; state.caseError = ''; state.caseMessage = ''; render();
  try {
    const result = await caseRequest(`/api/cases/${encodeURIComponent(item.id)}`, 'DELETE', {expectedVersion: item.version});
    if (result.deleted !== true) throw new Error('errorCaseStorage');
    if (userId !== state.userId) return;
    if (state.caseId === item.id) {state.caseId = null; state.caseVersion = null; state.savedFingerprint = null;}
    state.selectedCaseId = ''; state.caseMessage = 'caseDeleted';
    track('case.delete', 'success');
    await refreshCaseList(false);
  } catch (error) {if (userId === state.userId) {state.caseError = copy.en[error.message] ? error.message : 'errorCaseStorage'; track('case.delete', 'failure', {errorCode: 'UNKNOWN_CLIENT_ERROR'});}}
  finally {state.caseBusy = false; render();}
}


/** Customer library, durable conversations, artifacts and document readiness —
    docs/customer-case-api.md v1. All routes go through caseRequest (session,
    CSRF, telemetry headers, mapped bilingual errors). */
function captureLibraryScope() {
  return {userId: state.userId, caseEpoch: state.caseEpoch, caseId: state.caseId, customerId: state.customerId};
}
function resetLibraryState({preserveCaseAssociation = false} = {}) {
  customerSearchVersion++;
  state.customers = []; state.cases = []; state.selectedCaseId = '';
  if (!preserveCaseAssociation) {state.customerId = null; state.customerQuery = '';}
  state.artifacts = []; state.readiness = null; state.readinessAnswers = {}; state.caseError = ''; state.caseMessage = '';
  state.libraryBusy = false; state.readinessBusy = false; state.caseBusy = false;
}
function libraryScopeCurrent(scope) {
  return state.authenticated && scope.userId === state.userId && scope.caseEpoch === state.caseEpoch && scope.caseId === state.caseId && scope.customerId === state.customerId;
}
async function loadCustomers(search = '') {
  if (!state.authenticated || !state.caseStorageEnabled) return;
  const scope = captureLibraryScope(), sequence = ++customerSearchVersion;
  try {
    const result = await caseRequest('/api/clients?limit=50' + (search ? `&search=${encodeURIComponent(search)}` : ''));
    if (libraryScopeCurrent(scope) && sequence === customerSearchVersion && Array.isArray(result.clients)) state.customers = result.clients;
  } catch (error) {if (libraryScopeCurrent(scope) && sequence === customerSearchVersion) state.caseError = copy.en[error.message] ? error.message : 'errorClientInvalid';}
}
async function selectCustomer(id, name) {
  if (!id || !state.authenticated || state.caseBusy || state.libraryBusy) return;
  if (hasUnsavedChanges() && !confirm(t().unsavedOpen)) return;
  resetChat(); replaceText(''); forgetCaseIdentity();
  state.customerId = id; state.customerQuery = name || ''; state.cases = []; state.selectedCaseId = ''; state.casesOpen = true;
  state.artifacts = []; state.libraryBusy = true; state.caseError = '';
  const scope = captureLibraryScope(); render();
  try {
    const [cases, artifacts] = await Promise.all([
      caseRequest(`/api/clients/${encodeURIComponent(id)}/cases`),
      caseRequest(`/api/clients/${encodeURIComponent(id)}/artifacts`)
    ]);
    if (!libraryScopeCurrent(scope)) return;
    state.cases = Array.isArray(cases.cases) ? cases.cases : [];
    state.artifacts = Array.isArray(artifacts.artifacts) ? artifacts.artifacts : [];
  } catch (error) {if (libraryScopeCurrent(scope)) state.caseError = copy.en[error.message] ? error.message : 'errorCaseStorage';}
  finally {if (libraryScopeCurrent(scope)) {state.libraryBusy = false; render();}}
}

async function createCustomer() {
  const name = state.customerQuery.trim();
  if (!name || state.caseBusy || state.libraryBusy || !state.authenticated) return;
  const scope = captureLibraryScope();
  try {
    const result = await caseRequest('/api/clients', 'POST', {displayName: name});
    if (!libraryScopeCurrent(scope)) return;
    if (result.client?.id) {
      state.customerId = result.client.id; state.customerQuery = result.client.displayName;
      await loadCustomers();
    }
  } catch (error) {if (libraryScopeCurrent(scope)) state.caseError = copy.en[error.message] ? error.message : 'errorClientInvalid';}
  if (scope.userId === state.userId && scope.caseEpoch === state.caseEpoch) render();
}

async function selectConversation(id) {
  resetChat(); state.conversationId=id; const scope=chatScope(); state.chatBusy=Boolean(id); render();
  if (!id) return;
  const controller=new AbortController(); chatController=controller;
  try {
    const result=await chatJson(`/api/conversations/${encodeURIComponent(id)}`,'GET',undefined,scope,controller.signal);
    if (result.conversation?.caseId!==scope.caseId || !Array.isArray(result.messages)) throw new Error('errorConversationInvalid');
    state.chatMessages=storedChatMessages(result.messages);
  } catch (error) {if (sameChat(scope)) state.chatError=copy.en[error.message]?error.message:'errorChat';}
  finally {if (sameChat(scope)) {state.chatBusy=false; chatController=null; render();}}
}

async function loadReadiness() {
  if (!state.caseId) {state.readiness = null; return;}
  const scope = captureLibraryScope(), kind = state.kind, locale = state.lang;
  try {
    const result = await caseRequest(`/api/cases/${encodeURIComponent(scope.caseId)}/readiness?kind=${encodeURIComponent(kind)}&locale=${locale}`);
    if (libraryScopeCurrent(scope) && kind === state.kind && locale === state.lang) state.readiness = result;
  } catch (error) {if (libraryScopeCurrent(scope) && kind === state.kind && locale === state.lang) {state.readiness = null; state.caseError = copy.en[error.message] ? error.message : 'errorDocDetails';}}
}

async function loadCaseExtras() {
  if (!state.caseId) return;
  const scope = captureLibraryScope();
  try {
    const [conversations, artifacts] = await Promise.all([
      caseRequest(`/api/cases/${encodeURIComponent(scope.caseId)}/conversations`),
      caseRequest(`/api/cases/${encodeURIComponent(scope.caseId)}/artifacts`)
    ]);
    if (!libraryScopeCurrent(scope)) return;
    state.conversations = Array.isArray(conversations.conversations) ? conversations.conversations : [];
    state.artifacts = Array.isArray(artifacts.artifacts) ? artifacts.artifacts : [];
    const displayedArtifact = state.artifacts.find(item => item.id === state.artifactId);
    if (displayedArtifact) state.artifactIsStale = Boolean(displayedArtifact.isStale);
    if (!state.conversationId && state.conversations.length) await selectConversation(state.conversations[0].id);
    if (!libraryScopeCurrent(scope)) return;
    await loadReadiness();
  } catch (error) {if (libraryScopeCurrent(scope)) state.caseError = copy.en[error.message] ? error.message : 'errorCaseStorage';}
}
function applyLoadedCase(record) {
  if (!validCaseRecord(record)) throw new Error('errorCaseStorage');
  state.text = record.sourceText; state.fields = record.fields.length ? FIELDS.map(key => ({...record.fields.find(field => field.key === key)})) : [];
  state.draftText = record.draftText; state.legacyDraftText = record.draftText; state.generated = Boolean(record.draftText);
  state.kind = record.draftType; state.generatedKind = record.draftType; state.namesVerified = record.namesVerified === true;
  state.documentContext = record.documentContext || {}; state.caseIssues = record.caseIssues || [];
  state.mode = record.extractionMode === 'live' ? 'live' : 'demo'; state.caseId = record.id; state.caseVersion = record.version; state.caseTitle = record.title;
  state.customerId = typeof record.clientId === 'string' ? record.clientId : null;
  state.artifactId = null; state.artifactStatus = 'draft'; state.artifactIsStale = false; state.artifactSavedContent = '';
  state.savedFingerprint = caseFingerprint(); state.selectedCaseId = record.id;
  state.stage = state.generated ? 2 : state.fields.length ? 1 : 0;
  state.readinessAnswers = {};
}
function showArtifact(artifact) {
  if (!artifact || typeof artifact.content !== 'string' || !kinds.includes(artifact.kind) || !['draft', 'final'].includes(artifact.status)) throw new Error('errorArtifactInvalid');
  state.artifactId = artifact.id; state.artifactStatus = artifact.status; state.artifactIsStale = Boolean(artifact.isStale);
  state.artifactSavedContent = artifact.content; state.draftText = artifact.content; state.generatedKind = artifact.kind; state.generated = true; state.stage = 2;
}
async function openArtifact(id) {
  if (!id || !state.authenticated || state.caseBusy || state.libraryBusy) return;
  if (hasUnsavedChanges() && !confirm(t().unsavedOpen)) return;
  const scope = captureLibraryScope();
  let errorScope = scope;
  try {
    const result = await caseRequest(`/api/artifacts/${encodeURIComponent(id)}`);
    if (!libraryScopeCurrent(scope)) return;
    const artifact = result.artifact;
    if (!artifact?.caseId) throw new Error('errorArtifactInvalid');
    if (artifact.caseId !== state.caseId) {
      state.selectedCaseId = artifact.caseId;
      const opened = await openSavedCase({discardConfirmed: true});
      if (!opened || state.userId !== opened.userId || state.caseEpoch !== opened.caseEpoch || state.caseId !== artifact.caseId) return;
      errorScope = captureLibraryScope();
    }
    showArtifact(artifact); state.caseError = ''; render();
  } catch (error) {if (libraryScopeCurrent(errorScope)) {state.caseError = copy.en[error.message] ? error.message : 'errorArtifactInvalid'; render();}}
}
async function downloadArtifact(id) {
  const scope = captureLibraryScope();
  try {
    const response = await fetch(`/api/artifacts/${encodeURIComponent(id)}/download`, {cache: 'no-store', headers: requestHeaders()});
    if (!libraryScopeCurrent(scope)) return;
    if (!response.ok) {
      const errorBody = await response.json();
      if (!libraryScopeCurrent(scope)) return;
      throw responseError(errorBody, 'errorArtifactInvalid');
    }
    const content = await response.text();
    if (!libraryScopeCurrent(scope)) return;
    const metadata = state.artifacts.find(item => item.id === id);
    download(content, `nestlet-${metadata?.kind || 'document'}-${metadata?.status || 'document'}-v${metadata?.version || 1}.txt`, 'text/plain;charset=utf-8');
  } catch (error) {if (libraryScopeCurrent(scope)) {state.caseError = copy.en[error.message] ? error.message : 'errorArtifactInvalid'; render();}}
}

async function saveArtifact() {
  if (!state.caseId || !state.generated || draftNeedsEnglish() || state.libraryBusy) return;
  const scope = captureLibraryScope(); state.libraryBusy = true; render();
  try {
    const result = await caseRequest(`/api/cases/${encodeURIComponent(scope.caseId)}/artifacts`, 'POST',
      {kind: state.generatedKind, status: state.artifactStatus, content: exportDraft(), expectedCaseVersion: state.caseVersion});
    if (!libraryScopeCurrent(scope)) return;
    if (result.artifact?.id) {state.artifacts = [result.artifact, ...state.artifacts]; showArtifact(result.artifact); state.caseMessage = 'artifactSavedOk';}
  } catch (error) {if (libraryScopeCurrent(scope)) state.caseError = copy.en[error.message] ? error.message : 'errorArtifactInvalid';}
  finally {if (libraryScopeCurrent(scope)) {state.libraryBusy = false; render();}}
}
async function generateFinalArtifact() {
  if (state.libraryBusy || state.caseBusy || state.readinessBusy || !state.authenticated) return;
  if (!state.caseId || caseFingerprint() !== state.savedFingerprint) await saveCurrentCase();
  if (!state.caseId || caseFingerprint() !== state.savedFingerprint) return;
  const scope = captureLibraryScope(); state.libraryBusy = true; state.caseError = ''; render();
  try {
    await loadReadiness();
    if (!libraryScopeCurrent(scope)) return;
    if (!state.readiness?.ready) {state.stage = 1; return;}
    const result = await caseRequest(`/api/cases/${encodeURIComponent(scope.caseId)}/artifacts/generate`, 'POST',
      {kind: state.kind, status: 'final', expectedCaseVersion: state.caseVersion});
    if (!libraryScopeCurrent(scope)) return;
    state.artifacts = [result.artifact, ...state.artifacts]; showArtifact(result.artifact); state.caseMessage = 'artifactSavedOk';
    track('draft.generate', 'success');
  } catch (error) {if (libraryScopeCurrent(scope)) state.caseError = copy.en[error.message] ? error.message : 'errorArtifactInvalid';}
  finally {if (libraryScopeCurrent(scope)) {state.libraryBusy = false; render();}}
}

async function confirmReadiness() {
  if (!state.caseId || state.readinessBusy) return;
  const changes = {}, factChanges = {};
  document.querySelectorAll('[data-readiness]').forEach(el => {
    const key = el.dataset.readiness, value = el.value.trim();
    state.readinessAnswers[key] = el.value;
    if (value) (FIELDS.includes(key) ? factChanges : changes)[key] = {value};
  });
  if (!Object.keys(changes).length && !Object.keys(factChanges).length) return;
  // Confirmation may archive/clear the legacy draft. Do not discard edits that
  // were never saved, or overwrite edits made while the PATCH is in flight.
  if (hasUnsavedChanges()) {state.caseError = 'errorReadinessUnsaved'; render(); return;}
  const workspaceFingerprint = () => JSON.stringify({case: caseFingerprint(), artifactId: state.artifactId, artifactStatus: state.artifactStatus, draftText: state.draftText});
  const submittedWorkspace = workspaceFingerprint(), submittedAnswers = {...state.readinessAnswers};
  const scope = captureLibraryScope(); state.readinessBusy = true; render();
  try {
    const result = await caseRequest(`/api/cases/${encodeURIComponent(scope.caseId)}/document-context`, 'PATCH',
      {changes, ...(Object.keys(factChanges).length ? {factChanges} : {}), confirm: true, expectedVersion: state.caseVersion});
    if (!libraryScopeCurrent(scope)) return;
    if (workspaceFingerprint() !== submittedWorkspace) {
      state.readinessAnswers = {...submittedAnswers, ...state.readinessAnswers};
      state.caseError = 'errorReadinessChanged'; state.caseMessage = '';
      return;
    }
    applyLoadedCase(result.case);
    state.readiness = result.readiness || null;
    state.caseMessage = result.archivedLegacyDraft ? 'artifactArchived' : 'caseSaveSuccess';
    await loadCaseExtras();
  } catch (error) {if (libraryScopeCurrent(scope)) state.caseError = copy.en[error.message] ? error.message : 'errorDocDetails';}
  finally {if (libraryScopeCurrent(scope)) {state.readinessBusy = false; render();}}
}
function readinessMarkup() {
  if (!state.caseId || !state.readiness) return '';
  const d = t();
  const missing = Array.isArray(state.readiness.missing) ? state.readiness.missing : [];
  return missing.length ? `<div class="readiness"><p class="readiness-title">${d.readinessMissing}</p>${missing.map(item => `<label class="readiness-item"><span>${esc(item.question || item.key)}</span><input class="input" data-readiness="${esc(item.key)}" value="${esc(state.readinessAnswers[item.key] || '')}" placeholder="${d.readinessAnswer}" ${state.readinessBusy ? 'disabled' : ''}></label>`).join('')}<button id="readiness-confirm" class="secondary" ${state.readinessBusy ? 'disabled' : ''}>${d.readinessConfirmAll}</button></div>` : `<p class="small readiness-ready">${d.readinessReady}</p>`;
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
  const chatThread = state.chatMessages.length || state.chatError ? `<div class="chat-thread" id="chat-thread" aria-live="polite">${state.chatMessages.map(m => `<div class="chat-msg ${m.role}"><span class="chat-role">${m.role === 'user' ? d.chatYou : d.chatAssistant}</span>${m.images && m.images.length ? `<span class="chat-msg-images">${m.images.map(img => `<img src="${img.preview}" alt="">`).join('')}</span>` : ''}<p${m.streaming ? ' id="chat-streaming"' : ''}>${esc(m.content)}${m.streaming ? '<span class="chat-cursor" aria-hidden="true">▍</span>' : ''}</p>${m.incomplete ? `<p class="chat-incomplete">${d.chatIncomplete}</p>` : ''}</div>`).join('')}${state.chatError ? `<div class="error" role="alert">${d[state.chatError] || d.errorChat}${!state.chatBusy && state.chatMessages.some(m => m.role === 'user') ? ` <button type="button" id="chat-retry" class="link">${d.chatRetry}</button>` : ''}</div>` : ''}</div>` : `<p class="chat-empty">${d.chatEmpty}</p>`;
  const chatChips = state.chatImages.length ? `<div class="chat-chips">${state.chatImages.map((img, i) => `<span class="chat-chip"><img src="${img.preview}" alt=""><button type="button" data-chip="${i}" aria-label="${d.chatRemoveImage}">×</button></span>`).join('')}</div>` : '';
  byId('app').innerHTML = `<div class="shell compact-shell">
    <header><a class="brand" href="#main" aria-label="Nestlet"><img src="/logo.svg" alt=""><div class="wordmark">${d.brand}<span class="small">${state.lang === 'zh' ? ' Nestlet' : ''}</span></div></a><div class="tools"><span class="pill mode">DeepSeek Flash</span><button class="ghost" id="settings" aria-expanded="${state.settingsOpen}">${!state.authenticated ? d.signInOrRegister : managesSettings() ? d.manageAccount : d.account}</button><button class="ghost" id="language" lang="${state.lang === 'zh' ? 'en' : 'zh-CN'}" aria-label="${state.lang === 'zh' ? 'Switch interface to English' : '切换界面为中文'}">${state.lang === 'zh' ? 'English' : '中文'}</button></div></header>
    ${settingsMarkup()}
    <div class="workspace-heading"><h1>${d.workspaceTitle}</h1><p>${d.safeShort}<span class="workflow-focus">${d.workflowFocus}: ${esc(getAgencyGuidance(state.guidanceAgency, state.lang).label)}</span></p></div>
    <nav class="steps" aria-label="${d.workflow}">${d.steps.map((step, index) => `<button type="button" data-stage="${index}" class="step ${stage === index ? 'active current' : index < stage ? 'active' : ''}" ${index === 1 && !fields.length || index === 2 && !state.generated ? 'disabled' : ''} ${stage === index ? 'aria-current="step"' : ''}><b>${index + 1}</b>${step}</button>`).join('')}</nav>
    ${caseControlsMarkup()}
    <main id="main" class="grid" ${stage === 2 ? 'hidden' : ''}>
      <section class="panel" id="input-panel" ${stage !== 0 ? 'hidden' : ''}><div class="panel-top"><h2>${d.inputShort}</h2></div>
        ${state.caseId ? `<div class="conversation-bar"><label for="conversation-select">${d.conversationLabel}</label><select id="conversation-select" ${state.chatBusy || !state.conversations.length ? 'disabled' : ''}>${state.conversations.map(c => `<option value="${esc(c.id)}" ${c.id === state.conversationId ? 'selected' : ''}>${esc(c.title || d.conversationMain)}</option>`).join('')}</select><button id="conversation-new" class="link" ${state.chatBusy ? 'disabled' : ''}>${d.conversationNew}</button></div>` : ''}
        ${chatThread}
        <label class="file ${busy ? 'disabled' : ''}"><span aria-hidden="true">↥</span><span>${d.filePick}<small class="file-formats">TXT · CSV${state.pdfEnabled ? ' · PDF' : ''}${state.workbookEnabled ? ' · XLSX · XLS' : ''}</small></span><input type="file" id="file" accept=".txt,.csv,text/plain,text/csv${state.pdfEnabled ? ',.pdf,application/pdf' : ''}${state.workbookEnabled ? ',.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel' : ''}" ${busy ? 'disabled' : ''}></label>
        <details class="help-details" id="sample-downloads"><summary>${d.sampleDownloads}</summary><div class="actions">${['txt', 'csv', 'pdf', 'xlsx', 'xls'].map(extension => `<a href="/samples/nestlet-synthetic-case.${extension}" download="nestlet-synthetic-case.${extension}">${extension.toUpperCase()}</a>`).join('')}</div><p>${d.sampleDownloadHint}</p><p>${d.sampleWorkbookHint}</p></details>
        ${state.workbook || state.source ? `<div class="document-name">${esc(state.workbook?.filename || state.source)}</div>` : ''}
        ${state.workbook ? workbookMarkup() : `
        ${chatChips}<label class="sr-only" for="input">${d.input}</label><textarea class="input" id="input" maxlength="8000" placeholder="${d.pasteShort}" ${busy || state.chatBusy ? 'disabled' : ''}>${esc(state.chatInput)}</textarea>
        <details class="help-details"><summary>${state.lang === 'zh' ? '案例材料（用于提取）' : 'Case source material (for extraction)'}</summary><textarea class="input" id="material-input" maxlength="50000" ${busy || state.chatBusy ? 'disabled' : ''}>${esc(state.text)}</textarea></details>
        <div class="input-meta"><details class="help-details"><summary>${d.inputHelp}</summary><p>${d.inputHint}</p><p>${state.pdfEnabled ? d.pdfHint : d.noPdfHint}</p><p>${state.workbookEnabled ? d.workbookHint : ''}</p><p>${d.localHint}</p><p class="label-list">Property: · Owner: · PHA: · Case reference: · Proposed rent:</p><p>${d.privacy}</p></details><span class="small char-count" id="char-count">${state.text.length.toLocaleString()} / 50,000</span></div>
        <div class="actions"><button class="primary" id="chat-send" ${busy || state.chatBusy || state.chatImagePending ? 'disabled' : ''}>${state.chatBusy ? d.chatStreaming : d.chatSend + ' →'}</button><button class="ghost" id="chat-image" ${busy || state.chatBusy ? 'disabled' : ''}>${d.chatAttachImage}</button><input type="file" id="image-file" accept="image/png,image/jpeg" multiple class="sr-only" ${busy || state.chatBusy ? 'disabled' : ''}><button class="secondary" id="live" ${busy || state.chatBusy ? 'disabled' : ''}>${d.nextReview}</button><button class="link" id="extract" ${busy || state.chatBusy ? 'disabled' : ''}>${d.manualAction}</button>${state.chatBusy ? `<button class="secondary" id="chat-stop">${d.chatStop}</button>` : ''}${busy ? `<button class="secondary" id="cancel">${d.cancel}</button>` : ''}<button class="link push-right" id="reset">${d.reset}</button></div>
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
        <div class="actions"><button id="generate" class="primary" ${state.authenticated && !busy && !state.caseBusy && !state.libraryBusy ? '' : 'disabled'}>${d.generateFinal} →</button><button id="csv" class="link">${d.csv}</button><button id="review-back" class="link push-right">${d.backInput}</button></div>
        ${needsEnglish || !canDraft(fields) ? `<p class="small gate">${needsEnglish ? d.englishRequired : d.gateShort}</p>` : ''}
      </section>
    </main>
    ${state.generated ? `<section class="panel draft-panel" id="draft-panel" ${stage !== 2 ? 'hidden' : ''}><div class="panel-top"><h2>${d.types[kinds.indexOf(state.generatedKind)]}</h2><span class="draft-tag">ENGLISH · ${state.artifactStatus === 'final' ? 'FINAL' : 'DRAFT'}</span></div><p class="caption">${state.artifactIsStale ? d.artifactHistory : state.artifactStatus === 'final' ? 'Supplementary correspondence; not an official agency form.' : d.draftShort}</p><label for="draft" class="sr-only">English draft</label><textarea id="draft" class="input draft" lang="en" spellcheck="true">${esc(state.draftText)}</textarea><div class="print-text" hidden lang="en">${esc(exportDraft())}</div><div class="actions"><button id="copy" class="primary" ${draftNeedsEnglish() ? 'disabled' : ''}>${d.copy}</button><button id="download" class="secondary" ${draftNeedsEnglish() ? 'disabled' : ''}>${d.download}</button><button id="print" class="ghost" ${draftNeedsEnglish() ? 'disabled' : ''}>${d.print}</button>${state.caseId ? `<button id="save-artifact" class="secondary" ${draftNeedsEnglish() ? 'disabled' : ''}>${d.artifactSave}</button>` : ''}<button id="draft-back" class="link push-right">${d.backReview}</button></div><p class="error" id="draft-language-error" role="status">${draftNeedsEnglish() ? d.draftEnglishRequired : ''}</p><div class="success" role="status">${['copied', 'copyFail'].includes(state.message) ? d[state.message] : ''}</div></section>` : ''}
    <footer><span>${d.footerShort}</span><a href="https://www.hud.gov/helping-americans/housing-choice-vouchers-tenants" target="_blank" rel="noreferrer">${d.reference} ↗</a></footer>
  </div>`;
  bind();
  if (focus && byId(focus) && !byId(focus).disabled && !byId(focus).closest('[hidden]')) {
    byId(focus).focus({preventScroll: true});
    if (selection && selection[0] !== null) byId(focus).setSelectionRange(...selection);
  }
}

function clearReview() {
  state.artifactId = null; state.artifactStatus = 'draft'; state.artifactIsStale = false; state.artifactSavedContent = ''; state.legacyDraftText = ''; state.documentContext = {}; state.caseIssues = []; state.readinessAnswers = {}; state.libraryBusy = false; state.readinessBusy = false;
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
  resetChat();
  state.caseEpoch++;
  state.stage = 0;
  state.chatMessages = [];
  state.conversationId = '';
  state.artifacts = [];
  state.readiness = null;
  state.workbook = null;
  cancelProcessing();
  clearReview();
  state.text = text;
  state.source = source;
  state.sample = sample;
}
function exportDraft() {
  if (draftNeedsEnglish()) return 'EXPORT UNAVAILABLE\nVerify the document language before exporting.';
  if (state.artifactStatus === 'final') return state.draftText;
  return /^DRAFT[ —-]/u.test(state.draftText) ? state.draftText : 'DRAFT — FOR HUMAN REVIEW\n\n' + state.draftText;
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
  if (hasUnsavedChanges() && !confirm(t().replaceAsk)) {render(); return;}
  if ((isPdf || isWorkbook) && !state.authConfigured) {state.settingsOpen = true; state.settingsError = 'operatorSetupHelp'; render(); return;}
  if ((isPdf || isWorkbook) && !state.authenticated) {state.settingsOpen = true; state.settingsError = 'errorAuth'; render(); return;}
  if (isPdf && !confirm(t().pdfConsent)) {render(); return;}
  if (isWorkbook && !confirm(t().workbookConsent)) {render(); return;}
  const fileStart = performance.now();
  const {ticket, signal} = beginProcessing();
  try {
    let next;
    if (isWorkbook) {
      const response = await fetch('/api/workbook', {method: 'POST', headers: requestHeaders({...telemetryHeaders(), 'Content-Type': /\.xlsx$/i.test(file.name) ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/vnd.ms-excel', 'X-Document-Consent': 'synthetic-or-deidentified'}), body: file, signal});
      noteBusinessResponse(response);
      const result = await response.json();
      if (ticket !== state.version) return;
      if (!response.ok) throw responseError(result, response.status === 413 ? 'errorSize' : 'errorWorkbook');
      if (!Array.isArray(result.sheets) || !result.sheets.some(sheet => sheet.hidden === false && Array.isArray(sheet.rows) && sheet.rows.length)) throw new Error(response.status === 413 ? 'errorSize' : 'errorWorkbook');
      state.workbook = {...result, filename: file.name};
      state.sheetIndex = result.sheets.findIndex(sheet => sheet.hidden === false && sheet.rows.length);
      state.rowIndex = result.sheets[state.sheetIndex].rows.length > 1 ? 1 : 0;
      state.mapping = Object.fromEntries(FIELDS.map(key => [key, null]));
      state.stage = 0;
      track('input.file', 'success', {waitMs: Math.round(performance.now() - fileStart)});
      return;
    } else if (isPdf) {
      const response = await fetch('/api/document', {method: 'POST', headers: requestHeaders({...telemetryHeaders(), 'Content-Type': 'application/pdf', 'X-Document-Consent': 'synthetic-or-deidentified'}), body: file, signal});
      noteBusinessResponse(response);
      const result = await response.json();
      if (!response.ok) {
        const codes = {OCR_REQUIRED: 'errorScanned', PDF_ENCRYPTED: 'errorEncrypted', TEXT_TOO_LARGE: 'errorTextSize', BUSY: 'errorBusy'};
        throw responseError(result, codes[result.code] || (response.status === 413 ? 'errorSize' : 'errorPdf'));
      }
      if (typeof result.text !== 'string') throw new Error('errorPdf');
      if (result.text.length > 50000) throw new Error('errorTextSize');
      next = result.text;
    } else {
      const raw = new TextDecoder('utf-8', {fatal: true}).decode(await file.arrayBuffer());
      next = /\.csv$/i.test(file.name) ? parseCSV(raw) : raw;
    }
    if (ticket !== state.version) return;
    replaceText(next, file.name);
    track('input.file', 'success', {waitMs: Math.round(performance.now() - fileStart)});
    state.message = 'loaded';
    render();
  } catch (error) {
    if (ticket === state.version) state.error = copy.en[error.message] ? error.message : /\.csv$/i.test(file.name) ? 'errorCSV' : isPdf ? 'errorPdf' : isWorkbook ? 'errorWorkbook' : 'errorFile';
  } finally {finishProcessing(ticket);}
}

async function extractLive() {
  if (state.authConfigured && !state.authenticated) {state.settingsOpen = true; state.settingsError = 'errorAuth'; render(); return;}
  if (!state.liveEnabled) {state.error = state.statusError ? 'errorBackend' : state.role === 'trial' ? 'errorTrialUnavailable' : 'errorConfig'; state.settingsOpen = true; render(); return;}
  if (!state.text.trim()) {state.error = 'errorEmpty'; render(); return;}
  if (!confirm(t().consent)) return;
  const {ticket, signal} = beginProcessing();
  try {
    const response = await fetch('/api/extract', {method: 'POST', headers: requestHeaders({...telemetryHeaders(), 'Content-Type': 'application/json'}), body: JSON.stringify({text: state.text, consent: true}), signal});
    noteBusinessResponse(response);
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


/** Isolated chat lifecycle. Source material and reviewed case state are never composer state. */
function revokeChatImages(images = []) { for (const image of images) if (image.preview) URL.revokeObjectURL(image.preview); }
function resetChat() {
  state.chatEpoch = (state.chatEpoch || 0) + 1;
  chatController?.abort(); chatController = null;
  revokeChatImages(state.chatImages);
  for (const message of state.chatMessages) revokeChatImages(message.images);
  state.chatImages = []; state.chatMessages = []; state.chatInput = ''; state.chatBusy = false; state.chatImagePending = 0;
  state.chatError = ''; state.chatIncomplete = false; state.conversationId = ''; chatStopRequested = false;
}
function chatScope() { return {userId:state.userId,caseEpoch:state.caseEpoch,caseId:state.caseId,conversationId:state.conversationId,epoch:state.chatEpoch}; }
function sameChat(scope) { return state.authenticated && scope.userId === state.userId && scope.caseEpoch === state.caseEpoch && scope.caseId === state.caseId && scope.conversationId === state.conversationId && scope.epoch === state.chatEpoch; }
function requireChatScope(scope) { if (!sameChat(scope)) throw new DOMException('Chat context changed','AbortError'); }
async function chatJson(path, method, body, scope, signal) {
  requireChatScope(scope);
  const response = await fetch(path,{method,cache:'no-store',headers:requestHeaders({...telemetryHeaders(),...(body ? {'Content-Type':'application/json'} : {})}),...(body ? {body:JSON.stringify(body)} : {}),signal:AbortSignal.any([signal || new AbortController().signal,AbortSignal.timeout(15000)])});
  requireChatScope(scope);
  const result = await response.json(); requireChatScope(scope); noteBusinessResponse(response);
  if (!response.ok) throw responseError(result,'errorChat');
  return result;
}
function storedChatMessages(messages) {
  return messages.map(message => ({role:message.role,content:message.content,serverId:message.id,clientMessageId:message.clientMessageId,incomplete:message.state !== 'complete',imageMetadata:message.imageMetadata || []}));
}
async function addChatImages(files) {
  if (!files.length) return;
  if (!state.authenticated) {state.settingsOpen=true; state.settingsError='errorAuth'; render(); return;}
  const scope = chatScope(); state.chatImagePending++; render();
  try {
  for (const file of files) {
    if (!sameChat(scope) || state.chatBusy) return;
    if (state.chatImages.length >= 2) {state.chatError = 'chatImageBad'; break;}
    if (!/^image\/(png|jpeg)$/i.test(file.type) || file.size > 2097152) {state.chatError = 'chatImageBad'; continue;}
    try {
      const buffer = await file.arrayBuffer(); requireChatScope(scope);
      const bitmap = await createImageBitmap(new Blob([buffer]));
      const tooBig = !bitmap.width || !bitmap.height || bitmap.width > 8192 || bitmap.height > 8192;
      bitmap.close(); requireChatScope(scope);
      if (state.chatBusy) return;
      if (tooBig || state.chatImages.length >= 2) {state.chatError = 'chatImageBad'; continue;}
      const bytes = new Uint8Array(buffer); let binary = '';
      for (let i=0;i<bytes.length;i+=8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192));
      const preview = URL.createObjectURL(file);
      if (!sameChat(scope)) {URL.revokeObjectURL(preview); return;}
      state.chatImages.push({mimeType:file.type.toLowerCase(),data:btoa(binary),preview}); state.chatError = '';
    } catch (error) {if (!sameChat(scope)) return; state.chatError = 'chatImageBad';}
  }
  } finally {if (sameChat(scope)) {state.chatImagePending=Math.max(0,state.chatImagePending-1); render();}}
}
async function sendChat(retry = false) {
  if (state.chatBusy || state.caseBusy || state.busy || state.chatImagePending) return;
  if (!state.authenticated) {state.settingsOpen=true; state.settingsError='errorAuth'; render(); return;}
  if (!state.liveEnabled) {state.chatError=state.statusError?'errorBackend':'errorConfig'; state.settingsOpen=true; render(); return;}
  const prior = retry ? [...state.chatMessages].reverse().find(message=>message.role==='user') : null;
  const text = retry ? prior?.content || '' : state.chatInput.trim();
  const images = retry ? prior?.images || [] : state.chatImages;
  if ((!text && !images.length) || text.length>8000) {state.chatError=text.length>8000?'chatTooLong':'errorEmpty'; render(); return;}
  if (retry && prior?.imageMetadata?.length && !images.length) {state.chatError='chatImageBad'; render(); return;}
  if (!confirm(t().chatConsent)) return;
  const scope=chatScope(), controller=new AbortController(); chatController=controller; chatStopRequested=false;
  state.chatBusy=true; state.chatError=''; render();
  let assistant=null, userMessage=null, completed=false;
  try {
    if (!state.caseId || hasUnsavedChanges()) {
      const before=caseFingerprint(), existingId=state.caseId;
      const payload={...casePayload(),title:state.caseTitle.trim() || t().untitledCase,clientId:state.customerId || null};
      const result=await chatJson(existingId ? `/api/cases/${encodeURIComponent(existingId)}` : '/api/cases',existingId ? 'PUT' : 'POST',{...payload,...(existingId ? {expectedVersion:state.caseVersion} : {})},scope,controller.signal);
      if (!validCaseRecord(result.case)) throw new Error('errorCaseStorage');
      if (before!==caseFingerprint()) throw new Error('errorCaseChanged');
      state.caseId=result.case.id; scope.caseId=result.case.id; state.caseVersion=result.case.version;
      state.caseTitle=result.case.title; state.savedFingerprint=caseFingerprint(); state.selectedCaseId=result.case.id;
      state.cases=[result.case,...state.cases.filter(item=>item.id!==result.case.id)];
    }
    if (!state.conversationId) {
      const result=await chatJson(`/api/cases/${encodeURIComponent(state.caseId)}/conversations`,'POST',{title:(text || t().chatImageOnly).slice(0,120)},scope,controller.signal);
      if (!result.conversation?.id || result.conversation.caseId!==scope.caseId) throw new Error('errorConversationInvalid');
      state.conversationId=result.conversation.id; scope.conversationId=result.conversation.id;
      state.conversations=[result.conversation,...state.conversations];
    }
    requireChatScope(scope);
    userMessage={role:'user',content:text,images,clientMessageId:crypto.randomUUID()};
    state.chatMessages.push(userMessage); state.chatImages=[]; state.chatInput='';
    assistant={role:'assistant',content:'',streaming:true,incomplete:true}; state.chatMessages.push(assistant); render();
    const response=await fetch('/api/chat',{method:'POST',headers:requestHeaders({...telemetryHeaders(),'Content-Type':'application/json'}),signal:controller.signal,
      body:JSON.stringify({locale:state.lang,consent:true,caseId:scope.caseId,conversationId:scope.conversationId,clientMessageId:userMessage.clientMessageId,messages:[{role:'user',content:text,...(images.length?{images:images.map(image=>({mimeType:image.mimeType,data:image.data}))}:{})}]})});
    requireChatScope(scope); noteBusinessResponse(response);
    if (!response.ok) {const result=await response.json(); requireChatScope(scope); throw responseError(result,'errorChat');}
    if (!response.body || !(response.headers.get('content-type') || '').includes('text/event-stream')) throw new Error('errorChat');
    const reader=response.body.getReader(), decoder=new TextDecoder(); let buffer='';
    for (;;) {
      const {done,value}=await reader.read(); requireChatScope(scope);
      if (done) break;
      buffer+=decoder.decode(value,{stream:true}); let match;
      while ((match=/\r?\n\r?\n/.exec(buffer))) {
        const frame=buffer.slice(0,match.index); buffer=buffer.slice(match.index+match[0].length);
        const eventName=frame.match(/^event: ?(.+)$/m)?.[1];
        const dataText=frame.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
        if (!eventName || !dataText) continue;
        let data; try {data=JSON.parse(dataText);} catch {throw new Error('chatIncomplete');}
        requireChatScope(scope);
        if (eventName==='delta' && typeof data.text==='string') {
          assistant.content+=data.text;
          if (assistant.content.length>64000) {controller.abort(); throw new Error('chatTooLong');}
          const element=byId('chat-streaming'); if (element) element.textContent=assistant.content;
        } else if (eventName==='done') {completed=true; assistant.incomplete=false; assistant.serverId=data.assistantMessageId;}
        else if (eventName==='conversation' && data.conversationId!==scope.conversationId) throw new Error('errorConversationInvalid');
        else if (eventName==='error') throw responseError(data,'chatIncomplete');
      }
      if (buffer.length>100000) throw new Error('chatIncomplete');
    }
    if (!completed) throw new Error('chatIncomplete');
  } catch (error) {
    if (!sameChat(scope)) return;
    if (assistant) assistant.incomplete=!completed;
    state.chatError=error?.name==='AbortError'||chatStopRequested?'chatIncomplete':copy.en[error?.message]?error.message:'errorChat';
    if (!userMessage) state.chatInput=text;
  } finally {
    if (sameChat(scope)) {
      if (assistant) delete assistant.streaming;
      // Refresh durable state after errors too. Keep a local partial until the server has retained it.
      if (userMessage && scope.conversationId) try {
        const refresh=new AbortController(); chatController=refresh;
        const result=await chatJson(`/api/conversations/${encodeURIComponent(scope.conversationId)}`,'GET',undefined,scope,refresh.signal);
        if (!Array.isArray(result.messages)) throw new Error('errorChat');
        const stored=storedChatMessages(result.messages);
        if (stored.some(message=>message.clientMessageId===userMessage.clientMessageId)) {
          for (const message of state.chatMessages) revokeChatImages(message.images);
          if (assistant?.content && !stored.some(message=>message.role==='assistant' && message.content===assistant.content)) stored.push({...assistant,incomplete:true});
          state.chatMessages=stored;
        }
      } catch {}
      if (sameChat(scope)) {state.chatBusy=false; chatController=null; render();}
    }
  }
}

function bind() {
  const on = (id, event, handler) => byId(id)?.addEventListener(event, handler);
  const go = stage => {state.stage = stage; render(); byId(stage === 2 ? 'draft-panel' : 'main').scrollIntoView({behavior: 'smooth', block: 'start'});};
  document.querySelectorAll('[data-stage]').forEach(button => button.addEventListener('click', () => go(Number(button.dataset.stage))));
  on('review-back', 'click', () => go(0));
  on('draft-back', 'click', () => go(1));
  on('guidance-agency', 'change', event => {state.guidanceAgency = event.target.value; state.guidanceOpen = true; render();});
  on('agency-references', 'toggle', event => {state.guidanceOpen = event.target.open;});
  on('save-case', 'click', saveCurrentCase);
  on('open-case', 'click', openSavedCase);
  on('delete-case', 'click', deleteSavedCase);
  on('refresh-cases', 'click', () => refreshCaseList());
  on('case-manager', 'toggle', event => {state.casesOpen = event.target.open;});
  on('case-title', 'input', event => {state.caseTitle = event.target.value; updateCaseIndicator();});
  on('saved-case', 'change', event => {state.selectedCaseId = event.target.value; render();});
  on('settings', 'click', () => {state.settingsOpen = !state.settingsOpen; state.settingsError = ''; state.settingsMessage = ''; render();});
  on('refresh-status', 'click', refreshStatus);
  for (const [id, mode] of [['auth-signin', 'login'], ['auth-register', 'register']]) on(id, 'click', () => {
    state.loginUsername = byId('login-username')?.value.trim() || state.loginUsername;
    state.authForm = mode; state.settingsError = ''; state.settingsMessage = ''; render();
  });
  on('login-form', 'submit', event => {
    event.preventDefault();
    if (!operatorLoginAvailable()) return;
    const input = byId('operator-password');
    const confirmation = byId('password-confirmation');
    state.loginUsername = byId('login-username').value.trim().toLowerCase();
    const registering = state.authForm === 'register';
    let validationError = '';
    if (registering && !state.registrationEnabled) validationError = 'registrationUnavailable';
    else if (registering && (!/^[a-z0-9][a-z0-9_.-]{2,63}$/.test(state.loginUsername) || state.loginUsername === 'owner')) validationError = 'errorRegistration';
    else if (input.value.length < 6 || input.value.length > 256 || /[\u0000-\u001f\u007f]/.test(input.value)) validationError = registering ? 'errorRegistration' : 'errorCredentials';
    else if (registering && input.value !== confirmation?.value) validationError = 'errorPasswordMismatch';
    if (validationError) {state.settingsError = validationError; byId('settings-error').textContent = t()[validationError]; return;}
    const payload = {username: state.loginUsername, password: input.value, ...(registering ? {passwordConfirmation: confirmation.value} : {})};
    input.value = '';
    if (confirmation) confirmation.value = '';
    settingsRequest(registering ? '/api/register' : '/api/login', payload, registering ? 'registrationSuccess' : 'loginSuccess');
  });
  on('key-form', 'submit', event => {
    event.preventDefault();
    if (!secureSettingsAvailable() || !managesSettings()) return;
    const input = byId('api-key');
    const payload = {enableLive: byId('enable-live').checked};
    if (input.value.trim()) payload.apiKey = input.value.trim();
    input.value = '';
    settingsRequest('/api/settings', payload, 'settingsSaved');
  });
  on('test-connection', 'click', () => settingsRequest('/api/settings/test', {}, 'connectionSuccess'));
  on('logout', 'click', () => {
    if ((state.text || state.generated || state.chatInput || state.chatMessages.length || state.chatImages.length) && !confirm(t().logoutConfirm)) return;
    resetChat(); resetLibraryState(); cancelProcessing();
    settingsRequest('/api/logout', {}, 'logoutSuccess');
  });
  on('language', 'click', () => {state.lang = state.lang === 'zh' ? 'en' : 'zh'; render();});
  on('reset', 'click', () => {
    if ((state.text || state.fields.length || state.busy || state.chatInput || state.chatMessages.length || state.chatImages.length) && !confirm(t().resetAsk)) return;
    replaceText(''); forgetCaseIdentity(); state.kind = 'followup'; resetTelemetry(); render(); byId('input').focus();
  });
  on('cancel', 'click', () => {cancelProcessing(); state.message = 'cancelled'; render();});
  on('input', 'input', event => {state.chatInput = event.target.value;});
  on('material-input', 'input', event => {
    state.text = event.target.value;
    const wasSample = state.sample;
    state.sample = false;
    state.error = '';
    state.message = '';
    if (state.fields.length || state.generated || state.source || wasSample) {clearReview(); state.source = ''; render();}
    else byId('char-count').textContent = state.text.length.toLocaleString() + ' / 50,000';
    updateCaseIndicator();
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
      track('input.mapping', 'success');
      render();
    } catch {state.error = 'errorMapping'; render();}
  });
  on('extract', 'click', () => {
    if (!state.text.trim()) {state.error = 'errorEmpty'; render(); byId('input').focus(); return;}
    clearReview(); state.fields = extract(state.text); state.stage = 1; track('input.paste', 'success'); render();
    if (window.matchMedia('(max-width: 760px)').matches) byId('review-panel').scrollIntoView({behavior: 'smooth', block: 'start'});
  });
  on('live', 'click', extractLive);
  on('customer-create', 'click', createCustomer);
  on('customer-query', 'input', event => {state.customerQuery = event.target.value;});
  on('customer-query', 'change', () => loadCustomers(state.customerQuery.trim()).then(render));
  document.querySelectorAll('[data-customer]').forEach(button => button.addEventListener('click', () => selectCustomer(button.dataset.customer, button.dataset.name)));
  document.querySelectorAll('[data-case-open]').forEach(button => button.addEventListener('click', () => {state.selectedCaseId = button.dataset.caseOpen; openSavedCase();}));
  document.querySelectorAll('[data-artifact-open]').forEach(button => button.addEventListener('click', () => openArtifact(button.dataset.artifactOpen)));
  document.querySelectorAll('[data-artifact-download]').forEach(button => button.addEventListener('click', () => downloadArtifact(button.dataset.artifactDownload)));
  document.querySelectorAll('[data-readiness]').forEach(input => input.addEventListener('input', () => {state.readinessAnswers[input.dataset.readiness] = input.value;}));
  on('conversation-select', 'change', event => selectConversation(event.target.value));
  on('conversation-new', 'click', () => {resetChat(); render();});
  on('save-artifact', 'click', saveArtifact);
  on('readiness-confirm', 'click', confirmReadiness);
  on('chat-send', 'click', () => sendChat(false));
  on('chat-retry', 'click', () => sendChat(true));
  on('chat-stop', 'click', () => {chatStopRequested = true; chatController?.abort();});
  on('chat-image', 'click', () => byId('image-file')?.click());
  on('image-file', 'change', event => addChatImages([...event.target.files]));
  document.querySelectorAll('[data-chip]').forEach(button => button.addEventListener('click', () => {revokeChatImages(state.chatImages.splice(Number(button.dataset.chip), 1)); render();}));
  on('input', 'paste', event => {
    const images = [...(event.clipboardData?.files || [])].filter(file => /^image\/(png|jpeg)$/i.test(file.type));
    if (images.length) {event.preventDefault(); const text=event.clipboardData?.getData('text/plain') || ''; if (text) {state.chatInput=(state.chatInput+text).slice(0,8000); event.target.value=state.chatInput;} addChatImages(images);}
  });
  const inputPanel = byId('input-panel');
  if (inputPanel) {
    inputPanel.addEventListener('dragover', event => {event.preventDefault(); inputPanel.classList.add('drag-over');});
    inputPanel.addEventListener('dragleave', () => inputPanel.classList.remove('drag-over'));
    inputPanel.addEventListener('drop', event => {
      event.preventDefault();
      inputPanel.classList.remove('drag-over');
      const files = [...(event.dataTransfer?.files || [])];
      addChatImages(files.filter(file => /^image\/(png|jpeg)$/i.test(file.type)));
      const document = files.find(file => /\.(txt|csv|pdf|xlsx|xls)$/i.test(file.name));
      if (document) importFile(document);
    });
  }
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
    if (element.checked) track('review.confirm', 'success');
    state.fields[Number(element.dataset.confirm)].confirmed = element.checked;
    state.draftText = ''; state.generated = false; state.message = '';
    render();
  }));
  on('names-verified', 'change', event => {state.namesVerified = event.target.checked; state.draftText = ''; state.generated = false; render();});
  on('draft-type', 'change', event => {state.kind = event.target.value; state.readinessAnswers = {}; loadReadiness().then(render); updateCaseIndicator();});
  on('generate', 'click', generateFinalArtifact);
  on('generate-final', 'click', generateFinalArtifact);
  on('csv', 'click', () => download(exportCSV(state.fields, {includeNotice: true}), 'nestlet-case-DRAFT.csv', 'text/csv;charset=utf-8'));
  on('draft', 'input', event => {if (!draftEditTracked) {draftEditTracked = true; track('draft.edit', 'success');} state.draftText = event.target.value; state.artifactStatus = 'draft'; state.artifactIsStale = false; state.message = ''; document.querySelector('#draft-panel .draft-tag').textContent = 'ENGLISH · DRAFT'; document.querySelector('.print-text').textContent = exportDraft(); document.querySelector('#draft-panel .success').textContent = ''; const blocked = draftNeedsEnglish(); ['copy', 'download', 'print'].forEach(id => byId(id).disabled = blocked); byId('draft-language-error').textContent = blocked ? t().draftEnglishRequired : ''; updateCaseIndicator();});
  on('download', 'click', () => {if (state.artifactId && state.draftText === state.artifactSavedContent) {downloadArtifact(state.artifactId); return;} download(exportDraft(), `nestlet-${state.generatedKind}-${state.artifactStatus}.txt`, 'text/plain;charset=utf-8'); track('export.download', 'success');});
  on('print', 'click', () => {if (state.artifactIsStale && state.artifactStatus === 'final') {state.caseError = 'errorArtifactStale'; render(); return;} window.print(); track('export.print', 'success');});
  on('copy', 'click', async () => {
    try {await navigator.clipboard.writeText(exportDraft()); state.message = 'copied'; track('export.copy', 'success');}
    catch {state.message = 'copyFail'; track('export.copy', 'failure', {errorCode: 'CLIPBOARD_FAILED'});}
    render();
  });
}

render();
refreshStatus();

window.addEventListener('beforeprint', () => {document.title = `Nestlet - ${copy.en.types[kinds.indexOf(state.generatedKind)]} - DRAFT`;});
window.addEventListener('afterprint', () => {document.title = 'Nestlet · 巢小秘';});

window.addEventListener('beforeunload', event => {if (hasUnsavedChanges() || state.chatInput || state.chatImages.length || state.chatBusy) {event.preventDefault(); event.returnValue = '';}});
