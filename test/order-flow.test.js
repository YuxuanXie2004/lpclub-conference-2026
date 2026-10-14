const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

// Execute the real backend with only external persistence/mail replaced.
// Local credentials are never loaded in this test context.
function loadBackend({ duplicate = null, saveError = false, mailError = false } = {}) {
  const file = path.resolve(__dirname, '../server/index.js');
  const realRequire = createRequire(file);
  const saved = [], messages = [], updates = [];
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
    module, __dirname: path.dirname(file), process: { env: { SMTP_PASS: 'test-only' } },
    console, Buffer, URL, setTimeout, clearTimeout,
    require(name) {
      if (name === 'fs') return { ...fs, existsSync: () => false };
      if (name === './feishu') return feishu;
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
