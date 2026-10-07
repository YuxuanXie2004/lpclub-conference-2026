const { processOrder, json } = require('../server/index.js');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'use POST' });
  try {
    let order = req.body;
    if (order === undefined || typeof order === 'string') order = JSON.parse(order || '{}');
    const result = await processOrder(order || {});
    return json(res, 200, { ok: true, ...result });
  } catch (e) {
    return json(res, e.statusCode || 500, { ok: false, code: e.code || 'REGISTRATION_ERROR', error: e.message || 'Registration failed' });
  }
};
