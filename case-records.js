/** Customer/case/conversation/artifact HTTP operations, always scoped to the authenticated identity. */
import { randomUUID } from 'node:crypto';
import { loadConversationAction } from './conversation-action-contract.js';
import { FIELDS } from './public/core.js';
import { mergeDocumentContext, assessDocumentReadiness, generateReviewedDocument } from './document-context.js';
export class CaseRecordsError extends Error {
  constructor(code, status = 400, details = undefined) { super(code); this.code = code; this.status = status; this.details = details; }
}
const fail = (code, status = 400, details) => { throw new CaseRecordsError(code, status, details); };
const UUID = '[0-9a-f-]{36}';
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const keys = (value, allowed, required = []) => {
  if (!plain(value) || Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(value, key))) fail('CASE_INVALID');
};
const payload = record => Object.fromEntries(['title','sourceText','fields','draftType','draftText','extractionMode','namesVerified','clientId','documentContext','caseIssues'].filter(key => Object.hasOwn(record,key)).map(key => [key,record[key]]));
const checkVersion = (record, expected) => {
  if (!Number.isSafeInteger(expected) || expected < 1) fail('CASE_INVALID');
  if (record.version !== expected) fail('CASE_CONFLICT',409);
};
function query(url, allowed) {
  if ([...url.searchParams.keys()].some(key => !allowed.includes(key)) || [...new Set(url.searchParams.keys())].some(key => url.searchParams.getAll(key).length !== 1)) fail('CASE_INVALID');
}
export function isCaseRecordsPath(path) {
  return path === '/api/conversations' || path === '/api/clients' || new RegExp(`^/api/clients/${UUID}(?:/(?:cases|artifacts))?$`).test(path) ||
    new RegExp(`^/api/cases/${UUID}/(?:readiness|document-context|issues|conversations|conversation-actions/prepare|conversation-reviews(?:/[0-9a-f-]{36}(?:/(?:reply|undo))?)?|artifacts(?:/generate)?)$`).test(path) ||
    new RegExp(`^/api/conversations/${UUID}$`).test(path) || new RegExp(`^/api/artifacts/${UUID}(?:/download)?$`).test(path);
}

