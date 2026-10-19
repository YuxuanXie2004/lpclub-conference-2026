// Run with Playwright on NODE_PATH and Chrome available, like browser-registration.cjs.
// Browser regression with simulated APIs; no registration or email reaches external services.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { PACKAGES } = require('../server/packages');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const file = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/conference(?=\/)/, '');
  const target = file === '/' ? path.join(root, 'index.html') : path.join(root, file);
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    res.writeHead(404).end(); return;
  }
  res.setHeader('Content-Type', target.endsWith('.html') ? 'text/html; charset=utf-8' : 'image/png');
  fs.createReadStream(target).pipe(res);
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const [locale, expected] of [['zh-CN', 'zh-CN'], ['zh-TW', 'zh-CN'], ['en-US', 'en'], ['fr-FR', 'en']]) {
      const context = await browser.newContext({ locale });
      const page = await context.newPage();
      await page.route('https://fonts.googleapis.com/**', route => route.abort());
      await page.route('**/api/packages', route => route.fulfill({ json: { ok: true, packages: Object.values(PACKAGES) } }));
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      assert.equal(await page.locator('html').getAttribute('lang'), expected);
      assert.equal(await page.evaluate(() => localStorage.getItem('lpclub-language')), null);
      await context.close();
    }
    console.log('PASS browser language defaults and unsupported-language fallback');

    const loadingContext = await browser.newContext({ locale: 'zh-CN' });
    const loadingPage = await loadingContext.newPage();
    await loadingPage.route('https://fonts.googleapis.com/**', route => route.abort());
    let releaseCatalogue;
    let announceCatalogueRequest;
    const catalogueRequested = new Promise(resolve => { announceCatalogueRequest = resolve; });
    await loadingPage.route('**/api/packages', route => { releaseCatalogue = () => route.fulfill({ json: { ok: true, packages: Object.values(PACKAGES) } }); announceCatalogueRequest(); });
    await loadingPage.goto(base, { waitUntil: 'domcontentloaded' });
    await catalogueRequested;
    await loadingPage.locator('[data-open-form]').first().click();
    assert.match(await loadingPage.locator('#regIdentities').textContent(), /正在加载/);
    await loadingPage.locator('[data-language="en"]').evaluate(button => button.click());
    assert.match(await loadingPage.locator('#regIdentities').textContent(), /Loading registration categories/);
    await releaseCatalogue();
    await loadingPage.locator('[data-identity="gp"]').waitFor();
    await loadingContext.close();
    console.log('PASS translated loading state while catalogue request is pending');

    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
      const context = await browser.newContext({ locale: 'zh-CN', viewport });
      const page = await context.newPage();
      await page.route('https://fonts.googleapis.com/**', route => route.abort());
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/packages', route => route.fulfill({ json: { ok: true, packages: Object.values(PACKAGES) } }));
      await page.route('**/api/vip', route => route.fulfill({ status: 400, json: { ok: false, code: 'INVALID_VIP_CODE', error: 'Invalid VIP Code.' } }));
      let payload;
      await page.route('**/api/order', route => {
        payload = route.request().postDataJSON();
        return route.fulfill({ json: { ok: true, ref: 'LPC26-TEST', package: PACKAGES[payload.packageId], email: { sent: true } } });
      });
      await page.goto(base + '/conference/', { waitUntil: 'domcontentloaded' });
      assert.match(await page.locator('.hero h1').textContent(), /第三届/);
      assert.match(await page.title(), /第三届/);
      assert.match(await page.locator('meta[name="description"]').getAttribute('content'), /香港/);
      assert.equal(await page.locator('.brand img').count(), 2);
      assert.equal(await page.locator('.brand img').first().evaluate(el => el.complete && el.naturalWidth > 0), true);
      const favicon = await page.locator('link[rel="icon"]').getAttribute('href');
      assert.equal((await page.request.get(new URL(favicon, page.url()).href)).status(), 200);
      assert.equal(await page.locator('.nav').evaluate(el => el.scrollWidth <= el.clientWidth), true);
      await page.getByRole('button', { name: 'English', exact: true }).first().click();
      assert.equal(await page.locator('html').getAttribute('lang'), 'en');
      await page.reload({ waitUntil: 'domcontentloaded' });
      assert.equal(await page.locator('html').getAttribute('lang'), 'en');
      assert.match(await page.locator('.hero h1').textContent(), /The 3rd/);
      assert.equal(await page.locator('.nav').evaluate(el => el.scrollWidth <= el.clientWidth), true);
      await page.getByRole('button', { name: '中文', exact: true }).first().click();
      await page.waitForFunction(() => Array.from(document.querySelectorAll('.stat b[data-count]')).every(el => el.getBoundingClientRect().top >= innerHeight || el.textContent === Number(el.dataset.count).toLocaleString('en-US') + el.dataset.suffix));
      await page.screenshot({ path: '/tmp/lpclub-i18n-' + viewport.width + '.png', animations: 'disabled' });
      await page.locator('footer').screenshot({ path: '/tmp/lpclub-i18n-footer-' + viewport.width + '.png', animations: 'disabled' });
      await page.locator('[data-open-form]').first().click();
      await page.locator('[data-identity="gp"]').click();
      assert.match(await page.locator('[data-identity="gp"]').textContent(), /普通合伙人/);
      await page.locator('#vipCode').fill('INVALID');
      await page.locator('#vipApply').click();
      await page.locator('#vipMessage.error').waitFor();
      assert.match(await page.locator('#vipMessage').textContent(), /无效/);
      await page.locator('#vipCode').fill('');
      await page.locator('[data-package="gp_ticket"] input').check();
      assert.equal(await page.locator('[data-package="gp_ticket"] .reg-price').textContent(), 'USD 2,000');
      await page.locator('#regNext').click();
      assert.equal(await page.locator('[name="companyType"]').inputValue(), 'General Partner (GP)');
      assert.match(await page.locator('[name="companyType"] option:checked').textContent(), /普通合伙人/);
      const fields = { fullName: '<Jane>', company: 'Capital Example', jobTitle: 'Partner', country: 'Canada', email: 'jane@capital-example.com', phone: '4165551234' };
      for (const [name, value] of Object.entries(fields)) await page.locator('[name="' + name + '"]').fill(value);
      await page.locator('[name="visaLetter"]').selectOption('No');
      await page.locator('[data-multi="focus"] input[value="Private Equity"]').check();
      await page.locator('[name="consent"]').check();
      await page.locator('#regClose').click();
      await page.getByRole('button', { name: 'English', exact: true }).first().click();
      await page.locator('[data-open-form]').first().click();
      await page.locator('#regNext').click();
      assert.equal(await page.locator('[name="fullName"]').inputValue(), '<Jane>');
      assert.equal(await page.locator('[name="visaLetter"]').inputValue(), 'No');
      assert.equal(await page.locator('[data-multi="focus"] input:checked').inputValue(), 'Private Equity');
      await page.locator('#regClose').click();
      await page.getByRole('button', { name: '中文', exact: true }).first().click();
      await page.locator('[data-open-form]').first().click();
      await page.locator('#regNext').click();
      await page.screenshot({ path: '/tmp/lpclub-i18n-form-' + viewport.width + '.png', animations: 'disabled' });
      await page.locator('#regNext').click();
      await page.locator('[data-reg-step="3"]').waitFor({ state: 'visible' });
      assert.match(await page.locator('#regSuccessText').textContent(), /<Jane>.*报名/);
      assert.match(await page.locator('#regSuccessCard').textContent(), /普通合伙人.*参会通行证/);
      assert.match(await page.locator('#regEmailStatus').textContent(), /确认邮件/);
      assert.equal(payload.attendee.companyType, 'General Partner (GP)');
      assert.equal(payload.attendee.visaLetter, 'No');
      assert.deepEqual(payload.attendee.focus, ['Private Equity']);
      assert.equal(payload.packageId, 'gp_ticket');
      assert.equal(await page.locator('#registrationModal').evaluate(el => el.scrollWidth <= el.clientWidth), true);
      assert.deepEqual(errors, []);
      await context.close();
      console.log('PASS language persistence, logo, form values and Chinese registration ' + viewport.width + 'px');
    }

    const context = await browser.newContext({ locale: 'zh-CN' });
    await context.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage blocked'); } });
    });
    const page = await context.newPage();
      await page.route('https://fonts.googleapis.com/**', route => route.abort());
    await page.route('**/api/packages', route => route.abort());
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
    await page.locator('[data-open-form]').first().click();
    assert.match(await page.locator('#regAlert').textContent(), /加载/);
    await page.locator('#regClose').click();
    await page.getByRole('button', { name: 'English', exact: true }).first().click();
    await page.locator('[data-open-form]').first().click();
    assert.match(await page.locator('#regAlert').textContent(), /could not be loaded/);
    assert.equal(await page.locator('#regNext').isDisabled(), true);
    await context.close();
    console.log('PASS blocked storage and translated catalogue failure');

    const failures = await browser.newContext({ locale: 'zh-CN' });
    const failedPage = await failures.newPage();
    await failedPage.route('https://fonts.googleapis.com/**', route => route.abort());
    await failedPage.route('**/api/packages', route => route.fulfill({ json: { ok: true, packages: Object.values(PACKAGES) } }));
    let failureCode = 'DATABASE_UNAVAILABLE';
    await failedPage.route('**/api/order', route => route.fulfill({ status: 503, json: { ok: false, code: failureCode, error: failureCode === 'REGISTRATION_ERROR' ? 'Please complete all required fields: fullName' : 'Server error', ref: 'LPC26-EXISTING' } }));
    await failedPage.goto(base, { waitUntil: 'domcontentloaded' });
    await failedPage.locator('[data-open-form]').first().click();
    await failedPage.locator('[data-identity="lp"]').click();
    await failedPage.locator('[data-package="lp_ticket"] input').check();
    assert.match(await failedPage.locator('[data-package="lp_ticket"] .reg-price').textContent(), /免费/);
    await failedPage.locator('#regNext').click();
    for (const [name, value] of Object.entries({ fullName: 'Test', company: 'Capital', jobTitle: 'Partner', country: 'China', email: 'test@capital.example', phone: '13800138000' })) await failedPage.locator('[name="' + name + '"]').fill(value);
    await failedPage.locator('[name="visaLetter"]').selectOption('No');
    await failedPage.locator('[name="consent"]').check();
    for (const [code, pattern] of [['DATABASE_UNAVAILABLE', /服务暂不可用/], ['DUPLICATE_REGISTRATION', /已有报名记录.*LPC26-EXISTING/], ['VIP_REVIEW_REQUIRED', /核对.*报名编号.*LPC26-EXISTING/]]) {
      failureCode = code;
      await failedPage.locator('#regNext').click();
      await failedPage.waitForFunction(() => !document.getElementById('regNext').disabled);
      assert.match(await failedPage.locator('#regAlert').textContent(), pattern);
      assert.equal(await failedPage.locator('[data-reg-step="3"]').isVisible(), false);
      assert.equal(await failedPage.locator('[name="fullName"]').inputValue(), 'Test');
    }
    await failedPage.locator('[data-language="en"]').evaluate(button => button.click());
    assert.match(await failedPage.locator('#regAlert').textContent(), /Please contact LP CLUB to confirm your registration.*Registration reference: LPC26-EXISTING/);
    await failedPage.locator('[data-language="zh-CN"]').evaluate(button => button.click());
    assert.match(await failedPage.locator('#regAlert').textContent(), /核对.*报名编号.*LPC26-EXISTING/);
    failureCode = 'REGISTRATION_ERROR';
    await failedPage.locator('[name="fullName"]').fill('   ');
    await failedPage.locator('#regNext').click();
    await failedPage.waitForFunction(() => !document.getElementById('regNext').disabled);
    assert.match(await failedPage.locator('#regAlert').textContent(), /必填项.*姓名/);
    await failedPage.locator('[data-language="en"]').evaluate(button => button.click());
    assert.match(await failedPage.locator('#regAlert').textContent(), /Please complete all required fields: fullName/);
    await failures.close();
    console.log('PASS Chinese complimentary price and recoverable submission errors');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
