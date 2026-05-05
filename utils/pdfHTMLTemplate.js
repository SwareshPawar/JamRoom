/**
 * Unified PDF HTML Template Generator
 * This generates consistent HTML for both server-side (puppeteer) and client-side (html2pdf) PDF generation
 */

const { buildServiceGroupSummary } = require('./shared/quotationBilling');

/**
 * Format time from 24-hour to 12-hour format
 * @param {string} time24 - Time in 24-hour format (e.g., "14:30")
 * @returns {string} Time in 12-hour format (e.g., "2:30 PM")
 */
const formatTime12Hour = (time24) => {
    if (!time24) return '';
    
    // Parse time (handle formats like "14:30", "2:30", "14:30:00")
    const timeParts = time24.split(':');
    if (timeParts.length < 2) return time24; // Invalid format
    
    let hours = parseInt(timeParts[0]);
    const minutes = timeParts[1];
    
    if (isNaN(hours)) return time24; // Invalid hours
    
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 should be 12
    
    return `${hours}:${minutes} ${ampm}`;
};

/**
 * Calculate pricing breakdown with configurable GST
 * @param {Object} booking - Booking object
 * @param {Object} settings - Admin settings with GST config
 * @returns {Object} Price breakdown { subtotal, taxAmount, adjustmentValue, adjustmentLabel, adjustmentNote, totalAmount }
 */
const calculatePricing = (booking, settings = null) => {
    let subtotal;
    let taxAmount;

    const fallbackAdjustmentType = Number(booking?.priceAdjustmentValue || 0) < 0
        ? 'discount'
        : Number(booking?.priceAdjustmentValue || 0) > 0
            ? 'surcharge'
            : 'none';

    const adjustmentType = ['none', 'discount', 'surcharge'].includes(String(booking?.priceAdjustmentType || '').toLowerCase())
        ? String(booking.priceAdjustmentType).toLowerCase()
        : fallbackAdjustmentType;

    const adjustmentAmount = Number.isFinite(Number(booking?.priceAdjustmentAmount))
        ? Number(booking.priceAdjustmentAmount)
        : Math.abs(Number(booking?.priceAdjustmentValue || 0));

    const adjustmentValue = Number.isFinite(Number(booking?.priceAdjustmentValue))
        ? Number(booking.priceAdjustmentValue)
        : (adjustmentType === 'discount' ? -adjustmentAmount : adjustmentType === 'surcharge' ? adjustmentAmount : 0);

    const adjustmentLabel = adjustmentValue < 0 ? 'Discount' : 'Surcharge';
    const adjustmentNote = String(booking?.priceAdjustmentNote || '').trim();
    
    if (booking.subtotal !== undefined && booking.taxAmount !== undefined) {
        // Use the amounts calculated during booking creation
        subtotal = booking.subtotal;
        taxAmount = booking.taxAmount;
        // booking.price should already include tax and adjustment when stored.
        // Keep fallback recomputation for compatibility with older records.
        totalAmount = Number.isFinite(Number(booking.price))
            ? Number(booking.price)
            : (subtotal + taxAmount + adjustmentValue);
    } else {
        // Calculate from booking price
        subtotal = booking.price;
        
        // Use GST configuration from settings
        const gstEnabled = settings?.gstConfig?.enabled || false;
        const taxRate = gstEnabled ? (settings.gstConfig.rate || 0.18) : 0;
        
        taxAmount = gstEnabled ? Math.round(subtotal * taxRate) : 0;
        totalAmount = subtotal + taxAmount + adjustmentValue;
    }
    
    return {
        subtotal,
        taxAmount,
        adjustmentValue,
        adjustmentLabel,
        adjustmentNote,
        totalAmount
    };
};

/**
 * Generate unified PDF HTML template
 * @param {Object} booking - Booking data
 * @param {Object} settings - Admin settings
 * @returns {string} Complete HTML content
 */
