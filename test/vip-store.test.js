const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

function fixture(t) {
  const { VipStore } = require('../server/vip-store');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lpclub-vip-'));
  const options={filename:path.join(dir,'vip.sqlite'),key:crypto.randomBytes(32).toString('base64')};
  const store=new VipStore(options);
  t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true})});
  return {store,options};
}
function claim(code,key=crypto.randomUUID(),email='jane@example-capital.com') {
  return {code,idempotencyKey:key,email,packageId:'gp_ticket',requestHash:'hash-'+key,registrationRef:'LPC26-'+crypto.randomBytes(4).toString('hex')};
}

test('generated codes are unique, encrypted at rest and searchable by case-insensitive input',t=>{
  const {store,options}=fixture(t);const rows=store.generate({count:2,batchName:'Partners'});
  assert.equal(rows.length,2);const full=store.detail(rows[0].id).item.code;
  assert.notEqual(full,store.detail(rows[1].id).item.code);
  assert.equal(store.preview(' '+full.toLowerCase()+' ').id,rows[0].id);
  assert.ok(!JSON.stringify(rows).includes(full));
  store.db.pragma('wal_checkpoint(FULL)');assert.ok(!fs.readFileSync(options.filename).includes(Buffer.from(full)));
});
test('a code can be claimed once across independent connections',t=>{
  const {store,options}=fixture(t);const other=new (require('../server/vip-store').VipStore)(options);t.after(()=>other.close());
  const code=store.detail(store.generate({count:1})[0].id).item.code;
  const a=claim(code);store.reserve(a);
  assert.throws(()=>other.reserve(claim(code,crypto.randomUUID(),'other@example-capital.com')),e=>e.code==='VIP_PROCESSING');
  store.complete(a.idempotencyKey,'rec-test');
  assert.throws(()=>other.preview(code),e=>e.code==='VIP_USED');
});
test('idempotent retries identify the original attempt and reject changed requests',t=>{
  const {store}=fixture(t);const code=store.detail(store.generate({count:1})[0].id).item.code;const a=claim(code);
  const first=store.reserve(a);assert.equal(store.reserve(a).id,first.id);
  assert.throws(()=>store.reserve({...a,requestHash:'different'}),e=>e.code==='IDEMPOTENCY_CONFLICT');
  store.complete(a.idempotencyKey,'rec-test');assert.equal(store.reserve(a).status,'used');
});
test('same email cannot hold two in-flight codes',t=>{
  const {store}=fixture(t);const rows=store.generate({count:2});store.reserve(claim(store.detail(rows[0].id).item.code));
  assert.throws(()=>store.reserve(claim(store.detail(rows[1].id).item.code)),e=>e.code==='VIP_EMAIL_PROCESSING');
});
test('confirmed failure releases a code but uncertain failure remains unavailable',t=>{
  const {store}=fixture(t);const code=store.detail(store.generate({count:1})[0].id).item.code;const a=claim(code);
  store.reserve(a);store.release(a.idempotencyKey,'confirmed failure');assert.equal(store.preview(code).status,'available');
  const b=claim(code);store.reserve(b);store.review(b.idempotencyKey,'timeout');
  assert.throws(()=>store.preview(code),e=>e.code==='VIP_PROCESSING');
  assert.equal(store.revoke({ids:[store.list({}).items[0].id],reason:'delete'}).revoked,0);
});
test('management records distribution, revokes unused codes and keeps audit history',t=>{
  const {store}=fixture(t);const row=store.generate({count:1})[0];
  store.update(row.id,{recipientName:'Jane',recipientEmail:'jane@example-capital.com',distributedAt:new Date().toISOString(),note:'Sent manually'});
  const code=store.detail(row.id).item.code;assert.equal(store.list({q:'Jane'}).total,1);
  assert.equal(store.revoke({ids:[row.id],reason:'withdrawn'}).revoked,1);
  assert.throws(()=>store.preview(code),e=>e.code==='VIP_REVOKED');
  assert.ok(store.detail(row.id).events.length>=3);
});
test('startup recovery holds unfinished codes and rejects a different encryption key',t=>{
  const {store,options}=fixture(t);const row=store.generate({count:1})[0];const a=claim(store.detail(row.id).item.code);store.reserve(a);
  store.recover();assert.equal(store.detail(row.id).item.status,'review');
  assert.throws(()=>new (require('../server/vip-store').VipStore)({...options,key:crypto.randomBytes(32).toString('base64')}),e=>e.code==='VIP_STORAGE_UNAVAILABLE');
});
test('expiry, invalid configuration, and management bounds are enforced',t=>{
  const {store}=fixture(t);assert.throws(()=>store.generate({count:201}));assert.throws(()=>store.generate({count:1,expiresAt:'invalid'}));
  const row=store.generate({count:1,expiresAt:new Date(Date.now()+60000).toISOString()})[0];
  store.db.prepare('UPDATE vip_codes SET expires_at=? WHERE id=?').run(new Date(Date.now()-1000).toISOString(),row.id);
  assert.throws(()=>store.preview(store.detail(row.id).item.code),e=>e.code==='VIP_EXPIRED');
});

