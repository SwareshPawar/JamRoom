const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const AdminSettings = require('../models/AdminSettings');
const { generateUnifiedPDFHTML } = require('./pdfHTMLTemplate');

// Check if we're in a serverless environment
const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL_ENV;

/**
 * Create optimized puppeteer configuration for serverless environments
 */
const createPuppeteerConfig = async () => {
  const baseConfig = {
    headless: 'new',
    timeout: isServerless ? 25000 : 30000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox', 
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-extensions',
      '--disable-plugins',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection',
      '--memory-pressure-off',
      ...(isServerless ? ['--max-old-space-size=1024'] : [])
    ]
  };
  
  // Use Vercel chromium in production
  if (process.env.VERCEL) {
    try {
      const chromium = require('@sparticuz/chromium');
      baseConfig.executablePath = await chromium.executablePath();
      baseConfig.args.push(...chromium.args);
      console.log('✅ Using Vercel @sparticuz/chromium');
    } catch (error) {
      console.log('⚠️ Vercel chromium not available, using default puppeteer');
    }
  }
  
  return baseConfig;
};

/**
 * Generate HTML content for the bill using unified template
 */
const generateBillHTML = async (booking, settings) => {
  return generateUnifiedPDFHTML(booking, settings);
};

/**
 * Generate PDF bill for a booking (optimized for email - stable config)
 */
