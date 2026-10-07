/** Server-local, owner-scoped SQLite storage. Input text is untrusted; private asset bytes are stored separately; no provider keys are saved. */
import { DatabaseSync } from 'node:sqlite';
import { EMAIL_SCHEMA_SQL, createEmailAuthStorage } from './email-auth-storage.js';
import { ACCOUNT_ADMINISTRATION_SCHEMA_SQL, createAccountAdministrationStorage } from './account-administration-storage.js';
import { randomUUID } from 'node:crypto';
import { constants, closeSync, fchmodSync, fstatSync, lstatSync, mkdirSync, openSync } from 'node:fs';
import { dirname, parse, resolve, sep } from 'node:path';
import { FIELDS, DRAFT_TYPES, canDraft } from './public/core.js';
import { validateDocumentContext, validateFinalArtifact } from './document-context.js';
import { ASSET_LIMITS, ASSET_TYPES, assetFilename, assetAssociation, assetKeys, assetId, normalizeAssetSearch, assetFail } from './asset-domain.js';
import { TELEMETRY_LIMITS, CLIENT_EVENTS, SERVER_EVENTS, validateStoredTelemetryEvent, telemetryId } from './telemetry.js';

const SCHEMA_VERSION = 6;
const APPLICATION_ID = 0x4e53544c; // NSTL, distinct from unrelated SQLite files.
export const MAX_CASE_BYTES = 256 * 1024;
export const MAX_SOURCE_CHARS = 50_000;
export const MAX_CASES_PER_USER = 100;
export const MAX_TRIAL_USERS = 100;
export const LIBRARY_LIMITS = Object.freeze({ clientsPerUser: 100, conversationsPerCase: 10,
  messagesPerConversation: 100, messagesPerUser: 2000, userMessageChars: 8000, assistantMessageChars: 64000,
  artifactsPerCase: 50, artifactsPerUser: 500, artifactChars: 50000, libraryBytesPerUser: 16 * 1024 * 1024 });
const HASH_PATTERN = /^scrypt\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{43})$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export class StorageError extends Error {
  constructor(code, status = 400) { super(code); this.name = 'StorageError'; this.code = code; this.status = status; }
}
const fail = (code = 'CASE_INVALID', status = 400) => { throw new StorageError(code, status); };
const plain = value => value !== null && typeof value === 'object' &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
function keys(value, allowed, required = allowed) {
  if (!plain(value) || Object.keys(value).some(key => !allowed.includes(key)) ||
      required.some(key => !Object.hasOwn(value, key))) fail();
}
function text(value, max, { singleLine = false } = {}) {
  if (typeof value !== 'string') fail();
  if (value.length > max) fail('CASE_TOO_LARGE', 413);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value) ||
      (singleLine && /[\t\r\n\u2028\u2029]/u.test(value))) fail();
  return value;
}

export function normalizeUsername(username) {
  if (typeof username !== 'string' || username.length > 128 || /[^\x00-\x7f]/u.test(username)) fail('USER_INVALID');
  const normalized = username.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_.-]{2,63}$/u.test(normalized) || normalized === 'owner') fail('USER_INVALID');
  return normalized;
}
function validateHash(passwordHash) {
  const match = typeof passwordHash === 'string' && HASH_PATTERN.exec(passwordHash);
  // Reject noncanonical base64 variants as well as plaintext/unsupported hash formats.
  if (!match || Buffer.from(match[1], 'base64url').toString('base64url') !== match[1] ||
      Buffer.from(match[2], 'base64url').toString('base64url') !== match[2]) fail('USER_INVALID');
  return passwordHash;
}
function userId(id) { if (id !== 'owner' && (typeof id !== 'string' || !UUID.test(id))) fail('USER_INVALID'); return id; }
function caseId(id) { return typeof id === 'string' && UUID.test(id); }
function version(value) { if (!Number.isSafeInteger(value) || value < 1) fail(); return value; }

/** Canonical JSON only: no unknown keys, credential fields, buffers, or recursive structures. */
export function validateCasePayload(payload) {
  const allowed = ['title', 'sourceText', 'fields', 'draftType', 'draftText', 'extractionMode', 'namesVerified', 'clientId', 'documentContext', 'caseIssues'];
  keys(payload, allowed, ['title', 'sourceText', 'fields', 'draftType', 'draftText']);
  const title = text(payload.title, 120, { singleLine: true }).trim();
  if (!title) fail();
  const sourceText = text(payload.sourceText, MAX_SOURCE_CHARS);
  const draftText = text(payload.draftText, 50_000);
  if (!DRAFT_TYPES.includes(payload.draftType) || !Array.isArray(payload.fields) ||
      ![0, FIELDS.length].includes(payload.fields.length)) fail();
  const extractionMode = Object.hasOwn(payload, 'extractionMode') ? payload.extractionMode : 'manual';
  const namesVerified = Object.hasOwn(payload, 'namesVerified') ? payload.namesVerified : false;
  if (!['manual', 'live'].includes(extractionMode) || typeof namesVerified !== 'boolean') fail();
  const seen = new Set();
  const fields = Array.from(payload.fields, field => {
    keys(field, ['key', 'value', 'source', 'conflict', 'confirmed', 'sources', 'sourceCell', 'edited'],
      ['key', 'value', 'source', 'conflict', 'confirmed']);
    if (!FIELDS.includes(field.key) || seen.has(field.key) || typeof field.conflict !== 'boolean' ||
        typeof field.confirmed !== 'boolean' || (field.conflict && field.confirmed)) fail();
    seen.add(field.key);
    const result = { key: field.key, value: text(field.value, 3000, { singleLine: true }),
      source: text(field.source, MAX_SOURCE_CHARS), conflict: field.conflict, confirmed: field.confirmed };
    if (Object.hasOwn(field, 'edited')) {
      if (typeof field.edited !== 'boolean') fail();
      result.edited = field.edited;
    }
    if (Object.hasOwn(field, 'sources')) {
      if (!Array.isArray(field.sources) || field.sources.length > 20) fail();
      result.sources = Array.from(field.sources, source => text(source, 12_000));
    }
    if (Object.hasOwn(field, 'sourceCell')) {
      keys(field.sourceCell, ['sheet', 'row', 'column']);
      if (!Number.isSafeInteger(field.sourceCell.row) || field.sourceCell.row < 1 || field.sourceCell.row > 1_048_576 ||
          typeof field.sourceCell.column !== 'string' || !/^[A-Z]{1,3}$/u.test(field.sourceCell.column)) fail();
      result.sourceCell = { sheet: text(field.sourceCell.sheet, 100, { singleLine: true }),
        row: field.sourceCell.row, column: field.sourceCell.column };
    }
    return result;
  });
  fields.sort((left, right) => FIELDS.indexOf(left.key) - FIELDS.indexOf(right.key));
  // Persisting a draft cannot turn unresolved suggestions into a reviewed artifact.
  if (draftText && !canDraft(fields)) fail();
  const result = { title, sourceText, fields, draftType: payload.draftType, draftText, extractionMode, namesVerified };
  if (Object.hasOwn(payload, 'clientId')) {
    if (payload.clientId !== null && !caseId(payload.clientId)) fail();
    result.clientId = payload.clientId;
  }
  if (Object.hasOwn(payload, 'documentContext')) result.documentContext = validateDocumentContext(payload.documentContext);
  if (Object.hasOwn(payload, 'caseIssues')) {
    if (!Array.isArray(payload.caseIssues) || payload.caseIssues.length > 30) fail();
    const issueIds = new Set();
    result.caseIssues = payload.caseIssues.map(issue => {
      keys(issue, ['id','question','status','resolution','sourceMessageId','updatedAt'], ['id','question','status','resolution','updatedAt']);
      if (!caseId(issue.id) || issueIds.has(issue.id) || !['pending','confirmed','resolved'].includes(issue.status)) fail();
      issueIds.add(issue.id);
      const question = text(issue.question, 500).trim(), resolution = text(issue.resolution, 2000).trim();
      if (!question || (issue.status === 'resolved' && !resolution)) fail();
      const sourceMessageId = issue.sourceMessageId ?? null;
      if (sourceMessageId !== null && !caseId(sourceMessageId)) fail();
      if (typeof issue.updatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(issue.updatedAt)) fail();
      const at = new Date(issue.updatedAt);
      if (!Number.isFinite(at.valueOf()) || at.toISOString() !== (issue.updatedAt.includes('.') ? issue.updatedAt : issue.updatedAt.replace('Z','.000Z'))) fail();
      return { id: issue.id, question, status: issue.status, resolution, sourceMessageId, updatedAt: at.toISOString() };
    });
  }
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_CASE_BYTES) fail('CASE_TOO_LARGE', 413);
  return result;
}

