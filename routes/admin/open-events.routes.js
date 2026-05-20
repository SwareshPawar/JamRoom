const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const OpenEvent = require('../../models/OpenEvent');
const OpenEventBooking = require('../../models/OpenEventBooking');
const AdminSettings = require('../../models/AdminSettings');
const { sendEmail } = require('../../utils/email');
const { generateCalendarInvite } = require('../../utils/calendar');
const { protect } = require('../../middleware/auth');
const { isAdmin } = require('../../middleware/admin');

const IST_OFFSET = '+05:30';
const DEFAULT_STUDIO_ADDRESS = 'Zen Business Center - 202, Bhumkar Chowk Rd, above Cafe Coffee Day, Shankar Kalat Nagar, Wakad, Pune, Pimpri-Chinchwad, Maharashtra 411057';
const DIRECTIONS_LINK = 'https://www.google.com/maps?um=1&ie=UTF-8&fb=1&gl=in&sa=X&geocode=KQcHWSfEucI7MSXW6zBFUZ9O&daddr=Zen+Business+Center+-+202,+Bhumkar+Chowk+Rd,+above+Cafe+Coffee+Day,+Shankar+Kalat+Nagar,+Wakad,+Pune,+Pimpri-Chinchwad,+Maharashtra+411057';
const REVIEW_LINK = 'https://g.page/r/CSXW6zBFUZ9OEBM/review';
const BRAND_LOGO_URL = `${(process.env.BASE_URL || 'https://jam-room-mu.vercel.app').replace(/\/$/, '')}/icons/jamroom-brand-logo.png`;

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

const formatTime12Hour = (time24) => {
  const [hoursRaw, minutesRaw] = String(time24 || '').split(':');
  const hoursNum = Number(hoursRaw);
  const minutesNum = Number(minutesRaw);
  if (Number.isNaN(hoursNum) || Number.isNaN(minutesNum)) return String(time24 || '');
  const suffix = hoursNum >= 12 ? 'PM' : 'AM';
  const hour12 = hoursNum % 12 || 12;
  return `${hour12}:${String(minutesNum).padStart(2, '0')} ${suffix}`;
};

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const parseEmailBulletLines = (value) => String(value || '')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

const resolveRecipientDisplayName = (recipientName = '', recipientEmail = '') => {
  const normalizedName = String(recipientName || '').trim();
  if (normalizedName) return normalizedName;

  const emailLocalPart = String(recipientEmail || '').trim().split('@')[0] || '';
  return emailLocalPart || 'there';
};

const renderEmailBulletSection = (title, value, accentClass) => {
  const lines = parseEmailBulletLines(value);
  if (lines.length === 0) return '';

  return `
    <div class="detail-card ${accentClass}">
      <div class="detail-card-title">${escapeHtml(title)}</div>
      <ul class="detail-list">
        ${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
      </ul>
    </div>
  `;
};

const renderEmailDescriptionParagraph = (value) => {
  const lines = parseEmailBulletLines(value);
  if (lines.length === 0) return '';

  return `<p class="description-copy">${lines.map((line) => escapeHtml(line)).join('<br><br>')}</p>`;
};

const toIstDateTime = (dateValue, timeValue) => new Date(`${dateValue}T${timeValue}:00${IST_OFFSET}`);

const formatWeekdayInIst = (dateValue) => {
  const parsedDate = new Date(`${dateValue}T00:00:00${IST_OFFSET}`);
  if (Number.isNaN(parsedDate.getTime())) return '';

  return parsedDate.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long'
  });
};

const buildOpenEventCalendarInvite = ({ event, settings, recipients = [] }) => generateCalendarInvite({
  title: `Swar JRS - ${event.title}`,
  description: [
    String(event.description || '').trim(),
    String(event.notes || '').trim()
  ].filter(Boolean).join('\n\n') || 'Open Event schedule from Swar JamRoom.',
  location: settings?.studioAddress || DEFAULT_STUDIO_ADDRESS,
  startDate: event.date,
  startTime: event.startTime,
  endTime: event.endTime,
  attendees: recipients.filter(Boolean),
  studioName: settings?.studioName || 'Swar JamRoom & Music Studio (SwarJRS)',
  uid: `open-event-${event._id}@${process.env.CALENDAR_UID_DOMAIN || 'jamroom.local'}`,
  sequence: 0,
  method: 'REQUEST',
  status: 'CONFIRMED'
});

