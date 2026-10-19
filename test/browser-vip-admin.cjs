const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright'),localServer=require('./helpers/local-server.cjs');
(async()=>{
 const local=await localServer(),browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
   const context=await browser.newContext({viewport,locale:'en-US',permissions:['clipboard-read','clipboard-write']});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(local.base+'/table?token=local-test-admin',{waitUntil:'domcontentloaded'});
   assert.deepEqual(await page.locator('.tabs .tab').allTextContents(),['Active Registrations','Deleted / 回收站','VIP Codes']);assert.equal(await page.locator('header .actions').getByText('VIP Codes').count(),0);
   await page.locator('#vipTab').click();assert.equal(await page.locator('#vipTab').getAttribute('aria-current'),'page');
   assert.equal(await page.locator('h1').textContent(),'Registration Operations · 报名管理');
   const deletedResponse=page.waitForResponse(r=>r.url().includes('/api/registrations?mode=deleted'));
   await page.locator('#deletedTab').click();await deletedResponse;assert.ok((await page.locator('#deletedTab').getAttribute('class')).includes('on'));
   await page.locator('#vipTab').click();await page.locator('#pageInfo').filter({hasText:'Total'}).waitFor();
   await page.locator('#newCodes').click();await page.locator('#generateCount').fill('2');await page.locator('#generateSubmit').click();
   await page.locator('#selectedCount').filter({hasText:'Selected 2'}).waitFor();await page.locator('#copySelected').click();await page.locator('#toast').filter({hasText:'Copied 2'}).waitFor();
   const copied=await page.evaluate(()=>navigator.clipboard.readText());assert.equal(copied.split('\n').length,2);
   const downloadPromise=page.waitForEvent('download');await page.locator('#exportSelected').click();const download=await downloadPromise;const csv=fs.readFileSync(await download.path(),'utf8');assert.ok(csv.includes(copied.split('\n')[0]));
   await page.locator('.rowDetail').first().click();await page.locator('#detailContent').waitFor({state:'visible'});const code=await page.locator('#fullCode').textContent();assert.ok(copied.includes(code));
   assert.equal(await page.locator('#recipientName').count(),0);assert.equal(await page.locator('#detailForm').count(),0);
   const item=local.store.preview(code);await page.locator('[data-close="detailModal"]').click();
   const attendee=await context.newPage(),email='vip'+viewport.width+'@example-capital.com',name='Attendee '+viewport.width;
   await attendee.goto(local.base,{waitUntil:'domcontentloaded'});await attendee.locator('[data-open-form]').first().click();await attendee.locator('[data-identity="gp"]').click();await attendee.locator('[data-package="gp_ticket"] input').check();
   await attendee.locator('#vipCode').fill(code);await attendee.locator('#vipApply').click();await attendee.locator('#vipMessage').filter({hasText:'applied'}).waitFor();assert.equal(local.store.row(item.id).status,'available');assert.match(await attendee.locator('[data-package="gp_ticket"] .reg-price').textContent(),/USD 0/);
   await attendee.locator('#regNext').click();for(const [field,value]of Object.entries({fullName:name,company:'Example',jobTitle:'Partner',country:'Canada',email,phone:'4165551234'}))await attendee.locator('[name="'+field+'"]').fill(value);
   await attendee.locator('[name="visaLetter"]').selectOption('No');await attendee.locator('[name="consent"]').check();await attendee.locator('#regNext').click();await attendee.locator('[data-reg-step="3"]').waitFor({state:'visible'});await attendee.close();
   await page.locator('#search').fill(email);await page.locator('#searchButton').click();await page.locator('#pageInfo').filter({hasText:'Total 1'}).waitFor();assert.ok((await page.locator('#body').textContent()).includes(name));assert.ok((await page.locator('#body').textContent()).includes(email));assert.equal(await page.locator('#body .badge').textContent(),'Used');
   assert.equal(local.store.detail(item.id).item.usedName,name);assert.equal(local.store.detail(item.id).item.usedEmail,email);
   await page.screenshot({path:'/tmp/lpclub-vip-automatic-user-'+viewport.width+'.png',fullPage:true});
   await page.locator('#search').fill('');await page.locator('#statusFilter').selectOption('available');await page.locator('#searchButton').click();await page.locator('#body .badge').filter({hasText:'Available'}).first().waitFor();
   await page.locator('.rowDetail').first().click();await page.locator('#detailContent').waitFor({state:'visible'});const revokeCode=await page.locator('#fullCode').textContent();page.once('dialog',dialog=>dialog.accept());await page.locator('#revokeOne').click();await page.locator('#detailStatus').filter({hasText:'Revoked'}).waitFor();assert.throws(()=>local.store.preview(revokeCode),e=>e.code==='VIP_REVOKED');await page.locator('[data-close="detailModal"]').click();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.screenshot({path:'/tmp/lpclub-vip-admin-'+viewport.width+'.png',fullPage:true});assert.deepEqual(errors,[]);await context.close();console.log('PASS admin generate/copy/CSV/automatic attendee/revoke '+viewport.width+'px');
  }
  const item=local.store.generate({count:1,batchName:'Reconcile'})[0],code=local.store.detail(item.id).item.code;
  local.state.saveMode='ambiguous';const input={packageId:'gp_ticket',vipCode:code,idempotencyKey:require('node:crypto').randomUUID(),attendee:{fullName:'Review User',company:'Example',companyType:'General Partner (GP)',country:'Canada',jobTitle:'Partner',email:'review@example-capital.com',phone:'4165551234',visaLetter:'No',consent:true}};
  await assert.rejects(local.backend.processOrder(input),e=>e.code==='VIP_REVIEW_REQUIRED');local.state.records.at(-1).fields['Is Deleted / 已删除']=true;
  const page=await browser.newPage();await page.goto(local.base+'/vip-codes?token=local-test-admin',{waitUntil:'domcontentloaded'});await page.locator('#statusFilter').selectOption('review');await page.locator('#searchButton').click();await page.locator('#pageInfo').filter({hasText:'Total 1'}).waitFor();await page.locator('.rowDetail').first().click();await page.locator('#reconcile').waitFor({state:'visible'});await page.locator('#reconcile').click();await page.locator('#detailStatus').filter({hasText:'Used'}).waitFor();assert.equal(local.store.row(item.id).status,'used');assert.equal(local.store.detail(item.id).item.usedName,'Review User');await page.close();console.log('PASS admin reconciliation includes recycled registration');
 }finally{await browser.close();await local.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