const generateBill = async (booking) => {
  let browser;
  
  try {
    console.log('Starting PDF generation for booking:', booking._id);
    console.log('Environment check:', { VERCEL: process.env.VERCEL, VERCEL_ENV: process.env.VERCEL_ENV });
    
    // Get admin settings for company info
    const settings = await AdminSettings.getSettings();
    console.log('Retrieved admin settings');
    
    // Generate HTML content
    const htmlContent = await generateBillHTML(booking, settings);
    console.log('Generated HTML content, length:', htmlContent.length);
    
    console.log('🚀 Launching puppeteer...');
    const puppeteerConfig = await createPuppeteerConfig();
    browser = await puppeteer.launch(puppeteerConfig);

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
const generateBillForDownload = async (booking, retryCount = 0) => {
  let browser;
  
  try {
    console.log(`📄 Starting PDF generation for booking ${booking._id}${retryCount > 0 ? ` (retry ${retryCount})` : ''}`);
    if (isServerless) {
      console.log('⚡ Serverless mode - memory usage:', Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB');
    }
    
    // Get admin settings for company info
    console.log('🔌 Checking database connection for PDF download...');
    const mongoose = require('mongoose');
    
    // Ensure database connection in serverless environment
    if (mongoose.connection.readyState !== 1) {
      console.log('🔌 Database not connected, attempting connection...');
      if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI environment variable is not set');
      }
      await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 8000, // 8 second timeout
        socketTimeoutMS: 15000, // 15 second socket timeout
      });
      console.log('✅ Database connected successfully');
    }
    
    const settings = await AdminSettings.getSettings();
    console.log('Retrieved admin settings:', settings ? '✅ Found' : '❌ Not found');
    
    // Generate HTML content
    const htmlContent = await generateBillHTML(booking, settings);
    console.log('Generated HTML content, length:', htmlContent.length);
    
    console.log('🚀 Launching puppeteer with serverless config...');
    const browserConfig = await createPuppeteerConfig();
    browser = await puppeteer.launch(browserConfig);
    console.log('Puppeteer browser launched successfully');

    console.log('Browser launched for PDF download');
    const page = await browser.newPage();
    
    // Set smaller viewport to reduce memory usage
    await page.setViewport({ width: 800, height: 600 });
    
    // Set content with optimized timeout
    await page.setContent(htmlContent, {
      waitUntil: 'domcontentloaded',
      timeout: 20000
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
      timeout: 20000
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
    
    // Retry logic for transient failures
    const isTransientError = error.message.includes('timeout') || 
                            error.message.includes('Connection refused') ||
                            error.message.includes('Protocol error') ||
                            error.message.includes('Target closed');
    
    if (isTransientError && retryCount < 2) {
      console.log(`Retrying PDF generation due to transient error (attempt ${retryCount + 1}/3)...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1))); // Progressive delay
      return generateBillForDownload(booking, retryCount + 1);
    }
    
    // Provide more specific error messages for debugging
    if (error.message.includes('timeout')) {
      throw new Error('PDF generation timed out. This may be due to serverless cold start or memory constraints.');
    } else if (error.message.includes('browser') || error.message.includes('launch')) {
      throw new Error('Browser initialization failed. Chromium binary may not be available in serverless environment.');
    } else if (error.message.includes('memory')) {
      throw new Error('Server memory limit exceeded during PDF generation.');
    } else {
      throw new Error(`PDF download generation failed: ${error.message}`);
    }
  }
};

/**
 * Generate bill filename
 */
const generateBillFilename = (booking, settings) => {
  const bookingDate = new Date(booking.date);
  const invoiceNumber = `JR${booking._id.toString().slice(-6).toUpperCase()}`;
  const dateStr = bookingDate.toISOString().split('T')[0]; // YYYY-MM-DD format
  const studioName = (settings?.studioName || 'JamRoom').replace(/[^a-zA-Z0-9]/g, '_');
  
  return `${studioName}_Invoice_${invoiceNumber}_${dateStr}.pdf`;
};

/**
 * Generate PDF with filename
 */
const generateBillForDownloadWithFilename = async (booking) => {
  try {
    console.log('Generating PDF with filename for booking:', booking._id);
    
    // Ensure database connection in serverless environment
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      // Set serverless-specific connection timeouts
      mongoose.connection.serverSelectionTimeoutMS = 8000;
      mongoose.connection.socketTimeoutMS = 15000;
      await mongoose.connect(process.env.MONGO_URI);
      console.log('✅ MongoDB connected for PDF generation');
    }
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    throw new Error('Database connection failed');
  }
  
  const settings = await AdminSettings.getSettings();
  const pdfBuffer = await generateBillForDownload(booking);
  const filename = generateBillFilename(booking, settings);
  
  return { pdfBuffer, filename };
};

module.exports = {
  generateBill,
  generateBillForDownload,
  generateBillForDownloadWithFilename,
  generateBillFilename,
  generateBillHTML
};

/**
 * Build standalone HTML document for a quotation PDF
 */
const generateQuotationHTML = (data, settings) => {
  const studioName = settings?.studioName || 'JamRoom';
  const {
    rentalTypeLabel,
    selectedTypeLabels,
    calculation,
    rentals,
    quoteNotes,
    generatedAt,
    gstEnabled,
    gstRate,
    gstDisplayName,
    taxAmount,
    totalAmount,
    recipientName
  } = data;

  const typeDescriptions = {
    'In-house': 'In-studio equipment and room usage billed per hour',
    'Per-day': 'Equipment rented for full-day blocks — suitable for outdoor shoots, events, or productions away from the studio',
    'Per-session': 'Flat rate per project, event, concert, show, or production timeline'
  };

  const typeRows = (selectedTypeLabels || []).map((label) => `
    <tr>
      <td style="padding:7px 14px;color:#374151;font-size:13px;font-weight:600;white-space:nowrap;">${label}</td>
      <td style="padding:7px 14px;font-size:13px;color:#4b5563;">${typeDescriptions[label] || ''}</td>
    </tr>`).join('');

  const scheduleRows = [];
  if (calculation.hasInhouse && calculation.schedules?.inhouse?.date) {
    scheduleRows.push(`<tr><td style="padding:5px 0;color:#4b5563;font-size:13px;width:200px;">Date</td><td style="padding:5px 0;font-size:13px;">${calculation.schedules.inhouse.date}</td></tr>`);
    scheduleRows.push(`<tr><td style="padding:5px 0;color:#4b5563;font-size:13px;">Time Window</td><td style="padding:5px 0;font-size:13px;">${calculation.schedules.inhouse.startTime} – ${calculation.schedules.inhouse.endTime} (${calculation.inhouseDurationHours} hr)</td></tr>`);
  }
  if (calculation.hasPerday && calculation.schedules?.perday?.startDate) {
    scheduleRows.push(`<tr><td style="padding:5px 0;color:#4b5563;font-size:13px;">Pickup</td><td style="padding:5px 0;font-size:13px;">${calculation.schedules.perday.startDate} at ${calculation.schedules.perday.pickupTime}</td></tr>`);
    scheduleRows.push(`<tr><td style="padding:5px 0;color:#4b5563;font-size:13px;">Return</td><td style="padding:5px 0;font-size:13px;">${calculation.schedules.perday.endDate} at ${calculation.schedules.perday.returnTime} (${calculation.perdayDays} day(s))</td></tr>`);
  }

  const itemRows = (rentals || []).map((item) => {
    const rentalType = String(item.rentalType || 'inhouse').toLowerCase();
    let billing = '';
    let itemTotal = 0;
    if (rentalType === 'persession') {
      billing = 'Per Session';
      itemTotal = item.price * item.quantity;
    } else if (rentalType === 'perday') {
      billing = `Per Day &times; ${calculation.perdayDays}`;
      itemTotal = item.price * item.quantity * (calculation.perdayDays || 0);
    } else {
      billing = `Per Hour &times; ${calculation.inhouseDurationHours}`;
      itemTotal = item.price * item.quantity * (calculation.inhouseDurationHours || 0);
    }
    return `
    <tr>
      <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;">${item.name}${item.category ? ` <span style="color:#9ca3af;font-size:12px;">(${item.category})</span>` : ''}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:13px;">${item.quantity}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px;">&#8377;${item.price.toFixed(2)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:13px;color:#4b5563;">${billing}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px;font-weight:600;">&#8377;${itemTotal.toFixed(2)}</td>
    </tr>`;
  }).join('');

  const gstRow = gstEnabled
    ? `<tr><td style="padding:5px 0;color:#4b5563;">${gstDisplayName || 'GST'} (${Math.round((gstRate || 0) * 100)}%)</td><td style="text-align:right;">&#8377;${(taxAmount || 0).toFixed(2)}</td></tr>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Quotation &ndash; ${rentalTypeLabel}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;color:#1f2937;background:#fff;padding:28px}
    .hdr{background:#0f172a;color:#fff;padding:22px 26px;border-radius:8px 8px 0 0}
    .hdr h1{font-size:21px;margin-bottom:3px}
    .hdr p{font-size:13px;opacity:.85}
    .body{border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;padding:22px 26px}
    .sec{font-size:12px;font-weight:700;text-transform:uppercase;color:#6b7280;letter-spacing:.5px;margin:18px 0 8px}
    table.meta{width:100%;border-collapse:collapse;font-size:13px}
    table.meta td{padding:4px 0}
    table.types{width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;background:#f9fafb}
    table.items{width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden}
    table.items th{background:#f9fafb;padding:9px 12px;font-size:12px;border-bottom:1px solid #e5e7eb;text-align:left}
    table.totals{width:100%;border-collapse:collapse;font-size:13px}
    table.totals td{padding:5px 0}
    .total-final td{font-weight:700;font-size:14px;color:#0f172a;border-top:1px solid #e5e7eb;padding-top:8px}
    .notes{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px;font-size:13px;margin-top:16px}
    .footer{font-size:11px;color:#9ca3af;margin-top:22px}
  </style>
</head>
<body>
  <div class="hdr">
    <h1>Quotation</h1>
    <p>${studioName}</p>
  </div>
  <div class="body">
    ${recipientName ? `<p style="font-size:13px;margin-bottom:14px;">Dear <strong>${recipientName}</strong>,</p>` : ''}
    <p style="font-size:13px;color:#4b5563;margin-bottom:18px;">Please find your requested quotation details below. This is a price estimate only and not a confirmed booking.</p>

    <div class="sec">Quotation Details</div>
    <table class="meta">
      <tr><td style="color:#4b5563;width:200px;">Quotation Label</td><td style="font-weight:600;">${rentalTypeLabel}</td></tr>
      <tr><td style="color:#4b5563;">Generated On</td><td>${generatedAt instanceof Date ? generatedAt.toLocaleString('en-IN') : generatedAt}</td></tr>
    </table>

    ${selectedTypeLabels && selectedTypeLabels.length > 0 ? `
    <div class="sec">Booking Type(s) Included</div>
    <table class="types">${typeRows}</table>` : ''}

    ${scheduleRows.length > 0 ? `
    <div class="sec">Schedule</div>
    <table class="meta">${scheduleRows.join('')}</table>` : ''}

    <div class="sec">Items</div>
    <table class="items">
      <thead><tr>
        <th>Item</th>
        <th style="text-align:center;">Qty</th>
        <th style="text-align:right;">Rate</th>
        <th style="text-align:center;">Billing</th>
        <th style="text-align:right;">Amount</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
    </table>

    <div class="sec">Totals</div>
    <table class="totals">
      <tr><td style="color:#4b5563;">Subtotal</td><td style="text-align:right;">&#8377;${(calculation.subtotal || 0).toFixed(2)}</td></tr>
      ${gstRow}
      <tr class="total-final"><td>Total</td><td style="text-align:right;">&#8377;${(totalAmount || 0).toFixed(2)}</td></tr>
    </table>

    ${quoteNotes ? `<div class="notes"><strong>Notes:</strong> ${quoteNotes}</div>` : ''}
    <p class="footer">This quotation is valid for 7 days. Prices are subject to availability at the time of booking confirmation.</p>
  </div>
</body>
</html>`;
};

/**
 * Generate a PDF buffer for a quotation
 */
const generateQuotationPDF = async (quotationData, settings) => {
  let browser;
  try {
    const launchConfigs = [];

    try {
      launchConfigs.push(await createPuppeteerConfig());
    } catch (configError) {
      console.error('Quotation PDF config creation failed, using fallback config:', configError.message);
    }

    launchConfigs.push({
      headless: true,
      timeout: isServerless ? 25000 : 30000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    let lastLaunchError = null;
    for (const launchConfig of launchConfigs) {
      try {
        browser = await puppeteer.launch(launchConfig);
        break;
      } catch (launchError) {
        lastLaunchError = launchError;
        console.error('Quotation PDF launch attempt failed:', launchError.message);
      }
    }

    if (!browser) {
      throw (lastLaunchError || new Error('Unable to launch browser for quotation PDF'));
    }

    const page = await browser.newPage();
    await page.setViewport({ width: 820, height: 600 });
    const htmlContent = generateQuotationHTML(quotationData, settings);
    await page.setContent(htmlContent, { waitUntil: ['domcontentloaded', 'networkidle0'], timeout: 25000 });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
    });

    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('Generated quotation PDF is empty');
    }

    await browser.close();
    return pdfBuffer;
  } catch (error) {
    if (browser) {
      try { await browser.close(); } catch (e) { /* ignore */ }
    }
    throw new Error(`Quotation PDF generation failed: ${error.message}`);
  }
};

module.exports.generateQuotationPDF = generateQuotationPDF;
module.exports.generateQuotationHTML = generateQuotationHTML;