/**
 * Shared admin helper utilities.
 * Extracted from routes/admin.routes.js to satisfy SRP (S-1 / S-3 / S-4 / S-5).
 * All pure helpers, constants, and cross-cutting admin logic live here.
 */

const User = require('../models/User');
const { sendEmail } = require('./email');

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_ADMIN_CREATED_USER_PASSWORD = 'Qwerty123';
const DEFAULT_APP_LOGIN_URL = 'https://jam-room-mu.vercel.app/';
const ADMIN_DELETE_OWNER_EMAIL = 'swareshpawar@gmail.com';
const ALWAYS_NOTIFY_BOOKING_CONFIRM_EMAILS = [
  'priyankasoren69075@gmail.com',
  'vinitapawar2912@gmail.com',
  'swareshpawar@gmail.com'
];
const IST_TIMEZONE = 'Asia/Kolkata';

// ─── Time Formatting ──────────────────────────────────────────────────────────

const formatTime12Hour = (time24) => {
  if (!time24) return time24;

  const timeStr = String(time24).trim();
  if (/\b(AM|PM)\b/i.test(timeStr)) {
    return timeStr.toUpperCase();
  }

  const timeParts = timeStr.split(':');
  if (timeParts.length < 2) {
    return timeStr;
  }

  let hours = parseInt(timeParts[0], 10);
  const minutes = String(parseInt(timeParts[1], 10) || 0).padStart(2, '0');

  if (Number.isNaN(hours)) {
    return timeStr;
  }

  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;

  return `${hours}:${minutes} ${ampm}`;
};

const formatTimeRange12Hour = (startTime, endTime) => {
  return `${formatTime12Hour(startTime)} - ${formatTime12Hour(endTime)}`;
};

// ─── Date Utilities ───────────────────────────────────────────────────────────

const parseDateInputToStartOfDay = (value) => {
  if (!value) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  let year;
  let month;
  let day;

  const ymdMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymdMatch) {
    year = Number(ymdMatch[1]);
    month = Number(ymdMatch[2]);
    day = Number(ymdMatch[3]);
  } else {
    const dmyMatch = raw.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
    if (dmyMatch) {
      day = Number(dmyMatch[1]);
      month = Number(dmyMatch[2]);
      year = Number(dmyMatch[3]);
    }
  }

  if (!year || !month || !day) {
    const fallback = new Date(raw);
    if (Number.isNaN(fallback.getTime())) {
      return null;
    }

    fallback.setHours(0, 0, 0, 0);
    return fallback;
  }

  const parsed = new Date(year, month - 1, day);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

const formatDateAsYmd = (dateValue) => {
  if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) {
    return '';
  }

  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, '0');
  const day = String(dateValue.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateAsYmdInIst = (dateValue) => {
  if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) {
    return '';
  }

  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(dateValue);

  const getPart = (type) => parts.find((part) => part.type === type)?.value || '';
  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');
  return `${year}-${month}-${day}`;
};

