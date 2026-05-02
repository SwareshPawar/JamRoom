/**
 * Admin Booking Routes
 * Handles: calendar view, availability, list/filter, approve, reject, delete,
 *          edit, send-ebill, download-pdf, create booking
 */

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Booking = require('../../models/Booking');
const BlockedTime = require('../../models/BlockedTime');
const User = require('../../models/User');
const AdminSettings = require('../../models/AdminSettings');
const { protect } = require('../../middleware/auth');
const { isAdmin } = require('../../middleware/admin');
const { sendEmail } = require('../../utils/email');
const { generateCalendarInvite } = require('../../utils/calendar');
const {
  generateBill,
  generateBillForDownload,
  generateBillFilename,
  generateBillForDownloadWithFilename
} = require('../../utils/billGenerator');
const {
  sendBookingConfirmationNotifications,
  sendBookingConfirmationWhatsApp,
  sendPaymentUpdateNotifications,
  sendCancellationNotifications,
  sendWhatsApp
} = require('../../utils/whatsapp');
const {
  formatTime12Hour,
  formatTimeRange12Hour,
  parseDateInputToStartOfDay,
  formatDateAsYmd,
  formatBookingDisplayDate,
  buildHourlySlotModeFilter,
  escapeRegExp,
  normalizeEmail,
  isValidEmail,
  parseOptionalEmailList,
  deriveDynamicBookingLabel,
  derivePriceAdjustmentTypeFromValue,
  normalizePriceAdjustmentInput,
  normalizePaymentStatusInput,
  computeCollectedAmount,
  normalizePaymentTracking,
  resolveAdminNotificationEmails,
  sendUnifiedBookingConfirmationEmails,
  DEFAULT_APP_LOGIN_URL,
  DEFAULT_ADMIN_CREATED_USER_PASSWORD,
  normalizeIndianMobile
} = require('../../utils/adminHelpers');

const resolveDeletedFilterMode = (value) => {
  const normalized = String(value || 'active').trim().toLowerCase();
  if (normalized === 'deleted') return 'deleted';
  if (normalized === 'all') return 'all';
  return 'active';
};

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
      startDate.setDate(1);
      endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
    }

    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    const bookings = await Booking.find({
      date: { $gte: startDate, $lte: endDate },
      bookingStatus: { $in: ['PENDING', 'CONFIRMED'] }
    }).populate('userId', 'name email').sort({ date: 1, startTime: 1 });

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

// @route   GET /api/admin/availability/:date
// @desc    Get admin availability timeline (includes pending + confirmed for visibility)
// @access  Private/Admin
router.get('/availability/:date', protect, isAdmin, async (req, res) => {
  try {
    const date = parseDateInputToStartOfDay(req.params.date);
    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Use YYYY-MM-DD.'
      });
    }

    const dayStart = new Date(date);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const bookings = await Booking.find({
      date: { $gte: dayStart, $lte: dayEnd },
      bookingStatus: { $in: ['PENDING', 'CONFIRMED'] },
      ...buildHourlySlotModeFilter()
    }).select('startTime endTime rentalType bookingStatus bookingMode');

    const blockedTimes = await BlockedTime.find({
      date: { $gte: dayStart, $lte: dayEnd }
    }).select('startTime endTime reason');

    res.json({
      success: true,
      date: formatDateAsYmd(date),
      bookings,
      blockedTimes
    });
  } catch (error) {
    console.error('Get admin availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching admin availability'
    });
  }
});

