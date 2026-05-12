const DEFAULT_BRAND_LOGO_URL = 'https://jam-room-mu.vercel.app/icons/jamroom-brand-logo.png';

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const buildRowsHtml = (rows = []) => rows
  .map((row) => {
    if (!row) return '';
    if (typeof row === 'string') return row;
    const label = escapeHtml(row.label || '');
    const value = row.html ? row.html : escapeHtml(row.value || '');
    const labelStyle = row.labelStyle || 'padding:8px 0;font-size:13px;color:#64748b;vertical-align:top;';
    const valueStyle = row.valueStyle || 'padding:8px 0;font-size:13px;color:#0f172a;text-align:right;vertical-align:top;word-break:break-word;';
    return `<tr><td style="${labelStyle}">${label}</td><td style="${valueStyle}">${value}</td></tr>`;
  })
  .join('');

const buildInvoiceStyleEmail = ({
  brandName = 'JamRoom',
  brandSubtitle = 'Swar JamRoom & Music Studio',
  logoUrl = DEFAULT_BRAND_LOGO_URL,
  title = 'Update',
  label = 'Activity Update',
  greeting = '',
  introLines = [],
  summaryRows = [],
  summaryTitle = 'Summary',
  highlightHtml = '',
  sectionsHtml = [],
  ctaTitle = '',
  ctaHtml = '',
  termsTitle = '',
  terms = [],
  footerLines = [],
  attachmentNoticeHtml = '',
  linkUrl = '',
  linkLabel = '',
  badgeLabel = '',
  badgeValue = '',
  noteHtml = ''
}) => {
  const intro = Array.isArray(introLines)
    ? introLines.filter(Boolean).map((line) => `<p style="margin:0 0 10px 0;font-size:13px;line-height:1.7;color:#475569;">${line}</p>`).join('')
    : '';
  const rowsHtml = buildRowsHtml(summaryRows);
  const sections = Array.isArray(sectionsHtml) ? sectionsHtml.filter(Boolean).join('') : '';
  const termsHtml = Array.isArray(terms) && terms.length > 0
    ? `<div class="terms-card"><div class="terms-hd">${termsTitle || 'Booking Terms'}</div><ul>${terms.map((term) => `<li>${term}</li>`).join('')}</ul></div>`
    : '';
  const footerHtml = Array.isArray(footerLines) && footerLines.length > 0
    ? footerLines.map((line) => `<div>${line}</div>`).join('')
    : '';
  const ctaBlock = ctaHtml
    ? `<div class="cta-card"><h3>${ctaTitle || 'Next Steps'}</h3>${ctaHtml}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<style>
  :root{color-scheme:light only}
  body{margin:0;padding:0;background:#eef2f7;font-family:Arial,sans-serif;color:#1f2937;-webkit-text-size-adjust:100%}
  .eq{max-width:760px;margin:0 auto;padding:12px}
  .card{background:#fff;border-radius:16px;overflow:hidden;border:1px solid #dbe5f0;box-shadow:0 8px 24px rgba(15,23,42,0.08)}
  .hdr{background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);color:#fff;padding:20px}
  .hdr-table{width:100%;border-collapse:collapse}
  .hdr-left{vertical-align:top;padding-right:14px}
  .hdr-right{vertical-align:top;width:210px}
  .hdr h2{margin:0 0 8px 0;font-size:24px;color:#fff}
  .hdr .cl{font-size:12px;line-height:1.6;color:rgba(255,255,255,0.88)}
  .order-box{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:12px 14px}
  .order-kicker{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#bfdbfe;font-weight:700;margin-bottom:8px}
  .order-line{font-size:12px;line-height:1.7;color:rgba(255,255,255,0.9)}
  .body{padding:20px}
  .hero{background:#f8fafc;border:1px solid #dbe5f0;border-radius:12px;padding:14px 16px;margin:0 0 14px 0}
  .hero h3{margin:0 0 6px 0;font-size:17px;color:#0f172a}
  .hero p{margin:0;font-size:13px;line-height:1.7;color:#475569}
  .summary-card,.notes-card,.terms-card,.cta-card{background:#fff;border:1px solid #dbe5f0;border-radius:12px;padding:14px 16px;margin:0 0 14px 0}
  .summary-card h3,.notes-card h3,.cta-card h3{margin:0 0 8px 0;font-size:15px;color:#0f172a}
  .summary-table{width:100%;border-collapse:collapse}
  .summary-table td{border-top:1px solid #edf2f7}
  .summary-table tr:first-child td{border-top:0}
  .summary-badge{display:inline-block;background:#dbeafe;color:#1d4ed8;font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;padding:3px 9px;border-radius:999px}
  .summary-value{font-size:14px;font-weight:700;color:#0f172a;word-break:break-word}
  .summary-value-right{text-align:right}
  .section{margin:0 0 14px 0}
  .section-title{font-size:12px;text-transform:uppercase;letter-spacing:1.2px;color:#64748b;font-weight:800;margin:0 0 10px 0}
  .highlight{background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%);border:1px solid #bfdbfe;border-radius:12px;padding:14px 16px;margin:0 0 14px 0}
  .highlight h3{margin:0 0 6px 0;font-size:15px;color:#0f172a}
  .highlight p{margin:0;font-size:13px;line-height:1.7;color:#334155}
  .cta-body{font-size:13px;line-height:1.8;color:#0f172a}
  .terms-card{background:#fff5f5;border:1px solid #fca5a5;border-left:4px solid #dc2626}
  .terms-hd{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#dc2626;font-weight:800;margin-bottom:8px}
  .terms-card ul{margin:0;padding-left:18px;color:#7f1d1d}
  .terms-card li{margin:0 0 5px 0;font-size:12px;line-height:1.55}
  .footer{font-size:11px;line-height:1.8;color:#64748b;border-top:1px solid #e5e7eb;padding-top:12px;word-break:break-word}
  .footer a{color:#1d4ed8;text-decoration:none}
  @media only screen and (max-width: 620px){
    .eq{padding:8px}
    .hdr{padding:16px}
    .hdr-left,.hdr-right{display:block;width:100% !important;padding:0}
    .hdr-right{margin-top:12px}
    .body{padding:14px}
    .summary-table,.summary-table tbody,.summary-table tr,.summary-table td{display:block;width:100%}
    .summary-table td{padding:6px 0 !important;text-align:left !important}
    .summary-table tr{border-top:1px solid #edf2f7;padding:8px 0}
    .summary-table tr:first-child{border-top:0}
    .summary-value-right{text-align:left}
  }
</style>
</head>
<body>
  <div class="eq">
    <div class="card">
      <div class="hdr">
        <table class="hdr-table" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td class="hdr-left">
              <table cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
                <tr>
                  <td style="vertical-align:middle;padding-right:10px;">
                    <img src="${logoUrl}" alt="${brandName} Logo" width="48" height="48" style="display:block;width:48px;height:48px;border-radius:12px;object-fit:contain;background:#ffffff;padding:4px;border:1px solid rgba(255,255,255,0.3);" />
                  </td>
                  <td style="vertical-align:middle;">
                    <h2 style="margin:0;font-size:24px;color:#fff;">${brandName}</h2>
                  </td>
                </tr>
              </table>
              <div class="cl"><strong>${label}</strong></div>
              ${badgeLabel ? `<div class="cl"><strong>${badgeLabel}:</strong> ${badgeValue}</div>` : ''}
              <div class="cl">${brandSubtitle}</div>
            </td>
            <td class="hdr-right">
              <div class="order-box">
                <div class="order-kicker">${title}</div>
                ${greeting ? `<div class="order-line">${greeting}</div>` : ''}
                ${linkUrl ? `<div class="order-line"><strong>${linkLabel || 'Link'}:</strong> <span style="word-break:break-all;">${linkUrl}</span></div>` : ''}
              </div>
            </td>
          </tr>
        </table>
      </div>
      <div class="body">
        ${intro}
        ${highlightHtml ? `<div class="highlight">${highlightHtml}</div>` : ''}
        ${summaryRows.length > 0 ? `
          <div class="summary-card">
            <h3>${summaryTitle}</h3>
            <table class="summary-table">${rowsHtml}</table>
          </div>
        ` : ''}
        ${sections}
        ${ctaBlock}
        ${termsHtml}
        ${attachmentNoticeHtml ? `<div class="notes-card"><h3>Attachment</h3>${attachmentNoticeHtml}</div>` : ''}
        ${noteHtml ? `<div class="notes-card"><h3>Additional Notes</h3>${noteHtml}</div>` : ''}
        ${footerHtml || footerLines.length > 0 ? `<div class="footer">${footerHtml}</div>` : ''}
      </div>
    </div>
  </div>
</body>
</html>`;
};

module.exports = {
  buildInvoiceStyleEmail
};
