import nodemailer from 'nodemailer';
import { getRow } from './db';

interface MailConfig {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  from?: string;
}

// Dynamically fetch configurations from database or environment variables
async function getSettings(): Promise<Record<string, string>> {
  const settings: Record<string, string> = {};
  try {
    const rows = await require('./db').getAllRows(`SELECT key, value FROM admin_settings`);
    for (const r of rows) {
      settings[r.key] = r.value;
    }
  } catch (e) {
    console.error('Error fetching settings from DB:', e);
  }

  // Fallback / override with process.env
  settings.supportEmail = settings.supportEmail || process.env.SUPPORT_EMAIL || 'support@swiftpay.com';
  settings.supportPhone = settings.supportPhone || process.env.SUPPORT_PHONE || '+2349162845073';
  settings.whatsappNumber = settings.whatsappNumber || process.env.WHATSAPP_NUMBER || '+2349162845073';
  settings.senderName = settings.senderName || process.env.SENDER_NAME || 'SwiftPay';
  
  return settings;
}

// Generate the fully branded SwiftPay email HTML template
function getSwiftPayEmailTemplate(title: string, greeting: string, bodyText: string, actionCode: string, supportEmail: string, supportPhone: string, whatsappNumber: string) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          background-color: #0c0c14;
          margin: 0;
          padding: 0;
          color: #f1f5f9;
        }
        .container {
          max-width: 600px;
          margin: 40px auto;
          background-color: #11111e;
          border: 1px solid #1e293b;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
        }
        .header {
          background-color: #0c0c14;
          padding: 30px;
          text-align: center;
          border-bottom: 1px solid #1e293b;
        }
        .logo {
          color: #2dd4bf;
          font-size: 24px;
          font-weight: 800;
          letter-spacing: -0.05em;
          text-decoration: none;
        }
        .content {
          padding: 40px 30px;
        }
        h1 {
          color: #ffffff;
          font-size: 22px;
          font-weight: 700;
          margin-top: 0;
          margin-bottom: 20px;
        }
        p {
          color: #94a3b8;
          font-size: 15px;
          line-height: 1.6;
          margin-top: 0;
          margin-bottom: 24px;
        }
        .otp-container {
          background-color: #0c0c14;
          border: 1px solid #2dd4bf50;
          border-radius: 12px;
          padding: 20px;
          text-align: center;
          margin: 30px 0;
        }
        .otp-code {
          color: #2dd4bf;
          font-size: 32px;
          font-weight: 800;
          letter-spacing: 0.2em;
          margin: 0;
          font-family: monospace;
        }
        .otp-expiry {
          font-size: 11px;
          color: #64748b;
          margin-top: 8px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .footer {
          background-color: #09090f;
          padding: 30px;
          text-align: center;
          font-size: 12px;
          color: #475569;
          border-top: 1px solid #1e293b;
        }
        .support-links a {
          color: #2dd4bf;
          text-decoration: none;
          margin: 0 10px;
        }
        .support-links a:hover {
          text-decoration: underline;
        }
        .support-info {
          margin-top: 15px;
          line-height: 1.5;
        }
        .copyright {
          margin-top: 20px;
          border-top: 1px solid #1e293b;
          padding-top: 15px;
          font-size: 11px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <!-- Header -->
        <div class="header">
          <span class="logo">⚡ SWIFTPAY</span>
        </div>
        
        <!-- Content -->
        <div class="content">
          <h1>${title}</h1>
          <p>Hello ${greeting},</p>
          <p>${bodyText}</p>
          
          <div class="otp-container">
            <div class="otp-code">${actionCode}</div>
            <div class="otp-expiry">Expires in 10 minutes • Do not share this code</div>
          </div>
          
          <p>If you did not make this request, you can safely ignore this email. Your account remains secure.</p>
        </div>
        
        <!-- Footer -->
        <div class="footer">
          <div class="support-links">
            <a href="mailto:${supportEmail}">Email Support</a> | 
            <a href="tel:${supportPhone}">Call Us</a> | 
            <a href="https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}">WhatsApp</a>
          </div>
          <div class="support-info">
            Need urgent help? Reach out to SwiftPay Support 24/7.<br>
            Email: ${supportEmail} | Tel: ${supportPhone}
          </div>
          <div class="copyright">
            This email was sent by SwiftPay.<br>
            SwiftPay Secured Vault © 2026. All rights reserved.
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Send Real Email
export async function sendEmail(to: string, subject: string, title: string, greeting: string, bodyText: string, otp: string): Promise<boolean> {
  const settings = await getSettings();
  
  // SMTP credentials from env vars
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || '587');
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM || smtpUser || 'no-reply@swiftpay.com';

  const resendApiKey = process.env.RESEND_API_KEY;
  const sendgridApiKey = process.env.SENDGRID_API_KEY;

  const htmlContent = getSwiftPayEmailTemplate(
    title,
    greeting,
    bodyText,
    otp,
    settings.supportEmail,
    settings.supportPhone,
    settings.whatsappNumber
  );

  console.log(`[SWIFTPAY EMAIL SENDER] Attempting to send email to ${to} with Subject: "${subject}"`);

  // 1. Resend Integration if configured
  if (resendApiKey) {
    try {
      console.log('Sending email using Resend API...');
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendApiKey}`
        },
        body: JSON.stringify({
          from: `${settings.senderName} <onboarding@resend.dev>`, // Resend testing domain requires this default sender unless verified
          to: [to],
          subject,
          html: htmlContent
        })
      });
      if (res.ok) {
        console.log('Email sent successfully via Resend.');
        return true;
      } else {
        const errText = await res.text();
        console.error('Resend API failed:', errText);
      }
    } catch (err) {
      console.error('Error sending email via Resend:', err);
    }
  }

  // 2. SendGrid Integration if configured
  if (sendgridApiKey) {
    try {
      console.log('Sending email using SendGrid API...');
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sendgridApiKey}`
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: smtpFrom, name: settings.senderName },
          subject,
          content: [{ type: 'text/html', value: htmlContent }]
        })
      });
      if (res.status === 202 || res.ok) {
        console.log('Email sent successfully via SendGrid.');
        return true;
      } else {
        const errText = await res.text();
        console.error('SendGrid API failed:', errText);
      }
    } catch (err) {
      console.error('Error sending email via SendGrid:', err);
    }
  }

  // 3. SMTP Integration if configured
  if (smtpHost && smtpUser && smtpPass) {
    try {
      console.log(`Sending email via SMTP (${smtpHost}:${smtpPort})...`);
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      });

      await transporter.sendMail({
        from: `"${settings.senderName}" <${smtpFrom}>`,
        to,
        subject,
        html: htmlContent
      });

      console.log('Email sent successfully via SMTP.');
      return true;
    } catch (err) {
      console.error('Error sending email via SMTP:', err);
    }
  }

  // 4. Fallback/Local logger for testing when credentials are not configured yet
  console.log('----------------------------------------------------');
  console.log('⚠️  NO VALID SMTP OR EMAIL API KEY CONFIGURED IN ENV ⚠️');
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`OTP Code: ${otp}`);
  console.log('----------------------------------------------------');

  return true; // Return true as a fallback so local developers can still retrieve their verification codes in logs
}

