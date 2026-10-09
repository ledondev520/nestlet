import test from 'node:test';
import assert from 'node:assert/strict';
import {caseReviewRows,savedAgencyId} from './case-review-status.js';
test('a ready letter does not turn unreviewed, missing or conflicting optional case facts into passed checks',()=>{
 const record={fields:[{key:'property',value:'128 Synthetic Lane',confirmed:true},{key:'pha',value:'SFHA',confirmed:false},{key:'rent',value:'$3400',confirmed:true,conflict:true}]};
 const rows=caseReviewRows(record,{ready:true,missing:[],omittedOptionalKeys:['pha','rent','caseReference','owner']});
 assert.deepEqual(rows.map(row=>[row.key,row.state,row.omitted]),[['property','reviewed',false],['owner','missing',true],['pha','unconfirmed',true],['caseReference','missing',true],['rent','conflict',true]]);
 assert.equal(rows.some(row=>row.blocksDocument),false);
 assert.equal(caseReviewRows(record,{missing:[{key:'property'}]})[0].blocksDocument,true);
});
test('reference matching reads only the saved authority, never the property location or an ambiguous/conflicting value',()=>{
 const record=value=>({fields:[{key:'property',value:'San Francisco'},{key:'pha',value}]});
 assert.equal(savedAgencyId(record('SFHA')), 'sfha');
 assert.equal(savedAgencyId(record('Oakland Housing Authority')), 'oha');
 assert.equal(savedAgencyId(record('HACA')), 'haca');
 assert.equal(savedAgencyId(record('SCCHA')), 'sccha');
 assert.equal(savedAgencyId(record('SFHA / OHA')),null);
 assert.equal(savedAgencyId(record('')),null);
 assert.equal(savedAgencyId({fields:[{key:'pha',value:'SFHA',conflict:true}]}),null);
});
