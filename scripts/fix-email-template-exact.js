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

// Keep the user's Stripo design intact. Only change dynamic content placeholders
// and remove rows that were added by our previous integration.
let html = fs.readFileSync(templateFile, 'utf8');

// Remove the extra Company and Status rows previously inserted into Registration Info.
html = html.replace(/\s*<tr>\s*<td[^>]*>\s*<p[^>]*>\s*<strong[^>]*>Company:<\/strong><\/p>[\s\S]*?<\/tr>/i, '');
html = html.replace(/\s*<tr>\s*<td[^>]*>\s*<p[^>]*>\s*<strong[^>]*>Status:<\/strong><\/p>[\s\S]*?<\/tr>/i, '');

// Fee must come from the current registration/order amount, not a hard-coded display price.
html = html.replace(/{{displayPrice}}/g, '{{paidAmount}}');
html = html.replace(/USD\s*3500/g, '{{paidAmount}}');

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
    ? \`\${currency} \${rawAmount.toLocaleString('en-US')}\`
    : \`\${currency} \${rawAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\`;

  const templatePath = path.join(__dirname, 'email-templates', 'registration-confirmation.html');
  if (!fs.existsSync(templatePath)) {
    throw new Error('Email template not found: ' + templatePath);
  }

  let html = fs.readFileSync(templatePath, 'utf8');
  const vars = {
    fullName: a.fullName || 'Guest',
    registrationRef: order.ref || '',
    paidAmount,
    ticketName: p.ticketName || ''
  };

  for (const [key, value] of Object.entries(vars)) {
    html = html.split(\`{{\${key}}}\`).join(esc(value));
  }

  const subject = \`Registration received | The 3rd International Private Equity Conference 2026 | \${order.ref}\`;
  const text = \`Dear \${a.fullName || 'Guest'},\n\nThank you for registering for The 3rd International Private Equity Conference 2026.\n\nRegistration reference: \${order.ref || ''}\nFee: \${paidAmount}\nPackage: \${p.ticketName || ''}\n\nIf you need to update your registration information or have any questions, please contact LPCLUBGROUP@LP-club.cn.\n\nLP CLUB GROUP\`;

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

console.log('✓ Registration email corrected');
console.log('- Stripo HTML design preserved');
console.log('- Status removed from Registration Info');
console.log('- Extra Company row removed');
console.log('- Fee now uses order.total / selected registration amount');
console.log('- Dynamic fields: fullName, registrationRef, paidAmount, ticketName');
