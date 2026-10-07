/** Server-local, owner-scoped SQLite storage. Input text is untrusted; no uploaded bytes or keys are saved. */
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { constants, closeSync, fchmodSync, fstatSync, lstatSync, mkdirSync, openSync } from 'node:fs';
import { dirname, parse, resolve, sep } from 'node:path';
import { FIELDS, DRAFT_TYPES, canDraft } from './public/core.js';
import { TELEMETRY_LIMITS, CLIENT_EVENTS, SERVER_EVENTS, validateStoredTelemetryEvent, telemetryId } from './telemetry.js';

const SCHEMA_VERSION = 2;
const APPLICATION_ID = 0x4e53544c; // NSTL, distinct from unrelated SQLite files.
export const MAX_CASE_BYTES = 256 * 1024;
export const MAX_SOURCE_CHARS = 50_000;
export const MAX_CASES_PER_USER = 100;
export const MAX_TRIAL_USERS = 100;
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
  const allowed = ['title', 'sourceText', 'fields', 'draftType', 'draftText', 'extractionMode', 'namesVerified'];
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
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_CASE_BYTES) fail('CASE_TOO_LARGE', 413);
  return result;
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
      db.prepare("INSERT INTO users(id, username, role, password_hash, created_at) VALUES('owner', 'owner', 'owner', NULL, ?) ON CONFLICT(id) DO NOTHING").run(new Date().toISOString());
    });
    const userLookup = db.prepare('SELECT id, username, role, password_hash AS passwordHash, created_at AS createdAt FROM users WHERE id = ?');
    const nameLookup = db.prepare('SELECT id, username, role, password_hash AS passwordHash, created_at AS createdAt FROM users WHERE username = ?');
    const lookup = db.prepare('SELECT id, title, payload_json AS payloadJson, version, created_at AS createdAt, updated_at AS updatedAt FROM cases WHERE user_id = ? AND id = ?');
    const requireUser = id => { userId(id); if (!userLookup.get(id)) fail('USER_INVALID'); };
    const publicUser = row => ({ id: row.id, username: row.username, role: row.role, createdAt: row.createdAt });
    const fullCase = row => row ? { ...JSON.parse(row.payloadJson), id: row.id, version: row.version, createdAt: row.createdAt, updatedAt: row.updatedAt } : null;
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
        return db.prepare('SELECT id, title, version, created_at AS createdAt, updated_at AS updatedAt FROM cases WHERE user_id = ? ORDER BY updated_at DESC, id LIMIT ?').all(id, MAX_CASES_PER_USER).map(row => ({ ...row }));
      },
      createCase(id, payload) {
        const canonical = validateCasePayload(payload);
        return transaction(() => {
          requireUser(id);
          if (db.prepare('SELECT COUNT(*) AS total FROM cases WHERE user_id = ?').get(id).total >= MAX_CASES_PER_USER)
            fail('CASE_LIMIT_REACHED', 409);
          const recordId = randomUUID();
          const now = new Date().toISOString();
          db.prepare('INSERT INTO cases(id, user_id, title, payload_json, version, created_at, updated_at) VALUES(?, ?, ?, ?, 1, ?, ?)')
            .run(recordId, id, canonical.title, JSON.stringify(canonical), now, now);
          return fullCase(lookup.get(id, recordId));
        });
      },
      getCase(id, recordId) { requireUser(id); return caseId(recordId) ? fullCase(lookup.get(id, recordId)) : null; },
      updateCase(id, recordId, payload, expectedVersion) {
        const canonical = validateCasePayload(payload);
        version(expectedVersion);
        return transaction(() => {
          requireUser(id);
          const existing = caseId(recordId) && lookup.get(id, recordId);
          if (!existing) return null;
          if (existing.version !== expectedVersion) fail('CASE_CONFLICT', 409);
          db.prepare('UPDATE cases SET title = ?, payload_json = ?, version = version + 1, updated_at = ? WHERE user_id = ? AND id = ? AND version = ?')
            .run(canonical.title, JSON.stringify(canonical), new Date().toISOString(), id, recordId, expectedVersion);
          return fullCase(lookup.get(id, recordId));
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
