const puppeteer = require('puppeteer');
const fsSync = require('fs');
const path = require('path');
const AdminSettings = require('../models/AdminSettings');
const { generateUnifiedPDFHTML } = require('./pdfHTMLTemplate');
const { buildServiceGroupSummary } = require('./shared/quotationBilling');

// Check if we're in a serverless environment
const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL_ENV;
const DEFAULT_STUDIO_WEBSITE = 'https://jam-room-mu.vercel.app/';
const QUOTATION_LOGO_PATH = path.join(__dirname, '..', 'public', 'icons', 'jamroom-192.png');

let cachedQuotationLogoDataUri = null;

const normalizeRentalType = (value) => {
  const type = String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (type === 'perday') return 'perday';
  if (type === 'persession' || type === 'session') return 'persession';
  if (type === 'pertrack' || type === 'track') return 'pertrack';
  if (type === 'inhouse' || type === 'hourly') return 'inhouse';
  return '';
};

const toPlainBooking = (booking) => {
  if (!booking) return booking;
  if (typeof booking.toObject === 'function') {
    return booking.toObject({
      depopulate: true,
      versionKey: false,
      getters: false,
      virtuals: false
    });
  }
  return booking;
};

const normalizeNameKey = (value) => String(value || '').trim().toLowerCase();

const buildCatalogRentalTypeMap = (settings = {}) => {
  const map = new Map();
  const rentalTypes = Array.isArray(settings?.rentalTypes) ? settings.rentalTypes : [];

  rentalTypes.forEach((type) => {
    const categoryType = normalizeRentalType(type?.rentalType) || 'inhouse';
    const categoryName = normalizeNameKey(type?.name);
    if (categoryName && !map.has(categoryName)) {
      map.set(categoryName, categoryType);
    }

    const subItems = Array.isArray(type?.subItems) ? type.subItems : [];
    subItems.forEach((subItem) => {
      const itemName = normalizeNameKey(subItem?.name);
      if (!itemName) return;
      const itemType = normalizeRentalType(subItem?.rentalType) || categoryType;
      map.set(itemName, itemType || 'inhouse');
    });
  });

  return map;
};

const enrichBookingRentalsWithCatalogTypes = (booking, settings = {}) => {
  const plainBooking = toPlainBooking(booking);

  if (!plainBooking || !Array.isArray(plainBooking.rentals) || plainBooking.rentals.length === 0) {
    return plainBooking;
  }

  const rentalTypeMap = buildCatalogRentalTypeMap(settings);
  if (rentalTypeMap.size === 0) {
    return plainBooking;
  }

  const enrichedRentals = plainBooking.rentals.map((rental) => {
    const existingType = normalizeRentalType(rental?.rentalType);
    if (existingType) {
      return rental;
    }

    const matchedType = rentalTypeMap.get(normalizeNameKey(rental?.name)) || '';
    if (!matchedType) {
      return rental;
    }

    return {
      ...rental,
      rentalType: matchedType
    };
  });

  return {
    ...plainBooking,
    rentals: enrichedRentals
  };
};

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
    const bookingWithResolvedTypes = enrichBookingRentalsWithCatalogTypes(booking, settings);
    const htmlContent = await generateBillHTML(bookingWithResolvedTypes, settings);
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
        serverSelectionTimeoutMS: 8000,
        socketTimeoutMS: 15000
      });
      console.log('✅ Database connected successfully');
    }

    const settings = await AdminSettings.getSettings();
    console.log('Retrieved admin settings:', settings ? '✅ Found' : '❌ Not found');

        // Generate HTML content
    const bookingWithResolvedTypes = enrichBookingRentalsWithCatalogTypes(booking, settings);
    const htmlContent = await generateBillHTML(bookingWithResolvedTypes, settings);
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
    const isTransientError = error.message.includes('timeout')
      || error.message.includes('Connection refused')
      || error.message.includes('Protocol error')
      || error.message.includes('Target closed');

    if (isTransientError && retryCount < 2) {
      console.log(`Retrying PDF generation due to transient error (attempt ${retryCount + 1}/3)...`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * (retryCount + 1)));
      return generateBillForDownload(booking, retryCount + 1);
    }

        // Provide more specific error messages for debugging
    if (error.message.includes('timeout')) {
      throw new Error('PDF generation timed out. This may be due to serverless cold start or memory constraints.');
    }
    else if (error.message.includes('browser') || error.message.includes('launch')) {
      throw new Error('Browser initialization failed. Chromium binary may not be available in serverless environment.');
    }
    else if (error.message.includes('memory')) {
      throw new Error('Server memory limit exceeded during PDF generation.');
    }

    throw new Error(`PDF download generation failed: ${error.message}`);
  }
};