export async function handleCaseRecords({ request, response, url, session, storage, readJson, json }) {
  const userId = session.userId, path = url.pathname, method = request.method;
  const ownCase = id => { const record = storage.getCase(userId,id); if (!record) fail('CASE_NOT_FOUND',404); return record; };
  const ownClient = id => { const record = storage.getClient(userId,id); if (!record) fail('CLIENT_NOT_FOUND',404); return record; };
  if (path === '/api/conversations' && method === 'GET') {
    query(url,[]);
    return json(200,{conversations:storage.listAccountConversations(userId)});
  }
  if (path === '/api/clients') {
    if (method === 'GET') {
      query(url,['search','limit']);
      const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : 50;
      return json(200,{clients:storage.listClients(userId,{search:url.searchParams.get('search') || '',limit})});
    }
    if (method === 'POST') {
      query(url,[]); const body = await readJson(request,4096); keys(body,['displayName'],['displayName']);
      return json(201,{client:storage.createClient(userId,body)});
    }
  }
  const clientRoute = new RegExp(`^/api/clients/(${UUID})(?:/(cases|artifacts))?$`).exec(path);
  if (clientRoute) {
    query(url,[]); const client = ownClient(clientRoute[1]);
    if (method === 'GET' && !clientRoute[2]) return json(200,{client});
    if (method === 'GET' && clientRoute[2] === 'cases') return json(200,{cases:storage.listClientCases(userId,client.id)});
    if (method === 'GET' && clientRoute[2] === 'artifacts') return json(200,{artifacts:storage.listClientArtifacts(userId,client.id)});
    if (method === 'PUT' && !clientRoute[2]) {
      const body = await readJson(request,4096); keys(body,['displayName','expectedVersion'],['displayName','expectedVersion']);
      const updated = storage.updateClient(userId,client.id,{displayName:body.displayName},body.expectedVersion);
      if (!updated) fail('CLIENT_NOT_FOUND',404);
      return json(200,{client:updated});
    }
  }
  const caseRoute = new RegExp(`^/api/cases/(${UUID})/(readiness|document-context|issues|conversations|conversation-actions/prepare|conversation-reviews(?:/[0-9a-f-]{36}(?:/(?:reply|undo))?)?|artifacts(?:/generate)?)$`).exec(path);
  if (caseRoute) {
    const record = ownCase(caseRoute[1]), action = caseRoute[2];
    if (action === 'readiness' && method === 'GET') {
      query(url,['kind','locale']);
      return json(200,assessDocumentReadiness(record,{kind:url.searchParams.get('kind') || record.draftType,locale:url.searchParams.get('locale') || 'zh'}));
    }
    query(url,[]);
    if (action === 'conversation-reviews' && method === 'POST') {
      return json(200,storage.conversationReviews.prepare(userId,record.id,await readJson(request,100000)));
    }
    const reviewRoute = /^conversation-reviews\/([0-9a-f-]{36})(?:\/(reply|undo))?$/.exec(action);
    if (reviewRoute) {
      if (!reviewRoute[2] && method === 'GET') return json(200,storage.conversationReviews.read(userId,record.id,reviewRoute[1]));
      if (reviewRoute[2] && method === 'POST') return json(200,storage.conversationReviews[reviewRoute[2]](userId,record.id,reviewRoute[1],await readJson(request,10000)));
    }
    if (action === 'conversation-actions/prepare' && method === 'POST') {
      const body = await readJson(request,100000);
      return json(200,{proposal:loadConversationAction(storage,userId,record,body)});
    }
    if (action === 'document-context' && method === 'PATCH') {
      let body = await readJson(request,100000);
      if (plain(body) && Object.hasOwn(body,'conversationAction')) {
        keys(body,['conversationAction'],['conversationAction']);
        const proposal = loadConversationAction(storage,userId,record,body.conversationAction);
        if (proposal.action !== 'prepare_case_suggestion') fail('CONVERSATION_ACTION_INVALID');
        if (proposal.conflicts.length) fail('DOCUMENT_CONTEXT_CONFLICT',409,{fields:proposal.conflicts});
        body = {changes:proposal.changes,factChanges:proposal.factChanges,confirm:false,expectedVersion:proposal.expectedVersion};
      }
      keys(body,['changes','factChanges','confirm','expectedVersion','namesVerified'],['confirm','expectedVersion']);
      if (typeof body.confirm !== 'boolean' || (body.namesVerified !== undefined && typeof body.namesVerified !== 'boolean')) fail('DOCUMENT_CONTEXT_INVALID');
      checkVersion(record,body.expectedVersion);
      const changes = body.changes ?? {}, factChanges = body.factChanges ?? {};
      if (!plain(changes) || !plain(factChanges) || Object.keys(factChanges).some(key => !FIELDS.includes(key))) fail('DOCUMENT_CONTEXT_INVALID');
      const normalizedChanges = Object.fromEntries(Object.entries(changes).map(([key,change]) => {
        if (!plain(change)) fail('DOCUMENT_CONTEXT_INVALID');
        return [key,{...change,source:change.source ?? (body.confirm ? 'Direct user answer' : 'Unconfirmed suggestion')}];
      }));
      const context = mergeDocumentContext(record.documentContext || {},normalizedChanges,{confirm:body.confirm,confirmedAt:body.confirm ? new Date().toISOString() : undefined,replaceConfirmed:body.confirm});
      const conflicts = [];
      if (!body.confirm) for (const [key,change] of Object.entries(changes)) {
        const old = record.documentContext?.[key];
        if (old?.confirmed && (!plain(change) || change.value !== old.value || (change.source !== undefined && change.source !== old.source) || (change.notApplicable !== undefined && change.notApplicable !== old.notApplicable))) conflicts.push(key);
      }
      const fields = FIELDS.map(key => ({...(record.fields.find(field => field.key === key) || {key,value:'',source:'',confirmed:false,conflict:false})}));
      for (const [key,change] of Object.entries(factChanges)) {
        keys(change,['value','source'],['value']);
        if (typeof change.value !== 'string' || change.value.length > 3000 || /[\u0000-\u001f\u007f\u2028\u2029]/u.test(change.value) || (change.source !== undefined && typeof change.source !== 'string')) fail('CASE_INVALID');
        const field = fields.find(item => item.key === key);
        if (!body.confirm && field.confirmed && (change.value !== field.value || (change.source !== undefined && change.source !== field.source))) { conflicts.push(key); continue; }
        if (change.value !== field.value) { delete field.sourceCell; delete field.sources; }
        Object.assign(field,{value:change.value,source:change.source ?? (body.confirm ? 'Direct user answer' : 'Unconfirmed suggestion'),confirmed:body.confirm,conflict:false,edited:true});
      }
      if (conflicts.length) fail('DOCUMENT_CONTEXT_CONFLICT',409,{fields:conflicts});
      if (!body.confirm && body.namesVerified === true && !record.namesVerified) fail('DOCUMENT_CONTEXT_INVALID');
      const updated = storage.updateCase(userId,record.id,{...payload(record),fields,documentContext:context,...(body.namesVerified === undefined ? {} : {namesVerified:body.namesVerified})},body.expectedVersion,{archiveLegacyDraft:true});
      if (!updated) fail('CASE_NOT_FOUND',404);
      return json(200,{case:updated,readiness:assessDocumentReadiness(updated),regenerationRecommended:true,archivedLegacyDraft:Boolean(record.draftText)});
    }
    if (action === 'issues' && method === 'PATCH') {
      const body = await readJson(request,100000); keys(body,['changes','expectedVersion'],['changes','expectedVersion']); checkVersion(record,body.expectedVersion);
      if (!Array.isArray(body.changes) || !body.changes.length || body.changes.length > 30) fail('CASE_INVALID');
      const issues = (record.caseIssues || []).map(item => ({...item})), seen = new Set();
      for (const change of body.changes) {
        keys(change,['id','question','status','resolution','sourceMessageId']);
        let existing;
        if (change.id !== undefined) {
          if (typeof change.id !== 'string' || seen.has(change.id)) fail('CASE_INVALID');
          seen.add(change.id); existing = issues.find(item => item.id === change.id);
          if (!existing) fail('CASE_ISSUE_NOT_FOUND',404);
        }
        const next = {...(existing || {id:randomUUID(),question:'',status:'pending',resolution:'',sourceMessageId:null}),...change,updatedAt:new Date().toISOString()};
        if (existing) Object.assign(existing,next); else issues.push(next);
      }
      const updated = storage.updateCase(userId,record.id,{...payload(record),caseIssues:issues},body.expectedVersion);
      if (!updated) fail('CASE_NOT_FOUND',404);
      return json(200,{case:updated});
    }
    if (action === 'conversations') {
      if (method === 'GET') return json(200,{conversations:storage.listConversations(userId,record.id)});
      if (method === 'POST') {
        const body = await readJson(request,4096); keys(body,['title']);
        const conversation = storage.createConversation(userId,record.id,body);
        if (!conversation) fail('CASE_NOT_FOUND',404);
        return json(201,{conversation});
      }
    }
    if (action === 'artifacts' && method === 'GET') return json(200,{artifacts:storage.listArtifacts(userId,record.id)});
    if (['artifacts','artifacts/generate'].includes(action) && method === 'POST') {
      const body = await readJson(request,220000);
      const generate = action.endsWith('/generate');
      if (!generate && plain(body) && Object.hasOwn(body,'conversationAction')) {
        keys(body,['conversationAction'],['conversationAction']);
        const artifact = storage.createConversationAnswerDraft(userId,record.id,body.conversationAction);
        if (!artifact) fail('CASE_NOT_FOUND',404);
        return json(201,{artifact});
      }
      keys(body,generate ? ['kind','title','status','expectedCaseVersion'] : ['kind','title','status','content','sourceConversationId','sourceMessageId','expectedCaseVersion'],['kind','status','expectedCaseVersion',...(generate ? [] : ['content'])]);
      checkVersion(record,body.expectedCaseVersion);
      if (!['draft','final'].includes(body.status)) fail('ARTIFACT_INVALID');
      const input = {...body};
      if (generate) { input.content = generateReviewedDocument(record,body.kind,{generatedAt:new Date().toISOString(),status:body.status}); }
      const artifact = storage.createArtifact(userId,record.id,input,{generationMethod:generate ? 'reviewed-template' : 'user-edited'});
      if (!artifact) fail('CASE_NOT_FOUND',404);
      return json(201,{artifact});
    }
  }
  const conversationRoute = new RegExp(`^/api/conversations/(${UUID})$`).exec(path);
  if (conversationRoute && method === 'GET') {
    query(url,[]); const conversation = storage.getConversation(userId,conversationRoute[1]);
    if (!conversation) fail('CONVERSATION_NOT_FOUND',404);
    return json(200,{conversation,messages:storage.listMessages(userId,conversation.id)});
  }
  const artifactRoute = new RegExp(`^/api/artifacts/(${UUID})(/download)?$`).exec(path);
  if (artifactRoute && method === 'GET') {
    query(url,[]); const artifact = storage.getArtifact(userId,artifactRoute[1]);
    if (!artifact) fail('ARTIFACT_NOT_FOUND',404);
    if (!artifactRoute[2]) return json(200,{artifact});
    if (artifact.status === 'final' && artifact.isStale) fail('ARTIFACT_STALE',409);
    response.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':`attachment; filename="${artifact.kind}-v${artifact.version}-${artifact.status}.txt"`});
    response.end(artifact.content); return;
  }
  fail('CASE_NOT_FOUND',404);
}
