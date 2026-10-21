'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { PACKAGES } = require('../server/packages');
const { normaliseOrder, toRegistrationRow, fromRegistrationRow } = require('../server/order');

const identities = [
  ['lp', 'Limited Partner (LP)', '有限合伙人（LP）'],
  ['lpclub_member', 'LP CLUB Member', 'LP CLUB 会员'],
  ['gp', 'General Partner (GP)', '普通合伙人（GP）'],
  ['investment_company', 'Asset Management', '资产管理'],
  ['standard', 'Standard', '标准报名']
];
const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');

test('every package saves the selected identity name regardless of interface language', () => {
  for (const [id, name] of identities) {
    for (const option of ['ticket', 'speaking', 'panel', 'matchmaking']) {
      const p = PACKAGES[id + '_' + option];
      assert.equal(p.identityName, name);
      assert.equal(p.organisationType, name);
      for (const language of ['en', 'zh']) {
        const order = normaliseOrder({ packageId: p.id, materials: { language }, attendee: {
          fullName: 'Test', company: 'Capital', country: 'China', jobTitle: 'Partner',
          email: 'test@example.com', phone: '13800138000', visaLetter: 'No', consent: true
        } });
        const row = toRegistrationRow(order);
        assert.equal(row.company_type, name);
        assert.equal(row.attendee_category, name);
        assert.equal(JSON.parse(row.attendee_snapshot).companyType, name);
        assert.equal(JSON.parse(row.package_snapshot).organisationType, name);
      }
    }
  }
});

test('details display the selected identity in both languages and preserve selection on language changes', () => {
  const select = html.match(/<select\b[^>]*name="companyType"[^>]*>([\s\S]*?)<\/select>/)[1];
  const options = Array.from(select.matchAll(/<option\b[^>]*data-zh="([^"]*)"[^>]*value="([^"]*)"[^>]*>([^<]*)<\/option>/g), m => ({
    value: m[2], innerHTML: m[3], getAttribute: name => name === 'data-zh' ? m[1] : null
  }));
  let value = '';
  const companyType = {
    get value() { return value; },
    set value(next) { value = options.some(option => option.value === next) ? next : ''; }
  };
  const description = { dataset: { en: 'Conference' } };
  const context = vm.createContext({
    language: 'en', originalMarkup: new Map(options.map(option => [option, option.innerHTML])), messages: new Map(),
    regForm: { elements: { companyType } }, regBack: {}, regFoot: { style: {} }, regNext: {},
    vipPending: false, packageLoadError: '', packageList: [], window: {}, vipApply: null, registrationResult: null,
    document: { documentElement: {}, querySelectorAll: () => [], querySelector: () => description },
    updateSummary() {}, showAlert() {}
  });
  vm.runInContext(html.slice(html.indexOf('  var translations ='), html.indexOf('  var errorMessages =')), context);
  vm.runInContext(html.slice(html.indexOf('  var requiredFieldsPrefix='), html.indexOf('  /* ---------- Integrated 3-step registration')), context);
  vm.runInContext(html.slice(html.indexOf('  function showStep(n)'), html.indexOf('  function getMulti(key)')), context);
  for (const [id, en, zh] of identities) {
    for (const option of ['ticket', 'speaking', 'panel', 'matchmaking']) {
      context.selectedPackage = PACKAGES[id + '_' + option];
      vm.runInContext('showStep(1);showStep(2)', context);
      for (const language of ['en', 'zh-CN', 'en']) {
        vm.runInContext(`setLanguage('${language}')`, context);
        assert.equal(companyType.value, en, context.selectedPackage.id);
        const expected = language === 'en' ? en : zh;
        assert.equal(options.find(option => option.value === companyType.value).innerHTML, expected);
        assert.equal(vm.runInContext('t(selectedPackage.identityName)', context), expected);
      }
    }
  }
});

test('historical organization types are preserved when reading existing registrations', () => {
  for (const company_type of ['Investment Company', 'Other', 'Family Office']) {
    assert.equal(fromRegistrationRow({ company_type }).companyType, company_type);
  }
});