const formatBookingDisplayDate = (date) => {
  const bookingDate = new Date(date);
  return bookingDate.toLocaleDateString('en-IN', {
    timeZone: IST_TIMEZONE,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

// ─── MongoDB Query Filters ────────────────────────────────────────────────────

const buildHourlySlotModeFilter = () => ({
  $and: [
    {
      $or: [
        { bookingMode: 'hourly' },
        { bookingMode: { $exists: false } },
        { bookingMode: null }
      ]
    },
    { rentals: { $not: { $elemMatch: { rentalType: 'perday' } } } },
    {
      $or: [
        { perDayStartDate: { $exists: false } },
        { perDayStartDate: null }
      ]
    },
    {
      $or: [
        { perDayEndDate: { $exists: false } },
        { perDayEndDate: null }
      ]
    }
  ]
});

// ─── String / Email Utilities ─────────────────────────────────────────────────

const escapeRegExp = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeEmail = (email) => {
  return String(email || '').trim().toLowerCase();
};

const isValidEmail = (email) => {
  const normalized = normalizeEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
};

const parseOptionalEmailList = (value) => {
  if (Array.isArray(value)) {
    return value.map(normalizeEmail).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/[\s,;]+/)
      .map(normalizeEmail)
      .filter(Boolean);
  }

  return [];
};

// ─── Mobile Utilities ─────────────────────────────────────────────────────────

const normalizeMobileLast10 = (mobile) => {
  const digits = String(mobile || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
};

const normalizeIndianMobile = (mobile) => {
  const rawValue = String(mobile || '').trim();
  if (!rawValue) return '';

  const digits = rawValue.replace(/\D/g, '');
  if (!digits) return '';

  if (digits.length === 10) {
    return digits;
  }

  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }

  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }

  if (digits.length > 10) {
    return digits.slice(-10);
  }

  return digits;
};

const isValidIndianMobile = (mobile) => /^[6-9]\d{9}$/.test(String(mobile || ''));

// ─── Booking Label Helpers ────────────────────────────────────────────────────

const deriveDynamicBookingLabel = (rentals = [], explicitLabel = '') => {
  const normalizedExplicitLabel = String(explicitLabel || '').trim();
  if (normalizedExplicitLabel) {
    return normalizedExplicitLabel;
  }

  const normalizedRentals = Array.isArray(rentals) ? rentals.filter(Boolean) : [];
  if (normalizedRentals.length === 0) {
    return '';
  }

  const categories = [];
  const itemNames = [];

  normalizedRentals.forEach((rental) => {
    const categoryName = String(rental?.category || '').trim();
    const itemName = String(rental?.name || '').trim();
    const isBaseItem = /\(base\)/i.test(itemName) || String(rental?.fullId || '').includes('_base');

    if (categoryName && !categories.includes(categoryName)) {
      categories.push(categoryName);
    }

    if (!isBaseItem && itemName && !itemNames.includes(itemName)) {
      itemNames.push(itemName);
    }
  });

  if (itemNames.length === 1) {
    return itemNames[0];
  }

  if (categories.length === 1) {
    return categories[0];
  }

  return itemNames[0] || categories[0] || String(normalizedRentals[0]?.name || '');
};

// ─── Price / Payment Helpers ──────────────────────────────────────────────────

const derivePriceAdjustmentTypeFromValue = (value) => {
  const numericValue = Number(value || 0);
  if (!Number.isFinite(numericValue) || numericValue === 0) {
    return 'none';
  }

  return numericValue < 0 ? 'discount' : 'surcharge';
};

const normalizePriceAdjustmentInput = (
  {
    rawType,
    rawAmount,
    rawNote
  },
  {
    fallbackType = 'none',
    fallbackAmount = 0,
    fallbackNote = ''
  } = {}
) => {
  const allowedTypes = new Set(['none', 'discount', 'surcharge']);

  const requestedType = String(
    rawType === undefined || rawType === null || rawType === ''
      ? fallbackType
      : rawType
  ).trim().toLowerCase();
  const type = allowedTypes.has(requestedType) ? requestedType : 'none';

  const amountSource = rawAmount === undefined || rawAmount === null || rawAmount === ''
    ? fallbackAmount
    : rawAmount;
  const parsedAmount = Number(amountSource);

  if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
    return {
      error: 'Adjustment amount must be a non-negative number'
    };
  }

  const amount = type === 'none' ? 0 : parsedAmount;
  const signedValue =
    type === 'discount'
      ? -amount
      : type === 'surcharge'
        ? amount
        : 0;

  const noteSource = rawNote === undefined || rawNote === null
    ? fallbackNote
    : rawNote;
  const note = String(noteSource || '').trim();

  return {
    type,
    amount,
    value: signedValue,
    note
  };
};

const normalizePaymentStatusInput = (value, fallback = 'PENDING') => {
  const allowedStatuses = new Set(['PENDING', 'PARTIAL', 'PAID', 'REFUNDED']);
  const requestedStatus = String(value || fallback || 'PENDING').trim().toUpperCase();
  return allowedStatuses.has(requestedStatus) ? requestedStatus : 'PENDING';
};

