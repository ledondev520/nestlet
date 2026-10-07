import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDraftVault,DRAFT_VAULT_LIMITS} from './draft-vault.js';
const user=randomUUID(),other=randomUUID(),workspace=randomUUID();
const key=(feature='chat',workspaceKey=workspace,userId=user)=>({userId,workspaceKey,feature});

test('identity supplied to read/write never authenticates; trusted verification is required and clones are detached',()=>{
  const vault=createDraftVault();assert.equal(vault.write(key(),{input:'Private draft'}),false);assert.equal(vault.read(key()),null);
  assert.equal(vault.verifyUser(user),false);assert.equal(vault.write(key(),{input:'Private draft'}),true);
  const read=vault.read(key());read.input='Mutated clone';assert.equal(vault.read(key()).input,'Private draft');
  assert.equal(vault.read(key('chat',workspace,other)),null);assert.equal(vault.write(key('chat',workspace,other),{input:'Wrong user'}),false);
  assert.equal(vault.verifyUser(user),false);assert.equal(vault.read(key()).input,'Private draft');
});
test('suspension seals reads and writes until same-user server verification; repeated suspension does not extend TTL',()=>{
  let time=1000;const vault=createDraftVault({now:()=>time,ttlMs:100});vault.verifyUser(user);vault.write(key(),{input:'Recover me'});
  assert.equal(vault.suspend(other),false);assert.equal(vault.suspend(user),true);assert.equal(vault.read(key()),null);assert.equal(vault.write(key(),{input:'Forbidden'}),false);
  time=1050;assert.equal(vault.suspend(user),false);assert.equal(vault.verifyUser(user),true);assert.equal(vault.read(key()).input,'Recover me');
  vault.suspend(user);time=1150;assert.equal(vault.read(key()),null);assert.equal(vault.verifyUser(user),false);assert.equal(vault.read(key()),null);
});
test('different verified identity and explicit logout destroy prior drafts rather than merely hiding them',()=>{
  const vault=createDraftVault();vault.verifyUser(user);vault.write(key(),{input:'Previous account'});vault.suspend(user);
  assert.equal(vault.verifyUser(other),false);assert.equal(vault.read(key()),null);vault.verifyUser(user);assert.equal(vault.read(key()),null);
  vault.write(key(),{input:'Clear on logout'});vault.clear();assert.equal(vault.write(key(),{input:'No verification'}),false);vault.verifyUser(user);assert.equal(vault.read(key()),null);
});
test('workspace clearing is scoped and removes its active locator without evicting unrelated drafts',()=>{
  const vault=createDraftVault(),second=randomUUID();vault.verifyUser(user);
  vault.write(key(),{input:'A'});vault.write(key('chat',second),{input:'B'});
  vault.write(key('workspace','active'),{caseId:randomUUID(),workspaceKey:workspace,view:'chat'});
  vault.clearWorkspace(other,workspace);assert.equal(vault.read(key()).input,'A');
  vault.clearWorkspace(user,workspace);assert.equal(vault.read(key()),null);assert.equal(vault.read(key('workspace','active')),null);assert.equal(vault.read(key('chat',second)).input,'B');
  assert.equal(vault.remove(key('chat',second)),true);assert.equal(vault.remove(key('chat',second)),false);
});
test('only bounded plain JSON and approved features/keys are accepted',()=>{
  const vault=createDraftVault();vault.verifyUser(user);
  for(const value of [new Blob(['binary']),new Uint8Array([1]),new Date(),new Map(),undefined,()=>{},1n,NaN,Infinity])assert.equal(vault.write(key('documents'),{answers:{value}}),false);
  assert.equal(vault.write(key('settings'),{input:'Forbidden feature'}),false);
  assert.equal(vault.write(key(),{input:'Okay',images:[]}),false);assert.equal(vault.write(key(),{input:'x'.repeat(8001)}),false);
  assert.equal(vault.write(key(),{input:'Text',conversationId:'forged'}),false);
  assert.equal(vault.write(key('documents'),{answers:{items:Array(1001).fill('bounded')}}),false);
  let deep={};let cursor=deep;for(let i=0;i<10;i++){cursor.next={};cursor=cursor.next;}assert.equal(vault.write(key('documents'),{answers:deep}),false);
  const cycle={};cycle.self=cycle;assert.equal(vault.write(key('documents'),{answers:cycle}),false);
  assert.equal(vault.write(key('intake'),{sourceText:'Synthetic source',fields:[],assetIds:[randomUUID()],baseVersion:1,namesVerified:false}),true);
});
test('secrets, prototype keys, accessors and encoded image bodies cannot enter snapshots',()=>{
  const vault=createDraftVault();vault.verifyUser(user);
  for(const name of ['password','apiKey','API_KEY','accessToken','clientSecret','credentials','__proto__','constructor','prototype']){
    const answers=JSON.parse(`{"${name}":"not-a-real-secret"}`);assert.equal(vault.write(key('documents'),{answers}),false,name);
  }
  for(const input of ['data:image/png;base64,aGVsbG8=','data:text/plain,private','iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAA','A'.repeat(300)])assert.equal(vault.write(key(),{input}),false);
  let invoked=0;const snapshot={};Object.defineProperty(snapshot,'input',{enumerable:true,get(){invoked++;return 'No';}});assert.equal(vault.write(key(),snapshot),false);assert.equal(invoked,0);
  const proxy=new Proxy({input:'Validated descriptor value'},{get(target,name){if(name==='toJSON')return()=>({password:'injected'});return Reflect.get(target,name);}});
  assert.equal(vault.write(key(),proxy),true);assert.deepEqual(vault.read(key()),{input:'Validated descriptor value'});
});
test('entry/total caps reject atomically without silent eviction, including metadata byte accounting',()=>{
  const vault=createDraftVault({maxBytes:1000});vault.verifyUser(user);const snapshot={content:'ordinary draft words '.repeat(20)};
  assert.equal(vault.write(key('documents'),snapshot),true);assert.equal(vault.write(key('documents',randomUUID()),snapshot),false);assert.deepEqual(vault.read(key('documents')),snapshot);
  assert.equal(vault.write(key('documents'),{content:'ordinary draft words '.repeat(1000)}),false);assert.deepEqual(vault.read(key('documents')),snapshot);
  const larger=createDraftVault();larger.verifyUser(user);assert.equal(larger.write(key('documents'),{content:'ordinary draft words '.repeat(30000)}),false);
  for(let index=0;index<DRAFT_VAULT_LIMITS.entries;index++)assert.equal(larger.write(key('chat',randomUUID()),{input:'Q'}),true);
  assert.equal(larger.write(key('chat',randomUUID()),{input:'One too many'}),false);
});
test('clock reversal or invalid time fails closed and stale drafts never reappear',()=>{
  let time=1000;const vault=createDraftVault({now:()=>time});vault.verifyUser(user);vault.write(key(),{input:'Cannot survive reversal'});vault.suspend(user);
  time=999;assert.equal(vault.read(key()),null);assert.equal(vault.verifyUser(user),false);assert.equal(vault.read(key()),null);
  vault.write(key(),{input:'Fresh verified draft'});time=NaN;assert.equal(vault.read(key()),null);time=2000;vault.verifyUser(user);assert.equal(vault.read(key()),null);
});
