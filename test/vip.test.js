const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function backend(codes = 'TEST-VIP,SECOND-VIP') {
  const file = path.resolve(__dirname, '../server/index.js');
  const realRequire = createRequire(file);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    module, __dirname: path.dirname(file), process: { env: { VIP_CODES: codes } },
    console, Buffer, URL, setTimeout, clearTimeout,
    require(name) {
      if (name === 'fs') return { ...fs, existsSync: () => false };
      return realRequire(name);
    }
  }, { filename: file });
  return module.exports;
}

function order(packageId = 'gp_ticket', vipCode = 'TEST-VIP') {
  return { packageId, vipCode, total: 1, attendee: {
    fullName: 'Jane Test', company: 'Capital Example', companyType: 'General Partner (GP)',
    country: 'Canada', jobTitle: 'Partner', email: 'jane@capital-example.com',
    phone: '4165551234', visaLetter: 'No', consent: true
  } };
}

test('VIP preview and submission redeem a free delegate pass for every identity', () => {
  const app = backend();
  for (const identity of ['lp', 'lpclub_member', 'gp', 'investment_company', 'standard']) {
    const input = order(identity + '_ticket');
    const preview = app.validateVip(input);
    assert.equal(preview.package.price, 0);
    assert.equal(preview.package.vipApplied, true);
    const result = app.normaliseOrder(input);
    assert.equal(result.total, 0);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].qty, 1);
    assert.equal(result.package.displayPrice, 'Complimentary / VIP Code');
    assert.equal(result.package.id, identity + '_ticket');
    assert.equal(app.toFields(result)['Amount / 金额'], 0);
    assert.match(app.toFields(result)['Pricing Basis / 计价说明'], /VIP Code/);
    assert.ok(!JSON.stringify(result).includes('TEST-VIP'));
    assert.ok(!JSON.stringify(preview).includes('TEST-VIP'));
  }
});

test('VIP code accepts trimmed case-insensitive configured codes and legacy ticket IDs', () => {
  const app = backend();
  assert.equal(app.normaliseOrder(order('gp', ' test-vip ')).total, 0);
  assert.equal(app.normaliseOrder(order('standard', 'second-vip')).total, 0);
});

test('invalid, disabled and malformed VIP codes never produce a free ticket', () => {
  for (const app of [backend(), backend('')]) {
    for (const code of ['INVALID', ' ', 'TEST-VIP' + 'X'.repeat(130), ['TEST-VIP'], true]) {
      assert.throws(() => app.normaliseOrder(order('gp_ticket', code)), e => e.code === 'INVALID_VIP_CODE');
    }
  }
  assert.throws(() => backend('').normaliseOrder(order()), e => e.code === 'INVALID_VIP_CODE');
});

test('VIP cannot redeem speaking, panel or matchmaking packages', () => {
  for (const option of ['speaking', 'panel', 'matchmaking']) {
    assert.throws(() => backend().normaliseOrder(order('gp_' + option)), e => e.code === 'VIP_TICKET_ONLY');
  }
});

test('normal pricing remains authoritative without a VIP code', () => {
  const app = backend();
  for (const code of [undefined, null, '']) {
    const input = order('standard_ticket', code);
    input.vipCode = code;
    const result = app.normaliseOrder(input);
    assert.equal(result.total, 3500);
    assert.equal(result.package.vipApplied, false);
  }
  assert.equal(app.PACKAGES.gp_ticket.price, 2000);
});

test('preview rejects unknown packages and does not consume a reusable code', () => {
  const app = backend();
  assert.throws(() => app.validateVip(order('constructor')), /valid registration category/);
  assert.throws(() => app.validateVip(order('gp_ticket', '')), e => e.code === 'INVALID_VIP_CODE');
  assert.equal(app.validateVip(order()).package.price, 0);
  assert.equal(app.validateVip(order()).package.price, 0);
});
