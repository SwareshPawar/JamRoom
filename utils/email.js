const nodemailer = require('nodemailer');

const JAMROOM_SITE_URL = 'https://jam-room-mu.vercel.app/';
const BRAND_LOGO_FILE_NAME = 'jamroom-brand-logo.png';
const BRAND_LOGO_PUBLIC_PATH = `/icons/${BRAND_LOGO_FILE_NAME}`;
const BRAND_LOGO_URL = `${JAMROOM_SITE_URL.replace(/\/$/, '')}${BRAND_LOGO_PUBLIC_PATH}`;

/**
 * Wraps a bare HTML fragment in a full, styled email document.
 * Prevents Apple Mail dark-mode color inversion and enforces consistent
 * light-mode rendering across all email clients (Gmail, Outlook, iOS Mail, etc.)
 * @param {string} bodyContent - The inner HTML content
 * @returns {string} Full HTML email document
 */
const wrapEmailHtml = (bodyContent) => `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!--[if !mso]><!-->
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <!--<![endif]-->
  <!-- Force light mode on Apple Mail / iOS Mail -->
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no">
  <meta name="x-apple-disable-message-reformatting">
  <style>
    :root { color-scheme: light only; supported-color-schemes: light; }
    html { background-color: #eef2f7; color: #1f2937; }
    body, table, td, div, p, li, span, strong, a { -webkit-text-size-adjust: 100%; }
    a[x-apple-data-detectors], u + #body a, #MessageViewBody a {
      color: inherit !important;
      text-decoration: inherit !important;
      font-size: inherit !important;
      font-family: inherit !important;
      font-weight: inherit !important;
      line-height: inherit !important;
    }

    /* Mobile-first responsive adjustments */
    @media only screen and (max-width: 620px) {
      .email-outer-td { padding: 12px 8px !important; }
      .email-card { border-radius: 8px !important; }
      .email-header-td { padding: 20px 16px 16px !important; }
      .email-header-td h1 { font-size: 18px !important; }
      .email-header-td p { font-size: 12px !important; color: rgba(255,255,255,0.84) !important; }
      .email-body-td {
        padding: 20px 16px !important;
        font-size: 14px !important;
      }
      .email-body-td h2 {
        font-size: 16px !important;
      }
      .email-body-td h3 {
        font-size: 14px !important;
      }
      .email-body-td ul {
        padding-left: 16px !important;
      }
      .email-footer-td { padding: 14px 16px !important; }
    }

    /* Apple Mail dark mode override — force light-mode palette */
    @media (prefers-color-scheme: dark) {
      body, .email-wrapper, .email-card {
        background-color: #eef2f7 !important;
        color: #1f2937 !important;
      }
      h1, h2, h3, h4, p, li, td, th, span, strong, a {
        color: #1f2937 !important;
      }
      .email-header-td {
        background: linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%) !important;
        color: #ffffff !important;
      }
      .email-header-td h1, .email-header-td p {
        color: #ffffff !important;
      }
      .email-footer-td {
        background-color: #f8fafc !important;
        color: #64748b !important;
      }
      .email-footer-td p, .email-footer-td a {
        color: #64748b !important;
      }
    }
  </style>
</head>
<body id="body" style="margin:0;padding:0;background-color:#eef2f7;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table class="email-wrapper" role="presentation" cellpadding="0" cellspacing="0" width="100%"
    style="background-color:#eef2f7;margin:0;padding:0;">
    <tr>
      <td class="email-outer-td" align="center" style="padding:24px 12px;">

        <!-- Card container — 100% width on mobile, capped at 600px on desktop -->
        <table class="email-card" role="presentation" cellpadding="0" cellspacing="0"
          style="max-width:600px;width:100%;background-color:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #dbe5f0;box-shadow:0 8px 24px rgba(15,23,42,0.08);">

          <!-- Header -->
          <tr>
            <td class="email-header-td"
              style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);padding:24px 24px 18px;text-align:center;">
              <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="vertical-align:middle;padding-right:12px;">
                    <img src="${BRAND_LOGO_URL}" alt="JamRoom Logo" width="52" height="52"
                      style="display:block;width:52px;height:52px;border-radius:10px;object-fit:contain;background:#ffffff;padding:4px;border:1px solid rgba(255,255,255,0.3);" />
                  </td>
                  <td style="vertical-align:middle;text-align:left;">
                    <h1 style="margin:0 0 2px;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">JamRoom</h1>
                    <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.84);">Swar JamRoom &amp; Music Studio</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td class="email-body-td" style="padding:24px;color:#1f2937;font-size:15px;line-height:1.7;word-break:break-word;">
              ${bodyContent}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="email-footer-td"
              style="background-color:#f8fafc;padding:16px 24px;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0 0 4px;font-size:12px;color:#64748b;">
                &copy; JamRoom &mdash; Swar JamRoom &amp; Music Studio
              </p>
              <p style="margin:0;font-size:12px;color:#64748b;word-break:break-all;">
                <a href="${JAMROOM_SITE_URL}" target="_blank" rel="noopener noreferrer"
                  style="color:#1d4ed8;text-decoration:underline;">${JAMROOM_SITE_URL}</a>
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card container -->

      </td>
    </tr>
  </table>
</body>
</html>`;

