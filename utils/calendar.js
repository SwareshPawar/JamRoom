const ical = require('ical-generator').default || require('ical-generator');
const { getVtimezoneComponent } = require('@touch4it/ical-timezones');

const IST_TIMEZONE = 'Asia/Kolkata';
const DEFAULT_CALENDAR_UID_DOMAIN = process.env.CALENDAR_UID_DOMAIN || 'jamroom.local';

const isValidTime24 = (value) => /^([0-1]?\d|2[0-3]):[0-5]\d$/.test(String(value || '').trim());

const assertValidTime24 = (value, label) => {
  if (!isValidTime24(value)) {
    throw new Error(`Invalid ${label}. Expected HH:MM in 24-hour format.`);
  }
};

const normalizeCalendarMethod = (methodValue) => {
  const normalized = String(methodValue || 'REQUEST').trim().toUpperCase();
  return normalized || 'REQUEST';
};

const normalizeEventStatus = (statusValue) => {
  if (!statusValue) return null;

  const normalized = String(statusValue).trim().toUpperCase();
  if (normalized === 'CANCELLED') return 'CANCELLED';
  if (normalized === 'CONFIRMED') return 'CONFIRMED';
  if (normalized === 'TENTATIVE') return 'TENTATIVE';
  return null;
};

const buildBookingCalendarUid = (bookingId) => {
  const rawId = String(bookingId || '').trim();
  if (!rawId) {
    throw new Error('Cannot build calendar UID without booking id');
  }

  return `booking-${rawId}@${DEFAULT_CALENDAR_UID_DOMAIN}`;
};

const toYmdInIst = (dateObj) => {
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(dateObj);

  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  return `${year}-${month}-${day}`;
};

const normalizeStartDateToYmd = (startDate) => {
  if (startDate instanceof Date) {
    return toYmdInIst(startDate);
  }

  const raw = String(startDate || '').trim();
  if (!raw) {
    throw new Error('Invalid startDate for calendar invite');
  }

  if (raw.includes('T')) {
    return toYmdInIst(new Date(raw));
  }

  return raw;
};

