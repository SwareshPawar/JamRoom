/**
 * Client-Side PDF Generation
 * This generates PDFs exactly matching the server-side version
 */

// Load external libraries dynamically
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// Initialize PDF libraries
let pdfLibsLoaded = false;
async function loadPDFLibraries() {
    if (pdfLibsLoaded) return;
    
    try {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
        pdfLibsLoaded = true;
        console.log('PDF libraries loaded successfully');
    } catch (error) {
        console.error('Failed to load PDF libraries:', error);
        throw error;
    }
}

/**
 * Generate the exact same HTML content as server-side
 */
function generateBillHTML(booking, settings) {
    const bookingDate = new Date(booking.date);
    const currentDate = new Date();
    
    // Helper function to convert 24-hour time to 12-hour format
    function formatTime12Hour(time24) {
        if (!time24) return time24;
        
        // Handle different time formats
        let timeStr = time24.toString();
        
        // If it already contains AM/PM, return as is
        if (timeStr.includes('AM') || timeStr.includes('PM')) {
            return timeStr;
        }
        
        // Parse time (handle formats like "14:30", "2:30", "14:30:00")
        const timeParts = timeStr.split(':');
        if (timeParts.length < 2) return time24; // Invalid format
        
        let hours = parseInt(timeParts[0]);
        const minutes = timeParts[1];
        
        if (isNaN(hours)) return time24; // Invalid hours
        
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // 0 should be 12
        
        return `${hours}:${minutes} ${ampm}`;
    }
    
    // Calculate pricing - use booking amounts if available, otherwise calculate from booking.price
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
        taxAmount = subtotal * taxRate;
        totalAmount = subtotal + taxAmount;
    }
    
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${settings?.studioName || 'JamRoom'} Booking Invoice</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        
        :root {
            --primary-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            --secondary-gradient: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            --accent-gradient: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
            --success-gradient: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
            --warning-gradient: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
            
            --primary-color: #667eea;
            --secondary-color: #764ba2;
            --accent-color: #4facfe;
            --success-color: #43e97b;
            --warning-color: #fa709a;
            --danger-color: #ff6b6b;
            
            --text-primary: #2d3748;
            --text-secondary: #4a5568;
            --text-muted: #718096;
            --text-light: #a0aec0;
            
            --bg-primary: #ffffff;
            --bg-secondary: #f7fafc;
            --bg-accent: #edf2f7;
            --bg-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            
            --border-color: #e2e8f0;
            --border-radius: 12px;
            --border-radius-sm: 8px;
            --border-radius-lg: 16px;
            
            --shadow-sm: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
            --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
            --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
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
            border-radius: var(--border-radius-lg);
            overflow: hidden;
            box-shadow: var(--shadow-xl);
            position: relative;
        }
        
        .invoice::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: var(--primary-gradient);
        }
        
        .invoice-content {
            padding: 40px;
        }
        
        .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 40px;
            position: relative;
        }
        
        .logo-section {
            flex: 1;
            max-width: 60%;
        }
        
        .company-name {
            font-size: 32px;
            font-weight: 800;
            color: #1a202c;
            margin-bottom: 6px;
            line-height: 1.1;
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
        
        .billing-section {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
            margin-bottom: 40px;
        }
        
        .bill-card {
            background: var(--bg-primary);
            border-radius: var(--border-radius);
            padding: 24px;
            box-shadow: var(--shadow-sm);
            border: 1px solid var(--border-color);
            position: relative;
            overflow: hidden;
        }
        
        .bill-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
        }
        
        .bill-to::before {
            background: var(--accent-gradient);
        }
        
        .bill-details::before {
            background: var(--warning-gradient);
        }
        
        .section-title {
            font-size: 16px;
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
        }
        
        .detail-value {
            color: var(--text-primary);
            font-weight: 500;
        }
        
        .status-badge {
            padding: 4px 12px;
            border-radius: var(--border-radius-lg);
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .status-confirmed {
            background: var(--success-gradient);
            color: white;
        }
        
        .status-pending {
            background: var(--warning-gradient);
            color: white;
        }
        
        .status-cancelled {
            background: var(--danger-color);
            color: white;
        }
        
        .items-table {
            width: 100%;
            border-collapse: collapse;
            margin: 30px 0;
            background: var(--bg-primary);
            border-radius: var(--border-radius);
            overflow: hidden;
            box-shadow: var(--shadow-md);
            border: 1px solid var(--border-color);
        }
        
        .items-table th {
            background: #667eea;
            color: white;
            padding: 20px 16px;
            text-align: left;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-size: 13px;
        }
        
        .items-table td {
            padding: 20px 16px;
            border-bottom: 1px solid var(--border-color);
            font-size: 14px;
        }
        
        .items-table tbody tr {
            transition: background-color 0.2s ease;
        }
        
        .items-table tbody tr:hover {
            background: var(--bg-accent);
        }
        
        .items-table tr:last-child td {
            border-bottom: none;
        }
        
        .items-table tr:nth-child(even) {
            background: var(--bg-secondary);
        }
        
        .amount-cell {
            text-align: right;
            font-weight: 600;
            color: var(--text-primary);
        }
        
        .totals-section {
            margin-top: 40px;
            display: flex;
            justify-content: flex-end;
        }
        
        .totals-container {
            min-width: 350px;
            background: var(--bg-primary);
            border-radius: var(--border-radius);
            box-shadow: var(--shadow-md);
            border: 1px solid var(--border-color);
            overflow: hidden;
        }
        
        .totals-table {
            width: 100%;
            border-collapse: collapse;
        }
        
        .totals-table td {
            padding: 16px 20px;
            border-bottom: 1px solid var(--border-color);
            font-size: 15px;
        }
        
        .totals-table .label {
            font-weight: 500;
            color: var(--text-secondary);
        }
        
        .totals-table .amount {
            text-align: right;
            font-weight: 600;
            color: var(--text-primary);
        }
        
        .total-row {
            background: #667eea !important;
            color: white !important;
        }
        
        .total-row td {
            border-bottom: none !important;
            font-weight: 700 !important;
            font-size: 18px !important;
            padding: 20px !important;
        }
        
        .payment-info {
            margin-top: 40px;
            padding: 24px;
            background: var(--bg-accent);
            border-radius: var(--border-radius);
            border-left: 4px solid var(--accent-color);
            position: relative;
        }
        
        .payment-info::before {
            content: '💳';
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
            background: none;
        }
        
        .payment-title {
            font-size: 16px;
            font-weight: bold;
            color: #0c5460;
            margin-bottom: 10px;
        }
        
        .payment-details {
            color: #0c5460;
            font-size: 14px;
            line-height: 1.6;
        }
        
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e9ecef;
            text-align: center;
            color: #666;
            font-size: 12px;
        }
        
        .thank-you {
            font-size: 18px;
            color: #667eea;
            font-weight: bold;
            margin-bottom: 10px;
        }
        
        .status-badge {
            display: inline-block;
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .status-confirmed {
            background: #d4edda;
            color: #155724;
        }
        
        .status-pending {
            background: #fff3cd;
            color: #856404;
        }
        
        /* PDF-specific optimizations for client-side rendering */
        .invoice {
            box-shadow: none !important;
            border-radius: 0 !important;
            max-width: 800px !important;
            width: 800px !important;
        }
        
        .invoice-content {
            padding: 40px !important;
        }
        
        /* PDF-optimized styles - clean and simple */
        .company-name {
            font-size: 32px !important;
            font-weight: 800 !important;
            color: #1a202c !important;
            line-height: 1.1 !important;
            margin-bottom: 6px !important;
            letter-spacing: -0.5px !important;
            background: none !important;
        }
        
        .invoice-title h1 {
            font-size: 48px !important;
            font-weight: 800 !important;
            color: #667eea !important;
            letter-spacing: -1px !important;
            margin-bottom: 16px !important;
            background: none !important;
        }
        
        .invoice-number {
            background: #667eea !important;
            color: white !important;
        }
        
        .total-row {
            background: #667eea !important;
            color: white !important;
        }
        
        .items-table th {
            background: #667eea !important;
            color: white !important;
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
                    <div class="invoice-date">Date: ${currentDate.toLocaleDateString('en-IN')}</div>
                </div>
            </div>
            
            <!-- Billing Information -->
            <div class="billing-section">
                <div class="bill-card bill-to">
                    <div class="section-title">👤 Bill To</div>
                    <div class="customer-info">
                        <div class="customer-name">${booking.userName || booking.userId?.name || 'Customer'}</div>
                        <div class="customer-email">${booking.userEmail || booking.userId?.email || ''}</div>
                        ${booking.bandName ? `<div style="margin-top: 12px; color: var(--primary-color); font-weight: 600; font-size: 14px;">🎵 Band: ${booking.bandName}</div>` : ''}
                    </div>
                </div>
                
                <div class="bill-card bill-details">
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
                            <small style="color: #888; font-style: italic;"><strong>Additional Notes:</strong> ${booking.notes}</small>
                        </td>
                    </tr>
                ` : ''}
            </tbody>
        </table>
        
        <!-- Totals -->
        <div class="totals-section">
            <div class="totals-container">
                <table class="totals-table">
                    <tr>
                        <td class="label">💰 Subtotal:</td>
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
            <p style="font-style: italic; margin-top: 12px; color: var(--text-muted);">Please make payment before your booking slot to confirm your reservation.</p>
        </div>
        
        <!-- Footer -->
        <div class="footer">
            <div class="footer-text">
                <span class="footer-highlight">Thank you for choosing ${settings?.studioName || 'JamRoom'}!</span>
            </div>
            <div class="footer-text">
                For any queries regarding this invoice, please contact us at <strong>${settings?.adminEmails?.[0] || 'admin@jamroom.com'}</strong>
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
}

/**
 * Generate PDF from booking data (client-side)
 */
async function generatePDFClient(booking, settings) {
    await loadPDFLibraries();
    
    console.log('Starting client-side PDF generation...');
    
    // Generate HTML content
    const htmlContent = generateBillHTML(booking, settings);
    
    // Create a temporary container that matches server-side rendering
    const tempContainer = document.createElement('div');
    tempContainer.innerHTML = htmlContent;
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-9999px';
    tempContainer.style.top = '0';
    tempContainer.style.width = '800px';
    tempContainer.style.height = 'auto';
    document.body.appendChild(tempContainer);
    
    // Wait for fonts and styles to load
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const invoiceElement = tempContainer.querySelector('.invoice');
    
    const options = {
        margin: [0.28, 0.28, 0.28, 0.28], // 20px converted to inches (20/72 ≈ 0.28)
        filename: `JamRoom_Invoice_${booking._id.toString().slice(-6).toUpperCase()}_${new Date(booking.date).toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { 
            scale: 2, 
            useCORS: true, 
            allowTaint: true,
            backgroundColor: '#f7fafc',
            width: 800,
            height: invoiceElement.scrollHeight,
            scrollX: 0,
            scrollY: 0,
            logging: false
        },
        jsPDF: { 
            unit: 'in', 
            format: 'a4', 
            orientation: 'portrait',
            compress: true
        }
    };
    
    try {
        await html2pdf().from(invoiceElement).set(options).save();
        console.log('Client-side PDF generated successfully');
        
        // Clean up
        document.body.removeChild(tempContainer);
        
        return true;
    } catch (error) {
        console.error('Client-side PDF generation failed:', error);
        document.body.removeChild(tempContainer);
        throw error;
    }
}

// Export for use in HTML pages
window.generatePDFClient = generatePDFClient;