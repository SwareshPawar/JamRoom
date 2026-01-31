const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const BlockedTime = require('../models/BlockedTime');
const User = require('../models/User');
const AdminSettings = require('../models/AdminSettings');
const { protect } = require('../middleware/auth');
const { isAdmin } = require('../middleware/admin');
const { sendEmail } = require('../utils/email');
const { generateCalendarInvite } = require('../utils/calendar');
const { generateBill, generateBillForDownload, generateBillFilename, generateBillForDownloadWithFilename } = require('../utils/billGenerator');
const { 
  sendBookingRequestNotifications, 
  sendBookingConfirmationNotifications, 
  sendBookingConfirmationWhatsApp,
  sendPaymentUpdateNotifications,
  sendCancellationNotifications,
  sendWhatsApp
} = require('../utils/whatsapp');

// @route   GET /api/admin/debug-pdf
// @desc    Debug PDF generation environment (for production troubleshooting)
// @access  Private/Admin
router.get('/debug-pdf', protect, isAdmin, async (req, res) => {
  try {
    const diagnostics = {
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL: process.env.VERCEL,
        VERCEL_ENV: process.env.VERCEL_ENV,
        isServerless: !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL_ENV)
      },
      memory: process.memoryUsage(),
      puppeteer: {
        installed: true,
        chromiumPackage: false
      },
      database: {
        connected: require('mongoose').connection.readyState === 1,
        readyState: require('mongoose').connection.readyState
      },
      timestamp: new Date().toISOString()
    };

    // Check if chromium package is available
    try {
      require('@sparticuz/chromium');
      diagnostics.puppeteer.chromiumPackage = true;
    } catch (e) {
      diagnostics.puppeteer.chromiumPackage = false;
    }

    res.json({
      success: true,
      diagnostics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Debug failed',
      error: error.message
    });
  }
});

