/**
 * Health check for the serverless deployment: GET /api/health
 */

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(200).end(JSON.stringify({
    ok: true,
    feishu: Boolean(process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET),
    email: Boolean(process.env.SMTP_PASS)
  }));
};