/**
 * Generate bill filename
 */
const generateBillFilename = (booking, settings) => {
  const bookingDate = new Date(booking.date);
  const invoiceNumber = `JR${booking._id.toString().slice(-6).toUpperCase()}`;
  const dateStr = bookingDate.toISOString().split('T')[0];
  const studioName = (settings?.studioName || 'JamRoom').replace(/[^a-zA-Z0-9]/g, '_');

  return `${studioName}_Invoice_${invoiceNumber}_${dateStr}.pdf`;
};

/**
 * Generate PDF with filename
 */
const generateBillForDownloadWithFilename = async (booking) => {
  console.log('Generating PDF with filename for booking:', booking._id);

  const settings = await AdminSettings.getSettings();
  const pdfBuffer = await generateBillForDownload(booking);
  const filename = generateBillFilename(booking, settings);

  return { pdfBuffer, filename };
};

const formatCurrency = (value) => {
  const numericValue = Number(value || 0);
  const hasFraction = Math.round(numericValue * 100) % 100 !== 0;

  return `Rs. ${numericValue.toLocaleString('en-IN', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2
  })}`;
};

const getQuotationLogoDataUri = () => {
  if (cachedQuotationLogoDataUri !== null) {
    return cachedQuotationLogoDataUri;
  }

  try {
    const fileBuffer = fsSync.readFileSync(QUOTATION_LOGO_PATH);
    cachedQuotationLogoDataUri = `data:image/png;base64,${fileBuffer.toString('base64')}`;
  } catch (error) {
    cachedQuotationLogoDataUri = '';
  }

  return cachedQuotationLogoDataUri;
};

const getBrandInitials = (studioName) => {
  const tokens = String(studioName || 'JamRoom')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .slice(0, 2);

  return (tokens.length > 0 ? tokens : ['JR'])
    .map((token) => token.charAt(0).toUpperCase())
    .join('');
};

const getPrimaryStudioEmail = (settings) => {
  const configuredEmail = Array.isArray(settings?.adminEmails)
    ? settings.adminEmails.find((email) => String(email || '').trim())
    : '';

  return configuredEmail || 'swarjrs@gmail.com';
};

const buildWhatsAppLink = (phoneNumber) => {
  const digits = String(phoneNumber || '').replace(/\D/g, '');
  if (!digits) return '';
  return `https://wa.me/${digits}`;
};

