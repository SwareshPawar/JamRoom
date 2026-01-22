const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const AdminSettings = require('../models/AdminSettings');

/**
 * Generate HTML content for the bill
 */
const generateBillHTML = async (booking, settings) => {
  const bookingDate = new Date(booking.date);
  const currentDate = new Date();
  
  // Calculate tax (18% GST)
  const subtotal = booking.price;
  const taxRate = 0.18;
  const taxAmount = subtotal * taxRate;
  const totalAmount = subtotal + taxAmount;
  
  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${settings?.studioName || 'JamRoom'} Booking Invoice</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Arial', sans-serif;
            color: #333;
            line-height: 1.4;
            background: #fff;
        }
        
        .invoice {
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 30px;
            background: white;
        }
        
        .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 40px;
            border-bottom: 3px solid #667eea;
            padding-bottom: 20px;
        }
        
        .logo-section {
            flex: 1;
        }
        
        .company-name {
            font-size: 32px;
            font-weight: bold;
            color: #667eea;
            margin-bottom: 5px;
        }
        
        .company-tagline {
            color: #666;
            font-size: 14px;
            margin-bottom: 15px;
        }
        
        .company-details {
            font-size: 12px;
            color: #666;
            line-height: 1.5;
        }
        
        .invoice-title {
            text-align: right;
            flex: 1;
        }
        
        .invoice-title h1 {
            font-size: 36px;
            color: #667eea;
            margin-bottom: 10px;
        }
        
        .invoice-number {
            background: #667eea;
            color: white;
            padding: 8px 15px;
            border-radius: 5px;
            display: inline-block;
            margin-bottom: 10px;
            font-weight: bold;
        }
        
        .invoice-date {
            color: #666;
            font-size: 14px;
        }
        
        .billing-section {
            display: flex;
            justify-content: space-between;
            margin-bottom: 30px;
        }
        
        .bill-to, .bill-details {
            flex: 1;
            margin-right: 20px;
        }
        
        .section-title {
            font-size: 16px;
            font-weight: bold;
            color: #667eea;
            margin-bottom: 10px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .customer-info {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #667eea;
        }
        
        .customer-name {
            font-size: 18px;
            font-weight: bold;
            color: #333;
            margin-bottom: 5px;
        }
        
        .customer-email {
            color: #666;
            font-size: 14px;
        }
        
        .booking-details {
            background: #fff3cd;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #ffc107;
        }
        
        .detail-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            font-size: 14px;
        }
        
        .detail-label {
            font-weight: bold;
            color: #333;
        }
        
        .detail-value {
            color: #666;
        }
        
        .items-table {
            width: 100%;
            border-collapse: collapse;
            margin: 30px 0;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .items-table th {
            background: #667eea;
            color: white;
            padding: 15px;
            text-align: left;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-size: 12px;
        }
        
        .items-table td {
            padding: 15px;
            border-bottom: 1px solid #e9ecef;
        }
        
        .items-table tr:last-child td {
            border-bottom: none;
        }
        
        .items-table tr:nth-child(even) {
            background: #f8f9fa;
        }
        
        .amount-cell {
            text-align: right;
            font-weight: bold;
        }
        
        .totals-section {
            margin-top: 30px;
            display: flex;
            justify-content: flex-end;
        }
        
        .totals-table {
            width: 300px;
            border-collapse: collapse;
        }
        
        .totals-table td {
            padding: 10px 15px;
            border-bottom: 1px solid #e9ecef;
        }
        
        .totals-table .label {
            font-weight: bold;
            color: #333;
        }
        
        .totals-table .amount {
            text-align: right;
            font-weight: bold;
            color: #333;
        }
        
        .total-row {
            background: #667eea !important;
            color: white !important;
            font-size: 18px;
        }
        
        .total-row td {
            border-bottom: none !important;
            font-weight: bold !important;
        }
        
        .payment-info {
            margin-top: 40px;
            padding: 20px;
            background: #d1ecf1;
            border-radius: 8px;
            border-left: 4px solid #17a2b8;
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
        <!-- Header -->
        <div class="header">
            <div class="logo-section">
                <div class="company-name">${settings?.studioName || 'JamRoom'}</div>
                <div class="company-tagline">Professional Music Studio Rental</div>
                <div class="company-details">
                    ${settings?.studioAddress || 'Studio Address'}<br>
                    Email: ${settings?.adminEmails?.[0] || 'swarjrs@gmail.com'}<br>
                    Phone: ${settings?.studioPhone || '+91 XXXX XXXXXX'}
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
            <div class="bill-to">
                <div class="section-title">Bill To</div>
                <div class="customer-info">
                    <div class="customer-name">${booking.userName || booking.userId?.name || 'Customer'}</div>
                    <div class="customer-email">${booking.userEmail || booking.userId?.email || ''}</div>
                    ${booking.bandName ? `<div style="margin-top: 8px; color: #667eea; font-weight: bold;">Band: ${booking.bandName}</div>` : ''}
                </div>
            </div>
            
            <div class="bill-details">
                <div class="section-title">Booking Details</div>
                <div class="booking-details">
                    <div class="detail-row">
                        <span class="detail-label">Date:</span>
                        <span class="detail-value">${bookingDate.toLocaleDateString('en-IN')}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Time:</span>
                        <span class="detail-value">${booking.startTime} - ${booking.endTime}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Duration:</span>
                        <span class="detail-value">${booking.duration} hour(s)</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Status:</span>
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
                    <th style="width: 100px; text-align: center;">Duration</th>
                    <th style="width: 120px; text-align: right;">Rate</th>
                    <th style="width: 120px; text-align: right;">Amount</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>
                        <strong>${booking.rentalType}</strong>
                        <br>
                        <small style="color: #666;">
                            Studio booking for ${bookingDate.toLocaleDateString('en-IN')} 
                            (${booking.startTime} - ${booking.endTime})
                        </small>
                        ${booking.notes ? `<br><small style="color: #888; font-style: italic;">Note: ${booking.notes}</small>` : ''}
                    </td>
                    <td style="text-align: center;">${booking.duration} hr(s)</td>
                    <td class="amount-cell">₹${(booking.price / booking.duration).toFixed(2)}/hr</td>
                    <td class="amount-cell">₹${booking.price.toFixed(2)}</td>
                </tr>
            </tbody>
        </table>
        
        <!-- Totals -->
        <div class="totals-section">
            <table class="totals-table">
                <tr>
                    <td class="label">Subtotal:</td>
                    <td class="amount">₹${subtotal.toFixed(2)}</td>
                </tr>
                <tr>
                    <td class="label">GST (18%):</td>
                    <td class="amount">₹${taxAmount.toFixed(2)}</td>
                </tr>
                <tr class="total-row">
                    <td class="label">Total Amount:</td>
                    <td class="amount">₹${totalAmount.toFixed(2)}</td>
                </tr>
            </table>
        </div>
        
        <!-- Payment Information -->
        <div class="payment-info">
            <div class="payment-title">Payment Information</div>
            <div class="payment-details">
                <strong>Payment Status:</strong> ${booking.paymentStatus}<br>
                ${booking.paymentReference ? `<strong>Payment Reference:</strong> ${booking.paymentReference}<br>` : ''}
                <strong>Payment Method:</strong> UPI / Bank Transfer<br>
                <em>Please make payment before your booking slot to confirm your reservation.</em>
            </div>
        </div>
        
        <!-- Footer -->
        <div class="footer">
            <div class="thank-you">Thank you for choosing ${settings?.studioName || 'JamRoom'}!</div>
            <p>For any queries regarding this invoice, please contact us at ${settings?.adminEmails?.[0] || 'admin@jamroom.com'}</p>
            <p style="margin-top: 10px;">
                This is a computer-generated invoice. No signature required.
            </p>
        </div>
    </div>
</body>
</html>
  `;
};

/**
 * Generate PDF bill for a booking
 */
const generateBill = async (booking) => {
  let browser;
  
  try {
    // Get admin settings for company info
    const settings = await AdminSettings.getSettings();
    
    // Generate HTML content
    const htmlContent = await generateBillHTML(booking, settings);
    
    // Launch puppeteer
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Set content and generate PDF
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    
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
    
    await browser.close();
    
    return pdfBuffer;
  } catch (error) {
    if (browser) {
      await browser.close();
    }
    throw error;
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
  generateBillFilename,
  generateBillHTML
};