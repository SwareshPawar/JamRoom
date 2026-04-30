const nodemailer = require('nodemailer');

const JAMROOM_SITE_URL = 'https://jam-room-mu.vercel.app/';

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

    const normalizedHtml = String(options.html || '');
    const normalizedText = String(options.text || '');

    const htmlWithSiteLink = normalizedHtml
      ? (() => {
          if (normalizedHtml.includes(JAMROOM_SITE_URL)) {
            return normalizedHtml;
          }

          const siteBlock = `<div style="margin-top:16px;color:#4b5563;font-size:13px;">Visit JamRoom: <a href="${JAMROOM_SITE_URL}" target="_blank" rel="noopener noreferrer">${JAMROOM_SITE_URL}</a></div>`;
          if (/<\/body>/i.test(normalizedHtml)) {
            return normalizedHtml.replace(/<\/body>/i, `${siteBlock}</body>`);
          }

          return `${normalizedHtml}${siteBlock}`;
        })()
      : normalizedHtml;

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
