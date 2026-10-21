'use strict';
const crypto=require('node:crypto');
const {PACKAGES,IDENTITIES}=require('./packages');
const PERSONAL_DOMAINS = new Set([
  'gmail.com','googlemail.com','hotmail.com','hotmail.co.uk','outlook.com','live.com','msn.com',
  'yahoo.com','yahoo.co.uk','icloud.com','me.com','mac.com','aol.com','proton.me','protonmail.com',
  'qq.com','163.com','126.com','sina.com','sohu.com','foxmail.com','yeah.net','mail.com','gmx.com',
  'yandex.com','yandex.ru','fastmail.com','tutanota.com','tuta.com','mail.ru','inbox.com','zoho.com'
]);

function isBusinessEmail(email) {
  const v = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return false;
  const domain = v.split('@').pop();
  return !PERSONAL_DOMAINS.has(domain);
}
function cleanString(v, max = 300) { return String(v == null ? '' : v).trim().slice(0, max); }
function validPhone(v) { const s = String(v || '').replace(/[\s().-]/g, ''); return /^\+?\d{6,18}$/.test(s); }
function validDate(v) { if (!v) return true; return /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v+'T00:00:00Z')) && new Date(v+'T00:00:00Z').toISOString().slice(0,10) === v; }
function requiredFields(a) {
  const req = ['fullName','company','country','jobTitle','email','phone','visaLetter'];
  return req.filter(k => !cleanString(a[k]));
}

function registrationPackage(input, packageCatalogue = PACKAGES) {
  const requestedId = cleanString(input && input.packageId, 50);
  const packageId = Object.prototype.hasOwnProperty.call(IDENTITIES, requestedId) ? requestedId + '_ticket' : requestedId;
  const p = Object.prototype.hasOwnProperty.call(packageCatalogue, packageId) ? packageCatalogue[packageId] : null;
  if (!p) throw Object.assign(new Error('Please select a valid registration category.'), { statusCode: 400 });
  return p;
}

