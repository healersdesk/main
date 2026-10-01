// GET /api/gcal/callback  ← Google sends the healer back here after they allow access.
const { SITE, CAL_SCOPE, REDIRECT, rest, verify, encrypt, googleToken, gcal, createCalendar } = require('../_lib');

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

    const desk = (await rest(`desks?id=eq.${st.uid}&select=id,practice_name`))[0];
    if (!desk) return back(res, 'failed');

    // Re-use the healer's existing "Healer's Desk" calendar if it is still there.
    const old = (await rest(`calendar_connections?healer_id=eq.${st.uid}&select=calendar_id`))[0];
    let calId = old && old.calendar_id;
    if (calId) { const g = await gcal(tok.access_token, `calendars/${encodeURIComponent(calId)}`); if (g.status !== 200) calId = null; }
    if (!calId) {
      calId = await createCalendar(tok.access_token, st.tz, desk.practice_name);
      await rest(`healings?healer_id=eq.${st.uid}&gcal_event_id=not.is.null`, { method: 'PATCH', body: JSON.stringify({ gcal_event_id: null }) });
    }

    await rest('calendar_connections?on_conflict=healer_id', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ healer_id: st.uid, google_email: email, refresh_token_enc: encrypt(tok.refresh_token),
        calendar_id: calId, timezone: st.tz, connected_at: new Date().toISOString(), last_error: null })
    });
    back(res, 'connected');
  } catch (e) { console.error('gcal callback', e); back(res, 'failed'); }
};