const resolveOpenEventNotificationContext = async (eventId) => {
  const event = await OpenEvent.findById(eventId);
  if (!event) return null;

  const confirmedBookings = await OpenEventBooking.find({
    eventId: event._id,
    status: 'confirmed'
  }).sort({ slotIndex: 1 });

  const startMinutes = parseTimeToMinutes(event.startTime);
  const slotCount = event.getSlotCount();
  const now = new Date();
  const bookedSlotIndexSet = new Set(confirmedBookings.map((booking) => Number(booking.slotIndex)));

  const openSlots = Array.from({ length: slotCount }, (_, index) => {
    const slotStartMinutes = startMinutes + (index * event.slotDuration);
    const slotEndMinutes = slotStartMinutes + event.slotDuration;
    const slotStartTime = formatMinutesToTime(slotStartMinutes);
    const slotEndTime = formatMinutesToTime(slotEndMinutes);
    const slotStartDateTime = toIstDateTime(event.date, slotStartTime);

    if (bookedSlotIndexSet.has(index)) return null;
    if (now >= slotStartDateTime) return null;

    return {
      index,
      startTime: slotStartTime,
      endTime: slotEndTime
    };
  }).filter(Boolean);

  return {
    event,
    confirmedBookings,
    openSlots,
    eventLink: `${process.env.BASE_URL || 'https://jam-room-mu.vercel.app'}/open-event.html?item=event:${event._id}`
  };
};

