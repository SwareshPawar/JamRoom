const express = require('express');
const router = express.Router();
const { generateCalendarInvite } = require('../utils/calendar');

const MAX_BASELINE_ENTRIES = 500;

const ensureBaselineStore = (app) => {
  if (!app.locals.performanceBaseline) {
    app.locals.performanceBaseline = {
      pageMetrics: [],
      apiPayloads: []
    };
  }
  if (!Array.isArray(app.locals.performanceBaseline.pageMetrics)) {
    app.locals.performanceBaseline.pageMetrics = [];
  }
  if (!Array.isArray(app.locals.performanceBaseline.apiPayloads)) {
    app.locals.performanceBaseline.apiPayloads = [];
  }
  return app.locals.performanceBaseline;
};

// Simple WhatsApp test without database dependency
const testWhatsApp = async (mobile, message) => {
  try {
    // Test with console log first (no API required)
    console.log('🧪 WhatsApp Test Message:');
    console.log('To:', mobile);
    console.log('Message:', message);
    console.log('Timestamp:', new Date().toISOString());
    
    // Try Twilio if configured
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      const twilio = require('twilio');
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      
      let whatsappNumber = mobile.replace(/[^\d]/g, '');
      if (whatsappNumber.length === 10) {
        whatsappNumber = '+91' + whatsappNumber;
      } else if (whatsappNumber.length === 12 && whatsappNumber.startsWith('91')) {
        whatsappNumber = '+' + whatsappNumber;
      }
      
      const result = await client.messages.create({
        body: message,
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER || '+14155238886'}`,
        to: `whatsapp:${whatsappNumber}`
      });

      return { success: true, provider: 'twilio', data: { sid: result.sid, status: result.status } };
    }
    
    // If no API configured, return console success
    return { 
      success: true, 
      provider: 'console', 
      message: 'Message logged to console (no WhatsApp API configured)'
    };
  } catch (error) {
    console.error('WhatsApp test error:', error);
    return { success: false, error: error.message };
  }
};

// @route   POST /api/test/whatsapp
// @desc    Test WhatsApp functionality
// @access  Public (for testing)
router.post('/whatsapp', async (req, res) => {
  try {
    const { mobile, message } = req.body;
    
    if (!mobile) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number is required'
      });
    }

    const testMessage = message || `🧪 JamRoom WhatsApp Test

This is a test message from your JamRoom booking system.

✅ If you received this WhatsApp message, the integration is working correctly!
📱 Your number: ${mobile}
⏰ Test time: ${new Date().toLocaleString('en-IN')}

Next steps:
1. Set up your WhatsApp API credentials in .env file
2. Configure notification recipients in admin panel
3. Test booking notifications

JamRoom Team 🎵`;

    const result = await testWhatsApp(mobile, testMessage);
    
    res.json({
      success: result.success,
      message: result.success ? 'WhatsApp test completed' : 'WhatsApp test failed',
      details: result,
      instructions: {
        console: 'Check your terminal/console for the message details',
        twilio: result.provider === 'twilio' ? 'Message sent via Twilio WhatsApp API' : null,
        setup: result.provider === 'console' ? 'Configure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env to send actual WhatsApp messages' : null
      }
    });
  } catch (error) {
    console.error('WhatsApp test route error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during WhatsApp test'
    });
  }
});

// @route   GET /api/test/whatsapp-config
// @desc    Check WhatsApp configuration status
// @access  Public (for testing)
router.get('/whatsapp-config', (req, res) => {
  const config = {
    twilio: {
      configured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
      accountSid: process.env.TWILIO_ACCOUNT_SID ? 'Set' : 'Not set',
      authToken: process.env.TWILIO_AUTH_TOKEN ? 'Set' : 'Not set',
      whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER || '+14155238886 (default sandbox)'
    },
    msg91: {
      configured: !!process.env.MSG91_API_KEY,
      apiKey: process.env.MSG91_API_KEY ? 'Set' : 'Not set'
    },
    meta: {
      configured: !!(process.env.META_WHATSAPP_TOKEN && process.env.META_WHATSAPP_PHONE_ID),
      token: process.env.META_WHATSAPP_TOKEN ? 'Set' : 'Not set',
      phoneId: process.env.META_WHATSAPP_PHONE_ID ? 'Set' : 'Not set'
    }
  };

  res.json({
    success: true,
    message: 'WhatsApp configuration status',
    config,
    recommendations: {
      quickStart: 'Use Twilio WhatsApp Sandbox for immediate testing',
      production: 'Set up Meta WhatsApp Business API for production use',
      fallback: 'Configure multiple providers for reliability'
    }
  });
});

// @route   POST /api/test/dummy-booking
// @desc    Create a dummy booking to test WhatsApp notifications
// @access  Public (for testing)
router.post('/dummy-booking', async (req, res) => {
  try {
    const Booking = require('../models/Booking');
    const AdminSettings = require('../models/AdminSettings');
    const User = require('../models/User');
    const { sendBookingRequestNotifications } = require('../utils/whatsapp');

    // Create a dummy booking data
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const testBooking = {
      userName: req.body.userName || 'Test Customer',
      userEmail: req.body.userEmail || 'test@example.com',
      userMobile: req.body.userMobile || '+919172706306',
      date: tomorrow,
      startTime: '14:00',
      endTime: '16:00',
      duration: 2,
      rentals: [
        { name: 'JamRoom', price: 500, quantity: 1 },
        { name: 'Instruments', price: 300, quantity: 1 }
      ],
      subtotal: 1600,
      taxAmount: 0,
      price: 1600,
      bandName: req.body.bandName || 'Test Band',
      notes: 'Test booking for WhatsApp notification testing',
      paymentStatus: 'PENDING',
      bookingStatus: 'PENDING'
    };

    // Get admin settings for notifications
    const settings = await AdminSettings.getSettings();

    // Format date for display
    const displayDate = tomorrow.toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Send WhatsApp notifications
    const whatsappResult = await sendBookingRequestNotifications({
      userName: testBooking.userName,
      userEmail: testBooking.userEmail,
      userMobile: testBooking.userMobile,
      date: displayDate,
      startTime: testBooking.startTime,
      endTime: testBooking.endTime,
      totalAmount: testBooking.price,
      bandName: testBooking.bandName
    }, settings.whatsappNotifications);

    res.json({
      success: true,
      message: 'Dummy booking WhatsApp notifications sent!',
      bookingDetails: {
        customer: testBooking.userName,
        mobile: testBooking.userMobile,
        date: displayDate,
        time: `${testBooking.startTime}-${testBooking.endTime}`,
        amount: testBooking.price
      },
      whatsappResult,
      instructions: [
        'Check your WhatsApp messages on the business number',
        'Check configured staff numbers for notifications',
        'Verify the message format and content',
        'Test the admin approval process next'
      ]
    });
  } catch (error) {
    console.error('Dummy booking test error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating dummy booking test',
      error: error.message
    });
  }
});

// @route   POST /api/test/perf-metrics
// @desc    Store client baseline performance metrics
// @access  Public (for testing)
router.post('/perf-metrics', (req, res) => {
  try {
    const store = ensureBaselineStore(req.app);
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    const record = {
      page: String(body.page || ''),
      pageLabel: String(body.pageLabel || ''),
      navigationType: String(body.navigationType || ''),
      transferSize: Number.isFinite(Number(body.transferSize)) ? Number(body.transferSize) : null,
      encodedBodySize: Number.isFinite(Number(body.encodedBodySize)) ? Number(body.encodedBodySize) : null,
      decodedBodySize: Number.isFinite(Number(body.decodedBodySize)) ? Number(body.decodedBodySize) : null,
      domContentLoadedMs: Number.isFinite(Number(body.domContentLoadedMs)) ? Number(body.domContentLoadedMs) : null,
      loadEventMs: Number.isFinite(Number(body.loadEventMs)) ? Number(body.loadEventMs) : null,
      firstContentfulPaintMs: Number.isFinite(Number(body.firstContentfulPaintMs)) ? Number(body.firstContentfulPaintMs) : null,
      largestContentfulPaintMs: Number.isFinite(Number(body.largestContentfulPaintMs)) ? Number(body.largestContentfulPaintMs) : null,
      firstInteractionMs: Number.isFinite(Number(body.firstInteractionMs)) ? Number(body.firstInteractionMs) : null,
      firstInteractionDelayMs: Number.isFinite(Number(body.firstInteractionDelayMs)) ? Number(body.firstInteractionDelayMs) : null,
      userAgent: String(req.headers['user-agent'] || ''),
      at: new Date().toISOString()
    };

    store.pageMetrics.push(record);
    if (store.pageMetrics.length > MAX_BASELINE_ENTRIES) {
      store.pageMetrics.shift();
    }

    res.json({ success: true, message: 'Metric captured' });
  } catch (error) {
    console.error('Perf metrics ingest error:', error);
    res.status(500).json({ success: false, message: 'Failed to capture metric' });
  }
});

// @route   GET /api/test/perf-baseline
// @desc    Get baseline metrics snapshot (client + server payload sizes)
// @access  Public (for testing)
router.get('/perf-baseline', (req, res) => {
  try {
    const store = ensureBaselineStore(req.app);
    const page = String(req.query.page || '').trim();

    const pageMetrics = page
      ? store.pageMetrics.filter((entry) => entry.pageLabel === page)
      : store.pageMetrics;

    const payloadMetrics = store.apiPayloads;

    const average = (values) => {
      if (!values.length) return null;
      const sum = values.reduce((acc, value) => acc + value, 0);
      return Number((sum / values.length).toFixed(2));
    };

    const pageSummary = {
      samples: pageMetrics.length,
      avgTransferKB: average(pageMetrics.filter((m) => Number.isFinite(m.transferSize)).map((m) => m.transferSize / 1024)),
      avgDomContentLoadedMs: average(pageMetrics.filter((m) => Number.isFinite(m.domContentLoadedMs)).map((m) => m.domContentLoadedMs)),
      avgFcpMs: average(pageMetrics.filter((m) => Number.isFinite(m.firstContentfulPaintMs)).map((m) => m.firstContentfulPaintMs)),
      avgLcpMs: average(pageMetrics.filter((m) => Number.isFinite(m.largestContentfulPaintMs)).map((m) => m.largestContentfulPaintMs)),
      avgFirstInteractionMs: average(pageMetrics.filter((m) => Number.isFinite(m.firstInteractionMs)).map((m) => m.firstInteractionMs)),
      avgFirstInteractionDelayMs: average(pageMetrics.filter((m) => Number.isFinite(m.firstInteractionDelayMs)).map((m) => m.firstInteractionDelayMs))
    };

    const payloadByEndpoint = payloadMetrics.reduce((acc, entry) => {
      if (!acc[entry.endpoint]) {
        acc[entry.endpoint] = [];
      }
      acc[entry.endpoint].push(entry.payloadBytes);
      return acc;
    }, {});

    const payloadSummary = Object.keys(payloadByEndpoint).map((endpoint) => {
      const values = payloadByEndpoint[endpoint];
      const min = Math.min(...values);
      const max = Math.max(...values);
      const avg = average(values);
      return {
        endpoint,
        samples: values.length,
        minBytes: min,
        maxBytes: max,
        avgBytes: avg,
        avgKB: avg === null ? null : Number((avg / 1024).toFixed(2))
      };
    });

    res.json({
      success: true,
      summary: {
        page: page || 'all',
        pageSummary,
        payloadSummary
      },
      metrics: {
        pageMetrics: pageMetrics.slice(-100),
        payloadMetrics: payloadMetrics.slice(-100)
      }
    });
  } catch (error) {
    console.error('Perf baseline fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch baseline metrics' });
  }
});

// @route   DELETE /api/test/perf-baseline
// @desc    Reset collected baseline metrics
// @access  Public (for testing)
router.delete('/perf-baseline', (req, res) => {
  const store = ensureBaselineStore(req.app);
  store.pageMetrics = [];
  store.apiPayloads = [];

  res.json({ success: true, message: 'Baseline metrics reset' });
});

// @route   POST /api/test/admin-booking
// @desc    Test admin booking creation functionality
// @access  Public (for testing)
router.post('/admin-booking', async (req, res) => {
  try {
    const AdminSettings = require('../models/AdminSettings');
    const { sendBookingConfirmationNotifications } = require('../utils/whatsapp');

    // Create admin booking test data
    const testDate = new Date();
    testDate.setDate(testDate.getDate() + 2); // Day after tomorrow
    testDate.setHours(0, 0, 0, 0);

    const testAdminBooking = {
      userName: req.body.userName || 'Admin Test Customer',
      userEmail: req.body.userEmail || 'admintest@example.com',
      userMobile: req.body.userMobile || '+919172706306',
      date: testDate.toISOString().split('T')[0],
      startTime: '15:00',
      endTime: '17:00',
      duration: 2,
      rentals: [
        { name: 'Jam Room', price: 200, quantity: 1, rentalType: 'inhouse' },
        { name: 'Guitar (Per-day)', price: 0, quantity: 1, rentalType: 'perday', perdayPrice: 800 },
        { name: 'Microphone', price: 50, quantity: 2, rentalType: 'inhouse' }
      ],
      subtotal: 1000,
      taxAmount: 180,
      totalAmount: 1180,
      bandName: req.body.bandName || 'Admin Test Band',
      notes: 'Test booking created via admin panel for testing notifications',
      paymentStatus: 'PENDING',
      bookingStatus: 'CONFIRMED'
    };

    // Simulate the admin booking API call
    const adminBookingData = {
      ...testAdminBooking,
      date: testDate.toISOString().split('T')[0]
    };

    // Test the pricing calculations
    let calculatedSubtotal = 0;
    const pricingBreakdown = [];
    
    for (const rental of testAdminBooking.rentals) {
      let itemTotal;
      if (rental.rentalType === 'perday') {
        itemTotal = (rental.perdayPrice || rental.price) * rental.quantity;
        pricingBreakdown.push(`${rental.name}: ₹${rental.perdayPrice || rental.price} × ${rental.quantity} (per day) = ₹${itemTotal}`);
      } else {
        itemTotal = rental.price * rental.quantity * testAdminBooking.duration;
        pricingBreakdown.push(`${rental.name}: ₹${rental.price} × ${rental.quantity} × ${testAdminBooking.duration}h = ₹${itemTotal}`);
      }
      calculatedSubtotal += itemTotal;
    }

    const gstRate = 0.18;
    const calculatedTaxAmount = Math.round(calculatedSubtotal * gstRate);
    const calculatedTotalAmount = calculatedSubtotal + calculatedTaxAmount;

    // Get admin settings for notifications
    const settings = await AdminSettings.getSettings();

    // Format date for display
    const displayDate = testDate.toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Send WhatsApp notifications (similar to actual admin booking creation)
    const whatsappResult = await sendBookingConfirmationNotifications({
      userName: testAdminBooking.userName,
      userEmail: testAdminBooking.userEmail,
      userMobile: testAdminBooking.userMobile,
      date: displayDate,
      startTime: testAdminBooking.startTime,
      endTime: testAdminBooking.endTime,
      totalAmount: calculatedTotalAmount,
      bookingId: 'TEST-' + Date.now(),
      bandName: testAdminBooking.bandName,
      paymentStatus: testAdminBooking.paymentStatus
    }, settings.whatsappNotifications);

    res.json({
      success: true,
      message: 'Admin booking creation test completed successfully!',
      testResults: {
        bookingDetails: {
          customer: testAdminBooking.userName,
          mobile: testAdminBooking.userMobile,
          date: displayDate,
          time: `${testAdminBooking.startTime}-${testAdminBooking.endTime}`,
          duration: `${testAdminBooking.duration} hours`,
          bandName: testAdminBooking.bandName
        },
        pricingCalculation: {
          breakdown: pricingBreakdown,
          subtotal: `₹${calculatedSubtotal}`,
          gst: `₹${calculatedTaxAmount} (18%)`,
          total: `₹${calculatedTotalAmount}`,
          expectedSubtotal: `₹${testAdminBooking.subtotal}`,
          calculationMatch: calculatedSubtotal === testAdminBooking.subtotal
        },
        notifications: whatsappResult
      },
      validationChecks: {
        perdayPricing: 'Guitar (Per-day) calculated without duration factor',
        hourlyPricing: 'Jam Room and Microphone calculated with duration factor',
        gstCalculation: `18% GST applied correctly: ₹${calculatedSubtotal} × 0.18 = ₹${calculatedTaxAmount}`,
        adminNotifications: 'WhatsApp notifications sent to business and staff numbers',
        customerNotification: 'Customer notification sent (if mobile provided)'
      },
      instructions: [
        'Check admin booking creation UI works correctly',
        'Verify per-day vs hourly rental calculations',
        'Test WhatsApp notifications for admin-created bookings',
        'Confirm booking appears in manage bookings tab',
        'Validate email notifications are sent properly'
      ]
    });
  } catch (error) {
    console.error('Admin booking test error:', error);
    res.status(500).json({
      success: false,
      message: 'Error testing admin booking creation',
      error: error.message
    });
  }
});

// @route   GET /api/test/calendar-preview
// @desc    Preview generated calendar invite payload for timezone verification
// @access  Public (for testing)
router.get('/calendar-preview', (req, res) => {
  try {
    const {
      date = '2026-05-03',
      startTime = '11:00',
      endTime = '14:00',
      title = 'JamRoom Booking Preview'
    } = req.query;

    const calendarInvite = generateCalendarInvite({
      title: String(title),
      description: 'Calendar preview endpoint',
      location: 'Swar JamRoom & Music Studio',
      startDate: String(date),
      startTime: String(startTime),
      endTime: String(endTime),
      attendees: []
    });

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.status(200).send(calendarInvite);
  } catch (error) {
    console.error('Calendar preview test error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate calendar preview',
      error: error.message
    });
  }
});

module.exports = router;