// Send Real SMS
export async function sendSms(phoneNumber: string, message: string): Promise<boolean> {
  const settings = await getSettings();
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_FROM_NUMBER || '+1234567890';

  const termiiApiKey = process.env.TERMII_API_KEY;
  const termiiSenderId = process.env.TERMII_SENDER_ID || 'SwiftPay';

  const finalMessage = `SwiftPay: ${message}`;
  console.log(`[SWIFTPAY SMS SENDER] Sending SMS to ${phoneNumber}: "${finalMessage}"`);

  // 1. Twilio Integration
  if (twilioSid && twilioToken) {
    try {
      console.log('Sending SMS using Twilio...');
      const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${auth}`
        },
        body: new URLSearchParams({
          To: phoneNumber,
          From: twilioFrom,
          Body: finalMessage
        })
      });
      if (res.ok) {
        console.log('SMS sent successfully via Twilio.');
        return true;
      } else {
        const errText = await res.text();
        console.error('Twilio SMS sending failed:', errText);
      }
    } catch (err) {
      console.error('Error sending SMS via Twilio:', err);
    }
  }

  // 2. Termii Integration
  if (termiiApiKey) {
    try {
      console.log('Sending SMS using Termii...');
      const res = await fetch('https://api.ng.termii.com/api/sms/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to: phoneNumber,
          from: termiiSenderId,
          sms: finalMessage,
          type: 'plain',
          channel: 'generic',
          api_key: termiiApiKey
        })
      });
      if (res.ok) {
        console.log('SMS sent successfully via Termii.');
        return true;
      } else {
        const errText = await res.text();
        console.error('Termii SMS sending failed:', errText);
      }
    } catch (err) {
      console.error('Error sending SMS via Termii:', err);
    }
  }

  // 3. Fallback/Local logger
  console.log('----------------------------------------------------');
  console.log('⚠️  NO VALID TWILIO OR TERMII API KEY CONFIGURED IN ENV ⚠️');
  console.log(`To: ${phoneNumber}`);
  console.log(`Message: ${finalMessage}`);
  console.log('----------------------------------------------------');

  return true;
}