const buildQuotationPresentationData = (data, settings) => {
  const studioName = settings?.studioName || 'JamRoom';
  const studioEmail = getPrimaryStudioEmail(settings);
  const studioPhone = String(settings?.studioPhone || '+91 9970011855').trim();
  const studioAddress = String(settings?.studioAddress || '').trim();
  const websiteUrl = DEFAULT_STUDIO_WEBSITE;
  const calculatedGeneratedAt = data?.generatedAt instanceof Date
    ? data.generatedAt.toLocaleString('en-IN')
    : String(data?.generatedAt || '');

  const inhouseItems = (Array.isArray(data?.rentals) ? data.rentals : [])
    .filter((item) => String(item?.rentalType || 'inhouse').toLowerCase() === 'inhouse');

  const jamRoomBaseItem = inhouseItems.find((item) => {
    const itemName = String(item?.name || '').toLowerCase();
    const itemCategory = String(item?.category || '').toLowerCase();
    return /jamroom|jam room/.test(itemName)
      || /jamroom|jam room/.test(itemCategory)
      || /\(base\)/.test(itemName)
      || /_base/.test(String(item?.id || '').toLowerCase())
      || /_base/.test(String(item?.fullId || '').toLowerCase());
  });

  const inhouseHourlyRate = Number(jamRoomBaseItem?.price || inhouseItems[0]?.price || 0);

  const serviceGroups = buildServiceGroupSummary(
    Array.isArray(data?.rentals) ? data.rentals : [],
    data?.calculation || {}
  ).map((group) => ({
    ...group,
    subtotalLabel: formatCurrency(group.subtotal),
    items: group.items.map((item) => ({
      title: item.title,
      description: item.description,
      quantity: item.quantity,
      rateLabel: formatCurrency(item.rate),
      billingLabel: item.billingLabel,
      amountLabel: formatCurrency(item.amount),
      amountValue: item.amount
    }))
  }));

  const bookingTerms = [
    '50% advance payment is required to confirm and block your booking slot.',
    inhouseHourlyRate > 0
      ? `Extra studio time is billed at ${formatCurrency(inhouseHourlyRate)}/hour, subject to availability.`
      : 'Additional studio time or scope changes are billed at the applicable quoted rate.',
    'Cancellation within 24 hours of the scheduled session is non-refundable.',
    'This quotation is valid for 7 days, subject to slot and team availability at confirmation.'
  ];

  const offerLine = data?.calculation?.hasInhouse
    ? 'Combo Offer: Book 6 studio hours and get 1 additional studio hour complimentary on confirmation.'
    : 'Priority Offer: Confirm within 48 hours to lock the quoted rates and preferred scheduling support.';

  return {
    studioName,
    studioAddress,
    studioPhone,
    studioEmail,
    studioWhatsAppLink: buildWhatsAppLink(studioPhone),
    websiteUrl,
    logoDataUri: getQuotationLogoDataUri(),
    logoImageUrl: `${websiteUrl.replace(/\/$/, '')}/icons/jamroom-192.png`,
    brandInitials: getBrandInitials(studioName),
    serviceTypeLabel: String(data?.rentalTypeLabel || '').trim() || 'Quotation',
    selectedTypeLabels: Array.isArray(data?.selectedTypeLabels) ? data.selectedTypeLabels : [],
    generatedAtLabel: calculatedGeneratedAt,
    totalAmountLabel: formatCurrency(Number(data?.totalAmount || 0)),
    subtotalAmountLabel: formatCurrency(Number(data?.calculation?.subtotal || 0)),
    taxAmountLabel: formatCurrency(Number(data?.taxAmount || 0)),
    taxEnabled: Boolean(data?.gstEnabled),
    gstDisplayLabel: data?.gstDisplayName || 'GST',
    gstRateLabel: `${Math.round((Number(data?.gstRate || 0)) * 100)}%`,
    recipientName: String(data?.recipientName || '').trim(),
    quoteNotes: String(data?.quoteNotes || '').trim(),
    serviceGroups,
    bookingTerms,
    offerLine,
    confidenceLine: 'Built for artists, bands, composers, and live-session teams who want dependable sound quality and a smooth production experience.',
    introLine: 'We have carefully crafted this quotation based on your requirements to help you plan the best sound quality and production experience.'
  };
};

/**
 * Build standalone HTML document for a quotation PDF
 */