test('two independent processes cannot claim the same code concurrently',async t=>{
  const {store,options}=fixture(t),row=store.generate({count:1})[0],code=store.detail(row.id).item.code;
  const {spawn}=require('node:child_process');
  const source=`const {VipStore}=require('./server/vip-store');const fs=require('node:fs');const v=JSON.parse(fs.readFileSync(0,'utf8'));const store=new VipStore(v.options);try{store.reserve(v.claim);console.log('claimed');}catch(e){console.log(e.code);}finally{store.close();}`;
  function run(email){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,['-e',source],{cwd:path.resolve(__dirname,'..'),stdio:['pipe','pipe','pipe']});let output='',error='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);child.on('error',reject);child.on('exit',n=>n?reject(Error(error)):resolve(output.trim()));child.stdin.end(JSON.stringify({options,claim:claim(code,crypto.randomUUID(),email)}));});}
  const results=await Promise.all([run('one@example-capital.com'),run('two@example-capital.com')]);
  assert.deepEqual(results.sort(),['VIP_PROCESSING','claimed']);assert.equal(store.row(row.id).status,'redeeming');
});

test('online backup restores encrypted codes and pending attempt history',async t=>{
  const {store,options}=fixture(t),row=store.generate({count:1})[0],code=store.detail(row.id).item.code,a=claim(code);store.reserve(a);
  const destination=path.join(path.dirname(options.filename),'backup.sqlite');
  const {execFile}=require('node:child_process');
  await new Promise((resolve,reject)=>execFile(process.execPath,['server/backup-vip.js',destination],{cwd:path.resolve(__dirname,'..'),env:{...process.env,VIP_DB_PATH:options.filename,VIP_CODE_ENCRYPTION_KEY:options.key}},(e)=>e?reject(e):resolve()));
  assert.equal(store.row(row.id).status,'redeeming');
  const restored=new (require('../server/vip-store').VipStore)({...options,filename:destination});
  try{assert.equal(restored.detail(row.id).item.code,code);assert.equal(restored.attempt(a.idempotencyKey).status,'redeeming');restored.recover();assert.equal(restored.row(row.id).status,'review');}finally{restored.close();}
});

test('failed startup recovery never publishes a usable singleton and can retry safely',t=>{
  const {options}=fixture(t),vm=require('node:vm'),{createRequire}=require('node:module');
  const file=path.resolve(__dirname,'../server/vip-store.js'),module={exports:{}};
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,require:createRequire(file),Buffer,__dirname:path.dirname(file),process:{env:{}}},{filename:file});
  const {VipStore,getStore}=module.exports,original=VipStore.prototype.recover;let calls=0,failed;
  VipStore.prototype.recover=function(){calls++;if(calls===1){failed=this;throw Error('temporary lock');}return original.call(this);};
  const env={VIP_DB_PATH:options.filename,VIP_CODE_ENCRYPTION_KEY:options.key};
  assert.throws(()=>getStore(env));
  const ready=getStore(env);try{assert.equal(calls,2);assert.notEqual(ready,failed);assert.equal(failed.db.open,false);assert.equal(getStore(env),ready);}finally{ready.close();}
});

test('existing database gains automatic attendee names without changing old codes or used states',t=>{
  const {store,options}=fixture(t),row=store.generate({count:1})[0],code=store.detail(row.id).item.code,a=claim(code);
  store.reserve(a);store.complete(a.idempotencyKey,'rec-existing');
  store.db.exec('ALTER TABLE vip_codes DROP COLUMN used_name');
  const migrated=new (require('../server/vip-store').VipStore)(options);
  try{assert.equal(migrated.detail(row.id).item.code,code);assert.equal(migrated.row(row.id).status,'used');assert.equal(migrated.detail(row.id).item.usedEmail,a.email);assert.throws(()=>migrated.preview(code),e=>e.code==='VIP_USED');assert.ok(migrated.db.pragma('table_info(vip_codes)').some(column=>column.name==='used_name'));}finally{migrated.close();}
});
