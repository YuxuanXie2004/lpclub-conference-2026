const { validateVip, json, rateAllowed } = require('../server/index');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'use POST' });
  try {
    const ip = req.socket && req.socket.remoteAddress || 'unknown';
    if (!rateAllowed('vip:' + ip)) return json(res, 429, { ok: false, code: 'RATE_LIMITED', error: 'Too many VIP Code attempts. Please try again later.' });
    let input = req.body;
    if (input === undefined || typeof input === 'string') input = JSON.parse(input || '{}');
    return json(res, 200, { ok: true, ...await validateVip(input) });
  } catch (e) {
    return json(res, e.statusCode || 500, { ok: false, code: e.code || 'VIP_ERROR', error: e.message || 'VIP Code could not be checked.' });
  }
};
