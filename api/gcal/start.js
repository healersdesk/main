// POST /api/gcal/start  → returns the Google permission page URL for this healer.
const crypto = require('crypto');
const { env, SCOPES, REDIRECT, getUser, sign, send, readBody } = require('../_lib');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'Use POST' });
    const user = await getUser(req);
    if (!user) return send(res, 401, { error: 'Please sign in again.' });
    const body = await readBody(req);
    const tz = typeof body.tz === 'string' && /^[A-Za-z_+\-/0-9]{2,64}$/.test(body.tz) ? body.tz : 'Asia/Kolkata';
    const state = sign({ uid: user.id, tz, exp: Date.now() + 15 * 60 * 1000, n: crypto.randomBytes(8).toString('hex') });
    const p = new URLSearchParams({
      client_id: env('GOOGLE_CLIENT_ID'), redirect_uri: REDIRECT(), response_type: 'code', scope: SCOPES,
      access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state, login_hint: user.email || ''
    });
    send(res, 200, { url: `https://accounts.google.com/o/oauth2/v2/auth?${p}` });
  } catch (e) { console.error(e); send(res, 500, { error: e.message }); }
};