function normaliseOrder(input, packageCatalogue = PACKAGES) {
  const a = input && input.attendee ? input.attendee : {};
  const basePackage = registrationPackage(input, packageCatalogue);
  const p = { ...basePackage, vipApplied: false };
  const missing = requiredFields(a);
  if (missing.length) throw Object.assign(new Error('Please complete all required fields: ' + missing.join(', ')), { statusCode: 400 });
  if (!isBusinessEmail(a.email)) throw Object.assign(new Error('Please use your business email address. Personal email addresses are not accepted.'), { statusCode: 400, code: 'BUSINESS_EMAIL_REQUIRED' });
  if (!validPhone([a.dial, a.phone].filter(Boolean).join(''))) throw Object.assign(new Error('Please enter a valid mobile number.'), { statusCode: 400, code: 'INVALID_PHONE' });
  if (!validDate(a.arrivalDate)) throw Object.assign(new Error('Please enter a valid expected arrival date.'), { statusCode: 400, code: 'INVALID_DATE' });
  if (a.consent !== true) throw Object.assign(new Error('Privacy consent is required.'), { statusCode: 400, code: 'CONSENT_REQUIRED' });
  const ref = `LPC26-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  return {
    ref,
    createdAt: new Date().toISOString(),
    source: 'conference.lp-club.cn',
    status: 'Received',
    currency: 'USD',
    package: { id: p.id, identityId: p.identityId, identityName: p.identityName, optionId: p.optionId, organisationType: p.organisationType, name: p.name, ticketName: p.ticketName, price: p.price, displayPrice: p.displayPrice, vipApplied: p.vipApplied },
    items: [{ name: p.ticketName, qty: 1, lineTotal: p.price }],
    subtotal: p.price,
    total: p.price,
    pricingBasis: p.name,
    materialPreferences: {
      portraitConsent: input.materials?.portraitConsent === true,
      logoConsent: input.materials?.logoConsent === true,
      language: input.materials?.language === 'zh' ? 'zh' : 'en'
    },
    attendee: {
      salutation: cleanString(a.salutation, 20), fullName: cleanString(a.fullName, 120), company: cleanString(a.company, 180),
      companyType: cleanString(p.organisationType, 120), department: cleanString(a.department, 120), jobTitle: cleanString(a.jobTitle, 120),
      country: cleanString(a.country, 100), city: cleanString(a.city, 100), dial: cleanString(a.dial, 10), phone: cleanString(a.phone, 40),
      whatsappSame: cleanString(a.whatsappSame, 10), whatsappNumber: cleanString(a.whatsappNumber, 60), email: cleanString(a.email, 180).toLowerCase(),
      focus: Array.isArray(a.focus) ? a.focus.map(x => cleanString(x, 80)).slice(0, 12) : [],
      purpose: Array.isArray(a.purpose) ? a.purpose.map(x => cleanString(x, 80)).slice(0, 12) : [],
      matchmaking: p.optionId === 'matchmaking' ? 'Yes' : 'No', visaLetter: cleanString(a.visaLetter, 10), arrivalDate: cleanString(a.arrivalDate, 20),
      guests: a.guests === '' || a.guests == null ? '' : Math.max(0, Math.min(20, Number(a.guests) || 0)), consent: Boolean(a.consent)
    }
  };
}

function toRegistrationRow(order) {
  const a=order.attendee,p=order.package,mobile=[a.dial,a.phone].filter(Boolean).join(' ').trim();
  return {
    id:order.id||crypto.randomUUID(),event_key:'conference-2026',ref:order.ref,status:order.status||'Received',submitted_at:new Date(order.createdAt),
    salutation:a.salutation,full_name:a.fullName,company:a.company,company_type:a.companyType,department:a.department,job_title:a.jobTitle,country:a.country,city:a.city,email:a.email,
    mobile,whatsapp_same:a.whatsappSame,whatsapp_number:a.whatsappSame==='Yes'?mobile:a.whatsappNumber,
    investment_focus:JSON.stringify(a.focus),attendance_purpose:JSON.stringify(a.purpose),matchmaking:a.matchmaking,visa_letter:a.visaLetter,arrival_date:a.arrivalDate||null,guests:Number(a.guests)||0,privacy_consent:a.consent?1:0,
    package_id:p.id,option_id:p.optionId,attendee_category:p.name,ticket_name:p.ticketName,currency:order.currency,amount:order.total,display_price:p.displayPrice,pricing_basis:order.pricingBasis,source:order.source,
    email_status:'Not configured',is_deleted:0,language:order.materialPreferences?.language||'en',attendee_snapshot:JSON.stringify(a),package_snapshot:JSON.stringify(p)
  };
}
function parseJSON(value,fallback={}) { if(value==null)return fallback;return typeof value==='string'?JSON.parse(value):value; }
function iso(value){if(!value)return '';return value instanceof Date?value.toISOString():/^\d{4}-\d{2}-\d{2} /.test(value)?value.replace(' ','T')+'Z':String(value);}
function fromRegistrationRow(r) {
  const fields={recordId:'id',ref:'ref',status:'status',createdAt:'submitted_at',salutation:'salutation',fullName:'full_name',company:'company',companyType:'company_type',department:'department',jobTitle:'job_title',country:'country',city:'city',email:'email',mobile:'mobile',whatsappSame:'whatsapp_same',whatsappNumber:'whatsapp_number',matchmaking:'matchmaking',visaLetter:'visa_letter',arrivalDate:'arrival_date',guests:'guests',consent:'privacy_consent',items:'ticket_name',packageId:'package_id',currency:'currency',pricingBasis:'pricing_basis',displayPrice:'display_price',source:'source',emailStatus:'email_status',emailSentAt:'email_sent_at',statusUpdatedAt:'status_updated_at',statusNote:'status_note',deletedAt:'deleted_at',deletedBy:'deleted_by',deletionReason:'deletion_reason',language:'language',owner:'owner',rowVersion:'row_version'};
  const out=Object.fromEntries(Object.entries(fields).map(([key,column])=>[key,r[column]??'']));
  for(const key of ['createdAt','emailSentAt','statusUpdatedAt','deletedAt'])out[key]=iso(out[key]);
  out.isDeleted=Boolean(r.is_deleted||r.deleted_at);out.total=Number(r.amount);out.focus=parseJSON(r.investment_focus,[]).join('; ');out.purpose=parseJSON(r.attendance_purpose,[]).join('; ');
  return out;
}
module.exports={normaliseOrder,registrationPackage,toRegistrationRow,fromRegistrationRow,parseJSON,iso,isBusinessEmail,validPhone,validDate,cleanString,PACKAGES};
