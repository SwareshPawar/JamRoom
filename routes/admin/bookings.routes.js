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
const { generateCalendarInvite, buildBookingCalendarUid } = require('../../utils/calendar');
const {
  generateBillForDownloadWithFilename
} = require('../../utils/billGenerator');
const { buildInvoiceStyleEmail } = require('../../utils/templates/email/invoiceStyleEmailTemplate');
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
  formatDateAsYmdInIst,
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
const { buildEbillEmailHtml } = require('../../utils/templates/email/ebillEmailTemplate');

// Class booking helpers used by admin create-booking flow.
const adminCalcEndTime = (startTime, durationHours) => {
  const [h, m] = String(startTime || '09:00').split(':').map(Number);
  const totalMin = h * 60 + m + Math.round(durationHours * 60);
  return `${String(Math.floor(totalMin / 60) % 24).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
};

const WEEKDAY_MAP = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
const adminGetNextWeekdayOnOrAfter = (baseDate, weekdayName) => {
  const targetDay = WEEKDAY_MAP[String(weekdayName || '').toLowerCase().trim()];
  if (targetDay === undefined) return null;
  const d = new Date(baseDate);
  const diff = (targetDay - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const adminBuildClassLessons = ({ planStartDate, startTime, endTime, totalClassesPlanned, weeksPerMonthWindow }) => {
  const lessons = [];
  const classes = Math.max(0, Number(totalClassesPlanned || 0));
  const wpmw = Math.max(1, Number(weeksPerMonthWindow || 5));
  for (let i = 0; i < classes; i++) {
    const d = new Date(planStartDate);
    d.setDate(d.getDate() + i * 7);
    lessons.push({
      weekNumber: i + 1,
      classNumber: i + 1,
      scheduledDate: d,
      scheduledStartTime: startTime,
      scheduledEndTime: endTime,
      isCompleted: false
    });
  }
  return lessons;
};

const adminGetClassMonthKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

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

    const calendarEvents = bookings.map((booking) => {
      const bookingDateYmd = formatDateAsYmdInIst(new Date(booking.date));

      return {
        id: booking._id,
        title: `${booking.userName} - ${booking.rentalType}`,
        start: `${bookingDateYmd}T${booking.startTime}:00`,
        end: `${bookingDateYmd}T${booking.endTime}:00`,
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
      };
    });

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
      const queryDate = parseDateInputToStartOfDay(date);
      if (!queryDate) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date format. Use YYYY-MM-DD.'
        });
      }

      const queryDayStart = new Date(queryDate);
      const queryDayEnd = new Date(queryDate);
      queryDayEnd.setHours(23, 59, 59, 999);
      query.date = { $gte: queryDayStart, $lte: queryDayEnd };
    } else if (startDate && endDate) {
      const start = parseDateInputToStartOfDay(startDate);
      const end = parseDateInputToStartOfDay(endDate);

      if (!start || !end) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date range. Use YYYY-MM-DD.'
        });
      }

      const rangeStart = new Date(start);
      const rangeEnd = new Date(end);
      rangeEnd.setHours(23, 59, 59, 999);
      query.date = { $gte: rangeStart, $lte: rangeEnd };
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

    if (!booking.calendarUid) {
      booking.calendarUid = buildBookingCalendarUid(booking._id);
    }

    if (!Number.isFinite(Number(booking.calendarSequence))) {
      booking.calendarSequence = 0;
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
            html: buildInvoiceStyleEmail({
              title: 'Booking Request Update',
              label: 'Rejected',
              greeting: `Hi ${pendingBooking.userName},`,
              introLines: [
                `Unfortunately, your booking request for ${formatBookingDisplayDate(pendingBooking.date)} from ${formatTime12Hour(pendingBooking.startTime)} to ${formatTime12Hour(pendingBooking.endTime)} has been automatically rejected due to a scheduling conflict with another confirmed booking.`
              ],
              summaryTitle: 'Request Details',
              summaryRows: [
                { label: 'Date', value: formatBookingDisplayDate(pendingBooking.date) },
                { label: 'Time', value: `${formatTime12Hour(pendingBooking.startTime)} to ${formatTime12Hour(pendingBooking.endTime)}` },
                { label: 'Rental Type', value: pendingBooking.rentalType }
              ],
              ctaTitle: 'Next Step',
              ctaHtml: '<p>Please feel free to make a new booking request for a different time slot. Thank you for your understanding.</p>'
            })
          });
        } catch (emailError) {
          console.log('Rejection email failed for booking:', pendingBooking._id);
        }
      }
    }

    const displayDate = formatBookingDisplayDate(booking.date);

    // Class bookings don't get a calendar invite on approval — individual slot invites are sent per completed lesson
    const calendarInvite = booking.classSession?.isClassBooking
      ? null
      : generateCalendarInvite({
          title: `${settings.studioName || 'Swar JamRoom'} Booking - ${booking.rentalType}`,
          description: `Booking confirmed for ${booking.userName}${booking.bandName ? ` (${booking.bandName})` : ''}`,
          location: settings.studioAddress || 'Zen Business Center - 202, Bhumkar Chowk Rd, above Cafe Coffee Day, Shankar Kalat Nagar, Wakad, Pune, Pimpri-Chinchwad, Maharashtra 411057',
          startDate: formatDateAsYmdInIst(new Date(booking.date)),
          startTime: booking.startTime,
          endTime: booking.endTime,
          attendees: [booking.userEmail, ...adminNotificationEmails],
          studioName: settings.studioName || 'Swar JamRoom',
          uid: booking.calendarUid,
          sequence: booking.calendarSequence,
          method: 'REQUEST',
          status: 'CONFIRMED'
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
          totalAmount: booking.price,
          classSession: booking.classSession
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
        paymentStatus: booking.paymentStatus,
        classSession: booking.classSession
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

// @route   PUT /api/admin/bookings/:id/class-lessons/:lessonId/complete
// @desc    Mark a class lesson as completed with notes/details
// @access  Private/Admin
router.put('/bookings/:id/class-lessons/:lessonId/complete', protect, isAdmin, async (req, res) => {
  try {
    const { id, lessonId } = req.params;
    const {
      completedDate,
      completedStartTime,
      notes,
      details
    } = req.body || {};

    const [booking, settings] = await Promise.all([
      Booking.findById(id),
      AdminSettings.getSettings()
    ]);
    const sessionDurationHours = Math.max(1, Number(settings?.classConfig?.sessionDurationHours || 1));
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (!booking.classSession?.isClassBooking) {
      return res.status(400).json({
        success: false,
        message: 'This booking is not a class plan booking'
      });
    }

    const lessons = Array.isArray(booking.classSession.lessons) ? booking.classSession.lessons : [];
    const lesson = lessons.find((entry) => String(entry?._id) === String(lessonId));
    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: 'Class lesson not found'
      });
    }

    if (String(lesson.status || '').toUpperCase() === 'COMPLETED') {
      return res.status(400).json({
        success: false,
        message: 'This class lesson is already marked as completed'
      });
    }

    const normalizedCompletedDate = parseDateInputToStartOfDay(completedDate);
    if (!normalizedCompletedDate) {
      return res.status(400).json({
        success: false,
        message: 'Invalid completed date. Please use YYYY-MM-DD format.'
      });
    }

    const startTimeValue = String(completedStartTime || lesson.scheduledStartTime || '').trim();
    const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timePattern.test(startTimeValue)) {
      return res.status(400).json({ success: false, message: 'Invalid start time format. Use HH:mm.' });
    }
    const startMins = startTimeValue.split(':').reduce((h, m, i) => i === 0 ? Number(m) * 60 : h + Number(m), 0);
    const endMins = startMins + sessionDurationHours * 60;
    const endTimeValue = `${String(Math.floor(endMins / 60) % 24).padStart(2, '0')}:${String(endMins % 60).padStart(2, '0')}`;

    lesson.status = 'COMPLETED';
    lesson.completedAt = new Date();
    lesson.completedDate = normalizedCompletedDate;
    lesson.completedStartTime = startTimeValue;
    lesson.completedEndTime = endTimeValue;
    lesson.notes = String(notes || '').trim();
    lesson.details = String(details || '').trim();
    lesson.completedBy = req.user._id;

    const completedClassesCount = lessons.filter((entry) => String(entry?.status || '').toUpperCase() === 'COMPLETED').length;
    const totalClassesPlanned = Math.max(0, Number(booking.classSession.totalClassesPlanned || lessons.length || 0));

    booking.classSession.completedClassesCount = completedClassesCount;
    booking.classSession.classesRemainingAfterBooking = Math.max(0, totalClassesPlanned - completedClassesCount);
    booking.markModified('classSession');

    await booking.save();

    res.json({
      success: true,
      message: 'Class lesson marked as completed',
      booking
    });
  } catch (error) {
    console.error('Complete class lesson error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating class lesson status'
    });
  }
});

// @route   PUT /api/admin/bookings/:id/class-lessons/:lessonId/cancel
// @desc    Cancel a class lesson
// @access  Private/Admin
router.put('/bookings/:id/class-lessons/:lessonId/cancel', protect, isAdmin, async (req, res) => {
  try {
    const { id, lessonId } = req.params;
    const { reason } = req.body || {};

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (!booking.classSession?.isClassBooking) {
      return res.status(400).json({ success: false, message: 'This booking is not a class plan booking' });
    }

    const lessons = Array.isArray(booking.classSession.lessons) ? booking.classSession.lessons : [];
    const lesson = lessons.find((entry) => String(entry?._id) === String(lessonId));
    if (!lesson) {
      return res.status(404).json({ success: false, message: 'Class lesson not found' });
    }

    const currentStatus = String(lesson.status || '').toUpperCase();
    if (currentStatus === 'CANCELLED') {
      return res.status(400).json({ success: false, message: 'This class lesson is already cancelled' });
    }
    if (currentStatus === 'COMPLETED') {
      return res.status(400).json({ success: false, message: 'Cannot cancel a lesson that is already completed' });
    }

    lesson.status = 'CANCELLED';
    lesson.notes = String(reason || lesson.notes || '').trim();

    const completedClassesCount = lessons.filter((entry) => String(entry?.status || '').toUpperCase() === 'COMPLETED').length;
    const totalClassesPlanned = Math.max(0, Number(booking.classSession.totalClassesPlanned || lessons.length || 0));
    booking.classSession.completedClassesCount = completedClassesCount;
    booking.classSession.classesRemainingAfterBooking = Math.max(0, totalClassesPlanned - completedClassesCount);
    booking.markModified('classSession');

    await booking.save();

    res.json({ success: true, message: 'Class lesson cancelled', booking });
  } catch (error) {
    console.error('Cancel class lesson error:', error);
    res.status(500).json({ success: false, message: 'Server error cancelling class lesson' });
  }
});

// @route   POST /api/admin/bookings/:id/send-ebill
// @route   PUT /api/admin/bookings/:id/class-lessons/:lessonId/approve-slot
// @desc    Approve a student's slot request — updates scheduledDate/Time
// @access  Private/Admin
router.put('/bookings/:id/class-lessons/:lessonId/approve-slot', protect, isAdmin, async (req, res) => {
  try {
    const { id, lessonId } = req.params;
    const { responseNote } = req.body || {};

    const booking = await Booking.findById(id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (!booking.classSession?.isClassBooking) return res.status(400).json({ success: false, message: 'Not a class booking' });

    const lessons = Array.isArray(booking.classSession.lessons) ? booking.classSession.lessons : [];
    const lesson = lessons.find((entry) => String(entry?._id) === String(lessonId));
    if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });

    if (!lesson.slotRequest || String(lesson.slotRequest.status || '') !== 'PENDING') {
      return res.status(400).json({ success: false, message: 'No pending slot request for this lesson' });
    }

    lesson.scheduledDate = lesson.slotRequest.proposedDate;
    lesson.scheduledStartTime = lesson.slotRequest.proposedStartTime;
    lesson.scheduledEndTime = lesson.slotRequest.proposedEndTime;
    lesson.slotRequest.status = 'APPROVED';
    lesson.slotRequest.respondedAt = new Date();
    lesson.slotRequest.responseNote = String(responseNote || '').trim();

    booking.markModified('classSession');
    await booking.save();

    // Send calendar invite + approval email to user and admins
    try {
      const settings = await AdminSettings.getSettings();
      const classItem = booking.classSession?.selectedClassItemName || booking.classSession?.instrument || 'Music Class';
      const slotDateStr = formatDateAsYmdInIst(new Date(lesson.scheduledDate));
      const startTime = lesson.scheduledStartTime;
      const endTime = lesson.scheduledEndTime;
      const adminNotificationEmails = await resolveAdminNotificationEmails(settings);
      let calendarInvite = null;
      try {
        calendarInvite = generateCalendarInvite({
          title: `${settings.studioName || 'Swar JamRoom'} – ${classItem} Class`,
          description: `Class slot confirmed for ${booking.userName || ''}`,
          location: booking.classSession?.location || settings.studioAddress || 'Swar JamRoom & Music Studio',
          startDate: slotDateStr,
          startTime,
          endTime,
          attendees: [booking.userEmail, ...adminNotificationEmails].filter(Boolean),
          studioName: settings.studioName || 'Swar JamRoom',
          uid: `lesson-${booking._id}-${id}@${process.env.CALENDAR_UID_DOMAIN || 'jamroom.local'}`,
          sequence: 0,
          method: 'REQUEST',
          status: 'CONFIRMED'
        });
      } catch (calErr) {
        console.log('Lesson calendar invite generation failed:', calErr.message);
      }

      const formatTime12 = (t) => { const [h, m] = String(t || '00:00').split(':').map(Number); const suf = h >= 12 ? 'PM' : 'AM'; return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suf}`; };
      const slotDateLabel = new Date(lesson.scheduledDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
      const calAttachment = calendarInvite ? [{ filename: 'class-slot.ics', content: calendarInvite, contentType: 'text/calendar; charset=utf-8; method=REQUEST' }] : [];

      await sendEmail({
        to: booking.userEmail,
        subject: `Class Slot Approved – ${classItem} | JamRoom`,
        html: buildInvoiceStyleEmail({
          title: 'Class Slot Approved',
          label: 'Student Notification',
          greeting: `Hi ${booking.userName || 'Student'},`,
          introLines: ['Your slot request has been approved! Here are your confirmed class details.'],
          summaryTitle: 'Slot Details',
          summaryRows: [
            { label: 'Class', value: classItem },
            { label: 'Date', value: slotDateLabel },
            { label: 'Time', value: `${formatTime12(startTime)} – ${formatTime12(endTime)}` }
          ],
          ctaTitle: 'Calendar Note',
          ctaHtml: calendarInvite ? '<p>A calendar invite is attached — add it to your calendar to get a reminder.</p><p>See you at the session!</p>' : '<p>See you at the session!</p>'
        }),
        attachments: calAttachment
      });

      for (const adminEmail of adminNotificationEmails) {
        if (normalizeEmail(adminEmail) === normalizeEmail(booking.userEmail)) continue;
        try {
          await sendEmail({
            to: adminEmail,
            subject: `Class Slot Approved – ${booking.userName || 'Student'} | JamRoom`,
            html: buildInvoiceStyleEmail({
              title: 'Class Slot Approved',
              label: 'Admin Notification',
              greeting: 'Hello Team,',
              introLines: [`Slot request approved by ${req.user.name}.`],
              summaryTitle: 'Details',
              summaryRows: [
                { label: 'Student', value: `${booking.userName || 'N/A'} (${booking.userEmail || 'N/A'})` },
                { label: 'Class', value: classItem },
                { label: 'Date', value: slotDateLabel },
                { label: 'Time', value: `${formatTime12(startTime)} – ${formatTime12(endTime)}` }
              ]
            }),
            attachments: calAttachment
          });
        } catch (adminEmailErr) {
          console.log(`Admin slot approval email failed for ${adminEmail}:`, adminEmailErr.message);
        }
      }
    } catch (notifyErr) {
      console.log('Slot approval notification failed:', notifyErr.message);
    }

    res.json({ success: true, message: 'Slot request approved', booking });
  } catch (error) {
    console.error('Approve slot error:', error);
    res.status(500).json({ success: false, message: 'Server error approving slot' });
  }
});

