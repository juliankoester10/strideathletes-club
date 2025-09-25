// server.js
require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const app = express();
const DEV = process.env.NODE_ENV !== 'production';

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Boot-Log
console.log(
  '[BOOT]',
  'mailConfigured=', Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD),
  'sheetsConfigured=', Boolean(process.env.APPS_SCRIPT_URL && process.env.SHEETS_SECRET),
  'confirmSecret=', Boolean(process.env.EMAIL_CONFIRM_SECRET || process.env.SHEETS_SECRET)
);

// ===== Shop-Konfig/Proxy wurden entfernt, da Shop entkoppelt ist =====

// Helpers
const isEmail = (s) => /\S+@\S+\.\S+/.test(String(s || '').trim());
const getConfirmSecret = () =>
  process.env.EMAIL_CONFIRM_SECRET || process.env.SHEETS_SECRET || (process.env.GMAIL_APP_PASSWORD ?? '');

const b64urlEncode = (bufOrStr) =>
  Buffer.from(bufOrStr).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/,'');
const b64urlDecode = (str) =>
  Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
const signTokenBody = (body, secret) =>
  crypto.createHmac('sha256', secret).update(body).digest('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');

function createConfirmToken(payload, expiresSeconds = 14*24*60*60) {
  const secret = getConfirmSecret();
  const body = b64urlEncode(JSON.stringify({ ...payload, exp: Math.floor(Date.now()/1000) + expiresSeconds }));
  const sig = signTokenBody(body, secret);
  return `${body}.${sig}`;
}
function verifyConfirmToken(token) {
  try {
    const secret = getConfirmSecret();
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) return null;
    if (sig !== signTokenBody(body, secret)) return null;
    const data = JSON.parse(b64urlDecode(body));
    if (data.exp && Math.floor(Date.now()/1000) > data.exp) return null;
    return data;
  } catch { return null; }
}

function buildMailText({
  name, plzcity, instagram, email, host, about,
  meeting, scheduleText, distance, pace, consent
}) {
  return [
    `Name: ${name}`,
    `PLZ/Stadt: ${plzcity}`,
    `Instagram/Website: ${instagram}`,
    `E-Mail: ${email}`,
    `Host: ${host}`,
    `Über uns: ${about || '-'}`,
    `---`,
    `Treffpunkt: ${meeting}`,
    `Tage/Uhrzeiten: ${scheduleText}`,
    `Strecke: ${distance || 'Keine Angabe'}`,
    `Pace: ${pace || '-'}`,
    `Einwilligung: ${consent ? 'Ja' : 'Nein'}`
  ].join('\n');
}

// Health
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    mailConfigured: Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD),
    sheetsConfigured: Boolean(process.env.APPS_SCRIPT_URL && process.env.SHEETS_SECRET),
    confirmConfigured: Boolean(getConfirmSecret()),
  });
});

