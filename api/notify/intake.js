// POST /api/notify/intake  { slug, id }
// Called by the intake form right after a client submits it. Emails the healer
// (at the Google email they signed in with) once per new form. Contains no medical details.
const { SITE, rest, healerEmail, sendEmail, isUuid, send, readBody } = require('../_lib');

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'Use POST' });
    const body = await readBody(req);
    const slug = String(body.slug || '').toLowerCase();
    if (!isUuid(body.id) || !/^[a-z0-9-]{3,40}$/.test(slug)) return send(res, 400, { ok: false });

    const desk = (await rest(`desks?slug=eq.${slug}&select=id,healer_name,practice_name,notify_intake`))[0];
    if (!desk || desk.notify_intake === false) return send(res, 200, { ok: true, sent: false });

    // claim the notification exactly once, only for a form submitted in the last 15 minutes
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const claimed = await rest(
      `patients?id=eq.${body.id}&healer_id=eq.${desk.id}&source=eq.web_form&notified_at=is.null&created_at=gte.${since}&select=id,full_name,primary_concerns,concern_other,created_at`,
      { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ notified_at: new Date().toISOString() }) });
    const p = claimed && claimed[0];
    if (!p) return send(res, 200, { ok: true, sent: false });

    const to = await healerEmail(desk.id);
    if (!to) return send(res, 200, { ok: true, sent: false });

    const first = String(desk.healer_name || '').trim().split(/\s+/)[0] || 'there';
    const concerns = [...(p.primary_concerns || []).filter((c) => c !== 'Others'), p.concern_other].filter(Boolean).join(', ');
    const link = `${SITE()}/desk#p/${p.id}`;
    const when = new Date(p.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    const subject = `New intake form: ${p.full_name}`;
    const text = `Hi ${first},\n\n${p.full_name} has just filled in the intake form for ${desk.practice_name}.${concerns ? `\nLooking for support with: ${concerns}` : ''}\n\nOpen My Healing Desk to see their details:\n${link}\n\nHealer's Desk\nYou can turn these emails off in Desk settings.`;
    const html = `<!doctype html><html><body style="margin:0;background:#F7F3FF;font-family:Helvetica,Arial,sans-serif;color:#1E1645">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F3FF;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #ECE6FA;border-radius:20px;overflow:hidden">
<tr><td style="padding:22px 26px 6px"><img src="${SITE()}/assets/brand/logo-full-600.png" width="150" alt="Healer's Desk" style="display:block;border:0;height:auto"></td></tr>
<tr><td style="padding:10px 26px 4px"><p style="margin:0 0 6px;color:#A66E3C;font-size:13px;font-weight:bold;letter-spacing:.04em">NEW INTAKE FORM · ${esc(when)}</p>
<h1 style="margin:0 0 12px;font-family:Georgia,serif;font-size:24px;line-height:1.25;color:#2A1577">${esc(p.full_name)}</h1>
<p style="margin:0 0 6px;font-size:15px;line-height:1.55">Hi ${esc(first)}, a new subject has just filled in your intake form for <b>${esc(desk.practice_name)}</b>.</p>
${concerns ? `<p style="margin:0 0 6px;font-size:15px;line-height:1.55;color:#463D6E">Looking for support with: ${esc(concerns)}</p>` : ''}</td></tr>
<tr><td style="padding:16px 26px 26px"><a href="${link}" style="display:inline-block;background:#5A2BD2;background-image:linear-gradient(135deg,#8C4BFF,#5A2BD2 48%,#2E1784);color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:13px 24px;border-radius:999px">Open in My Healing Desk</a></td></tr>
</table>
<p style="max-width:520px;margin:14px auto 0;font-size:12px;color:#7B7398;line-height:1.5">You're receiving this because email alerts are on for your Healer's Desk. Turn them off any time in Desk settings.</p>
</td></tr></table></body></html>`;
    await sendEmail({ to, subject, html, text });
    send(res, 200, { ok: true, sent: true });
  } catch (e) { console.error('notify intake', e); send(res, 200, { ok: false }); }
};