// @route   PUT /api/admin/bookings/:id/class-lessons/:lessonId/reject-slot
// @desc    Reject a student's slot request
// @access  Private/Admin
router.put('/bookings/:id/class-lessons/:lessonId/reject-slot', protect, isAdmin, async (req, res) => {
  try {
    const { id, lessonId } = req.params;
    const { responseNote } = req.body || {};

    const booking = await Booking.findById(id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (!booking.classSession?.isClassBooking) return res.status(400).json({ success: false, message: 'Not a class booking' });

    const lessons = Array.isArray(booking.classSession.lessons) ? booking.classSession.lessons : [];
    const lesson = lessons.find((entry) => String(entry?._id) === String(lessonId));
    if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });

    if (!lesson.slotRequest || String(lesson.slotRequest.status || '') !== 'PENDING') {
      return res.status(400).json({ success: false, message: 'No pending slot request for this lesson' });
    }

    lesson.slotRequest.status = 'REJECTED';
    lesson.slotRequest.respondedAt = new Date();
    lesson.slotRequest.responseNote = String(responseNote || '').trim();

    booking.markModified('classSession');
    await booking.save();
    res.json({ success: true, message: 'Slot request rejected', booking });
  } catch (error) {
    console.error('Reject slot error:', error);
    res.status(500).json({ success: false, message: 'Server error rejecting slot' });
  }
});

