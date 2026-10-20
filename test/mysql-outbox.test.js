'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {mysqlFixture,insertRegistration}=require('./helpers/mysql');
const {createMailOutbox,decryptPayload}=require('../server/mail-outbox');
const integration=(name,fn)=>test(name,{skip:process.env.RUN_MYSQL_TESTS!=='1'},fn);
integration('mail queue persists encrypted payload and retries failures without repeating registration',async t=>{
 const {db,env}=await mysqlFixture(t);env.MAIL_PAYLOAD_KEY=crypto.randomBytes(32).toString('base64');env.SMTP_PASS='mock';const reg=await insertRegistration(db);
 let fails=true,sent=0;const worker=createMailOutbox({db,env,send:async()=>{sent++;if(fails)throw Object.assign(Error('private email secret'),{code:'ETIMEDOUT'});return{sent:true,id:'mock-message'}}});
 await db.transaction(tx=>worker.enqueue(tx,reg.id,'registration',{to:'a@example.com',text:'private token'},'unique'));
 const [job]=await db.query('SELECT * FROM mail_jobs');assert.ok(!job.encrypted_payload.includes('private token'));assert.equal(decryptPayload(job.encrypted_payload,env.MAIL_PAYLOAD_KEY).text,'private token');
 await worker.runOnce();const [failed]=await db.query('SELECT * FROM mail_jobs');assert.equal(failed.attempts,1);assert.equal(failed.status,'pending');assert.equal(failed.last_error,'ETIMEDOUT');assert.equal((await db.query('SELECT * FROM registrations')).length,1);
 fails=false;await db.query('UPDATE mail_jobs SET next_attempt_at=UTC_TIMESTAMP(3)');await worker.runOnce();const [done]=await db.query('SELECT * FROM mail_jobs');assert.equal(done.status,'sent');assert.equal(done.encrypted_payload,null);assert.equal((await db.query('SELECT email_status FROM registrations'))[0].email_status,'Sent');
 await worker.runOnce();assert.equal(sent,2);
});
integration('independent mail workers claim a job once and recover an expired lease after restart',async t=>{
 const {db,env}=await mysqlFixture(t);Object.assign(env,{MAIL_PAYLOAD_KEY:crypto.randomBytes(32).toString('base64'),SMTP_PASS:'mock'});const reg=await insertRegistration(db);let sent=0;
 const options={db,env,send:async()=>{sent++;return{sent:true}}},a=createMailOutbox(options),b=createMailOutbox(options);
 await db.transaction(tx=>a.enqueue(tx,reg.id,'registration',{text:'test'},'job1'));await Promise.all([a.runOnce(),b.runOnce()]);assert.equal(sent,1);
 await db.transaction(tx=>a.enqueue(tx,reg.id,'registration',{text:'restart'},'job2'));await db.query("UPDATE mail_jobs SET status='processing',attempts=1,lease_until=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 5 SECOND) WHERE dedupe_key='job2'");await b.runOnce();assert.equal(sent,2);
 await db.transaction(tx=>a.enqueue(tx,reg.id,'registration',{text:'exhausted'},'job3'));await db.query("UPDATE registrations SET email_status='Queued'");await db.query("UPDATE mail_jobs SET status='processing',attempts=5,lease_until=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 5 SECOND) WHERE dedupe_key='job3'");await a.runOnce();assert.equal((await db.query("SELECT status FROM mail_jobs WHERE dedupe_key='job3'"))[0].status,'failed');assert.equal((await db.query('SELECT email_status FROM registrations'))[0].email_status,'Failed');assert.equal(sent,2);
});
