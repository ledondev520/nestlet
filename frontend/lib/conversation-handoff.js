/** Explicit, account/case-scoped handoff. No prose is promoted to a confirmed fact. */
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
export const HANDOFF_LIMIT = 48000;
export function reviewableMessage(message) {
  return Boolean(uuid(message?.id) && ['user', 'assistant'].includes(message.role) && message.state === 'complete' && !message.localOnly && !message.streaming && typeof message.content === 'string' && message.content.trim() && message.content.length <= HANDOFF_LIMIT);
}
export function conversationHandoff(message, scope) {
  if (!reviewableMessage(message) || !(typeof scope?.userId === 'string' && scope.userId.length > 0 && scope.userId.length <= 128) || !uuid(scope?.caseId) || !uuid(scope?.conversationId)) return null;
  const display={};if(/^XX\d{8}$/u.test(message.displayId||''))display.messageDisplayId=message.displayId;if(/^DH\d{8}$/u.test(message.conversationDisplayId||''))display.conversationDisplayId=message.conversationDisplayId;
  return { ...display,id: crypto.randomUUID(), userId: scope.userId, caseId: scope.caseId, conversationId: scope.conversationId, messageId: message.id, role: message.role, content: message.content };
}
export function handoffMatches(request, userId, caseId) {
  return Boolean(uuid(request?.id) && request.userId === userId && request.caseId === caseId && uuid(caseId) && uuid(request.conversationId) && uuid(request.messageId) && ['user', 'assistant'].includes(request.role) && typeof request.content === 'string' && request.content.trim() && request.content.length <= HANDOFF_LIMIT);
}
export function conversationSource(request) {
  return [request.role === 'assistant' ? 'UNREVIEWED AI RESPONSE — not confirmed case facts.' : 'UNREVIEWED USER MESSAGE — facts still require explicit review.',
    `Conversation: ${request.conversationId}`, `Message: ${request.messageId}`, request.content].join('\n');
}
export function conversationDraft(message) {
  return ['DRAFT — UNREVIEWED CONVERSATION ANSWER', 'For human review only. Not an official form, agency approval, or verified statement of case facts.', '', message.content].join('\n');
}

const rejectedWriteCodes = new Set(['AUTH_REQUIRED', 'CSRF_REJECTED', 'ORIGIN_REJECTED', 'HTTPS_REQUIRED', 'OPERATOR_SETUP_REQUIRED', 'CASE_NOT_FOUND', 'CASE_CONFLICT', 'CASE_INVALID', 'CASE_TOO_LARGE', 'CASE_LIMIT_REACHED', 'ARTIFACT_INVALID', 'CAPACITY_REACHED', 'SENSITIVE_DATA', 'BODY_TOO_LARGE', 'INPUT_TOO_LARGE']);
/** A parsed, known 4xx rejection is different from a malformed/truncated 201. */
export const caseWriteDefinitelyRejected = error => rejectedWriteCodes.has(error?.code) && error.status >= 400 && error.status < 500;
