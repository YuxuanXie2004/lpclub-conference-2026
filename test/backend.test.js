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
  assert.equal(order.package.price, 1800);
  assert.equal(order.total, 1800);
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
