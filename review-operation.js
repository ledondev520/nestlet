/** Narrow, read-only review execution lane. No model text selects its own mode. */
export function isDirectReviewRequest(value) {
  if(typeof value!=='string'||!value.trim())return false;
  // Closed sentence grammar, not semantic classification. Unknown coordinated
  // requests, capability/how-to questions and examples remain ordinary chat.
  const sentences=value.trim().split(/[。！!？?\n]+|\.(?:\s+|$)/u).map(text=>text.trim()).filter(Boolean);
  const command=/^(?:请(?:帮我)?|帮我|(?:你)?(?:能|可以)帮我)(?:准备|生成|创建)(?:一张|一个)?(?:冲突)?(?:核对|事实核对)(?:预览|卡片)(?:吗)?(?:[，,]\s*(?:并|然后)?(?:请)?(?:简单)?告诉我接下来(?:该)?怎么做|[，,]\s*(?:先预览[、，,])?(?:先)?不要(?:保存|应用))?$/u;
  const english=/^(?:please\s+|(?:could|would) you (?:please )?)?(?:prepare|create|show|make)\s+(?:me\s+)?(?:a\s+|the\s+)?(?:conflict\s+|fact\s+)?(?:review preview|review card|conflict preview)(?:(?:,\s*|\s+and\s+)(?:briefly\s+)?tell me (?:the )?next steps?)?$/iu;
  const amount=String.raw`(?:US\$|\$|USD\s*|￥|¥)?\s*\d+(?:,\d{3})*(?:\.\d{1,2})?\s*(?:美元|元|USD|dollars)?`;
  const rent=new RegExp(String.raw`^(?:之前|当前|原来|本次)?(?:核对的|已核对的|已确认的|建议)?(?:拟申请租金|申请租金|租金)(?:是|为)?\s*${amount}(?:[，,]\s*我又看到一个尚未核实的\s*${amount}说法)?$`,'u');
  const englishRent=new RegExp(String.raw`^(?:(?:the )?(?:current|confirmed|proposed|requested) rent is|I (?:also )?saw an unverified rent of)\s+${amount}$`,'iu');
  const preserve=new RegExp(String.raw`^(?:(?:先)?保留(?:原来|之前|当前|现有)的\s*${amount}(?:[，,]\s*)?)?不要改动已经完成的文书$`,'u');
  const context=/^继续这个(?:虚构|合成)?测试事项$/u;
  const qualifier=/^(?:先预览[、，,])?(?:先)?不要(?:保存|应用)(?:任何修改)?$/u;
  const noSave=/^do not (?:save|apply)(?: any changes)?$/iu;
  const keep=/^keep (?:the )?(?:current|existing) (?:rent|case facts|documents) unchanged$/iu;
  // Known labels introduce evidence, never a second action. Quoted values can
  // contain punctuation; unquoted scalars cannot contain coordination clauses.
  const fact=/^(?:物业地址|房产地址|业主|房东|收件人(?:姓名|邮箱|联系方式)?|发件人(?:姓名|邮箱|联系方式)?|联系人|联系方式|邮箱|Property(?: address)?|Owner|Recipient(?: name| email| contact)?|Sender(?: name| email| contact)?|Contact(?: name| email)?|Email)(?:\s*[:：]\s*|\s+is\s+|是)(.+)$/iu;
  const factEvidence=sentence=>{
    const match=fact.exec(sentence);if(!match)return false;
    const scalar=match[1].trim();if(!scalar||scalar.length>200)return false;
    if(/^(?:"[^"\n]+"|“[^”\n]+”)$/u.test(scalar))return true;
    return /^[\p{L}\p{N}\s@.+/#'()\-]+$/u.test(scalar)&&!/(?:^|\s)(?:and|then|also|please)(?:\s|$)|[并请]|然后|同时|另外/iu.test(scalar);
  };
  let commands=0;
  for(const sentence of sentences){
    if(command.test(sentence)||english.test(sentence)){commands++;continue;}
    if(!context.test(sentence)&&!rent.test(sentence)&&!englishRent.test(sentence)&&!preserve.test(sentence)&&!keep.test(sentence)&&!qualifier.test(sentence)&&!noSave.test(sentence)&&!factEvidence(sentence))return false;
  }
  return commands===1;
}
const operationalClaim=/prepare_case_suggestion|prepare_answer_draft|CONVERSATION_ACTION_|requiresExplicitApply|factChanges|\bok\s*:\s*true|\bconfirm\s*:\s*false|(?:准备好|准备好了)[^\n。]{0,18}(?:核对卡|卡片|预览)|(?:预览|卡片)[^\n。]{0,18}(?:已生成|已准备)|(?:已生成|已准备)[^\n。]{0,18}(?:预览|卡片)|(?:preview|card)[^\n.]{0,24}(?:ready|generated|prepared)|(?:generated|prepared)[^\n.]{0,24}(?:preview|card)/iu;
export function reviewHistoryText(message) {
  return message.role==='assistant'&&operationalClaim.test(message.content)
    ? '[Historical assistant operational commentary omitted from this review execution context. The original saved source is unchanged; this is not evidence of a past success or failure.]'
    : message.content;
}
export function reviewResultText(proposals,locale='zh') {
  if(proposals.length)return locale==='en'
    ? 'Review suggestions were prepared from the supplied information in this turn. No case facts or completed documents were changed. This is not agency approval and nothing was sent or submitted.'
    : '本次已根据提供的信息准备核对建议。案例和已完成文书均未修改；这不代表机构批准，也没有发送或提交。';
  return locale==='en'
    ? 'No review card was prepared for this turn. No case facts or documents were changed. You can request a new review preview with the specific details to check.'
    : '这次没有生成可核对的卡片，案例和文书均未修改。你可以重新请求核对预览，并说明具体要核对的信息。';
}
export function newReviewReceipt(requestId) {
  return {requestId,providerRequests:0,toolCalls:0,prepareCalls:0,otherCalls:0,validatedProposals:0,emittedProposals:0,repairs:0,prepareErrors:0,finishReason:'none',outcome:'pending',reason:'pending'};
}
/** Explicit allowlist; never log arguments, source text, IDs beyond request, or credentials. */
export function reviewReceiptSnapshot(value) {
  const result={requestId:value.requestId};
  if(!/^[0-9a-f-]{36}$/u.test(result.requestId))throw new Error('Invalid review receipt');
  for(const key of ['providerRequests','toolCalls','prepareCalls','otherCalls','validatedProposals','emittedProposals','repairs','prepareErrors']) {
    if(!Number.isSafeInteger(value[key])||value[key]<0||value[key]>8)throw new Error('Invalid review receipt');
    result[key]=value[key];
  }
  if(!['none','stop','tool_calls','error','cancelled'].includes(value.finishReason)||!['pending','prepared','no_preview','failed','cancelled'].includes(value.outcome)||!['pending','prepared','no_tool','no_source','prepare_rejected','budget_exhausted','provider_error','persistence_failed','cancelled','stream_failed'].includes(value.reason))throw new Error('Invalid review receipt');
  return {...result,finishReason:value.finishReason,outcome:value.outcome,reason:value.reason};
}