const generateQuotationHTML = (data, settings) => {
  const presentation = buildQuotationPresentationData(data, settings);
  const calculation = data?.calculation || {};
  const scheduleRows = [];

  if (calculation.hasInhouse && calculation.schedules?.inhouse?.date) {
    scheduleRows.push(`<div class="timeline-row"><span class="timeline-label">Hourly Session</span><span class="timeline-value">${calculation.inhouseDurationHours || 0} hr planned</span></div>`);
  }
  if (calculation.hasPerday && calculation.schedules?.perday?.startDate) {
    scheduleRows.push(`<div class="timeline-row"><span class="timeline-label">Per-Day Rental</span><span class="timeline-value">Pickup ${calculation.schedules.perday.startDate} ${calculation.schedules.perday.pickupTime} | Return ${calculation.schedules.perday.endDate} ${calculation.schedules.perday.returnTime} (${calculation.perdayDays || 0} day)</span></div>`);
  }

  const serviceGroupSections = presentation.serviceGroups.map((group) => {
    const rows = group.items.map((item) => `
      <div class="service-row">
        <div class="service-copy">
          <div class="service-title">${item.title}</div>
          <div class="service-desc">${item.description}</div>
        </div>
        <div class="service-meta">
          <div class="service-meta-top">${item.rateLabel}${item.quantity > 1 ? ` x ${item.quantity}` : ''}</div>
          <div class="service-meta-sub">${item.billingLabel}</div>
        </div>
        <div class="service-amount">${item.amountLabel}</div>
      </div>`).join('');

    return `
      <section class="service-group">
        <div class="service-group-header">
          <div>
            <h3>${group.icon} ${group.title}</h3>
            <p>${group.subtitle}</p>
          </div>
          <div class="service-group-subtotal">${group.subtotalLabel}</div>
        </div>
        <div class="service-group-body">${rows}</div>
      </section>`;
  }).join('');

  const gstRow = presentation.taxEnabled
    ? `<div class="total-row"><span>${presentation.gstDisplayLabel} (${presentation.gstRateLabel})</span><strong>${presentation.taxAmountLabel}</strong></div>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Quotation &ndash; ${presentation.serviceTypeLabel}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;color:#142033;background:#eef2f7;padding:26px}
    .sheet{max-width:820px;margin:0 auto;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 18px 44px rgba(15,23,42,0.14)}
    .topbar{background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);color:#ffffff;padding:28px 30px 24px}
    .header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start}
    .brand{display:flex;gap:16px;max-width:62%}
    .logo{width:68px;height:68px;border-radius:18px;background:rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;overflow:hidden;flex:0 0 68px;border:1px solid rgba(255,255,255,0.16)}
    .logo img{width:100%;height:100%;object-fit:cover}
    .logo-fallback{font-size:24px;font-weight:800;letter-spacing:1px;color:#fff}
    .brand h1{font-size:29px;line-height:1.1;margin-bottom:4px}
    .tagline{font-size:13px;color:rgba(255,255,255,0.78);margin-bottom:12px}
    .contact-line{font-size:12px;line-height:1.6;color:rgba(255,255,255,0.88)}
    .quote-panel{min-width:220px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:18px;padding:18px 18px 16px}
    .quote-kicker{font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:#bfdbfe;margin-bottom:8px;font-weight:700}
    .quote-panel h2{font-size:30px;line-height:1;margin-bottom:12px}
    .quote-panel .meta-line{font-size:12px;line-height:1.6;color:rgba(255,255,255,0.88)}
    .body{padding:28px 30px 30px}
    .intro-card,.cta-card,.terms-card,.notes-card,.offer-card{background:#f8fafc;border:1px solid #dbe5f0;border-radius:18px;padding:18px 20px}
    .intro-card{margin-bottom:18px}
    .intro-card h3{font-size:18px;margin-bottom:8px;color:#0f172a}
    .intro-card p{font-size:14px;line-height:1.7;color:#475569}
    .confidence{margin-top:10px;font-weight:600;color:#0f172a}
    .summary-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:16px;margin-bottom:18px;break-inside:avoid;page-break-inside:avoid}
    .summary-card{background:#ffffff;border:1px solid #dbe5f0;border-radius:18px;padding:18px 20px;break-inside:avoid;page-break-inside:avoid}
    .summary-label{font-size:11px;text-transform:uppercase;letter-spacing:1.1px;color:#64748b;font-weight:700;margin-bottom:7px}
    .summary-value{font-size:17px;font-weight:700;color:#0f172a;line-height:1.4}
    .summary-sub{font-size:13px;color:#64748b;line-height:1.6;margin-top:6px}
    .total-card{background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%);border-color:#bfdbfe}
    .total-card .summary-value{font-size:28px;color:#1d4ed8}
    .section-title{font-size:12px;text-transform:uppercase;letter-spacing:1.2px;color:#64748b;font-weight:800;margin:20px 0 12px;break-after:avoid;page-break-after:avoid}
    .timeline{background:#fff;border:1px solid #dbe5f0;border-radius:18px;padding:16px 18px;margin-bottom:18px;break-inside:avoid;page-break-inside:avoid}
    .timeline-row{display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid #edf2f7;break-inside:avoid;page-break-inside:avoid}
    .timeline-row:last-child{border-bottom:0;padding-bottom:0}
    .timeline-label{font-size:13px;font-weight:700;color:#0f172a}
    .timeline-value{font-size:13px;color:#475569;text-align:right}
    .service-group{border:1px solid #dbe5f0;border-radius:20px;overflow:visible;margin-bottom:16px;background:#fff;break-inside:auto;page-break-inside:auto}
    .service-group-header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;background:linear-gradient(135deg,#0f172a 0%,#1e2f57 100%);padding:16px 18px;color:#fff;break-after:avoid;page-break-after:avoid}
    .service-group-header h3{font-size:20px;margin-bottom:4px}
    .service-group-header p{font-size:12px;color:rgba(255,255,255,0.78);line-height:1.5}
    .service-group-subtotal{font-size:15px;font-weight:800;white-space:nowrap;background:rgba(255,255,255,0.12);border-radius:999px;padding:8px 12px}
    .service-group-body{padding:6px 18px 8px;break-inside:auto;page-break-inside:auto}
    .service-row{display:grid;grid-template-columns:1.5fr .7fr .45fr;gap:14px;align-items:center;padding:14px 0;border-bottom:1px solid #edf2f7;break-inside:avoid;page-break-inside:avoid}
    .service-row:last-child{border-bottom:0}
    .service-title{font-size:15px;font-weight:700;color:#0f172a;margin-bottom:4px}
    .service-desc{font-size:12px;line-height:1.6;color:#64748b}
    .service-meta{text-align:right}
    .service-meta-top{font-size:13px;font-weight:700;color:#0f172a}
    .service-meta-sub{font-size:11px;color:#64748b;margin-top:4px}
    .service-amount{text-align:right;font-size:15px;font-weight:800;color:#0f172a}
    .totals-card{background:#0f172a;color:#fff;border-radius:22px;padding:20px 22px;margin:18px 0;break-inside:avoid;page-break-inside:avoid}
    .totals-card h3{font-size:14px;text-transform:uppercase;letter-spacing:1.2px;color:#cbd5e1;margin-bottom:12px}
    .total-row{display:flex;justify-content:space-between;gap:16px;padding:6px 0;font-size:14px;color:#e2e8f0}
    .grand-total{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-top:12px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.14)}
    .grand-total span{font-size:13px;text-transform:uppercase;letter-spacing:1.2px;color:#93c5fd;font-weight:700}
    .grand-total strong{font-size:32px;color:#ffffff;line-height:1}
    .cta-card{background:linear-gradient(135deg,#eff6ff 0%,#f8fafc 100%);margin-bottom:16px;break-inside:avoid;page-break-inside:avoid}
    .cta-card h3,.terms-card h3,.offer-card h3,.notes-card h3{font-size:17px;color:#0f172a;margin-bottom:10px}
    .cta-card p,.offer-card p,.notes-card p{font-size:13px;line-height:1.7;color:#475569}
    .cta-actions{margin-top:10px;font-size:14px;line-height:1.8;color:#0f172a;font-weight:700}
    .terms-card{background:#fff5f5;border:1px solid #fca5a5;border-left:4px solid #dc2626;break-inside:avoid;page-break-inside:avoid}
    .terms-card h3{font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#dc2626;font-weight:800;margin-bottom:10px}
    .terms-list{padding-left:18px}
    .terms-list li{margin-bottom:8px;font-size:13px;line-height:1.7;color:#7f1d1d}
    .offer-card{background:linear-gradient(135deg,#fff7ed 0%,#fef3c7 100%);border:2px solid #f59e0b;break-inside:avoid;page-break-inside:avoid}
    .offer-pill{display:inline-block;background:#f59e0b;color:#fff;font-size:10px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;padding:3px 10px;border-radius:999px;margin-bottom:10px}
    .offer-card p{color:#78350f;font-weight:600}
    .offer-card .offer-note{font-size:13px;line-height:1.7;color:#92400e;margin-top:8px;font-weight:500}
    .footer{margin-top:22px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;line-height:1.7;break-inside:avoid;page-break-inside:avoid}
    @media print{body{background:white}.sheet{box-shadow:none;border-radius:0}.intro-card,.summary-grid,.summary-card,.timeline,.timeline-row,.service-row,.totals-card,.cta-card,.terms-card,.offer-card,.notes-card,.footer{break-inside:avoid;page-break-inside:avoid}.service-group{break-inside:auto;page-break-inside:auto}.service-group-header,.section-title{break-after:avoid;page-break-after:avoid}}
  </style>
</head>
<body>
  <div class="sheet">
    <div class="topbar">
      <div class="header">
        <div class="brand">
          <div class="logo">
            ${presentation.logoDataUri ? `<img src="${presentation.logoDataUri}" alt="${presentation.studioName} logo">` : `<div class="logo-fallback">${presentation.brandInitials}</div>`}
          </div>
          <div>
            <h1>${presentation.studioName}</h1>
            <div class="tagline">Premium studio sessions, production support, and polished delivery for serious artists.</div>
            ${presentation.studioAddress ? `<div class="contact-line"><strong>Address:</strong> ${presentation.studioAddress}</div>` : ''}
            <div class="contact-line"><strong>Phone / WhatsApp:</strong> ${presentation.studioPhone}</div>
            <div class="contact-line"><strong>Email:</strong> ${presentation.studioEmail}</div>
          </div>
        </div>
        <div class="quote-panel">
          <div class="quote-kicker">Premium Studio Quotation</div>
          <h2>QUOTATION</h2>
          <div class="meta-line"><strong>Quotation For:</strong> ${presentation.serviceTypeLabel}</div>
          <div class="meta-line"><strong>Generated On:</strong> ${presentation.generatedAtLabel}</div>
          ${presentation.selectedTypeLabels.length > 0 ? `<div class="meta-line"><strong>Includes:</strong> ${presentation.selectedTypeLabels.join(', ')}</div>` : ''}
        </div>
      </div>
    </div>
    <div class="body">
      <section class="intro-card">
        <h3>${presentation.recipientName ? `Hello ${presentation.recipientName},` : 'Hello,'}</h3>
        <p>${presentation.introLine}</p>
        <p class="confidence">${presentation.confidenceLine}</p>
      </section>

      <div class="summary-grid">
        <div class="summary-card">
          <div class="summary-label">Service Overview</div>
          <div class="summary-value">${presentation.serviceTypeLabel}</div>
          <div class="summary-sub">${presentation.selectedTypeLabels.length > 0 ? `Includes ${presentation.selectedTypeLabels.join(', ')}.` : 'Tailored studio and production quotation.'}</div>
        </div>
        <div class="summary-card total-card">
          <div class="summary-label">Estimated Total</div>
          <div class="summary-value">${presentation.totalAmountLabel}</div>
          <div class="summary-sub">Review the grouped services below for schedule, inclusions, and pricing breakup.</div>
        </div>
      </div>

      ${scheduleRows.length > 0 ? `
      <div class="section-title">Session Schedule</div>
      <section class="timeline">${scheduleRows.join('')}</section>` : ''}

      <div class="section-title">Selected Services</div>
      ${serviceGroupSections || '<p style="font-size:13px;color:#64748b;">No services selected.</p>'}

      <section class="totals-card">
        <h3>Pricing Summary</h3>
        <div class="total-row"><span>Subtotal</span><strong>${presentation.subtotalAmountLabel}</strong></div>
        ${gstRow}
        <div class="grand-total"><span>Estimated Total</span><strong>${presentation.totalAmountLabel}</strong></div>
      </section>

      <section class="cta-card">
        <h3>To Confirm Your Booking</h3>
        <p>Please use either of the quick options below so we can reserve your slot and move to the next step quickly.</p>
        <div class="cta-actions">
          <div>Reply with <strong>CONFIRM</strong> to this quotation email.</div>
          <div>${presentation.studioWhatsAppLink ? `Or WhatsApp us at <strong>${presentation.studioPhone}</strong>.` : `Call or message us at <strong>${presentation.studioPhone}</strong>.`}</div>
        </div>
      </section>

      <section class="terms-card">
        <h3>⚠ Booking Terms</h3>
        <ul class="terms-list">${presentation.bookingTerms.map((term) => `<li>${term}</li>`).join('')}</ul>
      </section>

      <section class="offer-card" style="margin-top:16px;">
        <div class="offer-pill">🎁 Special Offer</div>
        <p>${presentation.offerLine}</p>
        <div class="offer-note">Reach out to us for special packages tailored to your project needs.</div>
      </section>

      ${presentation.quoteNotes ? `<section class="notes-card" style="margin-top:16px;"><h3>Additional Notes</h3><p>${presentation.quoteNotes}</p></section>` : ''}

      <div class="footer">
        This quotation is a professional estimate prepared by ${presentation.studioName}. Final confirmation is subject to availability, advance payment, and scope lock at the time of booking.
      </div>
    </div>
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
      try { await browser.close(); } catch (closeError) { /* ignore */ }
    }
    throw new Error(`Quotation PDF generation failed: ${error.message}`);
  }
};

module.exports = {
  generateBill,
  generateBillForDownload,
  generateBillForDownloadWithFilename,
  generateBillFilename,
  generateBillHTML,
  generateQuotationPDF,
  generateQuotationHTML,
  buildQuotationPresentationData
};