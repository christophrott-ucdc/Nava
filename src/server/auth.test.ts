import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createAuth} from './auth';
import type {AppConfig} from '../shared/types';

test('successful logins do not spend failure quota; concurrent failures stay bounded',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'nava-auth-quota-'));
 const auth=createAuth({config:{security:{operatorPin:'9384',screenToken:'',sessionTtlMin:30,usersFile:'users.json'}} as AppConfig,appRoot:root,log:()=>{}});
 await auth.load();await auth.users.create("admin","admin","9384");
 const login=(pin:string)=>auth.router.request('/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:pin==='9384'?'admin':'unknown',pin})});
 try{
  for(let i=0;i<20;i++)assert.equal((await login('9384')).status,200,`successful login ${i+1}`);
  for(let i=0;i<3;i++)assert.equal((await login('1111')).status,401);
  assert.equal((await login('9384')).status,200,'success refunds itself without clearing prior failures');
  const attempts=await Promise.all(Array.from({length:16},()=>login('1111')));
  assert.equal(attempts.filter(r=>r.status===401).length,5);
  assert.equal(attempts.filter(r=>r.status===429).length,11);
  assert.equal((await login('9384')).status,429,'failure lockout still applies to valid credentials');
 }finally{
  for(const session of auth.sessions())await auth.revoke(session.token);
  await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 }
});
