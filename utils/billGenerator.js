const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const AdminSettings = require('../models/AdminSettings');

// For Vercel deployment, try to use chrome-aws-lambda
let chromium;
const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;

try {
  if (isServerless) {
    chromium = require('chrome-aws-lambda');
    console.log('chrome-aws-lambda loaded for serverless environment');
  } else {
    console.log('Local development detected, using regular puppeteer');
  }
} catch (error) {
  console.log('chrome-aws-lambda not available, using regular puppeteer:', error.message);
}

/**
 * Generate HTML content for the bill
 */
const generateBillHTML = async (booking, settings) => {
  const bookingDate = new Date(booking.date);
  const currentDate = new Date();
  
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
            font-size: 28px;
            font-weight: 700;
            background: var(--primary-gradient);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin-bottom: 8px;
            line-height: 1.2;
        }
        
        .company-tagline {
            color: var(--text-muted);
            font-size: 14px;
            font-weight: 500;
            margin-bottom: 16px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
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
            font-size: 42px;
            font-weight: 700;
            background: var(--primary-gradient);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin-bottom: 12px;
            letter-spacing: -0.5px;
        }
        
        .invoice-number {
            background: var(--primary-gradient);
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
            background: var(--primary-gradient);
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
            background: var(--primary-gradient) !important;
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
            background: var(--primary-gradient);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            font-weight: 600;
        }
        
        /* Responsive Design */
        @media screen and (max-width: 768px) {
            .invoice-content {
                padding: 30px 20px;
            }
            
            .header {
                flex-direction: column;
                text-align: center;
            }
            
            .logo-section {
                max-width: 100%;
                margin-bottom: 30px;
            }
            
            .invoice-title {
                text-align: center;
            }
            
            .billing-section {
                grid-template-columns: 1fr;
                gap: 20px;
            }
            
            .company-name {
                font-size: 24px;
            }
            
            .invoice-title h1 {
                font-size: 32px;
            }
            
            .items-table th,
            .items-table td {
                padding: 12px 8px;
                font-size: 12px;
            }
            
            .totals-container {
                min-width: 100%;
            }
        }
        
        @media screen and (max-width: 480px) {
            .invoice-content {
                padding: 20px 15px;
            }
            
            .company-name {
                font-size: 20px;
            }
            
            .invoice-title h1 {
                font-size: 28px;
            }
            
            .invoice-number {
                font-size: 14px;
                padding: 10px 16px;
            }
            
            .bill-card {
                padding: 20px;
            }
            
            .items-table th,
            .items-table td {
                padding: 10px 6px;
                font-size: 11px;
            }
        }
        
        /* Print Styles */
        @media print {
            .invoice {
                box-shadow: none;
                border-radius: 0;
                max-width: 100%;
            }
            
            .invoice-content {
                padding: 20px;
            }
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
                            <span class="detail-value">${booking.startTime} - ${booking.endTime}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">⏱️ Duration:</span>
                            <span class="detail-value">${booking.duration} hour(s)</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">✅ Status:</span>
                            <span class="status-badge status-${booking.bookingStatus.toLowerCase()}">${booking.bookingStatus}</span>
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
                                    <br>Booking: ${bookingDate.toLocaleDateString('en-IN')} (${booking.startTime} - ${booking.endTime})
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
                                    (${booking.startTime} - ${booking.endTime})
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
};

/**
 * Generate PDF bill for a booking (optimized for email - stable config)
 */
const generateBill = async (booking) => {
  let browser;
  
  try {
    console.log('Starting PDF generation for booking:', booking._id);
    
    // Get admin settings for company info
    const settings = await AdminSettings.getSettings();
    console.log('Retrieved admin settings');
    
    // Generate HTML content
    const htmlContent = await generateBillHTML(booking, settings);
    console.log('Generated HTML content, length:', htmlContent.length);
    
    // Launch puppeteer with stable configuration (same as working email version)
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ],
      timeout: 30000
    });

    console.log('Puppeteer browser launched');
    const page = await browser.newPage();

    // Set content and generate PDF
    await page.setContent(htmlContent, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    console.log('HTML content set, generating PDF...');
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px'
      }
    });
    
    console.log('PDF generated successfully, size:', pdfBuffer.length);
    
    await browser.close();
    return pdfBuffer;
    
  } catch (error) {
    console.error('PDF generation error:', error.message);
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error('Error closing browser:', closeError.message);
      }
    }
    throw new Error(`PDF generation failed: ${error.message}`);
  }
};

