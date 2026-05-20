const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const OpenEvent = require('../models/OpenEvent');
const OpenEventBooking = require('../models/OpenEventBooking');
const AdminSettings = require('../models/AdminSettings');
const { protect } = require('../middleware/auth');
const { sendEmail } = require('../utils/email');
const { buildInvoiceStyleEmail } = require('../utils/templates/email/invoiceStyleEmailTemplate');
const { generateCalendarInvite } = require('../utils/calendar');

const IST_OFFSET = '+05:30';

const buildBookingFooterEmailConfig = (settings = {}) => {
  const emailSettings = settings?.emailSettings && typeof settings.emailSettings === 'object'
    ? settings.emailSettings
    : {};

  return {
    bookingFooterTermsTitle: String(emailSettings.bookingTermsTitle || '').trim() || 'Booking Terms',
    bookingFooterTerms: Array.isArray(emailSettings.bookingTerms) ? emailSettings.bookingTerms : [],
    bookingFooterOfferBadgeText: String(emailSettings.offerBadgeText || '').trim() || 'Special Offer',
    bookingFooterOfferLine: String(emailSettings.offerLine || '').trim(),
    bookingFooterOfferNote: String(emailSettings.offerNote || '').trim()
  };
};

const parseTimeToMinutes = (timeValue) => {
  const [hourPart, minutePart] = String(timeValue || '').split(':');
  const hours = Number(hourPart);
  const minutes = Number(minutePart);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return NaN;
  return (hours * 60) + minutes;
};

const formatMinutesToTime = (totalMinutes) => {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const toIstDateTime = (dateValue, timeValue) => {
  return new Date(`${dateValue}T${timeValue}:00${IST_OFFSET}`);
};

const getTodayDateInIst = () => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  return formatter.format(now);
};

const extractFirstName = (fullName) => {
  const trimmed = String(fullName || '').trim();
  if (!trimmed) return 'Guest';
  return trimmed.split(/\s+/)[0];
};

const formatTime12Hour = (time24) => {
  const [hoursRaw, minutesRaw] = String(time24 || '').split(':');
  const hoursNum = Number(hoursRaw);
  const minutesNum = Number(minutesRaw);
  if (Number.isNaN(hoursNum) || Number.isNaN(minutesNum)) return String(time24 || '');
  const suffix = hoursNum >= 12 ? 'PM' : 'AM';
  const hour12 = hoursNum % 12 || 12;
  return `${hour12}:${String(minutesNum).padStart(2, '0')} ${suffix}`;
};

const formatTimeRange12Hour = (startTime, endTime) => `${formatTime12Hour(startTime)} - ${formatTime12Hour(endTime)}`;

const resolveUserIdFromAuthorization = (authorizationHeader) => {
  try {
    if (!authorizationHeader || !String(authorizationHeader).startsWith('Bearer ')) {
      return null;
    }

    const token = String(authorizationHeader).split(' ')[1];
    if (!token) return null;

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded?.id ? String(decoded.id) : null;
  } catch (_error) {
    return null;
  }
};

const buildSlots = ({ event, confirmedBookings, myBookingSlotIndex, includeBookedNames }) => {
  const slotCount = event.getSlotCount();
  const startMinutes = parseTimeToMinutes(event.startTime);
  const now = new Date();

  const bookingBySlot = new Map();
  confirmedBookings.forEach((booking) => {
    bookingBySlot.set(booking.slotIndex, booking);
  });

  return Array.from({ length: slotCount }, (_, index) => {
    const slotStartMinutes = startMinutes + (index * event.slotDuration);
    const slotEndMinutes = slotStartMinutes + event.slotDuration;
    const slotStartTime = formatMinutesToTime(slotStartMinutes);
    const slotEndTime = formatMinutesToTime(slotEndMinutes);
    const slotStartDateTime = toIstDateTime(event.date, slotStartTime);

    const booking = bookingBySlot.get(index);
    let status = 'available';
    if (booking) {
      status = 'booked';
    } else if (now >= slotStartDateTime) {
      status = 'past';
    }

    return {
      index,
      startTime: slotStartTime,
      endTime: slotEndTime,
      startTimeLabel: formatTime12Hour(slotStartTime),
      endTimeLabel: formatTime12Hour(slotEndTime),
      timeLabel: formatTimeRange12Hour(slotStartTime, slotEndTime),
      status,
      bookedByName: includeBookedNames && booking
        ? String(booking.userId?.name || booking.userFirstName || '').trim()
        : '',
      bookedByPhone: includeBookedNames && booking
        ? String(booking.userId?.mobile || '').trim()
        : '',
      isMine: typeof myBookingSlotIndex === 'number' && myBookingSlotIndex === index
    };
  });
};

