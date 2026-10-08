import test from 'node:test';
import assert from 'node:assert/strict';
import {serviceAvailabilityError} from './service-availability.js';
test('known own-account service limits are distinct from auth or global model configuration',()=>{
 const userId='synthetic-user';
 for(const [status,remaining,expected] of [['paused',10,'SERVICE_PAUSED'],['expired',10,'SERVICE_EXPIRED'],['available',0,'TRIAL_LIMIT_REACHED'],['available',3,null],['available',null,null]])assert.equal(serviceAvailabilityError({userId,service:{userId,status,remaining}}),expected);
 assert.equal(serviceAvailabilityError({userId}),null);assert.equal(serviceAvailabilityError({userId,service:{userId:'other',status:'paused'}}),null);
});
