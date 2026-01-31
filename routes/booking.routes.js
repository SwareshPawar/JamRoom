const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const BlockedTime = require('../models/BlockedTime');
const User = require('../models/User');
const AdminSettings = require('../models/AdminSettings');
const { protect } = require('../middleware/auth');
const { sendEmail } = require('../utils/email');
const { generateCalendarInvite } = require('../utils/calendar');
const { generateBill } = require('../utils/billGenerator');
const { 
  sendBookingRequestNotifications, 
  sendCustomerBookingRequestWhatsApp 
} = require('../utils/whatsapp');

/**
 * Helper function to check time conflicts
 */
const checkTimeConflict = (start1, end1, start2, end2) => {
  return (start1 < end2 && end1 > start2);
};

/**
 * Helper function to convert time string to minutes
 */
const timeToMinutes = (time) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

/**
 * Helper function to calculate end time from start time and duration
 */
const calculateEndTime = (startTime, duration) => {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = startMinutes + (duration * 60);
  const hours = Math.floor(endMinutes / 60) % 24;
  const minutes = endMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

// @route   POST /api/bookings
// @desc    Create a new booking with multiple rentals
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const { date, startTime, endTime, duration, rentals, subtotal, taxAmount, totalAmount, bandName, notes } = req.body;

    if (!date || !startTime || !endTime || !duration || !rentals || !Array.isArray(rentals) || rentals.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide date, startTime, endTime, duration, and at least one rental'
      });
    }

    // Validate rentals data
    for (const rental of rentals) {
      if (!rental.name || rental.price === undefined || rental.price === null || !rental.quantity) {
        return res.status(400).json({
          success: false,
          message: 'Each rental must have name, price, and quantity'
        });
      }
    }

    // Validate duration
    if (duration < 1) {
      return res.status(400).json({
        success: false,
        message: 'Duration must be at least 1 hour'
      });
    }

    // Convert date to start of day
    const bookingDate = new Date(date);
    bookingDate.setHours(0, 0, 0, 0);

    // Check for conflicts with existing bookings (only CONFIRMED bookings block slots)
    const existingBookings = await Booking.find({
      date: bookingDate,
      bookingStatus: 'CONFIRMED'
    });

    for (const booking of existingBookings) {
      if (checkTimeConflict(startTime, endTime, booking.startTime, booking.endTime)) {
        return res.status(400).json({
          success: false,
          message: `Time conflict with existing booking (${booking.startTime} - ${booking.endTime})`
        });
      }
    }

    // Check for conflicts with blocked times
    const blockedTimes = await BlockedTime.find({
      date: bookingDate
    });

    for (const blocked of blockedTimes) {
      if (checkTimeConflict(startTime, endTime, blocked.startTime, blocked.endTime)) {
        return res.status(400).json({
          success: false,
          message: `This time slot is blocked by admin (${blocked.startTime} - ${blocked.endTime})`
        });
      }
    }

    // Get admin settings for UPI details and GST configuration
    const settings = await AdminSettings.getSettings();
    
    // Validate and recalculate totals based on admin settings
    const calculatedSubtotal = subtotal || 0;
    const gstEnabled = settings.gstConfig?.enabled || false;
    const gstRate = gstEnabled ? (settings.gstConfig.rate || 0.18) : 0;
    
    // Recalculate tax amount based on current admin settings
    const calculatedTaxAmount = gstEnabled ? Math.round(calculatedSubtotal * gstRate) : 0;
    const calculatedTotalAmount = calculatedSubtotal + calculatedTaxAmount;
    
    console.log('GST Calculation:', {
      gstEnabled,
      gstRate,
      subtotal: calculatedSubtotal,
      taxAmount: calculatedTaxAmount,
      totalAmount: calculatedTotalAmount
    });

    // Create rental type summary for backward compatibility
    const rentalTypeSummary = rentals.length === 1 ? rentals[0].name : `Multiple Items (${rentals.length})`;

    // Create booking with multiple rentals
    const booking = await Booking.create({
      userId: req.user._id,
      date: bookingDate,
      startTime,
      endTime,
      duration,
      rentalType: rentalTypeSummary, // Legacy field
      rentals: rentals, // New multiple rentals array
      subtotal: calculatedSubtotal,
      taxAmount: calculatedTaxAmount,
      price: calculatedTotalAmount, // Total amount including tax
      userName: req.user.name,
      userEmail: req.user.email,
      userMobile: req.user.mobile,
      bandName,
      notes,
      paymentStatus: 'PENDING',
      bookingStatus: 'PENDING'
    });

    // Format date for display
    const displayDate = bookingDate.toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Create rentals summary for email with correct per-day pricing
    const rentalsSummary = rentals.map(rental => {
      let itemTotal;
      if (rental.rentalType === 'perday') {
        // Per-day rentals: use perdayPrice, no duration factor
        const perdayPrice = rental.perdayPrice || rental.price;
        itemTotal = perdayPrice * rental.quantity;
        return `<li>${rental.name} × ${rental.quantity} (per day) - ₹${itemTotal}</li>`;
      } else {
        // Hourly rentals: use price with duration factor
        itemTotal = rental.price * rental.quantity * duration;
        return `<li>${rental.name} × ${rental.quantity} × ${duration}h - ₹${itemTotal}</li>`;
      }
    }).join('');

    // Send confirmation email to user
    try {
      await sendEmail({
        to: req.user.email,
        subject: 'Booking Request Received - JamRoom',
        html: `
          <h2>Booking Request Received</h2>
          <p>Hi ${req.user.name},</p>
          <p>Your booking request has been received and is pending admin approval.</p>
          <h3>Booking Details:</h3>
          <ul>
            <li><strong>Date:</strong> ${displayDate}</li>
            <li><strong>Time:</strong> ${startTime} - ${endTime}</li>
            <li><strong>Duration:</strong> ${duration} hour(s)</li>
          </ul>
          <h3>Rentals:</h3>
          <ul>
            ${rentalsSummary}
          </ul>
          <h3>Price Breakdown:</h3>
          <ul>
            <li><strong>Subtotal:</strong> ₹${calculatedSubtotal}</li>
            ${gstEnabled ? `<li><strong>${settings.gstConfig.displayName || 'GST'} (${Math.round(gstRate * 100)}%):</strong> ₹${calculatedTaxAmount}</li>` : ''}
            <li><strong>Total Amount:</strong> ₹${calculatedTotalAmount}</li>
            <li><strong>Status:</strong> PENDING</li>
          </ul>
          <h3>Payment Details:</h3>
          <p><strong>UPI ID:</strong> ${settings.upiId}</p>
          <p><strong>Name:</strong> ${settings.upiName}</p>
          <p><strong>Amount:</strong> ₹${totalAmount || subtotal}</p>
          <p>Please complete the payment and wait for admin approval.</p>
          <p>You will receive a confirmation email once approved.</p>
        `
      });
    } catch (emailError) {
      console.log('Booking confirmation email failed:', emailError.message);
    }

    // Send WhatsApp confirmation to customer if mobile provided and opted in
    if (req.user.mobile && req.user.whatsappNotifications?.enabled && req.user.whatsappNotifications?.verified) {
      try {
        await sendCustomerBookingRequestWhatsApp(req.user.mobile, {
          userName: req.user.name,
          date: displayDate,
          startTime,
          endTime,
          duration,
          totalAmount: calculatedTotalAmount,
          upiId: settings.upiId,
          upiName: settings.upiName
        });
        console.log('Customer booking WhatsApp sent to:', req.user.mobile);
      } catch (whatsappError) {
        console.log('Customer booking WhatsApp failed:', whatsappError.message);
      }
    }

    // Notify admins
    try {
      for (const adminEmail of settings.adminEmails) {
        await sendEmail({
          to: adminEmail,
          subject: 'New Booking Request - JamRoom',
          html: `
            <h2>New Booking Request</h2>
            <h3>Booking Details:</h3>
            <ul>
              <li><strong>User:</strong> ${req.user.name} (${req.user.email})</li>
              ${req.user.mobile ? `<li><strong>Mobile:</strong> ${req.user.mobile}</li>` : ''}
              <li><strong>Date:</strong> ${displayDate}</li>
              <li><strong>Time:</strong> ${startTime} - ${endTime}</li>
              <li><strong>Duration:</strong> ${duration} hour(s)</li>
            </ul>
            <h3>Rentals:</h3>
            <ul>
              ${rentalsSummary}
            </ul>
            <h3>Price Details:</h3>
            <ul>
              <li><strong>Subtotal:</strong> ₹${calculatedSubtotal}</li>
              ${gstEnabled ? `<li><strong>${settings.gstConfig.displayName || 'GST'} (${Math.round(gstRate * 100)}%):</strong> ₹${calculatedTaxAmount}</li>` : ''}
              <li><strong>Total:</strong> ₹${calculatedTotalAmount}</li>
            </ul>
            ${bandName ? `<p><strong>Band Name:</strong> ${bandName}</p>` : ''}
            <p>Please review and approve/reject this booking in the admin panel.</p>
          `
        });
      }
    } catch (emailError) {
      console.log('Admin notification email failed:', emailError.message);
    }

    // Send WhatsApp notification to admin and other notification recipients
    try {
      await sendBookingRequestNotifications({
        userName: req.user.name,
        userEmail: req.user.email,
        userMobile: req.user.mobile,
        date: displayDate,
        startTime,
        endTime,
        totalAmount: calculatedTotalAmount,
        bandName
      }, settings.whatsappNotifications);
    } catch (whatsappError) {
      console.log('WhatsApp booking request notifications failed:', whatsappError.message);
    }

    res.status(201).json({
      success: true,
      message: 'Booking created successfully. Pending admin approval.',
      booking,
      upiDetails: {
        upiId: settings.upiId,
        upiName: settings.upiName,
        amount: calculatedTotalAmount
      }
    });
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating booking'
    });
  }
});

