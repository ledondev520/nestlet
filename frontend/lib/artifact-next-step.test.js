import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { artifactNextStep } from './artifact-next-step.js';
const record = {id:randomUUID(),version:4,draftType:'followup'};
const artifact = overrides => ({id:randomUUID(),caseId:record.id,kind:'followup',status:'final',version:3,sourceCaseVersion:4,currentCaseVersion:4,isStale:false,needsRegeneration:false,...overrides});
test('artifact version and case version are distinct; latest current final wins without hiding a newer draft', () => {
  const older = artifact({version:1}), final = artifact({version:3}), draft = artifact({version:5,status:'draft'}), rows=[draft,older,final];
  assert.deepEqual(artifactNextStep(record,rows),{phase:'final',artifact:final,newerDraft:draft});
  assert.deepEqual(rows,[draft,older,final],'does not sort caller state in place');
});
test('only drafts, historical finals, empty selected kind and unknown inventory stay distinct', () => {
  const draft=artifact({status:'draft'}), historical=artifact({sourceCaseVersion:2,isStale:true,needsRegeneration:true});
  assert.equal(artifactNextStep(record,[draft]).phase,'draft');
  assert.equal(artifactNextStep(record,[historical]).phase,'historical');
  assert.equal(artifactNextStep(record,[]).phase,'empty');
  assert.equal(artifactNextStep(record,[draft],'status-summary').phase,'empty');
  assert.equal(artifactNextStep(record,null).phase,'unknown');
});
test('missing flags, mismatched versions/kind/case and malformed IDs cannot claim a current final', () => {
  for(const values of [{isStale:undefined},{needsRegeneration:undefined},{sourceCaseVersion:3},{currentCaseVersion:5},{caseId:randomUUID()},{id:'javascript:bad'},{version:0},{sourceCaseVersion:0},{kind:'unknown'},{status:'approved'}]) {
    const result=artifactNextStep(record,[artifact(values)]);assert.equal(result.phase,'unknown',JSON.stringify(values));assert.equal(result.artifact,null);
  }
});
test('historical draft cannot displace a current final and other document kinds never become primary', () => {
  const final=artifact(), historicalDraft=artifact({version:8,status:'draft',sourceCaseVersion:2,isStale:true}), other=artifact({version:9,kind:'status-summary'});
  const result=artifactNextStep(record,[historicalDraft,other,final]);assert.equal(result.artifact,final);assert.equal(result.newerDraft,null);
  assert.equal(artifactNextStep(record,[historicalDraft,other,final],'status-summary').artifact,other);
});
