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