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

function validationApp() {
  const nodes = new Map();
  function field(name, { valid = true, missing = false, disabled = false, value = '' } = {}) {
    const attrs = new Map();
    const error = { hidden: true, textContent: '' };
    nodes.set('regError-' + name, error);
    const control = {
      name, value, disabled, validity: { valid, valueMissing: missing },
      get willValidate() { return !this.disabled; },
      setAttribute: (key, val) => attrs.set(key, val),
      getAttribute: key => attrs.get(key) || null,
      removeAttribute: key => attrs.delete(key),
      closest: () => ({ appendChild() {} }),
      focus() { control.focused = true; },
      scrollIntoView() { control.scrolled = true; }
    };
    return { control, error, attrs };
  }
  const name = field('fullName', { valid: false, missing: true });
  const email = field('email', { value: 'person@company.com' });
  const optional = field('city');
  const other = field('purposeOther', { valid: false, missing: true, disabled: true });
  const controls = [name.control, email.control, optional.control, other.control];
  const context = vm.createContext({
    regForm: { querySelectorAll: () => controls },
    document: { getElementById: id => nodes.get(id), createElement: () => ({ setAttribute() {} }) },
    businessEmail: value => !value.endsWith('@gmail.com'),
    setMessage: (node, key) => { node.textContent = key; }
  });
  vm.runInContext(html.slice(html.indexOf('  function clearFieldError('), html.indexOf('  async function submitRegistration()')), context);
  return { context, name, email, optional, other, run: code => vm.runInContext(code, context) };
}

test('submission marks missing fields, skips optional and disabled fields, and focuses the first error', () => {
  const app = validationApp();
  assert.equal(app.run('validateDetails()'), false);
  assert.equal(app.name.attrs.get('aria-invalid'), 'true');
  assert.equal(app.name.attrs.get('aria-describedby'), 'regError-fullName');
  assert.equal(app.name.error.hidden, false);
  assert.equal(app.name.error.textContent, 'Please complete this required field.');
  assert.equal(app.name.control.focused, true);
  assert.equal(app.name.control.scrolled, true);
  assert.equal(app.optional.attrs.has('aria-invalid'), false);
  assert.equal(app.other.error.hidden, true);
});

test('correcting input clears errors and preserves existing accessible descriptions', () => {
  const app = validationApp();
  app.name.attrs.set('aria-describedby', 'nameHint');
  app.run('validateDetails()');
  assert.equal(app.name.attrs.get('aria-describedby'), 'nameHint regError-fullName');
  app.name.control.validity = { valid: true, valueMissing: false };
  assert.equal(app.run('validateDetails()'), true);
  assert.equal(app.name.attrs.has('aria-invalid'), false);
  assert.equal(app.name.attrs.get('aria-describedby'), 'nameHint');
  assert.equal(app.name.error.hidden, true);
});

test('conditional required fields and business email errors use the same inline feedback', () => {
  const app = validationApp();
  app.name.control.validity = { valid: true };
  app.email.control.value = 'person@gmail.com';
  app.other.control.disabled = false;
  assert.equal(app.run('validateDetails()'), false);
  assert.equal(app.email.error.hidden, false);
  assert.equal(app.other.error.hidden, false);
  app.other.control.disabled = true;
  app.email.control.value = 'person@company.com';
  assert.equal(app.run('validateDetails()'), true);
  assert.equal(app.other.error.hidden, true);
  assert.equal(app.email.error.hidden, true);
});


test('confirmation checkboxes and invalid optional values also block submission', () => {
  const app = validationApp();
  assert.equal(app.name.error.hidden, true);
  assert.equal(app.name.attrs.has('aria-invalid'), false);
  app.name.control.type = 'checkbox';
  assert.equal(app.run('validateDetails()'), false);
  assert.equal(app.name.error.textContent, 'Please select this required confirmation.');
  app.name.control.validity = { valid: true };
  app.optional.control.validity = { valid: false, rangeOverflow: true };
  assert.equal(app.run('validateDetails()'), false);
  assert.equal(app.optional.error.textContent, 'Please enter a valid value.');
  app.optional.control.validity = { valid: true };
  assert.equal(app.run('validateDetails()'), true);
});

test('inline validation messages follow the selected interface language', () => {
  const context = vm.createContext({ language: 'zh-CN' });
  vm.runInContext(html.slice(html.indexOf('  var translations ='), html.indexOf('  var errorMessages =')), context);
  vm.runInContext(html.slice(html.indexOf('  var requiredFieldsPrefix='), html.indexOf('  function setMessage(')), context);
  for (const [en, zh] of [
    ['Please complete this required field.', '请填写此必填项。'],
    ['Please select this required confirmation.', '请勾选此必选确认项。'],
    ['Please enter a valid value.', '请输入有效的内容。'],
    ['Please enter a valid email address.', '请输入有效的邮箱地址。']
  ]) {
    context.language = 'zh-CN';
    assert.equal(context.t(en), zh);
    context.language = 'en';
    assert.equal(context.t(en), en);
  }
});
