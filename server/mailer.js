'use strict';
const fs = require('node:fs');
const path = require('node:path');
function createMailer(env=process.env){
const SMTP = {
  host: env.SMTP_HOST || 'smtp.feishu.cn',
  port: Number(env.SMTP_PORT || 465),
  secure: env.SMTP_SECURE !== 'false',
  user: env.SMTP_USER || 'LPCLUBGROUP@LP-club.cn',
  pass: env.SMTP_PASS || ''
};
const ORGANISER = env.ORGANISER_EMAIL || 'LPCLUBGROUP@LP-club.cn';
const LOGO_CID = 'lpclub-logo@lp-club.cn';
const MATERIALS_TITLE = 'Complete your conference materials';
const MATERIALS_DESCRIPTION = 'Use your private link to submit or update your business card, portrait and company logo, and manage publication consent. The link expires in 30 days; please do not forward it. Your business card stays private. Portraits and logos appear on the conference website only with your permission and after approval.';
const EVENT_TEXT = 'Wednesday, 18 November 2026\nHong Kong Convention and Exhibition Centre\nHong Kong, China';
function esc(v) { return String(v || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
function materialsSection(url) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:26px;background:#eef5ef;border-radius:12px"><tr><td style="padding:22px">
  <h2 style="font-size:17px;margin:0 0 12px;color:#173f2b">${MATERIALS_TITLE}</h2><p style="font-size:14px;line-height:1.8;margin:0 0 18px">${MATERIALS_DESCRIPTION}</p>
  <table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#205f40" style="border-radius:6px"><a href="${esc(url)}" style="display:inline-block;padding:13px 20px;border:1px solid #205f40;border-radius:6px;font-size:14px;line-height:1.5;font-weight:700;color:#fff;text-decoration:none">Complete your materials</a></td></tr></table>
  <p style="font-size:12px;line-height:1.7;margin:18px 0 0;color:#53695c">If the button does not work, copy and paste this link into your browser:<br><a href="${esc(url)}" style="color:#205f40;word-break:break-all;overflow-wrap:anywhere">${esc(url)}</a></p>
  </td></tr></table>`;
}
function composeMessage({ to, cc, subject, title, fullName, content, text }) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f4f7f4;font-family:Arial,Helvetica,sans-serif;color:#183026">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7f4;padding:30px 12px"><tr><td align="center">
  <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;table-layout:fixed;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #dce7df">
  <tr><td bgcolor="#eef5ef" style="padding:30px 34px;background:#eef5ef;border-bottom:1px solid #dce7df"><img src="cid:${LOGO_CID}" alt="LP CLUB" width="160" height="55" style="display:block;width:160px;height:auto;border:0"><div style="margin-top:24px;color:#53695c;font-size:11px;line-height:1.6;letter-spacing:.1em;text-transform:uppercase">The 3rd International</div><div style="margin-top:5px;color:#173f2b;font-size:21px;line-height:1.4;font-weight:700">Private Equity Conference 2026</div></td></tr>
  <tr><td style="padding:30px 34px;overflow-wrap:anywhere"><h1 style="font-size:24px;line-height:1.3;margin:0 0 16px;color:#173f2b">${esc(title)}</h1><p style="line-height:1.7;margin:0 0 18px">Dear ${esc(fullName || 'Guest')},</p>${content}
  <h2 style="font-size:16px;margin:26px 0 8px;color:#173f2b">Event details</h2><p style="line-height:1.8;margin:0">Wednesday, 18 November 2026<br>Hong Kong Convention and Exhibition Centre<br>Hong Kong, China</p>
  <p style="line-height:1.7;margin:26px 0 0">We look forward to welcoming you in Hong Kong.</p><p style="line-height:1.7;margin:16px 0 0"><b>LP CLUB GROUP</b><br><a href="mailto:LPCLUBGROUP@LP-club.cn" style="color:#205f40">LPCLUBGROUP@LP-club.cn</a><br><a href="https://www.lp-club.cn" style="color:#205f40">www.lp-club.cn</a></p></td></tr>
  </table></td></tr></table></body></html>`;
  return {
    from: `LP CLUB GROUP <${SMTP.user}>`, to, ...(cc ? { cc } : {}), subject, html,
    text: `Dear ${fullName || 'Guest'},\n\n${text}\n\nEvent details\n${EVENT_TEXT}\n\nWe look forward to welcoming you in Hong Kong.\n\nLP CLUB GROUP\nLPCLUBGROUP@LP-club.cn\nwww.lp-club.cn`,
    attachments: [{ filename: 'lpclub-logo.png', content: fs.readFileSync(path.join(__dirname, '../images/lpclub-logo.png')).toString('base64'), encoding: 'base64', contentType: 'image/png', contentDisposition: 'inline', cid: LOGO_CID }]
  };
}
function composeRegistration(order, link) {
  const a = order.attendee || {};
  const p = order.package || {};
  const amount = p.displayPrice || (p.price === 0 ? 'Complimentary / By invitation' : `USD ${Number(p.price).toLocaleString('en-US')}`);
  const content = `<p style="line-height:1.7;margin:0 0 22px">Thank you for registering. We have successfully received your details. Our team will review your registration and contact you within 2–3 business days with the next steps.</p>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef5ef;border-radius:12px"><tr><td style="padding:18px;line-height:1.9;font-size:14px"><b>Registration reference:</b> ${esc(order.ref)}<br><b>Attendee:</b> ${esc(a.fullName)}<br><b>Company:</b> ${esc(a.company)}<br><b>Category:</b> ${esc(p.name)}<br><b>Package:</b> ${esc(p.ticketName)}<br><b>Registration fee:</b> ${esc(amount)}<br><b>Pricing basis:</b> ${esc(order.pricingBasis)}</td></tr></table>${link ? materialsSection(link) : ''}`;
  const text = `Thank you for registering for The 3rd International Private Equity Conference 2026.\n\nRegistration reference: ${order.ref}\nAttendee: ${a.fullName || ''}\nCompany: ${a.company || ''}\nCategory: ${p.name || ''}\nPackage: ${p.ticketName || ''}\nRegistration fee: ${amount}\nPricing basis: ${order.pricingBasis}\n\nOur team will review your registration and contact you within 2–3 business days with the next steps.${link ? `\n\n${MATERIALS_TITLE}\n${MATERIALS_DESCRIPTION}\n${link}` : ''}`;
  return composeMessage({ to: a.email, cc: ORGANISER, subject: `Registration received | The 3rd International Private Equity Conference 2026 | ${order.ref}`, title: 'Registration received', fullName: a.fullName, content, text });
}
function composeSupplement({ to, fullName, url, ref }) {
  const content = `<p style="line-height:1.7;margin:0 0 22px">Your private conference materials link is ready. You can use it to submit or update your materials and manage your publication consent.</p>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef5ef;border-radius:12px"><tr><td style="padding:18px;line-height:1.9;font-size:14px"><b>Registration reference:</b> ${esc(ref)}</td></tr></table>${materialsSection(url)}`;
  return composeMessage({ to, subject: `${MATERIALS_TITLE} | ${ref}`, title: MATERIALS_TITLE, fullName, content, text: `Your private conference materials link is ready.\n\nRegistration reference: ${ref}\n\n${MATERIALS_TITLE}\n${MATERIALS_DESCRIPTION}\n${url}` });
}

  async function send(payload) {
    if(!SMTP.pass)throw Object.assign(new Error('SMTP not configured'),{code:'SMTP_NOT_CONFIGURED'});
    const transport=require('nodemailer').createTransport({host:SMTP.host,port:SMTP.port,secure:SMTP.secure,auth:{user:SMTP.user,pass:SMTP.pass},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:45000});
    let timer;
    try {
      const result=await Promise.race([transport.sendMail(payload),new Promise((_,reject)=>{timer=setTimeout(()=>{transport.close();reject(Object.assign(new Error('SMTP deadline exceeded'),{code:'SMTP_TIMEOUT'}));},60000);})]);
      const primary=String(typeof payload.to==='object'?payload.to.address:payload.to).trim().toLowerCase();
      if(!result.accepted?.some(address=>String(typeof address==='object'?address.address:address).trim().toLowerCase()===primary))throw Object.assign(new Error('SMTP did not accept recipient'),{code:'SMTP_REJECTED'});
      return {sent:true,id:result.messageId};
    }finally{clearTimeout(timer);transport.close();}
  }
  return {composeRegistration,composeSupplement,send};
}
module.exports={createMailer};