// @route   GET /api/bookings/availability
// @desc    Check availability for a specific date (for reference)
// @access  Public
router.get('/availability/:date', async (req, res) => {
  try {
    const date = new Date(req.params.date);
    date.setHours(0, 0, 0, 0);

    // Get all bookings for the date (show both PENDING and CONFIRMED for reference)
    const bookings = await Booking.find({
      date,
      bookingStatus: { $in: ['PENDING', 'CONFIRMED'] }
    }).select('startTime endTime rentalType bookingStatus');

    // Only confirmed bookings block new bookings
    const confirmedBookings = bookings.filter(b => b.bookingStatus === 'CONFIRMED');

    // Get all blocked times for the date
    const blockedTimes = await BlockedTime.find({
      date
    }).select('startTime endTime reason');

    res.json({
      success: true,
      date: date.toISOString().split('T')[0],
      bookings,
      blockedTimes
    });
  } catch (error) {
    console.error('Get availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching availability'
    });
  }
});

// @route   GET /api/bookings/my-bookings
// @desc    Get user's bookings
// @access  Private
router.get('/my-bookings', protect, async (req, res) => {
  try {
    const bookings = await Booking.find({ userId: req.user._id })
      .sort({ date: -1, startTime: -1 });

    res.json({
      success: true,
      count: bookings.length,
      bookings
    });
  } catch (error) {
    console.error('Get my bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching bookings'
    });
  }
});

