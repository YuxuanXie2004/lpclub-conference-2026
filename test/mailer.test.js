'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const nodemailer = require('nodemailer');
const { createMailer } = require('../server/mailer');
const { encryptPayload, decryptPayload } = require('../server/mail-outbox');

const url = 'https://example.com/conference/materials#ref=LPC26-12345678&token=private';
const order = {
  ref: 'LPC26-12345678', attendee: { fullName: 'Jane Example', company: 'Example Capital', email: 'jane@example.com' },
  package: { name: 'General Partner (GP)', ticketName: 'Panel / Roundtable Package', price: 3000, displayPrice: 'USD 3,000' },
  pricingBasis: 'General Partner (GP)'
};
const mailer = createMailer({ SMTP_USER: 'sender@example.com', ORGANISER_EMAIL: 'organiser@example.com' });

test('registration templates stay English for every stored language preference', () => {
  for (const language of ['zh', 'en', undefined]) {
    const mail = mailer.composeRegistration({ ...order, materialPreferences: { language } }, url);
    assert.equal(mail.subject, 'Registration received | The 3rd International Private Equity Conference 2026 | '+order.ref);
    assert.doesNotMatch(mail.subject + mail.html + mail.text, /[\u3400-\u9fff]/u);
    assert.match(mail.html, /Registration received/);
    assert.match(mail.text, /Complete your conference materials/);
    assert.ok(mail.text.includes(url));
    assert.equal(mail.to, order.attendee.email);
    assert.equal(mail.cc, 'organiser@example.com');
  }
});

test('supplement templates use the same branded layout and stay English', () => {
  for (const language of ['zh', 'en', undefined]) {
    const mail = mailer.composeSupplement({ to: order.attendee.email, fullName: 'Jane Example', language, url, ref: order.ref });
    assert.equal(mail.subject, 'Complete your conference materials | '+order.ref);
    assert.doesNotMatch(mail.subject + mail.html + mail.text, /[\u3400-\u9fff]/u);
    assert.match(mail.html, /max-width:640px/);
    assert.match(mail.html, /bgcolor="#eef5ef"/);
    assert.match(mail.html, /Event details/);
    assert.match(mail.html, /Complete your materials/);
    assert.match(mail.html, /30 days/);
    assert.ok(mail.text.includes(url));
    assert.equal(mail.cc, undefined);
  }
});

test('all mail types use the hosted logo through encrypted queue and MIME serialization', async () => {
  const key = crypto.randomBytes(32).toString('base64');
  const logoUrl = 'https://lp-club.tos-cn-beijing.volces.com/logo.png';
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  for (const mail of [mailer.composeRegistration(order, url), mailer.composeRegistration(order), mailer.composeSupplement({ to: order.attendee.email, fullName: 'Jane Example', url, ref: order.ref })]) {
    assert.ok(mail.html.includes('src="'+logoUrl+'"'));
    assert.doesNotMatch(mail.html, /src="cid:/);
    assert.equal(mail.attachments, undefined);
    const restored = decryptPayload(encryptPayload(mail, key), key);
    assert.deepEqual(restored, mail);
    const message = (await transport.sendMail({ ...restored, textEncoding: 'base64' })).message.toString();
    const htmlPart = message.match(/Content-Type: text\/html[^]*?Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+)/);
    assert.ok(htmlPart);
    assert.ok(Buffer.from(htmlPart[1], 'base64').toString().includes('src="'+logoUrl+'"'));
    assert.doesNotMatch(message, /Content-ID:|Content-Type: image\/png|Content-Type: multipart\/related/);
  }
  const template = fs.readFileSync(require.resolve('../server/email-templates/registration-confirmation.html'), 'utf8');
  assert.ok(template.includes('src="'+logoUrl+'"'));
});

test('registration without materials keeps branding and omits the materials call to action', () => {
  const mail = mailer.composeRegistration(order);
  assert.ok(mail.html.includes('src="https://lp-club.tos-cn-beijing.volces.com/logo.png"'));
  assert.doesNotMatch(mail.html + mail.text, /Complete your materials|30 days|undefined/);
});

test('English templates preserve and escape attendee data rather than translating it', () => {
  const name = '张三 <script>';
  const registration = mailer.composeRegistration({ ...order, attendee: { ...order.attendee, fullName: name, company: '示例公司 & Partners' } }, url);
  const supplement = mailer.composeSupplement({ to: order.attendee.email, fullName: name, url, ref: '<ref>' });
  for (const mail of [registration, supplement]) {
    assert.match(mail.html, /张三 &lt;script&gt;/);
    assert.doesNotMatch(mail.html, /张三 <script>/);
    assert.match(mail.text, /张三 <script>/);
  }
  assert.match(registration.html, /示例公司 &amp; Partners/);
  assert.match(supplement.html, /&lt;ref&gt;/);
});