const computeCollectedAmount = ({ totalAmount, paymentStatus, amountPaid }) => {
  const safeTotalAmount = Math.max(0, Number(totalAmount) || 0);
  const safeStatus = normalizePaymentStatusInput(paymentStatus);
  const safeAmountPaid = Math.max(0, Number(amountPaid) || 0);

  if (safeStatus === 'PAID') {
    return safeTotalAmount;
  }

  if (safeStatus === 'PARTIAL') {
    return Math.min(safeTotalAmount, safeAmountPaid);
  }

  return 0;
};

const normalizePaymentTracking = ({
  paymentStatusRaw,
  amountPaidRaw,
  totalAmount,
  fallbackStatus = 'PENDING',
  fallbackAmountPaid = 0
}) => {
  const safeTotalAmount = Number(totalAmount);

  if (!Number.isFinite(safeTotalAmount) || safeTotalAmount < 0) {
    return {
      error: 'Total amount must be a non-negative number'
    };
  }

  const paymentStatus = normalizePaymentStatusInput(paymentStatusRaw, fallbackStatus);
  const amountSource = amountPaidRaw === undefined || amountPaidRaw === null || amountPaidRaw === ''
    ? fallbackAmountPaid
    : amountPaidRaw;
  const parsedAmount = Number(amountSource);

  if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
    return {
      error: 'Paid amount must be a non-negative number'
    };
  }

  if (paymentStatus === 'PAID') {
    return {
      paymentStatus: 'PAID',
      amountPaid: safeTotalAmount,
      collectedAmount: safeTotalAmount,
      dueAmount: 0
    };
  }

  if (paymentStatus === 'PENDING' || paymentStatus === 'REFUNDED') {
    return {
      paymentStatus,
      amountPaid: 0,
      collectedAmount: 0,
      dueAmount: safeTotalAmount
    };
  }

  if (parsedAmount <= 0) {
    return {
      error: 'Paid amount must be greater than 0 when payment status is PARTIAL'
    };
  }

  if (parsedAmount >= safeTotalAmount) {
    return {
      paymentStatus: 'PAID',
      amountPaid: safeTotalAmount,
      collectedAmount: safeTotalAmount,
      dueAmount: 0
    };
  }

  return {
    paymentStatus: 'PARTIAL',
    amountPaid: parsedAmount,
    collectedAmount: parsedAmount,
    dueAmount: Math.max(0, safeTotalAmount - parsedAmount)
  };
};

// ─── Notification Helpers ─────────────────────────────────────────────────────

const resolveAdminNotificationEmails = async (settings = null) => {
  const recipients = new Set();

  // Always include key recipients for booking confirmations.
  ALWAYS_NOTIFY_BOOKING_CONFIRM_EMAILS.forEach((email) => {
    const normalized = normalizeEmail(email);
    if (normalized) recipients.add(normalized);
  });

  // Admin recipients from settings.
  (settings?.adminEmails || []).forEach((email) => {
    const normalized = normalizeEmail(email);
    if (normalized) recipients.add(normalized);
  });

  // Admin recipients from user accounts (covers newly granted admins).
  const adminUsers = await User.find({ role: 'admin' }).select('email');
  adminUsers.forEach((adminUser) => {
    const normalized = normalizeEmail(adminUser.email);
    if (normalized) recipients.add(normalized);
  });

  // Include engineer/staff contacts configured in WhatsApp settings by resolving
  // their mobile numbers to registered user accounts with emails.
  const whatsappSettings = settings?.whatsappNotifications || {};
  const roleContactLast10Numbers = new Set();

  if (whatsappSettings.businessNotifications?.bookingConfirmations && whatsappSettings.businessNumber) {
    const normalizedBusinessMobile = normalizeMobileLast10(whatsappSettings.businessNumber);
    if (normalizedBusinessMobile) {
      roleContactLast10Numbers.add(normalizedBusinessMobile);
    }
  }

  if (Array.isArray(whatsappSettings.notificationNumbers)) {
    whatsappSettings.notificationNumbers.forEach((contact) => {
      if (contact?.notifications?.bookingConfirmations && contact?.number) {
        const normalizedMobile = normalizeMobileLast10(contact.number);
        if (normalizedMobile) {
          roleContactLast10Numbers.add(normalizedMobile);
        }
      }
    });
  }

  if (roleContactLast10Numbers.size > 0) {
    const usersWithMobile = await User.find({
      mobile: { $exists: true, $ne: null }
    }).select('email mobile');

    usersWithMobile.forEach((user) => {
      const userMobileLast10 = normalizeMobileLast10(user.mobile);
      if (userMobileLast10 && roleContactLast10Numbers.has(userMobileLast10)) {
        const normalized = normalizeEmail(user.email);
        if (normalized) recipients.add(normalized);
      }
    });
  }

  // Owner fallback so owner always receives confirmed-booking email alerts.
  const ownerEmail = normalizeEmail(ADMIN_DELETE_OWNER_EMAIL);
  if (ownerEmail) {
    recipients.add(ownerEmail);
  }

  return Array.from(recipients);
};