// @route   GET /api/bookings/settings
// @desc    Get public booking settings (rental types and base price)
// @access  Public (no auth required)
router.get('/settings', async (req, res) => {
  try {
    const settings = await AdminSettings.getSettings();
    
    res.json({
      success: true,
      settings: {
        rentalTypes: settings.rentalTypes,
        basePrice: settings.basePrice,
        gstConfig: settings.gstConfig || { enabled: false, rate: 0.18, displayName: 'GST' }
      }
    });
  } catch (error) {
    console.error('Get public settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching settings'
    });
  }
});

// @route   GET /api/bookings/payment-info
// @desc    Get public payment information (UPI details)
// @access  Public (no auth required)
router.get('/payment-info', async (req, res) => {
  try {
    const settings = await AdminSettings.getSettings();
    
    res.json({
      success: true,
      paymentInfo: {
        upiId: settings.upiId || 'Not configured',
        upiName: settings.upiName || 'JamRoom Studio',
        // Don't expose other sensitive admin settings
      }
    });
  } catch (error) {
    console.error('Get payment info error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching payment info'
    });
  }
});

// @route   GET /api/bookings/:id
// @desc    Get single booking
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('userId', 'name email');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if user owns the booking or is admin
    if (booking.userId._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this booking'
      });
    }

    res.json({
      success: true,
      booking
    });
  } catch (error) {
    console.error('Get booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching booking'
    });
  }
});

