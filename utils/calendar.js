const ical = require('ical-generator');

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
      attendees = []
    } = options;

    // Convert startDate to string if it's a Date object
    let dateStr = startDate;
    if (startDate instanceof Date) {
      dateStr = startDate.toISOString().split('T')[0];
    }

    // Parse date and time
    const [year, month, day] = dateStr.split('-').map(Number);
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);

    const startDateTime = new Date(year, month - 1, day, startHour, startMinute);
    const endDateTime = new Date(year, month - 1, day, endHour, endMinute);

    // Create calendar
    const calendar = ical({
      name: 'JamRoom Booking',
      prodId: '//JamRoom//Booking System//EN'
    });

    // Create event
    const event = calendar.createEvent({
      start: startDateTime,
      end: endDateTime,
      summary: title,
      description: description,
      location: location,
      url: process.env.BASE_URL,
      organizer: {
        name: 'JamRoom Studio',
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
 * @returns {string} iCal string with multiple events
 */
const generateMultipleEvents = (events) => {
  try {
    const calendar = ical({
      name: 'JamRoom Bookings',
      prodId: '//JamRoom//Booking System//EN'
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

      const [year, month, day] = startDate.split('-').map(Number);
      const [startHour, startMinute] = startTime.split(':').map(Number);
      const [endHour, endMinute] = endTime.split(':').map(Number);

      const startDateTime = new Date(year, month - 1, day, startHour, startMinute);
      const endDateTime = new Date(year, month - 1, day, endHour, endMinute);

      const event = calendar.createEvent({
        start: startDateTime,
        end: endDateTime,
        summary: title,
        description: description,
        location: location,
        url: process.env.BASE_URL,
        organizer: {
          name: 'JamRoom Studio',
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
