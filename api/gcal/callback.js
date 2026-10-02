// GET /api/gcal/callback  ← Google sends the healer back here after they allow access.
const { SITE, CAL_SCOPE, REDIRECT, verify, googleToken, linkCalendar } = require('../_lib');

const back = (res, code) => { res.statusCode = 302; res.setHeader('Location', `${SITE()}/desk?gcal=${code}`); res.setHeader('Cache-Control', 'no-store'); res.end(); };

module.exports = async (req, res) => {
  try {
    const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    if (q.error) return back(res, 'cancelled');
    const st = verify(q.state);
    if (!st || !q.code) return back(res, 'expired');

    const tok = await googleToken({ grant_type: 'authorization_code', code: q.code, redirect_uri: REDIRECT() });
    if (!String(tok.scope || '').split(' ').includes(CAL_SCOPE)) return back(res, 'noscope');
    if (!tok.refresh_token) return back(res, 'failed');
    let email = null;
    if (tok.id_token) { try { email = JSON.parse(Buffer.from(tok.id_token.split('.')[1], 'base64url').toString()).email || null; } catch {} }

    const out = await linkCalendar({ uid: st.uid, refreshToken: tok.refresh_token, accessToken: tok.access_token, tz: st.tz, email });
    if (!out.linked) return back(res, 'failed');
    back(res, 'connected');
  } catch (e) { console.error('gcal callback', e); back(res, 'failed'); }
};
