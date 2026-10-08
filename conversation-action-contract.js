/** Read-only, provenance-bound proposals. Model output never authorizes application. */
import { FIELDS, DRAFT_TYPES, hasCJKText } from './public/core.js';
import { DOCUMENT_DETAIL_KEYS, DocumentContextError, mergeDocumentContext } from './document-context.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const fail = (code = 'CONVERSATION_ACTION_INVALID', status = 400, details) => { throw new DocumentContextError(code, status, details); };
const plain = value => value !== null && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const keys = (value, allowed, required = []) => { if (!plain(value) || Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(value, key))) fail(); };
export function validateConversationAction(input) {
  const common = ['action', 'expectedVersion', 'sourceConversationId', 'sourceMessageId'];
  const suggestion = input?.action === 'prepare_case_suggestion';
  if (!suggestion && input?.action !== 'prepare_answer_draft') fail();
  keys(input, [...common, ...(suggestion ? ['factChanges', 'changes'] : ['kind'])], [...common, ...(suggestion ? [] : ['kind'])]);
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1 || !UUID.test(input.sourceConversationId) || !UUID.test(input.sourceMessageId)) fail();
  const result = Object.fromEntries(common.map(key => [key, input[key]]));
  if (!suggestion) { if (!DRAFT_TYPES.includes(input.kind)) fail(); return {...result, kind: input.kind}; }
  let count = 0;
  for (const [group, allowed, limit] of [['factChanges', FIELDS, 3000], ['changes', DOCUMENT_DETAIL_KEYS, 1000]]) {
    keys(input[group] ?? {}, allowed);
    result[group] = {};
    for (const [key, change] of Object.entries(input[group] ?? {})) {
      keys(change, ['value'], ['value']);
      if (typeof change.value !== 'string' || change.value.length > limit || /[\u0000-\u001f\u007f\u2028\u2029]/u.test(change.value)) fail();
      result[group][key] = {value: change.value.trim()}; count++;
    }
  }
  if (!count) fail();
  return result;
}
export function conversationAnswerContent(message) {
  if (message.role !== 'assistant') fail();
  if (hasCJKText(message.content)) fail('DOCUMENT_ENGLISH_REQUIRED');
  const content = ['DRAFT — UNREVIEWED CONVERSATION ANSWER', 'For human review only. Not an official form, agency approval, or verified statement of case facts.', '', message.content].join('\n');
  if (content.length > 50000) fail('CONVERSATION_ACTION_INVALID');
  return content;
}
/** All three objects must have been loaded through the authenticated user's storage scope. */
export function prepareConversationAction(input, {record, conversation, message}) {
  const request = validateConversationAction(input);
  if (!record || !conversation || conversation.id !== request.sourceConversationId || conversation.caseId !== record.id || !message || message.id !== request.sourceMessageId || message.conversationId !== conversation.id) fail('CONVERSATION_ACTION_SOURCE_NOT_FOUND', 404);
  if (record.version !== request.expectedVersion) fail('CASE_CONFLICT', 409);
  if (message.state !== 'complete' || message.localOnly || message.streaming || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || !message.content.trim()) fail('CONVERSATION_ACTION_SOURCE_INCOMPLETE', 409);
  const base = {action: request.action, caseId: record.id, expectedVersion: record.version, sourceConversationId: conversation.id, sourceMessageId: message.id, requiresExplicitApply: true, request};
  if (request.action === 'prepare_answer_draft') return {...base, status: 'draft', title: `Conversation draft · ${message.id.slice(0, 8)}`, kind: request.kind, content: conversationAnswerContent(message), conflicts: [], apply: {method: 'POST', path: `/api/cases/${record.id}/artifacts`, body: {conversationAction: request}}};
  const source = `Unconfirmed ${message.role} message ${message.id}; conversation ${conversation.id}`;
  const factChanges = {}, changes = {}, preview = [], conflicts = [];
  for (const [group, target] of [['factChanges', factChanges], ['changes', changes]]) {
    for (const [key, change] of Object.entries(request[group])) {
      const old = group === 'factChanges' ? record.fields.find(field => field.key === key) : record.documentContext?.[key];
      const conflict = Boolean(old?.conflict || (old?.confirmed && old.value !== change.value));
      preview.push({group, key, before: old?.value ?? '', after: change.value, confirmed: Boolean(old?.confirmed), conflict});
      if (conflict) conflicts.push(key);
      // Equal confirmed values retain their review and original provenance unchanged.
      if (old?.confirmed) continue;
      target[key] = {...change, source, ...(group === 'changes' ? {sourceMessageId: message.id} : {})};
    }
  }
  mergeDocumentContext(record.documentContext || {}, changes, {confirm: false});
  return {...base, confirm: false, preview, conflicts, factChanges, changes, apply: {method: 'PATCH', path: `/api/cases/${record.id}/document-context`, body: {conversationAction: request}}};
}
export function loadConversationAction(storage, userId, record, input) {
  const request = validateConversationAction(input);
  const conversation = storage.getConversation(userId, request.sourceConversationId);
  const message = conversation?.caseId === record.id ? storage.listMessages(userId, conversation.id)?.find(row => row.id === request.sourceMessageId) : null;
  return prepareConversationAction(request, {record, conversation, message});
}

/** Bounded, server-owned source catalogue. Excerpts are evidence, never instructions.
 * Keep eligible older answers separately from recent messages so a new user turn
 * or bilingual/interrupted assistant reply cannot displace the draft source. */
