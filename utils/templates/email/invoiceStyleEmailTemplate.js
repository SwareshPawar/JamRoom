const DEFAULT_BRAND_LOGO_URL = 'https://jam-room-mu.vercel.app/icons/jamroom-brand-logo.png';

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const buildSummaryItemsHtml = (rows = []) => rows.map((row) => {
  if (!row) return '';
  if (typeof row === 'string') return row;
  const label = escapeHtml(row.label || '');
  const value = row.html ? row.html : escapeHtml(row.value || '');
  return `
    <div class="summary-item">
      <span class="summary-label">${label}</span>
      <span class="summary-value">${value}</span>
    </div>
  `;
}).join('');

const buildBulletListHtml = (items = [], itemClass = 'list-item') => items
  .filter(Boolean)
  .map((item) => `<li class="${itemClass}">${item}</li>`)
  .join('');

const DEFAULT_BOOKING_TERMS = [
  '50% advance payment is required to confirm and block your booking slot.',
  'Additional studio time or scope changes are billed at the applicable quoted rate.',
  'Cancellation within 24 hours of the scheduled session is non-refundable.',
  'All production work includes up to 2 rounds of revisions, provided the revision request is submitted within 25 days of the initial delivery date. Requests received after this period may be subject to additional charges.',
  'This quotation is valid for 7 days, subject to slot and team availability at confirmation.'
];

const DEFAULT_OFFER_LINE = 'Combo Offer: Book 6 studio hours and get 1 additional studio hour complimentary on confirmation.';

const isLikelyBookingEmail = ({ title = '', label = '', summaryTitle = '' }) => {
  const fingerprint = `${title} ${label} ${summaryTitle}`.toLowerCase();
  return /(booking|slot|class|ebill|invoice|open event|payment|cancel)/.test(fingerprint);
};

