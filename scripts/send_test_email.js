// Simple SMTP test script for debugging email delivery
// Usage (PowerShell):
// $env:SMTP_HOST='smtp.example.com'; $env:SMTP_PORT='587'; $env:SMTP_USER='user'; $env:SMTP_PASS='pass'; $env:EMAIL_FROM='from@example.com'; $env:EMAIL_TO='to@example.com'; node .\scripts\send_test_email.js

const nodemailer = require('nodemailer');

async function main() {
  try {
    const smtpUrl = process.env.SMTP_URL || null;
    const host = process.env.SMTP_HOST || null;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const secure = (process.env.SMTP_SECURE === 'true');
    const user = process.env.SMTP_USER || null;
    const pass = process.env.SMTP_PASS || null;
    const from = process.env.EMAIL_FROM || process.env.ADMIN_EMAIL || process.env.EMAIL_TO || 'no-reply@example.com';
    const to = process.env.EMAIL_TO || process.env.ADMIN_EMAIL || null;

    console.log('Test email config:', {
      smtpUrl: !!smtpUrl,
      host,
      port,
      secure,
      hasAuth: !!(user && pass),
      from,
      to
    });

    if (!to) {
      console.error('No recipient configured. Set EMAIL_TO or ADMIN_EMAIL env var.');
      process.exit(2);
    }

    let transporter;
    if (smtpUrl) {
      transporter = nodemailer.createTransport(smtpUrl);
    } else if (host) {
      transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: user ? { user, pass } : undefined
      });
    } else {
      console.error('No SMTP configuration found. Set SMTP_URL or SMTP_HOST + SMTP_USER/SMTP_PASS');
      process.exit(2);
    }

    // verify connection configuration
    console.log('Verifying SMTP connection...');
    const ok = await transporter.verify();
    console.log('SMTP verify result:', ok);

    const info = await transporter.sendMail({
      from,
      to,
      subject: 'Test email desde webhook debug',
      text: `Este es un correo de prueba enviado a las ${new Date().toISOString()}`,
      html: `<p>Este es un correo de prueba enviado a las ${new Date().toISOString()}</p>`
    });

    console.log('Send result:', info);
    console.log('Si no recibes el correo, revisa spam y el panel de tu proveedor (Brevo) para activity/suppression.');
    process.exit(0);
  } catch (err) {
    console.error('Error sending test email:', err && err.message ? err.message : err);
    if (err && err.response) console.error('SMTP response:', err.response);
    if (err && err.stack) console.error(err.stack);
    process.exit(1);
  }
}

main();