// Registrierung: E-Mail + Bestätigungslink
app.post('/api/register', async (req, res) => {
  try {
    const {
      name, plzcity, instagram, email, host, about,
      meeting, schedule, distance, pace, consent
    } = req.body || {};

    const scheduleValid = Array.isArray(schedule) && schedule.length > 0 &&
      schedule.every(s => s && typeof s.day === 'string' && typeof s.time === 'string' && s.day.trim() && s.time.trim());

    if (!name || !plzcity || !instagram || !email || !host || !meeting || !consent || !scheduleValid) {
      return res.status(400).json({
        error: 'missing_fields',
        detail: DEV ? 'Erforderlich: name, plzcity, instagram, email, host, meeting, consent=true, schedule[{day,time}]' : undefined
      });
    }
    if (!isEmail(email)) {
      return res.status(400).json({ error: 'invalid_email', detail: DEV ? 'E-Mail-Format ungültig' : undefined });
    }
    if (!getConfirmSecret()) {
      return res.status(500).json({ error: 'confirm_not_configured' });
    }
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      return res.status(500).json({ error: 'mail_not_configured' });
    }

    const scheduleText = schedule.map(s => `${s.day} ${s.time}`).join('; ');
    const payload = {
      name, plzcity, instagram, email, host, about,
      meeting, schedule, distance: distance || '', pace: pace || '',
      consent: !!consent, ts: new Date().toISOString()
    };
    const token = createConfirmToken(payload);
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const confirmUrl = `${baseUrl}/api/confirm?token=${encodeURIComponent(token)}`;

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 465, secure: true,
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
    });

    const subject = `Neue Run-Club-Anmeldung: ${name}`;
    const text = buildMailText({ ...payload, scheduleText });
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:640px;margin:auto;">
        <h2 style="margin:0 0 12px;">Neue Run-Club-Anmeldung</h2>
        <pre style="white-space:pre-wrap;background:#0b0b0b;color:#fff;padding:12px;border-radius:8px;font-family:ui-monospace,Menlo,Consolas,monospace;">${text}</pre>
        <p style="margin:18px 0;">Bitte bestätige die Aufnahme in Google Sheets:</p>
        <p style="margin:22px 0;">
          <a href="${confirmUrl}"
             style="display:inline-block;padding:12px 18px;background:#eddd81;color:#000;text-decoration:none;font-weight:800;border-radius:10px;">
             ✅ Aufnahme bestätigen
          </a>
        </p>
        <p style="font-size:12px;color:#777;margin-top:10px;">Link gültig für 14 Tage.</p>
      </div>
    `;

    await transporter.sendMail({
      from: `"Stride Athletes" <${process.env.GMAIL_USER}>`,
      to: process.env.TO_EMAIL || process.env.GMAIL_USER,
      subject, text, html
    });

    // Eingangsbestätigung an die/den Anmeldende:n
    try {
      await transporter.sendMail({
        from: `"Stride Athletes" <${process.env.GMAIL_USER}>`,
        to: email,
        replyTo: 'strideathletes@gmail.com',
        subject: 'Deine Run-Club-Anmeldung ist eingegangen ✅',
        text:
`Hallo ${host || name},

vielen Dank für deine Run-Club-Anmeldung bei Stride Athletes.
Wir prüfen deine Angaben und melden uns bei dir.

Wenn du Fragen hast, erreichst du uns unter: strideathletes@gmail.com

Sportliche Grüße
Stride Athletes`,
        html:
`<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:640px;margin:auto;">
  <p>Hallo ${host || name},</p>
  <p>vielen Dank für deine Run-Club-Anmeldung bei <strong>Stride Athletes</strong>.<br>
     Wir prüfen deine Angaben und melden uns bei dir.</p>
  <p>Fragen? Schreib uns an <a href="mailto:strideathletes@gmail.com">strideathletes@gmail.com</a>.</p>
  <p>Sportliche Grüße<br>Stride Athletes</p>
</div>`
      });
    } catch (e) {
      console.warn('Ack mail to submitter failed:', e?.message || e);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('POST /api/register error:', err);
    return res.status(500).json({ error: 'send_failed', detail: DEV ? String(err?.message || err) : undefined });
  }
});

// Bestätigungs-Link → Google Sheets
app.get('/api/confirm', async (req, res) => {
  try {
    const token = req.query.token;
    const data = verifyConfirmToken(token);
    if (!data) {
      return res.status(400).send(htmlPage('Ungültiger oder abgelaufener Bestätigungslink ❌'));
    }

    const scheduleText = Array.isArray(data.schedule)
      ? data.schedule.map(s => `${s.day} ${s.time}`).join('; ')
      : '';

    let sheetsOk = false;
    if (process.env.APPS_SCRIPT_URL && process.env.SHEETS_SECRET) {
      const payload = {
        token: process.env.SHEETS_SECRET,
        name: data.name, plzcity: data.plzcity, instagram: data.instagram, email: data.email,
        host: data.host, about: data.about, meeting: data.meeting,
        datetime: scheduleText, distance: data.distance || '', pace: data.pace || '',
        consent: !!data.consent, ts: data.ts || new Date().toISOString()
      };

      const hasGlobalFetch = typeof fetch === 'function';
      const doFetch = async (...args) => {
        if (hasGlobalFetch) return fetch(...args);
        const { default: fetchPoly } = await import('node-fetch');
        return fetchPoly(...args);
      };

      try {
        const r = await doFetch(process.env.APPS_SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const txt = await r.text();
        if (r.ok) { sheetsOk = true; console.log('Sheets confirm OK'); }
        else      { console.error('Sheets confirm failed:', r.status, txt); }
      } catch (e) {
        console.error('Sheets confirm network error:', e);
      }
    }

    // Zusage-Mail an die/den Anmeldende:n
    try {
      if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD && data?.email) {
        const transporter2 = nodemailer.createTransport({
          host: 'smtp.gmail.com', port: 465, secure: true,
          auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
        });

        await transporter2.sendMail({
          from: `"Stride Athletes" <${process.env.GMAIL_USER}>`,
          to: data.email,
          replyTo: 'strideathletes@gmail.com',
          subject: 'Deine Run-Club-Anmeldung wurde bestätigt 🎉',
          text:
`Hallo ${data.host || data.name},