// @route   PUT /api/admin/bookings/:id/class-lessons/:lessonId/book-slot
// @desc    Admin directly books/assigns a slot for a lesson (no pending approval needed)
// @access  Private/Admin
router.put('/bookings/:id/class-lessons/:lessonId/book-slot', protect, isAdmin, async (req, res) => {
  try {
    const { id, lessonId } = req.params;
    const { proposedDate, proposedStartTime } = req.body || {};

    const [booking, settings] = await Promise.all([
      Booking.findById(id),
      AdminSettings.getSettings()
    ]);

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (!booking.classSession?.isClassBooking) return res.status(400).json({ success: false, message: 'Not a class booking' });

    const lessons = Array.isArray(booking.classSession.lessons) ? booking.classSession.lessons : [];
    const lesson = lessons.find((entry) => String(entry?._id) === String(lessonId));
    if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });

    const currentStatus = String(lesson.status || '').toUpperCase();
    if (currentStatus === 'COMPLETED') return res.status(400).json({ success: false, message: 'Lesson already completed' });
    if (currentStatus === 'CANCELLED') return res.status(400).json({ success: false, message: 'Lesson is cancelled' });

    const parseDateOnlyToStartOfDay = (raw) => {
      if (!raw) return null;
      const s = String(raw).trim();
      const match = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) return null;
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
    };

    const proposedD = parseDateOnlyToStartOfDay(proposedDate);
    if (!proposedD) return res.status(400).json({ success: false, message: 'Invalid date format. Use YYYY-MM-DD.' });

    const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
    const startTime = String(proposedStartTime || '').trim();
    if (!timePattern.test(startTime)) return res.status(400).json({ success: false, message: 'Invalid start time. Use HH:mm.' });

    const sessionDurationHours = Math.max(1, Number(settings?.classConfig?.sessionDurationHours || 1));
    const startMins = startTime.split(':').reduce((acc, v, i) => i === 0 ? Number(v) * 60 : acc + Number(v), 0);
    const endMins = startMins + sessionDurationHours * 60;
    const endTime = `${String(Math.floor(endMins / 60) % 24).padStart(2, '0')}:${String(endMins % 60).padStart(2, '0')}`;

    // Directly approve — admin is assigning the slot
    lesson.scheduledDate = proposedD;
    lesson.scheduledStartTime = startTime;
    lesson.scheduledEndTime = endTime;
    lesson.slotRequest = {
      proposedDate: proposedD,
      proposedStartTime: startTime,
      proposedEndTime: endTime,
      requestedAt: new Date(),
      status: 'APPROVED',
      respondedAt: new Date(),
      responseNote: `Booked by admin (${req.user.name})`
    };

    booking.markModified('classSession');
    await booking.save();

    // Send calendar invite + notification to user and admins
    try {
      const classItem = booking.classSession?.selectedClassItemName || booking.classSession?.instrument || 'Music Class';
      const slotDateStr = formatDateAsYmdInIst(proposedD);
      const adminNotificationEmails = await resolveAdminNotificationEmails(settings);
      let calendarInvite = null;
      try {
        calendarInvite = generateCalendarInvite({
          title: `${settings.studioName || 'Swar JamRoom'} – ${classItem} Class`,
          description: `Class slot booked for ${booking.userName || ''}`,
          location: booking.classSession?.location || settings.studioAddress || 'Swar JamRoom & Music Studio',
          startDate: slotDateStr,
          startTime,
          endTime,
          attendees: [booking.userEmail, ...adminNotificationEmails].filter(Boolean),
          studioName: settings.studioName || 'Swar JamRoom',
          uid: `lesson-${booking._id}-${lessonId}@${process.env.CALENDAR_UID_DOMAIN || 'jamroom.local'}`,
          sequence: 0,
          method: 'REQUEST',
          status: 'CONFIRMED'
        });
      } catch (calErr) {
        console.log('Lesson calendar invite generation failed:', calErr.message);
      }

      const formatTime12 = (t) => { const [h, m] = String(t || '00:00').split(':').map(Number); const suf = h >= 12 ? 'PM' : 'AM'; return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suf}`; };
      const slotDateLabel = proposedD.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
      const calAttachment = calendarInvite ? [{ filename: 'class-slot.ics', content: calendarInvite, contentType: 'text/calendar; charset=utf-8; method=REQUEST' }] : [];

      try {
        await sendEmail({
          to: booking.userEmail,
          subject: `Class Slot Booked – ${classItem} | JamRoom`,
          html: buildInvoiceStyleEmail({
            title: 'Class Slot Booked',
            label: 'Student Notification',
            greeting: `Hi ${booking.userName || 'Student'},`,
            introLines: ['Your class slot has been booked by the studio team.'],
            summaryTitle: 'Slot Details',
            summaryRows: [
              { label: 'Class', value: classItem },
              { label: 'Date', value: slotDateLabel },
              { label: 'Time', value: `${formatTime12(startTime)} – ${formatTime12(endTime)}` }
            ],
            ctaTitle: 'Calendar Note',
            ctaHtml: calendarInvite ? '<p>A calendar invite is attached — add it to your calendar to get a reminder.</p><p>See you at the session!</p>' : '<p>See you at the session!</p>'
          }),
          attachments: calAttachment
        });
      } catch (userEmailErr) {
        console.log('User slot booking email failed:', userEmailErr.message);
      }

      for (const adminEmail of adminNotificationEmails) {
        if (normalizeEmail(adminEmail) === normalizeEmail(booking.userEmail)) continue;
        try {
          await sendEmail({
            to: adminEmail,
            subject: `Class Slot Booked – ${booking.userName || 'Student'} | JamRoom`,
            html: buildInvoiceStyleEmail({
              title: 'Class Slot Booked',
              label: 'Admin Notification',
              greeting: 'Hello Team,',
              introLines: [`Slot assigned by ${req.user.name}.`],
              summaryTitle: 'Details',
              summaryRows: [
                { label: 'Student', value: `${booking.userName || 'N/A'} (${booking.userEmail || 'N/A'})` },
                { label: 'Class', value: classItem },
                { label: 'Date', value: slotDateLabel },
                { label: 'Time', value: `${formatTime12(startTime)} – ${formatTime12(endTime)}` }
              ]
            }),
            attachments: calAttachment
          });
        } catch (adminEmailErr) {
          console.log(`Admin slot booking email failed for ${adminEmail}:`, adminEmailErr.message);
        }
      }
    } catch (notifyErr) {
      console.log('Slot booking notification failed:', notifyErr.message);
    }

    res.json({ success: true, message: 'Slot booked successfully', booking });
  } catch (error) {
    console.error('Admin book-slot error:', error);
    res.status(500).json({ success: false, message: 'Server error booking slot' });
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
    let filename = '';

    console.log('📄 Generating eBill PDF attachment...');

    try {
      const generated = await generateBillForDownloadWithFilename(booking);
      pdfBuffer = generated.pdfBuffer;
      filename = generated.filename;
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
    const displayDate = formatBookingDisplayDate(bookingDate);

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

    const frontendBookingUrl = `${process.env.FRONTEND_URL || 'https://jamroom.vercel.app'}/booking.html`;
    const timeRangeLabel = formatTimeRange12Hour(booking.startTime, booking.endTime);
    const discountFromAdjustment = signedAdjustment < 0 ? Math.abs(signedAdjustment) : 0;
    const totalDiscountAmountForEmail = discountFromAdjustment;
    const discountHighlightHtml = totalDiscountAmountForEmail > 0
      ? `<div style="margin:14px 0 12px;padding:14px 16px;border-radius:12px;border:1px solid #86efac;background:linear-gradient(135deg,#ecfdf3 0%,#d9fbe8 100%);">
          <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#166534;font-weight:800;">&#127381; Discount Applied</div>
          <div style="margin-top:4px;font-size:30px;line-height:1.1;font-weight:800;color:#14532d;">-&#8377;${totalDiscountAmountForEmail.toFixed(2)}</div>
          <div style="font-size:12px;color:#166534;margin-top:4px;">You saved &#8377;${totalDiscountAmountForEmail.toFixed(2)} on this booking</div>
        </div>`
      : '';
    const payableHighlightHtml = outstandingAmount > 0
      ? `<div style="margin:14px 0 10px;padding:14px 16px;border-radius:12px;border:1px solid #fca5a5;background:linear-gradient(135deg,#fff7ed 0%,#ffedd5 100%);">
      <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#9a3412;font-weight:800;">&#9888;&#65039; Outstanding Balance</div>
      <div style="margin-top:4px;font-size:34px;line-height:1.05;font-weight:900;color:#7c2d12;">&#8377;${outstandingAmount.toFixed(2)}</div>
      <div style="font-size:12px;color:#9a3412;margin-top:4px;">Please clear the balance before your scheduled slot</div>
    </div>`
      : '';
    const emailSubject = `Invoice for Your ${settings?.studioName || 'JamRoom'} Booking - ${displayDate}`;
    const emailHtml = buildEbillEmailHtml({
      settings,
      booking,
      displayDate,
      totalAmount,
      bookingStatusLabel,
      paymentStatusLabel,
      paymentStatusBorder,
      paymentStatusBackground,
      paymentStatusColor,
      collectedAmount,
      outstandingAmount,
      paymentNarrative,
      discountHighlightHtml,
      payableHighlightHtml,
      subtotal,
      gstEnabled,
      gstDisplayName,
      gstRate,
      taxAmount,
      signedAdjustment,
      adjustmentLabel,
      adjustmentDisplayAmount,
      pdfAttached: !!pdfBuffer,
      frontendBookingUrl,
      appLoginUrl: DEFAULT_APP_LOGIN_URL,
      timeRangeLabel
    });

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

    const displayDate = formatBookingDisplayDate(booking.date);

    try {
      await sendEmail({
        to: booking.userEmail,
        subject: `Booking Update - ${settings.studioName || 'Swar JamRoom Studio'}`,
        html: buildInvoiceStyleEmail({
          title: 'Booking Update',
          label: 'Declined',
          greeting: `Hi ${booking.userName},`,
          introLines: ['Unfortunately, your booking request has been declined.'],
          summaryTitle: 'Booking Details',
          summaryRows: [
            { label: 'Date', value: displayDate },
            { label: 'Time', value: formatTimeRange12Hour(booking.startTime, booking.endTime) },
            { label: 'Rental Type', value: booking.rentalType },
            ...(reason ? [{ label: 'Reason', value: reason }] : [])
          ],
          ctaTitle: 'Next Step',
          ctaHtml: '<p>Please contact us if you have any questions or would like to book another slot.</p>'
        })
      });
    } catch (emailError) {
      console.log('Rejection email failed:', emailError.message);
    }

    if (booking.userMobile) {
      try {
        const message = `❌ JamRoom Booking Declined\n\nHi ${booking.userName},\nUnfortunately, your booking request has been declined.\n\n📅 Date: ${displayDate}\n⏰ Time: ${formatTimeRange12Hour(booking.startTime, booking.endTime)}\n${reason ? `📝 Reason: ${reason}` : ''}\n\nPlease contact us for alternative slots. 📞`;
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
    const displayDate = formatBookingDisplayDate(booking.date);

    try {
      await sendEmail({
        to: booking.userEmail,
        subject: `Booking Deleted - ${settings.studioName || 'Swar JamRoom'}`,
        html: buildInvoiceStyleEmail({
          title: 'Booking Deleted',
          label: 'Admin Action',
          greeting: `Hi ${booking.userName},`,
          introLines: ['Your booking has been deleted by the admin team.'],
          summaryTitle: 'Deleted Booking Details',
          summaryRows: [
            { label: 'Date', value: displayDate },
            { label: 'Time', value: formatTimeRange12Hour(booking.startTime, booking.endTime) },
            { label: 'Duration', value: `${booking.duration} hour(s)` },
            { label: 'Rental Type', value: booking.rentalType },
            { label: 'Price', value: `₹${booking.price}` }
          ],
          ctaTitle: 'Support',
          ctaHtml: '<p>If you have any questions, please contact us. If you paid for this booking, please contact us for refund information.</p>'
        })
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

    const previousDateYmd = formatDateAsYmdInIst(new Date(booking.date));
    const previousStartTime = String(booking.startTime || '');
    const previousEndTime = String(booking.endTime || '');
    const previousDuration = Number(booking.duration || 0);

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

    if (date) {
      const parsedBookingDate = parseDateInputToStartOfDay(date);
      if (!parsedBookingDate) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date format. Use YYYY-MM-DD.'
        });
      }

      booking.date = parsedBookingDate;
    }
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

    const updatedDateYmd = formatDateAsYmdInIst(new Date(booking.date));
    const hasCalendarRelevantChange = (
      previousDateYmd !== updatedDateYmd ||
      previousStartTime !== String(booking.startTime || '') ||
      previousEndTime !== String(booking.endTime || '') ||
      previousDuration !== Number(booking.duration || 0)
    );

    if (booking.bookingStatus === 'CONFIRMED' && hasCalendarRelevantChange) {
      if (!booking.calendarUid) {
        booking.calendarUid = buildBookingCalendarUid(booking._id);
      }
      booking.calendarSequence = Math.max(0, Number(booking.calendarSequence || 0)) + 1;
    }

    await booking.save();

    const displayDate = formatBookingDisplayDate(booking.date);
    const updateInvite = (booking.bookingStatus === 'CONFIRMED' && hasCalendarRelevantChange)
      ? generateCalendarInvite({
          title: `${settings.studioName || 'Swar JamRoom'} Booking - ${booking.rentalType}`,
          description: `Booking updated for ${booking.userName}${booking.bandName ? ` (${booking.bandName})` : ''}`,
          location: settings.studioAddress || 'Zen Business Center - 202, Bhumkar Chowk Rd, above Cafe Coffee Day, Shankar Kalat Nagar, Wakad, Pune, Pimpri-Chinchwad, Maharashtra 411057',
          startDate: updatedDateYmd,
          startTime: booking.startTime,
          endTime: booking.endTime,
          attendees: [booking.userEmail],
          studioName: settings.studioName || 'Swar JamRoom',
          uid: booking.calendarUid,
          sequence: booking.calendarSequence,
          method: 'REQUEST',
          status: 'CONFIRMED'
        })
      : null;

    try {
      await sendEmail({
        to: booking.userEmail,
        subject: `Booking Updated - ${settings.studioName || 'Swar JamRoom'}`,
        html: buildInvoiceStyleEmail({
          title: 'Booking Updated',
          label: 'Admin Update',
          greeting: `Hi ${booking.userName},`,
          introLines: ['Your booking has been updated by the admin team.'],
          summaryTitle: 'Updated Booking Details',
          summaryRows: [
            { label: 'Date', value: displayDate },
            { label: 'Time', value: formatTimeRange12Hour(booking.startTime, booking.endTime) },
            { label: 'Duration', value: `${booking.duration} hour(s)` },
            { label: 'Rental Type', value: booking.rentalType },
            { label: 'Price', value: `₹${booking.price}` },
            ...(booking.notes ? [{ label: 'Notes', value: booking.notes }] : [])
          ],
          ctaTitle: 'Next Step',
          ctaHtml: updateInvite ? '<p>An updated calendar invite is attached. Please accept it to refresh your calendar slot.</p>' : '<p>If you have any questions about these changes, please contact us.</p>'
        }),
        attachments: updateInvite
          ? [{
              filename: 'booking-updated.ics',
              content: updateInvite,
              contentType: 'text/calendar; charset=utf-8; method=REQUEST'
            }]
          : []
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
      startTime: reqStartTime,
      endTime: reqEndTime,
      duration: reqDuration,
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
      paymentNote,
      classLocation,
      classPreferredWeekday,
      classPreferredStartTime,
      classPlanMonths: reqClassPlanMonths,
      perDayStartDate,
      perDayEndDate,
      perDayPickupTime,
      perDayReturnTime,
      perDayDays: reqPerDayDays
    } = req.body;

    const shouldOverrideDateTime = overrideDateTime === true || String(overrideDateTime).toLowerCase() === 'true';
    const isAdminClassBooking = !!(classLocation && classPreferredWeekday);
    const isAdminPerdayBooking = String(req.body.bookingMode || '').toLowerCase() === 'perday';
    const startTime = isAdminClassBooking ? (classPreferredStartTime || '09:00') : (isAdminPerdayBooking ? (perDayPickupTime || '09:00') : reqStartTime);
    const endTime = isAdminClassBooking ? null : (isAdminPerdayBooking ? (perDayReturnTime || '18:00') : reqEndTime);
    const duration = isAdminClassBooking ? 1 : (isAdminPerdayBooking ? (Number(reqPerDayDays || 1) * 24) : reqDuration);
    const requestedPaymentStatus = paymentStatus;
    const requestedAmountPaid = amountPaid;
    const normalizedPaymentReference = String(paymentReference || '').trim();
    const normalizedPaymentNote = String(paymentNote || '').trim();
    const enforcedBookingStatus = 'CONFIRMED';

    if (!userId || !rentals || !Array.isArray(rentals) || rentals.length === 0) {
      return res.status(400).json({ success: false, message: 'Please provide userId and at least one rental' });
    }
    if (isAdminClassBooking) {
      if (!classPreferredWeekday) return res.status(400).json({ success: false, message: 'Please select a preferred weekday for class booking' });
      if (!classPreferredStartTime) return res.status(400).json({ success: false, message: 'Please select a class start time' });
      if (!classLocation) return res.status(400).json({ success: false, message: 'Please select a class location' });
    } else if (isAdminPerdayBooking) {
      if (!perDayStartDate) return res.status(400).json({ success: false, message: 'Please provide a pickup date' });
      if (!perDayEndDate) return res.status(400).json({ success: false, message: 'Please provide a return date' });
    } else {
      if (!date || !startTime || !endTime || !duration) {
        return res.status(400).json({ success: false, message: 'Please provide date, startTime, endTime, and duration' });
      }
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

    // Mode-aware booking date resolution
    let bookingDate;
    let effectiveStartTime = startTime;
    let effectiveEndTime = endTime;
    let effectiveDuration = duration;

    if (isAdminPerdayBooking) {
      bookingDate = parseDateInputToStartOfDay(perDayStartDate);
    } else if (isAdminClassBooking) {
      // For class bookings, use today as the plan start (admin override)
      bookingDate = parseDateInputToStartOfDay(date || new Date().toISOString().split('T')[0]);
      if (!bookingDate) bookingDate = new Date(new Date().toDateString());
    } else {
      bookingDate = parseDateInputToStartOfDay(date);
    }

    if (!bookingDate) {
      return res.status(400).json({ success: false, message: 'Invalid booking date. Use YYYY-MM-DD format.' });
    }

    const checkTimeConflict = (start1, end1, start2, end2) => {
      const timeToMinutes = (time) => {
        const [hours, minutes] = time.split(':').map(Number);
        return hours * 60 + minutes;
      };
      return (timeToMinutes(start1) < timeToMinutes(end2) && timeToMinutes(end1) > timeToMinutes(start2));
    };

    if (!shouldOverrideDateTime && !isAdminClassBooking && !isAdminPerdayBooking) {
      const existingBookings = await Booking.find({
        date: bookingDate,
        bookingStatus: 'CONFIRMED',
        ...buildHourlySlotModeFilter()
      });

      for (const booking of existingBookings) {
        if (checkTimeConflict(effectiveStartTime, effectiveEndTime, booking.startTime, booking.endTime)) {
          return res.status(400).json({
            success: false,
            message: `Time conflict with existing booking (${formatTimeRange12Hour(booking.startTime, booking.endTime)})`
          });
        }
      }

      const blockedTimes = await BlockedTime.find({ date: bookingDate });
      for (const blocked of blockedTimes) {
        if (checkTimeConflict(effectiveStartTime, effectiveEndTime, blocked.startTime, blocked.endTime)) {
          return res.status(400).json({
            success: false,
            message: `This time slot is blocked by admin (${formatTimeRange12Hour(blocked.startTime, blocked.endTime)})`
          });
        }
      }
    } else if (!isAdminClassBooking && !isAdminPerdayBooking) {
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

    // Build classSession for class bookings
    let classSession = null;
    if (isAdminClassBooking) {
      const classConfig = settings.classConfig || {};
      const monthlyFee = Math.max(0, Number(classConfig.monthlyFee || 2000));
      const classesPerMonth = Math.max(1, Number(classConfig.classesPerMonth || 4));
      const sessionDurationHours = Math.max(1, Number(classConfig.sessionDurationHours || 1));
      const weeksPerMonthWindow = Math.max(1, Number(classConfig.weeksPerMonthWindow || 5));
      const selectedPlanMonths = Math.max(1, Number(reqClassPlanMonths || 1));
      const multiMonthDiscounts = Array.isArray(classConfig.multiMonthDiscounts) ? classConfig.multiMonthDiscounts : [];
      const discountEntry = multiMonthDiscounts.find((d) => Number(d.months) === selectedPlanMonths);
      const totalFeeBeforeDiscount = monthlyFee * selectedPlanMonths;
      const discountAmount = discountEntry ? Math.round(totalFeeBeforeDiscount * Number(discountEntry.discountPercent || 0) / 100) : 0;
      const totalFeeAfterDiscount = Math.max(0, totalFeeBeforeDiscount - discountAmount);
      const normalizedPreferredWeekday = String(classPreferredWeekday || '').trim().toLowerCase();
      const firstClassDate = adminGetNextWeekdayOnOrAfter(bookingDate, normalizedPreferredWeekday) || bookingDate;
      effectiveStartTime = String(classPreferredStartTime || '09:00').trim();
      effectiveEndTime = adminCalcEndTime(effectiveStartTime, sessionDurationHours);
      effectiveDuration = sessionDurationHours;
      bookingDate = firstClassDate;
      const totalClassesPlanned = classesPerMonth * selectedPlanMonths;
      const planEndDate = new Date(bookingDate);
      planEndDate.setDate(planEndDate.getDate() + selectedPlanMonths * weeksPerMonthWindow * 7);
      const lessons = adminBuildClassLessons({ planStartDate: bookingDate, startTime: effectiveStartTime, endTime: effectiveEndTime, totalClassesPlanned, weeksPerMonthWindow });
      const instrument = (rentals[0]?.name || '').trim();
      classSession = {
        isClassBooking: true,
        location: String(classLocation || '').trim(),
        instrument,
        classMonth: adminGetClassMonthKey(bookingDate),
        monthlyFee,
        classesPerMonth,
        classNumberInMonth: 1,
        classesRemainingAfterBooking: totalClassesPlanned,
        monthlyFeeDueNow: totalFeeAfterDiscount,
        planMonths: selectedPlanMonths,
        weeksPerMonthWindow,
        planStartDate: bookingDate,
        planEndDate,
        totalClassesPlanned,
        completedClassesCount: 0,
        selectedClassItemName: instrument,
        preferredWeekday: normalizedPreferredWeekday,
        preferredStartTime: effectiveStartTime,
        preferredEndTime: effectiveEndTime,
        totalFeeBeforeDiscount,
        discountAmount,
        totalFeeAfterDiscount,
        lessons
      };
    }

    const booking = await Booking.create({
      userId: selectedUser._id,
      ...(isAdminPerdayBooking ? { bookingMode: 'perday' } : {}),
      date: bookingDate,
      startTime: effectiveStartTime,
      endTime: effectiveEndTime,
      duration: effectiveDuration,
      ...(isAdminPerdayBooking ? {
        perDayStartDate: parseDateInputToStartOfDay(perDayStartDate),
        perDayEndDate: parseDateInputToStartOfDay(perDayEndDate),
        perDayDays: Number(reqPerDayDays || 1)
      } : {}),
      ...(classSession ? { classSession } : {}),
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
        ? `${notes ? `${notes}\n` : ""}[Admin Override] Date/time checks bypassed for historical booking entry.`
        : notes,
      paymentStatus: normalizedPaymentTracking.paymentStatus,
      amountPaid: normalizedPaymentTracking.amountPaid,
      paymentReference: normalizedPaymentReference,
      paymentNote: normalizedPaymentNote,
      bookingStatus: enforcedBookingStatus,
      calendarSequence: 0
    });

    // Replace placeholder UID with one derived from the actual saved booking id.
    booking.calendarUid = buildBookingCalendarUid(booking._id);
    await booking.save();

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
        itemTotal = rental.price * rental.quantity * effectiveDuration;
        return `${rental.name} × ${rental.quantity} × ${effectiveDuration}h - ₹${itemTotal}`;
      }
    }).join('\n');

    const calendarInvite = generateCalendarInvite({
      title: `${settings.studioName || 'Swar JamRoom'} Booking - ${rentalTypeSummary}`,
      description: `Booking confirmed for ${selectedUser.name}${bandName ? ` (${bandName})` : ''}`,
      location: settings.studioAddress || 'Zen Business Center - 202, Bhumkar Chowk Rd, above Cafe Coffee Day, Shankar Kalat Nagar, Wakad, Pune, Pimpri-Chinchwad, Maharashtra 411057',
      startDate: formatDateAsYmdInIst(new Date(bookingDate)),
      startTime: effectiveStartTime,
      endTime: effectiveEndTime,
      attendees: [selectedUser.email, ...adminNotificationEmails],
      studioName: settings.studioName || 'Swar JamRoom',
      uid: booking.calendarUid,
      sequence: booking.calendarSequence,
      method: 'REQUEST',
      status: 'CONFIRMED'
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
          startTime: effectiveStartTime,
          endTime: effectiveEndTime,
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
        startTime: effectiveStartTime,
        endTime: effectiveEndTime,
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
        bookingMode: populatedBooking.bookingMode || 'hourly',
        perDayStartDate: populatedBooking.perDayStartDate,
        perDayEndDate: populatedBooking.perDayEndDate,
        perDayDays: populatedBooking.perDayDays,
        classSession: populatedBooking.classSession,
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