function entityKeys(value, allowed, required, errorCode) {
  if (!plain(value) || Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(value, key))) fail(errorCode);
}
function entityText(value, maximum, errorCode, singleLine = false) {
  try { return text(value, maximum, { singleLine }); }
  catch (error) { if (error instanceof StorageError) fail(errorCode); throw error; }
}
function clientPayload(payload) {
  entityKeys(payload, ['displayName'], ['displayName'], 'CLIENT_INVALID');
  const displayName = entityText(payload.displayName, 120, 'CLIENT_INVALID', true).trim();
  if (!displayName) fail('CLIENT_INVALID');
  return { displayName };
}

function conversationPayload(payload) {
  entityKeys(payload, ['title'], [], 'CONVERSATION_INVALID');
  const title = entityText(payload.title ?? 'Conversation', 120, 'CONVERSATION_INVALID', true).trim();
  if (!title) fail('CONVERSATION_INVALID');
  return { title };
}
function messagePayload(payload) {
  entityKeys(payload, ['role','content','state','requestId','clientMessageId','imageMetadata'], ['role','content','state'], 'MESSAGE_INVALID');
  if (!['user','assistant'].includes(payload.role) || !['complete','interrupted','failed'].includes(payload.state) || (payload.role === 'user' && payload.state !== 'complete')) fail('MESSAGE_INVALID');
  const content = entityText(payload.content, payload.role === 'user' ? LIBRARY_LIMITS.userMessageChars : LIBRARY_LIMITS.assistantMessageChars, 'MESSAGE_INVALID');
  if (/data:\s*image\/[^,\r\n]*;base64\s*,/iu.test(content)) fail('MESSAGE_INVALID');
  const requestId = payload.requestId ?? null, clientMessageId = payload.clientMessageId ?? null;
  if ((requestId !== null && !caseId(requestId)) || (clientMessageId !== null && (!caseId(clientMessageId) || payload.role !== 'user'))) fail('MESSAGE_INVALID');
  const images = payload.imageMetadata ?? [];
  if (!Array.isArray(images) || images.length > 2 || (images.length && payload.role !== 'user')) fail('MESSAGE_INVALID');
  const imageMetadata = images.map(image => {
    entityKeys(image, ['mimeType','byteCount','retained'], ['mimeType','byteCount','retained'], 'MESSAGE_INVALID');
    if (!['image/png','image/jpeg'].includes(image.mimeType) || !Number.isSafeInteger(image.byteCount) || image.byteCount < 1 || image.byteCount > 2 * 1024 * 1024 || image.retained !== false) fail('MESSAGE_INVALID');
    return { mimeType:image.mimeType, byteCount:image.byteCount, retained:false };
  });
  if (payload.state === 'complete' && !content.trim() && !imageMetadata.length) fail('MESSAGE_INVALID');
  return { role:payload.role, content, state:payload.state, requestId, clientMessageId, imageMetadata };
}

function artifactPayload(payload, options) {
  entityKeys(payload, ['kind','title','status','content','sourceConversationId','sourceMessageId','expectedCaseVersion'], ['kind','status','content','expectedCaseVersion'], 'ARTIFACT_INVALID');
  entityKeys(options, ['generationMethod'], [], 'ARTIFACT_INVALID');
  if (!DRAFT_TYPES.includes(payload.kind) || !['draft','final'].includes(payload.status) || !Number.isSafeInteger(payload.expectedCaseVersion) || payload.expectedCaseVersion < 1) fail('ARTIFACT_INVALID');
  const title = entityText(payload.title ?? payload.kind, 120, 'ARTIFACT_INVALID', true).trim();
  const content = entityText(payload.content, LIBRARY_LIMITS.artifactChars, 'ARTIFACT_INVALID');
  if (!title || !content.trim() || /data:\s*image\/[^,\r\n]*;base64\s*,/iu.test(content)) fail('ARTIFACT_INVALID');
  const sourceConversationId = payload.sourceConversationId ?? null, sourceMessageId = payload.sourceMessageId ?? null;
  if ((sourceConversationId !== null && !caseId(sourceConversationId)) || (sourceMessageId !== null && !caseId(sourceMessageId))) fail('ARTIFACT_INVALID');
  const generationMethod = options.generationMethod ?? 'user-edited';
  if (!['user-edited','reviewed-template'].includes(generationMethod)) fail('ARTIFACT_INVALID');
  return { kind:payload.kind,title,status:payload.status,content,sourceConversationId,sourceMessageId,expectedCaseVersion:payload.expectedCaseVersion,generationMethod };
}

function prepareFile(filename) {
  if (typeof filename !== 'string' || !filename.trim() || filename === ':memory:' || filename.includes('\0')) fail('STORAGE_PATH_INVALID', 500);
  const path = resolve(filename);
  const directory = dirname(path);
  const effectiveUid = process.geteuid?.() ?? process.getuid?.();
  const owned = info => effectiveUid === undefined || info.uid === effectiveUid;
  const trustedDirectory = (candidate, info) => {
    const stickyRootAncestor = candidate !== directory && info.uid === 0 && Boolean(info.mode & 0o1000);
    if (!info.isDirectory() || (effectiveUid !== undefined && !owned(info) && info.uid !== 0) ||
        ((info.mode & 0o022) && !stickyRootAncestor)) fail('STORAGE_PATH_INVALID', 500);
  };
  // A configured path is never accepted through symlinks. Existing directory permissions are not silently changed.
  const root = parse(directory).root;
  let ancestor = root;
  trustedDirectory(root, lstatSync(root));
  for (const component of directory.slice(root.length).split(sep).filter(Boolean)) {
    ancestor = resolve(ancestor, component);
    try { trustedDirectory(ancestor, lstatSync(ancestor)); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      try { mkdirSync(ancestor, { mode: 0o700 }); }
      catch (mkdirError) { if (mkdirError.code !== 'EEXIST' || !lstatSync(ancestor).isDirectory()) throw mkdirError; }
      trustedDirectory(ancestor, lstatSync(ancestor));
    }
  }
  const directoryInfo = lstatSync(directory);
  if ((directoryInfo.mode & 0o777) !== 0o700 || !owned(directoryInfo)) fail('STORAGE_PATH_INVALID', 500);
  const privateFile = info => info.isFile() && info.nlink === 1 && (info.mode & 0o777) === 0o600 && owned(info);
  for (const candidate of [path, path + '-journal', path + '-wal', path + '-shm']) {
    try { if (!privateFile(lstatSync(candidate))) fail('STORAGE_PATH_INVALID', 500); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  let fd;
  let created = false;
  try { fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW, 0o600); created = true; }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    fd = openSync(path, constants.O_RDWR | constants.O_NOFOLLOW);
  }
  try {
    if (created) fchmodSync(fd, 0o600);
    if (!privateFile(fstatSync(fd))) fail('STORAGE_PATH_INVALID', 500);
  } finally { closeSync(fd); }
  return path;
}

