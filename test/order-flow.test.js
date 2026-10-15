const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { VipStore } = require('../server/vip-store');
const { createRequire } = require('node:module');

// Execute the real backend with only external persistence/mail replaced.
// Local credentials are never loaded in this test context.
function loadBackend({ duplicate = null, saveError = false, mailError = false, vip = false, store = null, adminToken = '' } = {}) {
  const file = path.resolve(__dirname, '../server/index.js');
  const realRequire = createRequire(file);
  const saved = [], messages = [], updates = [];
  if(vip && !store)throw new Error('VIP fixture requires an isolated store');
  const feishu = {
    assertConfigured() {},
    async findActiveRecordByEmail() { return duplicate; },
    async createRecord(fields) {
      if (saveError) throw new Error('Feishu unavailable');
      saved.push(fields);
      return { record_id: 'rec-test', fields };
    },
    async updateRecord(id, fields) { updates.push({ id, fields }); }
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    module, __dirname: path.dirname(file), process: { env: { SMTP_PASS: 'test-only', ADMIN_TOKEN: adminToken } },
    console, Buffer, URL, setTimeout, clearTimeout,
    require(name) {
      if (name === 'fs') return { ...fs, existsSync: () => false };
      if (name === './feishu') return feishu;
      if (name === './vip-store')return {getStore:()=>{if(!store)throw Object.assign(new Error('VIP storage is not configured'),{code:'VIP_STORAGE_UNAVAILABLE',statusCode:503});return store;}};
      if (name === 'nodemailer') return { createTransport: () => ({ async sendMail(message) {
        if (mailError) throw new Error('SMTP unavailable');
        messages.push(message);
        return { messageId: 'mail-test' };
      } }) };
      return realRequire(name);
    }
  }, { filename: file });
  return { backend: module.exports, saved, messages, updates };
}

function input() {
  return { packageId: 'lpclub_member_matchmaking', total: 1, attendee: {
    fullName: 'Jane Test', company: 'Capital Example', companyType: 'LP CLUB Member',
    jobTitle: 'Partner', country: 'Canada', email: 'jane@capital-example.com',
    dial: '+1', phone: '4165551234', visaLetter: 'No', consent: true, matchmaking: 'No'
  } };
}

test('saved registration and confirmation mail agree on identity, package and price', async () => {
  const { backend, saved, messages, updates } = loadBackend();
  const result = await backend.processOrder(input());
  assert.equal(result.saved, true);
  assert.equal(result.package.price, 5000);
  assert.equal(result.email.sent, true);
  assert.equal(saved[0]['Package ID / 套餐ID'], 'lpclub_member_matchmaking');
  assert.equal(saved[0]['Attendee Category / 报名身份'], 'LP CLUB Member');
  assert.equal(saved[0]['Amount / 金额'], 5000);
  assert.equal(saved[0]['LP & GP 1-on-1 Matchmaking / 一对一洽谈'], 'Yes / 是');
  assert.match(messages[0].html, /LP CLUB Member/);
  assert.match(messages[0].html, /1-on-1 LP Matchmaking Package/);
  assert.match(messages[0].text, /USD 5,000/);
  assert.equal(updates[0].fields['Email Status / 邮件状态'], 'Sent');
});

test('active duplicate prevents both persistence and mail', async () => {
  const { backend, saved, messages } = loadBackend({ duplicate: { record_id: 'rec-old', fields: {
    'Status / 状态': 'Received', 'Registration Reference / 报名编号': 'LPC26-EXISTING'
  } } });
  await assert.rejects(backend.processOrder(input()), e => e.code === 'DUPLICATE_REGISTRATION' && e.ref === 'LPC26-EXISTING');
  assert.equal(saved.length, 0);
  assert.equal(messages.length, 0);
});

test('Feishu failure never confirms success or sends mail', async () => {
  const { backend, messages } = loadBackend({ saveError: true });
  await assert.rejects(backend.processOrder(input()), e => e.code === 'DATABASE_UNAVAILABLE' && e.statusCode === 503);
  assert.equal(messages.length, 0);
});

test('mail failure preserves the registration and records failed email status', async () => {
  const { backend, saved, updates } = loadBackend({ mailError: true });
  const result = await backend.processOrder(input());
  assert.equal(result.saved, true);
  assert.equal(saved.length, 1);
  assert.equal(result.email.error, 'SMTP unavailable');
  assert.equal(updates[0].fields['Email Status / 邮件状态'], 'Failed');
});


test('VIP registration stores zero amount and its pricing basis in Feishu and mail', async t => {
  const store = new VipStore({filename:':memory:',key:crypto.randomBytes(32).toString('base64')});t.after(()=>store.close());
  const item=store.generate({count:1})[0],code=store.detail(item.id).item.code;
  const { backend, saved, messages } = loadBackend({ vip:true,store });
  const registration = input();
  registration.packageId = 'gp_ticket';
  registration.vipCode = code;
  registration.idempotencyKey = crypto.randomUUID();
  const result = await backend.processOrder(registration);
  assert.equal(result.package.price, 0);
  assert.equal(store.row(item.id).status,'used');
  assert.equal(store.detail(item.id).item.usedName,registration.attendee.fullName);
  assert.equal(store.detail(item.id).item.usedEmail,registration.attendee.email);
  assert.equal(store.list({q:registration.attendee.fullName}).total,1);
  const retry=await backend.processOrder(registration);
  assert.equal(retry.ref,result.ref);assert.equal(saved.length,1);assert.equal(messages.length,1);
  assert.equal(saved[0]['Amount / 金额'], 0);
  assert.match(saved[0]['Pricing Basis / 计价说明'], /VIP Code/);
  assert.match(messages[0].text, /VIP Code complimentary delegate pass/);
  assert.match(messages[0].text, /Registration fee: Complimentary \/ VIP Code/);
  assert.ok(!JSON.stringify(saved).includes(code));
  assert.ok(!JSON.stringify(messages).includes(code));
});

