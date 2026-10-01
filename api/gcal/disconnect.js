// POST /api/gcal/disconnect  { removeCalendar: true|false }
const { rest, getUser, accessTokenFor, decrypt, gcal, send, readBody } = require('../_lib');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'Use POST' });
    const user = await getUser(req);
    if (!user) return send(res, 401, { error: 'Please sign in again.' });
    const body = await readBody(req);
    const conn = (await rest(`calendar_connections?healer_id=eq.${user.id}&select=*`))[0];
    if (conn) {
      try {
        if (body.removeCalendar && conn.calendar_id) {
          const token = await accessTokenFor(conn);
          await gcal(token, `calendars/${encodeURIComponent(conn.calendar_id)}`, { method: 'DELETE' });
        }
      } catch (e) { console.warn('remove calendar', e.message); }
      try { await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decrypt(conn.refresh_token_enc))}`, { method: 'POST' }); } catch {}
      await rest(`calendar_connections?healer_id=eq.${user.id}`, { method: 'DELETE' });
      await rest(`healings?healer_id=eq.${user.id}&gcal_event_id=not.is.null`, { method: 'PATCH', body: JSON.stringify({ gcal_event_id: null }) });
    }
    send(res, 200, { ok: true });
  } catch (e) { console.error('gcal disconnect', e); send(res, 500, { error: e.message }); }
};
