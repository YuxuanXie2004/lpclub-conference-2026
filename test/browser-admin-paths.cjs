// Real browser and HTTP proxy; temporary SQLite and simulated Feishu/SMTP only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const { chromium } = require('playwright');
const localServer = require('./helpers/local-server.cjs');

(async () => {
  const local = await localServer();
  const prefix = '/2026-pe-conference';
  const proxy = http.createServer((req, res) => {
    if (!req.url.startsWith(prefix + '/')) { res.writeHead(404).end(); return; }
    const upstream = http.request(local.base + req.url.slice(prefix.length), {
      method: req.method, headers: req.headers
    }, response => { res.writeHead(response.statusCode, response.headers); response.pipe(res); });
    upstream.on('error', () => res.writeHead(502).end());
    req.pipe(upstream);
  });
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const [base, deployedPrefix] of [[local.base, ''], ['http://127.0.0.1:' + proxy.address().port + prefix, prefix]]) {
      const email = `path-${deployedPrefix ? 'prefix' : 'root'}@example-capital.com`;
      await local.backend.processOrder({ packageId: 'gp_ticket', attendee: {
        fullName: 'Path Test', company: 'Example', companyType: 'General Partner (GP)', jobTitle: 'Partner', country: 'Canada',
        email, dial: '+1', phone: '4165551234', visaLetter: 'No', consent: true
      } });
      const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage(), errors = [], wrongPaths = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => {
        const url = new URL(request.url());
        if (url.origin === new URL(base).origin && !url.pathname.startsWith(deployedPrefix + '/')) wrongPaths.push(url.pathname);
      });
      await page.route('https://fonts.googleapis.com/**', route => route.abort());
      page.on('dialog', dialog => dialog.accept(dialog.type() === 'prompt' ? 'Local path regression' : undefined));
      for (const endpoint of ['/table', '/vip-codes', '/api/registrations', '/api/admin/vip-codes']) {
        const response = await context.request.get(base + endpoint);
        assert.equal(response.status(), 401);
      }
      await page.goto(base + '/table?token=local-test-admin');
      await page.locator('#body').getByText(email, { exact: true }).waitFor();
      const row = page.locator('#body tr').filter({ hasText: email });
      const updated = page.waitForResponse(response => response.url().includes('/api/admin/status') && response.status() === 200);
      await row.locator('select.status').selectOption('Approved');
      await updated;
      const csvDownload = page.waitForEvent('download');
      await page.locator('#export').click();
      const csv = fs.readFileSync(await (await csvDownload).path(), 'utf8');
      assert.ok(csv.includes(email));
      const deleted = page.waitForResponse(response => response.url().includes('/api/admin/delete') && response.status() === 200);
      await row.locator('.del').click();
      await deleted;
      await page.locator('#deletedTab').click();
      await row.locator('.restore').waitFor();
      const restored = page.waitForResponse(response => response.url().includes('/api/admin/restore') && response.status() === 200);
      await row.locator('.restore').click();
      await restored;
      await page.locator('#vipTab').click();
      assert.equal(new URL(page.url()).pathname, deployedPrefix + '/vip-codes');
      await page.locator('#pageInfo').filter({ hasText: 'Total' }).waitFor();
      await page.locator('#newCodes').click();
      await page.locator('#generateCount').fill('1');
      await page.locator('#generateSubmit').click();
      await page.locator('#selectedCount').filter({ hasText: 'Selected 1' }).waitFor();
      const vipDownload = page.waitForEvent('download');
      await page.locator('#exportSelected').click();
      assert.ok(fs.readFileSync(await (await vipDownload).path(), 'utf8').includes('VIP-'));
      await page.locator('#activeTab').click();
      assert.equal(new URL(page.url()).pathname, deployedPrefix + '/table');
      await page.locator('#body').getByText(email, { exact: true }).waitFor();
      assert.deepEqual(wrongPaths, []);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`PASS ${deployedPrefix || '/'} auth/list/status/delete/restore/CSV/VIP/navigation`);
    }
  } finally {
    await browser.close();
    await new Promise(resolve => proxy.close(resolve));
    await local.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
