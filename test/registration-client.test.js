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
