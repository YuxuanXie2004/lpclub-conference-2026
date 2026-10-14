const test = require('node:test');
const assert = require('node:assert/strict');
const backend = require('../server/index');

function sample(email='jane@capital-example.com', packageId='gp') {
  return { packageId, attendee: {
    salutation:'Ms.', fullName:'Jane Test', company:'Capital Example', companyType:'General Partner (GP)',
    department:'Investments', jobTitle:'Partner', country:'Canada', city:'Toronto', email,
    dial:'+1', phone:'4165551234', whatsappSame:'Yes', whatsappNumber:'', focus:['Private Equity'],
    purpose:['Networking'], matchmaking:'Yes', visaLetter:'No', arrivalDate:'2026-11-17', guests:0, consent:true
  }};
}

test('rejects personal email domains', () => {
  assert.throws(() => backend.normaliseOrder(sample('person@gmail.com')), /business email/i);
});

test('server owns GP price', () => {
  const order = backend.normaliseOrder(sample());
  assert.equal(order.package.price, 2000);
  assert.equal(order.total, 2000);
});

test('registration offers the five approved identities', () => {
  assert.deepEqual([...new Set(Object.values(backend.PACKAGES).map(p => p.identityId))], ['lp', 'lpclub_member', 'gp', 'investment_company', 'standard']);
  assert.equal(backend.PACKAGES.investment_company_ticket.name, 'Investor');
});

test('LP CLUB members receive a complimentary pass and retain their organisation type', () => {
  const input = sample('member@capital-example.com', 'lpclub_member');
  input.attendee.companyType = 'LP CLUB Member';
  const order = backend.normaliseOrder(input);
  assert.equal(order.total, 0);
  assert.equal(backend.toFields(order)['Organization Type / 机构类型'], 'LP CLUB Member / LP CLUB会员');
});

test('GP Early cannot be used for new registrations', () => {
  assert.throws(() => backend.normaliseOrder(sample('jane@capital-example.com', 'gp_early')), /valid registration category/i);
});

test('historical registrations retain their original category, package and amount', () => {
  const row = backend.fromFeishuRecord({ record_id: 'legacy', fields: {
    'Package ID / 套餐ID': 'gp_early',
    'Ticket / 票种': 'GP Early Delegate Pass',
    'Amount / 金额': 1800,
    'Pricing Basis / 计价说明': 'GP Early'
  }});
  assert.equal(row.packageId, 'gp_early');
  assert.equal(row.items, 'GP Early Delegate Pass');
  assert.equal(row.total, 1800);
  assert.equal(row.pricingBasis, 'GP Early');
});

test('new registrations are explicitly not deleted', () => {
  const order = backend.normaliseOrder(sample());
  const fields = backend.toFields(order);
  assert.equal(fields['Is Deleted / 已删除'], false);
  assert.equal(fields['Deleted At / 删除时间'], '');
});

test('Feishu record mapping preserves soft-delete metadata', () => {
  const row = backend.fromFeishuRecord({ record_id:'rec1', fields: {
    'Registration Reference / 报名编号':'LPC26-TEST0001',
    'Status / 状态':'Approved',
    'Business Email / 企业邮箱':'jane@capital-example.com',
    'Is Deleted / 已删除':true,
    'Deleted At / 删除时间':'2026-10-06T10:00:00.000Z',
    'Deletion Reason / 删除原因':'duplicate'
  }});
  assert.equal(row.isDeleted, true);
  assert.equal(row.ref, 'LPC26-TEST0001');
  assert.equal(row.deletionReason, 'duplicate');
});

const approvedPrices = {
  lp: [0, 4000, 3000, 5000],
  lpclub_member: [0, 4000, 3000, 5000],
  gp: [2000, 4000, 3000, 5000],
  investment_company: [2800, 5600, 4200, 7000],
  standard: [3500, 7000, 5250, 8750]
};
const options = ['ticket', 'speaking', 'panel', 'matchmaking'];

test('all 20 packages use approved full prices and server-owned matchmaking', () => {
  assert.equal(Object.keys(backend.PACKAGES).length, 20);
  for (const [identity, prices] of Object.entries(approvedPrices)) {
    for (const [i, option] of options.entries()) {
      const id = identity + '_' + option;
      const input = sample('jane@capital-example.com', id);
      delete input.attendee.matchmaking;
      input.price = 1;
      input.total = 1;
      input.package = { price: 1 };
      const order = backend.normaliseOrder(input);
      assert.equal(order.package.id, id);
      assert.equal(order.package.identityId, identity);
      assert.equal(order.package.optionId, option);
      assert.equal(order.total, prices[i]);
      assert.equal(order.items.length, 1);
      assert.equal(order.items[0].qty, 1);
      assert.equal(order.attendee.matchmaking, option === 'matchmaking' ? 'Yes' : 'No');
      const fields = backend.toFields(order);
      assert.equal(fields['Amount / 金额'], prices[i]);
      assert.equal(fields['Attendee Category / 报名身份'], order.package.name);
      assert.equal(fields['Ticket / 票种'], order.package.ticketName);
      assert.equal(fields['LP & GP 1-on-1 Matchmaking / 一对一洽谈'], option === 'matchmaking' ? 'Yes / 是' : 'No / 否');
    }
  }
});

test('legacy identity IDs resolve to canonical delegate passes', () => {
  for (const [identity, prices] of Object.entries(approvedPrices)) {
    const order = backend.normaliseOrder(sample('legacy@capital-example.com', identity));
    assert.equal(order.package.id, identity + '_ticket');
    assert.equal(order.total, prices[0]);
  }
});

test('invalid and inherited package IDs are rejected', () => {
  for (const id of ['', 'missing', 'gp_early', 'gp_early_ticket', 'constructor', '__proto__', 'toString']) {
    assert.throws(() => backend.normaliseOrder(sample('jane@capital-example.com', id)), /valid registration category/i);
  }
});

test('client matchmaking values cannot override the selected package', () => {
  for (const [id, submitted, expected] of [['gp_ticket', 'Yes', 'No'], ['gp_matchmaking', 'No', 'Yes']]) {
    const input = sample('jane@capital-example.com', id);
    input.attendee.matchmaking = submitted;
    assert.equal(backend.normaliseOrder(input).attendee.matchmaking, expected);
  }
});
