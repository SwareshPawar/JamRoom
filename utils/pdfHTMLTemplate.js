/**
 * Unified PDF HTML Template Generator
 * This generates consistent HTML for both server-side (puppeteer) and client-side (html2pdf) PDF generation
 */

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

/**
 * Generate unified PDF HTML template
 * @param {Object} booking - Booking data
 * @param {Object} settings - Admin settings
 * @returns {string} Complete HTML content
 */
const generateUnifiedPDFHTML = (booking, settings) => {
    const bookingDate = new Date(booking.date);
    const { subtotal, taxAmount, totalAmount } = calculatePricing(booking);
    
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${settings?.studioName || 'JamRoom'} Booking Invoice</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        
        :root {
            --primary-color: #667eea;
            --secondary-color: #764ba2;
            --text-primary: #1a202c;
            --text-secondary: #4a5568;
            --text-muted: #718096;
            --bg-primary: #ffffff;
            --bg-secondary: #f7fafc;
            --bg-accent: #edf2f7;
            --border-color: #e2e8f0;
            --shadow-sm: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24);
            --shadow-md: 0 4px 6px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.06);
            --shadow-lg: 0 10px 15px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.05);
            --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
            --border-radius-sm: 6px;
            --border-radius-md: 8px;
            --border-radius-lg: 12px;
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: var(--text-primary);
            line-height: 1.6;
            background: var(--bg-secondary);
            font-size: 14px;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }
        
        .invoice {
            max-width: 800px;
            margin: 0 auto;
            background: var(--bg-primary);
            box-shadow: var(--shadow-xl);
            border-radius: var(--border-radius-lg);
            overflow: hidden;
        }
        
        .invoice-content {
            padding: 40px;
        }
        
        .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 40px;
            padding-bottom: 30px;
            border-bottom: 2px solid var(--bg-accent);
        }
        
        .logo-section {
            flex: 1 1 auto;
            max-width: 60%;
        }
        
        .company-name {
            font-size: 28px;
            font-weight: 800;
            color: var(--primary-color);
            margin-bottom: 8px;
            letter-spacing: -0.5px;
            /* Clean styling for PDF compatibility - no gradients */
            background: none;
            text-shadow: none;
        }
        
        .company-tagline {
            color: #667eea;
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 18px;
            text-transform: uppercase;
            letter-spacing: 1.2px;
        }
        
        .company-details {
            font-size: 13px;
            color: var(--text-secondary);
            line-height: 1.7;
            background: var(--bg-accent);
            padding: 16px;
            border-radius: var(--border-radius-sm);
            border-left: 3px solid var(--primary-color);
        }
        
        .company-details strong {
            color: var(--text-primary);
            font-weight: 600;
        }
        
        .invoice-title {
            text-align: right;
            flex: 0 0 auto;
            min-width: 35%;
        }
        
        .invoice-title h1 {
            font-size: 48px;
            font-weight: 800;
            color: #667eea;
            margin-bottom: 16px;
            letter-spacing: -1px;
            /* Clean styling for PDF compatibility - no gradients */
            background: none;
            text-shadow: none;
        }
        
        .invoice-number {
            background: #667eea;
            color: white;
            padding: 12px 20px;
            border-radius: var(--border-radius-lg);
            display: inline-block;
            margin-bottom: 12px;
            font-weight: 600;
            font-size: 16px;
            box-shadow: var(--shadow-md);
            letter-spacing: 0.5px;
        }
        
        .invoice-date {
            color: var(--text-muted);
            font-size: 14px;
            font-weight: 500;
        }
        
        .customer-section {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 40px;
            margin-bottom: 40px;
        }
        
        .section-title {
            font-size: 14px;
            font-weight: 600;
            color: var(--text-primary);
            margin-bottom: 16px;
            text-transform: uppercase;
            letter-spacing: 1px;
            font-size: 12px;
        }
        
        .customer-info, .booking-details {
            padding: 0;
            background: transparent;
            border: none;
            border-radius: 0;
        }
        
        .customer-name {
            font-size: 20px;
            font-weight: 600;
            color: var(--text-primary);
            margin-bottom: 6px;
        }
        
        .customer-email {
            color: var(--text-muted);
            font-size: 14px;
            margin-bottom: 12px;
        }
        
        .detail-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 12px;
            font-size: 14px;
            align-items: center;
        }
        
        .detail-label {
            font-weight: 500;
            color: var(--text-secondary);
            min-width: 100px;
        }
        
        .detail-value {
            color: var(--text-primary);
            font-weight: 500;
            text-align: right;
        }
        
        .status-badge {
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .status-pending {
            background: #fff3cd;
            color: #856404;
            border: 1px solid #ffeaa7;
        }
        
        .status-confirmed {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        
        .status-paid {
            background: #d1ecf1;
            color: #0c5460;
            border: 1px solid #bee5eb;
        }
        
        .status-cancelled {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        
        .items-table {
            width: 100%;
            border-collapse: collapse;
            margin: 30px 0;
            border-radius: var(--border-radius-md);
            overflow: hidden;
            box-shadow: var(--shadow-sm);
            border: 1px solid var(--border-color);
        }
        
        .items-table thead {
            background: var(--primary-color);
            color: white;
        }
        
        .items-table th {
            padding: 16px 12px;
            text-align: left;
            font-weight: 600;
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .items-table td {
            padding: 16px 12px;
            border-bottom: 1px solid var(--border-color);
            vertical-align: top;
        }
        
        .items-table tbody tr:last-child td {
            border-bottom: none;
        }
        
        .items-table tbody tr:hover {
            background: var(--bg-accent);
        }
        
        .amount-cell {
            text-align: right;
            font-weight: 600;
            color: var(--text-primary);
        }
        
        .summary-box {
            background: var(--bg-accent);
            border: 1px solid var(--border-color);
            border-radius: var(--border-radius-md);
            padding: 24px;
            margin: 30px 0;
            position: relative;
        }
        
        .summary-box::before {
            content: '💰';
            position: absolute;
            top: 24px;
            right: 24px;
            font-size: 24px;
            opacity: 0.3;
        }
        
        .payment-info h3 {
            color: var(--text-primary);
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 12px;
        }
        
        .payment-info p {
            color: var(--text-secondary);
            font-size: 14px;
            margin-bottom: 8px;
            line-height: 1.6;
        }
        
        .footer {
            margin-top: 50px;
            text-align: center;
            padding: 30px 0;
            border-top: 1px solid var(--border-color);
        }
        
        .footer-text {
            color: var(--text-muted);
            font-size: 13px;
            margin-bottom: 8px;
        }
        
        .footer-highlight {
            color: #667eea;
            font-weight: 600;
        }
        
        .summary-table {
            width: 100%;
            border-collapse: collapse;
        }
        
        .summary-table td {
            padding: 12px 0;
            border-bottom: 1px solid rgba(0,0,0,0.1);
        }
        
        .summary-table .label {
            font-weight: 500;
            color: var(--text-secondary);
        }
        
        .summary-table .amount {
            text-align: right;
            font-weight: 600;
            color: var(--text-primary);
        }
        
        .summary-table .total-row {
            border-top: 2px solid var(--primary-color);
            font-size: 16px;
            font-weight: 700;
        }
        
        .summary-table .total-row .label {
            color: var(--primary-color);
        }
        
        .summary-table .total-row .amount {
            color: var(--primary-color);
        }
        
        @media print {
            body { background: white; }
            .invoice { box-shadow: none; }
        }
    </style>
</head>
<body>
    <div class="invoice">
        <div class="invoice-content">
            <!-- Header -->
            <div class="header">
                <div class="logo-section">
                    <div class="company-name">${settings?.studioName || 'JamRoom'}</div>
                    <div class="company-tagline">Professional Music Studio Rental</div>
                    <div class="company-details">
                        <strong>Address:</strong><br>
                        ${settings?.studioAddress || 'Studio Address'}<br><br>
                        <strong>Email:</strong> ${settings?.adminEmails?.[0] || 'swarjrs@gmail.com'}<br>
                        <strong>Phone:</strong> ${settings?.studioPhone || '+91 XXXX XXXXXX'}
                    </div>
                </div>
                <div class="invoice-title">
                    <h1>INVOICE</h1>
                    <div class="invoice-number">#JR${booking._id.toString().slice(-6).toUpperCase()}</div>
                    <div class="invoice-date">Date: ${new Date().toLocaleDateString('en-IN')}</div>
                </div>
            </div>
            
            <!-- Customer & Booking Info -->
            <div class="customer-section">
                <div class="customer-info">
                    <div class="section-title">🙋 Bill To</div>
                    <div class="customer-name">${booking.userName || 'N/A'}</div>
                    <div class="customer-email">${booking.userEmail || 'N/A'}</div>
                    ${booking.bandName ? `<p style="margin-top: 8px;"><strong>Band:</strong> ${booking.bandName}</p>` : ''}
                </div>
                <div class="booking-details">
                    <div class="section-title">📅 Booking Details</div>
                    <div class="booking-details">
                        <div class="detail-row">
                            <span class="detail-label">📅 Date:</span>
                            <span class="detail-value">${bookingDate.toLocaleDateString('en-IN')}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">🕒 Time:</span>
                            <span class="detail-value">${formatTime12Hour(booking.startTime)} - ${formatTime12Hour(booking.endTime)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">⏱️ Duration:</span>
                            <span class="detail-value">${booking.duration} hour(s)</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">✅ Status:</span>
                            <span class="status-badge status-${booking.bookingStatus?.toLowerCase() || 'confirmed'}">${booking.bookingStatus || 'Confirmed'}</span>
                        </div>
                    </div>
                </div>
            </div>
        
        <!-- Items Table -->
        <table class="items-table">
            <thead>
                <tr>
                    <th>Service Description</th>
                    <th style="width: 80px; text-align: center;">Qty</th>
                    <th style="width: 100px; text-align: center;">Duration</th>
                    <th style="width: 120px; text-align: right;">Rate</th>
                    <th style="width: 120px; text-align: right;">Amount</th>
                </tr>
            </thead>
            <tbody>
                ${booking.rentals && booking.rentals.length > 0 ? 
                    booking.rentals.map(rental => `
                        <tr>
                            <td>
                                <strong>${rental.name}</strong>
                                <br>
                                <small style="color: #666;">
                                    ${rental.description || 'Studio rental service'}
                                    <br>Booking: ${bookingDate.toLocaleDateString('en-IN')} (${formatTime12Hour(booking.startTime)} - ${formatTime12Hour(booking.endTime)})
                                </small>
                            </td>
                            <td style="text-align: center;">${rental.quantity}</td>
                            <td style="text-align: center;">${booking.duration} hr(s)</td>
                            <td class="amount-cell">₹${rental.price}/hr</td>
                            <td class="amount-cell">₹${(rental.price * rental.quantity * booking.duration).toFixed(2)}</td>
                        </tr>
                    `).join('') : `
                        <tr>
                            <td>
                                <strong>${booking.rentalType || 'JamRoom Booking'}</strong>
                                <br>
                                <small style="color: #666;">
                                    Studio booking for ${bookingDate.toLocaleDateString('en-IN')} 
                                    (${formatTime12Hour(booking.startTime)} - ${formatTime12Hour(booking.endTime)})
                                </small>
                                ${booking.notes ? `<br><small style="color: #888; font-style: italic;">Note: ${booking.notes}</small>` : ''}
                            </td>
                            <td style="text-align: center;">1</td>
                            <td style="text-align: center;">${booking.duration} hr(s)</td>
                            <td class="amount-cell">₹${(booking.price / booking.duration).toFixed(2)}/hr</td>
                            <td class="amount-cell">₹${booking.price.toFixed(2)}</td>
                        </tr>
                    `}
                ${booking.notes && booking.rentals && booking.rentals.length > 0 ? `
                    <tr>
                        <td colspan="5" style="padding-top: 20px; border-top: 1px solid #eee;">
                            <strong>Additional Notes:</strong><br>
                            <span style="color: #666; font-style: italic;">${booking.notes}</span>
                        </td>
                    </tr>
                ` : ''}
            </tbody>
        </table>
        
        <!-- Summary -->
        <div class="summary-box">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h3 style="color: var(--primary-color); margin: 0;">💰 Payment Summary</h3>
            </div>
            <div style="margin-top: 20px;">
                <table class="summary-table">
                    <tr>
                        <td class="label">💵 Subtotal:</td>
                        <td class="amount">₹${subtotal.toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td class="label">🧾 GST (18%):</td>
                        <td class="amount">₹${taxAmount.toFixed(2)}</td>
                    </tr>
                    <tr class="total-row">
                        <td class="label">💳 Total Amount:</td>
                        <td class="amount">₹${totalAmount.toFixed(2)}</td>
                    </tr>
                </table>
            </div>
        </div>
        
        <!-- Payment Information -->
        <div class="payment-info">
            <h3>💳 Payment Information</h3>
            <p><strong>Payment Status:</strong> <span class="status-badge status-${booking.paymentStatus?.toLowerCase() || 'pending'}">${booking.paymentStatus || 'Pending'}</span></p>
            ${booking.paymentReference ? `<p><strong>Payment Reference:</strong> ${booking.paymentReference}</p>` : ''}
            <p><strong>Payment Method:</strong> UPI / Bank Transfer</p>
            ${settings?.upiId ? `<p><strong>UPI ID:</strong> ${settings.upiId}</p>` : ''}
        </div>
        
        <!-- Footer -->
        <div class="footer">
            <div class="footer-text">
                For any queries regarding this invoice, please contact us at <strong class="footer-highlight">${settings?.adminEmails?.[0] || 'admin@jamroom.com'}</strong>
            </div>
            <div class="footer-text" style="margin-top: 16px; font-size: 12px; opacity: 0.8;">
                🤖 This is a computer-generated invoice. No signature required.
            </div>
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