// Create reusable transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail', // or 'smtp' for custom SMTP
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

/**
 * Send email
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text content
 * @param {string} options.html - HTML content
 * @param {Array} options.attachments - Email attachments
 */
const sendEmail = async (options) => {
  try {
    const transporter = createTransporter();

    let normalizedHtml = String(options.html || '');
    const normalizedText = String(options.text || '');

    if (normalizedHtml) {
      // If the HTML is a bare fragment (no doctype/html tag), wrap it in the full email template.
      // This prevents Apple Mail dark-mode from inverting colors on unstyled fragments.
      const isFullDocument = /<!DOCTYPE|<html/i.test(normalizedHtml);
      if (!isFullDocument) {
        // Inject inline styles into common tags for maximum email client compatibility
        normalizedHtml = normalizedHtml
          .replace(/<h1(?=[^>]*>)/g, '<h1 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 12px;line-height:1.2;"')
          .replace(/<h2(?=[^>]*>)/g, '<h2 style="font-size:18px;font-weight:800;color:#0f172a;margin:16px 0 10px;padding-bottom:6px;border-bottom:2px solid #1d4ed8;"')
          .replace(/<h3(?=[^>]*>)/g, '<h3 style="font-size:15px;font-weight:700;color:#0f172a;margin:14px 0 8px;"')
          .replace(/<ul(?=[^>]*>)/g, '<ul style="padding-left:20px;margin:8px 0;border-left:3px solid #dbeafe;"')
          .replace(/<li(?=[^>]*>)/g, '<li style="padding:4px 0;color:#334155;"')
          .replace(/<p(?=[^>]*>)/g, '<p style="margin:8px 0;color:#334155;"')
          .replace(/<strong(?=[^>]*>)/g, '<strong style="color:#0f172a;"');
        normalizedHtml = wrapEmailHtml(normalizedHtml);
      }
    }

    const htmlWithSiteLink = normalizedHtml || '';
    const textWithSiteLink = normalizedText
      ? (normalizedText.includes(JAMROOM_SITE_URL)
          ? normalizedText
          : `${normalizedText}\n\nVisit JamRoom: ${JAMROOM_SITE_URL}`)
      : normalizedText;

    const mailOptions = {
      from: `JamRoom <${process.env.EMAIL_USER}>`,
      to: options.to,
      subject: options.subject,
      text: textWithSiteLink || undefined,
      html: htmlWithSiteLink || undefined,
      attachments: options.attachments || []
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Email error:', error);
    throw error;
  }
};

/**
 * Send bulk emails
 * @param {Array} emails - Array of email options objects
 */
const sendBulkEmails = async (emails) => {
  try {
    const results = await Promise.allSettled(
      emails.map(email => sendEmail(email))
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`Bulk email results: ${successful} sent, ${failed} failed`);
    return { successful, failed, results };
  } catch (error) {
    console.error('Bulk email error:', error);
    throw error;
  }
};

module.exports = {
  sendEmail,
  sendBulkEmails
};
