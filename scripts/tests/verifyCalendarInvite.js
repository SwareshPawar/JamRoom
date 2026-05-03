const assert = require('assert');
const { generateCalendarInvite, buildBookingCalendarUid } = require('../../utils/calendar');

const bookingId = '6815af4a8efaf20d11999631';
const uid = buildBookingCalendarUid(bookingId);

const invite = generateCalendarInvite({
  title: 'Swar JamRoom Booking - Test',
  description: 'Booking confirmed for Regression Test',
  location: 'Wakad, Pune',
  startDate: '2026-05-03',
  startTime: '11:00',
  endTime: '14:00',
  attendees: ['user@example.com'],
  studioName: 'Swar JamRoom',
  uid,
  sequence: 3,
  method: 'REQUEST',
  status: 'CONFIRMED'
});

assert.ok(invite.includes('BEGIN:VTIMEZONE'), 'ICS must include VTIMEZONE component');
assert.ok(invite.includes('TZID:Asia/Kolkata'), 'ICS must include Asia/Kolkata timezone block');
assert.ok(invite.includes('DTSTART;TZID=Asia/Kolkata:20260503T110000'), 'DTSTART must preserve 11:00 IST');
assert.ok(invite.includes('DTEND;TZID=Asia/Kolkata:20260503T140000'), 'DTEND must preserve 14:00 IST');
assert.ok(invite.includes(`UID:${uid}`), 'ICS must include stable booking UID');
assert.ok(invite.includes('SEQUENCE:3'), 'ICS must include supplied sequence number');
assert.ok(invite.includes('METHOD:REQUEST'), 'ICS must include request method for confirmations');
assert.ok(invite.includes('STATUS:CONFIRMED'), 'ICS must include confirmed status');

const cancellationInvite = generateCalendarInvite({
  title: 'Swar JamRoom Booking - Test',
  description: 'Booking cancelled for Regression Test',
  location: 'Wakad, Pune',
  startDate: '2026-05-03',
  startTime: '11:00',
  endTime: '14:00',
  attendees: ['user@example.com'],
  studioName: 'Swar JamRoom',
  uid,
  sequence: 4,
  method: 'CANCEL',
  status: 'CANCELLED'
});

assert.ok(cancellationInvite.includes('METHOD:CANCEL'), 'ICS must include cancel method for cancellation flows');
assert.ok(cancellationInvite.includes('STATUS:CANCELLED'), 'ICS must include cancelled status');
assert.ok(cancellationInvite.includes('SEQUENCE:4'), 'Cancellation invite must increment sequence');

let validationFailed = false;
const originalConsoleError = console.error;
console.error = () => {};
try {
  generateCalendarInvite({
    title: 'Invalid time test',
    description: 'Should fail',
    location: 'Wakad, Pune',
    startDate: '2026-05-03',
    startTime: '25:00',
    endTime: '14:00'
  });
} catch (error) {
  validationFailed = /Invalid startTime/i.test(String(error.message || ''));
} finally {
  console.error = originalConsoleError;
}

assert.ok(validationFailed, 'Invalid HH:MM input must throw a clear validation error');

console.log('Calendar invite regression checks passed.');