// @route   GET /api/admin/debug-settings
// @desc    Debug settings values (temporary)
// @access  Private/Admin
router.get('/debug-settings', protect, isAdmin, async (req, res) => {
  try {
    const settings = await AdminSettings.getSettings();
    res.json({
      success: true,
      settings: {
        studioName: settings.studioName,
        studioAddress: settings.studioAddress,
        adminEmails: settings.adminEmails
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// @route   GET /api/admin/revenue
// @desc    Get revenue analytics with filtering
// @access  Private/Admin
router.get('/revenue', protect, isAdmin, async (req, res) => {
  try {
    const { filter, startDate, endDate, year, month, week } = req.query;
    let query = { bookingStatus: 'CONFIRMED', paymentStatus: 'PAID' };
    let dateRange = {};

    const now = new Date();

    switch (filter) {
      case 'today':
        dateRange = {
          $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          $lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
        };
        break;
      case 'week':
        if (week && year) {
          const firstDay = new Date(year, 0, 1 + (week - 1) * 7);
          const lastDay = new Date(firstDay);
          lastDay.setDate(lastDay.getDate() + 6);
          dateRange = { $gte: firstDay, $lte: lastDay };
        } else {
          // Current week
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() - now.getDay());
          startOfWeek.setHours(0, 0, 0, 0);
          const endOfWeek = new Date(startOfWeek);
          endOfWeek.setDate(endOfWeek.getDate() + 6);
          endOfWeek.setHours(23, 59, 59, 999);
          dateRange = { $gte: startOfWeek, $lte: endOfWeek };
        }
        break;
      case 'month':
        if (month && year) {
          dateRange = {
            $gte: new Date(parseInt(year), parseInt(month), 1),
            $lt: new Date(parseInt(year), parseInt(month) + 1, 1)
          };
        } else {
          // Current month
          dateRange = {
            $gte: new Date(now.getFullYear(), now.getMonth(), 1),
            $lt: new Date(now.getFullYear(), now.getMonth() + 1, 1)
          };
        }
        break;
      case 'year':
        if (year) {
          dateRange = {
            $gte: new Date(parseInt(year), 0, 1),
            $lt: new Date(parseInt(year) + 1, 0, 1)
          };
        } else {
          // Current year
          dateRange = {
            $gte: new Date(now.getFullYear(), 0, 1),
            $lt: new Date(now.getFullYear() + 1, 0, 1)
          };
        }
        break;
      case 'range':
        if (startDate && endDate) {
          dateRange = {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
          };
        }
        break;
      default:
        // All time - no date filter
        break;
    }

    if (Object.keys(dateRange).length > 0) {
      query.date = dateRange;
    }

    const bookings = await Booking.find(query)
      .populate('userId', 'name email')
      .sort({ date: -1, startTime: -1 });

    // Calculate revenue analytics
    const totalRevenue = bookings.reduce((sum, booking) => sum + booking.price, 0);
    const totalBookings = bookings.length;
    const avgBookingValue = totalBookings > 0 ? totalRevenue / totalBookings : 0;

    // Group by rental type
    const revenueByType = {};
    const bookingsByType = {};
    bookings.forEach(booking => {
      if (!revenueByType[booking.rentalType]) {
        revenueByType[booking.rentalType] = 0;
        bookingsByType[booking.rentalType] = 0;
      }
      revenueByType[booking.rentalType] += booking.price;
      bookingsByType[booking.rentalType] += 1;
    });

    // Group by date for trend analysis
    const revenueByDate = {};
    bookings.forEach(booking => {
      const dateKey = booking.date.toISOString().split('T')[0];
      if (!revenueByDate[dateKey]) {
        revenueByDate[dateKey] = 0;
      }
      revenueByDate[dateKey] += booking.price;
    });

    res.json({
      success: true,
      revenue: {
        totalRevenue,
        totalBookings,
        avgBookingValue: Math.round(avgBookingValue),
        revenueByType,
        bookingsByType,
        revenueByDate
      },
      bookings: bookings.map(booking => ({
        _id: booking._id,
        userName: booking.userName,
        userEmail: booking.userEmail,
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        duration: booking.duration,
        rentalType: booking.rentalType,
        price: booking.price,
        bandName: booking.bandName,
        createdAt: booking.createdAt
      }))
    });
  } catch (error) {
    console.error('Get revenue error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching revenue data'
    });
  }
});

// @route   GET /api/admin/bookings/calendar
// @desc    Get bookings formatted for calendar view
// @access  Private/Admin
router.get('/bookings/calendar', protect, isAdmin, async (req, res) => {
  try {
    const { month, year } = req.query;
    let startDate = new Date();
    let endDate = new Date();
    
    if (month && year) {
      startDate = new Date(parseInt(year), parseInt(month), 1);
      endDate = new Date(parseInt(year), parseInt(month) + 1, 0);
    } else {
      // Default to current month
      startDate.setDate(1);
      endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
    }
    
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    const bookings = await Booking.find({
      date: { $gte: startDate, $lte: endDate },
      bookingStatus: { $in: ['PENDING', 'CONFIRMED'] }
    }).populate('userId', 'name email').sort({ date: 1, startTime: 1 });

    // Format bookings for calendar
    const calendarEvents = bookings.map(booking => ({
      id: booking._id,
      title: `${booking.userName} - ${booking.rentalType}`,
      start: `${booking.date.toISOString().split('T')[0]}T${booking.startTime}:00`,
      end: `${booking.date.toISOString().split('T')[0]}T${booking.endTime}:00`,
      backgroundColor: booking.bookingStatus === 'CONFIRMED' ? '#28a745' : '#ffc107',
      borderColor: booking.bookingStatus === 'CONFIRMED' ? '#1e7e34' : '#d39e00',
      textColor: booking.bookingStatus === 'CONFIRMED' ? 'white' : 'black',
      extendedProps: {
        bookingId: booking._id,
        userName: booking.userName,
        userEmail: booking.userEmail,
        bandName: booking.bandName,
        rentalType: booking.rentalType,
        price: booking.price,
        status: booking.bookingStatus,
        paymentStatus: booking.paymentStatus,
        notes: booking.notes
      }
    }));

    res.json({
      success: true,
      events: calendarEvents
    });
  } catch (error) {
    console.error('Get calendar bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching calendar data'
    });
  }
});

// @route   GET /api/admin/bookings
// @desc    Get all bookings
// @access  Private/Admin
router.get('/bookings', protect, isAdmin, async (req, res) => {
  try {
    const { status, date, startDate, endDate } = req.query;

    let query = {};

    if (status) {
      query.bookingStatus = status;
    }

    if (date) {
      const queryDate = new Date(date);
      queryDate.setHours(0, 0, 0, 0);
      query.date = queryDate;
    } else if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.date = { $gte: start, $lte: end };
    }

    const bookings = await Booking.find(query)
      .populate('userId', 'name email')
      .sort({ date: -1, startTime: -1 });

    res.json({
      success: true,
      count: bookings.length,
      bookings
    });
  } catch (error) {
    console.error('Get all bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching bookings'
    });
  }
});

// @route   PUT /api/admin/bookings/:id/approve
// @desc    Approve a booking
// @access  Private/Admin
router.put('/bookings/:id/approve', protect, isAdmin, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('userId');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if this is an old booking without the new schema
    if (!booking.startTime || !booking.endTime || !booking.duration || 
        !booking.userEmail || !booking.userName || !booking.rentalType || !booking.userId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot approve old booking. Please create a new booking with the updated system.'
      });
    }

    if (booking.bookingStatus === 'CONFIRMED') {
      return res.status(400).json({
        success: false,
        message: 'Booking is already confirmed'
      });
    }

    booking.bookingStatus = 'CONFIRMED';
    booking.paymentStatus = 'PAID';
    await booking.save();

    // After confirming this booking, reject overlapping pending bookings
    const timeToMinutes = (time) => {
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 60 + minutes;
    };

    const checkTimeConflict = (start1, end1, start2, end2) => {
      const s1 = timeToMinutes(start1);
      const e1 = timeToMinutes(end1);
      const s2 = timeToMinutes(start2);
      const e2 = timeToMinutes(end2);
      return (s1 < e2 && e1 > s2);
    };

    // Find and reject overlapping pending bookings
    const overlappingBookings = await Booking.find({
      _id: { $ne: booking._id },
      date: booking.date,
      bookingStatus: 'PENDING'
    });

    const settings = await AdminSettings.getSettings();
    console.log('DEBUG: Settings for calendar invite:', {
      studioName: settings.studioName,
      studioAddress: settings.studioAddress
    });
    
    const rejectedBookings = [];
    for (const pendingBooking of overlappingBookings) {
      if (checkTimeConflict(booking.startTime, booking.endTime, pendingBooking.startTime, pendingBooking.endTime)) {
        pendingBooking.bookingStatus = 'REJECTED';
        await pendingBooking.save();
        rejectedBookings.push(pendingBooking);

        // Send rejection email to user
        try {
          await sendEmail({
            to: pendingBooking.userEmail,
        subject: `Booking Request Update - ${settings.studioName || 'Swar JamRoom'}`,
            html: `
              <h2>Booking Request Update</h2>
              <p>Hi ${pendingBooking.userName},</p>
              <p>Unfortunately, your booking request for ${pendingBooking.date.toLocaleDateString('en-IN')} from ${pendingBooking.startTime} to ${pendingBooking.endTime} has been automatically rejected due to a scheduling conflict with another confirmed booking.</p>
              <p>Please feel free to make a new booking request for a different time slot.</p>
              <p>Thank you for your understanding.</p>
            `
          });
        } catch (emailError) {
          console.log('Rejection email failed for booking:', pendingBooking._id);
        }
      }
    }

    const displayDate = booking.date.toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Generate calendar invite
    const calendarInvite = generateCalendarInvite({
      title: `${settings.studioName || 'Swar JamRoom'} Booking - ${booking.rentalType}`,
      description: `Booking confirmed for ${booking.userName}${booking.bandName ? ` (${booking.bandName})` : ''}`,
      location: settings.studioAddress || 'Zen Business Center - 202, Bhumkar Chowk Rd, above Cafe Coffee Day, Shankar Kalat Nagar, Wakad, Pune, Pimpri-Chinchwad, Maharashtra 411057',
      startDate: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      attendees: [booking.userEmail, ...settings.adminEmails],
      studioName: settings.studioName || 'Swar JamRoom'
    });

    // Send confirmation email to user with calendar invite
    try {
      await sendEmail({
        to: booking.userEmail,
        subject: `Booking Confirmed - ${settings.studioName || 'Swar JamRoom'}`,
        html: `
          <h2>🎉 Booking Confirmed!</h2>
          <p>Hi ${booking.userName},</p>
          <p>Great news! Your booking has been confirmed.</p>
          <h3>Booking Details:</h3>
          <ul>
            <li><strong>Date:</strong> ${displayDate}</li>
            <li><strong>Time:</strong> ${booking.startTime} - ${booking.endTime}</li>
            <li><strong>Duration:</strong> ${booking.duration} hour(s)</li>
            <li><strong>Rental Type:</strong> ${booking.rentalType}</li>
            <li><strong>Price:</strong> ₹${booking.price}</li>
            ${booking.bandName ? `<li><strong>Band Name:</strong> ${booking.bandName}</li>` : ''}
          </ul>
          <p>A calendar invite is attached to this email.</p>
          <p>Looking forward to seeing you at ${settings.studioName || 'Swar JamRoom Studio'}!</p>
        `,
        attachments: [{
          filename: 'booking.ics',
          content: calendarInvite
        }]
      });
    } catch (emailError) {
      console.log('Confirmation email failed:', emailError.message);
    }

    // Send notification to all admins
    try {
      for (const adminEmail of settings.adminEmails) {
        await sendEmail({
          to: adminEmail,
          subject: `Booking Approved - ${settings.studioName || 'Swar JamRoom Studio'}`,
          html: `
            <h2>Booking Approved</h2>
            <p>A booking has been approved by ${req.user.name}.</p>
            <h3>Booking Details:</h3>
            <ul>
              <li><strong>User:</strong> ${booking.userName} (${booking.userEmail})</li>
              <li><strong>Date:</strong> ${displayDate}</li>
              <li><strong>Time:</strong> ${booking.startTime} - ${booking.endTime}</li>
              <li><strong>Duration:</strong> ${booking.duration} hour(s)</li>
              <li><strong>Rental Type:</strong> ${booking.rentalType}</li>
              <li><strong>Price:</strong> ₹${booking.price}</li>
            </ul>
          `,
          attachments: [{
            filename: 'booking.ics',
            content: calendarInvite
          }]
        });
      }
    } catch (emailError) {
      console.log('Admin notification email failed:', emailError.message);
    }

    // Send WhatsApp confirmation to customer if mobile provided
    if (booking.userMobile) {
      try {
        await sendBookingConfirmationWhatsApp(booking.userMobile, {
          bookingId: booking._id,
          date: displayDate,
          startTime: booking.startTime,
          endTime: booking.endTime,
          totalAmount: booking.price
        });
      } catch (whatsappError) {
        console.log('Customer WhatsApp confirmation failed:', whatsappError.message);
      }
    }

    // Send WhatsApp notifications to all staff
    try {
      await sendBookingConfirmationNotifications({
        userName: booking.userName,
        userEmail: booking.userEmail,
        userMobile: booking.userMobile,
        date: displayDate,
        startTime: booking.startTime,
        endTime: booking.endTime,
        totalAmount: booking.price,
        bookingId: booking._id,
        bandName: booking.bandName,
        paymentStatus: booking.paymentStatus
      }, settings.whatsappNotifications);
    } catch (whatsappError) {
      console.log('Staff WhatsApp notifications failed:', whatsappError.message);
    }

    res.json({
      success: true,
      message: 'Booking approved and confirmation sent',
      booking
    });
  } catch (error) {
    console.error('Approve booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error approving booking'
    });
  }
});

