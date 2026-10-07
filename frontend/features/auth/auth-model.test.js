// Pure business-boundary tests only; no browser or live provider evidence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authPayload, settingsPayload, providerStatus, canManageProvider } from './auth-model.js';
import { authErrorMessage, COPY } from './copy.js';

test('real username/password contract keeps six-character passwords and rejects invalid bounds', () => {
  assert.equal(authPayload('login',{username:'member',password:'12345'}).code,'PASSWORD_LENGTH');
  assert.equal(authPayload('login',{username:'member',password:'x'.repeat(257)}).code,'PASSWORD_LENGTH');
  const valid=authPayload('login',{username:' Owner ',password:' 1234 '});
  assert.deepEqual(valid.payload,{username:'Owner',password:' 1234 '});
  assert.equal(authPayload('login',{username:'person@example.invalid',password:'123456'}).code,'AUTH_USERNAME_INVALID');
});

test('registration validates confirmation and sends no client-selected role',()=>{
  assert.equal(authPayload('register',{username:'member',password:'123456',passwordConfirmation:'654321'}).code,'PASSWORD_MISMATCH');
  assert.equal(authPayload('register',{username:'owner',password:'123456',passwordConfirmation:'123456'}).code,'AUTH_USERNAME_RESERVED');
  assert.deepEqual(authPayload('register',{username:'member',password:'123456',passwordConfirmation:'123456',role:'owner'}).payload,{username:'member',password:'123456',passwordConfirmation:'123456'});
});

test('provider settings are unavailable without an authenticated authorized owner',()=>{
  assert.equal(canManageProvider({authenticated:true,role:'trial',canManageSettings:true}),false);
  assert.equal(canManageProvider({authenticated:false,role:'owner',canManageSettings:true}),false);
  assert.equal(canManageProvider({authenticated:true,role:'owner',canManageSettings:true}),true);
});

test('sanitized provider status never carries key bytes or arbitrary model/endpoint text',()=>{
  const secret='public-fixture-key-never-render';
  const view=providerStatus({configured:true,apiKey:secret,model:secret,providerEndpoint:secret,keyStorage:'server-memory',connectionVerifiedAt:secret,liveEnabled:false});
  assert.equal(JSON.stringify(view).includes(secret),false);
  assert.equal(view.model,'deepseek-flash');assert.equal(view.configured,true);assert.equal(view.verifiedAt,null);
});

test('blank key preserves the configured key and enablement requires a key',()=>{
  assert.deepEqual(settingsPayload({apiKey:'',enableLive:true,configured:true}).payload,{enableLive:true});
  assert.equal(settingsPayload({apiKey:'',enableLive:true,configured:false}).code,'API_KEY_REQUIRED');
  assert.equal(settingsPayload({apiKey:'short',enableLive:false,configured:false}).code,'API_KEY_INVALID');
  assert.deepEqual(settingsPayload({apiKey:' public-fixture-key-1234 ',enableLive:false,configured:false}).payload,{enableLive:false,apiKey:'public-fixture-key-1234'});
});

test('all interface copy is bilingual and raw backend exception text never becomes UI copy',()=>{
  assert.deepEqual(Object.keys(COPY.zh).sort(),Object.keys(COPY.en).sort());
  const secret='public-fixture-secret';
  for(const lang of ['zh','en']) assert.equal(authErrorMessage({code:'UNRECOGNIZED',message:secret,details:secret},lang).includes(secret),false);
});
