/** Human-facing references only. Internal UUIDs, routes and external case references never change. */
export const RECORD_PREFIXES = Object.freeze({client:'KF',case:'SX',asset:'CL',artifact:'WS',conversation:'DH',message:'XX'});
const entities = Object.freeze([
  ['client','clients','user_id'], ['case','cases','user_id'], ['asset','assets','owner_user_id'],
  ['artifact','artifacts','user_id'], ['conversation','conversations','user_id'], ['message','messages','user_id']
]);
export const RECORD_IDS_SCHEMA_SQL = `
CREATE TABLE record_display_counters (
  owner_user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL CHECK(kind IN('client','case','asset','artifact','conversation','message')),
  last_number INTEGER NOT NULL CHECK(last_number BETWEEN 1 AND 99999999), PRIMARY KEY(owner_user_id,kind)
) STRICT;
CREATE TABLE record_display_ids (
  owner_user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL CHECK(kind IN('client','case','asset','artifact','conversation','message')),
  record_id TEXT NOT NULL, number INTEGER NOT NULL CHECK(number BETWEEN 1 AND 99999999),
  PRIMARY KEY(owner_user_id,kind,record_id), UNIQUE(owner_user_id,kind,number)
) STRICT;
CREATE TRIGGER record_display_id_no_update BEFORE UPDATE ON record_display_ids BEGIN SELECT RAISE(ABORT,'Display references are immutable'); END;
CREATE TRIGGER record_display_id_no_delete BEFORE DELETE ON record_display_ids BEGIN SELECT RAISE(ABORT,'Display references are never reused'); END;
` + entities.map(([kind,table,owner]) => `
INSERT INTO record_display_ids(owner_user_id,kind,record_id,number)
 SELECT ${owner},'${kind}',id,ROW_NUMBER() OVER(PARTITION BY ${owner} ORDER BY created_at,id) FROM ${table};
INSERT INTO record_display_counters SELECT owner_user_id,kind,MAX(number) FROM record_display_ids WHERE kind='${kind}' GROUP BY owner_user_id,kind;
CREATE TRIGGER ${table}_assign_display_id AFTER INSERT ON ${table} BEGIN
 INSERT INTO record_display_counters VALUES(NEW.${owner},'${kind}',1)
 ON CONFLICT(owner_user_id,kind) DO UPDATE SET last_number=last_number+1;
 INSERT INTO record_display_ids VALUES(NEW.${owner},'${kind}',NEW.id,(SELECT last_number FROM record_display_counters WHERE owner_user_id=NEW.${owner} AND kind='${kind}'));
END;
`).join('');
export function attachRecordDisplayIds(api,db,requireUser) {
  const statement=db.prepare('SELECT number FROM record_display_ids WHERE owner_user_id=? AND kind=? AND record_id=?');
  const decorate=(userId,kind,row)=>{
    if(!row||typeof row!=='object'||typeof row.id!=='string')return row;
    const found=statement.get(userId,kind,row.id);if(!found)return row;
    const result={...row,displayId:RECORD_PREFIXES[kind]+String(found.number).padStart(8,'0')};
    if(kind==='message'&&row.conversationId){const conversation=statement.get(userId,'conversation',row.conversationId);if(conversation)result.conversationDisplayId='DH'+String(conversation.number).padStart(8,'0');}
    if(kind==='case'){
      const ids=[...(row.caseIssues||[]).map(issue=>issue.sourceMessageId),...Object.values(row.documentContext||{}).map(detail=>detail.sourceMessageId)].filter(Boolean);
      const sources={};for(const id of ids){const message=statement.get(userId,'message',id);if(message)sources[id]='XX'+String(message.number).padStart(8,'0');}
      if(Object.keys(sources).length)result.sourceDisplayIds=sources;
    }
    return result;
  };
  const groups={
    client:['createClient','getClient','updateClient','listClients'],
    case:['createCase','getCase','updateCase','listCases','listClientCases'],
    asset:['createAsset','getAsset','updateAssetLinks'],
    artifact:['createArtifact','createConversationAnswerDraft','getArtifact','listArtifacts','listClientArtifacts'],
    conversation:['createConversation','getConversation','listConversations','listAccountConversations'],
    message:['appendMessage','listMessages']
  };
  for(const [kind,methods] of Object.entries(groups))for(const name of methods)if(typeof api[name]==='function'){
    const original=api[name];api[name]=function(userId,...args){
      const value=original.call(this,userId,...args);
      if(Array.isArray(value))return value.map(row=>decorate(userId,kind,row));
      if(name==='updateCase'&&value?.case)return {...value,case:decorate(userId,kind,value.case)};
      return decorate(userId,kind,value);
    };
  }
  const listAssets=api.listAssets;api.listAssets=function(userId,...args){const result=listAssets.call(this,userId,...args);return {...result,assets:result.assets.map(row=>decorate(userId,'asset',row))};};
  api.recordDisplayId=(userId,kind,id)=>{requireUser(userId);if(!Object.hasOwn(RECORD_PREFIXES,kind)||typeof id!=='string')return null;const row=statement.get(userId,kind,id);return row?RECORD_PREFIXES[kind]+String(row.number).padStart(8,'0'):null;};
}