/**
 * Generate PDF bill for download (optimized for Vercel serverless)
 */
const generateBillForDownload = async (booking) => {
  let browser;
  
  try {
    console.log('=== PDF DOWNLOAD GENERATION START ===');
    console.log('Booking ID:', booking._id);
    console.log('Environment details:');
    console.log('- NODE_ENV:', process.env.NODE_ENV);
    console.log('- VERCEL:', process.env.VERCEL);
    console.log('- AWS_LAMBDA_FUNCTION_NAME:', process.env.AWS_LAMBDA_FUNCTION_NAME);
    console.log('- isServerless:', isServerless);
    console.log('- chromium available:', !!chromium);
    console.log('- Memory usage:', process.memoryUsage());
    
    // Get admin settings for company info
    const settings = await AdminSettings.getSettings();
    console.log('Retrieved admin settings');
    
    // Generate HTML content
    const htmlContent = await generateBillHTML(booking, settings);
    console.log('Generated HTML content, length:', htmlContent.length);
    
    // Use chrome-aws-lambda if available and in serverless environment
    if (chromium && isServerless) {
      console.log('Using chrome-aws-lambda for serverless deployment');
      try {
        browser = await chromium.puppeteer.launch({
          args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
          defaultViewport: chromium.defaultViewport,
          executablePath: await chromium.executablePath,
          headless: chromium.headless,
          ignoreHTTPSErrors: true,
        });
        console.log('chrome-aws-lambda browser launched successfully');
      } catch (chromiumError) {
        console.error('chrome-aws-lambda launch failed:', chromiumError.message);
        console.log('Falling back to regular puppeteer...');
        throw chromiumError; // Let it fallback to regular puppeteer
      }
    } else {
      console.log('Using regular puppeteer with optimized config');
      // Launch puppeteer with optimized configuration for local/non-serverless
      browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          // Remove serverless-specific args for local development
          ...(isServerless ? [
            '--single-process',
            '--disable-extensions',
            '--disable-plugins',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=TranslateUI',
            '--disable-ipc-flooding-protection',
            '--memory-pressure-off',
            '--max_old_space_size=512'
          ] : [])
        ],
        timeout: isServerless ? 45000 : 30000
      });
      console.log('Regular puppeteer browser launched successfully');
    }

    console.log('Browser launched for PDF download');
    const page = await browser.newPage();
    
    // Set smaller viewport to reduce memory usage
    await page.setViewport({ width: 800, height: 600 });
    
    // Set content with timeout optimized for environment
    await page.setContent(htmlContent, {
      waitUntil: 'domcontentloaded',
      timeout: isServerless && chromium ? 30000 : 25000
    });

    console.log('HTML content set, generating PDF for download...');
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px'
      },
      timeout: isServerless && chromium ? 25000 : 20000
    });
    
    console.log('PDF download generated successfully, size:', pdfBuffer.length);
    
    await browser.close();
    return pdfBuffer;
    
  } catch (error) {
    console.error('PDF download generation error:', error.message);
    console.error('Error stack:', error.stack);
    
    // Ensure browser is closed even on error
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error('Error closing browser:', closeError.message);
      }
    }
    
    // Provide more specific error messages for debugging
    if (error.message.includes('timeout')) {
      throw new Error('PDF generation timed out. Please try again or contact support.');
    } else if (error.message.includes('browser')) {
      throw new Error('Browser initialization failed. This may be a temporary server issue.');
    } else if (error.message.includes('memory')) {
      throw new Error('Server memory limit exceeded. Please try again later.');
    } else {
      throw new Error(`PDF download failed: ${error.message}`);
    }
  }
};

/**
 * Generate bill filename
 */
const generateBillFilename = (booking, settings) => {
  const bookingDate = new Date(booking.date);
  const dateStr = bookingDate.toISOString().split('T')[0];
  const bookingId = booking._id.toString().slice(-6).toUpperCase();
  const studioPrefix = (settings?.studioName || 'JamRoom').replace(/[^a-zA-Z0-9]/g, '_');
  return `${studioPrefix}_Invoice_${bookingId}_${dateStr}.pdf`;
};

module.exports = {
  generateBill,
  generateBillForDownload,
  generateBillFilename,
  generateBillHTML
};