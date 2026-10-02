/**
 * Healer's Desk — email sender (Google Apps Script)
 * Runs inside the healersdesk@gmail.com Google account.
 * The website (Vercel) sends it: who to email, the subject and the message.
 * Each email goes to the healer who owns the intake form — never to anyone else.
 *
 * Setup: Project Settings → Script Properties → add  HD_MAIL_SECRET = (same value as APPS_SCRIPT_SECRET in Vercel)
 * Deploy: Deploy → New deployment → Web app → Execute as: Me → Who has access: Anyone
 */
function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var secret = PropertiesService.getScriptProperties().getProperty('HD_MAIL_SECRET');
    if (!secret || body.secret !== secret) return reply_({ ok: false, error: 'unauthorised' });

    var to = String(body.to || '').trim();
    if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(to)) return reply_({ ok: false, error: 'bad address' });
    var subject = String(body.subject || 'Healer\'s Desk').slice(0, 180);
    if (MailApp.getRemainingDailyQuota() < 1) return reply_({ ok: false, error: 'daily email limit reached' });

    MailApp.sendEmail({
      to: to,
      subject: subject,
      body: String(body.text || '').slice(0, 20000),
      htmlBody: String(body.html || '').slice(0, 100000),
      name: 'Healer\'s Desk',
      replyTo: 'healersdesk@gmail.com'
    });
    return reply_({ ok: true });
  } catch (err) {
    return reply_({ ok: false, error: String(err).slice(0, 300) });
  }
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Run this once by hand (select it, press ▶ Run) to give the script permission to send email. */
function testSend() {
  MailApp.sendEmail(Session.getActiveUser().getEmail(), 'Healer\'s Desk test', 'Email sending works. 🌿');
}
