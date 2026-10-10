'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const templateFile = path.join(root, 'server', 'email-templates', 'registration-confirmation.html');
const serverFile = path.join(root, 'server', 'index.js');

if (!fs.existsSync(templateFile)) {
  console.error('Email template not found:', templateFile);
  process.exit(1);
}

let html = fs.readFileSync(templateFile, 'utf8');

// Keep the existing Stripo design intact. Only fix dynamic content.
html = html.replace(/{{\s*displayPrice\s*}}/g, '{{paidAmount}}');
html = html.replace(/USD\s*3500/g, '{{paidAmount}}');
html = html.replace(/LPC26-TEST1234/g, '{{registrationRef}}');
html = html.replace(/Dear\s+Jolin/g, 'Dear {{fullName}}');
html = html.replace(/Speaking Package/g, '{{ticketName}}');

// Remove any Company and Status rows that may remain from an older template.
html = html.replace(/\s*<tr>\s*<td[^>]*>[\s\S]*?<strong[^>]*>Company:<\/strong>[\s\S]*?<\/td>\s*<\/tr>/gi, '');
html = html.replace(/\s*<tr>\s*<td[^>]*>[\s\S]*?<strong[^>]*>Status:<\/strong>[\s\S]*?<\/td>\s*<\/tr>/gi, '');

// Replace any hard-coded billing email line with the registrant's business email.
html = html.replace(/Futhur billing information will be sent through email\s+[^<]*/gi,
  'Further billing information will be sent through email {{businessEmail}}');
html = html.replace(/Further billing information will be sent through email\s+[^<]*/gi,
  'Further billing information will be sent through email {{businessEmail}}');

fs.writeFileSync(templateFile, html);

let src = fs.readFileSync(serverFile, 'utf8');
const start = src.indexOf('function attendeeEmail(order) {');
const end = src.indexOf('\nasync function sendMail(order)', start);
if (start === -1 || end === -1) {
  console.error('Could not find attendeeEmail() in server/index.js');
  process.exit(1);
}

const replacement = `function attendeeEmail(order) {
  const a = order.attendee || {};
  const p = order.package || {};
  const currency = order.currency || 'USD';
  const rawAmount = Number(order.total ?? p.price ?? 0);
  const paidAmount = Number.isInteger(rawAmount)
    ? \`${'${currency} ${rawAmount.toLocaleString(\'en-US\')}'}\`
    : \`${'${currency} ${rawAmount.toLocaleString(\'en-US\', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}'}\`;

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

  const unresolved = html.match(/{{\s*[A-Za-z0-9_]+\s*}}/g);
  if (unresolved && unresolved.length) {
    throw new Error('Unresolved email template variables: ' + [...new Set(unresolved)].join(', '));
  }

  const subject = \`Registration received | The 3rd International Private Equity Conference 2026 | \${order.ref}\`;
  const text = \`Dear \${a.fullName || 'Guest'},\n\nThank you for registering for The 3rd International Private Equity Conference 2026.\n\nRegistration reference: \${order.ref || ''}\nFee: \${paidAmount}\nPackage: \${p.ticketName || ''}\n\nFurther billing information will be sent through email \${a.email || ''}.\n\nIf you need to update your registration information or have any questions regarding the conference, please contact us at LPCLUBGROUP@LP-club.cn.\n\nLP CLUB GROUP\`;

  return {
    from: \`LP CLUB GROUP <\${SMTP.user}>\`,
    to: a.email,
    cc: ORGANISER,
    subject,
    html,
    text
  };
}
`;

src = src.slice(0, start) + replacement + src.slice(end);
fs.writeFileSync(serverFile, src);

console.log('✓ Live email template fixed');
console.log('- removed Company and Status from Registration Info');
console.log('- Fee now uses paidAmount');
console.log('- billing email uses registrant business email');
console.log('- unresolved placeholders will now stop the send instead of appearing in the email');
