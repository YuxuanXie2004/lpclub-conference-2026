'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const templateFile = path.join(root, 'server', 'email-templates', 'registration-confirmation.html');
const serverFile = path.join(root, 'server', 'index.js');

let html = fs.readFileSync(templateFile, 'utf8');

// Keep the user's Stripo design intact. Apply only the exact latest template changes.
html = html.replace('<table cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-spacing:0px;width:520px">', '<table role="presentation" cellpadding="0" cellspacing="0" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-spacing:0px;width:520px">');
html = html.replace('<table width="100%" cellpadding="0" cellspacing="0" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-spacing:0px">', '<table cellpadding="0" cellspacing="0" width="100%" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-spacing:0px">');
html = html.replace(/width:353px/g, 'width:317px').replace(/width:187px/g, 'width:223px');

// Dynamic fields only; visual structure remains unchanged.
html = html.replace(/Dear Jolin/g, 'Dear {{fullName}}');
html = html.replace(/LPC26-TEST1234/g, '{{registrationRef}}');
html = html.replace(/USD\s*3500/g, '{{paidAmount}}');
html = html.replace(/Speaking Package/g, '{{ticketName}}');
html = html.replace(/Futhur billing information will be sent through email\s+[^<]+/g, 'Further billing information will be sent through email {{businessEmail}}');
html = html.replace(/registeration info/g, 'registration info');
html = html.replace(/Registration Infro:/g, 'Registration Info:');

fs.writeFileSync(templateFile, html);

let src = fs.readFileSync(serverFile, 'utf8');
const start = src.indexOf('function attendeeEmail(order) {');
const end = src.indexOf('\nasync function sendMail(order)', start);
if (start === -1 || end === -1) throw new Error('Could not find attendeeEmail()');

const replacement = `function attendeeEmail(order) {
  const a = order.attendee || {};
  const p = order.package || {};
  const currency = order.currency || 'USD';
  const rawAmount = Number(order.total ?? p.price ?? 0);
  const paidAmount = Number.isInteger(rawAmount)
    ? \`\${currency} \${rawAmount.toLocaleString('en-US')}\`
    : \`\${currency} \${rawAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\`;

  const templatePath = path.join(__dirname, 'email-templates', 'registration-confirmation.html');
  if (!fs.existsSync(templatePath)) throw new Error('Email template not found: ' + templatePath);

  let html = fs.readFileSync(templatePath, 'utf8');
  const vars = {
    fullName: a.fullName || 'Guest',
    registrationRef: order.ref || '',
    paidAmount,
    ticketName: p.ticketName || '',
    businessEmail: a.email || ''
  };
  for (const [key, value] of Object.entries(vars)) {
    html = html.split(\`{{\${key}}}\`).join(esc(value));
  }

  const subject = \`Registration received | The 3rd International Private Equity Conference 2026 | \${order.ref}\`;
  const text = \`Dear \${a.fullName || 'Guest'},\n\nThank you for registering for The 3rd International Private Equity Conference 2026.\n\nRegistration reference: \${order.ref || ''}\nFee: \${paidAmount}\nPackage: \${p.ticketName || ''}\n\nFurther billing information will be sent through email \${a.email || ''}.\n\nIf you need to update your registration information or have any questions regarding the conference, please contact LPCLUBGROUP@LP-club.cn.\n\nLP CLUB GROUP\`;

  return { from: \`LP CLUB GROUP <\${SMTP.user}>\`, to: a.email, cc: ORGANISER, subject, html, text };
}
`;

src = src.slice(0, start) + replacement + src.slice(end);
fs.writeFileSync(serverFile, src);

console.log('✓ Latest Stripo email template applied');
console.log('- visual design preserved');
console.log('- billing email is dynamic');
console.log('- fee uses order.total');
console.log('- registration info remains Reference / Fee / Package only');
