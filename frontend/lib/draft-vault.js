/** Current-tab draft recovery only. The singleton is owned by Session/Workspace providers.
 * verifyUser is a trusted-session operation: call only after a real server response
 * authenticated that identity. Feature hooks expose read/write, never verification.
 * Nothing is written to localStorage, sessionStorage, cookies, IndexedDB or a server.
 */
export const DRAFT_VAULT_LIMITS=Object.freeze({ttlMs:1800000,maxBytes:1048576,entryBytes:524288,entries:128,depth:8,array:1000,nodes:10000});
const ROOT_KEYS=Object.freeze({
  workspace:['caseId','view','workspaceKey'],
  chat:['input','conversationId','pendingTurn','earlierTurns'],
  intake:['title','sourceText','fields','extractionMode','namesVerified','baseVersion','caseId','assetIds','selectedAssetId'],
  documents:['caseId','baseVersion','kind','content','artifactTitle','saveStatus','answers','namesVerified','issueForm','issueBaseline','selectedArtifactId','detailForm']
});
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
const identity=value=>value==='owner'||uuid(value);
const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const fail=()=>{throw new TypeError('Invalid draft snapshot');};
const forbiddenKey=key=>['__proto__','constructor','prototype'].includes(key)||/(?:password|apikey|token|secret|credential)/u.test(key.toLowerCase().replace(/[^a-z]/gu,''));
const encodedPayload=value=>/data:[^\s,]{0,256},/iu.test(value)||/(?:^|\s)(?:iVBORw0KGgo|\/9j\/|R0lGOD|UklGR)[A-Za-z0-9+/=]{16,}/u.test(value)||/(?:^|\s)[A-Za-z0-9+/]{256,}={0,2}(?:$|\s)/u.test(value);
function validateJson(value){
  let nodes=0;
  const visit=(item,depth)=>{
    if(++nodes>DRAFT_VAULT_LIMITS.nodes||depth>DRAFT_VAULT_LIMITS.depth)fail();
    if(item===null||typeof item==='boolean')return item;
    if(typeof item==='number'){if(!Number.isFinite(item))fail();return item;}
    if(typeof item==='string'){if(encodedPayload(item))fail();return item;}
    if(typeof item!=='object')fail();
    if(Array.isArray(item)){
      if(Object.getPrototypeOf(item)!==Array.prototype||item.length>DRAFT_VAULT_LIMITS.array||Reflect.ownKeys(item).length!==item.length+1)fail();
      const result=[];for(let index=0;index<item.length;index++){const descriptor=Object.getOwnPropertyDescriptor(item,String(index));if(!descriptor||!Object.hasOwn(descriptor,'value'))fail();result.push(visit(descriptor.value,depth+1));}return result;
    }
    if(!plain(item))fail();const result={};
    for(const key of Reflect.ownKeys(item)){
      if(typeof key!=='string'||forbiddenKey(key))fail();
      const descriptor=Object.getOwnPropertyDescriptor(item,key);
      if(!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))fail();result[key]=visit(descriptor.value,depth+1);
    }
    return result;
  };
  return visit(value,0);
}
function keyParts(key){
  if(!plain(key)||Reflect.ownKeys(key).length!==3||!['userId','workspaceKey','feature'].every(name=>Object.hasOwn(key,name)))fail();
  const safe={};for(const name of ['userId','workspaceKey','feature']){const descriptor=Object.getOwnPropertyDescriptor(key,name);if(!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))fail();safe[name]=descriptor.value;}
  if(!identity(safe.userId)||typeof safe.feature!=='string'||!Object.hasOwn(ROOT_KEYS,safe.feature)||!(uuid(safe.workspaceKey)||safe.feature==='workspace'&&safe.workspaceKey==='active'))fail();
  return safe;
}
function snapshotJson(key,snapshot){
  if(!plain(snapshot))fail();snapshot=validateJson(snapshot);
  if(Object.keys(snapshot).some(name=>!ROOT_KEYS[key.feature].includes(name)))fail();
  if(key.feature==='chat'){
    if(Object.hasOwn(snapshot,'input')&&(typeof snapshot.input!=='string'||snapshot.input.length>8000))fail();
    if(Object.hasOwn(snapshot,'conversationId')&&snapshot.conversationId!==null&&!uuid(snapshot.conversationId))fail();
    const validateTurn=turn=>{
      const keys=['userMessageId','clientMessageId','question','assistantMessageId','reply','requestId'];
      if(!uuid(snapshot.conversationId)||!plain(turn)||Object.keys(turn).length!==keys.length||!keys.every(key=>Object.hasOwn(turn,key)))fail();
      if(!['userMessageId','clientMessageId','assistantMessageId'].every(key=>uuid(turn[key]))||turn.requestId!==null&&!uuid(turn.requestId))fail();
      if(typeof turn.question!=='string'||turn.question.length>8000||typeof turn.reply!=='string'||!turn.reply||turn.reply.length>64000)fail();
    };
    if(Object.hasOwn(snapshot,'pendingTurn'))validateTurn(snapshot.pendingTurn);
    if(Object.hasOwn(snapshot,'earlierTurns')){
      if(!snapshot.pendingTurn||!Array.isArray(snapshot.earlierTurns)||snapshot.earlierTurns.length>7)fail();
      for(const turn of snapshot.earlierTurns)validateTurn(turn);
      const ids=[...snapshot.earlierTurns,snapshot.pendingTurn].map(turn=>turn.clientMessageId);if(new Set(ids).size!==ids.length)fail();
    }
  }
  if(key.feature==='workspace'){
    if(Object.hasOwn(snapshot,'caseId')&&snapshot.caseId!==null&&!uuid(snapshot.caseId))fail();
    if(Object.hasOwn(snapshot,'workspaceKey')&&!uuid(snapshot.workspaceKey))fail();
    if(Object.hasOwn(snapshot,'view')&&!['chat','customers','intake','documents','settings'].includes(snapshot.view))fail();
  }
  return {json:JSON.stringify(snapshot),snapshot};
}

