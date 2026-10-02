// POST /api/gcal/link  { refresh_token, tz }
// Called right after "Sign in with Google": if the healer allowed calendar access on
// Google's screen, this connects their "Healer's Desk" calendar automatically.
const { CAL_SCOPE, getUser, googleToken, linkCalendar, send, readBody } = require('../_lib');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'Use POST' });
    const user = await getUser(req);
    if (!user) return send(res, 401, { error: 'Please sign in again.' });
    const body = await readBody(req);
    const rt = typeof body.refresh_token === 'string' ? body.refresh_token.trim() : '';
    if (rt.length < 20 || rt.length > 512) return send(res, 400, { linked: false, reason: 'notoken' });
    const tz = typeof body.tz === 'string' && /^[A-Za-z_+\-/0-9]{2,64}$/.test(body.tz) ? body.tz : 'Asia/Kolkata';
    let tok;
    try { tok = await googleToken({ grant_type: 'refresh_token', refresh_token: rt }); }
    catch (e) { console.warn('link refresh failed', e.message); return send(res, 200, { linked: false, reason: 'badtoken' }); }
    if (!String(tok.scope || '').split(' ').includes(CAL_SCOPE)) return send(res, 200, { linked: false, reason: 'noscope' });
    const out = await linkCalendar({ uid: user.id, refreshToken: rt, accessToken: tok.access_token, tz, email: user.email });
    send(res, 200, out);
  } catch (e) { console.error('gcal link', e); send(res, 500, { error: e.message }); }
};