/** Server-only interface. Lookup methods return hashes for authentication; never send those objects over HTTP. */
export function openStorage({ filename, reservedUsername = process.env.NESTLET_OPERATOR_USERNAME || 'owner' } = {}) {
  const reservedAlias = typeof reservedUsername === 'string' && /^[\x00-\x7f]*$/u.test(reservedUsername) ? reservedUsername.trim().toLowerCase() : null;
  const path = prepareFile(filename);
  const db = new DatabaseSync(path, { enableForeignKeyConstraints: true, enableDoubleQuotedStringLiterals: false,
    allowExtension: false, timeout: 5000 });
  let closed = false;
  const transaction = action => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = action(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  try {
    const validateSchemaIdentity = () => {
      const currentVersion = db.prepare('PRAGMA user_version').get().user_version;
      const applicationId = db.prepare('PRAGMA application_id').get().application_id;
      if (currentVersion > SCHEMA_VERSION || currentVersion < 0 ||
          (applicationId !== 0 && applicationId !== APPLICATION_ID) ||
          (currentVersion > 0 && applicationId !== APPLICATION_ID)) fail('STORAGE_VERSION_UNSUPPORTED', 500);
      if (currentVersion === 0 && db.prepare("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").get())
        fail('STORAGE_VERSION_UNSUPPORTED', 500);
      return currentVersion;
    };
    // Identity is checked before any persistent PRAGMA or migration, including for unrelated private files.
    transaction(validateSchemaIdentity);
    db.exec('PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL; PRAGMA trusted_schema = OFF; PRAGMA secure_delete = ON;');
    transaction(() => {
      // Recheck under the write lock, so simultaneous initial server/CLI opens cannot race a migration.
      const currentVersion = validateSchemaIdentity();
      if (currentVersion === 0) {
        db.exec(`CREATE TABLE users (
          id TEXT PRIMARY KEY NOT NULL,
          username TEXT NOT NULL UNIQUE,
          role TEXT NOT NULL CHECK (role IN ('owner', 'trial')),
          password_hash TEXT,
          created_at TEXT NOT NULL,
          CHECK ((role = 'owner' AND id = 'owner' AND username = 'owner' AND password_hash IS NULL) OR
            (role = 'trial' AND id != 'owner' AND username != 'owner' AND password_hash IS NOT NULL))
        ) STRICT;
        CREATE TABLE cases (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id),
          title TEXT NOT NULL,
          payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
          version INTEGER NOT NULL CHECK (version > 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;
        CREATE INDEX cases_by_owner_updated ON cases(user_id, updated_at DESC, id);
        PRAGMA application_id = ${APPLICATION_ID};
        PRAGMA user_version = 1;`);
      }
      if (currentVersion < 2) {
        db.exec(`CREATE TABLE telemetry_workflows (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id),
          case_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;
        CREATE INDEX telemetry_workflows_owner_updated ON telemetry_workflows(user_id, updated_at, id);
        CREATE INDEX telemetry_workflows_case ON telemetry_workflows(case_id, user_id);
        CREATE TABLE telemetry_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          workflow_id TEXT NOT NULL REFERENCES telemetry_workflows(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id),
          request_id TEXT,
          source TEXT NOT NULL CHECK(source IN ('server','client')),
          event_name TEXT NOT NULL CHECK(event_name IN (${[...CLIENT_EVENTS, ...SERVER_EVENTS].map(name => "'" + name + "'").join(',')})),
          outcome TEXT NOT NULL CHECK(outcome IN ('success','failure')),
          http_status INTEGER CHECK(http_status IS NULL OR http_status BETWEEN 100 AND 599),
          error_code TEXT,
          server_elapsed_ms INTEGER CHECK(server_elapsed_ms IS NULL OR server_elapsed_ms BETWEEN 0 AND 300000),
          client_active_ms INTEGER CHECK(client_active_ms IS NULL OR client_active_ms BETWEEN 0 AND 86400000),
          client_wait_ms INTEGER CHECK(client_wait_ms IS NULL OR client_wait_ms BETWEEN 0 AND 300000),
          created_at TEXT NOT NULL
        ) STRICT;
        CREATE INDEX telemetry_events_owner_id ON telemetry_events(user_id, id);
        CREATE INDEX telemetry_events_workflow_id ON telemetry_events(workflow_id, id);
        CREATE INDEX telemetry_events_created ON telemetry_events(created_at);
        CREATE UNIQUE INDEX telemetry_server_request_id ON telemetry_events(request_id) WHERE source='server';
        PRAGMA user_version = 2;`);
      }
      if (currentVersion < 3) {
        // Rebuild only the operational-event table to widen its fixed event enum.
        // Explicit columns/IDs and the old AUTOINCREMENT high-water are preserved.
        const eventColumns = ['id','workflow_id','user_id','request_id','source','event_name','outcome','http_status','error_code','server_elapsed_ms','client_active_ms','client_wait_ms','created_at'];
        const observedColumns = db.prepare('PRAGMA table_info(telemetry_events)').all().map(column => column.name);
        if (JSON.stringify(observedColumns) !== JSON.stringify(eventColumns)) fail('STORAGE_VERSION_UNSUPPORTED',500);
        const oldSequence = db.prepare("SELECT seq FROM sqlite_sequence WHERE name='telemetry_events'").get()?.seq ?? 0;
        if (!Number.isSafeInteger(oldSequence) || oldSequence < 0) fail('STORAGE_VERSION_UNSUPPORTED',500);
        db.exec(`ALTER TABLE telemetry_events RENAME TO telemetry_events_schema2;
        CREATE TABLE telemetry_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          workflow_id TEXT NOT NULL REFERENCES telemetry_workflows(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id),
          request_id TEXT,
          source TEXT NOT NULL CHECK(source IN ('server','client')),
          event_name TEXT NOT NULL CHECK(event_name IN (${[...new Set([...CLIENT_EVENTS,...SERVER_EVENTS,'request.chat'])].map(name => "'"+name+"'").join(',')})),
          outcome TEXT NOT NULL CHECK(outcome IN ('success','failure')),
          http_status INTEGER CHECK(http_status IS NULL OR http_status BETWEEN 100 AND 599),
          error_code TEXT,
          server_elapsed_ms INTEGER CHECK(server_elapsed_ms IS NULL OR server_elapsed_ms BETWEEN 0 AND 300000),
          client_active_ms INTEGER CHECK(client_active_ms IS NULL OR client_active_ms BETWEEN 0 AND 86400000),
          client_wait_ms INTEGER CHECK(client_wait_ms IS NULL OR client_wait_ms BETWEEN 0 AND 300000),
          created_at TEXT NOT NULL
        ) STRICT;
        INSERT INTO telemetry_events(${eventColumns.join(',')}) SELECT ${eventColumns.join(',')} FROM telemetry_events_schema2;
        DROP TABLE telemetry_events_schema2;
        CREATE INDEX telemetry_events_owner_id ON telemetry_events(user_id,id);
        CREATE INDEX telemetry_events_workflow_id ON telemetry_events(workflow_id,id);
        CREATE INDEX telemetry_events_created ON telemetry_events(created_at);
        CREATE UNIQUE INDEX telemetry_server_request_id ON telemetry_events(request_id) WHERE source='server';`);
        const newSequence = db.prepare("SELECT seq FROM sqlite_sequence WHERE name='telemetry_events'").get()?.seq ?? 0;
        const sequence = Math.max(oldSequence,newSequence);
        if (!db.prepare("UPDATE sqlite_sequence SET seq=? WHERE name='telemetry_events'").run(sequence).changes)
          db.prepare('INSERT INTO sqlite_sequence(name,seq) VALUES(?,?)').run('telemetry_events',sequence);
        db.exec(`CREATE TABLE clients (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id),
          display_name TEXT NOT NULL,
          version INTEGER NOT NULL CHECK(version > 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(user_id, id)
        ) STRICT;
        CREATE INDEX clients_owner_name ON clients(user_id, display_name COLLATE NOCASE, id);
        ALTER TABLE cases ADD COLUMN client_id TEXT REFERENCES clients(id);
        CREATE INDEX cases_owner_client ON cases(user_id, client_id, updated_at, id);
        CREATE UNIQUE INDEX cases_owner_identity ON cases(user_id, id);
        CREATE TRIGGER cases_client_owner_insert BEFORE INSERT ON cases WHEN NEW.client_id IS NOT NULL
          AND NOT EXISTS(SELECT 1 FROM clients WHERE id=NEW.client_id AND user_id=NEW.user_id)
          BEGIN SELECT RAISE(ABORT, 'Invalid case customer association'); END;
        CREATE TRIGGER cases_client_owner_update BEFORE UPDATE OF client_id,user_id ON cases WHEN NEW.client_id IS NOT NULL
          AND NOT EXISTS(SELECT 1 FROM clients WHERE id=NEW.client_id AND user_id=NEW.user_id)
          BEGIN SELECT RAISE(ABORT, 'Invalid case customer association'); END;
        CREATE TABLE conversations (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id),
          case_id TEXT NOT NULL,
          title TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(user_id, id),
          FOREIGN KEY(user_id,case_id) REFERENCES cases(user_id,id) ON DELETE CASCADE
        ) STRICT;
        CREATE INDEX conversations_owner_case ON conversations(user_id,case_id,updated_at,id);
        CREATE TABLE messages (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id),
          conversation_id TEXT NOT NULL,
          sequence INTEGER NOT NULL CHECK(sequence > 0),
          role TEXT NOT NULL CHECK(role IN ('user','assistant')),
          content TEXT NOT NULL,
          state TEXT NOT NULL CHECK(state IN ('complete','interrupted','failed')),
          request_id TEXT,
          client_message_id TEXT,
          image_metadata_json TEXT NOT NULL CHECK(json_valid(image_metadata_json)),
          created_at TEXT NOT NULL,
          UNIQUE(conversation_id,sequence),
          FOREIGN KEY(user_id,conversation_id) REFERENCES conversations(user_id,id) ON DELETE CASCADE
        ) STRICT;
        CREATE INDEX messages_owner_conversation ON messages(user_id,conversation_id,sequence);
        CREATE UNIQUE INDEX messages_user_turn ON messages(user_id,client_message_id) WHERE role='user' AND client_message_id IS NOT NULL;
        CREATE UNIQUE INDEX messages_user_request ON messages(user_id,request_id) WHERE role='user' AND request_id IS NOT NULL;
        CREATE UNIQUE INDEX messages_assistant_request ON messages(user_id,request_id) WHERE role='assistant' AND request_id IS NOT NULL;
        CREATE TRIGGER immutable_message_update BEFORE UPDATE ON messages BEGIN SELECT RAISE(ABORT, 'Messages are immutable'); END;
        CREATE TABLE artifacts (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id),
          case_id TEXT NOT NULL,
          kind TEXT NOT NULL CHECK(kind IN ('followup','missing-documents','status-summary')),
          title TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('draft','final')),
          content TEXT NOT NULL,
          version INTEGER NOT NULL CHECK(version > 0),
          source_case_version INTEGER NOT NULL CHECK(source_case_version > 0),
          source_conversation_id TEXT REFERENCES conversations(id),
          source_message_id TEXT REFERENCES messages(id),
          snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
          created_at TEXT NOT NULL,
          UNIQUE(user_id,case_id,kind,version),
          FOREIGN KEY(user_id,case_id) REFERENCES cases(user_id,id) ON DELETE CASCADE
        ) STRICT;
        CREATE INDEX artifacts_owner_case ON artifacts(user_id,case_id,created_at,id);
        CREATE TRIGGER immutable_artifact_update BEFORE UPDATE ON artifacts BEGIN SELECT RAISE(ABORT, 'Artifacts are immutable'); END;
        PRAGMA user_version = 3;`);
      }
      if (currentVersion < 4) {
        db.exec(`CREATE TABLE assets (
          id TEXT PRIMARY KEY NOT NULL,
          owner_user_id TEXT NOT NULL REFERENCES users(id),
          case_id TEXT REFERENCES cases(id) ON DELETE SET NULL,
          client_id TEXT REFERENCES clients(id),
          original_filename TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size_bytes INTEGER NOT NULL CHECK(size_bytes > 0 AND size_bytes <= ${ASSET_LIMITS.fileBytes}),
          sha256 TEXT NOT NULL CHECK(length(sha256)=64),
          extracted_text TEXT NOT NULL,
          search_text TEXT NOT NULL,
          text_status TEXT NOT NULL CHECK(text_status IN ('ready','unavailable')),
          text_truncated INTEGER NOT NULL CHECK(text_truncated IN (0,1)),
          preview_kind TEXT NOT NULL CHECK(preview_kind IN ('pdf','image','text')),
          warnings_json TEXT NOT NULL CHECK(json_valid(warnings_json)),
          version INTEGER NOT NULL CHECK(version > 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(owner_user_id,id)
        ) STRICT;
        CREATE INDEX assets_owner_created ON assets(owner_user_id,created_at DESC,id);
        CREATE INDEX assets_owner_case ON assets(owner_user_id,case_id,created_at DESC,id);
        CREATE INDEX assets_owner_client ON assets(owner_user_id,client_id,created_at DESC,id);
        CREATE TRIGGER assets_owner_insert BEFORE INSERT ON assets
          WHEN (NEW.case_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM cases WHERE id=NEW.case_id AND user_id=NEW.owner_user_id AND client_id IS NEW.client_id))
          OR (NEW.client_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM clients WHERE id=NEW.client_id AND user_id=NEW.owner_user_id))
          BEGIN SELECT RAISE(ABORT,'Invalid private asset association'); END;
        CREATE TRIGGER assets_owner_update BEFORE UPDATE OF owner_user_id,case_id,client_id ON assets
          WHEN NEW.owner_user_id != OLD.owner_user_id
          OR (NEW.case_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM cases WHERE id=NEW.case_id AND user_id=NEW.owner_user_id AND client_id IS NEW.client_id))
          OR (NEW.client_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM clients WHERE id=NEW.client_id AND user_id=NEW.owner_user_id))
          BEGIN SELECT RAISE(ABORT,'Invalid private asset association'); END;
        CREATE TRIGGER assets_immutable_content BEFORE UPDATE OF id,original_filename,mime_type,size_bytes,sha256,extracted_text,search_text,text_status,text_truncated,preview_kind,warnings_json,created_at ON assets
          BEGIN SELECT RAISE(ABORT,'Original assets are immutable'); END;
        CREATE TRIGGER assets_follow_case_customer AFTER UPDATE OF client_id ON cases WHEN NEW.client_id IS NOT OLD.client_id
          BEGIN UPDATE assets SET client_id=NEW.client_id,version=version+1,updated_at=NEW.updated_at WHERE case_id=NEW.id AND owner_user_id=NEW.user_id; END;
        CREATE TRIGGER assets_preserve_case_delete BEFORE DELETE ON cases
          BEGIN UPDATE assets SET case_id=NULL,version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE case_id=OLD.id AND owner_user_id=OLD.user_id; END;
        PRAGMA user_version = 4;`);
      }
      if (currentVersion < 5) db.exec(EMAIL_SCHEMA_SQL);
      if (currentVersion < 6) db.exec(ACCOUNT_ADMINISTRATION_SCHEMA_SQL);
      db.prepare("INSERT INTO users(id, username, role, password_hash, created_at) VALUES('owner', 'owner', 'owner', NULL, ?) ON CONFLICT(id) DO NOTHING").run(new Date().toISOString());
    });
    const userLookup = db.prepare('SELECT id, username, role, password_hash AS passwordHash, created_at AS createdAt FROM users WHERE id = ?');
    const nameLookup = db.prepare('SELECT id, username, role, password_hash AS passwordHash, created_at AS createdAt FROM users WHERE username = ?');
    const lookup = db.prepare('SELECT id, title, client_id AS clientId, payload_json AS payloadJson, version, created_at AS createdAt, updated_at AS updatedAt FROM cases WHERE user_id = ? AND id = ?');
    const clientLookup = db.prepare('SELECT id,display_name AS displayName,version,created_at AS createdAt,updated_at AS updatedAt FROM clients WHERE user_id=? AND id=?');
    const requireUser = id => { userId(id); if (!userLookup.get(id)) fail('USER_INVALID'); };
    const assetColumns = `id,case_id AS caseId,client_id AS clientId,original_filename AS originalFilename,mime_type AS mimeType,size_bytes AS sizeBytes,sha256,text_status AS textStatus,text_truncated AS textTruncated,preview_kind AS previewKind,warnings_json AS warningsJson,version,created_at AS createdAt,updated_at AS updatedAt`;
    const assetMetadata = row => { if(!row)return null;const {warningsJson,...rest}=row;return {...rest,textTruncated:Boolean(rest.textTruncated),warnings:JSON.parse(warningsJson)}; };
    const assetLookup = db.prepare(`SELECT ${assetColumns} FROM assets WHERE owner_user_id=? AND id=?`);
    const assetUsage = id => ({...db.prepare('SELECT COUNT(*) AS count,COALESCE(SUM(size_bytes),0) AS bytes FROM assets WHERE owner_user_id=?').get(id)});
    function assetLinks(id,links) {
      assetAssociation(links);
      const caseId=links.caseId??null;let clientId=links.clientId??null;
      if(caseId){const record=lookup.get(id,caseId);if(!record)assetFail('CASE_NOT_FOUND',404);if(Object.hasOwn(links,'clientId')&&clientId!==record.clientId)assetFail('ASSET_ASSOCIATION_MISMATCH');clientId=record.clientId;}
      if(clientId&&!clientLookup.get(id,clientId))assetFail('CLIENT_NOT_FOUND',404);
      return {caseId,clientId};
    }
    const publicUser = row => ({ id: row.id, username: row.username, role: row.role, createdAt: row.createdAt });
    const fullCase = row => row ? { ...JSON.parse(row.payloadJson), id: row.id, clientId: row.clientId, version: row.version, createdAt: row.createdAt, updatedAt: row.updatedAt } : null;
    const messageSource = (id, messageId) => db.prepare('SELECT m.id,m.state,m.role,m.conversation_id AS conversationId,c.case_id AS caseId FROM messages m JOIN conversations c ON c.id=m.conversation_id AND c.user_id=m.user_id WHERE m.user_id=? AND m.id=?').get(id,messageId);
    const validateCaseLinks = (id, recordId, canonical, clientId) => {
      if (clientId !== null && !clientLookup.get(id,clientId)) fail('CLIENT_NOT_FOUND',404);
      const references = [...Object.values(canonical.documentContext ?? {}).map(detail => detail.sourceMessageId), ...(canonical.caseIssues ?? []).map(issue => issue.sourceMessageId)].filter(Boolean);
      for (const sourceId of references) {
        const source = messageSource(id,sourceId);
        if (!source || source.caseId !== recordId) fail('DOCUMENT_DETAILS_INVALID');
      }
    };
    const storedCaseJson = canonical => {
      const stored = { ...canonical };
      delete stored.clientId;
      return JSON.stringify(stored);
    };
    const conversationLookup = db.prepare('SELECT id,case_id AS caseId,title,created_at AS createdAt,updated_at AS updatedAt FROM conversations WHERE user_id=? AND id=?');
    const messageColumns = 'id,conversation_id AS conversationId,role,content,state,request_id AS requestId,client_message_id AS clientMessageId,image_metadata_json AS imageMetadataJson,created_at AS createdAt';
    const fullMessage = row => {
      if (!row) return null;
      const { imageMetadataJson, ...result } = row;
      return { ...result, imageMetadata:JSON.parse(imageMetadataJson) };
    };
    const outstandingTurns = id => db.prepare("SELECT m.conversation_id AS conversationId,m.request_id AS requestId FROM messages m WHERE m.user_id=? AND m.role='user' AND m.request_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM messages a WHERE a.user_id=m.user_id AND a.conversation_id=m.conversation_id AND a.role='assistant' AND a.request_id=m.request_id)").all(id);
    const reservedAnswerBytes = LIBRARY_LIMITS.assistantMessageChars * 4 + 2;
    const checkLibraryBytes = (id, extra, pending = outstandingTurns(id), reservationDelta = 0) => {
      const row = db.prepare('SELECT (SELECT COALESCE(SUM(length(CAST(content AS BLOB))+length(CAST(image_metadata_json AS BLOB))),0) FROM messages WHERE user_id=?) + (SELECT COALESCE(SUM(length(CAST(content AS BLOB))+length(CAST(snapshot_json AS BLOB))),0) FROM artifacts WHERE user_id=?) AS bytes').get(id,id);
      if (row.bytes + extra + (pending.length + reservationDelta) * reservedAnswerBytes > LIBRARY_LIMITS.libraryBytesPerUser) fail('CAPACITY_REACHED',409);
    };
    const artifactColumns = 'id,case_id AS caseId,kind,title,status,version,source_case_version AS sourceCaseVersion,source_conversation_id AS sourceConversationId,source_message_id AS sourceMessageId,created_at AS createdAt,(SELECT version FROM cases WHERE cases.id=artifacts.case_id AND cases.user_id=artifacts.user_id) AS currentCaseVersion';
    const artifactLookup = db.prepare(`SELECT ${artifactColumns},content,snapshot_json AS snapshotJson FROM artifacts WHERE user_id=? AND id=?`);
    const artifactMetadata = row => ({ ...row,isStale:row.sourceCaseVersion !== row.currentCaseVersion,needsRegeneration:row.status === 'final' && row.sourceCaseVersion !== row.currentCaseVersion });
    const fullArtifact = row => { if (!row) return null; const {snapshotJson,...result}=row; return {...artifactMetadata(result),provenance:JSON.parse(snapshotJson)}; };
    const insertArtifact = (id, recordId, canonical) => {
      requireUser(id);
      const record = caseId(recordId) && fullCase(lookup.get(id,recordId));
      if (!record) return null;
      if (record.version !== canonical.expectedCaseVersion) fail('CASE_CONFLICT',409);
      let sourceConversationId = canonical.sourceConversationId;
      if (sourceConversationId) {
        const conversation = conversationLookup.get(id,sourceConversationId);
        if (!conversation || conversation.caseId !== recordId) fail('ARTIFACT_INVALID');
      }
      if (canonical.sourceMessageId) {
        const source = messageSource(id,canonical.sourceMessageId);
        if (!source || source.caseId !== recordId || (sourceConversationId && source.conversationId !== sourceConversationId)) fail('ARTIFACT_INVALID');
        sourceConversationId = source.conversationId;
        if (canonical.status === 'final' && source.state !== 'complete') fail('ARTIFACT_SOURCE_INCOMPLETE',409);
      }
      if (canonical.status === 'final') {
        const confirmedSources = [...Object.values(record.documentContext ?? {}).filter(detail => detail.confirmed).map(detail => detail.sourceMessageId),
          ...(record.caseIssues ?? []).filter(issue => issue.status !== 'pending').map(issue => issue.sourceMessageId)].filter(Boolean);
        for (const messageId of confirmedSources) {
          const source = messageSource(id,messageId);
          if (!source || source.caseId !== recordId || source.state !== 'complete') fail('ARTIFACT_SOURCE_INCOMPLETE',409);
        }
        validateFinalArtifact(record,canonical.content,{kind:canonical.kind});
      }
      if (db.prepare('SELECT COUNT(*) AS count FROM artifacts WHERE user_id=? AND case_id=?').get(id,recordId).count >= LIBRARY_LIMITS.artifactsPerCase ||
          db.prepare('SELECT COUNT(*) AS count FROM artifacts WHERE user_id=?').get(id).count >= LIBRARY_LIMITS.artifactsPerUser) fail('CAPACITY_REACHED',409);
      const provenance = { caseId:recordId,caseVersion:record.version,clientId:record.clientId,
        clientDisplayName:record.clientId ? clientLookup.get(id,record.clientId).displayName : null,
        title:record.title,fields:record.fields,documentContext:record.documentContext ?? {},caseIssues:record.caseIssues ?? [],generationMethod:canonical.generationMethod };
      const snapshot = JSON.stringify(provenance);
      if (Buffer.byteLength(snapshot,'utf8') > MAX_CASE_BYTES + 1024) fail('ARTIFACT_INVALID');
      checkLibraryBytes(id,Buffer.byteLength(canonical.content,'utf8') + Buffer.byteLength(snapshot,'utf8'));
      const artifactId = randomUUID(), now = new Date().toISOString();
      const next = db.prepare('SELECT COALESCE(MAX(version),0)+1 AS next FROM artifacts WHERE user_id=? AND case_id=? AND kind=?').get(id,recordId,canonical.kind).next;
      db.prepare('INSERT INTO artifacts(id,user_id,case_id,kind,title,status,content,version,source_case_version,source_conversation_id,source_message_id,snapshot_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(artifactId,id,recordId,canonical.kind,canonical.title,canonical.status,canonical.content,next,record.version,sourceConversationId,canonical.sourceMessageId,snapshot,now);
      return fullArtifact(artifactLookup.get(id,artifactId));
    };
    const saveUser = (input, rotate) => {
      if (!plain(input) || Object.keys(input).some(key => !['username', 'passwordHash'].includes(key))) fail('USER_INVALID');
      const username = normalizeUsername(input.username);
      if (reservedAlias && username === reservedAlias) fail('USER_INVALID');
      const passwordHash = validateHash(input.passwordHash);
      return transaction(() => {
        const existing = nameLookup.get(username);
        if (existing) {
          if (!rotate) fail('USER_EXISTS', 409);
          db.prepare("UPDATE users SET password_hash = ? WHERE id = ? AND role = 'trial'").run(passwordHash, existing.id);
          return publicUser(existing);
        }
        // Check inside the same write transaction; rotations above do not consume another slot.
        if (db.prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'trial'").get().total >= MAX_TRIAL_USERS)
          fail('USER_LIMIT_REACHED', 409);
        const id = randomUUID();
        db.prepare("INSERT INTO users(id, username, role, password_hash, created_at) VALUES(?, ?, 'trial', ?, ?)")
          .run(id, username, passwordHash, new Date().toISOString());
        return publicUser(userLookup.get(id));
      });
    };
    const workflowLookup = db.prepare('SELECT id AS workflowId, user_id AS userId, case_id AS caseId, created_at AS createdAt, updated_at AS updatedAt FROM telemetry_workflows WHERE user_id = ? AND id = ?');
    const requireWorkflow = (id, workflowId) => {
      requireUser(id); telemetryId(workflowId);
      const workflow = workflowLookup.get(id, workflowId);
      if (!workflow) fail('WORKFLOW_NOT_FOUND', 404);
      return workflow;
    };
    const trimOldest = (table, column, key, maximum) => {
      const where = column ? ` WHERE ${column} = ?` : '';
      const args = column ? [key] : [];
      const excess = Number(db.prepare(`SELECT COUNT(*) AS total FROM ${table}${where}`).get(...args).total) - maximum;
      if (excess > 0) db.prepare(`DELETE FROM ${table} WHERE id IN (SELECT id FROM ${table}${where} ORDER BY ${table === 'telemetry_workflows' ? 'updated_at, id' : 'id'} LIMIT ?)`)
        .run(...args, excess);
    };
    const pruneTelemetry = (id = null, workflowId = null) => {
      const cutoff = new Date(Date.now() - TELEMETRY_LIMITS.retentionDays * 86400000).toISOString();
      db.prepare('DELETE FROM telemetry_events WHERE created_at < ?').run(cutoff);
      db.prepare('DELETE FROM telemetry_workflows WHERE updated_at < ? AND NOT EXISTS (SELECT 1 FROM telemetry_events WHERE workflow_id = telemetry_workflows.id)').run(cutoff);
      if (workflowId) trimOldest('telemetry_events', 'workflow_id', workflowId, TELEMETRY_LIMITS.eventsPerWorkflow);
      if (id) {
        trimOldest('telemetry_events', 'user_id', id, TELEMETRY_LIMITS.eventsPerUser);
        trimOldest('telemetry_workflows', 'user_id', id, TELEMETRY_LIMITS.workflowsPerUser);
      }
      trimOldest('telemetry_events', null, null, TELEMETRY_LIMITS.eventsGlobal);
    };
    const telemetryTransaction = action => {
      // Diagnostics never wait five seconds behind another process's business transaction.
      db.exec('PRAGMA busy_timeout = 50');
      try { return transaction(action); }
      finally { db.exec('PRAGMA busy_timeout = 5000'); }
    };
    try { telemetryTransaction(() => pruneTelemetry()); } catch { /* Optional maintenance cannot disable business storage. */ }
    return {
      emailAuth: createEmailAuthStorage({ db, transaction, maxUsers: MAX_TRIAL_USERS }),
      accountAdministration: createAccountAdministrationStorage({ db, transaction }),
      assetUsage(id) { requireUser(id);return assetUsage(id); },
      validateAssetLinks(id,links) { requireUser(id);return assetLinks(id,links); },
      createAsset(id,payload,links={},writeBytes) {
        assetKeys(payload,['originalFilename','mimeType','sizeBytes','sha256','text','textStatus','textTruncated','previewKind','warnings'],['originalFilename','mimeType','sizeBytes','sha256','text','textStatus','textTruncated','previewKind','warnings']);
        assetFilename(payload.originalFilename,payload.mimeType);
        if(!Number.isSafeInteger(payload.sizeBytes)||payload.sizeBytes<1||payload.sizeBytes>ASSET_LIMITS.fileBytes||typeof payload.sha256!=='string'||!/^[0-9a-f]{64}$/u.test(payload.sha256)||typeof payload.text!=='string'||payload.text.length>ASSET_LIMITS.textChars||!['ready','unavailable'].includes(payload.textStatus)||typeof payload.textTruncated!=='boolean'||payload.previewKind!==ASSET_TYPES[payload.mimeType].previewKind||!Array.isArray(payload.warnings)||payload.warnings.length>50||payload.warnings.some(w=>typeof w!=='string'||w.length>1000)||typeof writeBytes!=='function')assetFail('ASSET_INVALID');
        return transaction(()=>{
          requireUser(id);const associated=assetLinks(id,links),usage=assetUsage(id);
          if(usage.count>=ASSET_LIMITS.filesPerUser||usage.bytes+payload.sizeBytes>ASSET_LIMITS.userBytes)assetFail('ASSET_QUOTA_EXCEEDED',409);
          const recordId=randomUUID(),now=new Date().toISOString();
          // The quota lock covers durable file creation and metadata commit. No public path or identity enters this callback.
          writeBytes(recordId);
          db.prepare('INSERT INTO assets(id,owner_user_id,case_id,client_id,original_filename,mime_type,size_bytes,sha256,extracted_text,search_text,text_status,text_truncated,preview_kind,warnings_json,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)')
            .run(recordId,id,associated.caseId,associated.clientId,payload.originalFilename,payload.mimeType,payload.sizeBytes,payload.sha256,payload.text,normalizeAssetSearch(payload.originalFilename+'\n'+payload.text),payload.textStatus,Number(payload.textTruncated),payload.previewKind,JSON.stringify(payload.warnings),now,now);
          return assetMetadata(assetLookup.get(id,recordId));
        });
      },
      getAsset(id,recordId) { requireUser(id);return assetId(recordId)?assetMetadata(assetLookup.get(id,recordId)):null; },
      getAssetText(id,recordId) { requireUser(id);if(!assetId(recordId))return null;const row=db.prepare('SELECT extracted_text AS text FROM assets WHERE owner_user_id=? AND id=?').get(id,recordId);return row?row.text:null; },
      updateAssetLinks(id,recordId,links,expectedVersion) {
        if(!Number.isSafeInteger(expectedVersion)||expectedVersion<1)assetFail('ASSET_INVALID');
        return transaction(()=>{requireUser(id);const existing=assetId(recordId)&&assetLookup.get(id,recordId);if(!existing)return null;if(existing.version!==expectedVersion)assetFail('ASSET_CONFLICT',409);
          const associated=assetLinks(id,links);db.prepare('UPDATE assets SET case_id=?,client_id=?,version=version+1,updated_at=? WHERE owner_user_id=? AND id=? AND version=?').run(associated.caseId,associated.clientId,new Date().toISOString(),id,recordId,expectedVersion);return assetMetadata(assetLookup.get(id,recordId));});
      },
      listAssets(id,options={}) {
        requireUser(id);assetKeys(options,['q','caseId','clientId','limit','offset']);
        const q=options.q??'',limit=options.limit??50,offset=options.offset??0;
        if(typeof q!=='string'||q.length>200||/[\u0000-\u001f\u007f]/u.test(q)||!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0||offset>ASSET_LIMITS.filesPerUser)assetFail('ASSET_INVALID');
        const where=['owner_user_id=?'],args=[id];
        for(const [field,column,lookupFn,error] of [['caseId','case_id',lookup,'CASE_NOT_FOUND'],['clientId','client_id',clientLookup,'CLIENT_NOT_FOUND']])if(options[field]!==undefined){if(!assetId(options[field]))assetFail('ASSET_INVALID');if(!lookupFn.get(id,options[field]))assetFail(error,404);where.push(column+'=?');args.push(options[field]);}
        const needle=normalizeAssetSearch(q.trim());if(needle){where.push('instr(search_text,?)>0');args.push(needle);}
        const clause=where.join(' AND '),total=db.prepare(`SELECT COUNT(*) AS count FROM assets WHERE ${clause}`).get(...args).count;
        const rows=db.prepare(`SELECT ${assetColumns}${needle?',extracted_text AS searchBody':''} FROM assets WHERE ${clause} ORDER BY created_at DESC,id LIMIT ? OFFSET ?`).all(...args,limit,offset);
        const assets=rows.map(row=>{const {searchBody,...metadata}=row;const asset=assetMetadata(metadata);if(needle){const index=normalizeAssetSearch(searchBody).indexOf(needle);asset.snippet=index<0?asset.originalFilename:searchBody.slice(Math.max(0,index-60),Math.max(0,index-60)+240);}return asset;});
        return {assets,total,limit,offset,searchMode:'literal-substring',usage:assetUsage(id),limits:ASSET_LIMITS};
      },
      telemetryPrune() { return telemetryTransaction(() => pruneTelemetry()); },
      telemetryCreateWorkflow(id) {
        return telemetryTransaction(() => {
          requireUser(id);
          const workflowId = randomUUID();
          const now = new Date().toISOString();
          db.prepare('INSERT INTO telemetry_workflows(id, user_id, case_id, created_at, updated_at) VALUES(?, ?, NULL, ?, ?)').run(workflowId, id, now, now);
          pruneTelemetry(id);
          return { ...workflowLookup.get(id, workflowId) };
        });
      },
      telemetryGetWorkflow(id, workflowId) { requireUser(id); telemetryId(workflowId); return workflowLookup.get(id, workflowId) ?? null; },
      telemetryBindWorkflow(id, workflowId, recordId) {
        telemetryId(recordId);
        return telemetryTransaction(() => {
          const workflow = requireWorkflow(id, workflowId);
          if (!db.prepare('SELECT 1 FROM cases WHERE user_id = ? AND id = ?').get(id, recordId)) fail('CASE_NOT_FOUND', 404);
          if (workflow.caseId && workflow.caseId !== recordId) fail('WORKFLOW_ALREADY_BOUND', 409);
          db.prepare('UPDATE telemetry_workflows SET case_id = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(recordId, new Date().toISOString(), workflowId, id);
          return { workflowId, caseId: recordId };
        });
      },
      telemetryAppendEvents(id, workflowId, events) {
        if (!Array.isArray(events) || !events.length || events.length > TELEMETRY_LIMITS.batch) fail('TELEMETRY_INVALID');
        const canonical = events.map(validateStoredTelemetryEvent);
        return telemetryTransaction(() => {
          requireWorkflow(id, workflowId);
          for (const item of canonical) if (item.source === 'client' && item.requestId && !db.prepare("SELECT 1 FROM telemetry_events WHERE request_id = ? AND user_id = ? AND workflow_id = ? AND source = 'server'").get(item.requestId, id, workflowId)) fail('TELEMETRY_REQUEST_MISMATCH');
          const now = new Date().toISOString();
          const insert = db.prepare('INSERT INTO telemetry_events(workflow_id,user_id,request_id,source,event_name,outcome,http_status,error_code,server_elapsed_ms,client_active_ms,client_wait_ms,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
          for (const item of canonical) insert.run(workflowId,id,item.requestId,item.source,item.event,item.outcome,item.httpStatus,item.errorCode,item.serverElapsedMs,item.clientActiveMs,item.clientWaitMs,now);
          db.prepare('UPDATE telemetry_workflows SET updated_at = ? WHERE id = ? AND user_id = ?').run(now, workflowId, id);
          pruneTelemetry(id, workflowId);
          return { accepted: canonical.length };
        });
      },
      telemetryReadEvents(id, filters = {}, admin = false) {
        requireUser(id);
        if (admin && userLookup.get(id).role !== 'owner') fail('OWNER_REQUIRED', 403);
        keys(filters, ['workflowId', 'caseId', 'userId', 'limit', 'beforeId'], []);
        if (filters.workflowId) telemetryId(filters.workflowId);
        if (filters.caseId) telemetryId(filters.caseId);
        if (filters.userId) userId(filters.userId);
        const limit = filters.limit ?? 100;
        const beforeId = filters.beforeId ?? null;
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || (beforeId !== null && (!Number.isSafeInteger(beforeId) || beforeId < 1))) fail('TELEMETRY_INVALID');
        return telemetryTransaction(() => {
          pruneTelemetry();
          if (!admin && filters.workflowId) requireWorkflow(id, filters.workflowId);
          if (!admin && filters.caseId && !db.prepare('SELECT 1 FROM cases WHERE id = ? AND user_id = ?').get(filters.caseId, id) && !db.prepare('SELECT 1 FROM telemetry_workflows WHERE case_id = ? AND user_id = ?').get(filters.caseId, id)) fail('CASE_NOT_FOUND', 404);
          const where = [], params = [];
          if (!admin) { where.push('e.user_id = ?'); params.push(id); }
          if (filters.userId) { if (!admin && filters.userId !== id) fail('TELEMETRY_INVALID'); where.push('e.user_id = ?'); params.push(filters.userId); }
          if (filters.workflowId) { where.push('e.workflow_id = ?'); params.push(filters.workflowId); }
          if (filters.caseId) { where.push('w.case_id = ?'); params.push(filters.caseId); }
          if (beforeId !== null) { where.push('e.id < ?'); params.push(beforeId); }
          const rows = db.prepare(`SELECT e.id,e.workflow_id AS workflowId,w.case_id AS caseId,e.user_id AS userId,e.request_id AS requestId,e.source,e.event_name AS event,e.outcome,e.http_status AS httpStatus,e.error_code AS errorCode,e.server_elapsed_ms AS serverElapsedMs,e.client_active_ms AS clientActiveMs,e.client_wait_ms AS clientWaitMs,e.created_at AS createdAt FROM telemetry_events e JOIN telemetry_workflows w ON w.id=e.workflow_id${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY e.id DESC LIMIT ?`).all(...params, limit + 1);
          const more = rows.length > limit;
          const events = rows.slice(0, limit).map(row => ({ ...row }));
          return { events, nextBeforeId: more ? events.at(-1).id : null };
        });
      },
      createClient(id, payload) {
        const canonical = clientPayload(payload);
        return transaction(() => {
          requireUser(id);
          if (db.prepare('SELECT COUNT(*) AS count FROM clients WHERE user_id=?').get(id).count >= LIBRARY_LIMITS.clientsPerUser) fail('CAPACITY_REACHED', 409);
          const recordId = randomUUID(), now = new Date().toISOString();
          db.prepare('INSERT INTO clients(id,user_id,display_name,version,created_at,updated_at) VALUES(?,?,?,1,?,?)').run(recordId,id,canonical.displayName,now,now);
          return { ...clientLookup.get(id, recordId) };
        });
      },
      listClients(id, options = {}) {
        requireUser(id);
        entityKeys(options, ['search','limit'], [], 'CLIENT_INVALID');
        const search = entityText(options.search ?? '', 120, 'CLIENT_INVALID', true).trim();
        const limit = options.limit ?? 50;
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail('CLIENT_INVALID');
        // The per-user cap is 100, so Unicode-aware literal filtering is bounded.
        // SQLite LIKE alone only folds ASCII and would miss Élodie/élodie.
        const needle = search.normalize('NFC').toLowerCase();
        return db.prepare('SELECT id,display_name AS displayName,version,created_at AS createdAt,updated_at AS updatedAt FROM clients WHERE user_id=? ORDER BY display_name COLLATE NOCASE,id LIMIT ?')
          .all(id,LIBRARY_LIMITS.clientsPerUser).filter(row => row.displayName.normalize('NFC').toLowerCase().includes(needle)).slice(0,limit).map(row => ({ ...row }));
      },
      getClient(id, recordId) { requireUser(id); const row = caseId(recordId) && clientLookup.get(id,recordId); return row ? { ...row } : null; },
      updateClient(id, recordId, payload, expectedVersion) {
        const canonical = clientPayload(payload);
        if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) fail('CLIENT_INVALID');
        return transaction(() => {
          requireUser(id);
          const existing = caseId(recordId) && clientLookup.get(id, recordId);
          if (!existing) return null;
          if (existing.version !== expectedVersion) fail('CLIENT_CONFLICT', 409);
          db.prepare('UPDATE clients SET display_name=?,version=version+1,updated_at=? WHERE user_id=? AND id=? AND version=?').run(canonical.displayName,new Date().toISOString(),id,recordId,expectedVersion);
          return { ...clientLookup.get(id, recordId) };
        });
      },
      listClientCases(id, recordId) {
        requireUser(id);
        if (!caseId(recordId) || !clientLookup.get(id,recordId)) return null;
        return db.prepare('SELECT id,title,client_id AS clientId,version,created_at AS createdAt,updated_at AS updatedAt FROM cases WHERE user_id=? AND client_id=? ORDER BY updated_at DESC,id LIMIT ?').all(id,recordId,MAX_CASES_PER_USER).map(row => ({ ...row }));
      },
      createConversation(id, recordId, payload = {}) {
        const canonical = conversationPayload(payload);
        return transaction(() => {
          requireUser(id);
          if (!caseId(recordId) || !lookup.get(id,recordId)) return null;
          if (db.prepare('SELECT COUNT(*) AS count FROM conversations WHERE user_id=? AND case_id=?').get(id,recordId).count >= LIBRARY_LIMITS.conversationsPerCase) fail('CAPACITY_REACHED',409);
          const conversationId = randomUUID(), now = new Date().toISOString();
          db.prepare('INSERT INTO conversations(id,user_id,case_id,title,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(conversationId,id,recordId,canonical.title,now,now);
          return { ...conversationLookup.get(id,conversationId) };
        });
      },
      listConversations(id, recordId) {
        requireUser(id);
        if (!caseId(recordId) || !lookup.get(id,recordId)) return null;
        return db.prepare('SELECT id,case_id AS caseId,title,created_at AS createdAt,updated_at AS updatedAt FROM conversations WHERE user_id=? AND case_id=? ORDER BY updated_at DESC,id LIMIT ?').all(id,recordId,LIBRARY_LIMITS.conversationsPerCase).map(row => ({ ...row }));
      },
      getConversation(id, conversationId) { requireUser(id); const row = caseId(conversationId) && conversationLookup.get(id,conversationId); return row ? { ...row } : null; },
      listMessages(id, conversationId) {
        requireUser(id);
        if (!caseId(conversationId) || !conversationLookup.get(id,conversationId)) return null;
        return db.prepare(`SELECT ${messageColumns} FROM messages WHERE user_id=? AND conversation_id=? ORDER BY sequence LIMIT ?`).all(id,conversationId,LIBRARY_LIMITS.messagesPerConversation).map(fullMessage);
      },
      appendMessage(id, conversationId, payload) {
        const canonical = messagePayload(payload);
        return transaction(() => {
          requireUser(id);
          if (!caseId(conversationId) || !conversationLookup.get(id,conversationId)) return null;
          if (canonical.clientMessageId && db.prepare("SELECT 1 FROM messages WHERE user_id=? AND client_message_id=? AND role='user'").get(id,canonical.clientMessageId)) fail('CHAT_TURN_EXISTS',409);
          if (canonical.requestId && db.prepare('SELECT 1 FROM messages WHERE user_id=? AND request_id=? AND role=?').get(id,canonical.requestId,canonical.role)) fail('CHAT_TURN_EXISTS',409);
          const pending = outstandingTurns(id);
          const consumesReservation = canonical.role === 'assistant' && pending.some(turn => turn.requestId === canonical.requestId && turn.conversationId === conversationId);
          const reservesAnswer = canonical.role === 'user' && canonical.requestId !== null;
          const delta = (reservesAnswer ? 1 : 0) - (consumesReservation ? 1 : 0);
          const conversationCount = db.prepare('SELECT COUNT(*) AS count FROM messages WHERE user_id=? AND conversation_id=?').get(id,conversationId).count;
          const userCount = db.prepare('SELECT COUNT(*) AS count FROM messages WHERE user_id=?').get(id).count;
          if (conversationCount + pending.filter(turn => turn.conversationId === conversationId).length + 1 + delta > LIBRARY_LIMITS.messagesPerConversation ||
              userCount + pending.length + 1 + delta > LIBRARY_LIMITS.messagesPerUser) fail('CAPACITY_REACHED',409);
          const images = JSON.stringify(canonical.imageMetadata);
          checkLibraryBytes(id,Buffer.byteLength(canonical.content,'utf8') + Buffer.byteLength(images,'utf8'),pending,delta);
          const messageId = randomUUID(), now = new Date().toISOString();
          const sequence = db.prepare('SELECT COALESCE(MAX(sequence),0)+1 AS next FROM messages WHERE conversation_id=?').get(conversationId).next;
          db.prepare('INSERT INTO messages(id,user_id,conversation_id,sequence,role,content,state,request_id,client_message_id,image_metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
            .run(messageId,id,conversationId,sequence,canonical.role,canonical.content,canonical.state,canonical.requestId,canonical.clientMessageId,images,now);
          db.prepare('UPDATE conversations SET updated_at=? WHERE user_id=? AND id=?').run(now,id,conversationId);
          return fullMessage(db.prepare(`SELECT ${messageColumns} FROM messages WHERE user_id=? AND id=?`).get(id,messageId));
        });
      },
      createArtifact(id, recordId, payload, options = {}) {
        const canonical = artifactPayload(payload,options);
        return transaction(() => insertArtifact(id,recordId,canonical));
      },
      getArtifact(id, artifactId) { requireUser(id); return caseId(artifactId) ? fullArtifact(artifactLookup.get(id,artifactId)) : null; },
      listArtifacts(id, recordId) {
        requireUser(id);
        if (!caseId(recordId) || !lookup.get(id,recordId)) return null;
        return db.prepare(`SELECT ${artifactColumns} FROM artifacts WHERE user_id=? AND case_id=? ORDER BY created_at DESC,id LIMIT ?`).all(id,recordId,LIBRARY_LIMITS.artifactsPerCase).map(artifactMetadata);
      },
      listClientArtifacts(id, recordId) {
        requireUser(id);
        if (!caseId(recordId) || !clientLookup.get(id,recordId)) return null;
        return db.prepare(`SELECT ${artifactColumns} FROM artifacts WHERE user_id=? AND case_id IN(SELECT id FROM cases WHERE user_id=? AND client_id=?) ORDER BY created_at DESC,id LIMIT ?`).all(id,id,recordId,LIBRARY_LIMITS.artifactsPerUser).map(artifactMetadata);
      },
      createTrialUser: input => saveUser(input, false),
      upsertTrialUser: input => saveUser(input, true),
      findUserByUsername(username) {
        // Owner login uses the environment credential, never a database credential.
        if (typeof username === 'string' && username.trim().toLowerCase() === 'owner') return { ...userLookup.get('owner') };
        try { return nameLookup.get(normalizeUsername(username)) ?? null; }
        catch (error) { if (error instanceof StorageError && error.code === 'USER_INVALID') return null; throw error; }
      },
      getUserById(id) { userId(id); return userLookup.get(id) ?? null; },
      listCases(id) {
        requireUser(id);
        return db.prepare('SELECT id, title, client_id AS clientId, version, created_at AS createdAt, updated_at AS updatedAt FROM cases WHERE user_id = ? ORDER BY updated_at DESC, id LIMIT ?').all(id, MAX_CASES_PER_USER).map(row => ({ ...row }));
      },
      createCase(id, payload) {
        const canonical = validateCasePayload(payload);
        return transaction(() => {
          requireUser(id);
          if (db.prepare('SELECT COUNT(*) AS total FROM cases WHERE user_id = ?').get(id).total >= MAX_CASES_PER_USER)
            fail('CASE_LIMIT_REACHED', 409);
          const recordId = randomUUID();
          const now = new Date().toISOString();
          const clientId = canonical.clientId ?? null;
          validateCaseLinks(id,recordId,canonical,clientId);
          db.prepare('INSERT INTO cases(id, user_id, title, payload_json, version, created_at, updated_at, client_id) VALUES(?, ?, ?, ?, 1, ?, ?, ?)')
            .run(recordId, id, canonical.title, storedCaseJson(canonical), now, now, clientId);
          return fullCase(lookup.get(id, recordId));
        });
      },
      getCase(id, recordId) { requireUser(id); return caseId(recordId) ? fullCase(lookup.get(id, recordId)) : null; },
      updateCase(id, recordId, payload, expectedVersion, options = {}) {
        entityKeys(options,['archiveLegacyDraft','returnEffects'],[],'CASE_INVALID');
        for (const key of ['archiveLegacyDraft','returnEffects']) if (Object.hasOwn(options,key) && typeof options[key] !== 'boolean') fail();
        if (!plain(payload) || !Object.hasOwn(payload,'draftText')) fail();
        const incomingDraft = text(payload.draftText,50_000);
        // Validate facts first, then decide whether a carried-forward draft became stale.
        // Its old review gate must not prevent the user from correcting/revoking facts.
        const canonical = validateCasePayload({...payload,draftText:''});
        version(expectedVersion);
        return transaction(() => {
          requireUser(id);
          const existing = caseId(recordId) && lookup.get(id, recordId);
          if (!existing) return null;
          if (existing.version !== expectedVersion) fail('CASE_CONFLICT', 409);
          const previous = JSON.parse(existing.payloadJson);
          if (options.archiveLegacyDraft && incomingDraft && incomingDraft !== previous.draftText) fail();
          const inputsChanged = canonical.sourceText !== previous.sourceText ||
            JSON.stringify(canonical.fields) !== JSON.stringify(previous.fields) ||
            canonical.draftType !== previous.draftType || canonical.namesVerified !== (previous.namesVerified === true);
          const carriedStaleDraft = Boolean(previous.draftText && incomingDraft === previous.draftText && inputsChanged);
          const nextDraft = options.archiveLegacyDraft || carriedStaleDraft ? '' : incomingDraft;
          const preserved = {...canonical,draftText:nextDraft};
          for (const key of ['documentContext','caseIssues']) if (!Object.hasOwn(payload,key) && Object.hasOwn(previous,key)) preserved[key]=previous[key];
          const merged = validateCasePayload(preserved);
          let archived = null;
          if (previous.draftText && (options.archiveLegacyDraft || nextDraft !== previous.draftText)) {
            archived = insertArtifact(id,recordId,artifactPayload({kind:previous.draftType,title:'Archived '+previous.draftType+' draft',status:'draft',content:previous.draftText,expectedCaseVersion:existing.version},{generationMethod:'user-edited'}));
          }
          const clientId = Object.hasOwn(payload,'clientId') ? canonical.clientId : existing.clientId;
          validateCaseLinks(id,recordId,merged,clientId);
          db.prepare('UPDATE cases SET title = ?, payload_json = ?, client_id = ?, version = version + 1, updated_at = ? WHERE user_id = ? AND id = ? AND version = ?')
            .run(merged.title, storedCaseJson(merged), clientId, new Date().toISOString(), id, recordId, expectedVersion);
          const record = fullCase(lookup.get(id, recordId));
          return options.returnEffects ? {case:record,archivedLegacyDraft:Boolean(archived),archivedArtifactId:archived?.id ?? null,legacyDraftInvalidated:Boolean(previous.draftText && !nextDraft)} : record;
        });
      },
      deleteCase(id, recordId, expectedVersion) {
        version(expectedVersion);
        return transaction(() => {
          requireUser(id);
          const existing = caseId(recordId) && lookup.get(id, recordId);
          if (!existing) return false;
          if (existing.version !== expectedVersion) fail('CASE_CONFLICT', 409);
          db.prepare('DELETE FROM cases WHERE user_id = ? AND id = ? AND version = ?').run(id, recordId, expectedVersion);
          return true;
        });
      },
      close() { if (!closed) { db.close(); closed = true; } },
    };
  } catch (error) { db.close(); throw error; }
}