// @route   POST /api/admin/bookings/:id/send-ebill
// @desc    Send electronic bill to customer
// @access  Private/Admin
router.post('/bookings/:id/send-ebill', protect, isAdmin, async (req, res) => {
  try {
    // Helper function to convert 24-hour time to 12-hour format
    function formatTime12Hour(time24) {
      if (!time24) return time24;
      
      let timeStr = time24.toString();
      if (timeStr.includes('AM') || timeStr.includes('PM')) {
        return timeStr;
      }
      
      const timeParts = timeStr.split(':');
      if (timeParts.length < 2) return time24;
      
      let hours = parseInt(timeParts[0]);
      const minutes = timeParts[1];
      
      if (isNaN(hours)) return time24;
      
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      
      return `${hours}:${minutes} ${ampm}`;
    }
    
    const booking = await Booking.findById(req.params.id)
      .populate('userId');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if booking is confirmed
    if (booking.bookingStatus !== 'CONFIRMED') {
      return res.status(400).json({
        success: false,
        message: 'Only confirmed bookings can have eBills generated'
      });
    }

    // Check if this is an old booking without the new schema
    if (!booking.startTime || !booking.endTime || !booking.duration || 
        !booking.userEmail || !booking.userName || !booking.rentalType) {
      return res.status(400).json({
        success: false,
        message: 'Cannot generate eBill for old booking. Missing required fields.'
      });
    }

    // Get admin settings for company info
    const settings = await AdminSettings.getSettings();

    // Generate PDF bill and filename
    let pdfBuffer = null;
    let filename = generateBillFilename(booking, settings);
    
    // Generate PDF for eBill attachment (optimized for serverless)
    console.log('📄 Generating eBill PDF attachment...');
    
    try {
      // Use the download-optimized function which has better Vercel support
      pdfBuffer = await generateBillForDownload(booking);
      console.log('✅ eBill PDF generated successfully, size:', pdfBuffer?.length);
    } catch (error) {
      console.error('PDF generation failed for eBill:', error.message);
      console.error('Full error details:', error);
      
      // In serverless environments, provide more specific error info
      if (process.env.VERCEL || process.env.VERCEL_ENV) {
        console.error('🚨 Vercel serverless PDF generation failed. This might be due to:');
        console.error('   - Missing Chromium binary (check PUPPETEER_SKIP_CHROMIUM_DOWNLOAD)');
        console.error('   - Memory limitations (current: 1024MB)');
        console.error('   - Timeout issues (function timeout: 60s)');
        console.error('   - Cold start issues in serverless function');
        
        // For production, we'll send email without PDF but provide download link
        console.log('📧 Proceeding with email without PDF attachment (PDF download link will be provided)');
      }
      // Continue without PDF attachment but log the error
    }

    // Get customer email
    const customerEmail = booking.userEmail || booking.userId?.email;
    if (!customerEmail) {
      return res.status(400).json({
        success: false,
        message: 'No customer email available for this booking'
      });
    }

    const bookingDate = new Date(booking.date);
    const displayDate = bookingDate.toLocaleDateString('en-IN');

    // Calculate total with configurable GST
    const subtotal = booking.subtotal || booking.price;
    const gstEnabled = settings.gstConfig?.enabled || false;
    const gstRate = gstEnabled ? (settings.gstConfig.rate || 0.18) : 0;
    const gstDisplayName = settings.gstConfig?.displayName || 'GST';
    const taxAmount = gstEnabled ? Math.round(subtotal * gstRate) : 0;
    const totalAmount = subtotal + taxAmount;

    // Send email with PDF attachment
    const emailOptions = {
      to: customerEmail,
      subject: `Invoice for Your ${settings?.studioName || 'JamRoom'} Booking - ${displayDate}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">Invoice - ${settings?.studioName || 'JamRoom'} Booking</h1>
          </div>
          
          <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
            <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
              Dear ${booking.userName},
            </p>
            
            <p style="color: #666; line-height: 1.6;">
              Thank you for booking with ${settings?.studioName || 'JamRoom'}! Please find your electronic invoice attached to this email.
            </p>
            
            <div style="background: white; border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <h3 style="color: #667eea; margin-top: 0;">Booking Summary</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #333;">Date:</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #666;">${displayDate}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #333;">Time:</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #666;">${formatTime12Hour(booking.startTime)} - ${formatTime12Hour(booking.endTime)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #333;">Service:</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #666;">${booking.rentalType}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #333;">Duration:</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #666;">${booking.duration} hour(s)</td>
                </tr>
                ${gstEnabled ? `
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #333;">Subtotal:</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #666;">₹${subtotal.toFixed(2)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #333;">${gstDisplayName} (${Math.round(gstRate * 100)}%):</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #666;">₹${taxAmount.toFixed(2)}</td>
                </tr>
                ` : ''}
                <tr style="font-weight: bold; font-size: 16px; color: #667eea;">
                  <td style="padding: 12px 0; border-top: 2px solid #667eea;">Total Amount:</td>
                  <td style="padding: 12px 0; border-top: 2px solid #667eea;">₹${totalAmount.toFixed(2)}</td>
                </tr>
              </table>
            </div>
            
            ${booking.paymentStatus === 'PENDING' ? `
              <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 15px; margin: 20px 0;">
                <h4 style="color: #856404; margin-top: 0;">Payment Pending</h4>
                <p style="color: #856404; margin: 0;">
                  Please make the payment before your booking slot to confirm your reservation.
                </p>
              </div>
            ` : `
              <div style="background: #d4edda; border: 1px solid #c3e6cb; border-radius: 8px; padding: 15px; margin: 20px 0;">
                <h4 style="color: #155724; margin-top: 0;">Payment Confirmed</h4>
                <p style="color: #155724; margin: 0;">
                  Your payment has been received and your booking is confirmed!
                </p>
              </div>
            `}
            
            <p style="color: #666; line-height: 1.6; margin-top: 20px;">
              If you have any questions about your booking or this invoice, please don't hesitate to contact us.
            </p>
            
            <div style="border-top: 1px solid #ddd; padding-top: 20px; margin-top: 30px; text-align: center; color: #888; font-size: 14px;">
              <p><strong>${settings?.studioName || 'JamRoom Studio'}</strong></p>
              <p>${settings?.studioAddress || 'Studio Address'}</p>
              <p>Email: ${settings?.adminEmails?.[0] || 'admin@jamroom.com'}</p>
              ${settings?.studioPhone ? `<p>Phone: ${settings.studioPhone}</p>` : ''}
            </div>
            
            ${!pdfBuffer ? `
              <div style="background: #fff3e0; border: 1px solid #ffcc02; border-radius: 8px; padding: 15px; margin: 20px auto; max-width: 500px;">
                <p style="color: #e65100; margin: 0; font-size: 14px; text-align: center; margin-bottom: 12px;">
                  ⚠️ PDF invoice could not be attached due to technical issues.
                </p>
                <div style="text-align: center;">
                  <a href="${process.env.FRONTEND_URL || 'https://jamroom.vercel.app'}/booking.html" 
                     style="background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">
                    📄 Download Your Invoice PDF
                  </a>
                </div>
                <p style="color: #666; margin: 8px 0 0 0; font-size: 12px; text-align: center;">
                  Login to your account and download your detailed invoice PDF
                </p>
              </div>
            ` : `
              <div style="background: #e8f5e8; border: 1px solid #4caf50; border-radius: 8px; padding: 15px; margin: 20px auto; max-width: 500px;">
                <p style="color: #2e7d32; margin: 0; font-size: 14px; text-align: center;">
                  📎 Your detailed invoice PDF is attached to this email.
                </p>
              </div>
            `}
          </div>
        </div>
      `
    };
    
    // Add PDF attachment only if successfully generated
    if (pdfBuffer) {
      emailOptions.attachments = [{
        filename: filename,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }];
    }
    
    await sendEmail(emailOptions);

    // Log the eBill generation
    const pdfAttached = !!pdfBuffer;
    console.log(`eBill sent for booking ${booking._id} to ${customerEmail} by admin ${req.user.name}. PDF attached: ${pdfAttached}`);
    
    // Provide different success messages based on PDF attachment success
    let successMessage;
    if (pdfBuffer) {
      successMessage = 'Electronic bill sent successfully with PDF attachment';
    } else {
      if (process.env.VERCEL || process.env.VERCEL_ENV) {
        successMessage = 'Electronic bill sent successfully. PDF attachment failed due to serverless limitations - customer can download PDF from their dashboard';
      } else {
        successMessage = 'Electronic bill sent successfully (PDF attachment failed - customer can download separately)';
      }
    }

    res.json({
      success: true,
      message: successMessage,
      filename: filename,
      customerEmail: customerEmail
    });

  } catch (error) {
    console.error('Send eBill error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate and send electronic bill: ' + error.message
    });
  }
});

