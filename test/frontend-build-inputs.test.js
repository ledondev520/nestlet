// Builds from the Docker frontend stage's copied source subset using the pinned
// installed dependencies. This is build-input coverage, not a Docker image run.
import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdir,mkdtemp,readFile,realpath,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('Docker frontend COPY inputs include every transitive browser build dependency',async()=>{
 const root=new URL('../',import.meta.url),docker=await readFile(new URL('Dockerfile',root),'utf8');
 const stage=docker.split('AS frontend-build')[1]?.split(/^FROM /m)[0];assert.ok(stage);
 const directory=await mkdtemp(join(tmpdir(),'nestlet-frontend-build-inputs-'));
 try{
  for(const line of stage.split('\n').filter(line=>line.startsWith('COPY '))){
   const parts=line.slice(5).trim().split(/\s+/u),destination=parts.pop();
   assert.ok(!parts.some(part=>part.startsWith('--')||part.includes('*')),'Keep the stage source-copy contract explicit');
   for(const source of parts){
    const target=join(directory,destination.endsWith('/')?join(destination,basename(source)):destination);
    await mkdir(join(target,'..'),{recursive:true});await cp(new URL(source,root),target,{recursive:true});
   }
  }
  await symlink(await realpath(new URL('node_modules',root)),join(directory,'node_modules'),'dir');
  const result=spawnSync(process.execPath,[await realpath(new URL('node_modules/vite/bin/vite.js',root)),'build'],{cwd:directory,encoding:'utf8',timeout:30000});
  assert.equal(result.status,0,`${result.error?.message||''}\n${result.stdout}\n${result.stderr}`);
  const ignore=await readFile(new URL('.dockerignore',root),'utf8');assert.match(ignore,/^!document-context\.js$/mu);
 }finally{await rm(directory,{recursive:true,force:true});}
});