const eventSummary = (event, bookingCount = 0) => ({
  id: event._id,
  title: event.title,
  quickFacts: event.quickFacts,
  description: event.description,
  notes: event.notes,
  date: event.date,
  startTime: event.startTime,
  endTime: event.endTime,
  startTimeLabel: formatTime12Hour(event.startTime),
  endTimeLabel: formatTime12Hour(event.endTime),
  timeLabel: formatTimeRange12Hour(event.startTime, event.endTime),
  slotDuration: event.slotDuration,
  slotCount: event.getSlotCount(),
  status: event.status,
  bookingCount,
  createdAt: event.createdAt,
  updatedAt: event.updatedAt
});

router.get('/', async (_req, res) => {
  try {
    const todayIst = getTodayDateInIst();

    const events = await OpenEvent.find({
      status: 'published',
      date: { $gte: todayIst }
    }).sort({ date: 1, startTime: 1 });

    res.json({
      success: true,
      count: events.length,
      events: events.map((event) => eventSummary(event))
    });
  } catch (error) {
    console.error('List open events error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch open events'
    });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const event = await OpenEvent.findById(req.params.id);
    if (!event || event.status === 'cancelled') {
      return res.status(404).json({
        success: false,
        message: 'Open event not found'
      });
    }

    if (event.status !== 'published') {
      return res.status(404).json({
        success: false,
        message: 'Open event is not published yet'
      });
    }

    const confirmedBookings = await OpenEventBooking.find({
      eventId: event._id,
      status: 'confirmed'
    }).populate('userId', 'name mobile').sort({ slotIndex: 1 });

    const requestUserId = resolveUserIdFromAuthorization(req.headers.authorization);
    let includeBookedNames = false;
    let myBookingSlotIndex = null;

    if (requestUserId) {
      const requestUser = await User.findById(requestUserId).select('role');
      includeBookedNames = String(requestUser?.role || '').toLowerCase() === 'admin';
      const myBooking = confirmedBookings.find((booking) => String(booking.userId?._id || booking.userId) === requestUserId);
      myBookingSlotIndex = myBooking ? myBooking.slotIndex : null;
    }

    const slots = buildSlots({ event, confirmedBookings, myBookingSlotIndex, includeBookedNames });

    res.json({
      success: true,
      event: eventSummary(event, confirmedBookings.length),
      slots
    });
  } catch (error) {
    console.error('Get open event error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch open event'
    });
  }
});

