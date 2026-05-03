const ical = require('ical-generator').default || require('ical-generator');

const IST_TIMEZONE = 'Asia/Kolkata';

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
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);

  // Important: use date components (not UTC-offset math) so generated ICS
  // wall-clock times stay identical across runtime TZs (local, Vercel UTC, etc.).
  return new Date(year, month - 1, day, hour, minute, 0, 0);
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
      studioName = 'Swar JamRoom & Music Studio (SwarJRS)'
    } = options;

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
      timezone: IST_TIMEZONE
    });

    // Create event
    const event = calendar.createEvent({
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
    });

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
      timezone: IST_TIMEZONE
    });

    events.forEach(eventOptions => {
      const {
        title,
        description,
        location,
        startDate,
        startTime,
        endTime,
        attendees = []
      } = eventOptions;

      const dateStr = normalizeStartDateToYmd(startDate);
      const startDateTime = buildCalendarDateTime(dateStr, startTime);
      const endDateTime = buildCalendarDateTime(dateStr, endTime);

      if (endDateTime <= startDateTime) {
        endDateTime.setDate(endDateTime.getDate() + 1);
      }

      const descriptionWithIstTime = `${description}\nTime (IST): ${format12Hour(startTime)} - ${format12Hour(endTime)}`;

      const event = calendar.createEvent({
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
      });

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
  generateMultipleEvents
};
