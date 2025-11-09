// Temporary endpoint to test email sending from the deployed environment.
// POST /api/test-email
// Body (JSON optional): { "to": "email@domain.com", "subject": "Test", "html": "<p>Hi</p>" }

const nodemailer = require('nodemailer');

async function sendViaBrevo(to, subject, html, replyTo, from) {
  const SibApiV3Sdk = require('sib-api-v3-sdk');
  const defaultClient = SibApiV3Sdk.ApiClient.instance;
  const apiKeyAuth = defaultClient.authentications['api-key'];
  apiKeyAuth.apiKey = process.env.BREVO_API_KEY;
  const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
  const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
  sendSmtpEmail.to = [{ email: to }];
  sendSmtpEmail.sender = { email: from };
  sendSmtpEmail.subject = subject;
  sendSmtpEmail.htmlContent = html;
  if (replyTo) sendSmtpEmail.replyTo = { email: replyTo };
  return apiInstance.sendTransacEmail(sendSmtpEmail);
}

async function sendViaSendGrid(to, subject, html, replyTo, from) {
  const sg = require('@sendgrid/mail');
  sg.setApiKey(process.env.SENDGRID_API_KEY);
  const msg = { to, from, subject, html };
  if (replyTo) msg.replyTo = replyTo;
  return sg.send(msg);
}

async function sendViaSmtp(to, subject, html, replyTo, from) {
  let transporter;
  if (process.env.SMTP_URL) {
    transporter = nodemailer.createTransport(process.env.SMTP_URL);
  } else {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: (process.env.SMTP_SECURE === 'true'),
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    });
  }
  return transporter.sendMail({ from, to, subject, html, replyTo });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = req.body || {};
  const to = body.to || process.env.ADMIN_EMAIL || process.env.EMAIL_TO;
  const subject = body.subject || 'Test email desde /api/test-email';
  const html = body.html || `<p>Prueba de correo desde /api/test-email a las ${new Date().toISOString()}</p>`;
  const replyTo = body.replyTo || undefined;
  const from = process.env.EMAIL_FROM || process.env.ADMIN_EMAIL || 'no-reply@example.com';

  if (!to) return res.status(400).json({ error: 'No recipient configured (ADMIN_EMAIL or EMAIL_TO or body.to)' });

  // Log config (no secrets)
  console.log('test-email: config', { brevo: !!process.env.BREVO_API_KEY, sendgrid: !!process.env.SENDGRID_API_KEY, smtpHost: !!process.env.SMTP_HOST });

  try {
    if (process.env.BREVO_API_KEY) {
      try {
        const resp = await sendViaBrevo(to, subject, html, replyTo, from);
        console.log('test-email: sent via Brevo', resp && resp.messageId ? resp.messageId : resp);
        return res.status(200).json({ sent: true, provider: 'brevo' });
      } catch (e) {
        console.error('test-email: Brevo failed', e && e.message ? e.message : e);
      }
    }

    if (process.env.SENDGRID_API_KEY) {
      try {
        await sendViaSendGrid(to, subject, html, replyTo, from);
        console.log('test-email: sent via SendGrid to', to);
        return res.status(200).json({ sent: true, provider: 'sendgrid' });
      } catch (e) {
        console.error('test-email: SendGrid failed', e && e.message ? e.message : e);
      }
    }

    // Fallback to SMTP
    try {
      const info = await sendViaSmtp(to, subject, html, replyTo, from);
      console.log('test-email: sent via SMTP to', to, 'info:', info && info.messageId ? info.messageId : info);
      return res.status(200).json({ sent: true, provider: 'smtp' });
    } catch (e) {
      console.error('test-email: SMTP failed', e && e.message ? e.message : e);
      return res.status(500).json({ error: 'All providers failed', details: e && e.message ? e.message : String(e) });
    }
  } catch (err) {
    console.error('test-email: unexpected error', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Unexpected error', details: err && err.message ? err.message : String(err) });
  }
};
