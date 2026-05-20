const BRAND_LOGO_EMAIL_URL = 'https://jam-room-mu.vercel.app/icons/jamroom-brand-logo.png';

const BOOKING_TERMS = [
  '50% advance payment is required to confirm and block your booking slot.',
  'Additional studio time or scope changes are billed at the applicable quoted rate.',
  'Cancellation within 24 hours of the scheduled session is non-refundable.',
  'All production work includes up to 2 rounds of revisions, provided the revision request is submitted within 25 days of the initial delivery date. Requests received after this period may be subject to additional charges.',
  'This quotation is valid for 7 days, subject to slot and team availability at confirmation.'
];

const buildEbillEmailHtml = ({
  settings,
  booking,
  displayDate,
  totalAmount,
  bookingStatusLabel,
  paymentStatusLabel,
  paymentStatusBorder,
  paymentStatusBackground,
  paymentStatusColor,
  collectedAmount,
  outstandingAmount,
  paymentNarrative,
  discountHighlightHtml,
  payableHighlightHtml,
  subtotal,
  gstEnabled,
  gstDisplayName,
  gstRate,
  taxAmount,
  signedAdjustment,
  adjustmentLabel,
  adjustmentDisplayAmount,
  pdfAttached,
  frontendBookingUrl,
  appLoginUrl,
  timeRangeLabel
}) => {
  const normalizedBookingStatus = String(bookingStatusLabel || '').trim().toUpperCase();
  const bookingStatusBadgeLabel = normalizedBookingStatus || 'CONFIRMED';
  const bookingStatusDescription = normalizedBookingStatus === 'PENDING'
    ? 'Your booking is pending confirmation from our team.'
    : normalizedBookingStatus === 'CONFIRMED'
      ? 'Your booking slot is confirmed and reserved.'
      : normalizedBookingStatus === 'CANCELLED'
        ? 'This booking has been cancelled.'
        : normalizedBookingStatus === 'REJECTED'
          ? 'This booking request was not approved.'
          : 'Your booking status has been updated.';
  const bookingStatusBadgeStyle = normalizedBookingStatus === 'PENDING'
    ? 'border:1px solid #fcd34d;background:#fef3c7;color:#92400e;'
    : normalizedBookingStatus === 'CONFIRMED'
      ? 'border:1px solid #86efac;background:#dcfce7;color:#166534;'
      : normalizedBookingStatus === 'CANCELLED' || normalizedBookingStatus === 'REJECTED'
        ? 'border:1px solid #fca5a5;background:#fee2e2;color:#991b1b;'
        : 'border:1px solid #cbd5e1;background:#e2e8f0;color:#334155;';

    const emailSettings = settings?.emailSettings && typeof settings.emailSettings === 'object'
      ? settings.emailSettings
      : {};

    const bookingTermsTitle = String(emailSettings.bookingTermsTitle || '').trim() || 'Booking Terms';
    const bookingTerms = Array.isArray(emailSettings.bookingTerms) && emailSettings.bookingTerms.length > 0
      ? emailSettings.bookingTerms
      : BOOKING_TERMS;
    const offerBadgeText = String(emailSettings.offerBadgeText || '').trim() || 'Special Offer';
    const offerLine = String(emailSettings.offerLine || '').trim()
      || 'Combo Offer: Book 6 studio hours and get 1 additional studio hour complimentary on confirmation.';
    const offerNote = String(emailSettings.offerNote || '').trim()
      || 'Reach out to us for special packages tailored to your project needs.';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no">
<meta name="x-apple-disable-message-reformatting">
<style>
  :root{color-scheme:light only}
  html{background:#eff5ff;color:#1f2937}
  body{margin:0;padding:0;background:
    radial-gradient(circle at 8% 8%,rgba(34,211,238,0.2) 0%,rgba(34,211,238,0) 38%),
    radial-gradient(circle at 90% 4%,rgba(99,102,241,0.22) 0%,rgba(99,102,241,0) 44%),
    linear-gradient(180deg,#eaf1ff 0%,#eff5ff 40%,#f7fbff 100%);
    font-family:'Trebuchet MS','Segoe UI',Verdana,sans-serif;color:#1f2937;-webkit-text-size-adjust:100%}
  body,table,td,div,p,li,span,strong,a{-webkit-text-size-adjust:100%}
  a[x-apple-data-detectors],u + #body a,#MessageViewBody a{color:inherit !important;text-decoration:inherit !important;font-size:inherit !important;font-family:inherit !important;font-weight:inherit !important;line-height:inherit !important}
  .eq{max-width:660px;margin:0 auto;padding:12px}
  .card{background:#fff;border-radius:22px;overflow:hidden;border:1px solid #d2e2fb;box-shadow:0 18px 40px rgba(30,58,138,0.14)}
  .hdr{background:linear-gradient(135deg,#0b1123 0%,#1d3f72 45%,#0e7490 100%);color:#fff;padding:20px;position:relative}
  .hdr:after{content:'';position:absolute;inset:auto 0 0 0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.35),transparent)}
  .hdr:before{content:'';position:absolute;top:-90px;right:-60px;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,0.27) 0%,rgba(255,255,255,0) 70%)}
  .hdr h2{margin:0 0 6px 0;font-size:20px;color:#fff}
  .hdr .cl{font-size:12px;line-height:1.6;color:rgba(255,255,255,0.88)}
  .order-box{background:rgba(3,9,25,0.28);border:1px solid rgba(191,219,254,0.55);border-radius:14px;padding:10px 12px;margin-top:12px;backdrop-filter:blur(8px)}
  .order-kicker{font-size:10px;letter-spacing:1.6px;text-transform:uppercase;color:#c7d2fe;font-weight:900;margin-bottom:6px}
  .order-line{font-size:12px;line-height:1.7;color:rgba(255,255,255,0.9)}
  .body{padding:16px;background:linear-gradient(180deg,#ffffff 0%,#f8fbff 100%)}
  .sc{background:linear-gradient(140deg,#f8fbff 0%,#eff6ff 100%);border:1px solid #cfe1fb;border-radius:14px;padding:12px 14px;margin-bottom:10px;word-break:break-word;box-shadow:0 8px 20px rgba(14,116,144,0.10)}
  .sc-kicker{font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:#64748b;font-weight:700;margin-bottom:6px}
  .sc-title{font-size:15px;font-weight:800;color:#0f172a;margin-bottom:4px}
  .sc-sub{font-size:12px;line-height:1.6;color:#475569}
  .status-pill{display:inline-block;padding:3px 10px;border-radius:12px;border:1px solid ${paymentStatusBorder};background:${paymentStatusBackground};color:${paymentStatusColor};font-weight:700;white-space:nowrap}
  .confirm-pill{display:inline-block;padding:3px 10px;border-radius:12px;font-weight:700;white-space:nowrap}
  .booking-card,.notes-card,.cta,.totals-card{background:#fff;border:1px solid #d2e2fb;border-radius:14px;padding:12px 14px;margin-bottom:12px;box-shadow:0 10px 24px rgba(30,64,175,0.08)}
  .booking-card h3{color:#1e3a8a;margin:0 0 8px 0;font-size:14px}
  .detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .detail-item{background:linear-gradient(145deg,#f8fbff 0%,#eef6ff 100%);border:1px solid #cfe1fb;border-radius:12px;padding:10px 12px;min-width:0;position:relative;overflow:hidden}
  .detail-item:before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:linear-gradient(180deg,#2563eb 0%,#0ea5e9 100%)}
  .detail-item:nth-child(2n):before{background:linear-gradient(180deg,#7c3aed 0%,#2563eb 100%)}
  .detail-label{display:block;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#64748b;font-weight:800;margin-bottom:4px}
  .detail-value{display:block;font-size:13px;color:#475569;font-weight:600;word-break:break-word;line-height:1.5}
  .totals-card{background:linear-gradient(130deg,#ecfeff 0%,#eff6ff 52%,#eef2ff 100%);border:1px solid #93c5fd}
  .totals-card h3{margin:0 0 8px 0;font-size:13px;color:#1e3a8a;text-transform:uppercase;letter-spacing:1px}
  .totals-table{width:100%;border-collapse:collapse}
  .totals-table td{font-size:13px;color:#0f172a;padding:4px 0;vertical-align:top}
  .totals-table td:last-child{text-align:right;white-space:nowrap}
  .totals-divider{border-top:1px solid #93c5fd}
  .totals-divider td{padding-top:8px!important;font-size:14px!important;font-weight:700}
  .payment-card{background:${paymentStatusBackground};border:1px solid ${paymentStatusBorder};border-radius:12px;padding:12px 14px;margin:0 0 12px 0;word-break:break-word;box-shadow:0 8px 18px rgba(15,23,42,0.08)}
  .payment-card h3{margin:0 0 6px 0;font-size:14px;color:${paymentStatusColor}}
  .cta{background:linear-gradient(135deg,#1d4ed8 0%,#0f766e 100%);border:1px solid #1d4ed8}
  .cta h3{margin:0 0 6px 0;font-size:14px;color:#ffffff}
  .cta p{margin:0;font-size:13px;line-height:1.7;color:#dbeafe}
  .attach{border-radius:10px;padding:10px 12px;margin:0 0 12px 0;font-size:13px;line-height:1.6}
  .attach.ok{background:#e8f5e8;border:1px solid #4caf50;color:#2e7d32}
  .attach.warn{background:#fff3e0;border:1px solid #ffcc02;color:#92400e}
  .terms{background:#fff5f5;border:1px solid #fca5a5;border-left:4px solid #dc2626;border-radius:12px;padding:14px 16px;margin:0 0 12px 0}
  .terms-hd{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#dc2626;font-weight:800;margin-bottom:8px}
  .terms ul{margin:0;padding-left:16px;color:#7f1d1d}
  .terms li{margin:0 0 6px 0;font-size:13px;line-height:1.6}
  .offer{background:linear-gradient(135deg,#fff7ed 0%,#fef3c7 100%);border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;margin:0 0 12px 0}
  .offer-pill{display:inline-block;background:#f59e0b;color:#fff;font-size:10px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;padding:3px 10px;border-radius:20px;margin-bottom:8px}
  .offer-text{font-size:13px;line-height:1.8;color:#78350f;font-weight:600}
  .offer-note{font-size:13px;line-height:1.7;color:#92400e;margin-top:6px}
  .footer{font-size:11px;line-height:1.8;color:#475569;border-top:1px solid #dbe5f0;padding-top:10px;word-break:break-word}
  @media only screen and (max-width: 620px){
    .eq{padding:8px}
    .card{border-radius:18px}
    .hdr{padding:16px}
    .body{padding:14px}
    .hdr-table,.hdr-table tbody,.hdr-table tr,.hdr-table td{display:block;width:100% !important}
    .hdr-left,.hdr-right{display:block;width:100% !important;padding:0 !important}
    .hdr-right{margin-top:12px}
    .detail-grid{grid-template-columns:1fr}
    .status-card-table,.status-card-table tbody,.status-card-table tr,.status-card-table td{display:block;width:100%}
    .status-card-table td{padding:0 !important}
    .status-card-right{margin-top:10px}
    .booking-card,.notes-card,.cta,.totals-card,.payment-card,.sc{border-radius:12px}
    .totals-table td,.totals-table tr{display:block;width:100%}
    .totals-table td:last-child{text-align:left;white-space:normal;padding-top:0}
  }
  @media (prefers-color-scheme: dark){
    html,body,.eq{background:#eff5ff !important;color:#1f2937 !important}
    .card,.body,.booking-card,.notes-card,.cta,.totals-card,.payment-card,.sc,.terms,.offer,.footer,.attach.ok,.attach.warn{color:#1f2937 !important}
    .card,.body,.booking-card,.notes-card,.totals-card,.footer{background-color:#ffffff !important}
    .hdr,.hdr h2,.hdr .cl,.order-kicker,.order-line{color:#ffffff !important}
    .hdr{background:linear-gradient(135deg,#0b1123 0%,#1d3f72 45%,#0e7490 100%) !important}
    .detail-label,.sc-kicker{color:#64748b !important}
    .detail-value,.sc-title,.totals-table td,.booking-card h3{color:#0f172a !important}
    .sc-sub,.footer,.footer a{color:#475569 !important}
    .cta{background:linear-gradient(135deg,#1d4ed8 0%,#0f766e 100%) !important;border-color:#1d4ed8 !important}
    .cta h3{color:#ffffff !important}
    .cta p,.cta a,.cta span,.cta strong{color:#dbeafe !important}
  }
</style>
</head>
<body id="body">
<div class="eq">
  <div class="card">
    <div class="hdr">
      <table class="hdr-table" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">
        <tr>
          <td class="hdr-left" style="vertical-align:top;padding-right:12px;">
            ${settings?.logoDataUri || settings?.logoImageUrl ? `<img src="${settings?.logoDataUri || settings?.logoImageUrl}" alt="${settings?.studioName || 'JamRoom'} Logo" width="48" height="48" style="border-radius:10px;margin-bottom:8px;display:block;max-width:100%;">` : ''}
            <h2 style="margin:0 0 6px 0;font-size:20px;color:#fff;">${settings?.studioName || 'JamRoom'}</h2>
            ${settings?.studioAddress ? `<div class="cl"><strong>Address:</strong> ${settings.studioAddress}</div>` : ''}
            ${settings?.studioPhone ? `<div class="cl"><strong>Phone / WhatsApp:</strong> ${settings.studioPhone}</div>` : ''}
            ${settings?.adminEmails?.[0] ? `<div class="cl"><strong>Email:</strong> ${settings.adminEmails[0]}</div>` : ''}
          </td>
          <td class="hdr-right" style="vertical-align:top;width:200px;min-width:160px;">
            <div class="order-box">
                <div class="order-kicker">Invoice Summary</div>
                <div class="order-line"><strong>Booking Date:</strong> ${displayDate}</div>
                <div class="order-line"><strong>Service:</strong> ${booking.rentalType}</div>
                <div class="order-line"><strong>Total:</strong> ₹${totalAmount.toFixed(2)}</div>
            </div>
          </td>
        </tr>
      </table>
    </div>
    <div class="body">
      <p style="margin:0 0 8px 0;font-size:15px;color:#0f172a;">Dear ${booking.userName},</p>
      <p style="margin:0 0 14px 0;font-size:13px;line-height:1.7;color:#475569;">Thank you for choosing ${settings?.studioName || 'JamRoom'}. Please find your electronic invoice attached for your records.</p>

      <table class="status-card-table" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;margin-bottom:12px;">
        <tr>
          <td class="status-card-left" style="vertical-align:top;padding-right:6px;width:50%;">
            <div class="sc">
              <div class="sc-kicker">Booking Status</div>
              <div class="sc-title"><span class="confirm-pill" style="${bookingStatusBadgeStyle}">${bookingStatusBadgeLabel}</span></div>
              <div class="sc-sub">${bookingStatusDescription}</div>
            </div>
          </td>
          <td class="status-card-right" style="vertical-align:top;padding-left:6px;width:50%;">
            <div class="sc">
              <div class="sc-kicker">Payment Status</div>
              <div class="sc-title"><span class="status-pill">${paymentStatusLabel}</span></div>
              <div class="sc-sub" style="font-size:12px;margin-top:4px;">
                ${paymentStatusLabel === 'PAID'
                  ? `<span style="color:#166534;font-weight:700;">₹${collectedAmount.toFixed(2)} received - fully settled</span>`
                  : paymentStatusLabel === 'PARTIAL'
                  ? `₹${collectedAmount.toFixed(2)} received<br><strong style="color:#8a5700;">₹${outstandingAmount.toFixed(2)} outstanding</strong>`
                  : `<strong style="color:#856404;">₹${outstandingAmount.toFixed(2)} outstanding</strong>`}
              </div>
            </div>
          </td>
        </tr>
      </table>

      <div class="booking-card">
        <h3>Booking Summary</h3>
        <div class="detail-grid">
          <div class="detail-item"><span class="detail-label">Date</span><span class="detail-value">${displayDate}</span></div>
          <div class="detail-item"><span class="detail-label">Time</span><span class="detail-value">${timeRangeLabel}</span></div>
          <div class="detail-item"><span class="detail-label">Service</span><span class="detail-value">${booking.rentalType}</span></div>
          <div class="detail-item"><span class="detail-label">Duration</span><span class="detail-value">${booking.duration} hour(s)</span></div>
          ${booking.paymentReference ? `<div class="detail-item"><span class="detail-label">Payment Ref</span><span class="detail-value">${booking.paymentReference}</span></div>` : ''}
          ${booking.paymentNote ? `<div class="detail-item"><span class="detail-label">Payment Note</span><span class="detail-value">${booking.paymentNote}</span></div>` : ''}
        </div>
      </div>
      ${discountHighlightHtml}
      ${payableHighlightHtml}
      <div class="totals-card">
        <h3>Amount Summary</h3>
        <table class="totals-table" cellpadding="0" cellspacing="0" border="0">
          <tr><td>Subtotal</td><td><strong>₹${subtotal.toFixed(2)}</strong></td></tr>
          ${gstEnabled ? `<tr><td>${gstDisplayName} (${Math.round(gstRate * 100)}%)</td><td><strong>₹${taxAmount.toFixed(2)}</strong></td></tr>` : ''}
          ${signedAdjustment !== 0 ? `<tr><td>${adjustmentLabel}</td><td><strong style="${signedAdjustment < 0 ? 'color:#166534;font-size:15px;font-weight:800;' : ''}">${signedAdjustment < 0 ? '-' : '+'}₹${adjustmentDisplayAmount.toFixed(2)}</strong></td></tr>` : ''}
          <tr class="totals-divider"><td>Total Amount</td><td><strong>₹${totalAmount.toFixed(2)}</strong></td></tr>
          <tr><td style="color:#166534;font-weight:600;">Amount Received</td><td style="text-align:right;white-space:nowrap;"><strong style="color:#166534;">₹${collectedAmount.toFixed(2)}</strong></td></tr>
          <tr><td style="${outstandingAmount > 0 ? 'color:#dc2626;font-weight:700;' : 'color:#166534;'}">Outstanding</td><td style="text-align:right;white-space:nowrap;"><strong style="${outstandingAmount > 0 ? 'color:#dc2626;' : 'color:#166534;'}">₹${outstandingAmount.toFixed(2)}</strong></td></tr>
        </table>
      </div>
      <div class="payment-card">
        <h3>Payment Update: ${paymentStatusLabel}</h3>
        ${paymentNarrative}
      </div>
      <div class="cta">
        <h3>Need assistance?</h3>
        <p>If you need help with payment confirmation, receipt details, or booking updates, please reply to this email and our team will assist you promptly.</p>
      </div>
      ${!pdfAttached
        ? `<div class="attach warn">PDF invoice could not be attached due to a technical issue. You can download your invoice from <a href="${frontendBookingUrl}" style="color:#1d4ed8;font-weight:700;text-decoration:none;">your JamRoom account</a>.</div>`
        : '<div class="attach ok">Your detailed invoice PDF is attached to this email.</div>'}
      <div class="terms">
        <div class="terms-hd">&#9888; ${bookingTermsTitle}</div>
        <ul>
          ${bookingTerms.map((term) => `<li>${term}</li>`).join('')}
        </ul>
      </div>
      <div class="offer">
        <div class="offer-pill">&#127873; ${offerBadgeText}</div>
        <div class="offer-text">${offerLine}</div>
        <div class="offer-note">${offerNote}</div>
      </div>
      <div class="footer">
        <div>Visit JamRoom: <a href="${appLoginUrl}" target="_blank" rel="noopener noreferrer" style="color:#1d4ed8;text-decoration:none;">${appLoginUrl}</a></div>
        <div>${settings?.studioName || 'JamRoom Studio'}${settings?.adminEmails?.[0] ? ` | ${settings.adminEmails[0]}` : ''}</div>
      </div>
    </div>
  </div>
</div>
</body>
</html>`;
};

module.exports = {
  buildEbillEmailHtml
};