// @route   PUT /api/admin/bookings/:id/reject
// @desc    Reject a booking
// @access  Private/Admin
router.put('/bookings/:id/reject', protect, isAdmin, async (req, res) => {
  try {
    const { reason } = req.body;

    const booking = await Booking.findById(req.params.id)
      .populate('userId');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if this is an old booking without the new schema
    if (!booking.startTime || !booking.endTime || !booking.duration || 
        !booking.userEmail || !booking.userName || !booking.rentalType || !booking.userId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot reject old booking. Please delete it manually from the database.'
      });
    }

    booking.bookingStatus = 'REJECTED';
    if (reason) {
      booking.notes = (booking.notes ? booking.notes + '\n' : '') + `Rejection reason: ${reason}`;
    }
    await booking.save();

    const settings = await AdminSettings.getSettings();

    const displayDate = booking.date.toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Send rejection email to user
    try {
      await sendEmail({
        to: booking.userEmail,
        subject: `Booking Update - ${settings.studioName || 'Swar JamRoom Studio'}`,
        html: `
          <h2>Booking Update</h2>
          <p>Hi ${booking.userName},</p>
          <p>Unfortunately, your booking request has been declined.</p>
          <h3>Booking Details:</h3>
          <ul>
            <li><strong>Date:</strong> ${displayDate}</li>
            <li><strong>Time:</strong> ${booking.startTime} - ${booking.endTime}</li>
            <li><strong>Rental Type:</strong> ${booking.rentalType}</li>
          </ul>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
          <p>Please contact us if you have any questions or would like to book another slot.</p>
        `
      });
    } catch (emailError) {
      console.log('Rejection email failed:', emailError.message);
    }

    // Send WhatsApp cancellation notification to customer if mobile provided
    if (booking.userMobile) {
      try {
        const message = `❌ JamRoom Booking Declined

Hi ${booking.userName},
Unfortunately, your booking request has been declined.

📅 Date: ${displayDate}
⏰ Time: ${booking.startTime}-${booking.endTime}
${reason ? `📝 Reason: ${reason}` : ''}

Please contact us for alternative slots. 📞`;

        await sendWhatsApp(booking.userMobile, message);
      } catch (whatsappError) {
        console.log('Customer rejection WhatsApp failed:', whatsappError.message);
      }
    }

    // Send WhatsApp notifications to staff about cancellation
    try {
      await sendCancellationNotifications({
        userName: booking.userName,
        userEmail: booking.userEmail,
        userMobile: booking.userMobile,
        date: displayDate,
        startTime: booking.startTime,
        endTime: booking.endTime,
        bookingId: booking._id,
        totalAmount: booking.price,
        reason: reason || 'Admin declined'
      }, settings.whatsappNotifications);
    } catch (whatsappError) {
      console.log('Staff cancellation WhatsApp notifications failed:', whatsappError.message);
    }

    res.json({
      success: true,
      message: 'Booking rejected',
      booking
    });
  } catch (error) {
    console.error('Reject booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error rejecting booking'
    });
  }
});

