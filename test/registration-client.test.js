'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { PACKAGES } = require('../server/packages');

const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');

test('organization type is displayed in a disabled select', () => {
  const field = html.match(/<select\b[^>]*name="companyType"[^>]*>/)?.[0];
  assert.ok(field);
  assert.match(field, /\sdisabled(?:\s|>)/);
});

test('details follow the selected package when returning to change identity', () => {
  const companyType = { value: '' };
  const context = vm.createContext({
    regForm: { elements: { companyType } }, regBack: {}, regFoot: { style: {} }, regNext: {},
    vipPending: false, packageLoadError: '', window: {},
    document: { querySelectorAll: () => [] },
    setMessage() {}, showAlert() {}, updateSummary() {}
  });
  vm.runInContext(html.slice(html.indexOf('  function showStep(n)'), html.indexOf('  function getMulti(key)')), context);
  for (const selectedPackage of Object.values(PACKAGES)) {
    context.selectedPackage = selectedPackage;
    vm.runInContext('showStep(1);showStep(2)', context);
    assert.equal(companyType.value, selectedPackage.organisationType, selectedPackage.id);
  }
});

test('submission uses the selected organization type even when form data omits or overrides it', () => {
  let submittedType;
  const context = vm.createContext({
    regForm: {}, window: {}, appliedVipCode: '',
    FormData: class { get(name) { return name === 'companyType' ? submittedType : null; } },
    effectivePackage: p => p, getMulti: () => []
  });
  vm.runInContext(html.slice(html.indexOf('  function formPayload()'), html.indexOf('  function validateDetails()')), context);
  for (const selectedPackage of Object.values(PACKAGES)) {
    context.selectedPackage = selectedPackage;
    for (submittedType of [null, 'Family Office']) {
      const payload = vm.runInContext('formPayload()', context);
      assert.equal(payload.packageId, selectedPackage.id);
      assert.equal(payload.attendee.companyType, selectedPackage.organisationType, selectedPackage.id);
    }
  }
});

test('attendance purposes omit fundraising', () => {
  const context = vm.createContext({});
  vm.runInContext(html.slice(html.indexOf('  var MULTI ='), html.indexOf('  function escHtml')), context);
  assert.deepEqual(Array.from(context.MULTI.purpose), ['Market Insights', 'Investment Opportunities', 'LP-GP Partnership', 'Networking', 'Other']);
});

test('other purpose input follows selection and resets with the form', () => {
  const field = { hidden: true };
  const input = { disabled: true, required: false, value: '' };
  let selected = [];
  const context = vm.createContext({
    regForm: { elements: { purposeOther: input } },
    document: { getElementById: id => { assert.equal(id, 'purposeOtherField'); return field; } },
    getMulti: key => { assert.equal(key, 'purpose'); return selected; }
  });
  const start = html.indexOf('  function updatePurposeOther()');
  assert.notEqual(start, -1);
  vm.runInContext(html.slice(start, html.indexOf('  function formPayload()', start)), context);
  for (selected of [[], ['Networking'], ['Networking', 'Other'], ['Other'], []]) {
    vm.runInContext('updatePurposeOther()', context);
    const other = selected.includes('Other');
    assert.equal(field.hidden, !other);
    assert.equal(input.disabled, !other);
    assert.equal(input.required, other);
  }
  assert.match(html, /regForm\.addEventListener\('change',[\s\S]*?updatePurposeOther\(\)/);
  assert.match(html, /regForm\.reset\(\);updatePurposeOther\(\)/);
  assert.match(html, /<input\b[^>]*name="purposeOther"[^>]*maxlength="80"/);
});

test('other purpose text is saved only while selected and retains existing selections', () => {
  const { normaliseOrder, toRegistrationRow, fromRegistrationRow } = require('../server/order');
  let selected = ['Networking', 'Other'];
  const values = { purposeOther: '  寻找产业合作伙伴 / Partnerships  ', fullName: '张三', company: '测试机构', country: 'China', jobTitle: 'Partner', email: 'test@example.com', phone: '13800138000', visaLetter: 'No', consent: 'on' };
  const context = vm.createContext({
    regForm: {}, window: {}, appliedVipCode: '', selectedPackage: PACKAGES.lpclub_member_panel,
    FormData: class { get(key) { return values[key] ?? null; } },
    effectivePackage: p => p, getMulti: () => selected.slice()
  });
  vm.runInContext(html.slice(html.indexOf('  function formPayload()'), html.indexOf('  function validateDetails()')), context);
  function payload() { return JSON.parse(JSON.stringify(vm.runInContext('formPayload()', context))); }
  const request = payload();
  assert.deepEqual(request.attendee.purpose, ['Networking', 'Other']);
  assert.equal(request.attendee.purposeOther, values.purposeOther.trim());
  assert.equal(fromRegistrationRow(toRegistrationRow(normaliseOrder(request))).purpose, 'Networking; Other; 寻找产业合作伙伴 / Partnerships');
  selected = ['Networking'];
  assert.deepEqual(payload().attendee.purpose, ['Networking']);
  assert.equal(payload().attendee.purposeOther, '');
  selected = ['Other'];
  values.purposeOther = '目'.repeat(80);
  assert.deepEqual(normaliseOrder(payload()).attendee.purpose, ['Other', values.purposeOther]);
  values.purposeOther = '   ';
  assert.deepEqual(payload().attendee.purpose, ['Other']);
  assert.throws(() => normaliseOrder(payload()), e => e.code === 'PURPOSE_OTHER_REQUIRED');
});
