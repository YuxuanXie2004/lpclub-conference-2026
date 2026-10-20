'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { encryptPayload, decryptPayload, retryDelay } = require('../server/mail-outbox');
test('queued email payload uses authenticated encryption and never contains plaintext token', () => {
  const key = crypto.randomBytes(32).toString('base64');
  const payload = {url:'https://example.com/materials#token=private-long-token',to:'guest@example.com'};
  const encoded = encryptPayload(payload,key);
  assert.equal(encoded.includes('private-long-token'),false);
  assert.deepEqual(decryptPayload(encoded,key),payload);
  assert.notEqual(encryptPayload(payload,key),encoded);
  assert.throws(()=>decryptPayload(encoded,crypto.randomBytes(32).toString('base64')));
  assert.throws(()=>encryptPayload(payload,''));
});
test('email retries are bounded with progressively longer delays', () => {
  assert.deepEqual([1,2,3,4].map(retryDelay),[60000,300000,900000,3600000]);
});

test('SMTP acceptance of the organiser CC does not count as delivery to the attendee',async t=>{
 const {createMailer}=require('../server/mailer');let closed=false;
 t.mock.method(require('nodemailer'),'createTransport',()=>({sendMail:async()=>({accepted:['organiser@example.com'],rejected:['guest@example.com']}),close(){closed=true}}));
 const mailer=createMailer({SMTP_PASS:'mock'});
 await assert.rejects(mailer.send({to:'guest@example.com',cc:'organiser@example.com'}),e=>e.code==='SMTP_REJECTED');assert.equal(closed,true);
});