// @route   GET /api/admin/bookings
// @desc    Get all bookings with filtering and pagination
// @access  Private/Admin
router.get('/bookings', protect, isAdmin, async (req, res) => {
  try {
    const { status, date, startDate, endDate, q, sortBy, deleted } = req.query;
    const deletedFilterMode = resolveDeletedFilterMode(deleted);
    const includeDeleted = deletedFilterMode !== 'active';

    const parsedPage = Number.parseInt(req.query.page, 10);
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 5;

    let query = {};

    if (deletedFilterMode === 'deleted') {
      query.isDeleted = true;
    }

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

    const searchTerm = String(q || '').trim();
    if (searchTerm) {
      const regex = new RegExp(escapeRegExp(searchTerm), 'i');
      const matchedUsers = await User.find({
        $or: [
          { name: regex },
          { email: regex }
        ]
      })
        .setOptions({ includeDeleted })
        .select('_id');
      const matchedUserIds = matchedUsers.map((user) => user._id);

      const searchClauses = [
        { userName: regex },
        { userEmail: regex },
        { userMobile: regex },
        { bookingStatus: regex },
        { paymentStatus: regex },
        { paymentReference: regex },
        { bookingMode: regex },
        { bandName: regex },
        { notes: regex },
        { rentalType: regex },
        { 'rentals.name': regex }
      ];

      if (matchedUserIds.length > 0) {
        searchClauses.push({ userId: { $in: matchedUserIds } });
      }

      if (mongoose.Types.ObjectId.isValid(searchTerm)) {
        searchClauses.push({ _id: new mongoose.Types.ObjectId(searchTerm) });
      }

      query.$or = searchClauses;
    }

    const sortMap = {
      created_desc: { createdAt: -1 },
      created_asc: { createdAt: 1 },
      date_desc: { date: -1, startTime: -1 },
      date_asc: { date: 1, startTime: 1 },
      price_desc: { price: -1 },
      price_asc: { price: 1 },
      status_asc: { bookingStatus: 1, createdAt: -1 }
    };

    const sort = sortMap[sortBy] || sortMap.created_desc;

    const totalCount = await Booking.countDocuments(query).setOptions({ includeDeleted });
    const totalPages = totalCount > 0 ? Math.ceil(totalCount / limit) : 0;
    const safePage = totalPages > 0 ? Math.min(page, totalPages) : 1;
    const skip = (safePage - 1) * limit;

    const bookings = await Booking.find(query)
      .setOptions({ includeDeleted })
      .populate('userId', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    res.json({
      success: true,
      count: totalCount,
      pageCount: bookings.length,
      bookings,
      pagination: {
        page: safePage,
        limit,
        totalCount,
        totalPages,
        hasNextPage: totalPages > 0 && safePage < totalPages,
        hasPrevPage: safePage > 1
      }
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
// @desc    Approve a booking and send confirmation
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
    await booking.save();

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

    const overlappingBookings = booking.bookingMode === 'perday'
      ? []
      : await Booking.find({
          _id: { $ne: booking._id },
          date: booking.date,
          bookingStatus: 'PENDING',
          ...buildHourlySlotModeFilter()
        });

    const settings = await AdminSettings.getSettings();
    const adminNotificationEmails = await resolveAdminNotificationEmails(settings);

    const rejectedBookings = [];
    for (const pendingBooking of overlappingBookings) {
      if (checkTimeConflict(booking.startTime, booking.endTime, pendingBooking.startTime, pendingBooking.endTime)) {
        pendingBooking.bookingStatus = 'REJECTED';
        await pendingBooking.save();
        rejectedBookings.push(pendingBooking);

        try {
          await sendEmail({
            to: pendingBooking.userEmail,
            subject: `Booking Request Update - ${settings.studioName || 'Swar JamRoom'}`,
            html: `
              <h2>Booking Request Update</h2>
              <p>Hi ${pendingBooking.userName},</p>
              <p>Unfortunately, your booking request for ${pendingBooking.date.toLocaleDateString('en-IN')} from ${formatTime12Hour(pendingBooking.startTime)} to ${formatTime12Hour(pendingBooking.endTime)} has been automatically rejected due to a scheduling conflict with another confirmed booking.</p>
              <p>Please feel free to make a new booking request for a different time slot.</p>
              <p>Thank you for your understanding.</p>
            `
          });
        } catch (emailError) {
          console.log('Rejection email failed for booking:', pendingBooking._id);
        }
      }
    }

    const displayDate = formatBookingDisplayDate(booking.date);

    const calendarInvite = generateCalendarInvite({
      title: `${settings.studioName || 'Swar JamRoom'} Booking - ${booking.rentalType}`,
      description: `Booking confirmed for ${booking.userName}${booking.bandName ? ` (${booking.bandName})` : ''}`,
      location: settings.studioAddress || 'Zen Business Center - 202, Bhumkar Chowk Rd, above Cafe Coffee Day, Shankar Kalat Nagar, Wakad, Pune, Pimpri-Chinchwad, Maharashtra 411057',
      startDate: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      attendees: [booking.userEmail, ...adminNotificationEmails],
      studioName: settings.studioName || 'Swar JamRoom'
    });

    await sendUnifiedBookingConfirmationEmails({
      settings,
      booking,
      confirmedByName: req.user.name,
      calendarInvite
    });

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
// @desc    Send electronic bill to selected recipients
// @access  Private/Admin
router.post('/bookings/:id/send-ebill', protect, isAdmin, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('userId');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (booking.bookingStatus !== 'CONFIRMED') {
      return res.status(400).json({
        success: false,
        message: 'Only confirmed bookings can have eBills generated'
      });
    }

    if (!booking.startTime || !booking.endTime || !booking.duration ||
        !booking.userEmail || !booking.userName || !booking.rentalType) {
      return res.status(400).json({
        success: false,
        message: 'Cannot generate eBill for old booking. Missing required fields.'
      });
    }

    const includeCustomer = req.body?.includeCustomer !== false;
    const additionalEmails = parseOptionalEmailList(req.body?.additionalEmails);
    const invalidAdditionalEmails = additionalEmails.filter((email) => !isValidEmail(email));

    if (invalidAdditionalEmails.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid additional email address(es): ${invalidAdditionalEmails.join(', ')}`
      });
    }

    const settings = await AdminSettings.getSettings();

    let pdfBuffer = null;
    let filename = generateBillFilename(booking, settings);

    console.log('📄 Generating eBill PDF attachment...');

    try {
      pdfBuffer = await generateBillForDownload(booking);
      console.log('✅ eBill PDF generated successfully, size:', pdfBuffer?.length);
    } catch (error) {
      console.error('PDF generation failed for eBill:', error.message);

      if (process.env.VERCEL || process.env.VERCEL_ENV) {
        console.log('📧 Proceeding with email without PDF attachment (PDF download link will be provided)');
      }
    }

    const customerEmail = booking.userEmail || booking.userId?.email;

    if (includeCustomer && !customerEmail) {
      return res.status(400).json({
        success: false,
        message: 'No customer email available for this booking'
      });
    }

    const recipientSet = new Set();

    if (includeCustomer && customerEmail) {
      const normalizedCustomerEmail = normalizeEmail(customerEmail);
      if (!isValidEmail(normalizedCustomerEmail)) {
        return res.status(400).json({
          success: false,
          message: `Invalid customer email address: ${customerEmail}`
        });
      }

      recipientSet.add(normalizedCustomerEmail);
    }

    additionalEmails.forEach((email) => {
      if (isValidEmail(email)) {
        recipientSet.add(email);
      }
    });

    const recipientEmails = Array.from(recipientSet);

    if (recipientEmails.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please include customer email or provide at least one valid additional email address'
      });
    }

    const bookingDate = new Date(booking.date);
    const displayDate = bookingDate.toLocaleDateString('en-IN');

    const subtotal = Number.isFinite(Number(booking.subtotal))
      ? Number(booking.subtotal)
      : Number(booking.price || 0);
    const gstEnabled = settings.gstConfig?.enabled || false;
    const gstRate = gstEnabled ? (settings.gstConfig.rate || 0.18) : 0;
    const gstDisplayName = settings.gstConfig?.displayName || 'GST';
    const taxAmount = Number.isFinite(Number(booking.taxAmount))
      ? Number(booking.taxAmount)
      : (gstEnabled ? Math.round(subtotal * gstRate) : 0);

    const adjustmentType = String(booking.priceAdjustmentType || derivePriceAdjustmentTypeFromValue(booking.priceAdjustmentValue)).toLowerCase();
    const adjustmentAmount = Number.isFinite(Number(booking.priceAdjustmentAmount))
      ? Number(booking.priceAdjustmentAmount)
      : Math.abs(Number(booking.priceAdjustmentValue || 0));
    const signedAdjustment = Number.isFinite(Number(booking.priceAdjustmentValue))
      ? Number(booking.priceAdjustmentValue)
      : (adjustmentType === 'discount' ? -adjustmentAmount : adjustmentType === 'surcharge' ? adjustmentAmount : 0);
    const totalAmount = Number.isFinite(Number(booking.price))
      ? Number(booking.price)
      : (subtotal + taxAmount + signedAdjustment);
    const adjustmentLabel = signedAdjustment < 0 ? 'Discount' : 'Surcharge';
    const adjustmentDisplayAmount = Math.abs(signedAdjustment);
    const collectedAmount = computeCollectedAmount({
      totalAmount,
      paymentStatus: booking.paymentStatus,
      amountPaid: booking.amountPaid
    });
    const outstandingAmount = Math.max(0, totalAmount - collectedAmount);
    const bookingStatusLabel = String(booking.bookingStatus || 'CONFIRMED').toUpperCase();
    const paymentStatusLabel = normalizePaymentStatusInput(booking.paymentStatus, 'PENDING');
    const paymentStatusColor = paymentStatusLabel === 'PAID'
      ? '#155724'
      : paymentStatusLabel === 'PARTIAL'
        ? '#8a5700'
        : '#856404';
    const paymentStatusBackground = paymentStatusLabel === 'PAID'
      ? '#d4edda'
      : paymentStatusLabel === 'PARTIAL'
        ? '#fff4d6'
        : '#fff3cd';
    const paymentStatusBorder = paymentStatusLabel === 'PAID'
      ? '#c3e6cb'
      : paymentStatusLabel === 'PARTIAL'
        ? '#ffd166'
        : '#ffeaa7';
    const paymentNarrative = paymentStatusLabel === 'PAID'
      ? `<p style="color: #155724; line-height: 1.7; margin: 0;">Thank you for completing the payment in full. We have successfully received <strong>₹${collectedAmount.toFixed(2)}</strong>, and your booking account is fully settled.</p>`
      : paymentStatusLabel === 'PARTIAL'
        ? `<p style="color: #8a5700; line-height: 1.7; margin: 0;">We have received a partial payment of <strong>₹${collectedAmount.toFixed(2)}</strong>. The remaining balance is <strong>₹${outstandingAmount.toFixed(2)}</strong>. Kindly clear the outstanding amount before your scheduled studio slot.</p>`
        : `<p style="color: #856404; line-height: 1.7; margin: 0;">Payment for this booking is currently pending. Kindly clear the due amount of <strong>₹${outstandingAmount.toFixed(2)}</strong> before your scheduled studio slot to keep records up to date.</p>`;

    const emailSubject = `Invoice for Your ${settings?.studioName || 'JamRoom'} Booking - ${displayDate}`;
    const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;background:#eef2f7;font-family:Arial,sans-serif;color:#1f2937}
  .eq{max-width:760px;margin:0 auto;padding:12px}
  .card{background:#fff;border-radius:16px;overflow:hidden;border:1px solid #dbe5f0}
  .hdr{background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);color:#fff;padding:20px}
  .hdr-table{width:100%;border-collapse:collapse}
  .hdr-left{vertical-align:top;padding-right:14px}
  .hdr-right{vertical-align:top;width:220px}
  .hdr h2{margin:0 0 8px 0;font-size:24px;color:#fff}
  .hdr .cl{font-size:12px;line-height:1.6;color:rgba(255,255,255,0.88)}
  .order-box{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:12px 14px}
  .order-kicker{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#bfdbfe;font-weight:700;margin-bottom:8px}
  .order-line{font-size:12px;line-height:1.7;color:rgba(255,255,255,0.9)}
  .body{padding:20px}
  .sc{background:#f8fafc;border:1px solid #dbe5f0;border-radius:12px;padding:14px 16px}
  .sc-kicker{font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:#64748b;font-weight:700;margin-bottom:8px}
  .sc-title{font-size:17px;font-weight:800;color:#0f172a;margin-bottom:4px}
  .sc-sub{font-size:12px;line-height:1.6;color:#475569}
  .summary-grid{width:100%;border-collapse:collapse;margin:0 0 14px 0}
  .summary-grid td{vertical-align:top}
  .col-left{padding-right:6px}
  .col-right{padding-left:6px}
  .status-pill{display:inline-block;padding:4px 12px;border-radius:14px;border:1px solid ${paymentStatusBorder};background:${paymentStatusBackground};color:${paymentStatusColor};font-weight:700}
  .confirm-pill{display:inline-block;padding:4px 12px;border-radius:14px;border:1px solid #86efac;background:#dcfce7;color:#166534;font-weight:700}
  .booking-card,.notes-card{background:#fff;border:1px solid #dbe5f0;border-radius:12px;padding:14px 16px;margin-bottom:14px}
  .booking-card h3{color:#1d4ed8;margin:0 0 10px 0;font-size:16px}
  .detail-table{width:100%;border-collapse:collapse}
  .detail-table td{padding:8px 0;border-bottom:1px solid #e5e7eb;font-size:13px}
  .detail-table td:first-child{font-weight:700;color:#1f2937;width:42%}
  .detail-table td:last-child{color:#475569}
  .totals-card{background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%);border:1px solid #bfdbfe;border-radius:12px;padding:14px 16px;margin:0 0 14px 0}
  .totals-card h3{margin:0 0 8px 0;font-size:14px;color:#1d4ed8;text-transform:uppercase;letter-spacing:1px}
  .totals-line{display:flex;justify-content:space-between;gap:10px;font-size:13px;color:#0f172a;padding:5px 0}
  .totals-line.grand{margin-top:6px;padding-top:8px;border-top:1px solid #bfdbfe;font-size:15px}
  .payment-card{background:${paymentStatusBackground};border:1px solid ${paymentStatusBorder};border-radius:12px;padding:14px 16px;margin:0 0 14px 0}
  .payment-card h3{margin:0 0 8px 0;font-size:15px;color:${paymentStatusColor}}
  .cta{background:linear-gradient(135deg,#eff6ff 0%,#f8fafc 100%);border:1px solid #bfdbfe;border-radius:12px;padding:14px 16px;margin:0 0 14px 0}
  .cta h3{margin:0 0 8px 0;font-size:15px;color:#0f172a}
  .cta p{margin:0;font-size:13px;line-height:1.7;color:#475569}
  .attach{border-radius:12px;padding:12px 14px;margin:0 0 14px 0;font-size:13px;line-height:1.6}
  .attach.ok{background:#e8f5e8;border:1px solid #4caf50;color:#2e7d32}
  .attach.warn{background:#fff3e0;border:1px solid #ffcc02;color:#92400e}
  .footer{font-size:11px;line-height:1.8;color:#64748b;border-top:1px solid #e5e7eb;padding-top:12px}
</style>
</head>
<body>
<div class="eq">
  <div class="card">
    <div class="hdr">
      <table class="hdr-table" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td class="hdr-left">
            <h2>${settings?.studioName || 'JamRoom'}</h2>
            <div class="cl"><strong>Invoice Date:</strong> ${displayDate}</div>
            ${settings?.studioAddress ? `<div class="cl"><strong>Address:</strong> ${settings.studioAddress}</div>` : ''}
            ${settings?.studioPhone ? `<div class="cl"><strong>Phone / WhatsApp:</strong> ${settings.studioPhone}</div>` : ''}
            <div class="cl"><strong>Email:</strong> ${settings?.adminEmails?.[0] || 'admin@jamroom.com'}</div>
          </td>
          <td class="hdr-right">
            <div class="order-box">
              <div class="order-kicker">Invoice Summary</div>
              <div class="order-line"><strong>Customer:</strong> ${booking.userName}</div>
              <div class="order-line"><strong>Service:</strong> ${booking.rentalType}</div>
              <div class="order-line"><strong>Total Amount:</strong> ₹${totalAmount.toFixed(2)}</div>
            </div>
          </td>
        </tr>
      </table>
    </div>
    <div class="body">
      <p style="margin:0 0 8px 0;font-size:15px;color:#0f172a;">Dear ${booking.userName},</p>
      <p style="margin:0 0 14px 0;font-size:13px;line-height:1.7;color:#475569;">Thank you for choosing ${settings?.studioName || 'JamRoom'}. Please find your electronic invoice attached for your records.</p>
      <table class="summary-grid" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td class="col-left" width="50%">
            <div class="sc">
              <div class="sc-kicker">Booking Status</div>
              <div class="sc-title"><span class="confirm-pill">${bookingStatusLabel}</span></div>
              <div class="sc-sub">Your booking slot is confirmed and reserved.</div>
            </div>
          </td>
          <td class="col-right" width="50%">
            <div class="sc">
              <div class="sc-kicker">Payment Status</div>
              <div class="sc-title"><span class="status-pill">${paymentStatusLabel}</span></div>
              <div class="sc-sub" style="font-size:13px;margin-top:6px;">
                ${paymentStatusLabel === 'PAID'
                  ? `<span style="color:#166534;font-weight:700;">₹${collectedAmount.toFixed(2)} received — fully settled ✓</span>`
                  : paymentStatusLabel === 'PARTIAL'
                  ? `₹${collectedAmount.toFixed(2)} received &nbsp;·&nbsp; <strong style="color:#8a5700;">₹${outstandingAmount.toFixed(2)} outstanding</strong>`
                  : `<strong style="color:#856404;">₹${outstandingAmount.toFixed(2)} outstanding</strong>`}
              </div>
            </div>
          </td>
        </tr>
      </table>
      <div class="booking-card">
        <h3>Booking Summary</h3>
        <table class="detail-table">
          <tr><td>Date</td><td>${displayDate}</td></tr>
          <tr><td>Time</td><td>${formatTimeRange12Hour(booking.startTime, booking.endTime)}</td></tr>
          <tr><td>Service</td><td>${booking.rentalType}</td></tr>
          <tr><td>Duration</td><td>${booking.duration} hour(s)</td></tr>
          ${booking.paymentReference ? `<tr><td>Payment Reference</td><td>${booking.paymentReference}</td></tr>` : ''}
          ${booking.paymentNote ? `<tr><td>Payment Note</td><td>${booking.paymentNote}</td></tr>` : ''}
        </table>
      </div>
      <div class="totals-card">
        <h3>Amount Summary</h3>
        <div class="totals-line"><span>Subtotal</span><strong>₹${subtotal.toFixed(2)}</strong></div>
        ${gstEnabled ? `<div class="totals-line"><span>${gstDisplayName} (${Math.round(gstRate * 100)}%)</span><strong>₹${taxAmount.toFixed(2)}</strong></div>` : ''}
        ${signedAdjustment !== 0 ? `<div class="totals-line"><span>${adjustmentLabel}</span><strong>${signedAdjustment < 0 ? '-' : '+'}₹${adjustmentDisplayAmount.toFixed(2)}</strong></div>` : ''}
        <div class="totals-line grand"><span>Total Amount</span><strong>₹${totalAmount.toFixed(2)}</strong></div>
        <div class="totals-line" style="margin-top:6px;padding-top:8px;border-top:1px solid #bfdbfe;"><span style="color:#166534;font-weight:600;">Amount Received</span><strong style="color:#166534;">₹${collectedAmount.toFixed(2)}</strong></div>
        <div class="totals-line"><span style="${outstandingAmount > 0 ? 'color:#dc2626;font-weight:700;' : 'color:#166534;'}">Outstanding Amount</span><strong style="${outstandingAmount > 0 ? 'color:#dc2626;' : 'color:#166534;'}">₹${outstandingAmount.toFixed(2)}</strong></div>
      </div>
      <div class="payment-card">
        <h3>Payment Update: ${paymentStatusLabel}</h3>
        ${paymentNarrative}
      </div>
      <div class="cta">
        <h3>Need assistance with payment or booking?</h3>
        <p>If you need help with payment confirmation, receipt details, or booking updates, please reply to this email and our team will assist you promptly.</p>
      </div>
      ${!pdfBuffer
        ? `<div class="attach warn">PDF invoice could not be attached due to a technical issue. You can download your invoice from <a href="${process.env.FRONTEND_URL || 'https://jamroom.vercel.app'}/booking.html" style="color:#1d4ed8;font-weight:700;text-decoration:none;">your JamRoom account</a>.</div>`
        : '<div class="attach ok">Your detailed invoice PDF is attached to this email.</div>'}
      <div class="footer">
        <div>Visit JamRoom: <a href="${DEFAULT_APP_LOGIN_URL}" target="_blank" rel="noopener noreferrer" style="color:#1d4ed8;text-decoration:none;">${DEFAULT_APP_LOGIN_URL}</a></div>
        <div>${settings?.studioName || 'JamRoom Studio'} | ${settings?.adminEmails?.[0] || 'admin@jamroom.com'}</div>
      </div>
    </div>
  </div>
</div>
</body>
</html>`;

    const attachments = [];
    if (pdfBuffer) {
      attachments.push({
        filename: filename,
        content: pdfBuffer,
        contentType: 'application/pdf'
      });
    }

    for (const recipientEmail of recipientEmails) {
      await sendEmail({
        to: recipientEmail,
        subject: emailSubject,
        html: emailHtml,
        attachments
      });
    }

    const pdfAttached = !!pdfBuffer;
    console.log(`eBill sent for booking ${booking._id} to ${recipientEmails.join(', ')} by admin ${req.user.name}. PDF attached: ${pdfAttached}`);

    let successMessage;
    if (pdfBuffer) {
      successMessage = 'Electronic bill sent successfully with PDF attachment';
    } else if (process.env.VERCEL || process.env.VERCEL_ENV) {
      successMessage = 'Electronic bill sent successfully. PDF attachment failed due to serverless limitations - customer can download PDF from their dashboard';
    } else {
      successMessage = 'Electronic bill sent successfully (PDF attachment failed - customer can download separately)';
    }

    res.json({
      success: true,
      message: `${successMessage} (${recipientEmails.length} recipient${recipientEmails.length === 1 ? '' : 's'})`,
      filename: filename,
      customerEmail: normalizeEmail(customerEmail),
      recipients: recipientEmails
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
            <li><strong>Time:</strong> ${formatTimeRange12Hour(booking.startTime, booking.endTime)}</li>
            <li><strong>Rental Type:</strong> ${booking.rentalType}</li>
          </ul>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
          <p>Please contact us if you have any questions or would like to book another slot.</p>
        `
      });
    } catch (emailError) {
      console.log('Rejection email failed:', emailError.message);
    }

    if (booking.userMobile) {
      try {
        const message = `❌ JamRoom Booking Declined\n\nHi ${booking.userName},\nUnfortunately, your booking request has been declined.\n\n📅 Date: ${displayDate}\n⏰ Time: ${booking.startTime}-${booking.endTime}\n${reason ? `📝 Reason: ${reason}` : ''}\n\nPlease contact us for alternative slots. 📞`;
        await sendWhatsApp(booking.userMobile, message);
      } catch (whatsappError) {
        console.log('Customer rejection WhatsApp failed:', whatsappError.message);
      }
    }

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

// @route   DELETE /api/admin/bookings/:id
// @desc    Soft delete a booking
// @access  Private/Admin
router.delete('/bookings/:id', protect, isAdmin, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).setOptions({ includeDeleted: true });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (booking.isDeleted === true) {
      return res.status(400).json({
        success: false,
        message: 'Booking is already deleted'
      });
    }

    const settings = await AdminSettings.getSettings();
    const displayDate = booking.date.toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

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
            <li><strong>Time:</strong> ${formatTimeRange12Hour(booking.startTime, booking.endTime)}</li>
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

    booking.isDeleted = true;
    booking.deletedAt = new Date();
    booking.deletedBy = req.user?._id || null;
    await booking.save();

    res.json({
      success: true,
      message: 'Booking moved to deleted records'
    });
  } catch (error) {
    console.error('Delete booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting booking'
    });
  }
});

// @route   DELETE /api/admin/bookings/:id/permanent
// @desc    Permanently delete a soft-deleted booking
// @access  Private/Admin
router.delete('/bookings/:id/permanent', protect, isAdmin, async (req, res) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      isDeleted: true
    }).setOptions({ includeDeleted: true });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Deleted booking not found'
      });
    }

    const removal = await Booking.deleteOne({ _id: booking._id });
    if ((removal?.deletedCount || 0) < 1) {
      return res.status(500).json({
        success: false,
        message: 'Failed to permanently delete booking'
      });
    }

    res.json({
      success: true,
      message: 'Booking permanently deleted'
    });
  } catch (error) {
    console.error('Permanent delete booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error permanently deleting booking'
    });
  }
});

// @route   PUT /api/admin/bookings/:id/restore
// @desc    Restore a soft-deleted booking
// @access  Private/Admin
router.put('/bookings/:id/restore', protect, isAdmin, async (req, res) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      isDeleted: true
    }).setOptions({ includeDeleted: true });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Deleted booking not found'
      });
    }

    booking.isDeleted = false;
    booking.deletedAt = null;
    booking.deletedBy = null;
    await booking.save();

    res.json({
      success: true,
      message: 'Booking restored successfully',
      booking
    });
  } catch (error) {
    console.error('Restore booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error restoring booking'
    });
  }
});

// @route   PUT /api/admin/bookings/:id/edit
// @desc    Edit a booking (Admin only)
// @access  Private/Admin
router.put('/bookings/:id/edit', protect, isAdmin, async (req, res) => {
  try {
    const {
      date,
      startTime,
      endTime,
      duration,
      rentalType,
      notes,
      price,
      rentals,
      subtotal,
      taxAmount,
      totalAmount,
      priceAdjustmentType,
      priceAdjustmentAmount,
      priceAdjustmentNote,
      paymentStatus,
      amountPaid,
      paymentReference,
      paymentNote,
      paymentMode
    } = req.body;

    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const settings = await AdminSettings.getSettings();
    const gstEnabled = settings?.gstConfig?.enabled || false;
    const gstRate = gstEnabled ? (settings?.gstConfig?.rate || 0.18) : 0;

    const existingAdjustmentFallbackType = String(
      booking.priceAdjustmentType || derivePriceAdjustmentTypeFromValue(booking.priceAdjustmentValue)
    ).toLowerCase();
    const existingAdjustmentFallbackAmount = Number.isFinite(Number(booking.priceAdjustmentAmount))
      ? Number(booking.priceAdjustmentAmount)
      : Math.abs(Number(booking.priceAdjustmentValue || 0));
    const existingAdjustmentFallbackNote = booking.priceAdjustmentNote || '';

    const normalizedAdjustment = normalizePriceAdjustmentInput(
      {
        rawType: priceAdjustmentType,
        rawAmount: priceAdjustmentAmount,
        rawNote: priceAdjustmentNote
      },
      {
        fallbackType: existingAdjustmentFallbackType,
        fallbackAmount: existingAdjustmentFallbackAmount,
        fallbackNote: existingAdjustmentFallbackNote
      }
    );

    if (normalizedAdjustment.error) {
      return res.status(400).json({
        success: false,
        message: normalizedAdjustment.error
      });
    }

    if (date) booking.date = new Date(date);
    if (startTime) booking.startTime = startTime;
    if (endTime) booking.endTime = endTime;
    if (duration !== undefined && duration !== null) {
      const parsedDuration = Number(duration);
      if (!Number.isFinite(parsedDuration) || parsedDuration <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Duration must be a positive number'
        });
      }
      booking.duration = parsedDuration;
    }

    const normalizedRentalType = String(rentalType || '').trim();
    if (normalizedRentalType) booking.rentalType = normalizedRentalType;

    if (notes !== undefined) booking.notes = notes;

    if (Array.isArray(rentals)) {
      if (rentals.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Please provide at least one rental item'
        });
      }

      const sanitizedRentals = [];
      for (const rental of rentals) {
        const rentalName = String(rental?.name || '').trim();
        const rentalPrice = Number(rental?.price);
        const rentalQuantity = parseInt(rental?.quantity, 10);
        const normalizedRentalTypeRaw = String(rental?.rentalType || 'inhouse').toLowerCase();
        const rentalTypeValue = normalizedRentalTypeRaw === 'perday'
          ? 'perday'
          : normalizedRentalTypeRaw === 'persession'
            ? 'persession'
            : 'inhouse';
        const rentalDescription = String(rental?.description || '').trim();

        if (!rentalName) {
          return res.status(400).json({ success: false, message: 'Each rental item must have a name' });
        }

        if (!Number.isFinite(rentalPrice) || rentalPrice < 0) {
          return res.status(400).json({ success: false, message: `Invalid price for rental item: ${rentalName}` });
        }

        if (!Number.isInteger(rentalQuantity) || rentalQuantity < 1) {
          return res.status(400).json({ success: false, message: `Invalid quantity for rental item: ${rentalName}` });
        }

        sanitizedRentals.push({
          name: rentalName,
          price: rentalPrice,
          perdayPrice: rentalTypeValue === 'perday' ? rentalPrice : (Number(rental?.perdayPrice) || 0),
          quantity: rentalQuantity,
          rentalType: rentalTypeValue,
          description: rentalDescription,
          quantityEnabled: rental?.quantityEnabled === true
        });
      }

      let calculatedSubtotal = 0;
      sanitizedRentals.forEach((rentalItem) => {
        if (rentalItem.rentalType === 'perday' || rentalItem.rentalType === 'persession') {
          calculatedSubtotal += rentalItem.price * rentalItem.quantity;
        } else {
          calculatedSubtotal += rentalItem.price * rentalItem.quantity * booking.duration;
        }
      });

      const calculatedTaxAmount = gstEnabled ? Math.round(calculatedSubtotal * gstRate) : 0;
      const calculatedTotalAmount = calculatedSubtotal + calculatedTaxAmount + normalizedAdjustment.value;

      if (calculatedTotalAmount < 0) {
        return res.status(400).json({ success: false, message: 'Discount cannot make final total negative' });
      }

      booking.rentals = sanitizedRentals;
      booking.subtotal = calculatedSubtotal;
      booking.taxAmount = calculatedTaxAmount;
      booking.price = calculatedTotalAmount;
      booking.priceAdjustmentType = normalizedAdjustment.type;
      booking.priceAdjustmentAmount = normalizedAdjustment.amount;
      booking.priceAdjustmentValue = normalizedAdjustment.value;
      booking.priceAdjustmentNote = normalizedAdjustment.note;

      if (!normalizedRentalType) {
        booking.rentalType = deriveDynamicBookingLabel(rentals, '');
      }
    } else {
      if (subtotal !== undefined && subtotal !== null) {
        const parsedSubtotal = Number(subtotal);
        if (!Number.isFinite(parsedSubtotal) || parsedSubtotal < 0) {
          return res.status(400).json({ success: false, message: 'Subtotal must be a non-negative number' });
        }
        booking.subtotal = parsedSubtotal;
      }

      if (taxAmount !== undefined && taxAmount !== null) {
        const parsedTaxAmount = Number(taxAmount);
        if (!Number.isFinite(parsedTaxAmount) || parsedTaxAmount < 0) {
          return res.status(400).json({ success: false, message: 'Tax amount must be a non-negative number' });
        }
        booking.taxAmount = parsedTaxAmount;
      }

      if (totalAmount !== undefined && totalAmount !== null) {
        const parsedTotalAmount = Number(totalAmount);
        if (!Number.isFinite(parsedTotalAmount) || parsedTotalAmount < 0) {
          return res.status(400).json({ success: false, message: 'Total amount must be a non-negative number' });
        }
        booking.price = parsedTotalAmount;
      } else if (price !== undefined && price !== null) {
        const parsedPrice = Number(price);
        if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
          return res.status(400).json({ success: false, message: 'Price must be a non-negative number' });
        }
        booking.price = parsedPrice;
      } else {
        const computedSubtotal = Number.isFinite(Number(booking.subtotal)) ? Number(booking.subtotal) : 0;
        const computedTax = Number.isFinite(Number(booking.taxAmount)) ? Number(booking.taxAmount) : 0;
        const computedTotal = computedSubtotal + computedTax + normalizedAdjustment.value;
        if (computedTotal < 0) {
          return res.status(400).json({ success: false, message: 'Discount cannot make final total negative' });
        }
        booking.price = computedTotal;
      }

      booking.priceAdjustmentType = normalizedAdjustment.type;
      booking.priceAdjustmentAmount = normalizedAdjustment.amount;
      booking.priceAdjustmentValue = normalizedAdjustment.value;
      booking.priceAdjustmentNote = normalizedAdjustment.note;
    }

    const normalizedPaymentTracking = normalizePaymentTracking({
      paymentStatusRaw: paymentStatus,
      amountPaidRaw: amountPaid,
      totalAmount: booking.price,
      fallbackStatus: booking.paymentStatus,
      fallbackAmountPaid: booking.amountPaid
    });

    if (normalizedPaymentTracking.error) {
      return res.status(400).json({ success: false, message: normalizedPaymentTracking.error });
    }

    booking.paymentStatus = normalizedPaymentTracking.paymentStatus;
    booking.amountPaid = normalizedPaymentTracking.amountPaid;

    if (paymentReference !== undefined) {
      booking.paymentReference = String(paymentReference || '').trim();
    }

    if (paymentNote !== undefined) {
      booking.paymentNote = String(paymentNote || '').trim();
    }

    if (paymentMode !== undefined) {
      const normalizedMode = String(paymentMode || '').toUpperCase().trim();
      booking.paymentMode = ['UPI', 'CASH', 'OTHER'].includes(normalizedMode) ? normalizedMode : '';
    }

    await booking.save();

    const displayDate = booking.date.toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

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
            <li><strong>Time:</strong> ${formatTimeRange12Hour(booking.startTime, booking.endTime)}</li>
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
    console.log('Starting PDF generation with filename...');
    const { pdfBuffer, filename } = await generateBillForDownloadWithFilename(booking);

    console.log('Admin PDF generated successfully, filename:', filename);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

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
// @desc    Create a new booking as admin for a registered user
// @access  Private/Admin
router.post('/bookings', protect, isAdmin, async (req, res) => {
  try {
    console.log('📝 Admin booking creation request received:', req.body);

    const {
      userId,
      date,
      startTime,
      endTime,
      duration,
      rentals,
      subtotal,
      rentalType,
      bandName,
      notes,
      overrideDateTime,
      priceAdjustmentType,
      priceAdjustmentAmount,
      priceAdjustmentNote,
      paymentStatus,
      amountPaid,
      paymentReference,
      paymentNote
    } = req.body;

    const shouldOverrideDateTime = overrideDateTime === true || String(overrideDateTime).toLowerCase() === 'true';
    const requestedPaymentStatus = paymentStatus;
    const requestedAmountPaid = amountPaid;
    const normalizedPaymentReference = String(paymentReference || '').trim();
    const normalizedPaymentNote = String(paymentNote || '').trim();
    const enforcedBookingStatus = 'CONFIRMED';

    if (!userId || !date || !startTime || !endTime || !duration || !rentals || !Array.isArray(rentals) || rentals.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide userId, date, startTime, endTime, duration, and at least one rental'
      });
    }

    const selectedUser = await User.findById(userId).select('name email mobile role forcePasswordReset');
    if (!selectedUser) {
      return res.status(404).json({
        success: false,
        message: 'Selected user not found'
      });
    }

    for (const rental of rentals) {
      if (!rental.name || rental.price === undefined || rental.price === null || !rental.quantity) {
        return res.status(400).json({
          success: false,
          message: 'Each rental must have name, price, and quantity'
        });
      }
    }

    if (duration < 1) {
      return res.status(400).json({
        success: false,
        message: 'Duration must be at least 1 hour'
      });
    }

    const bookingDate = parseDateInputToStartOfDay(date);
    if (!bookingDate) {
      return res.status(400).json({
        success: false,
        message: 'Invalid booking date. Use YYYY-MM-DD format.'
      });
    }

    const checkTimeConflict = (start1, end1, start2, end2) => {
      const timeToMinutes = (time) => {
        const [hours, minutes] = time.split(':').map(Number);
        return hours * 60 + minutes;
      };
      return (timeToMinutes(start1) < timeToMinutes(end2) && timeToMinutes(end1) > timeToMinutes(start2));
    };

    if (!shouldOverrideDateTime) {
      const existingBookings = await Booking.find({
        date: bookingDate,
        bookingStatus: 'CONFIRMED',
        ...buildHourlySlotModeFilter()
      });

      for (const booking of existingBookings) {
        if (checkTimeConflict(startTime, endTime, booking.startTime, booking.endTime)) {
          return res.status(400).json({
            success: false,
            message: `Time conflict with existing booking (${booking.startTime} - ${booking.endTime})`
          });
        }
      }

      const blockedTimes = await BlockedTime.find({ date: bookingDate });
      for (const blocked of blockedTimes) {
        if (checkTimeConflict(startTime, endTime, blocked.startTime, blocked.endTime)) {
          return res.status(400).json({
            success: false,
            message: `This time slot is blocked by admin (${blocked.startTime} - ${blocked.endTime})`
          });
        }
      }
    } else {
      console.log('ℹ️ Admin booking override enabled: skipping conflict and blocked-time checks');
    }

    const settings = await AdminSettings.getSettings();
    const parsedSubtotal = Number(subtotal);
    const calculatedSubtotal = Number.isFinite(parsedSubtotal) ? parsedSubtotal : 0;
    if (calculatedSubtotal < 0) {
      return res.status(400).json({ success: false, message: 'Subtotal must be a non-negative number' });
    }
    const gstEnabled = settings.gstConfig?.enabled || false;
    const gstRate = gstEnabled ? (settings.gstConfig.rate || 0.18) : 0;

    const normalizedAdjustment = normalizePriceAdjustmentInput({
      rawType: priceAdjustmentType,
      rawAmount: priceAdjustmentAmount,
      rawNote: priceAdjustmentNote
    });

    if (normalizedAdjustment.error) {
      return res.status(400).json({ success: false, message: normalizedAdjustment.error });
    }

    const calculatedTaxAmount = gstEnabled ? Math.round(calculatedSubtotal * gstRate) : 0;
    const calculatedTotalAmount = calculatedSubtotal + calculatedTaxAmount + normalizedAdjustment.value;

    if (calculatedTotalAmount < 0) {
      return res.status(400).json({ success: false, message: 'Discount cannot make final total negative' });
    }

    const normalizedPaymentTracking = normalizePaymentTracking({
      paymentStatusRaw: requestedPaymentStatus,
      amountPaidRaw: requestedAmountPaid,
      totalAmount: calculatedTotalAmount,
      fallbackStatus: 'PENDING',
      fallbackAmountPaid: 0
    });

    if (normalizedPaymentTracking.error) {
      return res.status(400).json({ success: false, message: normalizedPaymentTracking.error });
    }

    const adminNotificationEmails = await resolveAdminNotificationEmails(settings);
    const rentalTypeSummary = deriveDynamicBookingLabel(rentals, rentalType);

    const booking = await Booking.create({
      userId: selectedUser._id,
      date: bookingDate,
      startTime,
      endTime,
      duration,
      rentalType: rentalTypeSummary,
      rentals: rentals,
      subtotal: calculatedSubtotal,
      taxAmount: calculatedTaxAmount,
      priceAdjustmentType: normalizedAdjustment.type,
      priceAdjustmentAmount: normalizedAdjustment.amount,
      priceAdjustmentValue: normalizedAdjustment.value,
      priceAdjustmentNote: normalizedAdjustment.note,
      price: calculatedTotalAmount,
      userName: selectedUser.name,
      userEmail: selectedUser.email,
      userMobile: selectedUser.mobile,
      bandName,
      notes: shouldOverrideDateTime
        ? `${notes ? `${notes}\n` : ''}[Admin Override] Date/time checks bypassed for historical booking entry.`
        : notes,
      paymentStatus: normalizedPaymentTracking.paymentStatus,
      amountPaid: normalizedPaymentTracking.amountPaid,
      paymentReference: normalizedPaymentReference,
      paymentNote: normalizedPaymentNote,
      bookingStatus: enforcedBookingStatus
    });

    const displayDate = formatBookingDisplayDate(bookingDate);

    const rentalsWhatsAppSummary = rentals.map(rental => {
      let itemTotal;
      if (rental.rentalType === 'perday') {
        const perdayPrice = rental.perdayPrice || rental.price;
        itemTotal = perdayPrice * rental.quantity;
        return `${rental.name} × ${rental.quantity} (per day) - ₹${itemTotal}`;
      } else if (String(rental.rentalType || '').toLowerCase() === 'persession') {
        itemTotal = rental.price * rental.quantity;
        return `${rental.name} × ${rental.quantity} (per session) - ₹${itemTotal}`;
      } else {
        itemTotal = rental.price * rental.quantity * duration;
        return `${rental.name} × ${rental.quantity} × ${duration}h - ₹${itemTotal}`;
      }
    }).join('\n');

    const calendarInvite = generateCalendarInvite({
      title: `${settings.studioName || 'Swar JamRoom'} Booking - ${rentalTypeSummary}`,
      description: `Booking confirmed for ${selectedUser.name}${bandName ? ` (${bandName})` : ''}`,
      location: settings.studioAddress || 'Zen Business Center - 202, Bhumkar Chowk Rd, above Cafe Coffee Day, Shankar Kalat Nagar, Wakad, Pune, Pimpri-Chinchwad, Maharashtra 411057',
      startDate: bookingDate,
      startTime,
      endTime,
      attendees: [selectedUser.email, ...adminNotificationEmails],
      studioName: settings.studioName || 'Swar JamRoom'
    });

    const loginCredentialsSection = selectedUser.forcePasswordReset ? `
        <h3>Login Details (Important)</h3>
        <p>Your account was created by our admin team for this booking.</p>
        <ul>
          <li><strong>Login URL:</strong> <a href="${DEFAULT_APP_LOGIN_URL}">${DEFAULT_APP_LOGIN_URL}</a></li>
          <li><strong>Email:</strong> ${selectedUser.email}</li>
          <li><strong>Temporary Password:</strong> ${DEFAULT_ADMIN_CREATED_USER_PASSWORD}</li>
        </ul>
        <p><strong>Security Notice:</strong> You must reset your password on first login before continuing.</p>
    ` : '';

    await sendUnifiedBookingConfirmationEmails({
      settings,
      booking,
      confirmedByName: req.user.name,
      calendarInvite,
      customerExtraHtml: loginCredentialsSection
    });

    if (selectedUser.mobile) {
      try {
        await sendBookingConfirmationWhatsApp(selectedUser.mobile, {
          bookingId: booking._id,
          date: displayDate,
          startTime,
          endTime,
          totalAmount: calculatedTotalAmount,
          rentals: rentalsWhatsAppSummary,
          status: enforcedBookingStatus,
          paymentStatus: normalizedPaymentTracking.paymentStatus
        });
      } catch (whatsappError) {
        console.log('Customer WhatsApp failed:', whatsappError.message);
      }
    }

    try {
      await sendBookingConfirmationNotifications({
        userName: selectedUser.name,
        userEmail: selectedUser.email,
        userMobile: selectedUser.mobile,
        date: displayDate,
        startTime,
        endTime,
        totalAmount: calculatedTotalAmount,
        bookingId: booking._id,
        bandName,
        paymentStatus: normalizedPaymentTracking.paymentStatus
      }, settings.whatsappNotifications);
    } catch (whatsappError) {
      console.log('WhatsApp notifications failed:', whatsappError.message);
    }

    const populatedBooking = await Booking.findById(booking._id).populate('userId', 'name email mobile');

    console.log('✅ Admin booking created successfully:', booking._id);

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
        priceAdjustmentType: populatedBooking.priceAdjustmentType,
        priceAdjustmentAmount: populatedBooking.priceAdjustmentAmount,
        priceAdjustmentValue: populatedBooking.priceAdjustmentValue,
        priceAdjustmentNote: populatedBooking.priceAdjustmentNote,
        price: populatedBooking.price,
        bandName: populatedBooking.bandName,
        notes: populatedBooking.notes,
        paymentStatus: populatedBooking.paymentStatus,
        amountPaid: populatedBooking.amountPaid,
        paymentReference: populatedBooking.paymentReference,
        paymentNote: populatedBooking.paymentNote,
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

module.exports = router;