// @route   PUT /api/bookings/:id/cancel
// @desc    Cancel a booking
// @access  Private
router.put('/:id/cancel', protect, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if user owns the booking
    if (booking.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to cancel this booking'
      });
    }

    // Check if booking can be cancelled
    if (booking.bookingStatus === 'CANCELLED') {
      return res.status(400).json({
        success: false,
        message: 'Booking is already cancelled'
      });
    }

    booking.bookingStatus = 'CANCELLED';
    await booking.save();

    const displayDate = booking.date.toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Send cancellation email
    try {
      await sendEmail({
        to: req.user.email,
        subject: 'Booking Cancelled - JamRoom',
        html: `
          <h2>Booking Cancelled</h2>
          <p>Hi ${req.user.name},</p>
          <p>Your booking has been cancelled.</p>
          <h3>Cancelled Booking Details:</h3>
          <ul>
            <li><strong>Date:</strong> ${displayDate}</li>
            <li><strong>Time:</strong> ${booking.startTime} - ${booking.endTime}</li>
            <li><strong>Rental Type:</strong> ${booking.rentalType}</li>
          </ul>
          <p>If you paid for this booking, please contact us for a refund.</p>
        `
      });
    } catch (emailError) {
      console.log('Cancellation email failed:', emailError.message);
    }

    res.json({
      success: true,
      message: 'Booking cancelled successfully',
      booking
    });
  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error cancelling booking'
    });
  }
});

// @route   GET /api/bookings/:id/download-pdf
// @desc    Download booking PDF for user
// @access  Private (user must own the booking)
router.get('/:id/download-pdf', protect, async (req, res) => {
  try {
    console.log('User PDF download requested for booking:', req.params.id);
    console.log('User making request:', req.user?.email);
    
    // Import bill generator with optimized download function
    const { generateBillForDownloadWithFilename } = require('../utils/billGenerator');
    
    const booking = await Booking.findById(req.params.id).populate('userId');
    
    if (!booking) {
      console.log('Booking not found:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    console.log('Booking found:', booking.userName, booking.userEmail);

    // Check if user owns the booking or is admin
    if (booking.userId._id.toString() !== req.user.id && req.user.role !== 'admin') {
      console.log('Access denied for user:', req.user.email, 'to booking:', req.params.id);
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Generate PDF bill and filename with single database call
    console.log('Starting PDF generation for environment:', process.env.NODE_ENV);
    console.log('VERCEL environment:', process.env.VERCEL);
    console.log('Available memory:', process.memoryUsage());
    
    const { pdfBuffer, filename } = await generateBillForDownloadWithFilename(booking);
    
    console.log('User PDF generated successfully, size:', pdfBuffer.length, 'filename:', filename);
    
    // Set response headers for PDF download with proper binary handling
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Send the PDF buffer as binary data
    res.end(pdfBuffer, 'binary');
  } catch (error) {
    console.error('Download PDF error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code
    });
    
    // Return more specific error message in development
    const isDevelopment = process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'development';
    
    res.status(500).json({
      success: false,
      message: 'Server error generating PDF',
      ...(isDevelopment && { error: error.message, stack: error.stack })
    });
  }
});

module.exports = router;
