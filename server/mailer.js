'use strict';
function createMailer(env=process.env){
const SMTP = {
  host: env.SMTP_HOST || 'smtp.feishu.cn',
  port: Number(env.SMTP_PORT || 465),
  secure: env.SMTP_SECURE !== 'false',
  user: env.SMTP_USER || 'LPCLUBGROUP@LP-club.cn',
  pass: env.SMTP_PASS || ''
};
const ORGANISER = env.ORGANISER_EMAIL || 'LPCLUBGROUP@LP-club.cn';
function esc(v) { return String(v || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
function composeRegistration(order, link) {
  const a = order.attendee || {};
  const p = order.package || {};
  const amount = p.displayPrice || (p.price === 0 ? 'Complimentary / By invitation' : `USD ${Number(p.price).toLocaleString('en-US')}`);
  const subject = `Registration received | The 3rd International Private Equity Conference 2026 | ${order.ref}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f7f4;font-family:Arial,Helvetica,sans-serif;color:#183026">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7f4;padding:30px 12px"><tr><td align="center">
  <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #dce7df">
  <tr><td style="background:#173f2b;padding:30px 34px;color:#fff"><div style="font-size:22px;font-weight:700;letter-spacing:.04em">LP CLUB GROUP</div><div style="margin-top:8px;color:#b9d3c2;font-size:12px;letter-spacing:.08em;text-transform:uppercase">The 3rd International Private Equity Conference 2026</div></td></tr>
  <tr><td style="padding:34px"><h1 style="font-size:24px;margin:0 0 16px;color:#173f2b">Registration received</h1><p style="line-height:1.7;margin:0 0 18px">Dear ${esc(a.fullName || 'Guest')},</p><p style="line-height:1.7;margin:0 0 22px">Thank you for registering. We have successfully received your details. Our team will review your registration and contact you within 2–3 business days with the next steps.</p>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef5ef;border-radius:12px;padding:18px"><tr><td style="line-height:1.9;font-size:14px"><b>Registration reference:</b> ${esc(order.ref)}<br><b>Attendee:</b> ${esc(a.fullName)}<br><b>Company:</b> ${esc(a.company)}<br><b>Category:</b> ${esc(p.name)}<br><b>Package:</b> ${esc(p.ticketName)}<br><b>Registration fee:</b> ${esc(amount)}<br><b>Pricing basis:</b> ${esc(order.pricingBasis)}</td></tr></table>
  <h2 style="font-size:16px;margin:26px 0 8px;color:#173f2b">Event details</h2><p style="line-height:1.8;margin:0">Wednesday, 18 November 2026<br>Hong Kong Convention and Exhibition Centre<br>Hong Kong, China</p>
  <p style="line-height:1.7;margin:26px 0 0">We look forward to welcoming you in Hong Kong.</p><p style="line-height:1.7;margin:16px 0 0"><b>LP CLUB GROUP</b><br>LPCLUBGROUP@LP-club.cn · www.lp-club.cn</p></td></tr>
  </table></td></tr></table></body></html>`;
  const text = `Dear ${a.fullName || 'Guest'},\n\nThank you for registering for The 3rd International Private Equity Conference 2026.\n\nRegistration reference: ${order.ref}\nAttendee: ${a.fullName || ''}\nCompany: ${a.company || ''}\nCategory: ${p.name || ''}\nPackage: ${p.ticketName || ''}\nRegistration fee: ${amount}\nPricing basis: ${order.pricingBasis}\n\nWednesday, 18 November 2026\nHong Kong Convention and Exhibition Centre, Hong Kong, China\n\nOur team will review your registration and contact you within 2–3 business days with the next steps.\n\nLP CLUB GROUP`;
  const chinese = order.materialPreferences?.language === 'zh';
  const title = chinese ? '补充大会资料' : 'Complete your conference materials';
  const description = chinese ? '您可以通过以下专属链接补交或更新名片、商务照片及公司 Logo，并管理展示授权。链接有效期为 30 天，请勿转发。名片仅用于内部核验，照片及 Logo 仅在您授权并审核通过后于本次大会官网展示。' : 'Use your private link to submit or update your business card, portrait and company logo, and manage publication consent. The link expires in 30 days; please do not forward it. Your business card stays private. Portraits and logos appear on the conference website only with your permission and after approval.';
  const extra = link ? `<div style="padding:20px 34px;background:#eef5ef"><h2 style="font-size:17px">${title}</h2><p style="line-height:1.8">${description}</p><a href="${esc(link)}" style="color:#205f40">${title}</a></div>` : '';
  let body = html; if (chinese) body = body.replace('Registration received</h1>','已收到您的报名</h1>').replace('Dear '+esc(a.fullName || 'Guest')+',','尊敬的 '+esc(a.fullName || 'Guest')+'：').replace('Thank you for registering. We have successfully received your details. Our team will review your registration and contact you within 2–3 business days with the next steps.','感谢报名，我们已收到您的资料。工作人员将在 2–3 个工作日内审核并联系您。').replace('We look forward to welcoming you in Hong Kong.','期待与您相聚香港。');
  return { from: `LP CLUB GROUP <${SMTP.user}>`, to: a.email, cc: ORGANISER, subject:chinese?'报名已收到 | '+order.ref:subject, html: body.replace('</body>', extra + '</body>'), text: text + (link ? `\n\n${title}\n${description}\n${link}` : '') };
}

function composeSupplement({ to, fullName, language, url, ref }) {
  const zh = language === 'zh';
  const title = zh ? '补充大会资料' : 'Complete your conference materials';
  const description = zh ? '请通过以下专属链接补交或更新资料，并管理展示授权。链接有效期为 30 天，请勿转发。名片仅用于内部核验；照片及 Logo 在您授权并审核通过后于本次大会官网展示。' : 'Submit or update your materials and manage publication consent using this private link. It expires in 30 days; please do not forward it. Business cards remain private; portraits and logos appear on the conference website with your permission and after approval.';
  return { from: `LP CLUB GROUP <${SMTP.user}>`, to, subject: `${title} | ${ref}`, text: `${fullName || ''}\n\n${description}\n${url}\n\nLP CLUB GROUP`, html: `<div style="font:15px/1.8 Arial;color:#183026"><h2>${title}</h2><p>${esc(fullName)}</p><p>${description}</p><a href="${esc(url)}">${title}</a><p>${esc(ref)}</p></div>` };
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