const buildOpenEventNotificationEmailHtml = ({ settings, recipientName, recipientEmail, context }) => {
  const { event, openSlots, confirmedBookings, eventLink } = context;
  const studioName = settings?.studioName || 'JamRoom';
  const studioAddress = settings?.studioAddress || DEFAULT_STUDIO_ADDRESS;
  const studioPhone = settings?.studioPhone || '';
  const studioEmail = Array.isArray(settings?.adminEmails) ? (settings.adminEmails[0] || '') : '';
  const eventDate = event.date;
  const eventWeekday = formatWeekdayInIst(event.date);
  const eventTimeLabel = `${formatTime12Hour(event.startTime)} - ${formatTime12Hour(event.endTime)}`;
  const bookedCount = confirmedBookings.length;
  const availableCount = openSlots.length;
  const startMinutes = parseTimeToMinutes(event.startTime);
  const slotPreview = openSlots.slice(0, 6);
  const extraSlotCount = Math.max(0, openSlots.length - slotPreview.length);
  const bookedPreview = confirmedBookings.slice(0, 6);
  const extraBookedCount = Math.max(0, confirmedBookings.length - bookedPreview.length);
  const quickFactsSectionHtml = renderEmailBulletSection('Quick Facts', event.quickFacts, 'facts');
  const descriptionParagraphHtml = renderEmailDescriptionParagraph(event.description);
  const notesSectionHtml = renderEmailBulletSection('Notes', event.notes, 'notes');
  const resolvedRecipientName = resolveRecipientDisplayName(recipientName, recipientEmail);

  const openSlotCardsHtml = slotPreview.length > 0
    ? slotPreview.map((slot) => `
      <span class="slot-chip open">
        Slot ${slot.index + 1}<br>${formatTime12Hour(slot.startTime)}
      </span>
    `).join('')
    : '<span style="font-size:13px;color:#475569;">No open slots right now.</span>';

  const bookedSlotCardsHtml = bookedPreview.length > 0
    ? bookedPreview.map((booking) => {
      const slotIndex = Number(booking?.slotIndex || 0);
      const computedStartMinutes = Number.isNaN(startMinutes)
        ? NaN
        : startMinutes + (slotIndex * event.slotDuration);
      const startLabel = Number.isNaN(computedStartMinutes)
        ? `Slot ${slotIndex + 1}`
        : formatTime12Hour(formatMinutesToTime(computedStartMinutes));
      return `<span class="slot-chip booked">Slot ${slotIndex + 1}<br>${startLabel}</span>`;
    }).join('')
    : '<span style="font-size:13px;color:#475569;">No slots booked yet.</span>';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no">
<meta name="x-apple-disable-message-reformatting">
<style>
  :root{color-scheme:light only}
  html{background:#060b1b;color:#ffffff}
  body{margin:0;padding:0;background:#060b1b;font-family:Arial,sans-serif;color:#ffffff;-webkit-text-size-adjust:100%}
  body,table,td,div,p,li,span,strong,a{-webkit-text-size-adjust:100%}
  a[x-apple-data-detectors],u + #body a,#MessageViewBody a{color:inherit !important;text-decoration:inherit !important;font-size:inherit !important;font-family:inherit !important;font-weight:inherit !important;line-height:inherit !important}
  .wrap{max-width:760px;margin:0 auto;padding:20px 12px}
  .card{background:linear-gradient(180deg,#071127 0%,#0b1630 100%);border-radius:24px;overflow:hidden;border:1px solid rgba(123,97,255,0.16);box-shadow:0 20px 50px rgba(0,0,0,0.35)}
  .hdr{background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);padding:22px 24px 18px;color:#fff}
  .hdr-table{width:100%;border-collapse:collapse}
  .hdr-left{vertical-align:top;padding-right:14px}
  .hdr-right{vertical-align:top;width:210px}
  .brand-table{margin-bottom:8px}
  .brand-logo{display:block;width:48px;height:48px;border-radius:12px;object-fit:contain;background:#ffffff;padding:4px;border:1px solid rgba(255,255,255,0.3)}
  .brand-name{margin:0;font-size:24px;color:#fff;font-weight:800}
  .brand-copy{font-size:12px;line-height:1.6;color:rgba(255,255,255,0.88)}
  .order-box{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:12px 14px}
  .order-kicker{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#bfdbfe;font-weight:700;margin-bottom:8px}
  .order-line{font-size:12px;line-height:1.7;color:rgba(255,255,255,0.9)}
  .body{padding:22px 22px 24px;background:radial-gradient(circle at top right, rgba(126,58,242,0.35) 0%, rgba(6,11,27,0) 38%), linear-gradient(180deg,#071127 0%,#0a1023 100%)}
  .lead{font-size:15px;line-height:1.7;color:#ffffff;margin:0 0 10px 0}
  .lead-muted{font-size:15px;line-height:1.7;color:rgba(255,255,255,0.92);margin:0 0 14px 0}
  .lead-muted strong{color:#fbbf24}
  .description-copy{margin:0 0 18px 0;padding:0 0 0 14px;border-left:3px solid #fbbf24;font-size:16px;line-height:1.85;color:#f8fafc;font-weight:500;letter-spacing:0.01em;text-shadow:0 1px 12px rgba(15,23,42,0.22)}
  .hero{border:1px solid rgba(192,38,211,0.6);border-radius:18px;padding:18px 18px 14px;background:linear-gradient(135deg,rgba(76,29,149,0.7) 0%,rgba(17,24,39,0.92) 65%);margin:0 0 16px 0}
  .hero-table{width:100%;border-collapse:collapse}
  .hero-star{font-size:54px;line-height:1;color:#fbbf24;padding-right:14px;vertical-align:top}
  .hero-title{font-size:28px;line-height:1.05;font-weight:900;text-transform:uppercase;letter-spacing:0.5px;color:#ffffff;margin:0 0 10px 0}
  .hero-title .accent{color:#fbbf24}
  .hero-text{font-size:13px;line-height:1.65;color:rgba(255,255,255,0.92);margin:0}
  .snapshot{border:1px solid rgba(96,165,250,0.26);border-radius:18px;padding:18px;background:linear-gradient(180deg,#0b1738 0%,#0a1430 100%);margin:0 0 14px 0}
  .snapshot-head{font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#c7d2fe;font-weight:800;margin:0 0 14px 0}
  .snapshot-table{width:100%;border-collapse:separate;border-spacing:12px 0}
  .snapshot-date{border:1px solid rgba(96,165,250,0.28);background:rgba(18,30,66,0.96);border-radius:16px;padding:14px 16px;vertical-align:middle;box-sizing:border-box}
  .snapshot-date-main{font-size:18px;line-height:1.35;font-weight:800;color:#ffffff;text-align:center}
  .snapshot-time-sub{font-size:15px;line-height:1.45;font-weight:700;color:#c7d2fe;text-align:center;margin-top:4px}
  .snapshot-open{border:1px solid rgba(132,204,22,0.6);background:radial-gradient(circle at center, rgba(34,197,94,0.16) 0%, rgba(7,28,24,0.92) 70%);border-radius:16px;padding:14px 16px;text-align:center;vertical-align:middle;box-sizing:border-box}
  .snapshot-open-kicker{font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#a3e635;font-weight:800;margin-bottom:4px}
  .snapshot-open-value{font-size:64px;line-height:1;font-weight:900;color:#a3e635}
  .momentum{border:1px solid rgba(229,231,235,0.14);border-radius:18px;padding:18px;background:#ffffff;margin:0 0 14px 0}
  .momentum-title{font-size:12px;letter-spacing:1.8px;text-transform:uppercase;color:#312e81;font-weight:900;margin:0 0 8px 0}
  .momentum-copy{font-size:13px;color:#475569;margin:0 0 14px 0}
  .slot-chip{display:inline-block;margin:0 8px 8px 0;padding:10px 14px;border-radius:16px;font-size:14px;font-weight:800;line-height:1.45;text-align:center;min-width:92px}
  .slot-chip.booked{border:1px solid #fca5a5;background:#fee2e2;color:#b91c1c}
  .slot-chip.open{border:1px solid #86efac;background:#dcfce7;color:#166534}
  .slot-more{font-size:12px;margin:4px 0 0 0}
  .slot-more.booked{color:#b91c1c}
  .slot-more.open{color:#166534}
  .detail-card{border-radius:18px;padding:18px;margin:0 0 14px 0;border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.96)}
  .detail-card.facts{border-color:rgba(124,58,237,0.42);background:linear-gradient(135deg,#eef2ff 0%,#f7f3ff 100%)}
  .detail-card.description{border-color:#bfdbfe;background:linear-gradient(180deg,#eff6ff 0%,#f8fbff 100%)}
  .detail-card.notes{border-color:#fed7aa;background:linear-gradient(180deg,#fff7ed 0%,#fffaf5 100%)}
  .detail-card-title{font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:900;margin:0 0 10px 0;color:#1e3a8a}
  .detail-card.facts .detail-card-title{color:#5b21b6}
  .detail-card.notes .detail-card-title{color:#9a3412}
  .detail-list{margin:0;padding-left:20px;color:#1f2937}
  .detail-list li{margin:0 0 8px 0;font-size:14px;line-height:1.65}
  .cta{border:1px solid rgba(255,255,255,0.16);border-radius:18px;padding:18px;background:#ffffff;margin:0 0 14px 0}
  .cta-table{width:100%;border-collapse:collapse}
  .cta-left{vertical-align:middle;padding-right:12px}
  .cta-right{vertical-align:middle;text-align:right}
  .cta-kicker{font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#4f46e5;font-weight:900;margin:0 0 6px 0}
  .cta-title{font-size:18px;font-weight:900;color:#312e81;margin:0 0 6px 0}
  .cta-copy{font-size:13px;line-height:1.65;color:#475569;margin:0}
  .cta-btn,.cta-btn:visited,.cta-btn:hover,.cta-btn:active{display:inline-block;padding:14px 22px;border-radius:12px;background:linear-gradient(135deg,#7c3aed 0%,#6d28d9 100%);color:#ffffff !important;text-decoration:none;font-size:15px;font-weight:900;letter-spacing:0.3px;box-shadow:0 10px 24px rgba(109,40,217,0.32)}
  .links{margin-top:12px;text-align:center}
  .link-pill{display:inline-block;margin:0 6px 6px 0;padding:8px 12px;border-radius:999px;text-decoration:none;font-size:12px;font-weight:800}
  .link-pill.directions{background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8}
  .link-pill.review{background:#fef3c7;border:1px solid #fcd34d;color:#92400e}
  .footer{padding:14px 22px 18px;border-top:1px solid rgba(255,255,255,0.08);font-size:12px;line-height:1.7;color:rgba(255,255,255,0.72)}
  @media only screen and (max-width: 620px){
    .wrap{padding:10px 6px}
    .hdr{padding:18px 16px}
    .hdr-left,.hdr-right,.cta-left,.cta-right{display:block;width:100% !important;padding:0;text-align:left !important}
    .hdr-right,.cta-right{margin-top:12px}
    .body{padding:16px}
    .hero-title{font-size:22px}
    .hero-star{font-size:42px;padding-right:10px}
    .snapshot{padding:14px}
    .snapshot-table,.snapshot-table tbody,.snapshot-table tr,.snapshot-table td{display:block;width:100%}
    .snapshot-table{border-spacing:0 !important}
    .snapshot-date,.snapshot-open{margin:0 0 10px 0;width:100% !important;max-width:100% !important;padding:12px 10px}
    .snapshot-date-main{font-size:16px;line-height:1.4;word-break:break-word}
    .snapshot-time-sub{font-size:14px;line-height:1.4}
    .snapshot-open-value{font-size:52px}
    .slot-chip{min-width:unset;width:auto}
    .cta-btn{display:block;text-align:center;margin-top:10px}
  }
  @media (prefers-color-scheme: dark){
    html,body,.wrap{background:#060b1b !important;color:#ffffff !important}
    .card{background:linear-gradient(180deg,#071127 0%,#0b1630 100%) !important;border-color:rgba(123,97,255,0.16) !important}
    .body,.hdr,.footer,.hero,.snapshot{color:#ffffff !important}
    .lead,.lead-muted,.description-copy,.hero-title,.hero-text,.snapshot-date-main,.snapshot-time-sub,.snapshot-open-kicker,.snapshot-open-value{color:#ffffff !important}
    .momentum,.detail-card,.cta{background:#ffffff !important;color:#1f2937 !important}
    .momentum-title,.detail-card-title,.cta-kicker,.cta-title{color:#312e81 !important}
    .momentum-copy,.detail-list,.detail-list li,.cta-copy{color:#475569 !important}
    .cta-btn,.cta-btn:visited,.cta-btn:hover,.cta-btn:active{color:#ffffff !important}
    .link-pill.directions{color:#1d4ed8 !important}
    .link-pill.review{color:#92400e !important}
  }
</style>
</head>
<body id="body">
  <div class="wrap">
    <div class="card">
      <div class="hdr">
        <table class="hdr-table" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td class="hdr-left">
              <table class="brand-table" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:10px;">
                    <img src="${BRAND_LOGO_URL}" alt="${studioName} Logo" width="48" height="48" class="brand-logo" />
                  </td>
                  <td style="vertical-align:middle;">
                    <h2 class="brand-name">${studioName}</h2>
                  </td>
                </tr>
              </table>
              <div class="brand-copy">${studioAddress}</div>
              ${studioPhone ? `<div class="brand-copy"><strong>Phone / WhatsApp:</strong> ${studioPhone}</div>` : ''}
              ${studioEmail ? `<div class="brand-copy"><strong>Email:</strong> ${studioEmail}</div>` : ''}
            </td>
            <td class="hdr-right">
              <div class="order-box">
                <div class="order-kicker">Open Event Invite</div>
                <div class="order-line"><strong>Status:</strong> ${String(event?.status || '').toUpperCase() || 'PUBLISHED'}</div>
                <div class="order-line"><strong>Event Link:</strong> <span style="word-break:break-all;">${eventLink}</span></div>
              </div>
            </td>
          </tr>
        </table>
      </div>
      <div class="body">
        <p class="lead"><strong>Hi ${escapeHtml(resolvedRecipientName)},</strong></p>
        <p class="lead">You're invited to ${event.title}${eventWeekday ? ` this ${eventWeekday}` : ''}.</p>
        <p class="lead-muted">Short set. <strong>Big energy.</strong> Grab your spot now.</p>

        <div class="hero">
          <table class="hero-table" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td class="hero-star">✩</td>
              <td>
                <div class="hero-title">A New Performance <span class="accent">Opportunity Awaits!</span></div>
                <p class="hero-text">Bring your instrument, sing, play, and perform in a 10-minute showcase slot.</p>
              </td>
            </tr>
          </table>
        </div>

        ${descriptionParagraphHtml}

        <div class="snapshot">
          <div class="snapshot-head">Event Snapshot</div>
          <table class="snapshot-table" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td class="snapshot-date">
                <div class="snapshot-date-main">✦ ${eventDate} ✦</div>
                <div class="snapshot-time-sub">${eventTimeLabel}</div>
              </td>
              <td class="snapshot-open">
                <div class="snapshot-open-kicker">Slots Open Now</div>
                <div class="snapshot-open-value">${availableCount}</div>
              </td>
            </tr>
          </table>
        </div>

        <div class="momentum">
          <div class="momentum-title">Current Slot Momentum</div>
          <p class="momentum-copy">Booked slots in red, available slots in green.</p>
          <div>
            ${bookedSlotCardsHtml}
            ${extraBookedCount > 0 ? `<p class="slot-more booked">+ ${extraBookedCount} more booked</p>` : ''}
          </div>
          <div style="margin-top:8px;">
            ${openSlotCardsHtml}
            ${extraSlotCount > 0 ? `<p class="slot-more open">+ ${extraSlotCount} more slots available</p>` : ''}
          </div>
        </div>

        <div class="cta">
          <table class="cta-table" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td class="cta-left">
                <div class="cta-kicker">Join The Event</div>
                <div class="cta-title">Reserve quickly.</div>
                <p class="cta-copy">Slots are first-come, first-served.</p>
              </td>
              <td class="cta-right">
                <a href="${eventLink}" target="_blank" rel="noopener noreferrer" class="cta-btn">Reserve My Slot</a>
              </td>
            </tr>
          </table>
          <div class="links">
            <a href="${DIRECTIONS_LINK}" target="_blank" rel="noopener noreferrer" class="link-pill directions">Get Directions</a>
            <a href="${REVIEW_LINK}" target="_blank" rel="noopener noreferrer" class="link-pill review">Review on Google</a>
          </div>
        </div>

        ${quickFactsSectionHtml}
        ${notesSectionHtml}
      </div>
      <div class="footer">
        <div>A calendar invite is attached to this email.</div>
        <div>See you on stage at JamRoom.</div>
      </div>
    </div>
  </div>
</body>
</html>`;
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
  slotDuration: event.slotDuration,
  slotCount: event.getSlotCount(),
  status: event.status,
  bookingCount,
  createdAt: event.createdAt,
  updatedAt: event.updatedAt
});

router.post('/open-events', protect, isAdmin, async (req, res) => {
  try {
    const { title, quickFacts = '', description = '', notes = '', date, startTime, endTime, status = 'draft' } = req.body;

    if (!title || !date || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'title, date, startTime, and endTime are required'
      });
    }

    const startMinutes = parseTimeToMinutes(startTime);
    const endMinutes = parseTimeToMinutes(endTime);

    if (Number.isNaN(startMinutes) || Number.isNaN(endMinutes) || endMinutes <= startMinutes) {
      return res.status(400).json({
        success: false,
        message: 'endTime must be later than startTime'
      });
    }

    const event = await OpenEvent.create({
      title: String(title).trim(),
      quickFacts: String(quickFacts || '').trim(),
      description: String(description || '').trim(),
      notes: String(notes || '').trim(),
      date,
      startTime,
      endTime,
      status: ['draft', 'published', 'cancelled'].includes(status) ? status : 'draft',
      createdBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: 'Open event created successfully',
      event: eventSummary(event)
    });
  } catch (error) {
    console.error('Create open event error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create open event'
    });
  }
});

router.get('/open-events', protect, isAdmin, async (_req, res) => {
  try {
    const events = await OpenEvent.find().sort({ date: -1, startTime: -1 });

    const eventIds = events.map((event) => event._id);
    const counts = await OpenEventBooking.aggregate([
      { $match: { eventId: { $in: eventIds }, status: 'confirmed' } },
      { $group: { _id: '$eventId', bookingCount: { $sum: 1 } } }
    ]);

    const bookingCountMap = new Map();
    counts.forEach((item) => {
      bookingCountMap.set(String(item._id), item.bookingCount);
    });

    res.json({
      success: true,
      count: events.length,
      events: events.map((event) => eventSummary(event, bookingCountMap.get(String(event._id)) || 0))
    });
  } catch (error) {
    console.error('Admin list open events error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch open events'
    });
  }
});

router.patch('/open-events/:id', protect, isAdmin, async (req, res) => {
  try {
    const allowedFields = ['title', 'quickFacts', 'description', 'notes', 'date', 'startTime', 'endTime', 'status'];
    const updates = {};

    allowedFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updates[field] = req.body[field];
      }
    });

    if (Object.prototype.hasOwnProperty.call(updates, 'startTime') || Object.prototype.hasOwnProperty.call(updates, 'endTime')) {
      const current = await OpenEvent.findById(req.params.id);
      if (!current) {
        return res.status(404).json({
          success: false,
          message: 'Open event not found'
        });
      }

      const startTime = updates.startTime || current.startTime;
      const endTime = updates.endTime || current.endTime;
      const startMinutes = parseTimeToMinutes(startTime);
      const endMinutes = parseTimeToMinutes(endTime);
      if (Number.isNaN(startMinutes) || Number.isNaN(endMinutes) || endMinutes <= startMinutes) {
        return res.status(400).json({
          success: false,
          message: 'endTime must be later than startTime'
        });
      }
    }

    const event = await OpenEvent.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Open event not found'
      });
    }

    res.json({
      success: true,
      message: 'Open event updated successfully',
      event: eventSummary(event)
    });
  } catch (error) {
    console.error('Admin update open event error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update open event'
    });
  }
});

router.patch('/open-events/:id/status', protect, isAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['draft', 'published', 'cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }

    // Product behavior: "cancel" means move event back to draft.
    // Keep this endpoint status-only and side-effect free (no email send here).
    const normalizedStatus = status === 'cancelled' ? 'draft' : status;

    const updates = {
      status: normalizedStatus,
      cancelledAt: null
    };

    const event = await OpenEvent.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Open event not found'
      });
    }

    res.json({
      success: true,
      message: normalizedStatus === 'draft'
        ? 'Open event moved to draft successfully'
        : 'Open event status updated successfully',
      event: eventSummary(event)
    });
  } catch (error) {
    console.error('Admin update open event status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update open event status'
    });
  }
});

router.get('/open-events/:id/bookings', protect, isAdmin, async (req, res) => {
  try {
    const event = await OpenEvent.findById(req.params.id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Open event not found'
      });
    }

    const bookings = await OpenEventBooking.find({
      eventId: event._id,
      status: 'confirmed'
    }).populate('userId', 'name email mobile').sort({ slotIndex: 1, createdAt: 1 });

    const startMinutes = parseTimeToMinutes(event.startTime);
    const slotCount = event.getSlotCount();

    // Build a map of booked slot indices for quick lookup
    const bookedBySlot = new Map(
      bookings.map((b) => [Number(b.slotIndex), b])
    );

    // Build full slot list (all slots, both booked and free)
    const slots = Array.from({ length: slotCount }, (_, index) => {
      const slotStartTime = formatMinutesToTime(startMinutes + (index * event.slotDuration));
      const slotEndTime = formatMinutesToTime(startMinutes + ((index + 1) * event.slotDuration));
      const booking = bookedBySlot.get(index);
      if (booking) {
        return {
          slotIndex: index,
          slotStartTime,
          slotEndTime,
          booked: true,
          id: booking._id,
          userId: booking.userId,
          userFirstName: booking.userFirstName,
          userFullName: String(booking.userId?.name || '').trim(),
          userName: String(booking.userId?.name || booking.userFirstName || '').trim(),
          userEmail: String(booking.userId?.email || '').trim(),
          userPhone: String(booking.userId?.mobile || '').trim(),
          createdAt: booking.createdAt
        };
      }
      return {
        slotIndex: index,
        slotStartTime,
        slotEndTime,
        booked: false
      };
    });

    res.json({
      success: true,
      event: eventSummary(event, bookings.length),
      count: bookings.length,
      slotCount,
      slots,
      // Legacy bookings array for backward compat
      bookings: bookings.map((booking) => ({
        id: booking._id,
        slotIndex: booking.slotIndex,
        slotStartTime: formatMinutesToTime(startMinutes + (booking.slotIndex * event.slotDuration)),
        slotEndTime: formatMinutesToTime(startMinutes + ((booking.slotIndex + 1) * event.slotDuration)),
        userId: booking.userId,
        userFirstName: booking.userFirstName,
        userFullName: String(booking.userId?.name || '').trim(),
        userName: String(booking.userId?.name || booking.userFirstName || '').trim(),
        userEmail: String(booking.userId?.email || '').trim(),
        userPhone: String(booking.userId?.mobile || '').trim(),
        createdAt: booking.createdAt
      }))
    });
  } catch (error) {
    console.error('Admin get open event bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch open event bookings'
    });
  }
});

router.post('/open-events/:id/notify-users', protect, isAdmin, async (req, res) => {
  try {
    const context = await resolveOpenEventNotificationContext(req.params.id);
    if (!context) {
      return res.status(404).json({ success: false, message: 'Open event not found' });
    }

    const settings = await AdminSettings.getSettings();
    const users = await User.find({ email: { $exists: true, $ne: '' } }).select('name email');
    const recipients = users
      .map((user) => ({
        name: String(user?.name || '').trim(),
        email: String(user?.email || '').trim()
      }))
      .filter((user) => user.email);

    if (recipients.length === 0) {
      return res.status(400).json({ success: false, message: 'No users with email found for notification' });
    }

    const calendarInvite = buildOpenEventCalendarInvite({
      event: context.event,
      settings,
      recipients: recipients.map((recipient) => recipient.email)
    });

    const results = await Promise.allSettled(
      recipients.map((recipient) => sendEmail({
        to: recipient.email,
        subject: `Open Event: ${context.event.title} (${context.event.date})`,
        html: buildOpenEventNotificationEmailHtml({
          settings,
          recipientName: recipient.name,
          recipientEmail: recipient.email,
          context
        }),
        attachments: [{
          filename: 'open-event.ics',
          content: calendarInvite,
          contentType: 'text/calendar; charset=utf-8; method=REQUEST'
        }]
      }))
    );

    const sent = results.filter((item) => item.status === 'fulfilled').length;
    const failed = results.length - sent;

    res.json({
      success: true,
      message: `Notification sent to ${sent} user(s)${failed > 0 ? `, ${failed} failed` : ''}`,
      sent,
      failed,
      total: results.length
    });
  } catch (error) {
    console.error('Admin notify open event users error:', error);
    res.status(500).json({ success: false, message: 'Failed to send open event notifications' });
  }
});

router.post('/open-events/:id/test-email', protect, isAdmin, async (req, res) => {
  try {
    const context = await resolveOpenEventNotificationContext(req.params.id);
    if (!context) {
      return res.status(404).json({ success: false, message: 'Open event not found' });
    }

    const settings = await AdminSettings.getSettings();
    const testRecipients = new Set();
    const reqUserEmail = String(req.user?.email || '').trim();
    if (reqUserEmail) testRecipients.add(reqUserEmail);

    (Array.isArray(settings?.adminEmails) ? settings.adminEmails : []).forEach((email) => {
      const normalized = String(email || '').trim();
      if (normalized) testRecipients.add(normalized);
    });

    const recipientEmails = Array.from(testRecipients);
    if (recipientEmails.length === 0) {
      return res.status(400).json({ success: false, message: 'No admin email found for test notification' });
    }

    const normalizedRecipientEmails = recipientEmails
      .map((email) => String(email || '').trim().toLowerCase())
      .filter(Boolean);

    const matchingUsers = await User.find({
      email: { $in: normalizedRecipientEmails }
    }).select('name email');

    const nameByEmail = new Map(
      matchingUsers.map((user) => [
        String(user?.email || '').trim().toLowerCase(),
        String(user?.name || '').trim()
      ])
    );

    if (reqUserEmail && req.user?.name) {
      nameByEmail.set(reqUserEmail.toLowerCase(), String(req.user.name).trim());
    }

    const recipients = recipientEmails.map((email) => {
      const normalizedEmail = String(email || '').trim().toLowerCase();
      return {
        email,
        name: nameByEmail.get(normalizedEmail) || ''
      };
    });

    const calendarInvite = buildOpenEventCalendarInvite({
      event: context.event,
      settings,
      recipients: recipients.map((recipient) => recipient.email)
    });

    await Promise.all(
      recipients.map((recipient) => sendEmail({
        to: recipient.email,
        subject: `[TEST] Open Event: ${context.event.title} (${context.event.date})`,
        html: buildOpenEventNotificationEmailHtml({
          settings,
          recipientName: recipient.name,
          recipientEmail: recipient.email,
          context
        }),
        attachments: [{
          filename: 'open-event.ics',
          content: calendarInvite,
          contentType: 'text/calendar; charset=utf-8; method=REQUEST'
        }]
      }))
    );

    res.json({
      success: true,
      message: `Test email sent to ${recipients.length} admin recipient(s)`,
      recipients: recipients.map((recipient) => recipient.email)
    });
  } catch (error) {
    console.error('Admin test open event email error:', error);
    res.status(500).json({ success: false, message: 'Failed to send test email' });
  }
});

// DELETE open event
router.delete('/open-events/:id', protect, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const event = await OpenEvent.findByIdAndDelete(id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Open event not found' });
    }
    
    // Also delete associated bookings
    await OpenEventBooking.deleteMany({ event: id });
    
    res.json({
      success: true,
      message: 'Open event deleted successfully',
      event
    });
  } catch (error) {
    console.error('Delete open event error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete open event' });
  }
});

// Free (cancel) a specific booking slot — admin only
router.delete('/open-events/:id/bookings/:bookingId', protect, isAdmin, async (req, res) => {
  try {
    const { id: eventId, bookingId } = req.params;

    const event = await OpenEvent.findById(eventId);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Open event not found' });
    }

    const booking = await OpenEventBooking.findOne({ _id: bookingId, eventId: event._id });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found for this event' });
    }

    booking.status = 'cancelled';
    booking.cancelledAt = new Date();
    await booking.save();

    res.json({ success: true, message: 'Slot freed successfully' });
  } catch (error) {
    console.error('Admin free open event slot error:', error);
    res.status(500).json({ success: false, message: 'Failed to free slot' });
  }
});

// Admin book a slot for a registered user
router.post('/open-events/:id/bookings', protect, isAdmin, async (req, res) => {
  try {
    const { id: eventId } = req.params;
    const { userId, slotIndex } = req.body;

    if (userId === undefined || slotIndex === undefined) {
      return res.status(400).json({ success: false, message: 'userId and slotIndex are required' });
    }

    const event = await OpenEvent.findById(eventId);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Open event not found' });
    }

    const slotCount = event.getSlotCount();
    const parsedSlotIndex = Number(slotIndex);
    if (Number.isNaN(parsedSlotIndex) || parsedSlotIndex < 0 || parsedSlotIndex >= slotCount) {
      return res.status(400).json({ success: false, message: 'Invalid slot index' });
    }

    const user = await User.findById(userId).select('name email mobile');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Check if slot is already taken
    const existingBooking = await OpenEventBooking.findOne({
      eventId: event._id,
      slotIndex: parsedSlotIndex,
      status: 'confirmed'
    });
    if (existingBooking) {
      return res.status(409).json({ success: false, message: 'This slot is already booked' });
    }

    // Check if user already has a slot in this event
    const userExistingBooking = await OpenEventBooking.findOne({
      eventId: event._id,
      userId,
      status: 'confirmed'
    });
    if (userExistingBooking) {
      return res.status(409).json({ success: false, message: 'This user already has a slot booked in this event' });
    }

    const firstName = String(user.name || '').trim().split(/\s+/)[0] || 'Guest';
    const booking = await OpenEventBooking.create({
      eventId: event._id,
      slotIndex: parsedSlotIndex,
      userId,
      userFirstName: firstName,
      status: 'confirmed'
    });

    res.status(201).json({
      success: true,
      message: 'Slot booked successfully',
      booking: {
        id: booking._id,
        slotIndex: booking.slotIndex,
        userId: booking.userId,
        userFullName: user.name,
        userEmail: user.email
      }
    });
  } catch (error) {
    console.error('Admin book open event slot error:', error);
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Slot or user conflict — booking already exists' });
    }
    res.status(500).json({ success: false, message: 'Failed to book slot' });
  }
});

module.exports = router;