// @route   GET /api/admin/stats
// @desc    Get admin statistics
// @access  Private/Admin
router.get('/stats', protect, isAdmin, async (req, res) => {
  try {
    const totalBookings = await Booking.countDocuments();
    const pendingBookings = await Booking.countDocuments({ bookingStatus: 'PENDING' });
    const confirmedBookings = await Booking.countDocuments({ bookingStatus: 'CONFIRMED' });
    const totalRevenue = await Booking.aggregate([
      { $match: { bookingStatus: 'CONFIRMED', paymentStatus: 'PAID' } },
      { $group: { _id: null, total: { $sum: '$price' } } }
    ]);

    const recentBookings = await Booking.find()
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      success: true,
      stats: {
        totalBookings,
        pendingBookings,
        confirmedBookings,
        totalRevenue: totalRevenue[0]?.total || 0,
        recentBookings
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching statistics'
    });
  }
});

// @route   GET /api/admin/settings
// @desc    Get admin settings
// @access  Private/Admin
router.get('/settings', protect, isAdmin, async (req, res) => {
  try {
    const settings = await AdminSettings.getSettings();

    res.json({
      success: true,
      settings
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching settings'
    });
  }
});

// @route   PUT /api/admin/settings
// @desc    Update admin settings
// @access  Private/Admin
router.put('/settings', protect, isAdmin, async (req, res) => {
  try {
    const { rentalTypes, prices, upiId, upiName, adminEmails, businessHours, slotDuration, studioName, studioAddress, gstConfig } = req.body;

    let settings = await AdminSettings.findOne();
    
    if (!settings) {
      settings = await AdminSettings.create(req.body);
    } else {
      if (rentalTypes) settings.rentalTypes = rentalTypes;
      if (prices) settings.prices = prices;
      if (upiId) settings.upiId = upiId;
      if (upiName) settings.upiName = upiName;
      if (adminEmails) settings.adminEmails = adminEmails;
      if (businessHours) settings.businessHours = businessHours;
      if (slotDuration) settings.slotDuration = slotDuration;
      if (studioName) settings.studioName = studioName;
      if (studioAddress) settings.studioAddress = studioAddress;
      if (gstConfig) settings.gstConfig = gstConfig;
      
      await settings.save();
    }

    res.json({
      success: true,
      message: 'Settings updated successfully',
      settings
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating settings'
    });
  }
});

// @route   DELETE /api/admin/bookings/:id
// @desc    Delete a booking (Admin only)
// @access  Private/Admin
router.delete('/bookings/:id', protect, isAdmin, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const settings = await AdminSettings.getSettings();
    const displayDate = booking.date.toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric', 
      month: 'long',
      day: 'numeric'
    });

    // Send notification email to user
    try {
      await sendEmail({
        to: booking.userEmail,
        subject: `Booking Deleted - ${settings.studioName || 'Swar JamRoom'}`,
        html: `
          <h2>Booking Deleted</h2>
          <p>Hi ${booking.userName},</p>
          <p>Your booking has been deleted by the admin team.</p>
          <h3>Deleted Booking Details:</h3>
          <ul>
            <li><strong>Date:</strong> ${displayDate}</li>
            <li><strong>Time:</strong> ${booking.startTime} - ${booking.endTime}</li>
            <li><strong>Duration:</strong> ${booking.duration} hour(s)</li>
            <li><strong>Rental Type:</strong> ${booking.rentalType}</li>
            <li><strong>Price:</strong> ₹${booking.price}</li>
          </ul>
          <p>If you have any questions, please contact us.</p>
          <p>If you paid for this booking, please contact us for refund information.</p>
        `
      });
    } catch (emailError) {
      console.log('Deletion notification email failed:', emailError.message);
    }

    // Delete the booking
    await Booking.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Booking deleted successfully'
    });
  } catch (error) {
    console.error('Delete booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting booking'
    });
  }
});

// @route   PUT /api/admin/bookings/:id/edit
// @desc    Edit a booking (Admin only)
// @access  Private/Admin
router.put('/bookings/:id/edit', protect, isAdmin, async (req, res) => {
  try {
    const { date, startTime, endTime, duration, rentalType, notes, price } = req.body;
    
    const booking = await Booking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Store old values for comparison
    const oldValues = {
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      duration: booking.duration,
      rentalType: booking.rentalType,
      price: booking.price
    };

    // Update booking fields
    if (date) booking.date = new Date(date);
    if (startTime) booking.startTime = startTime;
    if (endTime) booking.endTime = endTime;
    if (duration) booking.duration = duration;
    if (rentalType) booking.rentalType = rentalType;
    if (notes !== undefined) booking.notes = notes;
    if (price) booking.price = price;
    
    await booking.save();

    const settings = await AdminSettings.getSettings();
    const displayDate = booking.date.toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long', 
      day: 'numeric'
    });

    // Send update notification to user
    try {
      await sendEmail({
        to: booking.userEmail,
        subject: `Booking Updated - ${settings.studioName || 'Swar JamRoom'}`,
        html: `
          <h2>Booking Updated</h2>
          <p>Hi ${booking.userName},</p>
          <p>Your booking has been updated by the admin team.</p>
          <h3>Updated Booking Details:</h3>
          <ul>
            <li><strong>Date:</strong> ${displayDate}</li>
            <li><strong>Time:</strong> ${booking.startTime} - ${booking.endTime}</li>
            <li><strong>Duration:</strong> ${booking.duration} hour(s)</li>
            <li><strong>Rental Type:</strong> ${booking.rentalType}</li>
            <li><strong>Price:</strong> ₹${booking.price}</li>
            ${booking.notes ? `<li><strong>Notes:</strong> ${booking.notes}</li>` : ''}
          </ul>
          <p>If you have any questions about these changes, please contact us.</p>
        `
      });
    } catch (emailError) {
      console.log('Update notification email failed:', emailError.message);
    }

    res.json({
      success: true,
      message: 'Booking updated successfully',
      booking
    });
  } catch (error) {
    console.error('Edit booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating booking'
    });
  }
});

