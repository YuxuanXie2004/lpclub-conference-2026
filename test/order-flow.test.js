'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {normaliseOrder}=require('../server/order');
const {createRegistrationService}=require('../server/registration-service');
const {createMailer}=require('../server/mailer');
function input(){return{packageId:'gp_panel',idempotencyKey:crypto.randomUUID(),materials:{language:'zh'},attendee:{fullName:'Jane <script>',company:'Capital',companyType:'General Partner (GP)',country:'China',jobTitle:'Partner',email:'jane@example.com',phone:'13800138000',visaLetter:'No',consent:true}};}
test('registration mail agrees with authoritative package and escapes attendee content',()=>{
 const order=normaliseOrder(input()),url='https://lp-club.cn/2026-pe-conference/materials#ref='+order.ref+'&token=private';
 const mail=createMailer({}).composeRegistration(order,url);
 assert.match(mail.text,/USD 3,000/);assert.match(mail.html,/&lt;script&gt;/);assert.equal(mail.html.includes('Jane <script>'),false);assert.ok(mail.text.includes(url));assert.match(mail.html,/已收到您的报名/);
});
test('invalid/missing universal idempotency keys fail before touching any database',async()=>{
 let writes=0;const service=createRegistrationService({db:{transaction(){writes++;throw Error('unexpected')}},normaliseOrder});
 for(const key of [undefined,'short','bad spaces'.repeat(4)])await assert.rejects(service.submit({...input(),idempotencyKey:key}),e=>e.code==='INVALID_IDEMPOTENCY_KEY');
 assert.equal(writes,0);
});
test('uncertain transaction failures never confirm success or send email synchronously',async()=>{
 let sent=0;const service=createRegistrationService({db:{async transaction(){throw Object.assign(Error('connection lost'),{code:'ECONNRESET',commitUncertain:true})}},normaliseOrder,mail:{enqueue(){sent++}}});
 await assert.rejects(service.submit(input()),e=>e.code==='DATABASE_UNAVAILABLE'&&e.statusCode===503&&e.retryable===true);assert.equal(sent,0);
});
