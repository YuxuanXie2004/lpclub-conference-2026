'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { PACKAGES } = require('../server/packages');
const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
const draftKey = 'lpclub-conference-2026-registration-draft';

function app(storage = new Map()) {
  const timers = new Map();
  let timerId = 0;
  const fields = Object.fromEntries(['fullName', 'company', 'jobTitle', 'email', 'phone', 'country', 'purposeOther', 'companyType', 'consent'].map(name => [name, { name, value: '', checked: false }]));
  fields.dial = { name: 'dial', value: '+86' };
  const purpose = ['Networking', 'Other'].map(value => ({ value, checked: false }));
  const nodes = { portraitConsent: { checked: false }, logoConsent: { checked: false } };
  const context = vm.createContext({
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    },
    regForm: {
      elements: fields,
      querySelectorAll: () => [],
      reset() { Object.values(fields).forEach(field => { field.value = field.name === 'dial' ? '+86' : ''; field.checked = false; }); purpose.forEach(input => { input.checked = false; }); }
    },
    MULTI: { purpose: ['Networking', 'Other'] },
    document: { querySelectorAll: () => purpose, getElementById: id => nodes[id] },
    window: { LPClubMaterials: { reset() { nodes.portraitConsent.checked = false; nodes.logoConsent.checked = false; } } },
    selectedIdentity: null, selectedPackage: null, packageList: Object.values(PACKAGES),
    regStep: 1, regSubmitting: false, vipCode: { value: '' }, appliedVipCode: '',
    regClearDraft: { hidden: true },
    regSaveDraft: { textContent: 'Save draft' }, regDraftError: { hidden: true, textContent: '' },
    setTimeout(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    regParticipationWrap: {}, regPackagesEl: {}, validationAttempted: false,
    vipSubmissionKey: '', vipSubmissionPayload: '', registrationResult: null,
    setMessage(el, key) { el.textContent = key; },
    getMulti: () => purpose.filter(input => input.checked).map(input => input.value),
    updatePurposeOther() { fields.purposeOther.disabled = !purpose[1].checked; },
    resetVip() { context.appliedVipCode = ''; },
    renderIdentities() {}, renderPackages() {}, clearFieldError() {}, showAlert() {}, loadPackages() {},
    showStep(step) { context.regStep = step; }
  });
  const start = html.indexOf('  var REGISTRATION_DRAFT_KEY');
  assert.notEqual(start, -1, 'registration draft feature exists');
  vm.runInContext(html.slice(start, html.indexOf('  function openReg()', start)), context);
  return { context, fields, purpose, nodes, storage, timers, run: source => vm.runInContext(source, context) };
}

test('saving briefly acknowledges on the button and repeated saves restart the timer', () => {
  const a = app();
  a.run('saveRegistrationDraft()');
  assert.equal(a.context.regSaveDraft.textContent, '✓ Saved');
  a.run('saveRegistrationDraft()');
  assert.equal(a.timers.size, 1);
  const timer = [...a.timers.values()][0];
  assert.equal(timer.delay, 1500);
  timer.fn();
  assert.equal(a.context.regSaveDraft.textContent, 'Save draft');
});

test('save failure shows only inline feedback and a successful retry clears it', () => {
  const a = app();
  const setItem = a.context.localStorage.setItem;
  a.context.localStorage.setItem = () => { throw Error('QuotaExceeded'); };
  a.run('saveRegistrationDraft()');
  assert.equal(a.context.regSaveDraft.textContent, 'Save draft');
  assert.equal(a.context.regDraftError.hidden, false);
  assert.equal(a.context.regDraftError.textContent, 'Could not save. Please retry.');
  assert.equal(a.timers.size, 0);
  a.context.localStorage.setItem = setItem;
  a.run('saveRegistrationDraft()');
  assert.equal(a.context.regDraftError.hidden, true);
});

test('clearing the draft resets button feedback without a popup', () => {
  const a = app();
  a.run('saveRegistrationDraft(); clearRegistrationDraft()');
  assert.equal(a.context.regSaveDraft.textContent, 'Save draft');
  assert.equal(a.context.regDraftError.hidden, true);
  assert.equal(a.timers.size, 0);
});

test('registration drafts have no popup markup, styles or message handler', () => {
  assert.doesNotMatch(html, /regDraftStatus|reg-draft-status|showDraftMessage|draftToastTimer/);
  assert.doesNotMatch(html, /class="reg-draft-note"/);
});

