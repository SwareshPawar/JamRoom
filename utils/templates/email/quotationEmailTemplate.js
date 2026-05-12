const buildQuotationEmailHtml = ({ quotationPresentation, recipientName = '', individualEmail = false, appLoginUrl }) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;background:#eef2f7;font-family:Arial,sans-serif;color:#1f2937}
  .eq{max-width:760px;margin:0 auto;padding:12px}
  .card{background:#fff;border-radius:16px;overflow:hidden;border:1px solid #dbe5f0}
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
  .two-col{width:100%;border-collapse:collapse;margin:0 0 16px 0}
  .two-col td{vertical-align:top}
  .col-left{padding-right:6px}
  .col-right{padding-left:6px}
  .sc{background:#f8fafc;border:1px solid #dbe5f0;border-radius:12px;padding:14px 16px}
  .tc{background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%);border:1px solid #bfdbfe;border-radius:12px;padding:14px 16px}
  .sc-kicker{font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:#64748b;font-weight:700;margin-bottom:8px}
  .tc-kicker{font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:#1d4ed8;font-weight:700;margin-bottom:8px}
  .sc-title{font-size:17px;font-weight:800;color:#0f172a;margin-bottom:4px}
  .tc-amount{font-size:30px;font-weight:900;color:#1d4ed8;margin-bottom:6px}
  .sc-sub,.tc-sub{font-size:12px;line-height:1.5;color:#475569}
  .cta{background:linear-gradient(135deg,#eff6ff 0%,#f8fafc 100%);border:1px solid #bfdbfe;border-radius:12px;padding:14px 16px;margin:0 0 14px 0}
  .cta-title{font-size:15px;font-weight:800;color:#0f172a;margin-bottom:8px}
  .cta-body{font-size:13px;line-height:1.8;color:#0f172a}
  .terms{background:#fff5f5;border:1px solid #fca5a5;border-left:4px solid #dc2626;border-radius:12px;padding:14px 16px;margin:0 0 12px 0}
  .terms-hd{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#dc2626;font-weight:800;margin-bottom:8px}
  .terms ul{margin:0;padding-left:16px;color:#7f1d1d}
  .terms li{margin:0 0 6px 0;font-size:13px;line-height:1.6}
  .offer{background:linear-gradient(135deg,#fff7ed 0%,#fef3c7 100%);border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;margin:0 0 14px 0}
  .offer-pill{display:inline-block;background:#f59e0b;color:#fff;font-size:10px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;padding:3px 10px;border-radius:20px;margin-bottom:8px}
  .offer-text{font-size:13px;line-height:1.8;color:#78350f;font-weight:600}
  .offer-note{font-size:13px;line-height:1.7;color:#92400e;margin-top:6px}
  .notes-card{background:#fff;border:1px solid #dbe5f0;border-radius:12px;padding:14px 16px;margin:0 0 14px 0}
  .notes-hd{font-size:14px;font-weight:700;color:#0f172a;margin-bottom:6px}
  .footer{font-size:11px;line-height:1.8;color:#64748b;border-top:1px solid #e5e7eb;padding-top:12px}
</style>
</head>
<body>
<div class="eq">
  <div class="card">
    <div class="hdr">
      <table class="hdr-table" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td class="hdr-left">
            ${quotationPresentation.logoImageUrl ? `<img src="${quotationPresentation.logoImageUrl}" alt="Logo" width="48" height="48" style="border-radius:12px;margin-bottom:8px;display:block;">` : ''}
            <h2>${quotationPresentation.studioName}</h2>
            ${quotationPresentation.studioAddress ? `<div class="cl"><strong>Address:</strong> ${quotationPresentation.studioAddress}</div>` : ''}
            <div class="cl"><strong>Phone / WhatsApp:</strong> ${quotationPresentation.studioPhone}</div>
            <div class="cl"><strong>Email:</strong> ${quotationPresentation.studioEmail}</div>
          </td>
          <td class="hdr-right">
            <div class="order-box">
              <div class="order-kicker">Order Summary</div>
              <div class="order-line"><strong>Quotation For:</strong> ${quotationPresentation.serviceTypeLabel}</div>
              <div class="order-line"><strong>Generated On:</strong> ${quotationPresentation.generatedAtLabel}</div>
              ${quotationPresentation.selectedTypeLabels.length > 0 ? `<div class="order-line"><strong>Includes:</strong> ${quotationPresentation.selectedTypeLabels.join(', ')}</div>` : ''}
            </div>
          </td>
        </tr>
      </table>
    </div>
    <div class="body">
      <p style="margin:0 0 10px 0;font-size:15px;color:#0f172a;">Hello${recipientName ? ` ${recipientName}` : ''},</p>
      <p style="margin:0 0 8px 0;font-size:13px;line-height:1.7;color:#475569;">${quotationPresentation.introLine}</p>
      <p style="margin:0 0 16px 0;font-size:13px;line-height:1.7;color:#475569;">The detailed quotation PDF is attached for review and sharing.</p>
      <table class="two-col" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td class="col-left" width="50%">
            <div class="sc">
              <div class="sc-kicker">Service Overview</div>
              <div class="sc-title">${quotationPresentation.serviceTypeLabel}</div>
              <div class="sc-sub">${quotationPresentation.selectedTypeLabels.length > 0 ? `Includes ${quotationPresentation.selectedTypeLabels.join(', ')}.` : ''}</div>
            </div>
          </td>
          <td class="col-right" width="50%">
            <div class="tc">
              <div class="tc-kicker">Estimated Total</div>
              <div class="tc-amount">${quotationPresentation.totalAmountLabel}</div>
              <div class="tc-sub">See attached PDF for full breakdown.</div>
            </div>
          </td>
        </tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:12px;overflow:hidden;margin:0 0 16px 0;background:#0f172a;">
        <tr><td colspan="2" style="padding:14px 20px 8px 20px;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#94a3b8;font-weight:700;font-family:Arial,sans-serif;">Pricing Summary</td></tr>
        <tr>
          <td style="padding:8px 20px;font-size:13px;color:#cbd5e1;font-family:Arial,sans-serif;border-top:1px solid #1e293b;">Subtotal</td>
          <td style="padding:8px 20px;font-size:13px;color:#e2e8f0;font-weight:600;text-align:right;font-family:Arial,sans-serif;border-top:1px solid #1e293b;">${quotationPresentation.subtotalAmountLabel}</td>
        </tr>
        ${quotationPresentation.discountAmountValue > 0
          ? `<tr>
          <td style="padding:8px 20px;font-size:13px;color:#4ade80;font-weight:700;font-family:Arial,sans-serif;border-top:1px solid #1e293b;border-left:3px solid #22c55e;">Discount${quotationPresentation.discountNote ? ` <span style="font-weight:400;color:#86efac;">(${quotationPresentation.discountNote})</span>` : ''}</td>
          <td style="padding:8px 20px;font-size:13px;color:#4ade80;font-weight:700;text-align:right;font-family:Arial,sans-serif;border-top:1px solid #1e293b;">-${quotationPresentation.discountAmountLabel}</td>
        </tr>`
          : ''}
        ${quotationPresentation.taxEnabled
          ? `<tr>
          <td style="padding:8px 20px;font-size:13px;color:#cbd5e1;font-family:Arial,sans-serif;border-top:1px solid #1e293b;">${quotationPresentation.gstDisplayLabel} (${quotationPresentation.gstRateLabel})</td>
          <td style="padding:8px 20px;font-size:13px;color:#e2e8f0;font-weight:600;text-align:right;font-family:Arial,sans-serif;border-top:1px solid #1e293b;">${quotationPresentation.taxAmountLabel}</td>
        </tr>`
          : ''}
        <tr>
          <td style="padding:12px 20px;font-size:15px;color:#ffffff;font-weight:800;font-family:Arial,sans-serif;border-top:2px solid #334155;">Estimated Total</td>
          <td style="padding:12px 20px;font-size:15px;color:#ffffff;font-weight:800;text-align:right;font-family:Arial,sans-serif;border-top:2px solid #334155;">${quotationPresentation.totalAmountLabel}</td>
        </tr>
      </table>
      <div class="cta">
        <div class="cta-title">To confirm your booking</div>
        <div class="cta-body">
          <div>Reply with <strong>CONFIRM</strong>${individualEmail ? ' on this email' : ' on this email thread'}.</div>
          <div>${quotationPresentation.studioWhatsAppLink ? `Or WhatsApp us at <a href="${quotationPresentation.studioWhatsAppLink}" style="color:#1d4ed8;font-weight:700;text-decoration:none;">${quotationPresentation.studioPhone}</a>.` : `Or contact us at <strong>${quotationPresentation.studioPhone}</strong>.`}</div>
        </div>
      </div>
      <div class="terms">
        <div class="terms-hd">&#9888; Booking Terms</div>
        <ul>
          ${quotationPresentation.bookingTerms.map((term) => `<li>${term}</li>`).join('')}
        </ul>
      </div>
      <div class="offer">
        <div class="offer-pill">&#127873; Special Offer</div>
        <div class="offer-text">${quotationPresentation.offerLine}</div>
        <div class="offer-note">Reach out to us for special packages tailored to your project needs.</div>
      </div>
      ${quotationPresentation.quoteNotes ? `<div class="notes-card"><div class="notes-hd">Additional Notes</div><div style="font-size:13px;line-height:1.7;color:#475569;">${quotationPresentation.quoteNotes}</div></div>` : ''}
      <div class="footer">
        <div style="margin:0 0 4px 0;">Visit JamRoom: <a href="${appLoginUrl}" target="_blank" rel="noopener noreferrer" style="color:#1d4ed8;text-decoration:none;">${appLoginUrl}</a></div>
        <div>All rights reserved. ${quotationPresentation.studioName}</div>
      </div>
    </div>
  </div>
</div>
</body>
</html>`;

module.exports = {
  buildQuotationEmailHtml
};
