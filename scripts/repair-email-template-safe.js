'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const templateFile = path.join(root, 'server', 'email-templates', 'registration-confirmation.html');
const serverFile = path.join(root, 'server', 'index.js');

// 1) Restore the tracked full Stripo template first. This undoes any accidental
// structural deletion caused by earlier broad regex replacements.
execFileSync('git', ['restore', '--source=HEAD', '--', 'server/email-templates/registration-confirmation.html'], {
  cwd: root,
  stdio: 'inherit'
});

let html = fs.readFileSync(templateFile, 'utf8');

// 2) Remove ONLY the exact two rows that we previously added ourselves.
const companyRow = `
                         <tr>
                           <td align="left" class="es-m-text" style="Margin:0;padding:10px 35px"><p class="es-text-mobile-size-18" style="Margin:0;mso-line-height-rule:exactly;font-family:lato, 'helvetica neue', helvetica, arial, sans-serif;line-height:27px;letter-spacing:0;font-weight:normal;color:#333333;font-size:18px"><strong style="font-weight:bolder !important">Company:</strong></p><p class="es-text-mobile-size-18" style="Margin:0;mso-line-height-rule:exactly;font-family:lato, 'helvetica neue', helvetica, arial, sans-serif;line-height:27px;letter-spacing:0;font-weight:normal;color:#333333;font-size:18px"><strong style="font-weight:bolder !important">{{company}}</strong></p></td>
                         </tr>`;
const statusRow = `
                         <tr>
                           <td align="left" class="es-m-text" style="Margin:0;padding:10px 35px 20px"><p class="es-text-mobile-size-18" style="Margin:0;mso-line-height-rule:exactly;font-family:lato, 'helvetica neue', helvetica, arial, sans-serif;line-height:27px;letter-spacing:0;font-weight:normal;color:#333333;font-size:18px"><strong style="font-weight:bolder !important">Status:</strong></p><p class="es-text-mobile-size-18" style="Margin:0;mso-line-height-rule:exactly;font-family:lato, 'helvetica neue', helvetica, arial, sans-serif;line-height:27px;letter-spacing:0;font-weight:normal;color:#333333;font-size:18px"><strong style="font-weight:bolder !important">{{status}}</strong></p></td>
                         </tr>`;
html = html.split(companyRow).join('');
html = html.split(statusRow).join('');

// 3) Dynamic values only. Do not alter layout/CSS/tables.
html = html.replace(/{{displayPrice}}/g, '{{paidAmount}}');
html = html.replace(/USD\s*3500/g, '{{paidAmount}}');
html = html.replace(/LPC26-TEST1234/g, '{{registrationRef}}');
html = html.replace(/Dear Jolin/g, 'Dear {{fullName}}');
html = html.replace(/Speaking Package/g, '{{ticketName}}');
html = html.replace(/registeration info/g, 'registration info');
html = html.replace(/Registration Infro:/g, 'Registration Info:');

// Insert the latest billing line only if it is not already present.
if (!html.includes('{{businessEmail}}')) {
  const contactStart = '<strong style="font-weight:bolder !important">If you need to update your registration information or have any questions regarding the conference, please contact us at:';
  html = html.replace(contactStart,
    '<strong style="font-weight:bolder !important">Further billing information will be sent through email {{businessEmail}}</strong></h6><p style="Margin:0;mso-line-height-rule:exactly;font-family:lato, \'helvetica neue\', helvetica, arial, sans-serif;line-height:21px;letter-spacing:0;font-weight:normal;color:#333333;font-size:14px"><br></p><h6 style="Margin:0;font-family:lato, \'helvetica neue\', helvetica, arial, sans-serif;mso-line-height-rule:exactly;letter-spacing:0;font-size:16px;font-style:normal;font-weight:normal;line-height:19px;color:#333333"><strong style="font-weight:bolder !important">If you need to update your registration information or have any questions regarding the conference, please contact us at:');
}

fs.writeFileSync(templateFile, html);

// 4) Keep backend replacement logic narrow and predictable.
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
  const text = \`Dear \${a.fullName || 'Guest'},\n\nThank you for registering for The 3rd International Private Equity Conference 2026.\n\nRegistration reference: \${order.ref || ''}\nFee: \${paidAmount}\nPackage: \${p.ticketName || ''}\n\nFurther billing information will be sent through email \${a.email || ''}.\n\nIf you need to update your registration information or have any questions regarding the conference, please contact LPCLUBGROUP@LP-club.cn.\n\nLP CLUB GROUP\`;

  return { from: \`LP CLUB GROUP <\${SMTP.user}>\`, to: a.email, cc: ORGANISER, subject, html, text };
}
`;

src = src.slice(0, start) + replacement + src.slice(end);
fs.writeFileSync(serverFile, src);

console.log('✓ Email template safely repaired');
console.log('- full Stripo structure restored from Git');
console.log('- only exact Company/Status rows removed');
console.log('- dynamic fields: fullName, registrationRef, paidAmount, ticketName, businessEmail');
console.log('- no broad HTML regex deletion used');
