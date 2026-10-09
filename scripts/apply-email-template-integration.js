'use strict';

const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', 'server', 'index.js');
let src = fs.readFileSync(file, 'utf8');

const start = src.indexOf('function attendeeEmail(order) {');
const end = src.indexOf('\nasync function sendMail(order)', start);

if (start === -1 || end === -1) {
  console.error('Could not find attendeeEmail() in server/index.js');
  process.exit(1);
}

const replacement = `function attendeeEmail(order) {
  const a = order.attendee || {};
  const p = order.package || {};
  const displayPrice = p.displayPrice || (p.price === 0
    ? 'Complimentary / By invitation'
    : \`USD \${Number(p.price || 0).toLocaleString('en-US')}\`);

  const templatePath = path.join(__dirname, 'email-templates', 'registration-confirmation.html');
  if (!fs.existsSync(templatePath)) {
    throw new Error('Email template not found: ' + templatePath);
  }

  let html = fs.readFileSync(templatePath, 'utf8');
  const vars = {
    fullName: a.fullName || 'Guest',
    registrationRef: order.ref || '',
    displayPrice,
    ticketName: p.ticketName || '',
    company: a.company || '',
    status: order.status || 'Received'
  };

  for (const [key, value] of Object.entries(vars)) {
    const safe = esc(value);
    html = html.split(\`{{\${key}}}\`).join(safe);
  }

  const subject = \`Registration received | The 3rd International Private Equity Conference 2026 | \${order.ref}\`;
  const text = \`Dear \${a.fullName || 'Guest'},\n\nThank you for registering for The 3rd International Private Equity Conference 2026.\n\nRegistration reference: \${order.ref || ''}\nCompany: \${a.company || ''}\nPackage: \${p.ticketName || ''}\nFee: \${displayPrice}\nStatus: \${order.status || 'Received'}\n\nIf you need to update your registration information or have any questions, please contact LPCLUBGROUP@LP-club.cn.\n\nLP CLUB GROUP\`;

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
fs.writeFileSync(file, src);

console.log('✓ Registration email template integration applied');
console.log('- HTML template: server/email-templates/registration-confirmation.html');
console.log('- Dynamic fields: fullName, registrationRef, displayPrice, ticketName, company, status');
console.log('- Existing SMTP sending flow preserved');
