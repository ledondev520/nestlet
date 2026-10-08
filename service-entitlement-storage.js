import { SERVICE_LIMITS, ServiceEntitlementError, requireServiceOwner, serviceOwner, serviceChange } from './service-entitlements.js';
export const SERVICE_SCHEMA_SQL = `
CREATE TABLE service_entitlements (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) CHECK(user_id!='owner'),
  enabled INTEGER NOT NULL CHECK(enabled IN(0,1)), expires_at TEXT,
  requests_per_hour INTEGER NOT NULL CHECK(requests_per_hour BETWEEN 1 AND 30),
  version INTEGER NOT NULL CHECK(version>0), updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE service_entitlement_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, actor_user_id TEXT NOT NULL REFERENCES users(id) CHECK(actor_user_id='owner'),
  target_user_id TEXT NOT NULL REFERENCES users(id) CHECK(target_user_id!='owner'), enabled INTEGER NOT NULL CHECK(enabled IN(0,1)),
  expires_at TEXT, requests_per_hour INTEGER NOT NULL CHECK(requests_per_hour BETWEEN 1 AND 30),
  version INTEGER NOT NULL CHECK(version>0), created_at TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN('manual','recovery')), UNIQUE(target_user_id,version)
) STRICT;
CREATE TRIGGER service_audit_no_update BEFORE UPDATE ON service_entitlement_audit BEGIN SELECT RAISE(ABORT,'Service audit is append-only'); END;
CREATE TRIGGER service_audit_no_delete BEFORE DELETE ON service_entitlement_audit BEGIN SELECT RAISE(ABORT,'Service audit is append-only'); END;
CREATE TABLE service_recovery_receipts (
 recovery_id TEXT PRIMARY KEY NOT NULL, source_schema INTEGER NOT NULL CHECK(source_schema BETWEEN 1 AND 9),
 source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64), applied_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER service_recovery_no_update BEFORE UPDATE ON service_recovery_receipts BEGIN SELECT RAISE(ABORT,'Recovery receipt is immutable'); END;
CREATE TRIGGER service_recovery_no_delete BEFORE DELETE ON service_recovery_receipts BEGIN SELECT RAISE(ABORT,'Recovery receipt is immutable'); END;
CREATE TABLE service_usage (
  request_id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) CHECK(user_id!='owner'),
  created_at INTEGER NOT NULL CHECK(created_at>=0)
) STRICT;
CREATE INDEX service_usage_time ON service_usage(created_at);
CREATE INDEX service_usage_user_time ON service_usage(user_id,created_at);
`;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const fail = (code,status) => { throw new ServiceEntitlementError(code,status); };
export function createServiceEntitlementStorage({db,transaction,requireUser}) {
  const owner = session => { requireServiceOwner(session); requireUser(session.userId); };
  const user = id => { requireUser(id); return db.prepare('SELECT role FROM users WHERE id=?').get(id); };
  const read = (id,now=Date.now()) => {
    const identity = user(id), row=db.prepare('SELECT enabled,expires_at AS expiresAt,requests_per_hour AS requestsPerHour,version,updated_at AS updatedAt FROM service_entitlements WHERE user_id=?').get(id);
    const isOwner=id==='owner'&&identity.role==='owner';
    const value=row?{...row,enabled:row.enabled===1}:{enabled:true,expiresAt:null,requestsPerHour:isOwner?null:SERVICE_LIMITS.defaultUserRequests,version:0,updatedAt:null};
    const expired=value.expiresAt!==null&&Date.parse(value.expiresAt)<=now;
    const used=isOwner?0:db.prepare('SELECT COUNT(*) AS n FROM service_usage WHERE user_id=? AND created_at>?').get(id,now-SERVICE_LIMITS.windowMs).n;
    return { userId:id, ...value, mode:isOwner?'owner':row?'manual':'default', status:!value.enabled?'paused':expired?'expired':'available',
      aiAllowed:value.enabled&&!expired, used, remaining:isOwner?null:Math.max(0,value.requestsPerHour-used), paymentManaged:false };
  };
  const assertAvailable = (id,now=Date.now()) => { const state=read(id,now); if(!state.aiAllowed)fail(state.status==='expired'?'SERVICE_EXPIRED':'SERVICE_PAUSED',403);return state; };
  return {
    read, assertAvailable,
    list(session) { owner(session);return {accounts:db.prepare('SELECT id,username FROM users ORDER BY created_at,id LIMIT 101').all().map(row=>({...row,service:read(row.id)}))}; },
    set(session,id,input) {
      owner(session);if(id==='owner')fail('OWNER_IMMUTABLE',403);if(!uuid.test(id))fail('SERVICE_INVALID',400);const change=serviceChange(input);
      return transaction(()=>{
        owner(session);if(!db.prepare("SELECT id FROM users WHERE id=? AND role='trial'").get(id))fail('ACCOUNT_NOT_FOUND',404);
        const previous=read(id),same=previous.enabled===change.enabled&&previous.expiresAt===change.expiresAt&&previous.requestsPerHour===change.requestsPerHour;
        if(previous.version!==change.expectedVersion){if(previous.version===change.expectedVersion+1&&same)return {service:previous,changed:false};fail('SERVICE_CONFLICT',409);}
        if(same&&previous.mode==='manual')return {service:previous,changed:false};
        if(previous.version>=Number.MAX_SAFE_INTEGER)fail('SERVICE_CONFLICT',409);
        const version=previous.version+1,at=new Date().toISOString();
        db.prepare('INSERT INTO service_entitlements VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,expires_at=excluded.expires_at,requests_per_hour=excluded.requests_per_hour,version=excluded.version,updated_at=excluded.updated_at').run(id,Number(change.enabled),change.expiresAt,change.requestsPerHour,version,at);
        db.prepare('INSERT INTO service_entitlement_audit(actor_user_id,target_user_id,enabled,expires_at,requests_per_hour,version,created_at) VALUES(?,?,?,?,?,?,?)').run(session.userId,id,Number(change.enabled),change.expiresAt,change.requestsPerHour,version,at);
        return {service:read(id),changed:true};
      });
    },
    consume(session,requestId,now=Date.now()) {
      if(!session?.userId)fail('AUTH_REQUIRED',401);if(serviceOwner(session)){user(session.userId);return read(session.userId,now);}
      if(!uuid.test(requestId)||!Number.isSafeInteger(now)||now<0)fail('SERVICE_INVALID',400);
      return transaction(()=>{
        const state=assertAvailable(session.userId,now);
        db.prepare('DELETE FROM service_usage WHERE created_at<=?').run(now-SERVICE_LIMITS.windowMs);
        const previous=db.prepare('SELECT user_id FROM service_usage WHERE request_id=?').get(requestId);
        if(previous){if(previous.user_id!==session.userId)fail('SERVICE_INVALID',400);return read(session.userId,now);}
        if(state.used>=state.requestsPerHour||db.prepare('SELECT COUNT(*) AS n FROM service_usage').get().n>=SERVICE_LIMITS.globalRequests)fail('TRIAL_LIMIT_REACHED',429);
        db.prepare('INSERT INTO service_usage VALUES(?,?,?)').run(requestId,session.userId,now);return read(session.userId,now);
      });
    },
    audit(session) { owner(session);return {events:db.prepare('SELECT id,actor_user_id AS actorUserId,target_user_id AS targetUserId,enabled,expires_at AS expiresAt,requests_per_hour AS requestsPerHour,version,created_at AS createdAt,source FROM service_entitlement_audit ORDER BY id DESC LIMIT 100').all().map(row=>({...row,enabled:row.enabled===1}))}; }
  };
}


export function pauseRecoveredServices(db) {
 const at=new Date().toISOString();
 db.prepare(`INSERT INTO service_entitlement_audit(actor_user_id,target_user_id,enabled,expires_at,requests_per_hour,version,created_at,source)
  SELECT 'owner',u.id,0,e.expires_at,COALESCE(e.requests_per_hour,10),COALESCE(e.version,0)+1,?,'recovery'
  FROM users u LEFT JOIN service_entitlements e ON e.user_id=u.id WHERE u.role='trial'`).run(at);
 db.prepare(`INSERT INTO service_entitlements(user_id,enabled,expires_at,requests_per_hour,version,updated_at)
  SELECT u.id,0,e.expires_at,COALESCE(e.requests_per_hour,10),COALESCE(e.version,0)+1,?
  FROM users u LEFT JOIN service_entitlements e ON e.user_id=u.id WHERE u.role='trial'
  ON CONFLICT(user_id) DO UPDATE SET enabled=0,version=excluded.version,updated_at=excluded.updated_at`).run(at);
}