test('VIP registrations still reject duplicate email before saving', async t => {
  const store = new VipStore({filename:':memory:',key:crypto.randomBytes(32).toString('base64')});t.after(()=>store.close());
  const item=store.generate({count:1})[0],code=store.detail(item.id).item.code;
  const { backend, saved } = loadBackend({ vip:true,store, duplicate: { record_id: 'existing', fields: { 'Status / 状态': 'Received' } } });
  const registration = input();
  registration.packageId = 'gp_ticket';
  registration.vipCode = code;
  registration.idempotencyKey = crypto.randomUUID();
  await assert.rejects(backend.processOrder(registration), e => e.code === 'DUPLICATE_REGISTRATION');
  assert.equal(saved.length, 0);
});

test('VIP mail failure leaves the code used and retries never send mail twice', async t => {
  const store=new VipStore({filename:':memory:',key:crypto.randomBytes(32).toString('base64')});t.after(()=>store.close());
  const item=store.generate({count:1})[0],code=store.detail(item.id).item.code;
  const {backend,saved,updates}=loadBackend({vip:true,store,mailError:true});
  const registration=input();registration.packageId='gp_ticket';registration.vipCode=code;registration.idempotencyKey=crypto.randomUUID();
  const result=await backend.processOrder(registration);assert.equal(result.saved,true);assert.equal(store.row(item.id).status,'used');
  await backend.processOrder(registration);assert.equal(saved.length,1);assert.equal(updates.length,1);
});

test('management HTTP routes enforce auth and support generate/distribute/export/revoke',async t=>{
  const store=new VipStore({filename:':memory:',key:crypto.randomBytes(32).toString('base64')});t.after(()=>store.close());
  const {backend}=loadBackend({store,adminToken:'local-test-admin'});
  const server=backend.server;await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const base='http://127.0.0.1:'+server.address().port;
  async function request(route,method='GET',body,auth=true){return fetch(base+route,{method,headers:{...(auth?{'X-Admin-Token':'local-test-admin'}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}
  assert.equal((await request('/vip-codes','GET',null,false)).status,401);
  assert.equal((await request('/api/admin/vip-codes','POST',{count:1},false)).status,401);
  const generated=await (await request('/api/admin/vip-codes','POST',{count:2,batchName:'=Danger'})).json();assert.equal(generated.items.length,2);
  const id=generated.items[0].id,otherId=generated.items[1].id;
  await request('/api/admin/vip-codes/'+id,'PATCH',{recipientName:'Jane',recipientEmail:'jane@example-capital.com',note:'@formula',distributedAt:new Date().toISOString()});
  const detail=await (await request('/api/admin/vip-codes/'+id)).json();assert.equal(detail.item.recipientName,'Jane');assert.ok(detail.events.some(e=>e.action==='revealed'));
  const preview=await (await request('/api/vip','POST',{packageId:'gp_ticket',vipCode:detail.item.code},false)).json();assert.equal(preview.package.price,0);assert.equal(store.row(id).status,'available');
  const codeOnly=await (await request('/api/vip','POST',{vipCode:detail.item.code},false)).json();assert.equal(codeOnly.ok,true);assert.equal(codeOnly.valid,true);
  assert.equal((await request('/api/admin/vip-codes/'+id+'?token=wrong')).status,401);
  assert.equal((await request('/api/admin/vip-codes/'+crypto.randomUUID())).status,404);
  const csv=await request('/api/admin/vip-codes/export?ids='+id);assert.match(csv.headers.get('Content-Type'),/text\/csv/);const contents=await csv.text();assert.ok(contents.includes(detail.item.code));assert.ok(!contents.includes('Danger'));assert.ok(!contents.includes('@formula'));assert.equal(contents.trim().split('\r\n')[0].replace(/^\uFEFF/,''),'"VIP Code"');
  await request('/api/admin/vip-codes/revoke','POST',{ids:[otherId],reason:'withdrawn'});
  const mixed=await (await request('/api/admin/vip-codes/export?ids='+id+','+otherId)).text();assert.ok(mixed.includes(detail.item.code));
  const used=await (await request('/api/admin/vip-codes/'+otherId)).json();assert.equal(used.item.status,'revoked');
  const rejected=await (await request('/api/vip','POST',{packageId:'gp_ticket',vipCode:used.item.code},false)).json();assert.equal(rejected.code,'VIP_REVOKED');
  const rejectedNoPkg=await (await request('/api/vip','POST',{vipCode:used.item.code},false)).json();assert.equal(rejectedNoPkg.code,'VIP_REVOKED');
  const list=await (await request('/api/admin/vip-codes?status=revoked')).json();assert.equal(list.total,1);
  const health=await (await request('/health')).json();assert.equal(health.vipReady,true);
});

test('VIP storage unavailable rejects redemption while ordinary registration still works',async()=>{
  const {backend,saved}=loadBackend();const registration=input();registration.packageId='gp_ticket';registration.vipCode='OLD-SHARED-CODE';registration.idempotencyKey=crypto.randomUUID();
  await assert.rejects(backend.processOrder(registration),e=>e.code==='VIP_STORAGE_UNAVAILABLE');assert.equal(saved.length,0);
  delete registration.vipCode;const result=await backend.processOrder(registration);assert.equal(result.package.price,2000);assert.equal(saved.length,1);
});