// @route   POST /api/admin/make-admin
// @desc    Grant admin privileges to a user
// @access  Private/Admin
router.post('/make-admin', protect, isAdmin, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Please provide user email'
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.role === 'admin') {
      return res.status(400).json({
        success: false,
        message: 'User is already an admin'
      });
    }

    user.role = 'admin';
    await user.save();

    // Add to admin emails in settings
    const settings = await AdminSettings.getSettings();
    if (!settings.adminEmails.includes(email)) {
      settings.adminEmails.push(email);
      await settings.save();
    }

    // Send notification email
    try {
      await sendEmail({
        to: email,
        subject: `Admin Access Granted - ${settings.studioName || 'Swar JamRoom Studio'}`,
        html: `
          <h2>Admin Access Granted</h2>
          <p>Hi ${user.name},</p>
          <p>You have been granted admin privileges for JamRoom booking system.</p>
          <p>You can now access the admin panel to manage bookings and settings.</p>
        `
      });
    } catch (emailError) {
      console.log('Admin notification email failed:', emailError.message);
    }

    res.json({
      success: true,
      message: 'Admin privileges granted successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Make admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error granting admin privileges'
    });
  }
});

// @route   POST /api/admin/block-time
// @desc    Block a time range
// @access  Private/Admin
router.post('/block-time', protect, isAdmin, async (req, res) => {
  try {
    const { date, startTime, endTime, reason } = req.body;

    if (!date || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'Please provide date, startTime, and endTime'
      });
    }

    const blockDate = new Date(date);
    blockDate.setHours(0, 0, 0, 0);

    // Check for conflicts with existing bookings
    const conflictBookings = await Booking.find({
      date: blockDate,
      bookingStatus: { $in: ['PENDING', 'CONFIRMED'] }
    });

    const timeToMinutes = (time) => {
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 60 + minutes;
    };

    const checkTimeConflict = (start1, end1, start2, end2) => {
      return (start1 < end2 && end1 > start2);
    };

    for (const booking of conflictBookings) {
      if (checkTimeConflict(startTime, endTime, booking.startTime, booking.endTime)) {
        return res.status(400).json({
          success: false,
          message: `Cannot block: Conflicts with existing booking (${booking.startTime} - ${booking.endTime})`
        });
      }
    }

    const blockedTime = await BlockedTime.create({
      date: blockDate,
      startTime,
      endTime,
      reason: reason || 'Blocked by admin',
      blockedBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: 'Time blocked successfully',
      blockedTime
    });
  } catch (error) {
    console.error('Block time error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error blocking time'
    });
  }
});

// @route   GET /api/admin/blocked-times
// @desc    Get all blocked times
// @access  Private/Admin
router.get('/blocked-times', protect, isAdmin, async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;

    let query = {};

    if (date) {
      const queryDate = new Date(date);
      queryDate.setHours(0, 0, 0, 0);
      query.date = queryDate;
    } else if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.date = { $gte: start, $lte: end };
    }

    const blockedTimes = await BlockedTime.find(query)
      .populate('blockedBy', 'name email')
      .sort({ date: 1, startTime: 1 });

    res.json({
      success: true,
      count: blockedTimes.length,
      blockedTimes
    });
  } catch (error) {
    console.error('Get blocked times error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching blocked times'
    });
  }
});

// @route   DELETE /api/admin/blocked-times/:id
// @desc    Remove a blocked time
// @access  Private/Admin
router.delete('/blocked-times/:id', protect, isAdmin, async (req, res) => {
  try {
    const blockedTime = await BlockedTime.findById(req.params.id);

    if (!blockedTime) {
      return res.status(404).json({
        success: false,
        message: 'Blocked time not found'
      });
    }

    await blockedTime.deleteOne();

    res.json({
      success: true,
      message: 'Blocked time removed successfully'
    });
  } catch (error) {
    console.error('Delete blocked time error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error removing blocked time'
    });
  }
});

