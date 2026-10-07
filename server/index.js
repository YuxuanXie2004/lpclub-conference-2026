/**
 * LP CLUB GROUP — conference registration backend
 * Feishu Base is the ONLY registration database / source of truth.
 * Deletion is soft-delete only (Is Deleted flag + recycle bin).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sheet = require('./sheet');
const feishu = require('./feishu');
const { PACKAGES } = require('./packages');

(function loadDotEnv() {
  const file = path.join(__dirname, '.env');
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) return;
    const key = m[1];
    const val = m[2].replace(/^['"]|['"]$/g, '').trim();
    if (!process.env[key]) process.env[key] = val;
  });
})();

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 8787);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const SMTP = {
  host: process.env.SMTP_HOST || 'smtp.feishu.cn',
  port: Number(process.env.SMTP_PORT || 465),
  secure: process.env.SMTP_SECURE !== 'false',
  user: process.env.SMTP_USER || 'LPCLUBGROUP@LP-club.cn',
  pass: process.env.SMTP_PASS || ''
};
const ORGANISER = process.env.ORGANISER_EMAIL || 'LPCLUBGROUP@LP-club.cn';
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '';
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 8);
const rateBuckets = new Map();

let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch (_) {}

const PERSONAL_DOMAINS = new Set([
  'gmail.com','googlemail.com','hotmail.com','hotmail.co.uk','outlook.com','live.com','msn.com',
  'yahoo.com','yahoo.co.uk','icloud.com','me.com','mac.com','aol.com','proton.me','protonmail.com',
  'qq.com','163.com','126.com','sina.com','sohu.com','foxmail.com','yeah.net','mail.com','gmx.com',
  'yandex.com','yandex.ru','fastmail.com','tutanota.com','tuta.com','mail.ru','inbox.com','zoho.com'
]);

const SALUTATION = {
  'Mr.': 'Mr. / 先生', 'Ms.': 'Ms. / 女士', 'Dr.': 'Dr. / 博士', 'Prof.': 'Prof. / 教授'
};
const ORG_TYPE = {
  'Limited Partner (LP)': 'Limited Partner (LP) / 有限合伙人（LP）',
  'General Partner (GP)': 'General Partner (GP) / 普通合伙人（GP）',
  'Family Office': 'Family Office / 家族办公室',
  'Government Authority': 'Government Authority / 政府机构',
  'Listed Company': 'Listed Company / 上市公司',
  'Institutional Investor': 'Institutional Investor / 机构投资者',
  'Investment Company': 'Investment Company / 投资公司',
  'Professional Service': 'Professional Service / 专业服务机构',
  'Other': 'Other / 其他'
};
const FOCUS = {
  'Private Equity': 'Private Equity / 私募股权', 'Private Credit': 'Private Credit / 私募信贷',
  'Secondaries': 'Secondaries / 二级市场', 'Co-Investment': 'Co-Investment / 共同投资',
  'AI & Technology': 'AI & Technology / AI与科技', 'Healthcare': 'Healthcare / 医疗健康',
  'Cross-Border Investment': 'Cross-Border Investment / 跨境投资', 'Real Assets': 'Real Assets / 不动产',
  'Other': 'Other / 其他'
};
const PURPOSE = {
  'Market Insights': 'Market Insights / 了解市场趋势',
  'Investment Opportunities': 'Investment Opportunities / 寻找投资机会',
  'Fundraising': 'Fundraising / 募资',
  'LP-GP Partnership': 'LP-GP Partnership / 拓展LP-GP合作',
  'Networking': 'Networking / 行业交流社交', 'Other': 'Other / 其他'
};
const YES_NO = { Yes: 'Yes / 是', No: 'No / 否' };
const CONSENT = 'I have read and agree / 我已阅读并同意';

function pick(map, raw) { return raw ? (Object.prototype.hasOwnProperty.call(map, raw) ? map[raw] : String(raw)) : ''; }
function pickMany(map, raw) {
  const list = Array.isArray(raw) ? raw : (raw ? String(raw).split('|') : []);
  return list.map(v => pick(map, v)).filter(Boolean);
}

function toFields(order) {
  const a = order.attendee || {};
  const mobile = [a.dial, a.phone].filter(Boolean).join(' ').trim();
  const wa = a.whatsappSame === 'Yes' ? mobile : (a.whatsappNumber || '');
  const p = order.package || {};
  return {
    'Registration Reference / 报名编号': order.ref || '',
    'Status / 状态': order.status || 'Received',
    'Submitted At / 提交时间': new Date(order.createdAt || Date.now()).toISOString(),
    'Salutation / 称谓': pick(SALUTATION, a.salutation),
    'Full Name / 姓名': a.fullName || '',
    'Company / Organization / 公司机构': a.company || '',
    'Organization Type / 机构类型': pick(ORG_TYPE, a.companyType),
    'Department / 部门': a.department || '',
    'Job Title / 职位': a.jobTitle || '',
    'Country / Region / 国家地区': a.country || '',
    'City / 城市': a.city || '',
    'Business Email / 企业邮箱': a.email || '',
    'Mobile Number / 手机号码': mobile,
    'Same as WhatsApp or WeChat / 是否同号': pick(YES_NO, a.whatsappSame),
    'WhatsApp or WeChat Number / WhatsApp或微信号码': wa,
    'Investment Focus / 投资方向': pickMany(FOCUS, a.focus).join('; '),
    'Purpose of Attendance / 参会目的': pickMany(PURPOSE, a.purpose).join('; '),
    'LP & GP 1-on-1 Matchmaking / 一对一洽谈': pick(YES_NO, a.matchmaking),
    'Visa Invitation Letter / 签证邀请函': pick(YES_NO, a.visaLetter),
    'Expected Arrival Date / 预计抵达日期': a.arrivalDate || '',
    'Accompanying Guests / 同行人数': Number(a.guests) || 0,
    'Privacy Consent / 隐私授权': a.consent ? CONSENT : '',
    'Package ID / 套餐ID': p.id || '',
    'Attendee Category / 报名身份': p.name || '',
    'Ticket / 票种': p.ticketName || '',
    'Currency / 币种': order.currency || 'USD',
    'Amount / 金额': Number(order.total ?? p.price ?? 0),
    'Display Price / 显示价格': p.displayPrice || (p.price === 0 ? 'Complimentary / By invitation' : `USD ${Number(p.price || 0).toLocaleString('en-US')}`),
    'Pricing Basis / 计价说明': order.pricingBasis || p.name || '',
    'Source / 来源': order.source || 'conference.lp-club.cn',
    'Email Status / 邮件状态': SMTP.pass ? 'Pending' : 'Not configured',
    'Email Sent At / 邮件发送时间': '',
    'Status Updated At / 状态更新时间': '',
    'Status Note / 状态备注': '',
    'Is Deleted / 已删除': false,
    'Deleted At / 删除时间': '',
    'Deleted By / 删除人': '',
    'Deletion Reason / 删除原因': ''
  };
}

function fromFeishuRecord(record) {
  const f = record && record.fields ? record.fields : {};
  return {
    recordId: record && record.record_id || '',
    ref: f['Registration Reference / 报名编号'] || '',
    status: f['Status / 状态'] || 'Received',
    createdAt: f['Submitted At / 提交时间'] || '',
    salutation: f['Salutation / 称谓'] || '',
    fullName: f['Full Name / 姓名'] || '',
    company: f['Company / Organization / 公司机构'] || '',
    companyType: f['Organization Type / 机构类型'] || '',
    department: f['Department / 部门'] || '',
    jobTitle: f['Job Title / 职位'] || '',
    country: f['Country / Region / 国家地区'] || '',
    city: f['City / 城市'] || '',
    email: f['Business Email / 企业邮箱'] || '',
    mobile: f['Mobile Number / 手机号码'] || '',
    whatsappSame: f['Same as WhatsApp or WeChat / 是否同号'] || '',
    whatsappNumber: f['WhatsApp or WeChat Number / WhatsApp或微信号码'] || '',
    focus: f['Investment Focus / 投资方向'] || '',
    purpose: f['Purpose of Attendance / 参会目的'] || '',
    matchmaking: f['LP & GP 1-on-1 Matchmaking / 一对一洽谈'] || '',
    visaLetter: f['Visa Invitation Letter / 签证邀请函'] || '',
    arrivalDate: f['Expected Arrival Date / 预计抵达日期'] || '',
    guests: f['Accompanying Guests / 同行人数'] ?? '',
    consent: f['Privacy Consent / 隐私授权'] || '',
    items: f['Ticket / 票种'] || f['Attendee Category / 报名身份'] || '',
    packageId: f['Package ID / 套餐ID'] || '',
    currency: f['Currency / 币种'] || 'USD',
    total: f['Amount / 金额'] ?? '',
    pricingBasis: f['Pricing Basis / 计价说明'] || '',
    source: f['Source / 来源'] || '',
    emailStatus: f['Email Status / 邮件状态'] || '',
    emailSentAt: f['Email Sent At / 邮件发送时间'] || '',
    statusUpdatedAt: f['Status Updated At / 状态更新时间'] || '',
    statusNote: f['Status Note / 状态备注'] || '',
    isDeleted: feishu.deletedValue(record),
    deletedAt: f['Deleted At / 删除时间'] || '',
    deletedBy: f['Deleted By / 删除人'] || '',
    deletionReason: f['Deletion Reason / 删除原因'] || ''
  };
}

function esc(v) { return String(v || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
function attendeeEmail(order) {
  const a = order.attendee || {};
  const p = order.package || {};
  const amount = p.price === 0 ? 'Complimentary / By invitation' : `USD ${Number(p.price).toLocaleString('en-US')}`;
  const subject = `Registration received | The 3rd International Private Equity Conference 2026 | ${order.ref}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f7f4;font-family:Arial,Helvetica,sans-serif;color:#183026">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7f4;padding:30px 12px"><tr><td align="center">
  <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #dce7df">
  <tr><td style="background:#173f2b;padding:30px 34px;color:#fff"><div style="font-size:22px;font-weight:700;letter-spacing:.04em">LP CLUB GROUP</div><div style="margin-top:8px;color:#b9d3c2;font-size:12px;letter-spacing:.08em;text-transform:uppercase">The 3rd International Private Equity Conference 2026</div></td></tr>
  <tr><td style="padding:34px"><h1 style="font-size:24px;margin:0 0 16px;color:#173f2b">Registration received</h1><p style="line-height:1.7;margin:0 0 18px">Dear ${esc(a.fullName || 'Guest')},</p><p style="line-height:1.7;margin:0 0 22px">Thank you for registering. We have successfully received your details. Our team will review your registration and contact you within 2–3 business days with the next steps.</p>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef5ef;border-radius:12px;padding:18px"><tr><td style="line-height:1.9;font-size:14px"><b>Registration reference:</b> ${esc(order.ref)}<br><b>Attendee:</b> ${esc(a.fullName)}<br><b>Company:</b> ${esc(a.company)}<br><b>Category:</b> ${esc(p.name)}<br><b>Package:</b> ${esc(p.ticketName)}<br><b>Registration fee:</b> ${esc(amount)}</td></tr></table>
  <h2 style="font-size:16px;margin:26px 0 8px;color:#173f2b">Event details</h2><p style="line-height:1.8;margin:0">Wednesday, 18 November 2026<br>Hong Kong Convention and Exhibition Centre<br>Hong Kong, China</p>
  <p style="line-height:1.7;margin:26px 0 0">We look forward to welcoming you in Hong Kong.</p><p style="line-height:1.7;margin:16px 0 0"><b>LP CLUB GROUP</b><br>LPCLUBGROUP@LP-club.cn · www.lp-club.cn</p></td></tr>
  </table></td></tr></table></body></html>`;
  const text = `Dear ${a.fullName || 'Guest'},\n\nThank you for registering for The 3rd International Private Equity Conference 2026.\n\nRegistration reference: ${order.ref}\nAttendee: ${a.fullName || ''}\nCompany: ${a.company || ''}\nCategory: ${p.name || ''}\nPackage: ${p.ticketName || ''}\nRegistration fee: ${amount}\n\nWednesday, 18 November 2026\nHong Kong Convention and Exhibition Centre, Hong Kong, China\n\nOur team will review your registration and contact you within 2–3 business days with the next steps.\n\nLP CLUB GROUP`;
  return { from: `LP CLUB GROUP <${SMTP.user}>`, to: a.email, cc: ORGANISER, subject, html, text };
}

async function sendMail(order) {
  if (!nodemailer) return { skipped: true, reason: 'nodemailer not installed' };
  if (!SMTP.pass) return { skipped: true, reason: 'SMTP_PASS not set' };
  const transport = nodemailer.createTransport({ host: SMTP.host, port: SMTP.port, secure: SMTP.secure, auth: { user: SMTP.user, pass: SMTP.pass } });
  const info = await transport.sendMail(attendeeEmail(order));
  return { sent: true, id: info.messageId };
}

function isBusinessEmail(email) {
  const v = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return false;
  const domain = v.split('@').pop();
  return !PERSONAL_DOMAINS.has(domain);
}
function cleanString(v, max = 300) { return String(v == null ? '' : v).trim().slice(0, max); }
function clientIp(req) {
  if (TRUST_PROXY) { const x = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim(); if (x) return x; }
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown';
}
function rateAllowed(ip) {
  const now = Date.now(); const b = rateBuckets.get(ip);
  if (!b || now - b.start >= RATE_LIMIT_WINDOW_MS) { rateBuckets.set(ip, { start: now, count: 1 }); return true; }
  b.count += 1; return b.count <= RATE_LIMIT_MAX;
}
function validPhone(v) { const s = String(v || '').replace(/[\s().-]/g, ''); return /^\+?\d{6,18}$/.test(s); }
function validDate(v) { if (!v) return true; const d = Date.parse(v + (String(v).length === 10 ? 'T00:00:00Z' : '')); return !Number.isNaN(d); }
function requiredFields(a) {
  const req = ['fullName','company','companyType','country','jobTitle','email','phone','matchmaking','visaLetter'];
  return req.filter(k => !cleanString(a[k]));
}

function normaliseOrder(input) {
  const a = input && input.attendee ? input.attendee : {};
  const packageId = cleanString(input && input.packageId, 50);
  const p = PACKAGES[packageId];
  if (!p) throw Object.assign(new Error('Please select a valid registration category.'), { statusCode: 400 });
  const missing = requiredFields(a);
  if (missing.length) throw Object.assign(new Error('Please complete all required fields: ' + missing.join(', ')), { statusCode: 400 });
  if (!isBusinessEmail(a.email)) throw Object.assign(new Error('Please use your business email address. Personal email addresses are not accepted.'), { statusCode: 400, code: 'BUSINESS_EMAIL_REQUIRED' });
  if (!validPhone([a.dial, a.phone].filter(Boolean).join(''))) throw Object.assign(new Error('Please enter a valid mobile number.'), { statusCode: 400, code: 'INVALID_PHONE' });
  if (!validDate(a.arrivalDate)) throw Object.assign(new Error('Please enter a valid expected arrival date.'), { statusCode: 400, code: 'INVALID_DATE' });
  if (!a.consent) throw Object.assign(new Error('Privacy consent is required.'), { statusCode: 400, code: 'CONSENT_REQUIRED' });
  const ref = `LPC26-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  return {
    ref,
    createdAt: new Date().toISOString(),
    source: 'conference.lp-club.cn',
    status: 'Received',
    currency: 'USD',
    package: { id: p.id, name: p.name, ticketName: p.ticketName, price: p.price, displayPrice: p.displayPrice },
    items: [{ name: p.ticketName, qty: 1, lineTotal: p.price }],
    subtotal: p.price,
    total: p.price,
    pricingBasis: p.name,
    attendee: {
      salutation: cleanString(a.salutation, 20), fullName: cleanString(a.fullName, 120), company: cleanString(a.company, 180),
      companyType: cleanString(a.companyType, 120), department: cleanString(a.department, 120), jobTitle: cleanString(a.jobTitle, 120),
      country: cleanString(a.country, 100), city: cleanString(a.city, 100), dial: cleanString(a.dial, 10), phone: cleanString(a.phone, 40),
      whatsappSame: cleanString(a.whatsappSame, 10), whatsappNumber: cleanString(a.whatsappNumber, 60), email: cleanString(a.email, 180).toLowerCase(),
      focus: Array.isArray(a.focus) ? a.focus.map(x => cleanString(x, 80)).slice(0, 12) : [],
      purpose: Array.isArray(a.purpose) ? a.purpose.map(x => cleanString(x, 80)).slice(0, 12) : [],
      matchmaking: cleanString(a.matchmaking, 10), visaLetter: cleanString(a.visaLetter, 10), arrivalDate: cleanString(a.arrivalDate, 20),
      guests: a.guests === '' || a.guests == null ? '' : Math.max(0, Math.min(20, Number(a.guests) || 0)), consent: Boolean(a.consent)
    }
  };
}

async function processOrder(input) {
  feishu.assertConfigured();
  const order = normaliseOrder(input);
  const duplicate = await feishu.findActiveRecordByEmail(order.attendee.email);
  if (duplicate) {
    const fields = duplicate.fields || {};
    const status = fields['Status / 状态'] || 'Received';
    if (status !== 'Rejected' && status !== 'Cancelled') {
      const ref = fields['Registration Reference / 报名编号'] || '';
      const err = new Error(`A registration already exists for this business email${ref ? ` (${ref})` : ''}. Please contact LP CLUB if you need to update it.`);
      throw Object.assign(err, { statusCode: 409, code: 'DUPLICATE_REGISTRATION', ref });
    }
  }

  let record;
  try {
    record = await feishu.createRecord(toFields(order));
  } catch (e) {
    const err = new Error('Registration could not be saved to the registration database. Please try again shortly.');
    throw Object.assign(err, { statusCode: 503, code: 'DATABASE_UNAVAILABLE', cause: e.message });
  }

  const result = {
    ref: order.ref,
    package: order.package,
    saved: true,
    feishu: { recordId: record && record.record_id || '' },
    email: { skipped: true, reason: 'SMTP not configured' }
  };

  if (nodemailer && SMTP.pass) {
    try {
      result.email = await sendMail(order);
      if (record && record.record_id) {
        await feishu.updateRecord(record.record_id, {
          'Email Status / 邮件状态': 'Sent',
          'Email Sent At / 邮件发送时间': new Date().toISOString()
        });
      }
    } catch (e) {
      result.email = { error: e.message };
      if (record && record.record_id) {
        try { await feishu.updateRecord(record.record_id, { 'Email Status / 邮件状态': 'Failed' }); } catch (_) {}
      }
    }
  }
  return result;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 1e6) { reject(new Error('payload too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch (_) { reject(new Error('invalid json')); } });
    req.on('error', reject);
  });
}
function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
}
function json(res, code, payload) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token', 'Access-Control-Allow-Methods': 'POST,GET,OPTIONS' };
  if (ALLOW_ORIGIN) headers['Access-Control-Allow-Origin'] = ALLOW_ORIGIN;
  if (typeof res.setHeader === 'function') { Object.entries(headers).forEach(([k,v]) => res.setHeader(k,v)); setSecurityHeaders(res); }
  if (typeof res.status === 'function' && typeof res.json === 'function') return res.status(code).json(payload);
  res.writeHead(code); res.end(JSON.stringify(payload));
}
function mime(file) {
  const e = path.extname(file).toLowerCase();
  return ({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'}[e] || 'application/octet-stream');
}
function serveFile(res, file) {
  const abs = path.resolve(file);
  if (!abs.startsWith(ROOT + path.sep) && abs !== path.join(ROOT, 'index.html')) return false;
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return false;
  setSecurityHeaders(res);
  res.writeHead(200, { 'Content-Type': mime(abs), 'Cache-Control': abs.endsWith('.html') ? 'no-cache' : 'public, max-age=86400' });
  fs.createReadStream(abs).pipe(res); return true;
}

function secureEquals(a, b) {
  const aa = Buffer.from(String(a || '')), bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && aa.length > 0 && crypto.timingSafeEqual(aa, bb);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  const token = url.searchParams.get('token') || String(req.headers['x-admin-token'] || '');
  const allowed = () => Boolean(ADMIN_TOKEN) && secureEquals(token, ADMIN_TOKEN);

  if (req.method === 'GET' && pathname === '/health') {
    let feishuOk = false;
    try { feishu.assertConfigured(); feishuOk = true; } catch (_) {}
    return json(res, 200, { ok: true, service: 'lpclub-conference', database: feishuOk ? 'feishu' : 'not-configured', feishu: feishuOk, email: Boolean(nodemailer && SMTP.pass), admin: Boolean(ADMIN_TOKEN), packagesReady: !Object.values(PACKAGES).some(p => p.needsVerification) });
  }
  if (req.method === 'GET' && pathname === '/api/packages') return json(res, 200, { ok: true, packages: Object.values(PACKAGES) });

  if (req.method === 'GET' && pathname === '/table') {
    if (!allowed()) return json(res, 401, { ok: false, error: 'unauthorised' });
    setSecurityHeaders(res);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(sheet.renderTablePage(ADMIN_TOKEN));
  }

  if (req.method === 'GET' && pathname === '/api/registrations') {
    if (!allowed()) return json(res, 401, { ok: false, error: 'unauthorised' });
    try {
      const mode = url.searchParams.get('mode') === 'deleted' ? 'deleted' : 'active';
      const records = mode === 'deleted' ? await feishu.listDeletedRecords() : await feishu.listActiveRecords();
      const rows = records.map(fromFeishuRecord).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return json(res, 200, { ok: true, source: 'feishu', mode, columns: sheet.COLUMNS, rows });
    } catch (e) {
      return json(res, 503, { ok: false, error: e.message || 'Failed to read Feishu registration database' });
    }
  }

  if (req.method === 'GET' && pathname === '/export.csv') {
    if (!allowed()) return json(res, 401, { ok: false, error: 'unauthorised' });
    try {
      const mode = url.searchParams.get('mode') === 'deleted' ? 'deleted' : 'active';
      const records = mode === 'deleted' ? await feishu.listDeletedRecords() : await feishu.listActiveRecords();
      const rows = records.map(fromFeishuRecord);
      setSecurityHeaders(res);
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="lpclub-registrations-${mode}.csv"`, 'Cache-Control': 'no-store' });
      return res.end(sheet.toCsv(rows));
    } catch (e) {
      return json(res, 503, { ok: false, error: e.message || 'Export failed' });
    }
  }

  if (req.method === 'POST' && pathname === '/api/admin/status') {
    if (!allowed()) return json(res, 401, { ok: false, error: 'unauthorised' });
    try {
      const body = await readBody(req);
      const ref = cleanString(body.ref, 40);
      const status = cleanString(body.status, 30);
      const note = cleanString(body.note, 500);
      if (!sheet.STATUSES.includes(status)) throw new Error('Invalid status');
      const record = await feishu.findRecordByReference(ref, false);
      if (!record) throw new Error('Active registration not found');
      const updatedAt = new Date().toISOString();
      await feishu.updateRecord(record.record_id, {
        'Status / 状态': status,
        'Status Updated At / 状态更新时间': updatedAt,
        'Status Note / 状态备注': note
      });
      return json(res, 200, { ok: true, event: { ref, status, note, updatedAt }, source: 'feishu' });
    } catch (e) { return json(res, 400, { ok: false, error: e.message || 'status update failed' }); }
  }

  if (req.method === 'POST' && pathname === '/api/admin/delete') {
    if (!allowed()) return json(res, 401, { ok: false, error: 'unauthorised' });
    try {
      const body = await readBody(req);
      const ref = cleanString(body.ref, 40);
      const reason = cleanString(body.reason, 500);
      const actor = cleanString(body.actor, 120) || 'LP CLUB admin';
      const record = await feishu.findRecordByReference(ref, false);
      if (!record) throw new Error('Active registration not found');
      await feishu.softDelete(record.record_id, actor, reason);
      return json(res, 200, { ok: true, ref, deleted: true, source: 'feishu' });
    } catch (e) { return json(res, 400, { ok: false, error: e.message || 'delete failed' }); }
  }

  if (req.method === 'POST' && pathname === '/api/admin/restore') {
    if (!allowed()) return json(res, 401, { ok: false, error: 'unauthorised' });
    try {
      const body = await readBody(req);
      const ref = cleanString(body.ref, 40);
      const record = await feishu.findRecordByReference(ref, true);
      if (!record || !feishu.deletedValue(record)) throw new Error('Deleted registration not found');
      await feishu.restore(record.record_id);
      return json(res, 200, { ok: true, ref, deleted: false, restored: true, source: 'feishu' });
    } catch (e) { return json(res, 400, { ok: false, error: e.message || 'restore failed' }); }
  }

  if (req.method === 'POST' && pathname === '/api/order') {
    try {
      const ip = clientIp(req);
      if (!rateAllowed(ip)) return json(res, 429, { ok: false, code: 'RATE_LIMITED', error: 'Too many registration attempts. Please try again later.' });
      const order = await readBody(req);
      const result = await processOrder(order);
      return json(res, 200, { ok: true, ...result });
    } catch (e) {
      return json(res, e.statusCode || 500, { ok: false, code: e.code || 'REGISTRATION_ERROR', error: e.message || 'Registration failed', ref: e.ref || undefined });
    }
  }

  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) return serveFile(res, path.join(ROOT, 'index.html')) || json(res, 404, { ok: false });
  if (req.method === 'GET' && pathname.startsWith('/images/')) return serveFile(res, path.join(ROOT, pathname)) || json(res, 404, { ok: false });
  return json(res, 404, { ok: false, error: 'not found' });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`LP CLUB conference → http://localhost:${PORT}`);
    console.log(`health             → http://localhost:${PORT}/health`);
    console.log(`admin table        → ${ADMIN_TOKEN ? `http://localhost:${PORT}/table?token=${ADMIN_TOKEN}` : 'disabled (set ADMIN_TOKEN)'}`);
    console.log(`database           → Feishu Base only`);
    console.log(`email              → ${SMTP.pass ? 'configured' : 'off'}`);
  });
}

module.exports = { toFields, fromFeishuRecord, processOrder, json, sheet, feishu, isBusinessEmail, normaliseOrder, PACKAGES, validPhone, rateAllowed };