const format12Hour = (timeValue) => {
  const [hourRaw, minuteRaw] = String(timeValue || '00:00').split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`;
};

const buildCalendarDateTime = (dateStr, timeStr) => {
  assertValidTime24(timeStr, 'time');

  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);

  // Use Date.UTC so the wall-clock digits sit in the UTC position.
  // ical-generator with a VTIMEZONE generator reads the UTC numeric value
  // to emit DTSTART;TZID=Asia/Kolkata:...T<HHmmss>. Using the local
  // constructor when TZ=Asia/Kolkata would store the time as 06:30Z and
  // output T063000 instead of T120000.
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
};

/**
 * Generate iCal calendar invite
 * @param {Object} options - Calendar event options
 * @param {string} options.title - Event title
 * @param {string} options.description - Event description
 * @param {string} options.location - Event location
 * @param {string} options.startDate - Start date (YYYY-MM-DD)
 * @param {string} options.startTime - Start time (HH:MM)
 * @param {string} options.endTime - End time (HH:MM)
 * @param {Array} options.attendees - Array of attendee emails
 * @param {string} options.studioName - Studio name for organizer (optional)
 * @param {string} options.method - Calendar METHOD (REQUEST/CANCEL)
 * @param {string} options.status - Event STATUS (CONFIRMED/CANCELLED/TENTATIVE)
 * @param {string} options.uid - Stable event UID
 * @param {number} options.sequence - Event sequence number
 * @returns {string} iCal string
 */
const generateCalendarInvite = (options) => {
  try {
    const {
      title,
      description,
      location,
      startDate,
      startTime,
      endTime,
      attendees = [],
      studioName = 'Swar JamRoom & Music Studio (SwarJRS)',
      method = 'REQUEST',
      status = null,
      uid = '',
      sequence = 0
    } = options;

    assertValidTime24(startTime, 'startTime');
    assertValidTime24(endTime, 'endTime');

    const dateStr = normalizeStartDateToYmd(startDate);

    const startDateTime = buildCalendarDateTime(dateStr, startTime);
    const endDateTime = buildCalendarDateTime(dateStr, endTime);

    // Handle midnight crossover, e.g. 23:00 -> 00:00.
    if (endDateTime <= startDateTime) {
      endDateTime.setDate(endDateTime.getDate() + 1);
    }

    const descriptionWithIstTime = `${description}\nTime (IST): ${format12Hour(startTime)} - ${format12Hour(endTime)}`;

    // Create calendar
    const calendar = ical({
      name: 'JamRoom Booking',
      prodId: '//JamRoom//Booking System//EN',
      timezone: {
        name: IST_TIMEZONE,
        generator: getVtimezoneComponent
      }
    });

    if (typeof calendar.method === 'function') {
      calendar.method(normalizeCalendarMethod(method));
    }

    const normalizedStatus = normalizeEventStatus(status);

    // Create event
    const eventData = {
      start: startDateTime,
      end: endDateTime,
      summary: title,
      description: descriptionWithIstTime,
      location: location,
      url: process.env.BASE_URL,
      timezone: IST_TIMEZONE,
      organizer: {
        name: studioName,
        email: process.env.EMAIL_USER
      }
    };

    if (uid) {
      eventData.id = String(uid).trim();
    }

    if (Number.isFinite(Number(sequence))) {
      eventData.sequence = Math.max(0, Math.floor(Number(sequence)));
    }

    if (normalizedStatus) {
      eventData.status = normalizedStatus;
    }

    const event = calendar.createEvent(eventData);

    // Add attendees
    attendees.forEach(email => {
      event.createAttendee({
        email: email,
        rsvp: true,
        status: 'NEEDS-ACTION',
        role: 'REQ-PARTICIPANT'
      });
    });

    // Generate iCal string
    return calendar.toString();
  } catch (error) {
    console.error('Calendar generation error:', error);
    throw error;
  }
};

/**
 * Generate iCal for multiple events
 * @param {Array} events - Array of event options
 * @param {string} studioName - Studio name for organizer (optional)
 * @returns {string} iCal string with multiple events
 */
const generateMultipleEvents = (events, studioName = 'Swar JamRoom & Music Studio (SwarJRS)') => {
  try {
    const calendar = ical({
      name: 'JamRoom Bookings',
      prodId: '//JamRoom//Booking System//EN',
      timezone: {
        name: IST_TIMEZONE,
        generator: getVtimezoneComponent
      }
    });

    if (typeof calendar.method === 'function') {
      calendar.method('REQUEST');
    }

    events.forEach(eventOptions => {
      const {
        title,
        description,
        location,
        startDate,
        startTime,
        endTime,
        attendees = [],
        uid = '',
        sequence = 0,
        status = null
      } = eventOptions;

      assertValidTime24(startTime, 'startTime');
      assertValidTime24(endTime, 'endTime');

      const dateStr = normalizeStartDateToYmd(startDate);
      const startDateTime = buildCalendarDateTime(dateStr, startTime);
      const endDateTime = buildCalendarDateTime(dateStr, endTime);

      if (endDateTime <= startDateTime) {
        endDateTime.setDate(endDateTime.getDate() + 1);
      }

      const descriptionWithIstTime = `${description}\nTime (IST): ${format12Hour(startTime)} - ${format12Hour(endTime)}`;

      const eventData = {
        start: startDateTime,
        end: endDateTime,
        summary: title,
        description: descriptionWithIstTime,
        location: location,
        url: process.env.BASE_URL,
        timezone: IST_TIMEZONE,
        organizer: {
          name: studioName,
          email: process.env.EMAIL_USER
        }
      };

      if (uid) {
        eventData.id = String(uid).trim();
      }

      if (Number.isFinite(Number(sequence))) {
        eventData.sequence = Math.max(0, Math.floor(Number(sequence)));
      }

      const normalizedStatus = normalizeEventStatus(status);
      if (normalizedStatus) {
        eventData.status = normalizedStatus;
      }

      const event = calendar.createEvent(eventData);

      attendees.forEach(email => {
        event.createAttendee({
          email: email,
          rsvp: true,
          status: 'NEEDS-ACTION',
          role: 'REQ-PARTICIPANT'
        });
      });
    });

    return calendar.toString();
  } catch (error) {
    console.error('Multiple events calendar generation error:', error);
    throw error;
  }
};

module.exports = {
  generateCalendarInvite,
  generateMultipleEvents,
  buildBookingCalendarUid
};
