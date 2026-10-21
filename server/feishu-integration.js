'use strict';
const crypto=require('node:crypto');
const {createFeishuClient,normalizeRemote,problem}=require('./feishu-client');
const {buildCard,mapFields,contentHash,millis}=require('./feishu-projection');
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const delay=attempt=>[60000,300000,900000,3600000][Math.min(3,Math.max(0,attempt-1))];
const machineCode=error=>/^[A-Z0-9_]{1,100}$/.test(error?.code||'')?error.code:'FEISHU_OPERATION_FAILED';
function createFeishuIntegration({db,env=process.env,client=createFeishuClient({env}),logger=console}={}) {
  const target=crypto.createHash('sha256').update((env.FEISHU_SYNC_APP_TOKEN||'')+':'+(env.FEISHU_SYNC_TABLE_ID||'')).digest('hex');
  const targetConfigured=Boolean(env.FEISHU_SYNC_APP_TOKEN&&env.FEISHU_SYNC_TABLE_ID);
  const controlKey='feishu:'+target;
  const configured=()=>({notifyEnabled:env.FEISHU_NOTIFY_ENABLED==='true',syncEnabled:env.FEISHU_SYNC_ENABLED==='true',notifyConfigured:Boolean(env.FEISHU_BOT_WEBHOOK&&Number.isFinite(Date.parse(env.FEISHU_NOTIFY_SINCE))),syncConfigured:Boolean(targetConfigured&&env.FEISHU_APP_ID&&env.FEISHU_APP_SECRET)});
  let timer,running=false,stopped=false,alternate=false;
  async function touch(tx,id) {
    await tx.query('UPDATE registrations SET sync_version=sync_version+1,sync_changed_at=UTC_TIMESTAMP(3) WHERE id=?',[id]);
    if(targetConfigured)await tx.query("INSERT INTO feishu_sync_state(registration_id,target_key,desired_version) SELECT id,?,sync_version FROM registrations WHERE id=? ON DUPLICATE KEY UPDATE desired_version=VALUES(desired_version),status=IF(feishu_sync_state.status='blocked','blocked','pending'),attempts=0,next_attempt_at=UTC_TIMESTAMP(3)",[target,id]);
  }
  async function capture(tx,id,kind='changed',detail={}) {
    await touch(tx,id);
    if(!['registration_created','material_uploaded'].includes(kind))return;
    const row=(await tx.query('SELECT id,ref,full_name,company,job_title,ticket_name,amount,currency FROM registrations WHERE id=?',[id]))[0];
    if(!row)throw problem('FEISHU_REGISTRATION_MISSING');
    const eventId=crypto.randomUUID(),now=new Date();
    const snapshot={ref:row.ref,full_name:row.full_name,company:row.company,job_title:row.job_title,ticket_name:row.ticket_name,amount:row.amount,currency:row.currency,...(kind==='material_uploaded'?{kind:detail.kind,version:detail.version}:{})};
    await tx.query('INSERT INTO integration_events(id,registration_id,kind,snapshot,occurred_at) VALUES (?,?,?,?,?)',[eventId,id,kind,JSON.stringify(snapshot),now]);
    const since=Date.parse(env.FEISHU_NOTIFY_SINCE);
    if(Number.isFinite(since)&&now.getTime()>=since)await tx.query('INSERT INTO integration_jobs(id,event_id,registration_id,dedupe_key) VALUES (?,?,?,?)',[crypto.randomUUID(),eventId,id,'feishu_bot:'+eventId]);
  }
  async function snapshot(id) {
    return db.transaction(async tx=>{
      const row=(await tx.query('SELECT * FROM registrations WHERE id=?',[id]))[0];
      if(!row)throw problem('FEISHU_REGISTRATION_MISSING',true);
      const items=await tx.query('SELECT m.kind,m.version_no,m.current_version_id,v.status,v.uploaded_at FROM material_items m LEFT JOIN material_versions v ON v.id=m.current_version_id WHERE m.registration_id=?',[id]);
      const consents=await tx.query('SELECT kind,granted FROM publication_consents WHERE registration_id=?',[id]);
      return {row,fields:mapFields(row,items,consents,env)};
    });
  }
  async function backfill() {
    if(!targetConfigured)throw problem('FEISHU_TARGET_NOT_CONFIGURED',true);
    await db.query("INSERT INTO feishu_sync_state(registration_id,target_key,desired_version) SELECT id,?,sync_version FROM registrations WHERE event_key='conference-2026' ON DUPLICATE KEY UPDATE desired_version=GREATEST(feishu_sync_state.desired_version,VALUES(desired_version)),status=IF(feishu_sync_state.status='synced' AND feishu_sync_state.synced_version<VALUES(desired_version),'pending',feishu_sync_state.status)",[target]);
  }
  async function control() {
    await db.query("INSERT IGNORE INTO integration_control(control_key,value_json) VALUES (?,JSON_OBJECT('requested',false,'lastSweep',0,'lastReconcile',0))",[controlKey]);
    return parse((await db.query('SELECT value_json FROM integration_control WHERE control_key=?',[controlKey]))[0].value_json);
  }
  async function patchControl(values) {
    for(const [key,value] of Object.entries(values))await db.query('UPDATE integration_control SET value_json=JSON_SET(value_json,?,CAST(? AS JSON)) WHERE control_key=?',['$.'+key,JSON.stringify(value),controlKey]);
  }
  async function requestReconcile() {
    await control();
    await patchControl({requested:true});
    return {queued:true};
  }
  async function reconcile() {
    await backfill();
    const remote=await client.listRecords(),byId=new Map();
    for(const record of remote){const fields=normalizeRemote(record.fields||{}),id=fields['数据库ID'];if(!id)continue;if(!byId.has(id))byId.set(id,[]);byId.get(id).push({...record,normalized:fields});}
    let last='',checked=0,repaired=0,duplicates=0;
    for(;;){
      const rows=await db.query("SELECT id FROM registrations WHERE event_key='conference-2026' AND id>? ORDER BY id LIMIT 100",[last]);
      if(!rows.length)break;
      for(const {id} of rows){
        const current=await snapshot(id),state=(await db.query('SELECT * FROM feishu_sync_state WHERE registration_id=? AND target_key=?',[id,target]))[0];
        const matches=(byId.get(id)||[]).sort((a,b)=>a.record_id.localeCompare(b.record_id));
        const chosen=matches.find(r=>r.record_id===state.record_id)||matches[0];
        for(const record of matches.filter(r=>r!==chosen)){if(!record.normalized['同步重复'])await client.updateRecord(record.record_id,{'同步重复':true});duplicates++;}
        if(!chosen||contentHash(chosen.normalized)!==contentHash(current.fields)||Number(chosen.normalized['同步版本'])!==Number(current.row.sync_version)){
          await db.query("UPDATE feishu_sync_state SET record_id=?,status=IF(status='blocked','blocked','pending'),attempts=0,next_attempt_at=UTC_TIMESTAMP(3) WHERE registration_id=? AND target_key=?",[chosen?.record_id||null,id,target]);repaired++;
        }
        checked++;
      }
      last=rows.at(-1).id;
    }
    return {checked,repaired,duplicates};
  }
  async function sendOne() {
    const settings=configured();if(!settings.notifyEnabled)return false;
    // The last attempt is stored under the global worker lock, including failed calls.
    await db.query("INSERT IGNORE INTO integration_control(control_key,value_json) VALUES ('feishu:bot-rate',JSON_OBJECT('lastAttempt',0))");
    const rate=parse((await db.query("SELECT value_json FROM integration_control WHERE control_key='feishu:bot-rate'"))[0].value_json);
    if(Date.now()-Number(rate.lastAttempt||0)<1000)return false;
    const job=(await db.query("SELECT j.*,e.kind,e.snapshot,e.occurred_at FROM integration_jobs j JOIN integration_events e ON e.id=j.event_id WHERE j.status='pending' AND j.next_attempt_at<=UTC_TIMESTAMP(3) ORDER BY j.created_at,j.id LIMIT 1"))[0];
    if(!job)return false;
    await db.query("UPDATE integration_control SET value_json=JSON_OBJECT('lastAttempt',?) WHERE control_key='feishu:bot-rate'",[Date.now()]);
    await db.query("UPDATE integration_jobs SET status='processing',attempts=attempts+1 WHERE id=?",[job.id]);
    try {
      await client.notify(buildCard({id:job.event_id,kind:job.kind,snapshot:parse(job.snapshot),occurredAt:job.occurred_at},env));
      await db.query("UPDATE integration_jobs SET status='sent',sent_at=UTC_TIMESTAMP(3),last_error='' WHERE id=?",[job.id]);
    }catch(error){await db.query('UPDATE integration_jobs SET status=?,last_error=?,next_attempt_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? MICROSECOND) WHERE id=?',[error.blocked?'blocked':Number(job.attempts)+1>=8?'failed':'pending',machineCode(error),delay(Number(job.attempts)+1)*1000,job.id]);}
    return true;
  }
  async function syncOne() {
    if(!configured().syncEnabled)return false;
    const state=(await db.query("SELECT * FROM feishu_sync_state WHERE target_key=? AND status='pending' AND next_attempt_at<=UTC_TIMESTAMP(3) ORDER BY next_attempt_at,registration_id LIMIT 1",[target]))[0];
    if(!state)return false;
    await db.query("UPDATE feishu_sync_state SET status='processing',attempts=attempts+1 WHERE registration_id=? AND target_key=?",[state.registration_id,target]);
    try {
      const current=await snapshot(state.registration_id),version=Number(current.row.sync_version);
      const record=await client.upsert(state.record_id,{...current.fields,'最近成功同步时间':Date.now()},target+':'+state.registration_id);
      await db.query("UPDATE feishu_sync_state SET record_id=?,synced_version=?,status=IF(desired_version>?,'pending','synced'),attempts=0,last_error='',synced_at=UTC_TIMESTAMP(3),content_hash=?,next_attempt_at=UTC_TIMESTAMP(3) WHERE registration_id=? AND target_key=?",[record.record_id,version,version,current.fields['内容摘要'],state.registration_id,target]);
    }catch(error){await db.query('UPDATE feishu_sync_state SET status=?,last_error=?,next_attempt_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? MICROSECOND) WHERE registration_id=? AND target_key=?',[error.blocked?'blocked':Number(state.attempts)+1>=8?'failed':'pending',machineCode(error),delay(Number(state.attempts)+1)*1000,state.registration_id,target]);}
    return true;
  }
  async function recover() {
    // Only runs while holding the cross-process lock: processing rows belong to an interrupted run.
    await db.query("UPDATE integration_jobs SET status=IF(attempts>=8,'failed','pending'),last_error='FEISHU_DELIVERY_UNCERTAIN',next_attempt_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 60 SECOND) WHERE status='processing'");
    await db.query("UPDATE feishu_sync_state SET status=IF(attempts>=8,'failed','pending'),last_error='FEISHU_DELIVERY_UNCERTAIN',next_attempt_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 60 SECOND) WHERE target_key=? AND status='processing'",[target]);
  }
  async function runOnce() {
    if(running||stopped||(!configured().notifyEnabled&&!configured().syncEnabled))return false;
    running=true;
    try {
      return await db.withNamedLock('feishu-worker',async guard=>{
        await recover();
        // Process one channel first, then maintain the projection without delaying notifications.
        alternate=!alternate;
        if(alternate)await sendOne();else await syncOne();
        await guard();
        if(alternate)await syncOne();else await sendOne();
        await guard();
        if(configured().syncEnabled){
          const state=await control();
          if(Date.now()-Number(state.lastSweep||0)>=300000){await backfill();await patchControl({lastSweep:Date.now()});}
          if(state.requested||Date.now()-Number(state.lastReconcile||0)>=86400000){
            await patchControl({requested:false});
            try{const result=await reconcile();await patchControl({lastReconcile:Date.now(),result,lastError:''});}
            catch(error){await patchControl({lastReconcile:Date.now(),lastError:machineCode(error)});}
          }
        }
        return true;
      });
    } finally {running=false;}
  }
  async function status() {
    const jobs=await db.query('SELECT status,COUNT(*) AS count,MIN(created_at) AS oldest FROM integration_jobs GROUP BY status');
    const sync=await db.query('SELECT status,COUNT(*) AS count,MIN(next_attempt_at) AS oldest,MAX(synced_at) AS lastSuccess FROM feishu_sync_state WHERE target_key=? GROUP BY status',[target]);
    const info=await db.query('SELECT value_json,updated_at FROM integration_control WHERE control_key=?',[controlKey]);
    const failures=await db.query("SELECT '通知' AS channel,r.ref,j.id AS jobId,j.last_error AS error FROM integration_jobs j JOIN registrations r ON r.id=j.registration_id WHERE j.status IN ('failed','blocked') UNION ALL SELECT '表格' AS channel,r.ref,NULL AS jobId,s.last_error AS error FROM feishu_sync_state s JOIN registrations r ON r.id=s.registration_id WHERE s.target_key=? AND s.status IN ('failed','blocked') LIMIT 30",[target]);
    return {...configured(),jobs,sync,failures,reconciliation:info[0]?{...parse(info[0].value_json),updatedAt:info[0].updated_at}:null};
  }
  async function retry(input={}) {
    if(!input.jobId&&!input.ref)throw Object.assign(Error('Provide jobId or registration ref'),{statusCode:400});
    const id=String(input.jobId||'').slice(0,36),ref=String(input.ref||'').slice(0,100);
    await db.query("UPDATE integration_jobs j JOIN registrations r ON r.id=j.registration_id SET j.status='pending',j.attempts=0,j.next_attempt_at=UTC_TIMESTAMP(3),j.last_error='' WHERE j.status IN ('failed','blocked') AND (j.id=? OR r.ref=?)",[id,ref]);
    if(ref)await db.query("UPDATE feishu_sync_state s JOIN registrations r ON r.id=s.registration_id SET s.status='pending',s.attempts=0,s.next_attempt_at=UTC_TIMESTAMP(3),s.last_error='' WHERE s.target_key=? AND r.ref=? AND s.status IN ('failed','blocked')",[target,ref]);
    return {queued:true};
  }
  function start(){if(timer)return;stopped=false;const tick=()=>runOnce().catch(error=>logger.error('[feishu]',machineCode(error)));timer=setInterval(tick,1000);timer.unref?.();tick();}
  function stop(){stopped=true;if(timer)clearInterval(timer);timer=null;}
  return {capture,touch,configured,snapshot,backfill,reconcile,requestReconcile,status,retry,runOnce,start,stop,target};
}
module.exports={createFeishuIntegration,delay,machineCode};
