const BRAND_LOGO_EMAIL_URL = 'https://jam-room-mu.vercel.app/icons/jamroom-brand-logo.png';

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
}) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<style>
  :root{color-scheme:light only}
  body{margin:0;padding:0;background:#eef2f7;font-family:Arial,sans-serif;color:#1f2937;-webkit-text-size-adjust:100%}
  .eq{max-width:640px;margin:0 auto;padding:10px}
  .card{background:#fff;border-radius:14px;overflow:hidden;border:1px solid #dbe5f0}
  .hdr{background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);color:#fff;padding:18px}
  .hdr h2{margin:0 0 6px 0;font-size:20px;color:#fff}
  .hdr .cl{font-size:12px;line-height:1.6;color:rgba(255,255,255,0.88)}
  .order-box{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);border-radius:10px;padding:10px 12px;margin-top:12px}
  .order-kicker{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#bfdbfe;font-weight:700;margin-bottom:6px}
  .order-line{font-size:12px;line-height:1.7;color:rgba(255,255,255,0.9)}
  .body{padding:16px}
  .sc{background:#f8fafc;border:1px solid #dbe5f0;border-radius:10px;padding:12px 14px;margin-bottom:10px;word-break:break-word}
  .sc-kicker{font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:#64748b;font-weight:700;margin-bottom:6px}
  .sc-title{font-size:15px;font-weight:800;color:#0f172a;margin-bottom:4px}
  .sc-sub{font-size:12px;line-height:1.6;color:#475569}
  .status-pill{display:inline-block;padding:3px 10px;border-radius:12px;border:1px solid ${paymentStatusBorder};background:${paymentStatusBackground};color:${paymentStatusColor};font-weight:700;white-space:nowrap}
  .confirm-pill{display:inline-block;padding:3px 10px;border-radius:12px;border:1px solid #86efac;background:#dcfce7;color:#166534;font-weight:700;white-space:nowrap}
  .booking-card,.notes-card{background:#fff;border:1px solid #dbe5f0;border-radius:10px;padding:12px 14px;margin-bottom:12px}
  .booking-card h3{color:#1d4ed8;margin:0 0 8px 0;font-size:14px}
  .detail-table{width:100%;border-collapse:collapse}
  .detail-table td{padding:6px 0;border-bottom:1px solid #e5e7eb;font-size:13px;word-break:break-word}
  .detail-table td:first-child{font-weight:700;color:#1f2937;width:42%}
  .detail-table td:last-child{color:#475569}
  .totals-card{background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%);border:1px solid #bfdbfe;border-radius:10px;padding:12px 14px;margin:0 0 12px 0}
  .totals-card h3{margin:0 0 8px 0;font-size:13px;color:#1d4ed8;text-transform:uppercase;letter-spacing:1px}
  .totals-table{width:100%;border-collapse:collapse}
  .totals-table td{font-size:13px;color:#0f172a;padding:4px 0;vertical-align:top}
  .totals-table td:last-child{text-align:right;white-space:nowrap}
  .totals-divider{border-top:1px solid #bfdbfe}
  .totals-divider td{padding-top:8px!important;font-size:14px!important;font-weight:700}
  .payment-card{background:${paymentStatusBackground};border:1px solid ${paymentStatusBorder};border-radius:10px;padding:12px 14px;margin:0 0 12px 0;word-break:break-word}
  .payment-card h3{margin:0 0 6px 0;font-size:14px;color:${paymentStatusColor}}
  .cta{background:linear-gradient(135deg,#eff6ff 0%,#f8fafc 100%);border:1px solid #bfdbfe;border-radius:10px;padding:12px 14px;margin:0 0 12px 0}
  .cta h3{margin:0 0 6px 0;font-size:14px;color:#0f172a}
  .cta p{margin:0;font-size:13px;line-height:1.7;color:#475569}
  .attach{border-radius:10px;padding:10px 12px;margin:0 0 12px 0;font-size:13px;line-height:1.6}
  .attach.ok{background:#e8f5e8;border:1px solid #4caf50;color:#2e7d32}
  .attach.warn{background:#fff3e0;border:1px solid #ffcc02;color:#92400e}
  .footer{font-size:11px;line-height:1.8;color:#64748b;border-top:1px solid #e5e7eb;padding-top:10px;word-break:break-word}
</style>
</head>
<body>
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
            <div class="cl"><strong>Email:</strong> ${settings?.adminEmails?.[0] || 'admin@jamroom.com'}</div>
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
              <div class="sc-title"><span class="confirm-pill">${bookingStatusLabel}</span></div>
              <div class="sc-sub">Your booking slot is confirmed and reserved.</div>
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
        <table class="detail-table">
          <tr><td>Date</td><td>${displayDate}</td></tr>
          <tr><td>Time</td><td>${timeRangeLabel}</td></tr>
          <tr><td>Service</td><td>${booking.rentalType}</td></tr>
          <tr><td>Duration</td><td>${booking.duration} hour(s)</td></tr>
          ${booking.paymentReference ? `<tr><td>Payment Ref</td><td>${booking.paymentReference}</td></tr>` : ''}
          ${booking.paymentNote ? `<tr><td>Payment Note</td><td>${booking.paymentNote}</td></tr>` : ''}
        </table>
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
      <div class="footer">
        <div>Visit JamRoom: <a href="${appLoginUrl}" target="_blank" rel="noopener noreferrer" style="color:#1d4ed8;text-decoration:none;">${appLoginUrl}</a></div>
        <div>${settings?.studioName || 'JamRoom Studio'} | ${settings?.adminEmails?.[0] || 'admin@jamroom.com'}</div>
      </div>
    </div>
  </div>
</div>
</body>
</html>`;

module.exports = {
  buildEbillEmailHtml
};
