'use strict';
const crypto = require('node:crypto');
function encryptionKey(raw) {
  const key = Buffer.from(raw || '', 'base64');
  if (key.length !== 32 || key.toString('base64') !== raw) throw Object.assign(new Error('MAIL_PAYLOAD_KEY must be a stable base64-encoded 32-byte key'), {statusCode:503,code:'MAIL_NOT_CONFIGURED'});
  return key;
}
function encryptPayload(payload, rawKey) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(rawKey), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(payload),'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64');
}
function decryptPayload(payload, rawKey) {
  const buffer = Buffer.from(payload,'base64'), decipher = crypto.createDecipheriv('aes-256-gcm',encryptionKey(rawKey),buffer.subarray(0,12));
  decipher.setAuthTag(buffer.subarray(12,28));
  return JSON.parse(Buffer.concat([decipher.update(buffer.subarray(28)),decipher.final()]).toString('utf8'));
}
const retryDelay = attempts => [60000,300000,900000,3600000][Math.min(3,Math.max(0,attempts-1))];
function createMailOutbox({ db, env = process.env, send, integrations, logger = console }) {
  const key = env.MAIL_PAYLOAD_KEY;
  const configured = () => Boolean(env.SMTP_PASS && key);
  let timer, running = false, stopped = false;
  async function enqueue(tx, registrationId, kind, payload, dedupeKey = crypto.randomUUID()) {
    // Saving registration never depends on SMTP being configured.
    if (!configured()) return { skipped:true,reason:'SMTP not configured',status:'Not configured' };
    const id = crypto.randomUUID();
    const snapshot = {to:payload.to,...(payload.cc?{cc:payload.cc}:{}),subject:payload.subject,text:payload.text||''};
    const recipient = String(typeof payload.to==='object'?payload.to.address:payload.to||'').slice(0,320);
    await tx.query("INSERT INTO mail_jobs(id,registration_id,kind,dedupe_key,encrypted_payload,encrypted_snapshot,recipient,subject,status,attempts,next_attempt_at) VALUES (?,?,?,?,?,?,?,?,'pending',0,UTC_TIMESTAMP(3))", [id,registrationId,kind,dedupeKey,encryptPayload(payload,key),encryptPayload(snapshot,key),recipient,String(payload.subject||'').slice(0,998)]);
    return { queued:true,status:'Queued',jobId:id };
  }
  async function claim() {
    return db.transaction(async tx => {
      // A final attempt interrupted during delivery is ambiguous, not endlessly retryable.
      const interrupted=integrations?await tx.query("SELECT DISTINCT registration_id FROM mail_jobs WHERE status='processing' AND lease_until<UTC_TIMESTAMP(3) AND attempts>=5"):[];
      await tx.query("UPDATE registrations r JOIN mail_jobs j ON j.registration_id=r.id SET r.email_status='Failed' WHERE j.kind='registration' AND j.status='processing' AND j.lease_until<UTC_TIMESTAMP(3) AND j.attempts>=5 AND r.email_status='Queued'");
      await tx.query("UPDATE mail_jobs SET status='failed',last_error='Delivery interrupted; check delivery before resending',lease_until=NULL,lease_token=NULL WHERE status='processing' AND lease_until<UTC_TIMESTAMP(3) AND attempts>=5");
      for(const row of interrupted)await integrations.capture(tx,row.registration_id);
      const rows = await tx.query("SELECT * FROM mail_jobs WHERE attempts<5 AND ((status='pending' AND next_attempt_at<=UTC_TIMESTAMP(3)) OR (status='processing' AND lease_until<UTC_TIMESTAMP(3))) ORDER BY next_attempt_at,id LIMIT 1 FOR UPDATE SKIP LOCKED");
      if (!rows.length) return null;
      const job=rows[0], leaseToken=crypto.randomUUID();
      await tx.query("UPDATE mail_jobs SET status='processing',attempts=attempts+1,lease_token=?,lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 120 SECOND) WHERE id=?",[leaseToken,job.id]);
      return {...job,attempts:job.attempts+1,leaseToken};
    });
  }
  async function runOnce() {
    if (running || stopped || !configured()) return false;
    running=true;
    try {
      const job=await claim(); if(!job)return false;
      let result,problem;
      try { result=await send(decryptPayload(job.encrypted_payload,key),job); if(!result?.sent)throw new Error('SMTP did not confirm delivery'); }
      catch(error){ problem=error; }
      await db.transaction(async tx=>{
        const rows=await tx.query('SELECT id FROM mail_jobs WHERE id=? AND lease_token=? FOR UPDATE',[job.id,job.leaseToken]);
        if(!rows.length)return;
        if(!problem) {
          await tx.query("UPDATE mail_jobs SET status='sent',encrypted_payload=NULL,sent_at=UTC_TIMESTAMP(3),message_id=?,last_error='',lease_until=NULL,lease_token=NULL WHERE id=?",[String(result.id||'').slice(0,255),job.id]);
          await tx.query(job.kind==='registration' ? "UPDATE registrations SET email_status='Sent',email_sent_at=UTC_TIMESTAMP(3) WHERE id=?" : "UPDATE registrations SET updated_at=UTC_TIMESTAMP(3) WHERE id=?",[job.registration_id]);
        } else {
          // SMTP errors may include addresses/URLs. Store only the bounded machine code.
          const reason=String(problem.code||'SMTP_DELIVERY_FAILED').replace(/[^A-Z0-9_-]/gi,'').slice(0,80)||'SMTP_DELIVERY_FAILED';
          await tx.query('UPDATE mail_jobs SET status=?,next_attempt_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? MICROSECOND),last_error=?,lease_until=NULL,lease_token=NULL WHERE id=?',[job.attempts>=5?'failed':'pending',retryDelay(job.attempts)*1000,reason,job.id]);
          if(job.kind==='registration')await tx.query('UPDATE registrations SET email_status=? WHERE id=?',[job.attempts>=5?'Failed':'Queued',job.registration_id]);
        }
        await integrations?.capture(tx,job.registration_id);
      });
      return true;
    } finally { running=false; }
  }
  function start() {
    if(timer||!configured())return;
    stopped=false;
    const tick=()=>runOnce().catch(error=>logger.error('[mail] queue unavailable',error.code||'DATABASE_UNAVAILABLE'));
    timer=setInterval(tick,5000); timer.unref?.(); tick();
  }
  function stop(){stopped=true;if(timer)clearInterval(timer);timer=null;}
  return {enqueue,runOnce,start,stop,configured};
}
module.exports={createMailOutbox,encryptPayload,decryptPayload,retryDelay};