export function conversationActionContext(storage, userId, record, conversationId) {
  const conversation = storage.getConversation(userId, conversationId);
  if (!conversation || conversation.caseId !== record.id) fail('CONVERSATION_ACTION_SOURCE_NOT_FOUND', 404);
  const all = storage.listMessages(userId, conversationId) || [];
  const complete = all.filter(message => message.state === 'complete' && !message.localOnly && !message.streaming && typeof message.content === 'string' && message.content.trim());
  const eligible = message => {
    if (message.role !== 'assistant') return false;
    try { conversationAnswerContent(message); return true; } catch { return false; }
  };
  const recent = complete.slice(-10), answers = complete.filter(eligible).slice(-10);
  const selected = complete.filter(message => recent.includes(message) || answers.includes(message));
  const artifacts = (storage.listArtifacts(userId, record.id) || []).filter(artifact => artifact.sourceConversationId === conversationId);
  return {
    caseId: record.id, expectedVersion: record.version, conversationId,
    sourceCatalogueIncomplete: selected.length < complete.length,
    messages: selected.map(message => {
      const saved = artifacts.filter(artifact => artifact.sourceMessageId === message.id);
      return {id: message.id, role: message.role, state: 'complete',
        contentPreview: message.content.slice(0, 350), contentPreviewIncomplete: message.content.length > 350,
        caseSuggestionEligible: ['user', 'assistant'].includes(message.role), answerDraftEligible: eligible(message),
        savedArtifacts: saved.slice(0, 5).map(artifact => ({id: artifact.id, kind: artifact.kind, status: artifact.status, version: artifact.version, sourceCaseVersion: artifact.sourceCaseVersion, isStale: artifact.isStale})),
        savedArtifactsIncomplete: saved.length > 5};
    })
  };
}

/** Provider schema narrows source selection; storage still revalidates every call. */
export function conversationActionTools(context) {
  return CONVERSATION_ACTION_TOOLS.flatMap(tool => {
    const ids = context.messages.filter(message => tool.function.name === 'prepare_case_suggestion' ? message.caseSuggestionEligible : message.answerDraftEligible).map(message => message.id);
    if (!ids.length) return [];
    const copy = structuredClone(tool);
    copy.function.parameters.properties.expectedVersion.enum = [context.expectedVersion];
    copy.function.parameters.properties.sourceConversationId.enum = [context.conversationId];
    copy.function.parameters.properties.sourceMessageId.enum = ids;
    return [copy];
  });
}

const valueMap = names => ({type:'object',additionalProperties:false,properties:Object.fromEntries(names.map(key => [key,{type:'object',additionalProperties:false,properties:{value:{type:'string'}},required:['value']}]))});
const sourceProperties = {expectedVersion:{type:'integer',minimum:1},sourceConversationId:{type:'string'},sourceMessageId:{type:'string'}};
export const CONVERSATION_ACTION_TOOLS = Object.freeze([
  {type:'function',function:{name:'prepare_case_suggestion',description:'Preview unconfirmed changes for the current case from a complete saved USER or assistant message, including the current saved user turn. Use caseSuggestionEligible, not answerDraftEligible. Include at least one factChanges or changes entry shaped as {value: string}; do not include an action argument. Read-only; a person must explicitly apply the preview. Never confirms facts or resolves issues.',parameters:{type:'object',additionalProperties:false,properties:{...sourceProperties,sourceMessageId:{type:'string',description:'Exact caseSuggestionEligible message ID. Complete saved user messages are valid fact sources; assistant-only draft restrictions do not apply.'},factChanges:valueMap(FIELDS),changes:valueMap(DOCUMENT_DETAIL_KEYS)},required:Object.keys(sourceProperties)}}},
  {type:'function',function:{name:'prepare_answer_draft',description:'Preview an unreviewed English draft from a complete already-saved assistant answer in the current conversation. No write; cannot save an answer still being generated or make a final document.',parameters:{type:'object',additionalProperties:false,properties:{...sourceProperties,sourceMessageId:{type:'string',description:'Exact answerDraftEligible assistant message ID. User messages are not eligible for this draft tool.'},kind:{type:'string',enum:DRAFT_TYPES}},required:[...Object.keys(sourceProperties),'kind']}}}
]);

/** Safe, bounded repair context for the specific read-only tool that failed.
 * Never picks a source or applies a change; all retries pass normal validation. */
export function conversationActionRepair(context, toolName, code) {
  if (!['CONVERSATION_ACTION_INVALID','CONVERSATION_ACTION_SOURCE_NOT_FOUND','CONVERSATION_ACTION_SOURCE_INCOMPLETE','DOCUMENT_ENGLISH_REQUIRED'].includes(code)) return null;
  const suggestion = toolName === 'prepare_case_suggestion';
  if (!suggestion && toolName !== 'prepare_answer_draft') return null;
  return {
    tool: toolName,
    reason: suggestion
      ? 'Use a complete saved user or assistant message as the fact source. Draft-only assistant eligibility does not apply. Supply at least one factChanges or changes entry as {value: string}; omit action and unknown fields. This repair hint is not a successful preview.'
      : 'Choose a complete English assistant answer with answerDraftEligible true. A user turn or bilingual/incomplete assistant answer cannot be an answer draft. Include a supported kind; omit action and unknown fields. This repair hint is not a successful preview.',
    expectedVersion: context.expectedVersion, sourceConversationId: context.conversationId,
    eligibleSourceMessageIds: context.messages.filter(message => suggestion ? message.caseSuggestionEligible : message.answerDraftEligible).map(message => message.id)
  };
}
