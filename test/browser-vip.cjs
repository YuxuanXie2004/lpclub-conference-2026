// Requires Playwright, Chrome and a local server configured with VIP_CODES=TEST-VIP.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const url = process.env.REGISTRATION_TEST_URL || 'http://localhost:18879';
(async () => {
 const browser = await chromium.launch({ channel: 'chrome', headless: true });
 try {
  for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
   const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));
   let submitted;
   await page.route('**/api/order',async route=>{
    submitted=route.request().postDataJSON();
    await route.fulfill({json:{ok:true,ref:'LPC26-VIP-TEST',package:{identityName:'General Partner (GP)',ticketName:'Delegate Pass',price:0,displayPrice:'Complimentary / VIP Code'},email:{sent:true}}});
   });
   await page.goto(url,{waitUntil:'domcontentloaded'});await page.locator('[data-open-form]').first().click();
   await page.locator('#vipCode').waitFor({timeout:3000});
   await page.locator('[data-identity="gp"]').click();await page.locator('[data-package="gp_ticket"] input').check();
   await page.locator('#vipCode').fill('WRONG');await page.locator('#vipApply').click();await page.locator('#vipMessage').filter({hasText:'Invalid'}).waitFor();
   assert.equal(await page.locator('[data-package="gp_ticket"] .reg-price').textContent(),'USD 2,000');
   await page.locator('#vipCode').fill('test-vip');await page.locator('#vipApply').click();await page.locator('#vipMessage').filter({hasText:'applied'}).waitFor();
   assert.match(await page.locator('[data-package="gp_ticket"] .reg-price').textContent(),/VIP Code/);
   await page.locator('#regNext').click();assert.match(await page.locator('#regSummaryPrice').textContent(),/VIP Code/);
   await page.locator('#regBack').click();await page.locator('[data-package="gp_speaking"] input').check();assert.equal(await page.locator('#vipApply').isDisabled(),true);
   assert.equal(await page.locator('[data-package="gp_speaking"] .reg-price').textContent(),'USD 4,000');
   await page.locator('[data-package="gp_ticket"] input').check();await page.locator('#vipApply').click();await page.locator('#vipMessage').filter({hasText:'applied'}).waitFor();
   await page.locator('#vipCode').fill('CHANGED');assert.equal(await page.locator('[data-package="gp_ticket"] .reg-price').textContent(),'USD 2,000');
   await page.locator('#vipCode').fill('TEST-VIP');await page.locator('#vipApply').click();await page.locator('#vipMessage').filter({hasText:'applied'}).waitFor();
   await page.locator('[data-identity="standard"]').click();assert.equal(await page.locator('#regNext').isDisabled(),true);
   await page.locator('[data-package="standard_ticket"] input').check();assert.equal(await page.locator('[data-package="standard_ticket"] .reg-price').textContent(),'USD 3,500');
   await page.locator('[data-identity="gp"]').click();await page.locator('[data-package="gp_ticket"] input').check();
   await page.locator('#vipApply').click();await page.locator('#vipMessage').filter({hasText:'applied'}).waitFor();
   assert.equal(await page.locator('#registrationModal').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
   await page.screenshot({path:'/tmp/lpclub-vip-'+viewport.width+'.png'});
   await page.locator('#regNext').click();
   for(const [name,value] of Object.entries({fullName:'Local Test',company:'Example',jobTitle:'Partner',country:'Canada',email:'test@example-capital.com',phone:'4165551234'}))await page.locator('[name="'+name+'"]').fill(value);
   await page.locator('[name="visaLetter"]').selectOption('No');await page.locator('[name="consent"]').check();await page.locator('#regNext').click();
   await page.locator('[data-reg-step="3"]').waitFor({state:'visible'});assert.equal(submitted.vipCode,'TEST-VIP');
   assert.match(await page.locator('#regSuccessCard').textContent(),/VIP Code/);assert.deepEqual(errors,[]);
   await page.close();console.log('PASS VIP redemption '+viewport.width+'px');
  }

  const page=await browser.newPage();
  let release, started;
  const queued=new Promise(resolve=>{started=resolve});
  await page.route('**/api/vip',route=>{
   release=()=>route.fulfill({json:{ok:true,package:{...require('../server/packages').PACKAGES.gp_ticket,price:0,displayPrice:'Complimentary / VIP Code',vipApplied:true}}});
   started();
  });
  await page.goto(url,{waitUntil:'domcontentloaded'});await page.locator('[data-open-form]').first().click();
  await page.locator('[data-identity="gp"]').click();await page.locator('[data-package="gp_ticket"] input').check();
  await page.locator('#vipCode').fill('TEST-VIP');await page.locator('#vipApply').click();await queued;
  assert.equal(await page.locator('#regNext').isDisabled(),true);
  await page.locator('[data-identity="standard"]').click();await page.locator('[data-package="standard_ticket"] input').check();
  const response=page.waitForResponse(r=>r.url().endsWith('/api/vip'));await release();await (await response).finished();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
  assert.equal(await page.locator('[data-package="standard_ticket"] .reg-price').textContent(),'USD 3,500');
  assert.ok(!(await page.locator('#vipMessage').textContent()).includes('applied'));
  await page.unroute('**/api/vip');await page.route('**/api/vip',route=>route.abort());
  await page.locator('#vipApply').click();await page.locator('#vipMessage.error').waitFor();
  assert.equal(await page.locator('#regNext').isEnabled(),true);
  assert.equal(await page.locator('[data-package="standard_ticket"] .reg-price').textContent(),'USD 3,500');
  await page.close();console.log('PASS stale VIP responses and network failure preserve normal prices');
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