// @route   GET /api/admin/bookings/:id/download-pdf
// @desc    Download booking PDF for admin
// @access  Private/Admin
router.get('/bookings/:id/download-pdf', protect, isAdmin, async (req, res) => {
  try {
    console.log('Admin PDF download requested for booking:', req.params.id);
    console.log('User making request:', req.user?.email);
    
    const booking = await Booking.findById(req.params.id).populate('userId');
    
    if (!booking) {
      console.log('Booking not found:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    console.log('Booking found:', booking.userName, booking.userEmail);
    
    // Generate PDF bill and filename with single database call
    console.log('Starting PDF generation with filename...');
    const { pdfBuffer, filename } = await generateBillForDownloadWithFilename(booking);
    
    console.log('Admin PDF generated successfully, filename:', filename);
    
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
    console.error('Download PDF error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error generating PDF'
    });
  }
});

// @route   POST /api/admin/bookings
// @desc    Create a new booking as admin (for walk-in customers or phone bookings)
// @access  Private/Admin
router.post('/bookings', protect, isAdmin, async (req, res) => {
  try {
    console.log('📝 Admin booking creation request received:', req.body);
    
    const { 
      userName, 
      userEmail, 
      userMobile,
      date, 
      startTime, 
      endTime, 
      duration, 
      rentals, 
      subtotal, 
      taxAmount, 
      totalAmount, 
      bandName, 
      notes,
      paymentStatus = 'PENDING',
      bookingStatus = 'CONFIRMED' // Admin bookings are typically confirmed immediately
    } = req.body;

    console.log('🔍 Extracted fields:', {
      userName, userEmail, userMobile, date, startTime, endTime, 
      duration, rentals, subtotal, taxAmount, totalAmount, 
      bandName, notes, paymentStatus, bookingStatus
    });

    // Validation
    if (!userName || !userEmail || !date || !startTime || !endTime || !duration || !rentals || !Array.isArray(rentals) || rentals.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide userName, userEmail, date, startTime, endTime, duration, and at least one rental'
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

    // Helper function to check time conflicts
    const checkTimeConflict = (start1, end1, start2, end2) => {
      const timeToMinutes = (time) => {
        const [hours, minutes] = time.split(':').map(Number);
        return hours * 60 + minutes;
      };
      const start1Min = timeToMinutes(start1);
      const end1Min = timeToMinutes(end1);
      const start2Min = timeToMinutes(start2);
      const end2Min = timeToMinutes(end2);
      return (start1Min < end2Min && end1Min > start2Min);
    };

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

    // Create rental type summary for backward compatibility
    const rentalTypeSummary = rentals.length === 1 ? rentals[0].name : `Multiple Items (${rentals.length})`;

    // Try to find existing user or create user reference
    let userId = null;
    try {
      const existingUser = await User.findOne({ email: userEmail });
      if (existingUser) {
        userId = existingUser._id;
        // Update mobile if provided and not already set
        if (userMobile && !existingUser.mobile) {
          existingUser.mobile = userMobile;
          await existingUser.save();
        }
      }
    } catch (error) {
      console.log('User lookup failed, proceeding without userId:', error.message);
    }

    // Create booking
    const booking = await Booking.create({
      userId: userId, // May be null for guest bookings
      date: bookingDate,
      startTime,
      endTime,
      duration,
      rentalType: rentalTypeSummary, // Legacy field
      rentals: rentals, // New multiple rentals array
      subtotal: calculatedSubtotal,
      taxAmount: calculatedTaxAmount,
      price: calculatedTotalAmount, // Total amount including tax
      userName,
      userEmail,
      userMobile,
      bandName,
      notes,
      paymentStatus,
      bookingStatus
    });

    // Format date for display
    const displayDate = bookingDate.toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Create rentals summary for email/WhatsApp with correct per-day pricing
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

    const rentalsWhatsAppSummary = rentals.map(rental => {
      let itemTotal;
      if (rental.rentalType === 'perday') {
        // Per-day rentals: use perdayPrice, no duration factor
        const perdayPrice = rental.perdayPrice || rental.price;
        itemTotal = perdayPrice * rental.quantity;
        return `${rental.name} × ${rental.quantity} (per day) - ₹${itemTotal}`;
      } else {
        // Hourly rentals: use price with duration factor
        itemTotal = rental.price * rental.quantity * duration;
        return `${rental.name} × ${rental.quantity} × ${duration}h - ₹${itemTotal}`;
      }
    }).join('\n');

    // Send confirmation email to customer
    try {
      await sendEmail({
        to: userEmail,
        subject: bookingStatus === 'CONFIRMED' ? 'Booking Confirmed - JamRoom' : 'Booking Request Created - JamRoom',
        html: `
          <h2>${bookingStatus === 'CONFIRMED' ? 'Booking Confirmed' : 'Booking Request Created'}</h2>
          <p>Hi ${userName},</p>
          <p>${bookingStatus === 'CONFIRMED' ? 
            'Your booking has been confirmed by our admin.' : 
            'Your booking request has been created by our admin and is pending final confirmation.'}</p>
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
            <li><strong>Status:</strong> ${bookingStatus}</li>
            <li><strong>Payment Status:</strong> ${paymentStatus}</li>
          </ul>
          <h3>Payment Details:</h3>
          <p><strong>UPI ID:</strong> ${settings.upiId}</p>
          <p><strong>Name:</strong> ${settings.upiName}</p>
          <p><strong>Amount:</strong> ₹${calculatedTotalAmount}</p>
          ${paymentStatus === 'PENDING' ? '<p>Please complete the payment to finalize your booking.</p>' : ''}
        `
      });
    } catch (emailError) {
      console.log('Customer confirmation email failed:', emailError.message);
    }

    // Send WhatsApp confirmation to customer if mobile provided
    if (userMobile) {
      try {
        await sendBookingConfirmationWhatsApp(userMobile, {
          bookingId: booking._id,
          date: displayDate,
          startTime,
          endTime,
          totalAmount: calculatedTotalAmount,
          rentals: rentalsWhatsAppSummary,
          status: bookingStatus,
          paymentStatus
        });
      } catch (whatsappError) {
        console.log('Customer WhatsApp failed:', whatsappError.message);
      }
    }

    // Send WhatsApp notifications to all configured recipients
    try {
      if (bookingStatus === 'CONFIRMED') {
        await sendBookingConfirmationNotifications({
          userName,
          userEmail,
          userMobile,
          date: displayDate,
          startTime,
          endTime,
          totalAmount: calculatedTotalAmount,
          bookingId: booking._id,
          bandName,
          paymentStatus
        }, settings.whatsappNotifications);
      } else {
        await sendBookingRequestNotifications({
          userName,
          userEmail,
          userMobile,
          date: displayDate,
          startTime,
          endTime,
          totalAmount: calculatedTotalAmount,
          bandName,
          status: `Admin Created - ${bookingStatus}`
        }, settings.whatsappNotifications);
      }
    } catch (whatsappError) {
      console.log('WhatsApp notifications failed:', whatsappError.message);
    }

    // Populate booking with user details for response
    const populatedBooking = await Booking.findById(booking._id).populate('userId', 'name email mobile');

    console.log('✅ Admin booking created successfully:', booking._id);
    console.log('📝 Final booking details:', {
      id: populatedBooking._id,
      userName: populatedBooking.userName,
      date: populatedBooking.date,
      startTime: populatedBooking.startTime,
      endTime: populatedBooking.endTime,
      bookingStatus: populatedBooking.bookingStatus
    });

    res.status(201).json({
      success: true,
      message: 'Admin booking created successfully',
      booking: {
        _id: populatedBooking._id,
        userName: populatedBooking.userName,
        userEmail: populatedBooking.userEmail,
        userMobile: populatedBooking.userMobile,
        date: populatedBooking.date,
        startTime: populatedBooking.startTime,
        endTime: populatedBooking.endTime,
        duration: populatedBooking.duration,
        rentals: populatedBooking.rentals,
        subtotal: populatedBooking.subtotal,
        taxAmount: populatedBooking.taxAmount,
        price: populatedBooking.price,
        bandName: populatedBooking.bandName,
        notes: populatedBooking.notes,
        paymentStatus: populatedBooking.paymentStatus,
        bookingStatus: populatedBooking.bookingStatus,
        createdAt: populatedBooking.createdAt
      }
    });

  } catch (error) {
    console.error('Admin booking creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating booking'
    });
  }
});

// @route   GET /api/admin/whatsapp-settings
// @desc    Get WhatsApp notification settings
// @access  Private/Admin
router.get('/whatsapp-settings', protect, isAdmin, async (req, res) => {
  try {
    const settings = await AdminSettings.getSettings();
    
    res.json({
      success: true,
      whatsappSettings: settings.whatsappNotifications || {
        enabled: true,
        businessNumber: '+919172706306',
        notificationNumbers: [],
        businessNotifications: {
          bookingRequests: true,
          bookingConfirmations: true,
          paymentUpdates: true,
          cancellations: true
        }
      }
    });
  } catch (error) {
    console.error('Get WhatsApp settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching WhatsApp settings'
    });
  }
});