test('manual save accepts partial information without a package and excludes permissions and files', () => {
  const a = app();
  a.fields.fullName.value = '  张三  ';
  a.fields.email.value = 'unfinished@';
  a.fields.consent.checked = true;
  a.nodes.logoConsent.checked = true;
  a.context.vipCode.value = ' VIP-123 ';
  a.run('saveRegistrationDraft()');
  const saved = JSON.parse(a.storage.get(draftKey));
  assert.equal(saved.fields.fullName, '  张三  ');
  assert.equal(saved.fields.email, 'unfinished@');
  assert.equal(saved.packageId, null);
  assert.equal(saved.vipCode, ' VIP-123 ');
  assert.equal(saved.version, 1);
  assert.ok(saved.savedAt <= Date.now());
  assert.equal(saved.fields.consent, undefined);
  assert.equal(saved.materials, undefined);
  assert.equal(saved.expectedPrice, undefined);
  assert.equal(a.context.regClearDraft.hidden, false);
});

test('restore preserves raw fields and multi-selects but requires renewed permissions and VIP validation', () => {
  const a = app();
  a.context.selectedIdentity = 'gp';
  a.context.selectedPackage = PACKAGES.gp_panel;
  a.context.regStep = 2;
  a.fields.fullName.value = '<张三>';
  a.fields.purposeOther.value = '合作';
  a.purpose.forEach(input => { input.checked = true; });
  a.context.vipCode.value = 'VIP-123';
  a.run('saveRegistrationDraft()');
  const b = app(a.storage);
  b.fields.consent.checked = true;
  b.nodes.logoConsent.checked = true;
  b.nodes.portraitConsent.checked = true;
  const draft = b.run('restoreRegistrationDraft()');
  assert.equal(b.fields.fullName.value, '<张三>');
  assert.equal(b.fields.purposeOther.value, '合作');
  assert.equal(b.fields.purposeOther.disabled, false);
  assert.ok(b.purpose.every(input => input.checked));
  assert.equal(draft.packageId, 'gp_panel');
  assert.equal(draft.step, 2);
  assert.equal(b.context.vipCode.value, 'VIP-123');
  assert.equal(b.context.appliedVipCode, '');
  assert.equal(b.fields.consent.checked, false);
  assert.equal(b.nodes.logoConsent.checked, false);
  assert.equal(b.nodes.portraitConsent.checked, false);
});

test('expired, malformed and incompatible drafts are discarded without blocking registration', () => {
  for (const raw of ['{bad', 'null', '[]', JSON.stringify({ version: 2 }), JSON.stringify({ version: 1, savedAt: Date.now() - 7 * 86400000 - 1, fields: {} }), JSON.stringify({ version: 1, savedAt: Date.now() + 60000, fields: {} })]) {
    const a = app(new Map([[draftKey, raw]]));
    assert.equal(a.run('restoreRegistrationDraft()'), null);
    assert.equal(a.storage.has(draftKey), false);
    assert.equal(a.fields.fullName.value, '');
  }
});

test('restore ignores unknown fields and invalid field values', () => {
  const a = app(new Map([[draftKey, JSON.stringify({ version: 1, savedAt: Date.now(), fields: { fullName: {}, email: 'a@', consent: 'on', companyType: 'forged' }, purpose: ['invalid', 'Networking'], packageId: {}, identityId: [], vipCode: {}, step: 3 })]]));
  const draft = a.run('restoreRegistrationDraft()');
  assert.equal(a.fields.fullName.value, '');
  assert.equal(a.fields.email.value, 'a@');
  assert.equal(a.fields.companyType.value, '');
  assert.equal(a.fields.consent.checked, false);
  assert.equal(a.purpose[0].checked, true);
  assert.equal(draft.step, 1);
  assert.equal(draft.packageId, null);
});

test('storage failures do not throw or erase current inputs', () => {
  const a = app();
  a.fields.fullName.value = '张三';
  a.context.localStorage.setItem = () => { throw Error('QuotaExceeded'); };
  a.run('saveRegistrationDraft()');
  assert.equal(a.fields.fullName.value, '张三');
  a.context.localStorage.getItem = () => { throw Error('SecurityError'); };
  assert.equal(a.run('restoreRegistrationDraft()'), null);
  assert.equal(a.fields.fullName.value, '张三');
  a.context.localStorage.removeItem = () => { throw Error('SecurityError'); };
  a.run('clearRegistrationDraft()');
  assert.equal(a.fields.fullName.value, '张三');
});

test('clear removes the stored draft and resets form, selection, VIP and images', () => {
  const a = app();
  a.fields.fullName.value = '张三';
  a.context.selectedIdentity = 'gp';
  a.context.selectedPackage = PACKAGES.gp_panel;
  a.context.vipCode.value = 'VIP-123';
  a.nodes.portraitConsent.checked = true;
  a.run('saveRegistrationDraft(); clearRegistrationDraft()');
  assert.equal(a.storage.has(draftKey), false);
  assert.equal(a.fields.fullName.value, '');
  assert.equal(a.context.selectedIdentity, null);
  assert.equal(a.context.selectedPackage, null);
  assert.equal(a.context.vipCode.value, '');
  assert.equal(a.nodes.portraitConsent.checked, false);
  assert.equal(a.context.regStep, 1);
});

