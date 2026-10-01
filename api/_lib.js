// Healer's Desk — shared helpers for the Google Calendar functions.
// Runs on Vercel (Node 18+). No npm packages needed.
// Secrets come from Vercel → Settings → Environment Variables; they never reach the browser.
const crypto = require('crypto');

const env = (k) => { const v = process.env[k]; if (!v) throw new Error(`Server setup: missing ${k}`); return v; };
const SITE = () => (process.env.SITE_URL || 'https://www.healersdesk.com').replace(/\/+$/, '');
const SB = () => env('SUPABASE_URL').replace(/\/+$/, '');
const SCOPES = 'openid email https://www.googleapis.com/auth/calendar.app.created';
const CAL_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
const REDIRECT = () => `${SITE()}/api/gcal/callback`;

/* ---------- Supabase (server side, service key) ---------- */
function sbHeaders(extra = {}) {
  const k = env('SUPABASE_SERVICE_ROLE_KEY');
  const h = { apikey: k, 'Content-Type': 'application/json', ...extra };
  if (k.startsWith('eyJ')) h.Authorization = `Bearer ${k}`;
  return h;
}
async function rest(path, opts = {}) {
  const r = await fetch(`${SB()}/rest/v1/${path}`, { ...opts, headers: sbHeaders(opts.headers) });
  const t = await r.text();
  let data = null; try { data = t ? JSON.parse(t) : null; } catch { data = t; }
  if (!r.ok) throw new Error((data && data.message) || `Database error ${r.status}`);
  return data;
}
// Who is calling? Verifies the healer's Supabase login token.
async function getUser(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ') || auth.length < 30) return null;
  const r = await fetch(`${SB()}/auth/v1/user`, { headers: { apikey: env('SUPABASE_SERVICE_ROLE_KEY'), Authorization: auth } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? u : null;
}

/* ---------- small crypto helpers (HD_SECRET) ---------- */
const keyFor = (purpose) => crypto.createHash('sha256').update(`${env('HD_SECRET')}|${purpose}`).digest();
function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keyFor('enc'), iv);
  const ct = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url');
}
function decrypt(blob) {
  const b = Buffer.from(blob, 'base64url');
  const d = crypto.createDecipheriv('aes-256-gcm', keyFor('enc'), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}
function sign(obj) {
  const p = Buffer.from(JSON.stringify(obj)).toString('base64url');
  const s = crypto.createHmac('sha256', keyFor('state')).update(p).digest('base64url');
  return `${p}.${s}`;
}
function verify(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [p, s] = token.split('.');
  const want = crypto.createHmac('sha256', keyFor('state')).update(p).digest('base64url');
  if (s.length !== want.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(want))) return null;
  try { const o = JSON.parse(Buffer.from(p, 'base64url').toString()); return o.exp > Date.now() ? o : null; } catch { return null; }
}

/* ---------- Google ---------- */
async function googleToken(params) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), ...params })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error_description || j.error || 'Google token error'); e.code = j.error; throw e; }
  return j;
}
async function accessTokenFor(conn) {
  try { return (await googleToken({ grant_type: 'refresh_token', refresh_token: decrypt(conn.refresh_token_enc) })).access_token; }
  catch (e) { if (e.code === 'invalid_grant' || /decrypt|auth/i.test(e.message)) e.reconnect = true; throw e; }
}
async function gcal(token, path, { method = 'GET', body } = {}) {
  const r = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const t = await r.text(); let data = null; try { data = t ? JSON.parse(t) : null; } catch { data = t; }
  return { status: r.status, data };
}
async function createCalendar(token, tz, practice) {
  const g = await gcal(token, 'calendars', { method: 'POST', body: {
    summary: "Healer's Desk",
    description: `Healing sessions from My Healing Desk${practice ? ` (${practice})` : ''}. Kept up to date automatically by healersdesk.com.`,
    timeZone: tz || 'Asia/Kolkata' } });
  if (g.status >= 300) throw new Error((g.data && g.data.error && g.data.error.message) || 'Could not create the calendar');
  return g.data.id;
}

/* ---------- misc ---------- */
const isUuid = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
async function pool(items, n, fn) {
  const q = [...items]; const workers = Array.from({ length: Math.min(n, q.length) }, async () => { while (q.length) await fn(q.shift()); });
  await Promise.all(workers);
}
function send(res, status, obj) { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(obj)); }
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = []; for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { return {}; }
}

module.exports = { env, SITE, SCOPES, CAL_SCOPE, REDIRECT, rest, getUser, encrypt, decrypt, sign, verify, googleToken, accessTokenFor, gcal, createCalendar, isUuid, pool, send, readBody };
