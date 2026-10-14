// Run with Playwright on NODE_PATH and the local server at REGISTRATION_TEST_URL.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { PACKAGES } = require('../server/packages');
const url = process.env.REGISTRATION_TEST_URL || 'http://localhost:18877';
const catalogue = { ok: true, packages: Object.values(PACKAGES) };

async function fillDetails(page) {
  const fields = { fullName: 'Jane Test', company: 'Capital Example', jobTitle: 'Partner', country: 'Canada', email: 'jane@capital-example.com', phone: '4165551234' };
  for (const [name, value] of Object.entries(fields)) await page.locator('[name="' + name + '"]').fill(value);
  await page.locator('[name="visaLetter"]').selectOption('No');
  await page.locator('[name="consent"]').check();
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/api/packages', route => route.fulfill({ json: catalogue }));
      let payload;
      await page.route('**/api/order', async route => {
        payload = route.request().postDataJSON();
        const p = PACKAGES[payload.packageId];
        await route.fulfill({ json: { ok: true, ref: 'LPC26-TEST', package: p, email: { sent: true } } });
      });
      await page.goto(url);
      await page.locator('[data-open-form]').first().click();
      await page.locator('.reg-identity').first().waitFor({ timeout: 3000 });
      assert.equal(await page.locator('.reg-identity').count(), 5);
      assert.equal(await page.locator('#regNext').isDisabled(), true);
      await page.locator('[data-identity="gp"]').click();
      assert.equal(await page.locator('.reg-package').count(), 4);
      await page.locator('[data-package="gp_speaking"] input').check();
      assert.equal(await page.locator('#regNext').isEnabled(), true);
      await page.locator('[data-identity="lpclub_member"]').click();
      assert.equal(await page.locator('#regNext').isDisabled(), true);
      assert.equal(await page.locator('.reg-package input:checked').count(), 0);
      await page.locator('[data-package="lpclub_member_ticket"] input').check();
      await page.locator('#regNext').click();
      assert.match(await page.locator('#regSummaryPrice').textContent(), /Complimentary/);
      assert.equal(await page.locator('[name="companyType"]').inputValue(), 'LP CLUB Member');
      await page.locator('#regBack').click();
      await page.locator('[data-identity="investment_company"]').click();
      await page.locator('[data-package="investment_company_matchmaking"] input').check();
      await page.locator('#regNext').click();
      assert.match(await page.locator('#regSummaryName').textContent(), /Investment Firm/);
      assert.equal(await page.locator('#regSummaryPrice').textContent(), 'USD 7,000');
      assert.equal(await page.locator('[name="matchmaking"]').count(), 0);
      await fillDetails(page);
      assert.equal(await page.locator('#registrationModal').evaluate(el => el.scrollWidth <= el.clientWidth), true);
      await page.locator('#regNext').click();
      await page.locator('[data-reg-step="3"]').waitFor({ state: 'visible' });
      assert.equal(payload.packageId, 'investment_company_matchmaking');
      assert.match(await page.locator('#regSuccessCard').textContent(), /Investment Firm/);
      assert.match(await page.locator('#regSuccessCard').textContent(), /7,000/);
      await page.locator('#regClose').click();
      await page.locator('[data-open-form]').first().click();
      assert.equal(await page.locator('#regNext').isDisabled(), true);
      assert.equal(await page.locator('.reg-package').count(), 0);
      assert.deepEqual(errors, []);
      await page.close();
      console.log('PASS registration flow ' + viewport.width + 'px');
    }

    for (const response of [null, { ok: true, packages: [] }, { ok: true, packages: [{}] }, { ok: false, packages: catalogue.packages }]) {
      const page = await browser.newPage();
      await page.route('**/api/packages', route => response === null ? route.abort() : route.fulfill({ json: response }));
      await page.goto(url);
      await page.locator('[data-open-form]').first().click();
      await page.locator('#regAlert.show').waitFor({ timeout: 3000 });
      assert.equal(await page.locator('#regNext').isDisabled(), true);
      assert.equal(await page.locator('.reg-identity').count(), 0);
      await page.close();
    }
    console.log('PASS catalogue failures block registration');

    for (const code of ['DATABASE_UNAVAILABLE', 'DUPLICATE_REGISTRATION']) {
      const page = await browser.newPage();
      await page.route('**/api/packages', route => route.fulfill({ json: catalogue }));
      await page.route('**/api/order', route => route.fulfill({ status: code === 'DATABASE_UNAVAILABLE' ? 503 : 409, json: {
        ok: false, code, error: 'Registration failed', ref: code === 'DUPLICATE_REGISTRATION' ? 'LPC26-EXISTING' : undefined
      } }));
      await page.goto(url);
      await page.locator('[data-open-form]').first().click();
      await page.locator('[data-identity="gp"]').click();
      await page.locator('[data-package="gp_ticket"] input').check();
      await page.locator('#regNext').click();
      await fillDetails(page);
      await page.locator('#regNext').click();
      await page.locator('#regAlert.show').waitFor();
      assert.equal(await page.locator('[data-reg-step="3"]').isVisible(), false);
      assert.equal(await page.locator('#regNext').isEnabled(), true);
      await page.close();
    }
    console.log('PASS submission failures retain the editable form');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
