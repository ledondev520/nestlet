/** Private encrypted credential store; never include it in case exports or API objects. */
import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { constants, closeSync, existsSync, fstatSync, lstatSync, openSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, parse, resolve, sep } from 'node:path';
import { preparePrivateStorageFile } from './storage.js';
const APPLICATION_ID = 0x4e535043; // NSPC, deliberately not the case database.
const AAD = Buffer.from('Nestlet provider configuration / owner / AES-256-GCM / schema 1');
export class ProviderConfigError extends Error {
  constructor(code = 'PROVIDER_SETTINGS_UNAVAILABLE') { super(code); this.name = 'ProviderConfigError'; this.code = code; this.status = 503; }
}
const fail = () => { throw new ProviderConfigError(); };
function validate(value) {
  if (!value || Object.keys(value).sort().join(',') !== 'apiKey,enabled,model,verifiedAt' ||
      typeof value.apiKey !== 'string' || !/^[A-Za-z0-9_.-]{16,256}$/u.test(value.apiKey) ||
      typeof value.enabled !== 'boolean' || value.model !== 'deepseek-flash' ||
      typeof value.verifiedAt !== 'string' || !Number.isFinite(Date.parse(value.verifiedAt)) ||
      new Date(value.verifiedAt).toISOString() !== value.verifiedAt) fail();
  return value;
}
function wrappingKey(filename, databasePath, excludedDirectories) {
  if (typeof filename !== 'string' || !isAbsolute(filename) || filename.includes('\0')) fail();
  const path = resolve(filename), dataDirectory = dirname(databasePath);
  if ([dataDirectory,...excludedDirectories].some(directory => path === resolve(directory) || path.startsWith(resolve(directory) + sep))) fail();
  const uid = process.geteuid?.() ?? process.getuid?.();
  const directory = dirname(path), root = parse(directory).root;
  let ancestor = root;
  for (const component of ['', ...directory.slice(root.length).split(sep).filter(Boolean)]) {
    if (component) ancestor = resolve(ancestor, component);
    const info = lstatSync(ancestor);
    const stickyRoot = ancestor !== directory && info.uid === 0 && Boolean(info.mode & 0o1000);
    if (!info.isDirectory() || (uid !== undefined && info.uid !== uid && info.uid !== 0) || ((info.mode & 0o022) && !stickyRoot)) fail();
  }
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.nlink !== 1 || ![0o400,0o600].includes(info.mode & 0o777) ||
        (uid !== undefined && info.uid !== uid) || info.size !== 32) fail();
    const key = readFileSync(fd);
    if (key.length !== 32) fail();
    return key;
  } finally { closeSync(fd); }
}
export function openProviderConfig({ filename, wrappingKeyFile = '', excludedDirectories = [] } = {}) {
  let db, key;
  try {
    if (typeof filename !== 'string' || !isAbsolute(filename) || filename.includes('\0')) fail();
    const path = resolve(filename);
    const storeExists = () => [path,path+'-journal',path+'-wal',path+'-shm'].some(existsSync);
    if (!wrappingKeyFile) {
      if (storeExists()) fail();
      return { available:false, load:()=>null, save:fail, close(){} };
    }
    key = wrappingKey(wrappingKeyFile, path, excludedDirectories);
    let revision = 0, poisoned = false;
    const connect = allowCreation => {
      const existing=storeExists();
      if ((!existing && !allowCreation) || (existing && !existsSync(path))) fail();
      preparePrivateStorageFile(path);
      db = new DatabaseSync(path, { enableDoubleQuotedStringLiterals:false, allowExtension:false, timeout:5000 });
      const id=db.prepare('PRAGMA application_id').get().application_id;
      const version=db.prepare('PRAGMA user_version').get().user_version;
      // Existing empty/truncated/foreign files must never be treated as new stores.
      if (existing ? id!==APPLICATION_ID || version!==1 : id!==0 || version!==0 ||
          Boolean(db.prepare("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").get())) fail();
      db.exec('PRAGMA trusted_schema=OFF; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON;');
      return !existing;
    };
    const load = () => {
      try {
        if (poisoned) fail();
        if (!db) return null;
        const row = db.prepare('SELECT revision,nonce,tag,ciphertext FROM provider_config WHERE id=1').get();
        // Only a genuinely absent database represents never-configured state.
        if (!row || !Number.isSafeInteger(row.revision) || row.revision < 1 || row.nonce.length!==12 || row.tag.length!==16 || row.ciphertext.length>2048) fail();
        const decipher = createDecipheriv('aes-256-gcm',key,row.nonce);
        decipher.setAAD(Buffer.concat([AAD,Buffer.from(` / revision ${row.revision}`)]));
        decipher.setAuthTag(row.tag);
        const plaintext = Buffer.concat([decipher.update(row.ciphertext),decipher.final()]);
        try {
          if (plaintext.length>2048) fail();
          const value=validate(JSON.parse(plaintext.toString('utf8')));
          revision=row.revision;
          return value;
        } finally { plaintext.fill(0); }
      } catch { fail(); }
    };
    if (storeExists()) { connect(false); load(); }
    // Fresh installations remain file-free until the first validated credential save.
    return {
      get available(){return !poisoned;}, load,
      save(value) {
        let newStore=false;
        try {
          if (poisoned) fail();
          validate(value);
          const currentKey=wrappingKey(wrappingKeyFile,path,excludedDirectories);
          try { if (!timingSafeEqual(key,currentKey)) fail(); } finally { currentKey.fill(0); }
          if (!db) newStore=connect(true);
          preparePrivateStorageFile(path);
          const nextRevision=revision+1, nonce=randomBytes(12);
          const cipher=createCipheriv('aes-256-gcm',key,nonce);
          cipher.setAAD(Buffer.concat([AAD,Buffer.from(` / revision ${nextRevision}`)]));
          const plaintext=Buffer.from(JSON.stringify(value));
          let ciphertext;
          try { ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]); }
          finally { plaintext.fill(0); }
          db.exec('BEGIN IMMEDIATE');
          try {
            if (newStore) db.exec(`CREATE TABLE provider_config (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL CHECK(revision>0), nonce BLOB NOT NULL CHECK(length(nonce)=12), tag BLOB NOT NULL CHECK(length(tag)=16), ciphertext BLOB NOT NULL CHECK(length(ciphertext) BETWEEN 1 AND 2048)) STRICT; PRAGMA application_id=${APPLICATION_ID}; PRAGMA user_version=1;`);
            const current=db.prepare('SELECT revision FROM provider_config WHERE id=1').get()?.revision;
            if (newStore ? current!==undefined || revision!==0 : current!==revision) fail();
            db.prepare('INSERT INTO provider_config(id,revision,nonce,tag,ciphertext) VALUES(1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,nonce=excluded.nonce,tag=excluded.tag,ciphertext=excluded.ciphertext')
              .run(nextRevision,nonce,cipher.getAuthTag(),ciphertext);
            db.exec('COMMIT');
            revision=nextRevision;
          } catch { try { db.exec('ROLLBACK'); } catch {} throw new ProviderConfigError(); }
        } catch {
          // Do not delete/reinitialize a failed first-write file or repair persisted state.
          if (newStore) poisoned=true;
          fail();
        }
      },
      close(){ try { db?.close(); } finally { poisoned=true; key.fill(0); } },
    };
  } catch {
    try { db?.close(); } catch {}
    key?.fill(0);
    fail();
  }
}
