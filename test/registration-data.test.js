'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {normaliseOrder,toRegistrationRow,fromRegistrationRow}=require('../server/order');
const {PACKAGES}=require('../server/packages');
function input(){return {packageId:'lpclub_member_panel',materials:{portraitConsent:true,language:'zh'},attendee:{fullName:'张三',company:'测试机构',companyType:'LP CLUB Member',jobTitle:'合伙人',email:'zhang@example.com',phone:'13800138000',country:'China',visaLetter:'No',consent:true,focus:['Private Equity'],purpose:['Networking'],arrivalDate:'2026-11-17',whatsappSame:'Yes'}};}
test('MySQL row retains original registration data and server package snapshots',()=>{
 const order=normaliseOrder(input()),row=toRegistrationRow(order);
 assert.equal(row.company_type,'LP CLUB Member');assert.equal(row.option_id,'panel');assert.equal(row.amount,3000);assert.equal(row.language,'zh');
 assert.deepEqual(JSON.parse(row.investment_focus),['Private Equity']);assert.equal(row.arrival_date,'2026-11-17');assert.equal(row.is_deleted,0);
 assert.equal(JSON.parse(row.package_snapshot).price,3000);assert.equal(JSON.parse(row.attendee_snapshot).phone,'13800138000');
 const view=fromRegistrationRow({...row,deleted_at:null});assert.equal(view.total,3000);assert.equal(view.isDeleted,false);assert.equal(view.fullName,'张三');assert.equal(view.focus,'Private Equity');assert.equal(view.packageId,'lpclub_member_panel');
});
test('calendar dates reject normalized invalid dates and non-boolean privacy consent',()=>{
 const a=input();a.attendee.arrivalDate='2026-02-30';assert.throws(()=>normaliseOrder(a),/date/i);
 const b=input();b.attendee.consent='false';assert.throws(()=>normaliseOrder(b),/consent/i);
});
test('organization type is derived from the selected package for every identity and option',()=>{
 for(const p of Object.values(PACKAGES)){
  for(const companyType of [undefined,'','Family Office']){
   const request=input();request.packageId=p.id;request.attendee.companyType=companyType;
   const order=normaliseOrder(request),row=toRegistrationRow(order);
   assert.equal(order.attendee.companyType,p.organisationType,p.id);
   assert.equal(row.company_type,p.organisationType,p.id);
   assert.equal(JSON.parse(row.attendee_snapshot).companyType,p.organisationType,p.id);
  }
 }
});

test('attendance purposes allow approved options and remain optional',()=>{
 for(const purpose of [undefined,null,[],['Market Insights','Investment Opportunities','LP-GP Partnership','Networking']]){
  const request=input();request.attendee.purpose=purpose;
  assert.deepEqual(normaliseOrder(request).attendee.purpose,purpose||[]);
 }
});
test('attendance purposes reject removed, unknown, malformed and excessive options',()=>{
 for(const purpose of [['Fundraising'],['募资'],['Unknown'],['Other','自定义说明'],['Other','Networking','Fundraising'],['Other',{}],['Other',null],['Other',42],'Networking',{},42,Array(6).fill('Networking')]){
  const request=input();Object.assign(request.attendee,{purpose,purposeOther:'有效说明'});
  assert.throws(()=>normaliseOrder(request),e=>e.statusCode===400&&e.code==='INVALID_PURPOSE',JSON.stringify(purpose));
 }
});
test('other purpose requires a separate nonblank string and cannot use another option as its explanation',()=>{
 for(const purpose of [['Other'],['Networking','Other'],['Other','Other']]){
  for(const purposeOther of [undefined,null,'','   ','\t\n','\u3000']){
   const request=input();Object.assign(request.attendee,{purpose,purposeOther});
   assert.throws(()=>normaliseOrder(request),e=>e.statusCode===400&&e.code==='PURPOSE_OTHER_REQUIRED');
  }
 }
 for(const purposeOther of [42,true,{},['说明'],'目'.repeat(81)]){
  const request=input();Object.assign(request.attendee,{purpose:['Other'],purposeOther});
  assert.throws(()=>normaliseOrder(request),e=>e.statusCode===400&&e.code==='INVALID_PURPOSE_OTHER');
 }
});
test('other purpose preserves trimmed text and the 80-character boundary through storage and exports',()=>{
 const {toCsv}=require('../server/sheet');
 for(const text of ['寻找产业合作伙伴 / Partnerships','目'.repeat(80),'Fundraising','Networking']){
  const request=input();Object.assign(request.attendee,{purpose:['Networking','Other'],purposeOther:'  '+text+'  '});
  const order=normaliseOrder(request),row=toRegistrationRow(order),view=fromRegistrationRow(row);
  assert.deepEqual(order.attendee.purpose,['Networking','Other',text]);
  assert.deepEqual(JSON.parse(row.attendance_purpose),['Networking','Other',text]);
  assert.deepEqual(JSON.parse(row.attendee_snapshot).purpose,['Networking','Other',text]);
  assert.equal(view.purpose,'Networking; Other; '+text);
  assert.ok(toCsv([view]).includes(text));
 }
});
test('unselected other explanations are ignored and repeated selections are normalized',()=>{
 const request=input();Object.assign(request.attendee,{purpose:['Networking','Networking'],purposeOther:'残留内容'});
 assert.deepEqual(normaliseOrder(request).attendee.purpose,['Networking']);
});
test('historical purpose records remain readable without new submission validation',()=>{
 const row=toRegistrationRow(normaliseOrder(input()));row.attendance_purpose=JSON.stringify(['Fundraising','Other']);
 assert.equal(fromRegistrationRow(row).purpose,'Fundraising; Other');
});