gute News: Deine Run-Club-Anmeldung bei Stride Athletes wurde bestätigt
und in unser Verzeichnis übernommen.

Wenn du Fragen hast, erreichst du uns unter: strideathletes@gmail.com

Sportliche Grüße
Stride Athletes`,
          html:
`<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:640px;margin:auto;">
  <p>Hallo ${data.host || data.name},</p>
  <p><strong>Gute News:</strong> Deine Run-Club-Anmeldung bei <strong>Stride Athletes</strong> wurde bestätigt
     und in unser Verzeichnis übernommen.</p>
  <p>Fragen? Schreib uns an <a href="mailto:strideathletes@gmail.com">strideathletes@gmail.com</a>.</p>
  <p>Sportliche Grüße<br>Stride Athletes</p>
</div>`
        });
      }
    } catch (e) {
      console.warn('Approval mail to submitter failed:', e?.message || e);
    }

    return res.status(200).send(htmlPage(
      sheetsOk ? 'Run Club bestätigt und in Sheets gespeichert ✅'
               : 'Bestätigt, aber Sheets nicht konfiguriert/erreichbar ❌'
    ));
  } catch (err) {
    console.error('GET /api/confirm error:', err);
    return res.status(500).send(htmlPage('Ein Fehler ist aufgetreten ❌'));
  }
});

function htmlPage(title) {
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{margin:0;background:#000;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial}
  .wrap{max-width:720px;margin:16vh auto 0;padding:24px}
  h1{font-size:28px;margin:0 0 12px}
  .btn{display:inline-block;margin-top:14px;padding:10px 14px;background:#eddd81;color:#000;text-decoration:none;font-weight:800;border-radius:10px}
</style></head>
<body><div class="wrap">
  <h1>${title}</h1>
  <a class="btn" href="/">Zur Startseite</a>
</div></body></html>`;
}

// Clubs aus Google Sheets
app.get('/api/clubs', async (_req, res) => {
  try {
    if (!(process.env.APPS_SCRIPT_URL && process.env.SHEETS_SECRET)) {
      return res.json([]); // Sheets nicht konfiguriert
    }
    const url = `${process.env.APPS_SCRIPT_URL}?token=${encodeURIComponent(process.env.SHEETS_SECRET)}`;

    const hasGlobalFetch = typeof fetch === 'function';
    const doFetch = async (...args) => {
      if (hasGlobalFetch) return fetch(...args);
      const { default: fetchPoly } = await import('node-fetch');
      return fetchPoly(...args);
    };

    const r = await doFetch(url);
    const txt = await r.text();
    if (!r.ok) return res.status(502).json({ error: 'sheets_error', detail: txt });

    let data;
    try { data = JSON.parse(txt); } catch { return res.status(502).json({ error: 'bad_json', detail: txt }); }
    return res.json(Array.isArray(data.rows) ? data.rows : []);
  } catch (e) {
    console.error('GET /api/clubs error:', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

// Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