const generateUnifiedPDFHTML = (booking, settings) => {
    const normalizeRentalType = (value) => {
        const raw = String(value || 'inhouse').trim().toLowerCase();
        const compact = raw.replace(/[\s_-]+/g, '');
        if (compact === 'perday') return 'perday';
        if (compact === 'persession' || compact === 'session') return 'persession';
        if (compact === 'pertrack' || compact === 'track') return 'pertrack';
        return 'inhouse';
    };

    const bookingDate = new Date(booking.date);
    const normalizedBookingRentalType = normalizeRentalType(booking.rentalType);
    const isPerday = booking.bookingMode === 'perday' || normalizedBookingRentalType === 'perday';
    const isPerSessionBooking = normalizedBookingRentalType === 'persession';
    const isPerTrackBooking = normalizedBookingRentalType === 'pertrack';
    const perDayDays = Math.max(1, Number(booking.perDayDays) || 1);
    const perDayStartLabel = booking.perDayStartDate ? new Date(booking.perDayStartDate).toLocaleDateString('en-IN') : bookingDate.toLocaleDateString('en-IN');
    const perDayEndLabel = booking.perDayEndDate ? new Date(booking.perDayEndDate).toLocaleDateString('en-IN') : bookingDate.toLocaleDateString('en-IN');
    const perDayTimeRangeLabel = `${formatTime12Hour(booking.startTime)} - ${formatTime12Hour(booking.endTime)}`;
    const { subtotal, taxAmount, adjustmentValue, adjustmentLabel, adjustmentNote, totalAmount } = calculatePricing(booking, settings);
    const paymentStatus = String(booking?.paymentStatus || 'PENDING').toUpperCase();
    const amountPaidRaw = Math.max(0, Number(booking?.amountPaid) || 0);
    const amountReceived = paymentStatus === 'PAID'
        ? Math.max(0, Number(totalAmount) || 0)
        : paymentStatus === 'PARTIAL'
            ? Math.min(Math.max(0, Number(totalAmount) || 0), amountPaidRaw)
            : 0;
    const outstandingAmount = Math.max(0, Number(totalAmount || 0) - amountReceived);
    const safeDuration = Math.max(1, Number(booking.duration) || 1);

    const billingCalculation = {
        inhouseDurationHours: isPerday ? 0 : safeDuration,
        perdayDays: perDayDays
    };

    const groupedServices = (booking.rentals && booking.rentals.length > 0)
        ? buildServiceGroupSummary(booking.rentals, billingCalculation)
        : [];

    const gstEnabled = settings?.gstConfig?.enabled || false;
    const gstDisplayName = settings?.gstConfig?.displayName || 'GST';
    const gstRate = gstEnabled ? (settings?.gstConfig?.rate || 0.18) : 0;
    const gstRow = (gstEnabled && taxAmount > 0)
        ? `<div class="total-row"><span>${gstDisplayName} (${Math.round(gstRate * 100)}%)</span><strong>₹${taxAmount.toFixed(2)}</strong></div>`
        : '';
    const adjustmentRow = adjustmentValue !== 0
        ? `<div class="total-row"><span>${adjustmentLabel}${adjustmentNote ? ` (${adjustmentNote})` : ''}</span><strong>${adjustmentValue < 0 ? '-' : '+'}₹${Math.abs(adjustmentValue).toFixed(2)}</strong></div>`
        : '';
    const paymentStatusClass = paymentStatus === 'PAID' ? 'paid' : paymentStatus === 'PARTIAL' ? 'partial' : 'pending';
    const paymentMessage = paymentStatus === 'PAID'
        ? `Payment has been received in full. Thank you — your booking account is fully settled.`
        : paymentStatus === 'PARTIAL'
            ? `Partial payment recorded. Kindly settle the remaining balance of ₹${outstandingAmount.toFixed(2)} before your scheduled slot.`
            : `Payment is currently pending. Kindly complete the payment of ₹${outstandingAmount.toFixed(2)} before your scheduled studio slot.`;

    const serviceGroupSections = (booking.rentals && booking.rentals.length > 0)
        ? groupedServices.map((group) => {
            const groupSubtotal = Number(group.subtotal || 0);
            const rows = group.items.map((item) => {
                const rentalType = normalizeRentalType(item.rentalType || 'inhouse');
                const bookingMeta = rentalType === 'perday'
                    ? `${perDayStartLabel} ${formatTime12Hour(booking.startTime)} to ${perDayEndLabel} ${formatTime12Hour(booking.endTime)}`
                    : `${bookingDate.toLocaleDateString('en-IN')} (${formatTime12Hour(booking.startTime)} – ${formatTime12Hour(booking.endTime)})`;
                const itemRateLabel = rentalType === 'perday'
                    ? `₹${item.rate}/day`
                    : (rentalType === 'persession' ? `₹${item.rate}/session` : (rentalType === 'pertrack' ? `₹${item.rate}/track` : `₹${item.rate}/hr`));
                return `
                <div class="service-row">
                    <div class="service-copy">
                        <div class="service-title">${item.title}</div>
                        <div class="service-desc">${item.description || 'Studio rental service'} &bull; ${bookingMeta}</div>
                    </div>
                    <div class="service-meta">
                        <div class="service-meta-top">${itemRateLabel}${item.quantity > 1 ? ` x ${item.quantity}` : ''}</div>
                        <div class="service-meta-sub">${item.billingLabel}</div>
                    </div>
                    <div class="service-amount">₹${Number(item.amount || 0).toFixed(2)}</div>
                </div>`;
            }).join('');
            return `
            <section class="service-group">
                <div class="service-group-header">
                    <div>
                        <h3>${group.icon || ''} ${group.title}</h3>
                        <p>${group.subtitle || 'Studio booking services'}</p>
                    </div>
                    <div class="service-group-subtotal">₹${groupSubtotal.toFixed(2)}</div>
                </div>
                <div class="service-group-body">${rows}</div>
            </section>`;
        }).join('')
        : `
        <section class="service-group">
            <div class="service-group-header">
                <div>
                    <h3>🎵 ${booking.rentalType || 'JamRoom Booking'}</h3>
                    <p>Studio booking for ${isPerday ? `${perDayStartLabel} to ${perDayEndLabel}` : bookingDate.toLocaleDateString('en-IN')}</p>
                </div>
                <div class="service-group-subtotal">₹${subtotal.toFixed(2)}</div>
            </div>
            <div class="service-group-body">
                <div class="service-row">
                    <div class="service-copy">
                        <div class="service-title">${booking.rentalType || 'Studio Session'}</div>
                        <div class="service-desc">${isPerday ? `${perDayDays} day(s) · ${perDayTimeRangeLabel}` : `${formatTime12Hour(booking.startTime)} – ${formatTime12Hour(booking.endTime)}`}${booking.notes ? ` · ${booking.notes}` : ''}</div>
                    </div>
                    <div class="service-meta">
                        <div class="service-meta-top">${isPerSessionBooking ? `₹${subtotal.toFixed(2)}/session` : (isPerTrackBooking ? `₹${subtotal.toFixed(2)}/track` : `₹${(subtotal / safeDuration).toFixed(2)}/hr`)}</div>
                        <div class="service-meta-sub">${isPerSessionBooking ? 'Per session' : (isPerTrackBooking ? 'Per track' : `Per hour x ${safeDuration}`)}</div>
                    </div>
                    <div class="service-amount">₹${subtotal.toFixed(2)}</div>
                </div>
            </div>
        </section>`;

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${settings?.studioName || 'JamRoom'} Invoice</title>
    <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:Arial,sans-serif;color:#142033;background:#eef2f7;padding:26px}
        .sheet{max-width:820px;margin:0 auto;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 18px 44px rgba(15,23,42,0.14)}
        .topbar{background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);color:#ffffff;padding:28px 30px 24px}
        .hdr{display:flex;justify-content:space-between;gap:24px;align-items:flex-start}
        .brand{max-width:62%}
        .brand h1{font-size:26px;font-weight:800;margin-bottom:6px;color:#fff;line-height:1.1}
        .brand .tagline{font-size:12px;color:rgba(255,255,255,0.72);margin-bottom:10px;letter-spacing:0.5px}
        .brand .cl{font-size:12px;line-height:1.6;color:rgba(255,255,255,0.88)}
        .invoice-panel{min-width:220px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:18px;padding:18px 18px 16px}
        .invoice-panel .kicker{font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:#bfdbfe;margin-bottom:8px;font-weight:700}
        .invoice-panel h2{font-size:30px;line-height:1;margin-bottom:12px;color:#fff;font-weight:800}
        .invoice-panel .meta-line{font-size:12px;line-height:1.6;color:rgba(255,255,255,0.88)}
        .body{padding:28px 30px 30px}
        .bill-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;break-inside:avoid;page-break-inside:avoid}
        .info-card{background:#f8fafc;border:1px solid #dbe5f0;border-radius:18px;padding:16px 18px;break-inside:avoid;page-break-inside:avoid}
        .info-label{font-size:11px;text-transform:uppercase;letter-spacing:1.1px;color:#64748b;font-weight:700;margin-bottom:10px}
        .info-name{font-size:18px;font-weight:700;color:#0f172a;margin-bottom:4px}
        .info-email{font-size:13px;color:#64748b;margin-bottom:6px}
        .info-row{font-size:13px;color:#475569;line-height:1.8}
        .info-row strong{color:#0f172a}
        .section-title{font-size:12px;text-transform:uppercase;letter-spacing:1.2px;color:#64748b;font-weight:800;margin:20px 0 12px}
        .status-badge{display:inline-block;padding:5px 14px;border-radius:999px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px}
        .status-confirmed{background:#dcfce7;color:#166534;border:1px solid #86efac}
        .status-pending{background:#fff3cd;color:#856404;border:1px solid #ffeaa7}
        .status-paid{background:#d4edda;color:#155724;border:1px solid #c3e6cb}
        .status-partial{background:#fff4d6;color:#8a5700;border:1px solid #ffd166}
        .status-refunded{background:#e2e3e5;color:#383d41;border:1px solid #d6d8db}
        .status-cancelled{background:#f8d7da;color:#721c24;border:1px solid #f5c6cb}
        .service-group{border:1px solid #dbe5f0;border-radius:20px;overflow:visible;margin-bottom:16px;background:#fff;break-inside:auto;page-break-inside:auto}
        .service-group-header{display:flex;justify-content:space-between;gap:16px;align-items:center;background:linear-gradient(135deg,#0f172a 0%,#1e2f57 100%);padding:16px 18px;color:#fff;break-after:avoid;page-break-after:avoid}
        .service-group-header h3{font-size:18px;margin-bottom:4px;color:#fff;font-weight:700}
        .service-group-header p{font-size:12px;color:rgba(255,255,255,0.78);line-height:1.5;margin:0}
        .service-group-subtotal{font-size:14px;font-weight:800;white-space:nowrap;background:rgba(255,255,255,0.12);border-radius:999px;padding:8px 12px;color:#fff;flex-shrink:0}
        .service-group-body{padding:6px 18px 8px;break-inside:auto;page-break-inside:auto}
        .service-row{display:grid;grid-template-columns:1.5fr 0.7fr 0.45fr;gap:14px;align-items:center;padding:14px 0;border-bottom:1px solid #edf2f7;break-inside:avoid;page-break-inside:avoid}
        .service-row:last-child{border-bottom:0}
        .service-copy{}
        .service-title{font-size:14px;font-weight:700;color:#0f172a;margin-bottom:4px}
        .service-desc{font-size:12px;line-height:1.5;color:#64748b}
        .service-meta{text-align:right}
        .service-meta-top{font-size:13px;font-weight:700;color:#0f172a}
        .service-meta-sub{font-size:11px;color:#64748b;margin-top:4px}
        .service-amount{text-align:right;font-size:14px;font-weight:800;color:#0f172a}
        .totals-card{background:#0f172a;color:#fff;border-radius:22px;padding:20px 22px;margin:18px 0;break-inside:avoid;page-break-inside:avoid}
        .totals-card h3{font-size:14px;text-transform:uppercase;letter-spacing:1.2px;color:#cbd5e1;margin-bottom:12px}
        .total-row{display:flex;justify-content:space-between;gap:16px;padding:6px 0;font-size:14px;color:#e2e8f0}
        .grand-total{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-top:12px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.14)}
        .grand-total span{font-size:13px;text-transform:uppercase;letter-spacing:1.2px;color:#93c5fd;font-weight:700}
        .grand-total strong{font-size:32px;color:#ffffff;line-height:1}
        .received-row{display:flex;justify-content:space-between;gap:16px;padding:8px 0 4px;font-size:14px;color:#86efac;border-top:1px solid rgba(255,255,255,0.1);margin-top:10px}
        .due-row{display:flex;justify-content:space-between;gap:16px;padding:4px 0;font-size:14px;color:#fca5a5;font-weight:700}
        .payment-card{border-radius:18px;padding:16px 18px;margin:0 0 18px;break-inside:avoid;page-break-inside:avoid}
        .payment-card.paid{background:#dcfce7;border:1px solid #86efac}
        .payment-card.partial{background:#fff4d6;border:1px solid #ffd166}
        .payment-card.pending{background:#fff3cd;border:1px solid #ffeaa7}
        .payment-kicker{font-size:11px;letter-spacing:1.1px;text-transform:uppercase;font-weight:700;margin-bottom:10px}
        .payment-card.paid .payment-kicker{color:#14532d}
        .payment-card.partial .payment-kicker{color:#78350f}
        .payment-card.pending .payment-kicker{color:#92400e}
        .payment-row{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid rgba(0,0,0,0.07);font-size:13px}
        .payment-row:last-of-type{border-bottom:0}
        .payment-row strong{font-weight:700;color:#0f172a}
        .payment-row span{color:#475569}
        .payment-message{font-size:13px;line-height:1.7;margin-top:10px;padding-top:8px;border-top:1px solid rgba(0,0,0,0.07);font-style:italic}
        .payment-card.paid .payment-message{color:#14532d}
        .payment-card.partial .payment-message{color:#78350f}
        .payment-card.pending .payment-message{color:#856404}
        .footer{margin-top:22px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;line-height:1.7;text-align:center;break-inside:avoid;page-break-inside:avoid}
        @media print{body{background:white}.sheet{box-shadow:none;border-radius:0}.service-row,.info-card,.bill-grid,.totals-card,.payment-card,.footer{break-inside:avoid;page-break-inside:avoid}.service-group{break-inside:auto;page-break-inside:auto}.service-group-header{break-after:avoid;page-break-after:avoid}}
    </style>
</head>
<body>
<div class="sheet">
    <div class="topbar">
        <div class="hdr">
            <div class="brand">
                <h1>${settings?.studioName || 'JamRoom'}</h1>
                <div class="tagline">Professional Music Studio</div>
                ${settings?.studioAddress ? `<div class="cl"><strong>Address:</strong> ${settings.studioAddress}</div>` : ''}
                ${settings?.studioPhone ? `<div class="cl"><strong>Phone / WhatsApp:</strong> ${settings.studioPhone}</div>` : ''}
                <div class="cl"><strong>Email:</strong> ${settings?.adminEmails?.[0] || 'admin@jamroom.com'}</div>
            </div>
            <div class="invoice-panel">
                <div class="kicker">Official Invoice</div>
                <h2>INVOICE</h2>
                <div class="meta-line"><strong>Invoice #:</strong> JR${booking._id.toString().slice(-6).toUpperCase()}</div>
                <div class="meta-line"><strong>Date:</strong> ${new Date().toLocaleDateString('en-IN')}</div>
                <div class="meta-line"><strong>Customer:</strong> ${booking.userName || 'N/A'}</div>
                <div class="meta-line"><strong>Total:</strong> &#8377;${totalAmount.toFixed(2)}</div>
            </div>
        </div>
    </div>
    <div class="body">

        <div class="bill-grid">
            <div class="info-card">
                <div class="info-label">Bill To</div>
                <div class="info-name">${booking.userName || 'N/A'}</div>
                <div class="info-email">${booking.userEmail || 'N/A'}</div>
                ${booking.bandName ? `<div class="info-row"><strong>Band:</strong> ${booking.bandName}</div>` : ''}
            </div>
            <div class="info-card">
                <div class="info-label">Booking Details</div>
                <div class="info-row"><strong>Date:</strong> ${isPerday ? `${perDayStartLabel} to ${perDayEndLabel}` : bookingDate.toLocaleDateString('en-IN')}</div>
                <div class="info-row"><strong>Time:</strong> ${isPerday ? perDayTimeRangeLabel : `${formatTime12Hour(booking.startTime)} &ndash; ${formatTime12Hour(booking.endTime)}`}</div>
                <div class="info-row"><strong>Duration:</strong> ${isPerday ? `${perDayDays} day(s)` : `${safeDuration} hour(s)`}</div>
            </div>
        </div>

        <div class="section-title">Services</div>
        ${serviceGroupSections}

        <section class="totals-card">
            <h3>Pricing Summary</h3>
            <div class="total-row"><span>Subtotal</span><strong>&#8377;${subtotal.toFixed(2)}</strong></div>
            ${gstRow}
            ${adjustmentRow}
            <div class="grand-total"><span>Total Amount</span><strong>&#8377;${totalAmount.toFixed(2)}</strong></div>
            <div class="received-row"><span>Amount Received</span><strong>&#8377;${amountReceived.toFixed(2)}</strong></div>
            ${outstandingAmount > 0 ? `<div class="due-row"><span>Outstanding Balance</span><strong>&#8377;${outstandingAmount.toFixed(2)}</strong></div>` : ''}
        </section>

        <div class="payment-card ${paymentStatusClass}">
            <div class="payment-kicker">Payment Information</div>
            <div class="payment-row"><strong>Payment Status</strong><span><span class="status-badge status-${paymentStatus.toLowerCase()}">${paymentStatus}</span></span></div>
            <div class="payment-row"><strong>Amount Received</strong><span>&#8377;${amountReceived.toFixed(2)}</span></div>
            <div class="payment-row"><strong>Outstanding Amount</strong><span>&#8377;${outstandingAmount.toFixed(2)}</span></div>
            ${booking.paymentReference ? `<div class="payment-row"><strong>Payment Reference</strong><span>${booking.paymentReference}</span></div>` : ''}
            ${settings?.upiId ? `<div class="payment-row"><strong>UPI ID</strong><span>${settings.upiId}</span></div>` : ''}
            ${booking.paymentNote ? `<div class="payment-row"><strong>Payment Note</strong><span>${booking.paymentNote}</span></div>` : ''}
            <div class="payment-message">${paymentMessage}</div>
        </div>

        <div class="footer">
            <div>For any queries, contact <strong>${settings?.adminEmails?.[0] || 'admin@jamroom.com'}</strong></div>
            <div style="margin-top:6px;opacity:0.7;">This is a computer-generated invoice. No signature required.</div>
        </div>
    </div>
</div>
</body>
</html>
    `;
};


// Export for both Node.js (server) and browser (client) environments
if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment
    module.exports = {
        generateUnifiedPDFHTML,
        formatTime12Hour,
        calculatePricing
    };
} else {
    // Browser environment
    window.generateUnifiedPDFHTML = generateUnifiedPDFHTML;
    window.formatTime12Hour = formatTime12Hour;
    window.calculatePricing = calculatePricing;
}
