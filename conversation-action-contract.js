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

const valueMap = names => ({type:'object',additionalProperties:false,properties:Object.fromEntries(names.map(key => [key,{type:'object',additionalProperties:false,properties:{value:{type:'string'}},required:['value']}]))});
const sourceProperties = {expectedVersion:{type:'integer',minimum:1},sourceConversationId:{type:'string'},sourceMessageId:{type:'string'}};
export const CONVERSATION_ACTION_TOOLS = Object.freeze([
  {type:'function',function:{name:'prepare_case_suggestion',description:'Preview unconfirmed changes for the current case from a complete saved conversation message. Read-only; a person must explicitly apply the preview. Never confirms facts or resolves issues.',parameters:{type:'object',additionalProperties:false,properties:{...sourceProperties,factChanges:valueMap(FIELDS),changes:valueMap(DOCUMENT_DETAIL_KEYS)},required:Object.keys(sourceProperties)}}},
  {type:'function',function:{name:'prepare_answer_draft',description:'Preview an unreviewed English draft from a complete already-saved assistant answer in the current conversation. No write; cannot save an answer still being generated or make a final document.',parameters:{type:'object',additionalProperties:false,properties:{...sourceProperties,kind:{type:'string',enum:DRAFT_TYPES}},required:[...Object.keys(sourceProperties),'kind']}}}
]);
