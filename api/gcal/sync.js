// POST /api/gcal/sync  { upsert:[healing ids], remove:[event ids], all:true }
// Creates / updates / deletes events in the healer's "Healer's Desk" Google calendar.
const { SITE, rest, getUser, accessTokenFor, gcal, createCalendar, isUuid, pool, send, readBody } = require('../_lib');

function buildEvent(h, conn) {
  const name = (h.patients && h.patients.full_name) || 'Client';
  const tz = conn.timezone || 'Asia/Kolkata';
  const ev = {
    summary: `${h.status === 'Complete' ? '✓ ' : ''}Healing · ${name}`,
    description: [h.notes || '', `Open in My Healing Desk: ${SITE()}/desk#p/${h.patient_id}`].filter(Boolean).join('\n\n'),
    status: 'confirmed',
    extendedProperties: { private: { hd_healing: h.id } },
    reminders: conn.reminder_min > 0 ? { useDefault: false, overrides: [{ method: 'popup', minutes: conn.reminder_min }] } : { useDefault: false, overrides: [] }
  };
  const [y, m, d] = h.healing_date.split('-').map(Number);
  if (h.healing_time) {
    const [hh, mm] = h.healing_time.split(':').map(Number);
    const s = Date.UTC(y, m - 1, d, hh, mm), e = s + (conn.duration_min || 30) * 60000;
    const f = (t) => new Date(t).toISOString().slice(0, 19);
    ev.start = { dateTime: f(s), timeZone: tz }; ev.end = { dateTime: f(e), timeZone: tz };
  } else {
    ev.start = { date: h.healing_date }; ev.end = { date: new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10) };
  }
  return ev;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'Use POST' });
    const user = await getUser(req);
    if (!user) return send(res, 401, { error: 'Please sign in again.' });
    const conn = (await rest(`calendar_connections?healer_id=eq.${user.id}&select=*`))[0];
    if (!conn) return send(res, 200, { connected: false, events: {}, synced: 0 });

    let token;
    try { token = await accessTokenFor(conn); }
    catch (e) {
      if (e.reconnect) { await rest(`calendar_connections?healer_id=eq.${user.id}`, { method: 'PATCH', body: JSON.stringify({ last_error: 'reconnect' }) }); return send(res, 409, { error: 'Google Calendar needs to be reconnected.', reconnect: true }); }
      throw e;
    }

    const body = await readBody(req);
    const upsert = Array.isArray(body.upsert) ? body.upsert.filter(isUuid).slice(0, 300) : [];
    const remove = Array.isArray(body.remove) ? body.remove.filter((s) => typeof s === 'string' && /^[a-zA-Z0-9_-]{5,1024}$/.test(s)).slice(0, 300) : [];
    const sel = 'select=id,patient_id,healing_date,healing_time,status,notes,gcal_event_id,patients(full_name)';
    let rows = [];
    if (body.all) {
      const from = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      rows = await rest(`healings?healer_id=eq.${user.id}&healing_date=gte.${from}&${sel}&order=healing_date&limit=500`);
    } else if (upsert.length) {
      rows = await rest(`healings?healer_id=eq.${user.id}&id=in.(${upsert.join(',')})&${sel}`);
    }

    const ctx = { calId: conn.calendar_id, recreate: null };
    const base = () => `calendars/${encodeURIComponent(ctx.calId)}/events`;
    const recreate = () => (ctx.recreate ||= (async () => {
      const desk = (await rest(`desks?id=eq.${user.id}&select=practice_name`))[0] || {};
      ctx.calId = await createCalendar(token, conn.timezone, desk.practice_name);
      await rest(`calendar_connections?healer_id=eq.${user.id}`, { method: 'PATCH', body: JSON.stringify({ calendar_id: ctx.calId }) });
    })());

    const events = {}; let synced = 0, errors = 0;
    async function one(h) {
      if (h.status === 'Cancelled') {
        if (h.gcal_event_id) await gcal(token, `${base()}/${encodeURIComponent(h.gcal_event_id)}`, { method: 'DELETE' });
        return null;
      }
      const ev = buildEvent(h, conn);
      if (h.gcal_event_id) {
        const r = await gcal(token, `${base()}/${encodeURIComponent(h.gcal_event_id)}`, { method: 'PUT', body: ev });
        if (r.status === 200) return r.data.id;
        if (![404, 410].includes(r.status)) throw new Error((r.data && r.data.error && r.data.error.message) || `Calendar error ${r.status}`);
      }
      let r = await gcal(token, base(), { method: 'POST', body: ev });
      if (r.status === 404) { await recreate(); r = await gcal(token, base(), { method: 'POST', body: ev }); }
      if (r.status >= 300) throw new Error((r.data && r.data.error && r.data.error.message) || `Calendar error ${r.status}`);
      return r.data.id;
    }

    await pool(rows, 4, async (h) => {
      try { events[h.id] = await one(h); synced++; } catch (e) { errors++; console.error('event', h.id, e.message); }
    });
    await pool(remove, 4, async (id) => {
      const r = await gcal(token, `${base()}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (r.status < 300 || r.status === 404 || r.status === 410) synced++; else errors++;
    });
    const changed = rows.filter((h) => h.id in events && events[h.id] !== h.gcal_event_id);
    await pool(changed, 6, (h) => rest(`healings?id=eq.${h.id}&healer_id=eq.${user.id}`, { method: 'PATCH', body: JSON.stringify({ gcal_event_id: events[h.id] }) }));
    if (conn.last_error) await rest(`calendar_connections?healer_id=eq.${user.id}`, { method: 'PATCH', body: JSON.stringify({ last_error: null }) });

    send(res, 200, { connected: true, events, synced, errors });
  } catch (e) { console.error('gcal sync', e); send(res, 500, { error: e.message }); }
};