export function createDraftVault({now=Date.now,maxBytes=DRAFT_VAULT_LIMITS.maxBytes,ttlMs=DRAFT_VAULT_LIMITS.ttlMs}={}){
  if(typeof now!=='function'||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>DRAFT_VAULT_LIMITS.maxBytes||!Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>DRAFT_VAULT_LIMITS.ttlMs)throw new TypeError('Invalid draft vault limits');
  const entries=new Map(), encoder=new TextEncoder();
  let owner=null,verified=false,expiresAt=null,lastTime=null,totalBytes=0;
  const clear=()=>{entries.clear();owner=null;verified=false;expiresAt=null;totalBytes=0;};
  const clock=()=>{
    let value;try{value=now();}catch{clear();return null;}
    if(!Number.isFinite(value)||value<0||(lastTime!==null&&value<lastTime)){clear();lastTime=Number.isFinite(value)&&value>=0?value:null;return null;}
    lastTime=value;if(expiresAt!==null&&value>=expiresAt)clear();return value;
  };
  const owned=key=>verified&&owner===key.userId;
  const location=key=>`${key.workspaceKey}:${key.feature}`;
  const removeKey=id=>{const existing=entries.get(id);if(!existing)return false;totalBytes-=existing.bytes;entries.delete(id);return true;};
  return Object.freeze({
    verifyUser(userId){
      if(clock()===null||!identity(userId)){clear();return false;}
      if(owner!==userId){clear();owner=userId;verified=true;return false;}
      const resumed=!verified&&expiresAt!==null&&entries.size>0;
      verified=true;expiresAt=null;return resumed;
    },
    suspend(userId){
      const time=clock();if(time===null||!identity(userId)||!verified||owner!==userId)return false;
      verified=false;expiresAt=time+ttlMs;return true;
    },
    clear,
    clearWorkspace(userId,workspaceKey){
      if(clock()===null||!verified||owner!==userId||!uuid(workspaceKey))return;
      for(const[id,entry]of entries)if(entry.key.workspaceKey===workspaceKey||entry.key.feature==='workspace'&&JSON.parse(entry.json).workspaceKey===workspaceKey)removeKey(id);
    },
    remove(key){try{if(clock()===null)return false;const safe=keyParts(key);return owned(safe)?removeKey(location(safe)):false;}catch{return false;}},
    write(key,snapshot){
      try{
        if(clock()===null)return false;const safe=keyParts(key);if(!owned(safe))return false;
        const canonical=snapshotJson(safe,snapshot),json=canonical.json,bytes=encoder.encode(JSON.stringify({key:safe,snapshot:canonical.snapshot})).byteLength;
        if(bytes>DRAFT_VAULT_LIMITS.entryBytes)return false;
        const id=location(safe),previous=entries.get(id);
        if(!previous&&entries.size>=DRAFT_VAULT_LIMITS.entries||totalBytes-(previous?.bytes||0)+bytes>maxBytes)return false;
        entries.set(id,{key:safe,json,bytes});totalBytes=totalBytes-(previous?.bytes||0)+bytes;return true;
      }catch{return false;}
    },
    read(key){try{if(clock()===null)return null;const safe=keyParts(key);if(!owned(safe))return null;const entry=entries.get(location(safe));return entry?JSON.parse(entry.json):null;}catch{return null;}}
  });
}
export const draftVault=createDraftVault();
