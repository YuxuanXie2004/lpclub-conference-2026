'use strict';
const crypto = require('node:crypto');

function invalidCode() {
  return Object.assign(new Error('Invalid VIP Code. Please check your code and try again.'), { statusCode: 400, code: 'INVALID_VIP_CODE' });
}

function applyVip(packageInfo, rawCode, configuredCodes = '') {
  if (typeof rawCode !== 'string' || !rawCode.trim() || rawCode.trim().length > 128) throw invalidCode();
  const code = rawCode.trim().toUpperCase();
  const digest = crypto.createHash('sha256').update(code).digest();
  const codes = String(configuredCodes || '').split(',').map(v => v.trim().toUpperCase()).filter(v => v && v.length <= 128);
  const valid = codes.some(v => crypto.timingSafeEqual(digest, crypto.createHash('sha256').update(v).digest()));
  if (!valid) throw invalidCode();
  if (packageInfo.optionId !== 'ticket') throw Object.assign(new Error('VIP Code applies to delegate passes only. Please select a Delegate Pass.'), { statusCode: 400, code: 'VIP_TICKET_ONLY' });
  return { ...packageInfo, originalPrice: packageInfo.price, price: 0, displayPrice: 'Complimentary / VIP Code', vipApplied: true };
}

module.exports = { applyVip };
