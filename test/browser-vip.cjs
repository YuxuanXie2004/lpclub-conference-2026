// Uses a temporary SQLite database and simulated Feishu/mail; never contacts real services.
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const localServer=require('./helpers/local-server.cjs');
(async()=>{
 const local=await localServer(),browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
   const item=local.store.generate({count:1,batchName:'Browser '+viewport.width})[0],code=local.store.detail(item.id).item.code;
   const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(local.base,{waitUntil:'domcontentloaded'});await page.locator('[data-open-form]').first().click();
   await page.locator('#vipCode').fill('WRONG');await page.locator('#vipApply').click();await page.locator('#vipMessage').filter({hasText:'Invalid'}).waitFor();
   await page.locator('#vipCode').fill(code.toLowerCase());await page.locator('#vipApply').click();await page.locator('#vipMessage').filter({hasText:'applied'}).waitFor();
   assert.equal(local.store.row(item.id).status,'available');
   await page.locator('[data-identity="gp"]').click();await page.locator('[data-package="gp_ticket"] input').check();
   assert.match(await page.locator('[data-package="gp_ticket"] .reg-price').textContent(),/VIP Code/);
   await page.locator('#regNext').click();assert.match(await page.locator('#regSummaryPrice').textContent(),/VIP Code/);
   await page.locator('#regBack').click();await page.locator('[data-package="gp_speaking"] input').check();await page.locator('#regNext').click();await page.locator('#regAlert').filter({hasText:'Delegate Pass only'}).waitFor();assert.equal(await page.locator('[data-reg-step="1"]').isVisible(),true);
   assert.equal(await page.locator('[data-package="gp_speaking"] .reg-price').textContent(),'USD 4,000');
   await page.locator('[data-identity="standard"]').click();assert.equal(await page.locator('#regNext').isDisabled(),true);
   assert.match(await page.locator('[data-package="standard_ticket"] .reg-price').textContent(),/VIP Code/);
   await page.locator('[data-identity="gp"]').click();await page.locator('[data-package="gp_ticket"] input').check();
   assert.equal(await page.locator('#registrationModal').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
   await page.locator('#regNext').click();
   for(const [name,value]of Object.entries({fullName:'Local Test',company:'Example',jobTitle:'Partner',country:'Canada',email:'test'+viewport.width+'@example-capital.com',phone:'4165551234'}))await page.locator('[name="'+name+'"]').fill(value);
   await page.locator('[name="visaLetter"]').selectOption('No');await page.locator('[name="consent"]').check();
   const attempts=[];let first=true;
   await page.route('**/api/order',async route=>{attempts.push(route.request().postDataJSON());if(first){first=false;await route.fetch();await route.abort();}else await route.continue();});
   const before=local.state.records.length,mails=local.state.messages.length;
   await page.locator('#regNext').click();await page.locator('#regAlert').filter({hasText:'Failed to fetch'}).waitFor();
   await page.locator('#regNext').click();await page.locator('[data-reg-step="3"]').waitFor({state:'visible'});
   assert.equal(attempts[0].idempotencyKey,attempts[1].idempotencyKey);assert.equal(local.state.records.length,before+1);assert.equal(local.state.messages.length,mails+1);
   assert.equal(local.store.row(item.id).status,'used');assert.match(await page.locator('#regSuccessCard').textContent(),/VIP Code/);assert.deepEqual(errors,[]);
   await page.screenshot({path:'/tmp/lpclub-vip-success-'+viewport.width+'.png'});await page.close();console.log('PASS one-time redemption + lost-response retry '+viewport.width+'px');
  }
  const page=await browser.newPage();const item=local.store.generate({count:1})[0],code=local.store.detail(item.id).item.code;
  await page.goto(local.base,{waitUntil:'domcontentloaded'});await page.locator('[data-open-form]').first().click();await page.locator('[data-identity="gp"]').click();await page.locator('[data-package="gp_ticket"] input').check();
  let release,started;const queued=new Promise(r=>started=r);
  await page.route('**/api/vip',route=>{release=()=>route.fulfill({json:{ok:true,package:{...require('../server/packages').PACKAGES.gp_ticket,price:0,displayPrice:'Complimentary / VIP Code',vipApplied:true}}});started();});
  await page.locator('#vipCode').fill(code);await page.locator('#vipApply').click();await queued;assert.equal(await page.locator('#regNext').isDisabled(),true);
  await page.locator('#vipCode').fill('OTHER');const response=page.waitForResponse(r=>r.url().endsWith('/api/vip'));await release();await (await response).finished();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));
  assert.equal(await page.locator('[data-package="gp_ticket"] .reg-price').textContent(),'USD 2,000');assert.ok(!(await page.locator('#vipMessage').textContent()).includes('applied'));
  await page.unroute('**/api/vip');local.store.revoke({ids:[item.id],reason:'test'});await page.locator('#vipApply').click();await page.locator('#vipMessage').filter({hasText:'revoked'}).waitFor();
  await page.close();console.log('PASS stale preview and revoked code');
  const blocked=await browser.newPage();const claimed=local.store.generate({count:1})[0],claimedCode=local.store.detail(claimed.id).item.code;
  await blocked.goto(local.base,{waitUntil:'domcontentloaded'});await blocked.locator('[data-open-form]').first().click();await blocked.locator('[data-identity="gp"]').click();await blocked.locator('[data-package="gp_ticket"] input').check();await blocked.locator('#vipCode').fill(claimedCode);await blocked.locator('#vipApply').click();await blocked.locator('#vipMessage').filter({hasText:'applied'}).waitFor();await blocked.locator('#regNext').click();
  for(const [name,value]of Object.entries({fullName:'Blocked User',company:'Example',jobTitle:'Partner',country:'Canada',email:'blocked@example-capital.com',phone:'4165551234'}))await blocked.locator('[name="'+name+'"]').fill(value);
  await blocked.locator('[name="visaLetter"]').selectOption('No');await blocked.locator('[name="consent"]').check();
  const key=require('node:crypto').randomUUID();local.store.reserve({code:claimedCode,idempotencyKey:key,email:'other@example-capital.com',packageId:'gp_ticket',requestHash:'other',registrationRef:'OTHER-CLAIM'});local.store.complete(key,'other-record');
  const before=local.state.records.length;await blocked.locator('#regNext').click();await blocked.locator('#vipMessage').filter({hasText:'already been used'}).waitFor();
  assert.equal(await blocked.locator('[data-reg-step="1"]').isVisible(),true);assert.equal(await blocked.locator('[data-package="gp_ticket"] .reg-price').textContent(),'USD 2,000');assert.equal(local.state.records.length,before);await blocked.close();console.log('PASS already-used code blocks final submission and requires price review');

 }finally{await browser.close();await local.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