router.post('/:id/book', protect, async (req, res) => {
  try {
    const slotIndex = Number(req.body.slotIndex);
    if (Number.isNaN(slotIndex) || slotIndex < 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid slotIndex is required'
      });
    }

    const event = await OpenEvent.findById(req.params.id);
    if (!event || event.status !== 'published') {
      return res.status(404).json({
        success: false,
        message: 'Open event not available for booking'
      });
    }

    const slotCount = event.getSlotCount();
    if (slotIndex >= slotCount) {
      return res.status(400).json({
        success: false,
        message: 'Selected slot is invalid'
      });
    }

    const userExistingBooking = await OpenEventBooking.findOne({
      eventId: event._id,
      userId: req.user._id,
      status: 'confirmed'
    });

    if (userExistingBooking) {
      return res.status(409).json({
        success: false,
        message: 'You already have a booked slot in this event'
      });
    }

    const startMinutes = parseTimeToMinutes(event.startTime);
    const slotStartMinutes = startMinutes + (slotIndex * event.slotDuration);
    const slotStartTime = formatMinutesToTime(slotStartMinutes);
    const slotStartDateTime = toIstDateTime(event.date, slotStartTime);

    if (new Date() >= slotStartDateTime) {
      return res.status(409).json({
        success: false,
        message: 'This slot is no longer available'
      });
    }

    const slotAlreadyBooked = await OpenEventBooking.findOne({
      eventId: event._id,
      slotIndex,
      status: 'confirmed'
    });

    if (slotAlreadyBooked) {
      return res.status(409).json({
        success: false,
        message: 'This slot has already been booked'
      });
    }

    const booking = await OpenEventBooking.create({
      eventId: event._id,
      slotIndex,
      userId: req.user._id,
      userFirstName: extractFirstName(req.user.name),
      status: 'confirmed'
    });

    const slotEndTime = formatMinutesToTime(slotStartMinutes + event.slotDuration);

    try {
      const settings = await AdminSettings.getSettings();
      const studioName = settings?.studioName || 'JamRoom';
      const studioAddress = settings?.studioAddress || '';
      const adminEmail = Array.isArray(settings?.adminEmails) && settings.adminEmails.length > 0
        ? settings.adminEmails[0]
        : '';

      const calendarInvite = generateCalendarInvite({
        title: `${event.title} - Open Event Slot`,
        description: event.description || 'Your Open Event slot booking is confirmed.',
        location: studioAddress || studioName,
        startDate: event.date,
        startTime: slotStartTime,
        endTime: slotEndTime,
        attendees: [req.user.email],
        studioName,
        uid: `open-event-${booking._id}@${process.env.CALENDAR_UID_DOMAIN || 'jamroom.local'}`,
        sequence: 0,
        status: 'CONFIRMED'
      });

      await sendEmail({
        to: req.user.email,
        subject: `Open Event Slot Confirmed - ${event.title}`,
        html: buildInvoiceStyleEmail({
          brandName: studioName,
          studioAddress,
          studioPhone: settings?.studioPhone || '',
          studioEmail: adminEmail,
          title: 'Open Event Booking Confirmed',
          label: 'Confirmed',
          greeting: `Hi ${req.user.name || 'there'},`,
          introLines: ['Your Open Event slot is confirmed. Please find your slot details below.'],
          summaryTitle: 'Slot Details',
          summaryRows: [
            { label: 'Event', value: event.title },
            { label: 'Date', value: event.date },
            { label: 'Slot Time', value: `${formatTime12Hour(slotStartTime)} - ${formatTime12Hour(slotEndTime)}` },
            { label: 'Slot Number', value: String(slotIndex + 1) },
            { label: 'Status', value: 'CONFIRMED' }
          ],
          ...buildBookingFooterEmailConfig(settings),
          ctaTitle: 'Calendar Invite',
          ctaHtml: '<p>A calendar invite is attached. Add it to your calendar to receive reminders.</p>',
          footerLines: ['Please arrive a few minutes early for smooth check-in.']
        }),
        attachments: [
          {
            filename: 'open-event-slot.ics',
            content: calendarInvite,
            contentType: 'text/calendar; charset=utf-8; method=REQUEST'
          }
        ]
      });
    } catch (mailError) {
      console.log('Open event booking email/invite failed:', mailError.message);
    }

    res.status(201).json({
      success: true,
      message: 'Slot booked successfully',
      booking: {
        id: booking._id,
        eventId: booking.eventId,
        slotIndex: booking.slotIndex,
        userFirstName: booking.userFirstName,
        status: booking.status
      }
    });
  } catch (error) {
    console.error('Book open event slot error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to book slot'
    });
  }
});

router.delete('/:id/book', protect, async (req, res) => {
  try {
    const event = await OpenEvent.findById(req.params.id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Open event not found'
      });
    }

    const booking = await OpenEventBooking.findOne({
      eventId: event._id,
      userId: req.user._id,
      status: 'confirmed'
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'You do not have a slot booking in this event'
      });
    }

    const startMinutes = parseTimeToMinutes(event.startTime);
    const slotStartMinutes = startMinutes + (booking.slotIndex * event.slotDuration);
    const slotStartTime = formatMinutesToTime(slotStartMinutes);
    const slotStartDateTime = toIstDateTime(event.date, slotStartTime);

    if (new Date() >= slotStartDateTime) {
      return res.status(409).json({
        success: false,
        message: 'Slot booking cannot be cancelled after slot start time'
      });
    }

    booking.status = 'cancelled';
    booking.cancelledAt = new Date();
    await booking.save();

    res.json({
      success: true,
      message: 'Slot booking cancelled successfully'
    });
  } catch (error) {
    console.error('Cancel open event slot error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel slot booking'
    });
  }
});

module.exports = router;