test('draft actions cannot mutate the form during submission', () => {
  const a = app();
  a.fields.fullName.value = '张三';
  a.run('saveRegistrationDraft()');
  const saved = a.storage.get(draftKey);
  a.context.regSubmitting = true;
  a.fields.fullName.value = '李四';
  a.run('saveRegistrationDraft(); clearRegistrationDraft()');
  assert.equal(a.storage.get(draftKey), saved);
  assert.equal(a.fields.fullName.value, '李四');
});

test('catalogue reload matches saved IDs to current prices and rejects unavailable packages', async () => {
  const a = app();
  a.context.fetch = async () => ({ ok: true, json: async () => ({ ok: true, packages: Object.values(PACKAGES).map(p => ({ ...p, price: 1234 })) }) });
  a.context.apiUrl = p => p;
  a.context.regNext = {};
  const start = html.indexOf('  function validPackages(');
  const end = html.indexOf('  function renderIdentities()', start);
  vm.runInContext(html.slice(start, end), a.context);
  const loadStart = html.indexOf('  async function loadPackages(');
  vm.runInContext(html.slice(loadStart, html.indexOf('  var REGISTRATION_DRAFT_KEY', loadStart)), a.context);
  await a.run("loadPackages({identityId:'gp', packageId:'gp_panel'})");
  assert.equal(a.context.selectedPackage.price, 1234);
  await a.run("loadPackages({identityId:'removed', packageId:'removed_ticket'})");
  assert.equal(a.context.selectedIdentity, null);
  assert.equal(a.context.selectedPackage, null);
});

test('a pending catalogue request cannot restore a draft after the user cleared it', async () => {
  const a = app();
  let resolve;
  a.context.fetch = () => new Promise(done => { resolve = done; });
  a.context.apiUrl = p => p;
  a.context.regNext = {};
  const start = html.indexOf('  function validPackages(');
  vm.runInContext(html.slice(start, html.indexOf('  function renderIdentities()', start)), a.context);
  const loadStart = html.indexOf('  async function loadPackages(');
  vm.runInContext(html.slice(loadStart, html.indexOf('  var REGISTRATION_DRAFT_KEY', loadStart)), a.context);
  const pending = a.run("loadPackages({identityId:'gp', packageId:'gp_panel'})");
  a.run('clearRegistrationDraft()');
  resolve({ ok: true, json: async () => ({ ok: true, packages: Object.values(PACKAGES) }) });
  await pending;
  assert.equal(a.context.selectedIdentity, null);
  assert.equal(a.context.selectedPackage, null);
});

test('only successful registration removes a draft; failure leaves it available', async () => {
  for (const ok of [false, true]) {
    const a = app();
    a.run('saveRegistrationDraft()');
    Object.assign(a.context, {
      regStep: 2, regNext: {}, regSaveDraft: {}, validateDetails: () => true,
      formPayload: () => ({ attendee: {} }), crypto: { randomUUID: () => 'id' },
      apiUrl: p => p, renderSuccess() {}, errorMessage: () => 'Failure',
      fetch: async () => ({ ok, json: async () => ({ ok, ref: 'ref', error: 'Failure' }) })
    });
    const start = html.indexOf('  async function submitRegistration()');
    vm.runInContext(html.slice(start, html.indexOf('  regSaveDraft.addEventListener', start)), a.context);
    await a.run('submitRegistration()');
    assert.equal(a.storage.has(draftKey), !ok);
    assert.equal(a.context.regSubmitting, false);
    assert.equal(a.context.regSaveDraft.disabled, false);
  }
});

test('opening restores directly once, and reopening never overwrites edits with the saved snapshot', async () => {
  const a = app();
  a.fields.fullName.value = '张三';
  a.context.regStep = 2;
  a.context.selectedIdentity = 'gp';
  a.context.selectedPackage = PACKAGES.gp_panel;
  a.run('saveRegistrationDraft()');
  const b = app(a.storage);
  Object.assign(b.context, {
    regModal: { classList: { add() {}, contains: () => true }, setAttribute() {} },
    document: { ...b.context.document, body: { style: {} } },
    regClose: { focus() {} }, setTimeout: fn => fn(),
    loadPackages: async draft => { if (draft) { b.context.selectedIdentity = draft.identityId; b.context.selectedPackage = PACKAGES[draft.packageId]; } }
  });
  const start = html.indexOf('  function openReg()');
  vm.runInContext(html.slice(start, html.indexOf('  function closeReg()', start)), b.context);
  b.run('openReg()');
  await Promise.resolve();
  assert.equal(b.fields.fullName.value, '张三');
  assert.equal(b.context.regStep, 2);
  b.fields.fullName.value = '李四';
  b.run('openReg()');
  await Promise.resolve();
  assert.equal(b.fields.fullName.value, '李四');
  assert.equal(JSON.parse(b.storage.get(draftKey)).fields.fullName, '张三', 'editing and opening do not auto-save');
});
