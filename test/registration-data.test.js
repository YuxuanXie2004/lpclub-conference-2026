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