// @route   PUT /api/admin/whatsapp-settings
// @desc    Update WhatsApp notification settings
// @access  Private/Admin
router.put('/whatsapp-settings', protect, isAdmin, async (req, res) => {
  try {
    const settings = await AdminSettings.getSettings();
    
    if (req.body.whatsappNotifications) {
      settings.whatsappNotifications = {
        ...settings.whatsappNotifications,
        ...req.body.whatsappNotifications
      };
    }
    
    await settings.save();
    
    res.json({
      success: true,
      message: 'WhatsApp settings updated successfully',
      whatsappSettings: settings.whatsappNotifications
    });
  } catch (error) {
    console.error('Update WhatsApp settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating WhatsApp settings'
    });
  }
});

// @route   POST /api/admin/whatsapp-settings/add-contact
// @desc    Add a new WhatsApp notification contact
// @access  Private/Admin
router.post('/whatsapp-settings/add-contact', protect, isAdmin, async (req, res) => {
  try {
    const { number, role, notifications } = req.body;
    
    if (!number || !role) {
      return res.status(400).json({
        success: false,
        message: 'Number and role are required'
      });
    }

    // Validate mobile number format
    const mobilePattern = /^(\+91[-\s]?)?[6-9]\d{9}$/;
    if (!mobilePattern.test(number.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid Indian mobile number'
      });
    }

    const settings = await AdminSettings.getSettings();
    
    if (!settings.whatsappNotifications) {
      settings.whatsappNotifications = {
        enabled: true,
        businessNumber: '+919172706306',
        notificationNumbers: [],
        businessNotifications: {
          bookingRequests: true,
          bookingConfirmations: true,
          paymentUpdates: true,
          cancellations: true
        }
      };
    }

    // Check if number already exists
    const existingContact = settings.whatsappNotifications.notificationNumbers.find(
      contact => contact.number === number.trim()
    );
    
    if (existingContact) {
      return res.status(400).json({
        success: false,
        message: 'This number is already added'
      });
    }

    // Add new contact
    settings.whatsappNotifications.notificationNumbers.push({
      number: number.trim(),
      role: role.trim(),
      notifications: notifications || {
        bookingRequests: true,
        bookingConfirmations: true,
        paymentUpdates: false,
        cancellations: true
      }
    });
    
    await settings.save();
    
    res.json({
      success: true,
      message: 'WhatsApp contact added successfully',
      contact: settings.whatsappNotifications.notificationNumbers[settings.whatsappNotifications.notificationNumbers.length - 1]
    });
  } catch (error) {
    console.error('Add WhatsApp contact error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error adding WhatsApp contact'
    });
  }
});

// @route   PUT /api/admin/whatsapp-settings/update-contact/:index
// @desc    Update a WhatsApp notification contact
// @access  Private/Admin
router.put('/whatsapp-settings/update-contact/:index', protect, isAdmin, async (req, res) => {
  try {
    const { index } = req.params;
    const { number, role, notifications } = req.body;
    
    const settings = await AdminSettings.getSettings();
    
    if (!settings.whatsappNotifications || !settings.whatsappNotifications.notificationNumbers) {
      return res.status(404).json({
        success: false,
        message: 'WhatsApp settings not found'
      });
    }

    const contactIndex = parseInt(index);
    if (contactIndex < 0 || contactIndex >= settings.whatsappNotifications.notificationNumbers.length) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    // Validate mobile number format if provided
    if (number) {
      const mobilePattern = /^(\+91[-\s]?)?[6-9]\d{9}$/;
      if (!mobilePattern.test(number.trim())) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid Indian mobile number'
        });
      }
    }

    // Update contact
    if (number) settings.whatsappNotifications.notificationNumbers[contactIndex].number = number.trim();
    if (role) settings.whatsappNotifications.notificationNumbers[contactIndex].role = role.trim();
    if (notifications) settings.whatsappNotifications.notificationNumbers[contactIndex].notifications = notifications;
    
    await settings.save();
    
    res.json({
      success: true,
      message: 'WhatsApp contact updated successfully',
      contact: settings.whatsappNotifications.notificationNumbers[contactIndex]
    });
  } catch (error) {
    console.error('Update WhatsApp contact error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating WhatsApp contact'
    });
  }
});

// @route   DELETE /api/admin/whatsapp-settings/remove-contact/:index
// @desc    Remove a WhatsApp notification contact
// @access  Private/Admin
router.delete('/whatsapp-settings/remove-contact/:index', protect, isAdmin, async (req, res) => {
  try {
    const { index } = req.params;
    
    const settings = await AdminSettings.getSettings();
    
    if (!settings.whatsappNotifications || !settings.whatsappNotifications.notificationNumbers) {
      return res.status(404).json({
        success: false,
        message: 'WhatsApp settings not found'
      });
    }

    const contactIndex = parseInt(index);
    if (contactIndex < 0 || contactIndex >= settings.whatsappNotifications.notificationNumbers.length) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    // Remove contact
    const removedContact = settings.whatsappNotifications.notificationNumbers.splice(contactIndex, 1)[0];
    
    await settings.save();
    
    res.json({
      success: true,
      message: 'WhatsApp contact removed successfully',
      removedContact
    });
  } catch (error) {
    console.error('Remove WhatsApp contact error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error removing WhatsApp contact'
    });
  }
});

// @route   POST /api/admin/whatsapp-settings/test-notification
// @desc    Send test WhatsApp notification to verify setup
// @access  Private/Admin
router.post('/whatsapp-settings/test-notification', protect, isAdmin, async (req, res) => {
  try {
    const { number, message } = req.body;
    
    if (!number) {
      return res.status(400).json({
        success: false,
        message: 'Number is required'
      });
    }

    const testMessage = message || `🧪 JamRoom WhatsApp Test

This is a test message from JamRoom booking system.
If you received this, WhatsApp notifications are working correctly! ✅

Sent at: ${new Date().toLocaleString('en-IN')}`;

    const result = await sendWhatsApp(number, testMessage);
    
    res.json({
      success: result.success,
      message: result.success ? 'Test notification sent successfully' : 'Test notification failed',
      details: result
    });
  } catch (error) {
    console.error('Test WhatsApp notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error sending test notification'
    });
  }
});

module.exports = router;