const buildInvoiceStyleEmail = ({
  brandName = 'JamRoom',
  brandSubtitle = '',
  studioAddress = '',
  studioPhone = '',
  studioEmail = '',
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
  noteHtml = '',
  showBookingFooter,
  bookingFooterTermsTitle = '',
  bookingFooterTerms = [],
  bookingFooterOfferBadgeText = '',
  bookingFooterOfferLine = '',
  bookingFooterOfferNote = ''
}) => {
  const intro = Array.isArray(introLines) && introLines.length > 0
    ? introLines.filter(Boolean).map((line) => `<p>${line}</p>`).join('')
    : '';
  const summaryItemsHtml = buildSummaryItemsHtml(summaryRows);
  const sections = Array.isArray(sectionsHtml) ? sectionsHtml.filter(Boolean).join('') : '';
  const termsList = Array.isArray(terms) ? terms.filter(Boolean) : [];
  const shouldRenderBookingFooter = typeof showBookingFooter === 'boolean'
    ? showBookingFooter
    : isLikelyBookingEmail({ title, label, summaryTitle });
  const footerTermsTitle = String(bookingFooterTermsTitle || '').trim() || termsTitle || 'Booking Terms';
  const footerTerms = Array.isArray(bookingFooterTerms) && bookingFooterTerms.length > 0
    ? bookingFooterTerms
    : (termsList.length > 0 ? termsList : DEFAULT_BOOKING_TERMS);
  const offerBadgeText = String(bookingFooterOfferBadgeText || '').trim() || 'Special Offer';
  const offerLine = String(bookingFooterOfferLine || '').trim() || DEFAULT_OFFER_LINE;
  const offerNote = String(bookingFooterOfferNote || '').trim() || 'Reach out to us for special packages tailored to your project needs.';
  const footerHtml = Array.isArray(footerLines) && footerLines.length > 0
    ? footerLines.filter(Boolean).map((line) => `<div>${line}</div>`).join('')
    : '';
  const ctaBlock = ctaHtml ? `<div class="card section-card cta-card"><h3>${ctaTitle || 'Next Steps'}</h3>${ctaHtml}</div>` : '';
  const heroLines = [greeting ? `<h3>${greeting}</h3>` : '', intro].filter(Boolean).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<style>
  :root{color-scheme:light only}
  body{margin:0;padding:0;background:
    radial-gradient(circle at 15% 15%,rgba(56,189,248,0.22) 0%,rgba(56,189,248,0) 46%),
    radial-gradient(circle at 85% 5%,rgba(129,140,248,0.22) 0%,rgba(129,140,248,0) 44%),
    linear-gradient(180deg,#e9f1ff 0%,#eef5ff 36%,#f7fbff 100%);
    font-family:'Trebuchet MS','Segoe UI',Verdana,sans-serif;color:#1f2937;-webkit-text-size-adjust:100%}
  .eq{max-width:760px;margin:0 auto;padding:14px}
  .card{background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #cfdef7;box-shadow:0 20px 46px rgba(15,23,42,0.16)}
  .hdr{background:linear-gradient(135deg,#0b1123 0%,#1d3f72 45%,#0f7ec0 100%);color:#fff;padding:22px;position:relative}
  .hdr:after{content:'';position:absolute;inset:auto 0 0 0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.35),transparent)}
  .hdr:before{content:'';position:absolute;top:-90px;right:-50px;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,0.28) 0%,rgba(255,255,255,0) 70%)}
  .hdr-table{width:100%;border-collapse:collapse}
  .hdr-left{vertical-align:top;padding-right:14px}
  .hdr-right{vertical-align:top;width:210px}
  .hdr h2{margin:0 0 8px 0;font-size:24px;color:#fff;letter-spacing:0.2px}
  .hdr .cl{font-size:12px;line-height:1.6;color:rgba(255,255,255,0.88)}
  .order-box{background:rgba(3,9,25,0.28);border:1px solid rgba(191,219,254,0.55);border-radius:16px;padding:12px 14px;backdrop-filter:blur(8px)}
  .order-kicker{font-size:10px;letter-spacing:1.6px;text-transform:uppercase;color:#c7d2fe;font-weight:900;margin-bottom:8px}
  .order-line{font-size:12px;line-height:1.7;color:rgba(255,255,255,0.9)}
  .body{padding:20px;background:linear-gradient(180deg,#ffffff 0%,#f8fbff 100%)}
  .hero{background:linear-gradient(120deg,#e0f2fe 0%,#eef2ff 54%,#f8fafc 100%);border:1px solid #93c5fd;border-radius:18px;padding:16px 18px;margin:0 0 14px 0;box-shadow:0 10px 22px rgba(14,116,144,0.10)}
  .hero h3{margin:0 0 6px 0;font-size:17px;color:#0f172a}
  .hero p{margin:0 0 10px 0;font-size:13px;line-height:1.7;color:#334155}
  .hero p:last-child{margin-bottom:0}
  .section-card{background:#fff;border:1px solid #d5e3f8;border-radius:16px;padding:14px 16px;margin:0 0 14px 0;box-shadow:0 10px 24px rgba(30,64,175,0.08)}
  .section-card h3{margin:0 0 8px 0;font-size:15px;color:#0f172a}
  .summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  .summary-item{background:linear-gradient(145deg,#f8fbff 0%,#eef6ff 100%);border:1px solid #cfe1fb;border-radius:14px;padding:10px 12px;min-width:0;position:relative;overflow:hidden}
  .summary-item:before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:linear-gradient(180deg,#2563eb 0%,#0ea5e9 100%)}
  .summary-item:nth-child(3n+2):before{background:linear-gradient(180deg,#7c3aed 0%,#2563eb 100%)}
  .summary-item:nth-child(3n+3):before{background:linear-gradient(180deg,#0891b2 0%,#14b8a6 100%)}
  .summary-label{display:block;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#64748b;font-weight:800;margin-bottom:6px}
  .summary-value{display:block;font-size:14px;font-weight:700;color:#0f172a;word-break:break-word;line-height:1.5;padding-left:2px}
  .highlight{background:linear-gradient(130deg,#ecfeff 0%,#eff6ff 50%,#eef2ff 100%);border:1px solid #93c5fd;border-radius:14px;padding:14px 16px;margin:0 0 14px 0}
  .highlight h3{margin:0 0 6px 0;font-size:15px;color:#0f172a}
  .highlight p{margin:0;font-size:13px;line-height:1.7;color:#1e3a5f}
  .summary-badge{display:inline-block;background:#dbeafe;color:#1d4ed8;font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;padding:3px 9px;border-radius:999px;border:1px solid #93c5fd}
  .detail-list{margin:0;padding-left:18px;color:#475569}
  .detail-list li{margin:0 0 6px 0;font-size:13px;line-height:1.6}
  .terms-card{background:linear-gradient(135deg,#fff5f5 0%,#fef2f2 100%);border:1px solid #fca5a5;border-left:4px solid #dc2626}
  .terms-hd{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#dc2626;font-weight:800;margin-bottom:8px}
  .terms-card ul{margin:0;padding-left:18px;color:#7f1d1d}
  .terms-card li{margin:0 0 5px 0;font-size:12px;line-height:1.55}
  .terms{background:#fff5f5;border:1px solid #fca5a5;border-left:4px solid #dc2626;border-radius:14px;padding:14px 16px;margin:0 0 12px 0}
  .terms ul{margin:0;padding-left:16px;color:#7f1d1d}
  .terms li{margin:0 0 6px 0;font-size:13px;line-height:1.6}
  .offer{background:linear-gradient(135deg,#fff7ed 0%,#fef3c7 100%);border:2px solid #f59e0b;border-radius:14px;padding:14px 16px;margin:0 0 14px 0}
  .offer-pill{display:inline-block;background:#f59e0b;color:#fff;font-size:10px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;padding:3px 10px;border-radius:20px;margin-bottom:8px}
  .offer-text{font-size:13px;line-height:1.8;color:#78350f;font-weight:600}
  .offer-note{font-size:13px;line-height:1.7;color:#92400e;margin-top:6px}
  .cta-card{background:linear-gradient(135deg,#1d4ed8 0%,#0f766e 100%);border:1px solid #1d4ed8;color:#eff6ff}
  .cta-card h3{margin:0 0 6px 0;font-size:15px;color:#0f172a}
  .cta-card h3,.cta-card h4,.cta-card strong{color:#ffffff !important}
  .cta-card p,.cta-card li,.cta-card span,.cta-card div,.cta-card a{color:#dbeafe !important}
  .cta-card a{font-weight:700;text-decoration:underline}
  .footer{font-size:11px;line-height:1.8;color:#475569;border-top:1px solid #dbe5f0;padding-top:12px;word-break:break-word}
  .footer a{color:#1d4ed8;text-decoration:none;font-weight:700}
  @media only screen and (max-width: 620px){
    .eq{padding:8px}
    .card{border-radius:18px}
    .hdr{padding:16px}
    .hdr-left,.hdr-right{display:block;width:100% !important;padding:0}
    .hdr-right{margin-top:12px}
    .body{padding:14px}
    .hero,.section-card,.summary-item{border-radius:12px}
    .summary-label{font-size:9px}
    .summary-value{font-size:13px}
    .summary-grid{grid-template-columns:1fr}
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
                  <td style="vertical-align:middle;padding-right:12px;">
                    <img src="${logoUrl}" alt="${brandName} Logo" width="48" height="48" style="display:block;width:48px;height:48px;border-radius:12px;object-fit:contain;background:#ffffff;padding:4px;border:1px solid rgba(255,255,255,0.3);" />
                  </td>
                  <td style="vertical-align:middle;">
                    <h2 style="margin:0;font-size:24px;color:#fff;">${brandName}</h2>
                  </td>
                </tr>
              </table>
              ${studioAddress ? `<div class="cl"><strong>Address:</strong> ${studioAddress}</div>` : ''}
              ${studioPhone ? `<div class="cl"><strong>Phone / WhatsApp:</strong> ${studioPhone}</div>` : ''}
              ${studioEmail ? `<div class="cl"><strong>Email:</strong> ${studioEmail}</div>` : ''}
              ${brandSubtitle ? `<div class="cl">${brandSubtitle}</div>` : ''}
            </td>
            <td class="hdr-right">
              <div class="order-box">
                <div class="order-kicker">${title}</div>
                ${label ? `<div class="order-line"><strong>Status:</strong> ${label}</div>` : ''}
                ${badgeLabel ? `<div class="order-line"><strong>${badgeLabel}:</strong> ${badgeValue}</div>` : ''}
                ${linkUrl ? `<div class="order-line"><strong>${linkLabel || 'Link'}:</strong> <span style="word-break:break-all;">${linkUrl}</span></div>` : ''}
              </div>
            </td>
          </tr>
        </table>
      </div>
      <div class="body">
        ${heroLines ? `<div class="hero">${heroLines}</div>` : ''}
        ${highlightHtml ? `<div class="highlight">${highlightHtml}</div>` : ''}
        ${summaryItemsHtml ? `
          <div class="section-card">
            <h3>${summaryTitle}</h3>
            <div class="summary-grid">${summaryItemsHtml}</div>
          </div>
        ` : ''}
        ${sections}
        ${ctaBlock}
        ${attachmentNoticeHtml ? `<div class="section-card"><h3>Attachment</h3>${attachmentNoticeHtml}</div>` : ''}
        ${noteHtml ? `<div class="section-card"><h3>Additional Notes</h3>${noteHtml}</div>` : ''}
        ${shouldRenderBookingFooter ? `
          <div class="terms">
            <div class="terms-hd">&#9888; ${escapeHtml(footerTermsTitle)}</div>
            <ul>${buildBulletListHtml(footerTerms)}</ul>
          </div>
          <div class="offer">
            <div class="offer-pill">&#127873; ${escapeHtml(offerBadgeText)}</div>
            <div class="offer-text">${escapeHtml(offerLine)}</div>
            <div class="offer-note">${escapeHtml(offerNote)}</div>
          </div>
        ` : ''}
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