const sendUnifiedBookingConfirmationEmails = async ({
  settings,
  booking,
  confirmedByName,
  calendarInvite,
  customerExtraHtml = ''
}) => {
  const displayDate = formatBookingDisplayDate(booking.date);
  const studioName = settings.studioName || 'Swar JamRoom';
  const studioLabel = settings.studioName || 'Swar JamRoom Studio';
  const collectedAmount = computeCollectedAmount({
    totalAmount: booking.price,
    paymentStatus: booking.paymentStatus,
    amountPaid: booking.amountPaid
  });
  const dueAmount = Math.max(0, Number(booking.price || 0) - collectedAmount);

  const paymentMessageByStatus = (() => {
    if (booking.paymentStatus === 'PAID') {
      return `
        <p style="margin-top: 10px; color: #14532d;">
          We are pleased to confirm that your payment has been fully received. Thank you for your prompt settlement.
        </p>
      `;
    }

    if (booking.paymentStatus === 'PARTIAL') {
      return `
        <p style="margin-top: 10px; color: #7c2d12;">
          We have recorded a partial payment of <strong>₹${collectedAmount.toFixed(2)}</strong>. The outstanding balance is
          <strong>₹${dueAmount.toFixed(2)}</strong>. We kindly request you to complete the balance before your session.
        </p>
      `;
    }

    return `
      <p style="margin-top: 10px; color: #7c2d12;">
        Your booking is confirmed. As payment is currently pending, we kindly request you to complete the JamRoom payment
        of <strong>₹${Number(booking.price || 0).toFixed(2)}</strong> before the scheduled slot.
      </p>
    `;
  })();

  // Send confirmation email to customer.
  try {
    await sendEmail({
      to: booking.userEmail,
      subject: `Booking Confirmed - ${studioName}`,
      html: `
        <h2>🎉 Booking Confirmed</h2>
        <p>Hi ${booking.userName},</p>
        <p>Your booking request has been successfully confirmed by our team.</p>
        <h3>Booking Details:</h3>
        <ul>
          <li><strong>Date:</strong> ${displayDate}</li>
          <li><strong>Time:</strong> ${formatTimeRange12Hour(booking.startTime, booking.endTime)}</li>
          <li><strong>Duration:</strong> ${booking.duration} hour(s)</li>
          <li><strong>Rental Type:</strong> ${booking.rentalType}</li>
          <li><strong>Price:</strong> ₹${booking.price}</li>
          <li><strong>Payment Status:</strong> ${booking.paymentStatus || 'PENDING'}</li>
          <li><strong>Amount Received:</strong> ₹${collectedAmount.toFixed(2)}</li>
          <li><strong>Outstanding:</strong> ₹${dueAmount.toFixed(2)}</li>
          ${booking.bandName ? `<li><strong>Band Name:</strong> ${booking.bandName}</li>` : ''}
        </ul>
        <p>A calendar invite is attached to this email.</p>
        ${paymentMessageByStatus}
        <p>Looking forward to seeing you at ${studioLabel}!</p>
        <div style="background:#fff5f5;border:1px solid #fca5a5;border-left:4px solid #dc2626;border-radius:8px;padding:12px 16px;margin:16px 0;">
          <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#dc2626;font-weight:800;margin-bottom:8px;">⚠ Booking Terms</div>
          <ul style="margin:0;padding-left:18px;color:#7f1d1d;font-size:13px;line-height:1.7;">
            <li style="margin-bottom:5px;">50% advance payment is required to confirm and block your booking slot.</li>
            <li style="margin-bottom:5px;">Cancellation within 24 hours of the scheduled session is non-refundable.</li>
            <li>All production work includes up to 2 rounds of revisions, provided the revision request is submitted within 25 days of the initial delivery date. Requests received after this period may be subject to additional charges.</li>
          </ul>
        </div>
        ${customerExtraHtml}
      `,
      attachments: [{
        filename: 'booking.ics',
        content: calendarInvite,
        contentType: 'text/calendar; charset=utf-8; method=REQUEST'
      }]
    });
  } catch (emailError) {
    console.log('Customer confirmation email failed:', emailError.message);
  }

  // Send notification to all admins/staff recipients.
  try {
    const adminNotificationEmails = await resolveAdminNotificationEmails(settings);

    for (const adminEmail of adminNotificationEmails) {
      if (normalizeEmail(adminEmail) === normalizeEmail(booking.userEmail)) {
        continue;
      }

      try {
        await sendEmail({
          to: adminEmail,
          subject: `Booking Approved - ${studioLabel}`,
          html: `
            <h2>Booking Approved</h2>
            <p>A booking has been approved by ${confirmedByName}.</p>
            <h3>Booking Details:</h3>
            <ul>
              <li><strong>User:</strong> ${booking.userName} (${booking.userEmail})</li>
              ${booking.userMobile ? `<li><strong>Mobile:</strong> ${booking.userMobile}</li>` : ''}
              <li><strong>Date:</strong> ${displayDate}</li>
              <li><strong>Time:</strong> ${formatTimeRange12Hour(booking.startTime, booking.endTime)}</li>
              <li><strong>Duration:</strong> ${booking.duration} hour(s)</li>
              <li><strong>Rental Type:</strong> ${booking.rentalType}</li>
              <li><strong>Price:</strong> ₹${booking.price}</li>
              ${booking.bandName ? `<li><strong>Band Name:</strong> ${booking.bandName}</li>` : ''}
            </ul>
          `,
          attachments: [{
            filename: 'booking.ics',
            content: calendarInvite,
            contentType: 'text/calendar; charset=utf-8; method=REQUEST'
          }]
        });
      } catch (recipientEmailError) {
        console.log(`Admin/staff notification email failed for ${adminEmail}:`, recipientEmailError.message);
      }
    }
  } catch (emailError) {
    console.log('Admin notification email failed:', emailError.message);
  }
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Constants
  DEFAULT_ADMIN_CREATED_USER_PASSWORD,
  DEFAULT_APP_LOGIN_URL,
  ADMIN_DELETE_OWNER_EMAIL,
  ALWAYS_NOTIFY_BOOKING_CONFIRM_EMAILS,
  // Time
  formatTime12Hour,
  formatTimeRange12Hour,
  // Date
  parseDateInputToStartOfDay,
  formatDateAsYmd,
  formatDateAsYmdInIst,
  formatBookingDisplayDate,
  // Filters
  buildHourlySlotModeFilter,
  // String / Email
  escapeRegExp,
  normalizeEmail,
  isValidEmail,
  parseOptionalEmailList,
  // Mobile
  normalizeMobileLast10,
  normalizeIndianMobile,
  isValidIndianMobile,
  // Booking labels
  deriveDynamicBookingLabel,
  // Price / Payment
  derivePriceAdjustmentTypeFromValue,
  normalizePriceAdjustmentInput,
  normalizePaymentStatusInput,
  computeCollectedAmount,
  normalizePaymentTracking,
  // Notifications
  resolveAdminNotificationEmails,
  sendUnifiedBookingConfirmationEmails
};
