/**
 * Browser-compatible PDF HTML Template Generator
 * This is the client-side version of pdfHTMLTemplate.js
 */

const DEFAULT_BRAND_LOGO_URL = 'https://jam-room-mu.vercel.app/icons/jamroom-brand-logo.png';

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
 * Calculate pricing breakdown
 * @param {Object} booking - Booking object
 * @returns {Object} Price breakdown { subtotal, taxAmount, totalAmount }
 */
const calculatePricing = (booking) => {
    let subtotal, taxAmount, totalAmount;
    
    if (booking.subtotal !== undefined && booking.taxAmount !== undefined) {
        // Use the amounts calculated during booking creation
        subtotal = booking.subtotal;
        taxAmount = booking.taxAmount;
        totalAmount = booking.price; // This should be the total including tax
    } else {
        // Fallback to old calculation method for legacy bookings
        subtotal = booking.price;
        const taxRate = 0.18;
        taxAmount = Math.round(subtotal * taxRate);
        totalAmount = subtotal + taxAmount;
    }
    
    return { subtotal, taxAmount, totalAmount };
};

const getServiceGroupingUtils = () => {
    if (window.JamRoomQuotationBilling?.buildServiceGroupSummary) {
        return window.JamRoomQuotationBilling;
    }

    return {
        buildServiceGroupSummary: (items = [], calculation = {}) => {
            const normalizeType = (value) => {
                const type = String(value || 'inhouse').trim().toLowerCase().replace(/[\s_-]+/g, '');
                if (type === 'perday' || type === 'persession' || type === 'pertrack' || type === 'session' || type === 'track') {
                    return type === 'session' ? 'persession' : type === 'track' ? 'pertrack' : type;
                }
                return 'inhouse';
            };
            const billingLabel = (type, item = {}) => {
                if (type === 'perday') {
                    const days = Number(calculation?.perdayDays || 0);
                    return days > 0 ? `Per day x ${days}` : 'Per day';
                }
                if (type === 'persession') {
                    return 'Per session';
                }
                if (type === 'pertrack') {
                    const quantity = Number(item?.quantity || 0);
                    return quantity > 0 ? `Per track x ${quantity}` : 'Per track';
                }
                const hours = Number(calculation?.inhouseDurationHours || 0);
                return hours > 0 ? `Per hour x ${hours}` : 'Per hour';
            };
            const amount = (item, type) => {
                const price = Number(item?.price || 0);
                const quantity = Number(item?.quantity || 0);
                if (type === 'persession') return price * quantity;
                if (type === 'pertrack') return price * quantity;
                if (type === 'perday') return price * quantity * Number(calculation?.perdayDays || 0);
                return price * quantity * Number(calculation?.inhouseDurationHours || 0);
            };

            const groups = {
                studio: { key: 'studio', title: 'Studio Usage', items: [] },
                production: { key: 'production', title: 'Production Services', items: [] },
                finishing: { key: 'finishing', title: 'Finishing & Delivery', items: [] },
                'sound-design': { key: 'sound-design', title: 'Sound Design', items: [] }
            };

            (Array.isArray(items) ? items : []).forEach((item) => {
                const type = normalizeType(item?.rentalType);
                const categoryText = `${String(item?.name || '').toLowerCase()} ${String(item?.category || '').toLowerCase()}`;
                let key = 'studio';
                if (/mix|master|stem/.test(categoryText)) key = 'finishing';
                else if (/foley|sound effect|sfx/.test(categoryText)) key = 'sound-design';
                else if (/composition|arrangement|recording|tracking|vocal|editing|production|session|track/.test(categoryText) || type === 'persession' || type === 'pertrack') key = 'production';

                groups[key].items.push({
                    rentalType: type,
                    title: String(item?.name || 'Service'),
                    description: String(item?.description || '').trim() || 'Studio rental service',
                    quantity: Number(item?.quantity || 0),
                    rate: Number(item?.price || 0),
                    billingLabel: billingLabel(type, item),
                    amount: amount(item, type)
                });
            });

            return ['studio', 'production', 'finishing', 'sound-design']
                .map((key) => groups[key])
                .filter((group) => group.items.length > 0);
        }
    };
};

