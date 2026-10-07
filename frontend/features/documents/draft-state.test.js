// Pure recovery-snapshot validation. Account verification/expiry is owned by the shared vault.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validDocumentRecovery,documentDraftSnapshot} from './draft-state.js';
const caseId='b3bef325-f4f3-4f5c-872b-42b6d874c111', otherId='b3bef325-f4f3-4f5c-872b-42b6d874c222';
const state=()=>({record:{id:caseId,version:4,draftText:'SERVER READ-ONLY DRAFT',namesVerified:false,sourceText:'SERVER SOURCE NOT TO CACHE'},
  kind:'followup',content:'SERVER READ-ONLY DRAFT',artifactTitle:'',saveStatus:'draft',answers:{property:{value:'Unsaved address'}},namesVerified:false,
  selected:null,issueForm:null,issueBaseline:'',detailForm:{key:'senderRole',value:'',notApplicable:false,touched:false},recoveryBaseVersion:null});
test('recovery snapshots retain only pending edits and references, never read-only case/history bodies',()=>{
  const draft=documentDraftSnapshot(state());
  assert.deepEqual(draft,{caseId,baseVersion:4,kind:'followup',answers:{property:{value:'Unsaved address'}}});
  assert.doesNotMatch(JSON.stringify(draft),/SERVER READ-ONLY|SERVER SOURCE|record|history/);
});
test('edited body, optional detail and question survive as bounded unconfirmed inputs',()=>{
  const current=state();current.content='UNSAVED HUMAN EDIT';current.artifactTitle='My edited title';current.issueForm={question:'Unanswered question',resolution:'',status:'pending',sourceMessageId:null};
  current.detailForm={key:'senderRole',value:'Unsaved operator role',notApplicable:false,touched:true};
  const snapshot=documentDraftSnapshot(current);
  assert.equal(snapshot.content,'UNSAVED HUMAN EDIT');assert.equal(snapshot.detailForm.value,'Unsaved operator role');
  assert.equal(validDocumentRecovery(snapshot,caseId),true);assert.equal(validDocumentRecovery(snapshot,otherId),false);
  assert.equal(Object.hasOwn(snapshot,'confirmed'),false);
});
test('recovery validation rejects unknown keys, credentials, invalid identifiers and injected confirmation metadata',()=>{
  const valid=documentDraftSnapshot(state());
  for(const bad of [null,[],{...valid,password:'must-not-cache'},{...valid,baseVersion:0},{...valid,selectedArtifactId:'other/path'},
    {...valid,content:'x'.repeat(50001)},{...valid,answers:{property:{value:'x',confirmed:true}}},
    {...valid,answers:{unknownField:'x'}},{...valid,issueForm:{question:'x',resolution:'',status:'approved'}},
    {...valid,detailForm:{key:'role',value:'owner',notApplicable:false,touched:true}}]) assert.equal(validDocumentRecovery(bad,caseId),false);
});
test('a restored older base version remains the baseline until explicit reconciliation',()=>{
  const current=state();current.record.version=7;current.recoveryBaseVersion=4;
  assert.equal(documentDraftSnapshot(current).baseVersion,4);
  current.recoveryBaseVersion=null;assert.equal(documentDraftSnapshot(current).baseVersion,7);
});
