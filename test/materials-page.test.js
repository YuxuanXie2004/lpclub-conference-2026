'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const page = () => require('../assets/materials-page');

test('material rows show resubmission instructions without exposing file versions', () => {
  const html = page().assetMarkup('logo', {status:'rejected',version:52,publishedVersion:51,preview:true,reason:'请重交清晰图片 <script>alert(1)</script>'}, 'zh');
  assert.match(html, /需要重交/);
  assert.match(html, /重新上传/);
  assert.match(html, /请重交清晰图片 &lt;script&gt;/);
  assert.doesNotMatch(html, /v52|v51|已发布:|Published|<script>/);
  assert.doesNotMatch(html, /Upload \/ replace|Choose image|Not uploaded/);
  assert.match(html, /type="file"/);
  assert.match(html, /accept="image\/jpeg,image\/png,image\/webp"/);
});

test('public and pending replacements have clear user-facing statuses', () => {
  assert.equal(page().assetState('card', {status:'received'}, 'zh').label, '已提交');
  assert.equal(page().assetState('portrait', {status:'pending',version:2,publishedVersion:1}, 'zh').label, '审核中');
  assert.equal(page().assetState('logo', {status:'approved',publishedVersion:1}, 'zh').label, '已通过');
  assert.equal(page().assetState('logo', {status:'missing'}, 'en').label, 'To upload');
});

test('portrait consent is absent for attendees without speaker eligibility', () => {
  const data = {portraitEligible:false,consents:{portrait:false,logo:true}};
  assert.doesNotMatch(page().consentMarkup(data, 'zh'), /portraitConsent|肖像/);
  assert.match(page().consentMarkup(data, 'zh'), /logoConsent/);
  assert.match(page().consentMarkup({...data,portraitEligible:true}, 'en'), /portraitConsent/);
});

test('all twenty packages use readable names instead of internal identifiers', () => {
  const {PACKAGES} = require('../server/packages');
  for (const p of Object.values(PACKAGES)) {
    assert.doesNotMatch(page().packageLabel(p.id, 'zh'), /_/);
    assert.doesNotMatch(page().packageLabel(p.id, 'en'), /_/);
  }
  assert.match(page().packageLabel('gp_speaking', 'zh'), /演讲/);
  assert.equal(page().packageLabel('<unknown>', 'zh'), '大会报名');
});

test('image selection checks empty files, exact size limit and allowed image formats', () => {
  assert.equal(page().validateImage({size:5*1024*1024,type:'image/png'}, 'zh'), '');
  for (const file of [null,{size:0,type:'image/png'},{size:5*1024*1024+1,type:'image/jpeg'},{size:1,type:'image/svg+xml'},{size:1,type:'application/pdf'}]) assert.ok(page().validateImage(file,'zh'));
});

test('network, expired-link and storage failures tell users what to do', () => {
  assert.match(page().errorText({status:401}, 'zh'), /重新发送/);
  assert.match(page().errorText({code:'MATERIALS_STORAGE_PERMISSION_REQUIRED'}, 'zh'), /联系主办方/);
  assert.match(page().errorText(new TypeError('Failed to fetch'), 'en'), /try again/i);
  assert.doesNotMatch(page().errorText({status:503,message:'mysql secret'}, 'en'), /mysql secret/);
});

test('selected images remain pending confirmation and can be cancelled', () => {
  const html = page().assetMarkup('logo', {status:'missing',preview:false}, 'zh', {name:'公司 <Logo>.png'});
  assert.match(html, /待保存/);
  assert.match(html, /公司 &lt;Logo&gt;\.png/);
  assert.match(html, /取消选择/);
  assert.match(html, /重新选择/);
  assert.doesNotMatch(html, /data-remove=/);
});

test('confirmation saves selected images once and retains per-image failure results', async () => {
  const calls = [], fileA = {name:'card.png'}, fileB = {name:'logo.png'};
  const failure = Object.assign(Error('Storage unavailable'), {status:503});
  const results = await page().submitFiles({card:fileA,logo:fileB},async(kind,file)=>{calls.push([kind,file]);if(kind==='logo')throw failure;return {ref:'saved'};});
  assert.deepEqual(calls,[['card',fileA],['logo',fileB]]);
  assert.deepEqual(results,[{kind:'card',data:{ref:'saved'}},{kind:'logo',error:failure}]);
});

test('confirmation stops further uploads when its private link is no longer valid', async () => {
  const calls = [], error = Object.assign(Error('Expired'),{status:401});
  const results = await page().submitFiles({card:{},logo:{}},async kind=>{calls.push(kind);throw error;});
  assert.deepEqual(calls,['card']);
  assert.equal(results[0].error,error);
});

test('one confirmation covers both images and publication consent', async () => {
  const calls=[];
  const result=await page().submitChanges({files:{logo:{name:'logo.png'}},consents:{portrait:false,logo:true}},async kind=>{calls.push(kind);return {stage:'image'};},async values=>{calls.push(values);return {stage:'consent'};});
  assert.deepEqual(calls,['logo',{portrait:false,logo:true}]);
  assert.equal(result.files[0].data.stage,'image');
  assert.equal(result.consent.data.stage,'consent');
});

test('a single confirmation can save consent without selecting another image', async () => {
  const result=await page().submitChanges({files:{},consents:{portrait:false,logo:false}},()=>{throw Error('Unexpected image upload');},async()=>({saved:true}));
  assert.equal(result.files.length,0);assert.equal(result.consent.data.saved,true);
});

test('partial image failure still allows permission withdrawal and returns accurate results', async () => {
  const error=Object.assign(Error('Invalid image'),{status:400});
  const result=await page().submitChanges({files:{logo:{}},consents:{logo:false,portrait:false}},async()=>{throw error;},async()=>({consents:{logo:false,portrait:false}}));
  assert.equal(result.files[0].error,error);assert.equal(result.consent.data.consents.logo,false);
});

test('the confirmation button follows both the materials and permissions', () => {
  const html=require('../server/materials-page').renderMaterialsPage();
  assert.doesNotMatch(html,/id="saveConsents"/);
  assert.ok(html.indexOf('id="saveMaterials"')>html.indexOf('id="assets"'));
  assert.doesNotMatch(html,/id="consents"|class="sidebar"/);
});


test('publication permissions belong to the corresponding image item',()=>{
  const logo=page().assetMarkup('logo',{status:'missing'},'zh',null,{logo:true});
  const portrait=page().assetMarkup('portrait',{status:'missing'},'zh',null,{portrait:false});
  const card=page().assetMarkup('card',{status:'missing'},'zh');
  assert.match(logo,/data-consent="logo" checked/);assert.doesNotMatch(logo,/data-consent="portrait"/);
  assert.match(portrait,/data-consent="portrait"/);assert.doesNotMatch(card,/data-consent=/);
});