const renderServiceGroupSections = ({ groups, renderRow }) => {
    const safeGroups = Array.isArray(groups) ? groups : [];
    if (safeGroups.length === 0) {
        return '';
    }

    return safeGroups.map((group) => {
        const rows = (Array.isArray(group?.items) ? group.items : []).map((item) => renderRow(item, group)).join('');
        const subtotalLabel = group?.subtotalLabel || (Number.isFinite(Number(group?.subtotal)) ? `&#8377;${Number(group.subtotal).toFixed(2)}` : '&#8377;0.00');

        return `
            <section class="service-group">
                <!-- Subtotal section: appears only on first page, not repeated on subsequent pages -->
                <div class="service-group-subtotal-section">
                    <div class="service-group-header-initial">
                        <div>
                            <h3>${group?.icon || ''} ${group?.title || 'Service Group'}</h3>
                            <p>${group?.subtitle || 'Studio booking services'}</p>
                        </div>
                        <div class="service-group-subtotal">${subtotalLabel}</div>
                    </div>
                </div>
                
                <table class="service-table" role="presentation">
                    <!-- Repeating header: appears on each page, but without the subtotal -->
                    <thead class="service-group-head">
                        <tr>
                            <th colspan="3">
                                <div class="service-group-header-repeat">
                                    <div>
                                        <h3>${group?.icon || ''} ${group?.title || 'Service Group'}</h3>
                                        <p>${group?.subtitle || 'Studio booking services'}</p>
                                    </div>
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody class="service-group-body">${rows}</tbody>
                </table>
            </section>`;
    }).join('');
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
    const { subtotal, taxAmount, totalAmount } = calculatePricing(booking);
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
    const serviceGroupingUtils = getServiceGroupingUtils();
    const classSession = booking?.classSession && typeof booking.classSession === 'object'
        ? booking.classSession
        : null;
    const isClassPlanBooking = Boolean(classSession?.isClassBooking);
    const classPlanMonths = Math.max(1, Number(classSession?.planMonths || 1));
    const classPlanBaseFee = Math.max(0, Number(classSession?.totalFeeBeforeDiscount || subtotal) || 0);
    const classPlanDiscount = Math.max(0, Number(classSession?.discountAmount || 0) || 0);
    // For class plan bookings, look up the real catalog category for the class item
    // so that catalogAssignment-based PDF section rules can match it correctly.
    const resolveClassItemCategory = (itemName) => {
        const nameLower = String(itemName || '').trim().toLowerCase();
        if (!nameLower || !Array.isArray(settings?.rentalTypes)) return null;
        for (const rt of settings.rentalTypes) {
            if (rt.deletedAt) continue;
            const catName = String(rt?.name || '').trim();
            if (catName.toLowerCase() === nameLower) return catName;
            if (Array.isArray(rt.subItems)) {
                for (const si of rt.subItems) {
                    if (si.deletedAt) continue;
                    if (String(si?.name || '').trim().toLowerCase() === nameLower) return catName;
                }
            }
        }
        return null;
    };

    const classItemName = classSession?.itemName || classSession?.selectedClassItemName || classSession?.instrument || 'Music Classes';
    const classItemCategory = classSession?.itemCategory
        || resolveClassItemCategory(classItemName)
        || 'Class Plans';

    const groupedServiceItems = isClassPlanBooking
        ? [{
            id: classSession?.itemId || 'class-plan',
            name: classItemName,
            category: classItemCategory,
            description: `${classPlanMonths} month plan${classSession?.location ? ` at ${classSession.location}` : ''}`,
            rentalType: 'persession',
            quantity: 1,
            quantityEnabled: true,
            price: classPlanBaseFee
        }]
        : (Array.isArray(booking.rentals) ? booking.rentals : []);
    const groupedServices = groupedServiceItems.length > 0
        ? serviceGroupingUtils.buildServiceGroupSummary(groupedServiceItems, billingCalculation, settings?.serviceGroupingConfig || {})
        : [];

    const classPlanFeeRow = isClassPlanBooking
        ? `<div class="total-row"><span>Class Plan Fee (${classPlanMonths} month${classPlanMonths > 1 ? 's' : ''})</span><strong>&#8377;${classPlanBaseFee.toFixed(2)}</strong></div>`
        : '';
    const classPlanDiscountRow = isClassPlanBooking && classPlanDiscount > 0
        ? `<div class="discount-row"><span>Class Plan Discount</span><strong>-&#8377;${classPlanDiscount.toFixed(2)}</strong></div>`
        : '';

    const adjustmentValue = Number.isFinite(Number(booking?.priceAdjustmentValue))
        ? Number(booking.priceAdjustmentValue)
        : 0;
    const adjustmentLabel = adjustmentValue < 0 ? 'Discount' : 'Surcharge';
    const adjustmentNote = String(booking?.priceAdjustmentNote || '').trim();
    const gstEnabled = (settings?.gstConfig?.enabled) || (booking.taxAmount > 0);
    const gstDisplayName = settings?.gstConfig?.displayName || 'GST';
    const gstRate = settings?.gstConfig?.rate || 0.18;
    const gstRow = (gstEnabled && taxAmount > 0)
        ? `<div class="total-row"><span>${gstDisplayName} (${Math.round(gstRate * 100)}%)</span><strong>&#8377;${taxAmount.toFixed(2)}</strong></div>`
        : '';
    const discountFromAdjustment = adjustmentValue < 0 ? Math.abs(adjustmentValue) : 0;
    const totalDiscountAmount = classPlanDiscount + discountFromAdjustment;
    const adjustmentRow = adjustmentValue !== 0
        ? adjustmentValue < 0
            ? `<div class="discount-row"><span>${adjustmentLabel}${adjustmentNote ? ` (${adjustmentNote})` : ''}</span><strong>-&#8377;${Math.abs(adjustmentValue).toFixed(2)}</strong></div>`
            : `<div class="total-row"><span>${adjustmentLabel}${adjustmentNote ? ` (${adjustmentNote})` : ''}</span><strong>+&#8377;${Math.abs(adjustmentValue).toFixed(2)}</strong></div>`
        : '';
    const paymentStatusClass = paymentStatus === 'PAID' ? 'paid' : paymentStatus === 'PARTIAL' ? 'partial' : 'pending';
    const paymentMessage = paymentStatus === 'PAID'
        ? `Payment has been received in full. Thank you — your booking account is fully settled.`
        : paymentStatus === 'PARTIAL'
            ? `Partial payment recorded. Kindly settle the remaining balance of &#8377;${outstandingAmount.toFixed(2)} before your scheduled slot.`
            : `Payment is currently pending. Kindly complete the payment of &#8377;${outstandingAmount.toFixed(2)} before your scheduled studio slot.`;
    const payableNowLabel = outstandingAmount > 0 ? 'Payable Now' : 'Paid in Full';
    const invoiceLogoSrc = String(settings?.logoDataUri || settings?.logoImageUrl || '').trim() || DEFAULT_BRAND_LOGO_URL;

    const serviceGroupSections = groupedServiceItems.length > 0
        ? renderServiceGroupSections({
            groups: groupedServices.map((group) => ({
                ...group,
                subtotalLabel: `&#8377;${Number(group.subtotal || 0).toFixed(2)}`
            })),
            renderRow: (item) => {
                const rentalType = normalizeRentalType(item.rentalType || 'inhouse');
                const bookingMeta = rentalType === 'perday'
                    ? `${perDayStartLabel} ${formatTime12Hour(booking.startTime)} to ${perDayEndLabel} ${formatTime12Hour(booking.endTime)}`
                    : `${bookingDate.toLocaleDateString('en-IN')} (${formatTime12Hour(booking.startTime)} &ndash; ${formatTime12Hour(booking.endTime)})`;
                const itemRateLabel = rentalType === 'perday'
                    ? `&#8377;${item.rate}/day`
                    : (rentalType === 'persession' ? `&#8377;${item.rate}/session` : (rentalType === 'pertrack' ? `&#8377;${item.rate}/track` : `&#8377;${item.rate}/hr`));
                return `
                <tr class="service-row">
                    <td class="service-col-copy">
                        <div class="service-title">${item.title}</div>
                        <div class="service-desc">${item.description || 'Studio rental service'} &bull; ${bookingMeta}</div>
                    </td>
                    <td class="service-col-meta">
                        <div class="service-meta-top">${itemRateLabel}${item.quantity > 1 ? ` x ${item.quantity}` : ''}</div>
                        <div class="service-meta-sub">${item.billingLabel}</div>
                    </td>
                    <td class="service-col-amount">
                        <div class="service-amount">&#8377;${Number(item.amount || 0).toFixed(2)}</div>
                    </td>
                </tr>`;
            }
        })
        : `
        <section class="service-group">
            <!-- Subtotal section: appears only on first page, not repeated on subsequent pages -->
            <div class="service-group-subtotal-section">
                <div class="service-group-header-initial">
                    <div>
                        <h3>&#127925; ${booking.rentalType || 'JamRoom Booking'}</h3>
                        <p>Studio booking for ${isPerday ? `${perDayStartLabel} to ${perDayEndLabel}` : bookingDate.toLocaleDateString('en-IN')}</p>
                    </div>
                    <div class="service-group-subtotal">&#8377;${subtotal.toFixed(2)}</div>
                </div>
            </div>
            
            <table class="service-table" role="presentation">
                <!-- Repeating header: appears on each page, but without the subtotal -->
                <thead class="service-group-head">
                    <tr>
                        <th colspan="3">
                            <div class="service-group-header-repeat">
                                <div>
                                    <h3>&#127925; ${booking.rentalType || 'JamRoom Booking'}</h3>
                                    <p>Studio booking for ${isPerday ? `${perDayStartLabel} to ${perDayEndLabel}` : bookingDate.toLocaleDateString('en-IN')}</p>
                                </div>
                            </div>
                        </th>
                    </tr>
                </thead>
                <tbody class="service-group-body">
                    <tr class="service-row">
                        <td class="service-col-copy">
                            <div class="service-title">${booking.rentalType || 'Studio Session'}</div>
                            <div class="service-desc">${isPerday ? `${perDayDays} day(s) &middot; ${perDayTimeRangeLabel}` : `${formatTime12Hour(booking.startTime)} &ndash; ${formatTime12Hour(booking.endTime)}`}${booking.notes ? ` &middot; ${booking.notes}` : ''}</div>
                        </td>
                        <td class="service-col-meta">
                            <div class="service-meta-top">${isPerSessionBooking ? `&#8377;${subtotal.toFixed(2)}/session` : (isPerTrackBooking ? `&#8377;${subtotal.toFixed(2)}/track` : `&#8377;${(subtotal / safeDuration).toFixed(2)}/hr`)}</div>
                            <div class="service-meta-sub">${isPerSessionBooking ? 'Per session' : (isPerTrackBooking ? 'Per track' : `Per hour x ${safeDuration}`)}</div>
                        </td>
                        <td class="service-col-amount">
                            <div class="service-amount">&#8377;${subtotal.toFixed(2)}</div>
                        </td>
                    </tr>
                </tbody>
            </table>
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
        .brand-head{display:flex;align-items:center;gap:12px;margin-bottom:8px}
        .brand-logo{width:52px;height:52px;border-radius:10px;object-fit:contain;background:#fff;padding:4px;border:1px solid rgba(255,255,255,0.3);flex-shrink:0}
        .brand h1{font-size:20px;font-weight:800;margin-bottom:4px;color:#fff;line-height:1.2}
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
        .service-group{border:1px solid #dbe5f0;border-radius:20px;overflow:hidden;margin-bottom:16px;background:#fff;break-inside:auto;page-break-inside:auto}
        .service-table{width:100%;border-collapse:collapse;table-layout:fixed}
        .service-group-head{display:table-header-group}
        .service-group-head th{padding:0;border:0}
        .service-group-header-initial,.service-group-header-repeat{display:flex;justify-content:space-between;gap:16px;align-items:center;background:linear-gradient(135deg,#0f172a 0%,#1e2f57 100%);padding:16px 18px;color:#fff;break-after:avoid;page-break-after:avoid}
        .service-group-header-initial h3,.service-group-header-repeat h3{font-size:18px;margin-bottom:4px;color:#fff;font-weight:700}
        .service-group-header-initial p,.service-group-header-repeat p{font-size:12px;color:rgba(255,255,255,0.78);line-height:1.5;margin:0}
        .service-group-subtotal-section{break-after:avoid;page-break-after:avoid}
        .service-group-subtotal{font-size:14px;font-weight:800;white-space:nowrap;background:rgba(255,255,255,0.12);border-radius:999px;padding:8px 12px;color:#fff;flex-shrink:0}
        .service-group-body{display:table-row-group}
        .service-row td{padding:14px 0;border-bottom:1px solid #edf2f7;vertical-align:middle;break-inside:avoid;page-break-inside:avoid}
        .service-row:last-child td{border-bottom:0}
        .service-col-copy{width:56%;padding-left:18px}
        .service-col-meta{width:28%;text-align:right;padding-left:14px;padding-right:14px}
        .service-col-amount{width:16%;text-align:right;padding-right:18px}
        .service-title{font-size:14px;font-weight:700;color:#0f172a;margin-bottom:4px}
        .service-desc{font-size:12px;line-height:1.5;color:#64748b}
        .service-meta-top{font-size:13px;font-weight:700;color:#0f172a}
        .service-meta-sub{font-size:11px;color:#64748b;margin-top:4px}
        .service-amount{text-align:right;font-size:14px;font-weight:800;color:#0f172a}
        .totals-card{background:#0f172a;color:#fff;border-radius:22px;padding:20px 22px;margin:18px 0;break-inside:avoid;page-break-inside:avoid}
        .totals-card h3{font-size:14px;text-transform:uppercase;letter-spacing:1.2px;color:#cbd5e1;margin-bottom:12px}
        .total-row{display:flex;justify-content:space-between;gap:16px;padding:6px 0;font-size:14px;color:#e2e8f0}
        .discount-row{display:flex;justify-content:space-between;gap:16px;padding:6px 0;font-size:14px;color:#86efac;border-left:3px solid #22c55e;padding-left:8px;margin:2px 0}
        .discount-row strong{font-size:14px;color:#86efac}
        .grand-total{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-top:12px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.14)}
        .grand-total span{font-size:13px;text-transform:uppercase;letter-spacing:1.2px;color:#93c5fd;font-weight:700}
        .grand-total strong{font-size:24px;color:#ffffff;line-height:1}
        .received-row{display:flex;justify-content:space-between;gap:16px;padding:8px 0 4px;font-size:13px;color:#86efac;border-top:1px solid rgba(255,255,255,0.1);margin-top:10px}
        .due-row{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:10px 14px;margin-top:8px;border-radius:12px;background:linear-gradient(135deg,#7f1d1d 0%,#b91c1c 100%);border:1px solid rgba(252,165,165,0.4)}
        .due-row span{font-size:11px;text-transform:uppercase;letter-spacing:1.1px;color:#fecaca;font-weight:700}
        .due-row strong{font-size:22px;line-height:1;color:#fee2e2;font-weight:800}
        .due-row.settled{background:linear-gradient(135deg,#14532d 0%,#166534 100%);border-color:rgba(134,239,172,0.4)}
        .due-row.settled span{color:#bbf7d0}
        .due-row.settled strong{color:#dcfce7}
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
        @media print{body{background:white}.sheet{box-shadow:none;border-radius:0}.service-row td,.info-card,.bill-grid,.totals-card,.payment-card,.footer{break-inside:avoid;page-break-inside:avoid}.service-group{break-inside:auto;page-break-inside:auto}.service-group-head{display:table-header-group}.service-group-subtotal-section{break-after:avoid;page-break-after:avoid}.service-group-header-initial,.service-group-header-repeat{break-after:avoid;page-break-after:avoid}}
    </style>
</head>
<body>
<div class="sheet">
    <div class="topbar">
        <div class="hdr">
            <div class="brand">
                <div class="brand-head">
                    <img class="brand-logo" src="${invoiceLogoSrc}" alt="Logo" />
                    <div>
                        <h1>${settings?.studioName || 'JamRoom'}</h1>
                        <div class="tagline">Professional Jam Room & Music Studio</div>
                    </div>
                </div>
                ${settings?.studioAddress ? `<div class="cl"><strong>Address:</strong> ${settings.studioAddress}</div>` : ''}
                ${settings?.studioPhone ? `<div class="cl"><strong>Phone / WhatsApp:</strong> ${settings.studioPhone}</div>` : ''}
                <div class="cl"><strong>Email:</strong> ${settings?.adminEmails?.[0] || 'admin@jamroom.com'}</div>
            </div>
            <div class="invoice-panel">
                <div class="kicker">Official Invoice</div>
                <h2>INVOICE</h2>
                <div class="meta-line"><strong>Invoice #:</strong> JR${booking._id ? String(booking._id).slice(-6).toUpperCase() : 'N/A'}</div>
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
            ${classPlanFeeRow}
            ${classPlanDiscountRow}
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
            <div>For any queries, contact <strong>${settings?.adminEmails?.[0] || 'swarjrs@gmail.com'}</strong></div>
            <div style="margin-top:6px;opacity:0.7;">This is a computer-generated invoice. No signature required.</div>
        </div>
    </div>
</div>
</body>
</html>
    `;
};

// Export for browser environment
window.generateUnifiedPDFHTML = generateUnifiedPDFHTML;
window.formatTime12Hour = formatTime12Hour;
window.calculatePricing = calculatePricing;
