const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const BlockedTime = require('../models/BlockedTime');
const User = require('../models/User');
const AdminSettings = require('../models/AdminSettings');
const { protect } = require('../middleware/auth');
const { sendEmail } = require('../utils/email');
const { generateCalendarInvite, buildBookingCalendarUid } = require('../utils/calendar');
const { generateBill } = require('../utils/billGenerator');
const { 
  sendBookingRequestNotifications, 
  sendCustomerBookingRequestWhatsApp 
} = require('../utils/whatsapp');

const IST_TIMEZONE = 'Asia/Kolkata';

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
  return `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
};

const formatDateLongInIst = (dateValue) => {
  const parsedDate = new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) return '';

  return parsedDate.toLocaleDateString('en-IN', {
    timeZone: IST_TIMEZONE,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const formatDateShortInIst = (dateValue) => {
  const parsedDate = new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) return '';

  return parsedDate.toLocaleDateString('en-IN', {
    timeZone: IST_TIMEZONE
  });
};

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

const getDisplayUpiName = (settings) => {
  const configuredName = String(settings?.upiName || '').trim();
  const legacyPlaceholders = new Set([
    'JamRoom Studio',
    'Swar JamRoom & Music Studio (SwarJRS)'
  ]);

  if (!configuredName || legacyPlaceholders.has(configuredName)) {
    return process.env.UPI_NAME || 'Swaresh Pawar';
  }

  return configuredName;
};

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

const deriveAvailableBookingModes = (rentalTypes = []) => {
  let hasHourly = false;
  let hasPerday = false;

  const safeRentalTypes = Array.isArray(rentalTypes) ? rentalTypes : [];

  safeRentalTypes.forEach((type) => {
    const typeName = String(type?.name || '').trim();
    const subItems = Array.isArray(type?.subItems) ? type.subItems : [];

    if ((typeName === 'JamRoom' || subItems.length === 0) && Number(type?.basePrice || 0) > 0) {
      hasHourly = true;
    }

    subItems.forEach((subItem) => {
      const rentalType = normalizeRentalTypeToken(subItem?.rentalType) === 'perday' ? 'perday' : 'hourly';
      if (rentalType === 'perday') {
        hasPerday = true;
      } else {
        hasHourly = true;
      }
    });
  });

  const modes = [];
  if (hasHourly) modes.push('hourly');
  if (hasPerday) modes.push('perday');
  return modes;
};

const normalizeRentalTypeToken = (value) => {
  const compact = String(value || 'inhouse').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (compact === 'perday') return 'perday';
  if (compact === 'persession' || compact === 'session') return 'persession';
  if (compact === 'pertrack' || compact === 'track') return 'pertrack';
  return 'inhouse';
};

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const normalizePreferredWeekday = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';

  const aliases = {
    sun: 0,
    sunday: 0,
    mon: 1,
    monday: 1,
    tue: 2,
    tues: 2,
    tuesday: 2,
    wed: 3,
    wednesday: 3,
    thu: 4,
    thur: 4,
    thurs: 4,
    thursday: 4,
    fri: 5,
    friday: 5,
    sat: 6,
    saturday: 6
  };

  if (!Object.prototype.hasOwnProperty.call(aliases, raw)) {
    return '';
  }

  return WEEKDAY_LABELS[aliases[raw]];
};

const getNextWeekdayOnOrAfter = (baseDate, weekdayLabel) => {
  if (!(baseDate instanceof Date) || Number.isNaN(baseDate.getTime())) {
    return null;
  }

  const normalizedWeekday = normalizePreferredWeekday(weekdayLabel);
  if (!normalizedWeekday) return null;

  const targetDow = WEEKDAY_LABELS.indexOf(normalizedWeekday);
  if (targetDow < 0) return null;

  const nextDate = new Date(baseDate);
  nextDate.setHours(0, 0, 0, 0);
  const currentDow = nextDate.getDay();
  const offset = (targetDow - currentDow + 7) % 7;
  nextDate.setDate(nextDate.getDate() + offset);
  return nextDate;
};

const normalizeKeywordList = (values = [], fallback = []) => {
  const source = Array.isArray(values) && values.length > 0 ? values : fallback;
  return source
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
};

const normalizeClassConfig = (settings) => {
  const source = settings?.classConfig || {};
  const fallbackCategoryKeywords = ['class', 'guitar class', 'keyboard class', 'music class'];
  const fallbackItemKeywords = ['guitar class', 'keyboard class', 'guitar lesson', 'keyboard lesson'];
  const fallbackLocations = [String(settings?.studioName || 'Studio').trim()].filter(Boolean);
  const fallbackPlanOptionsMonths = [1];

  const locations = Array.isArray(source.locations) && source.locations.length > 0
    ? source.locations.map((location) => String(location || '').trim()).filter(Boolean)
    : fallbackLocations;

  const planOptionsMonths = (Array.isArray(source.planOptionsMonths) && source.planOptionsMonths.length > 0
    ? source.planOptionsMonths
    : fallbackPlanOptionsMonths)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value >= 1 && value <= 24)
    .sort((a, b) => a - b);

  const multiMonthDiscounts = (Array.isArray(source.multiMonthDiscounts) ? source.multiMonthDiscounts : [])
    .map((entry) => ({
      months: Number(entry?.months),
      discountPercent: Math.max(0, Number(entry?.discountPercent || 0)),
      discountAmount: Math.max(0, Number(entry?.discountAmount || 0))
    }))
    .filter((entry) => Number.isFinite(entry.months) && entry.months >= 1 && entry.months <= 24)
    .sort((a, b) => a.months - b.months);

  return {
    enabled: source.enabled !== false,
    monthlyFee: Math.max(0, Number(source.monthlyFee || 2000)),
    classesPerMonth: Math.max(1, Number(source.classesPerMonth || 4)),
    weeksPerMonthWindow: Math.max(1, Number(source.weeksPerMonthWindow || 5)),
    sessionDurationHours: Math.max(1, Number(source.sessionDurationHours || 1)),
    allowOnlySingleClassItem: source.allowOnlySingleClassItem !== false,
    planOptionsMonths,
    multiMonthDiscounts,
    locations,
    categoryKeywords: normalizeKeywordList(source.categoryKeywords, fallbackCategoryKeywords),
    itemKeywords: normalizeKeywordList(source.itemKeywords, fallbackItemKeywords)
  };
};

const getClassDiscountForMonths = (months, classConfig, totalFeeBeforeDiscount = 0) => {
  const monthsNumber = Number(months);
  if (!Number.isFinite(monthsNumber) || monthsNumber < 1) return 0;

  const discountEntry = (Array.isArray(classConfig?.multiMonthDiscounts) ? classConfig.multiMonthDiscounts : [])
    .find((entry) => Number(entry?.months) === monthsNumber);

  if (discountEntry) {
    const percent = Math.max(0, Number(discountEntry.discountPercent || 0));
    if (percent > 0) {
      return Math.round(Math.max(0, Number(totalFeeBeforeDiscount || 0)) * (percent / 100));
    }

    return Math.max(0, Number(discountEntry.discountAmount || 0));
  }

  return 0;
};

const addDaysToDate = (baseDate, daysToAdd) => {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + Number(daysToAdd || 0));
  return date;
};

const buildClassLessonsSchedule = ({ planStartDate, startTime, endTime, totalClassesPlanned }) => {
  const lessons = [];
  const classes = Math.max(0, Number(totalClassesPlanned || 0));

  for (let i = 0; i < classes; i += 1) {
    lessons.push({
      weekNumber: i + 1,
      classNumber: i + 1,
      scheduledDate: addDaysToDate(planStartDate, i * 7),
      scheduledStartTime: startTime,
      scheduledEndTime: endTime,
      status: 'SCHEDULED',
      notes: '',
      details: ''
    });
  }

  return lessons;
};

const doesContainAnyKeyword = (text, keywords = []) => {
  const normalizedText = String(text || '').trim().toLowerCase();
  if (!normalizedText) return false;
  return keywords.some((keyword) => normalizedText.includes(keyword));
};

const isClassRental = (rental, classConfig) => {
  const category = String(rental?.category || '').trim().toLowerCase();
  const name = String(rental?.name || '').trim().toLowerCase();

  return (
    doesContainAnyKeyword(category, classConfig.categoryKeywords)
    || doesContainAnyKeyword(name, classConfig.itemKeywords)
  );
};

const deriveClassInstrument = (rentals = []) => {
  const text = rentals
    .map((rental) => `${String(rental?.category || '')} ${String(rental?.name || '')}`.toLowerCase())
    .join(' ');

  if (text.includes('guitar')) return 'Guitar';
  if (text.includes('keyboard') || text.includes('keys')) return 'Keyboard';
  return 'Music';
};

const getClassMonthKeyFromDate = (dateValue) => {
  if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) {
    return '';
  }

  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

/**
 * Helper function to check time conflicts
 */
const checkTimeConflict = (start1, end1, start2, end2) => {
  return (start1 < end2 && end1 > start2);
};

/**
 * Helper function to convert time string to minutes
 */
const timeToMinutes = (time) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

/**
 * Helper function to calculate end time from start time and duration
 */
const calculateEndTime = (startTime, duration) => {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = startMinutes + (duration * 60);
  const hours = Math.floor(endMinutes / 60) % 24;
  const minutes = endMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const parseDateTime = (dateValue, timeValue) => {
  if (!dateValue || !timeValue) return null;

  const [hours, minutes] = String(timeValue).split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;

  const parsedDate = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return null;

  parsedDate.setHours(hours, minutes, 0, 0);
  return parsedDate;
};

const getClassLessonsForDateRange = (booking, dayStart, dayEnd) => {
  const lessons = Array.isArray(booking?.classSession?.lessons) ? booking.classSession.lessons : [];
  const startMs = dayStart instanceof Date ? dayStart.getTime() : Number.NaN;
  const endMs = dayEnd instanceof Date ? dayEnd.getTime() : Number.NaN;

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return [];
  }

  return lessons.filter((lesson) => {
    const lessonDate = lesson?.scheduledDate ? new Date(lesson.scheduledDate) : null;
    if (!(lessonDate instanceof Date) || Number.isNaN(lessonDate.getTime())) {
      return false;
    }

    const lessonTime = lessonDate.getTime();
    if (lessonTime < startMs || lessonTime > endMs) {
      return false;
    }

    const lessonStatus = String(lesson?.status || 'SCHEDULED').toUpperCase();
    return lessonStatus !== 'COMPLETED';
  });
};

const parseDateOnlyToStartOfDay = (dateValue) => {
  if (!dateValue) return null;

  if (dateValue instanceof Date) {
    const cloned = new Date(dateValue);
    if (Number.isNaN(cloned.getTime())) return null;
    cloned.setHours(0, 0, 0, 0);
    return cloned;
  }

  const raw = String(dateValue).trim();
  if (!raw) return null;

  const ymdMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymdMatch) {
    const year = Number(ymdMatch[1]);
    const month = Number(ymdMatch[2]);
    const day = Number(ymdMatch[3]);
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
  }

  const fallback = new Date(raw);
  if (Number.isNaN(fallback.getTime())) return null;
  fallback.setHours(0, 0, 0, 0);
  return fallback;
};

const getTodayStartLocal = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

const applyTimeToDateObject = (dateValue, timeValue) => {
  if (!dateValue || !timeValue) return null;

  const [hours, minutes] = String(timeValue).split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;

  const parsedDate = new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) return null;

  parsedDate.setHours(hours, minutes, 0, 0);
  return parsedDate;
};

const normalizeRentalName = (name) => String(name || '').trim().toLowerCase();

const buildPerdayInventoryModeFilter = () => ({
  $or: [
    { bookingMode: 'perday' },
    { rentals: { $elemMatch: { rentalType: 'perday' } } },
    {
      perDayStartDate: { $exists: true, $ne: null },
      perDayEndDate: { $exists: true, $ne: null }
    }
  ]
});

const rangesOverlap = (startA, endA, startB, endB) => {
  return startA < endB && endA > startB;
};

const getPerdayBookedItemQuantities = async ({
  requestStartDate,
  requestEndDate,
  requestStartTime,
  requestEndTime,
  excludeBookingId = null
}) => {
  const requestStartDateTime = parseDateTime(requestStartDate, requestStartTime);
  const requestEndDateTime = parseDateTime(requestEndDate, requestEndTime);

  if (!requestStartDateTime || !requestEndDateTime) {
    return new Map();
  }

  const query = {
    bookingStatus: 'CONFIRMED',
    $and: [
      buildPerdayInventoryModeFilter(),
      {
        $or: [
          {
            perDayStartDate: { $lte: new Date(`${requestEndDate}T23:59:59.999`) },
            perDayEndDate: { $gte: new Date(`${requestStartDate}T00:00:00.000`) }
          },
          {
            date: {
              $gte: new Date(`${requestStartDate}T00:00:00.000`),
              $lte: new Date(`${requestEndDate}T23:59:59.999`)
            }
          }
        ]
      }
    ]
  };

  if (excludeBookingId) {
    query._id = { $ne: excludeBookingId };
  }

  const candidateBookings = await Booking.find(query)
    .select('bookingMode date perDayStartDate perDayEndDate startTime endTime rentals');

  const bookedItems = new Map();

  for (const booking of candidateBookings) {
    const bookingStartDate = booking.perDayStartDate || booking.date;
    const bookingEndDate = booking.perDayEndDate || booking.date;
    const bookingStartTime = booking.startTime || '00:00';
    const bookingEndTime = booking.endTime || bookingStartTime;

    const bookingStartDateTime = applyTimeToDateObject(bookingStartDate, bookingStartTime);
    const bookingEndDateTime = applyTimeToDateObject(bookingEndDate, bookingEndTime);

    if (!bookingStartDateTime || !bookingEndDateTime) {
      continue;
    }

    if (!rangesOverlap(requestStartDateTime, requestEndDateTime, bookingStartDateTime, bookingEndDateTime)) {
      continue;
    }

    const rentals = Array.isArray(booking.rentals) ? booking.rentals : [];
    rentals.forEach((rental) => {
      const rentalType = String(rental?.rentalType || '').toLowerCase();
      if (rentalType !== 'perday') return;

      const rentalNameKey = normalizeRentalName(rental?.name);
      if (!rentalNameKey) return;

      const qty = Math.max(1, Number(rental?.quantity || 1));
      bookedItems.set(rentalNameKey, (bookedItems.get(rentalNameKey) || 0) + qty);
    });
  }

  return bookedItems;
};

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

// @route   POST /api/bookings
// @desc    Create a new booking with multiple rentals
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const {
      bookingMode = 'hourly',
      date,
      startTime,
      endTime,
      duration,
      rentals,
      subtotal,
      taxAmount,
      totalAmount,
      rentalType,
      bandName,
      notes,
      perDayStartDate,
      perDayEndDate,
      perDayPickupTime,
      perDayReturnTime,
      perDayDays,
      classLocation,
      classPlanMonths,
      classPreferredWeekday,
      classPreferredStartTime
    } = req.body;

    const normalizedMode = String(bookingMode).toLowerCase() === 'perday' ? 'perday' : 'hourly';
    let effectiveStartTime = normalizedMode === 'perday'
      ? String(perDayPickupTime || startTime || '')
      : String(startTime || '');
    let effectiveEndTime = normalizedMode === 'perday'
      ? String(perDayReturnTime || endTime || '')
      : String(endTime || '');

    if (!rentals || !Array.isArray(rentals) || rentals.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one rental item'
      });
    }

    if (normalizedMode === 'hourly') {
      if (!date || !effectiveStartTime || !effectiveEndTime || !duration) {
        return res.status(400).json({
          success: false,
          message: 'Please provide date, startTime, endTime and duration for hourly booking'
        });
      }
    } else {
      if (!perDayStartDate || !perDayEndDate || !effectiveStartTime || !effectiveEndTime) {
        return res.status(400).json({
          success: false,
          message: 'Please provide per-day start/end date and pick-up/return time'
        });
      }
    }

    // Validate rentals data
    for (const rental of rentals) {
      if (!rental.name || rental.price === undefined || rental.price === null || !rental.quantity) {
        return res.status(400).json({
          success: false,
          message: 'Each rental must have name, price, and quantity'
        });
      }

      const rentalTypeValue = normalizeRentalTypeToken(rental.rentalType);
      if (normalizedMode === 'perday' && rentalTypeValue !== 'perday' && rentalTypeValue !== 'persession' && rentalTypeValue !== 'pertrack') {
        return res.status(400).json({
          success: false,
          message: 'Per-day booking can include only per-day, per-session, or per-track rental items'
        });
      }

      if (normalizedMode === 'hourly' && rentalTypeValue === 'perday') {
        return res.status(400).json({
          success: false,
          message: 'Hourly booking can include only in-house, per-session, or per-track rental items'
        });
      }
    }

    const normalizedRentals = rentals.map((rental) => ({
      name: String(rental?.name || '').trim(),
      category: String(rental?.category || '').trim(),
      description: String(rental?.description || '').trim(),
      price: Number(rental?.price || 0),
      quantity: Math.max(1, Number(rental?.quantity || 1)),
      rentalType: normalizeRentalTypeToken(rental?.rentalType)
    }));

    const settings = await AdminSettings.getSettings();
    const classConfig = normalizeClassConfig(settings);
    const isClassBooking = normalizedMode === 'hourly'
      && classConfig.enabled
      && normalizedRentals.some((rental) => isClassRental(rental, classConfig));

    if (isClassBooking && classConfig.allowOnlySingleClassItem && normalizedRentals.length !== 1) {
      return res.status(400).json({
        success: false,
        message: 'Please select only one class item for class bookings.'
      });
    }

    if (isClassBooking && Number(normalizedRentals[0]?.quantity || 1) !== 1) {
      return res.status(400).json({
        success: false,
        message: 'Class plans can include only one class item with quantity 1.'
      });
    }

    if (isClassBooking && normalizedMode === 'hourly') {
      effectiveEndTime = calculateEndTime(effectiveStartTime, classConfig.sessionDurationHours);
    }

    const parsedDuration = Number(duration);
    const classDurationHours = isClassBooking ? classConfig.sessionDurationHours : parsedDuration;
    const durationForPricing = normalizedMode === 'hourly' ? classDurationHours : 1;

    // Validate duration for hourly mode
    if (normalizedMode === 'hourly' && durationForPricing < 1) {
      return res.status(400).json({
        success: false,
        message: 'Duration must be at least 1 hour'
      });
    }

    // Convert date(s) to start of day using local-date parsing to avoid timezone drift.
    let bookingDate = parseDateOnlyToStartOfDay(normalizedMode === 'perday' ? perDayStartDate : date);
    const todayStart = getTodayStartLocal();
    let normalizedPreferredWeekday = '';
    let normalizedPreferredStartTime = '';

    if (!bookingDate) {
      return res.status(400).json({
        success: false,
        message: 'Invalid booking date'
      });
    }

    if (bookingDate < todayStart) {
      return res.status(400).json({
        success: false,
        message: 'Past dates are not allowed for booking'
      });
    }

    if (isClassBooking) {
      normalizedPreferredWeekday = normalizePreferredWeekday(classPreferredWeekday);
      normalizedPreferredStartTime = String(classPreferredStartTime || '').trim();
      const validTimePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

      if (!normalizedPreferredWeekday) {
        return res.status(400).json({
          success: false,
          message: 'Please select your preferred class day for weekly classes'
        });
      }

      if (!validTimePattern.test(normalizedPreferredStartTime)) {
        return res.status(400).json({
          success: false,
          message: 'Please select a valid preferred class start time (HH:mm)'
        });
      }

      const preferredFirstClassDate = getNextWeekdayOnOrAfter(bookingDate, normalizedPreferredWeekday);
      if (!preferredFirstClassDate) {
        return res.status(400).json({
          success: false,
          message: 'Unable to resolve preferred class day. Please choose a valid weekday.'
        });
      }

      bookingDate = preferredFirstClassDate;
      effectiveStartTime = normalizedPreferredStartTime;
      effectiveEndTime = calculateEndTime(normalizedPreferredStartTime, classConfig.sessionDurationHours);
    }

    let perDayStart = null;
    let perDayEnd = null;
    let computedPerDayDays = 1;
    let computedPerDayHours = 24;

    if (normalizedMode === 'perday') {
      const perDayStartDateTime = parseDateTime(perDayStartDate, effectiveStartTime);
      const perDayEndDateTime = parseDateTime(perDayEndDate, effectiveEndTime);

      perDayStart = parseDateOnlyToStartOfDay(perDayStartDate);
      perDayEnd = parseDateOnlyToStartOfDay(perDayEndDate);

      if (
        !perDayStartDateTime ||
        !perDayEndDateTime ||
        Number.isNaN(perDayStart.getTime()) ||
        Number.isNaN(perDayEnd.getTime())
      ) {
        return res.status(400).json({
          success: false,
          message: 'Invalid per-day date/time selection'
        });
      }

      if (perDayStart < todayStart) {
        return res.status(400).json({
          success: false,
          message: 'Past dates are not allowed for booking'
        });
      }

      if (perDayEnd < perDayStart) {
        return res.status(400).json({
          success: false,
          message: 'Return date cannot be earlier than pickup date'
        });
      }

      const diffMs = perDayEndDateTime.getTime() - perDayStartDateTime.getTime();
      const dayMs = 24 * 60 * 60 * 1000;

      if (diffMs < dayMs) {
        return res.status(400).json({
          success: false,
          message: 'Per-day return must be at least 24 hours after pick-up'
        });
      }

      if (diffMs % dayMs !== 0) {
        return res.status(400).json({
          success: false,
          message: 'Per-day return must be in exact 24-hour blocks (24h, 48h, 72h...)'
        });
      }

      computedPerDayDays = diffMs / dayMs;
      computedPerDayHours = computedPerDayDays * 24;
    }

    if (normalizedMode === 'hourly') {
      const dayStart = new Date(bookingDate);
      const dayEnd = new Date(bookingDate);
      dayEnd.setHours(23, 59, 59, 999);

      // Check for conflicts with existing bookings (only CONFIRMED bookings block slots)
      const existingBookings = await Booking.find({
        date: bookingDate,
        bookingStatus: 'CONFIRMED',
        ...buildHourlySlotModeFilter()
      });

      const classLessonBookings = await Booking.find({
        bookingStatus: 'CONFIRMED',
        'classSession.isClassBooking': true,
        ...buildHourlySlotModeFilter(),
        'classSession.lessons': {
          $elemMatch: {
            scheduledDate: { $gte: dayStart, $lte: dayEnd },
            status: { $ne: 'COMPLETED' }
          }
        }
      }).select('classSession.lessons classSession.instrument rentalType');

      for (const booking of existingBookings) {
        if (checkTimeConflict(effectiveStartTime, effectiveEndTime, booking.startTime, booking.endTime)) {
          return res.status(400).json({
            success: false,
            message: `Time conflict with existing booking (${formatTimeRange12Hour(booking.startTime, booking.endTime)})`
          });
        }
      }

      for (const classBooking of classLessonBookings) {
        const lessonsForDate = getClassLessonsForDateRange(classBooking, dayStart, dayEnd);
        for (const lesson of lessonsForDate) {
          const lessonStart = String(lesson?.scheduledStartTime || '').trim();
          const lessonEnd = String(lesson?.scheduledEndTime || '').trim();
          if (!lessonStart || !lessonEnd) continue;

          if (checkTimeConflict(effectiveStartTime, effectiveEndTime, lessonStart, lessonEnd)) {
            return res.status(400).json({
              success: false,
              message: `Time conflict with scheduled class (${formatTimeRange12Hour(lessonStart, lessonEnd)})`
            });
          }
        }
      }

      // Check for conflicts with blocked times
      const blockedTimes = await BlockedTime.find({
        date: bookingDate
      });

      for (const blocked of blockedTimes) {
        if (checkTimeConflict(effectiveStartTime, effectiveEndTime, blocked.startTime, blocked.endTime)) {
          return res.status(400).json({
            success: false,
            message: `This time slot is blocked by admin (${formatTimeRange12Hour(blocked.startTime, blocked.endTime)})`
          });
        }
      }
    }

    if (normalizedMode === 'perday') {
      const bookedItemQuantities = await getPerdayBookedItemQuantities({
        requestStartDate: perDayStartDate,
        requestEndDate: perDayEndDate,
        requestStartTime: effectiveStartTime,
        requestEndTime: effectiveEndTime
      });

      const conflictingItems = [];
      normalizedRentals.forEach((rental) => {
        const rentalType = String(rental?.rentalType || '').toLowerCase();
        if (rentalType !== 'perday') {
          return;
        }

        const requestedNameKey = normalizeRentalName(rental?.name);
        if (!requestedNameKey) return;

        if ((bookedItemQuantities.get(requestedNameKey) || 0) > 0) {
          conflictingItems.push(rental.name);
        }
      });

      if (conflictingItems.length > 0) {
        return res.status(409).json({
          success: false,
          message: `These per-day item(s) are unavailable for the selected dates: ${[...new Set(conflictingItems)].join(', ')}`
        });
      }
    }

    let classSession = {
      isClassBooking: false,
      location: '',
      instrument: '',
      classMonth: '',
      monthlyFee: 0,
      classesPerMonth: 0,
      classNumberInMonth: 0,
      classesRemainingAfterBooking: 0,
      monthlyFeeDueNow: 0,
      planMonths: 1,
      weeksPerMonthWindow: classConfig.weeksPerMonthWindow,
      planStartDate: null,
      planEndDate: null,
      totalClassesPlanned: 0,
      completedClassesCount: 0,
      selectedClassItemName: '',
      preferredWeekday: '',
      preferredStartTime: '',
      preferredEndTime: '',
      totalFeeBeforeDiscount: 0,
      discountAmount: 0,
      totalFeeAfterDiscount: 0,
      lessons: []
    };

    if (isClassBooking) {
      const normalizedLocation = String(classLocation || '').trim();

      if (!normalizedLocation) {
        return res.status(400).json({
          success: false,
          message: 'Please select a class location for class bookings'
        });
      }

      if (!classConfig.locations.includes(normalizedLocation)) {
        return res.status(400).json({
          success: false,
          message: `Invalid class location. Allowed locations: ${classConfig.locations.join(', ')}`
        });
      }

      const requestedInstrument = deriveClassInstrument(normalizedRentals);
      const existingActiveClassPlan = await Booking.findOne({
        userId: req.user._id,
        'classSession.isClassBooking': true,
        'classSession.instrument': requestedInstrument,
        'classSession.classesRemainingAfterBooking': { $gt: 0 },
        bookingStatus: { $in: ['PENDING', 'CONFIRMED'] }
      }).select('_id classSession.totalClassesPlanned classSession.completedClassesCount classSession.classesRemainingAfterBooking');

      if (existingActiveClassPlan) {
        return res.status(400).json({
          success: false,
          message: `You already have an active ${requestedInstrument} class plan with ${existingActiveClassPlan.classSession?.classesRemainingAfterBooking || 0} class(es) remaining. Please complete it before placing a new ${requestedInstrument} class order.`
        });
      }

      const selectedPlanMonths = Math.max(1, Number(classPlanMonths || 1));
      if (Array.isArray(classConfig.planOptionsMonths)
        && classConfig.planOptionsMonths.length > 0
        && !classConfig.planOptionsMonths.includes(selectedPlanMonths)) {
        return res.status(400).json({
          success: false,
          message: `Invalid class plan. Allowed months: ${classConfig.planOptionsMonths.join(', ')}`
        });
      }

      const classMonth = getClassMonthKeyFromDate(bookingDate);
      const totalClassesPlanned = classConfig.classesPerMonth * selectedPlanMonths;
      const totalFeeBeforeDiscount = classConfig.monthlyFee * selectedPlanMonths;
      const discountAmount = getClassDiscountForMonths(selectedPlanMonths, classConfig, totalFeeBeforeDiscount);
      const totalFeeAfterDiscount = Math.max(0, totalFeeBeforeDiscount - discountAmount);
      const planStartDate = bookingDate;
      const planEndDate = addDaysToDate(planStartDate, selectedPlanMonths * classConfig.weeksPerMonthWindow * 7);
      const lessons = buildClassLessonsSchedule({
        planStartDate,
        startTime: effectiveStartTime,
        endTime: effectiveEndTime,
        totalClassesPlanned
      });

      classSession = {
        isClassBooking: true,
        location: normalizedLocation,
        instrument: requestedInstrument,
        classMonth,
        monthlyFee: classConfig.monthlyFee,
        classesPerMonth: classConfig.classesPerMonth,
        classNumberInMonth: 1,
        classesRemainingAfterBooking: totalClassesPlanned,
        monthlyFeeDueNow: totalFeeAfterDiscount,
        planMonths: selectedPlanMonths,
        weeksPerMonthWindow: classConfig.weeksPerMonthWindow,
        planStartDate,
        planEndDate,
        totalClassesPlanned,
        completedClassesCount: 0,
        selectedClassItemName: normalizedRentals[0]?.name || '',
        preferredWeekday: normalizedPreferredWeekday,
        preferredStartTime: effectiveStartTime,
        preferredEndTime: effectiveEndTime,
        totalFeeBeforeDiscount,
        discountAmount,
        totalFeeAfterDiscount,
        lessons
      };
    }

    // Get admin settings for UPI details and GST configuration
    const resolvedUpiName = getDisplayUpiName(settings);
    
    // Validate and recalculate totals based on admin settings
    let calculatedSubtotal = 0;
    normalizedRentals.forEach((rental) => {
      const rentalType = normalizeRentalTypeToken(rental?.rentalType);
      const itemPrice = Number(rental?.price || 0);
      const itemQuantity = Math.max(1, Number(rental?.quantity || 1));

      if (normalizedMode === 'perday') {
        if (rentalType === 'persession' || rentalType === 'pertrack') {
          calculatedSubtotal += itemPrice * itemQuantity;
        } else {
          calculatedSubtotal += itemPrice * itemQuantity * computedPerDayDays;
        }
      } else if (rentalType === 'persession' || rentalType === 'pertrack') {
        calculatedSubtotal += itemPrice * itemQuantity;
      } else if (rentalType === 'perday') {
        calculatedSubtotal += itemPrice * itemQuantity;
      } else {
        calculatedSubtotal += itemPrice * itemQuantity * durationForPricing;
      }
    });

    if (classSession.isClassBooking) {
      calculatedSubtotal = classSession.monthlyFeeDueNow;
    }

    if (!classSession.isClassBooking && Number.isFinite(Number(subtotal)) && Number(subtotal) > 0) {
      calculatedSubtotal = Number(subtotal);
    }

    const gstEnabled = settings.gstConfig?.enabled || false;
    const gstRate = gstEnabled ? (settings.gstConfig.rate || 0.18) : 0;
    
    // Recalculate tax amount based on current admin settings
    const calculatedTaxAmount = gstEnabled ? Math.round(calculatedSubtotal * gstRate) : 0;
    const calculatedTotalAmount = calculatedSubtotal + calculatedTaxAmount;
    
    console.log('GST Calculation:', {
      gstEnabled,
      gstRate,
      subtotal: calculatedSubtotal,
      taxAmount: calculatedTaxAmount,
      totalAmount: calculatedTotalAmount
    });

    // Create rental type summary for backward compatibility
    const rentalTypeSummary = deriveDynamicBookingLabel(normalizedRentals, rentalType);

    // Create booking with multiple rentals
    const booking = await Booking.create({
      userId: req.user._id,
      bookingMode: normalizedMode,
      date: bookingDate,
      startTime: effectiveStartTime,
      endTime: effectiveEndTime,
      duration: normalizedMode === 'perday' ? computedPerDayHours : durationForPricing,
      perDayStartDate: normalizedMode === 'perday' ? perDayStart : undefined,
      perDayEndDate: normalizedMode === 'perday' ? perDayEnd : undefined,
      perDayDays: normalizedMode === 'perday' ? computedPerDayDays : 1,
      rentalType: rentalTypeSummary, // Legacy field
      rentals: normalizedRentals, // New multiple rentals array
      subtotal: calculatedSubtotal,
      taxAmount: calculatedTaxAmount,
      price: calculatedTotalAmount, // Total amount including tax
      userName: req.user.name,
      userEmail: req.user.email,
      userMobile: req.user.mobile,
      bandName,
      notes,
      classSession,
      paymentStatus: 'PENDING',
      bookingStatus: 'PENDING'
    });

    // Format date for display
    const displayDate = formatDateLongInIst(bookingDate);

    const perDayDateLabel = normalizedMode === 'perday'
      ? `${formatDateShortInIst(perDayStart)} ${formatTime12Hour(effectiveStartTime)} to ${formatDateShortInIst(perDayEnd)} ${formatTime12Hour(effectiveEndTime)} (${computedPerDayDays} day(s))`
      : null;

    const classSummaryHtml = classSession.isClassBooking
      ? `
          <h3>Class Plan:</h3>
          <ul>
            <li><strong>Instrument:</strong> ${classSession.instrument}</li>
            <li><strong>Class Item:</strong> ${classSession.selectedClassItemName || classSession.instrument}</li>
            <li><strong>Location:</strong> ${classSession.location}</li>
            <li><strong>Default Weekly Slot:</strong> ${classSession.preferredWeekday || 'N/A'} ${classSession.preferredStartTime ? `at ${formatTime12Hour(classSession.preferredStartTime)}` : ''}</li>
            <li><strong>Plan:</strong> ${classSession.planMonths} month(s)</li>
            <li><strong>Plan Window:</strong> ${formatDateShortInIst(classSession.planStartDate)} to ${formatDateShortInIst(classSession.planEndDate)}</li>
            <li><strong>Classes:</strong> ${classSession.classesPerMonth} per month (${classSession.totalClassesPlanned} total)</li>
            <li><strong>Monthly Fee:</strong> ₹${classSession.monthlyFee}</li>
            <li><strong>Plan Fee:</strong> ₹${classSession.totalFeeBeforeDiscount}</li>
            <li><strong>Discount:</strong> ₹${classSession.discountAmount}</li>
            <li><strong>Fee Due Now:</strong> ₹${classSession.monthlyFeeDueNow}</li>
          </ul>
        `
      : '';

    // Create rentals summary for email with correct per-day pricing
    const rentalsSummary = rentals.map(rental => {
      let itemTotal;
      const rentalTypeValue = normalizeRentalTypeToken(rental?.rentalType);

      if (normalizedMode === 'perday' || rentalTypeValue === 'perday') {
        // Per-day rentals: use per-day price and selected day count.
        const perdayPrice = rental.perdayPrice || rental.price;
        const days = normalizedMode === 'perday' ? computedPerDayDays : 1;
        itemTotal = perdayPrice * rental.quantity * days;
        return `<li>${rental.name} × ${rental.quantity} × ${days} day(s) - ₹${itemTotal}</li>`;
      } else if (rentalTypeValue === 'persession') {
        itemTotal = rental.price * rental.quantity;
        return `<li>${rental.name} × ${rental.quantity} (Per session) - ₹${itemTotal}</li>`;
      } else if (rentalTypeValue === 'pertrack') {
        itemTotal = rental.price * rental.quantity;
        return `<li>${rental.name} × ${rental.quantity} (Per track) - ₹${itemTotal}</li>`;
      } else {
        // Hourly rentals: use price with duration factor
        itemTotal = rental.price * rental.quantity * durationForPricing;
        return `<li>${rental.name} × ${rental.quantity} × ${durationForPricing}h - ₹${itemTotal}</li>`;
      }
    }).join('');

    // Send confirmation email to user
    try {
      await sendEmail({
        to: req.user.email,
        subject: 'Booking Request Received - JamRoom',
        html: `
          <h2>Booking Request Received</h2>
          <p>Hi ${req.user.name},</p>
          <p>Your booking request has been received and is pending admin approval.</p>
          <h3>Booking Details:</h3>
          <ul>
            ${normalizedMode === 'perday'
              ? `<li><strong>Per-day Range:</strong> ${perDayDateLabel}</li>`
              : `<li><strong>Date:</strong> ${displayDate}</li>
                 <li><strong>Time:</strong> ${formatTimeRange12Hour(effectiveStartTime, effectiveEndTime)}</li>
                 <li><strong>Duration:</strong> ${durationForPricing} hour(s)</li>`
            }
          </ul>
          <h3>Rentals:</h3>
          <ul>
            ${rentalsSummary}
          </ul>
          ${classSummaryHtml}
          <h3>Price Breakdown:</h3>
          <ul>
            <li><strong>Subtotal:</strong> ₹${calculatedSubtotal}</li>
            ${gstEnabled ? `<li><strong>${settings.gstConfig.displayName || 'GST'} (${Math.round(gstRate * 100)}%):</strong> ₹${calculatedTaxAmount}</li>` : ''}
            <li><strong>Total Amount:</strong> ₹${calculatedTotalAmount}</li>
            <li><strong>Status:</strong> PENDING</li>
          </ul>
          <h3>Payment Details:</h3>
          <p><strong>UPI ID:</strong> ${settings.upiId}</p>
          <p><strong>Name:</strong> ${resolvedUpiName}</p>
          <p><strong>Amount:</strong> ₹${calculatedTotalAmount}</p>
          <p>Please complete the payment and wait for admin approval.</p>
          <p>You will receive a confirmation email once approved.</p>
        `
      });
    } catch (emailError) {
      console.log('Booking confirmation email failed:', emailError.message);
    }

    // Send WhatsApp confirmation to customer if mobile provided
    if (req.user.mobile) {
      try {
        const customerWhatsappResult = await sendCustomerBookingRequestWhatsApp(req.user.mobile, {
          userName: req.user.name,
          date: displayDate,
          startTime: effectiveStartTime,
          endTime: effectiveEndTime,
          duration: normalizedMode === 'perday' ? computedPerDayHours : duration,
          totalAmount: calculatedTotalAmount,
          upiId: settings.upiId,
          upiName: resolvedUpiName,
          classSession
        });

        if (customerWhatsappResult?.success) {
          console.log('Customer booking WhatsApp sent to:', req.user.mobile);
        } else {
          console.log('Customer booking WhatsApp failed:', customerWhatsappResult?.message || customerWhatsappResult?.error || 'Unknown error');
        }
      } catch (whatsappError) {
        console.log('Customer booking WhatsApp failed:', whatsappError.message);
      }
    }

    // Notify admins
    try {
      for (const adminEmail of settings.adminEmails) {
        await sendEmail({
          to: adminEmail,
          subject: 'New Booking Request - JamRoom',
          html: `
            <h2>New Booking Request</h2>
            <h3>Booking Details:</h3>
            <ul>
              <li><strong>User:</strong> ${req.user.name} (${req.user.email})</li>
              ${req.user.mobile ? `<li><strong>Mobile:</strong> ${req.user.mobile}</li>` : ''}
              ${normalizedMode === 'perday'
                ? `<li><strong>Per-day Range:</strong> ${perDayDateLabel}</li>`
                : `<li><strong>Date:</strong> ${displayDate}</li>
                   <li><strong>Time:</strong> ${formatTimeRange12Hour(effectiveStartTime, effectiveEndTime)}</li>
                   <li><strong>Duration:</strong> ${durationForPricing} hour(s)</li>`
              }
            </ul>
            <h3>Rentals:</h3>
            <ul>
              ${rentalsSummary}
            </ul>
            ${classSummaryHtml}
            <h3>Price Details:</h3>
            <ul>
              <li><strong>Subtotal:</strong> ₹${calculatedSubtotal}</li>
              ${gstEnabled ? `<li><strong>${settings.gstConfig.displayName || 'GST'} (${Math.round(gstRate * 100)}%):</strong> ₹${calculatedTaxAmount}</li>` : ''}
              <li><strong>Total:</strong> ₹${calculatedTotalAmount}</li>
            </ul>
            ${normalizedMode === 'perday'
              ? '<p><strong>Admin note:</strong> This per-day rental does not block JamRoom hourly slots automatically. Use Block Time in admin panel if blocking is needed.</p>'
              : ''}
            ${bandName ? `<p><strong>Band Name:</strong> ${bandName}</p>` : ''}
            <p>Please review and approve/reject this booking in the admin panel.</p>
          `
        });
      }
    } catch (emailError) {
      console.log('Admin notification email failed:', emailError.message);
    }

    // Send WhatsApp notification to admin and other notification recipients
    try {
      const bookingRequestWhatsappResult = await sendBookingRequestNotifications({
        userName: req.user.name,
        userEmail: req.user.email,
        userMobile: req.user.mobile,
        date: normalizedMode === 'perday' ? perDayDateLabel : displayDate,
        startTime: effectiveStartTime,
        endTime: effectiveEndTime,
        totalAmount: calculatedTotalAmount,
        bandName,
        classSession
      }, settings.whatsappNotifications);

      if (Array.isArray(bookingRequestWhatsappResult)) {
        const successCount = bookingRequestWhatsappResult.filter((entry) => entry?.success).length;
        const failureCount = bookingRequestWhatsappResult.length - successCount;
        console.log(`Booking request WhatsApp notifications result: ${successCount} success, ${failureCount} failed`);

        if (failureCount > 0) {
          const failedNumbers = bookingRequestWhatsappResult
            .filter((entry) => !entry?.success)
            .map((entry) => `${entry.number}: ${entry.message || 'Unknown error'}`);
          console.log('Booking request WhatsApp failed recipients:', failedNumbers.join('; '));
        }
      } else if (bookingRequestWhatsappResult?.success === false) {
        console.log('Booking request WhatsApp notifications skipped/failed:', bookingRequestWhatsappResult.message || 'Unknown error');
      }
    } catch (whatsappError) {
      console.log('WhatsApp booking request notifications failed:', whatsappError.message);
    }

    res.status(201).json({
      success: true,
      message: 'Booking created successfully. Pending admin approval.',
      booking,
      upiDetails: {
        upiId: settings.upiId,
        upiName: resolvedUpiName,
        amount: calculatedTotalAmount
      }
    });
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating booking'
    });
  }
});

// @route   GET /api/bookings/availability
// @desc    Check availability for a specific date (for reference)
// @access  Public
router.get('/availability/perday-items', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      pickupTime,
      returnTime
    } = req.query;

    if (!startDate || !endDate || !pickupTime || !returnTime) {
      return res.json({
        success: true,
        unavailableItems: [],
        bookedItemQuantities: {}
      });
    }

    const startDateTime = parseDateTime(startDate, pickupTime);
    const endDateTime = parseDateTime(endDate, returnTime);
    const dayMs = 24 * 60 * 60 * 1000;

    if (!startDateTime || !endDateTime) {
      return res.status(400).json({
        success: false,
        message: 'Invalid per-day date/time selection'
      });
    }

    const diffMs = endDateTime.getTime() - startDateTime.getTime();
    if (diffMs < dayMs || diffMs % dayMs !== 0) {
      return res.status(400).json({
        success: false,
        message: 'Per-day range must be in exact 24-hour blocks'
      });
    }

    const bookedItemQuantities = await getPerdayBookedItemQuantities({
      requestStartDate: startDate,
      requestEndDate: endDate,
      requestStartTime: pickupTime,
      requestEndTime: returnTime
    });

    const bookedItemQuantitiesObj = Object.fromEntries(bookedItemQuantities.entries());
    const unavailableItems = Object.keys(bookedItemQuantitiesObj);

    return res.json({
      success: true,
      unavailableItems,
      bookedItemQuantities: bookedItemQuantitiesObj
    });
  } catch (error) {
    console.error('Get per-day item availability error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error fetching per-day item availability'
    });
  }
});

router.get('/availability/:date', async (req, res) => {
  try {
    const date = parseDateOnlyToStartOfDay(req.params.date);
    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Use YYYY-MM-DD.'
      });
    }

    const dayStart = new Date(date);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    // Public availability: only confirmed bookings are visible and block slots.
    const bookings = await Booking.find({
      date: { $gte: dayStart, $lte: dayEnd },
      bookingStatus: 'CONFIRMED',
      ...buildHourlySlotModeFilter()
    }).select('startTime endTime rentalType bookingStatus bookingMode');

    const classLessonBookings = await Booking.find({
      bookingStatus: 'CONFIRMED',
      'classSession.isClassBooking': true,
      ...buildHourlySlotModeFilter(),
      'classSession.lessons': {
        $elemMatch: {
          scheduledDate: { $gte: dayStart, $lte: dayEnd },
          status: { $ne: 'COMPLETED' }
        }
      }
    }).select('rentalType classSession.instrument classSession.lessons');

    const classLessonSlots = [];
    classLessonBookings.forEach((booking) => {
      const lessonsForDate = getClassLessonsForDateRange(booking, dayStart, dayEnd);
      lessonsForDate.forEach((lesson) => {
        const lessonStart = String(lesson?.scheduledStartTime || '').trim();
        const lessonEnd = String(lesson?.scheduledEndTime || '').trim();
        if (!lessonStart || !lessonEnd) return;

        classLessonSlots.push({
          startTime: lessonStart,
          endTime: lessonEnd,
          rentalType: booking?.classSession?.instrument || booking?.rentalType || 'Class',
          bookingStatus: 'CONFIRMED',
          bookingMode: 'hourly'
        });
      });
    });

    const dedupeKey = (slot) => `${String(slot?.startTime || '')}|${String(slot?.endTime || '')}|${String(slot?.rentalType || '')}`;
    const mergedBookingsMap = new Map();
    [...bookings, ...classLessonSlots].forEach((slot) => {
      mergedBookingsMap.set(dedupeKey(slot), slot);
    });
    const mergedBookings = Array.from(mergedBookingsMap.values());

    // Get all blocked times for the date
    const blockedTimes = await BlockedTime.find({
      date: { $gte: dayStart, $lte: dayEnd }
    }).select('startTime endTime reason');

    res.json({
      success: true,
      date: formatDateAsYmdInIst(date),
      bookings: mergedBookings,
      blockedTimes
    });
  } catch (error) {
    console.error('Get availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching availability'
    });
  }
});

// @route   GET /api/bookings/my-bookings
// @desc    Get user's bookings
// @access  Private
router.get('/my-bookings', protect, async (req, res) => {
  try {
    const bookings = await Booking.find({ userId: req.user._id })
      .sort({ date: -1, startTime: -1 });

    res.json({
      success: true,
      count: bookings.length,
      bookings
    });
  } catch (error) {
    console.error('Get my bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching bookings'
    });
  }
});

// @route   GET /api/bookings/settings
// @desc    Get public booking settings (rental types and available booking modes)
// @access  Public (no auth required)
router.get('/settings', async (req, res) => {
  try {
    const settings = await AdminSettings.getSettings();
    const rentalTypes = Array.isArray(settings?.rentalTypes) ? settings.rentalTypes : [];
    const bookingModes = deriveAvailableBookingModes(rentalTypes);
    
    res.json({
      success: true,
      settings: {
        rentalTypes,
        bookingCategoryBindings: settings.bookingCategoryBindings || { pairs: [] },
        bookingModes,
        gstConfig: settings.gstConfig || { enabled: false, rate: 0.18, displayName: 'GST' },
        classConfig: normalizeClassConfig(settings)
      }
    });
  } catch (error) {
    console.error('Get public settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching settings'
    });
  }
});

// @route   GET /api/bookings/instagram-embeds
// @desc    Get Instagram embed URLs for homepage
// @access  Public (no auth required)
router.get('/instagram-embeds', async (req, res) => {
  try {
    const settings = await AdminSettings.getSettings();
    const embeds = Array.isArray(settings?.instagramEmbeds) ? settings.instagramEmbeds : [];
    const sorted = [...embeds].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    res.json({ success: true, embeds: sorted });
  } catch (error) {
    console.error('Get instagram embeds error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching embeds' });
  }
});

// @route   GET /api/bookings/payment-info
// @desc    Get public payment information (UPI details)
// @access  Public (no auth required)
router.get('/payment-info', async (req, res) => {
  try {
    const settings = await AdminSettings.getSettings();
    
    res.json({
      success: true,
      paymentInfo: {
        upiId: settings.upiId || 'Not configured',
        upiName: getDisplayUpiName(settings),
        // Don't expose other sensitive admin settings
      }
    });
  } catch (error) {
    console.error('Get payment info error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching payment info'
    });
  }
});

// @route   GET /api/bookings/:id
// @desc    Get single booking
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('userId', 'name email');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if user owns the booking or is admin
    if (booking.userId._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this booking'
      });
    }

    res.json({
      success: true,
      booking
    });
  } catch (error) {
    console.error('Get booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching booking'
    });
  }
});

// @route   POST /api/bookings/:id/class-lessons/:lessonId/request-slot
// @desc    Student requests a specific date/time within their lesson's week
// @access  Private
router.post('/:id/class-lessons/:lessonId/request-slot', protect, async (req, res) => {
    try {
      const { id, lessonId } = req.params;
      const { proposedDate, proposedStartTime, withdraw } = req.body || {};

      const [booking, settings] = await Promise.all([
        Booking.findById(id),
        AdminSettings.getSettings()
      ]);

      if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
      if (String(booking.userId) !== String(req.user._id)) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
      }
      if (!booking.classSession?.isClassBooking) {
        return res.status(400).json({ success: false, message: 'Not a class booking' });
      }

      const lessons = Array.isArray(booking.classSession.lessons) ? booking.classSession.lessons : [];
      const lesson = lessons.find((entry) => String(entry?._id) === String(lessonId));
      if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });

      const currentStatus = String(lesson.status || '').toUpperCase();
      if (currentStatus === 'COMPLETED') return res.status(400).json({ success: false, message: 'Lesson already completed' });
      if (currentStatus === 'CANCELLED') return res.status(400).json({ success: false, message: 'Lesson is cancelled' });

      // Withdraw a pending request
      if (withdraw) {
        if (lesson.slotRequest && String(lesson.slotRequest.status || '') === 'PENDING') {
          lesson.slotRequest.status = 'NONE';
          lesson.slotRequest.requestedAt = null;
          booking.markModified('classSession');
          await booking.save();
        }
        return res.json({ success: true, message: 'Slot request withdrawn' });
      }

      // Validate proposed date is within same week as scheduledDate
      const scheduledD = lesson.scheduledDate ? new Date(lesson.scheduledDate) : null;
      const proposedD = parseDateOnlyToStartOfDay(proposedDate);
      if (!proposedD) return res.status(400).json({ success: false, message: 'Invalid date format. Use YYYY-MM-DD.' });

      if (scheduledD && !Number.isNaN(scheduledD.getTime())) {
        const getMonday = (d) => { const day = new Date(d); const dow = day.getDay(); const diff = (dow === 0 ? -6 : 1 - dow); day.setDate(day.getDate() + diff); day.setHours(0,0,0,0); return day; };
        const weekStart = getMonday(scheduledD);
        const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6); weekEnd.setHours(23,59,59,999);
        if (proposedD < weekStart || proposedD > weekEnd) {
          return res.status(400).json({ success: false, message: 'Proposed date must be within the same week as the scheduled lesson' });
        }
      }

      const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
      const startTime = String(proposedStartTime || '').trim();
      if (!timePattern.test(startTime)) return res.status(400).json({ success: false, message: 'Invalid start time. Use HH:mm.' });

      const sessionDurationHours = Math.max(1, Number(settings?.classConfig?.sessionDurationHours || 1));
      const startMins = startTime.split(':').reduce((h, m, i) => i === 0 ? Number(m) * 60 : h + Number(m), 0);
      const endMins = startMins + sessionDurationHours * 60;
      const endTime = `${String(Math.floor(endMins / 60) % 24).padStart(2, '0')}:${String(endMins % 60).padStart(2, '0')}`;

      lesson.slotRequest = {
        proposedDate: proposedD,
        proposedStartTime: startTime,
        proposedEndTime: endTime,
        requestedAt: new Date(),
        status: 'PENDING',
        respondedAt: null,
        responseNote: ''
      };

      booking.markModified('classSession');
      await booking.save();

      // Notify user and admin of new slot request
      const proposedDateLabel = proposedD.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
      const formatTime12 = (t) => { const [h, m] = String(t || '00:00').split(':').map(Number); const suf = h >= 12 ? 'PM' : 'AM'; return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suf}`; };
      const classItem = booking.classSession?.selectedClassItemName || booking.classSession?.instrument || 'Music Class';

      try {
        await sendEmail({
          to: req.user.email,
          subject: 'Slot Request Submitted - JamRoom',
          html: `
            <h2>Slot Request Received</h2>
            <p>Hi ${req.user.name},</p>
            <p>Your slot request has been submitted and is awaiting admin approval.</p>
            <h3>Requested Slot:</h3>
            <ul>
              <li><strong>Class:</strong> ${classItem}</li>
              <li><strong>Date:</strong> ${proposedDateLabel}</li>
              <li><strong>Time:</strong> ${formatTime12(startTime)} – ${formatTime12(endTime)}</li>
            </ul>
            <p>You will receive a confirmation email once the slot is approved.</p>
          `
        });
      } catch (emailError) {
        console.log('Slot request user email failed:', emailError.message);
      }

      try {
        const adminSettings = settings;
        const adminEmails = Array.isArray(adminSettings?.adminEmails) ? adminSettings.adminEmails : [];
        for (const adminEmail of adminEmails) {
          await sendEmail({
            to: adminEmail,
            subject: 'New Class Slot Request - JamRoom',
            html: `
              <h2>New Class Slot Request</h2>
              <p>A student has submitted a slot request requiring your approval.</p>
              <h3>Details:</h3>
              <ul>
                <li><strong>Student:</strong> ${req.user.name} (${req.user.email})</li>
                <li><strong>Class:</strong> ${classItem}</li>
                <li><strong>Requested Date:</strong> ${proposedDateLabel}</li>
                <li><strong>Requested Time:</strong> ${formatTime12(startTime)} – ${formatTime12(endTime)}</li>
              </ul>
              <p>Please review and approve or reject this slot request in the admin panel.</p>
            `
          });
        }
      } catch (emailError) {
        console.log('Slot request admin email failed:', emailError.message);
      }

      res.json({ success: true, message: 'Slot request submitted. Awaiting admin approval.', booking });
    } catch (error) {
      console.error('Request slot error:', error);
      res.status(500).json({ success: false, message: 'Server error submitting slot request' });
    }
  });

  // @route   PUT /api/bookings/:id/cancel
  // @desc    Cancel a booking
  // @access  Private
  router.put('/:id/cancel', protect, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if user owns the booking
    if (booking.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to cancel this booking'
      });
    }

    // Check if booking can be cancelled
    if (booking.bookingStatus === 'CANCELLED') {
      return res.status(400).json({
        success: false,
        message: 'Booking is already cancelled'
      });
    }

    const wasConfirmedBefore = booking.bookingStatus === 'CONFIRMED';

    booking.bookingStatus = 'CANCELLED';
    if (wasConfirmedBefore) {
      if (!booking.calendarUid) {
        booking.calendarUid = buildBookingCalendarUid(booking._id);
      }
      booking.calendarSequence = Math.max(0, Number(booking.calendarSequence || 0)) + 1;
    }

    await booking.save();

    const displayDate = formatDateLongInIst(booking.date);

    const isPerday = booking.bookingMode === 'perday';
    const perdayRangeText = (booking.perDayStartDate && booking.perDayEndDate)
      ? `${formatDateShortInIst(booking.perDayStartDate)} ${formatTime12Hour(booking.startTime)} to ${formatDateShortInIst(booking.perDayEndDate)} ${formatTime12Hour(booking.endTime)} (${booking.perDayDays || 1} day(s))`
      : displayDate;

    let cancellationInvite = null;
    let settings = null;
    let adminCancellationEmails = [];
    if (wasConfirmedBefore) {
      settings = await AdminSettings.getSettings();

      const normalizedUserEmail = String(booking.userEmail || '').trim().toLowerCase();
      const dedupe = new Set();
      adminCancellationEmails = Array.isArray(settings?.adminEmails)
        ? settings.adminEmails
          .map((email) => String(email || '').trim())
          .filter((email) => {
            if (!email || !isValidEmail(email)) return false;
            const normalized = email.toLowerCase();
            if (normalized === normalizedUserEmail || dedupe.has(normalized)) return false;
            dedupe.add(normalized);
            return true;
          })
        : [];

      cancellationInvite = generateCalendarInvite({
        title: `${settings.studioName || 'Swar JamRoom'} Booking - ${booking.rentalType}`,
        description: `Booking cancelled for ${booking.userName}${booking.bandName ? ` (${booking.bandName})` : ''}`,
        location: settings.studioAddress || 'Zen Business Center - 202, Bhumkar Chowk Rd, above Cafe Coffee Day, Shankar Kalat Nagar, Wakad, Pune, Pimpri-Chinchwad, Maharashtra 411057',
        startDate: formatDateAsYmdInIst(new Date(booking.date)),
        startTime: booking.startTime,
        endTime: booking.endTime,
        attendees: [booking.userEmail, ...adminCancellationEmails],
        studioName: settings.studioName || 'Swar JamRoom',
        uid: booking.calendarUid,
        sequence: booking.calendarSequence,
        method: 'CANCEL',
        status: 'CANCELLED'
      });
    }

    // Send cancellation email to customer
    try {
      await sendEmail({
        to: req.user.email,
        subject: 'Booking Cancelled - JamRoom',
        html: `
          <h2>Booking Cancelled</h2>
          <p>Hi ${req.user.name},</p>
          <p>Your booking has been cancelled.</p>
          <h3>Cancelled Booking Details:</h3>
          <ul>
            ${isPerday
              ? `<li><strong>Per-day Range:</strong> ${perdayRangeText}</li>`
              : `<li><strong>Date:</strong> ${displayDate}</li>
                 <li><strong>Time:</strong> ${formatTimeRange12Hour(booking.startTime, booking.endTime)}</li>`
            }
            <li><strong>Rental Type:</strong> ${booking.rentalType}</li>
          </ul>
          ${cancellationInvite ? '<p>A cancellation calendar invite is attached to remove this slot from your calendar.</p>' : ''}
          <p>If you paid for this booking, please contact us for a refund.</p>
        `,
        attachments: cancellationInvite
          ? [{
              filename: 'booking-cancelled.ics',
              content: cancellationInvite,
              contentType: 'text/calendar; charset=utf-8; method=CANCEL'
            }]
          : []
      });
    } catch (emailError) {
      console.log('Cancellation email failed:', emailError.message);
    }

    // Send cancellation notifications to admin/staff recipients.
    if (cancellationInvite && adminCancellationEmails.length > 0) {
      const studioName = settings?.studioName || 'Swar JamRoom';

      for (const recipientEmail of adminCancellationEmails) {
        try {
          await sendEmail({
            to: recipientEmail,
            subject: `Booking Cancelled - ${studioName}`,
            html: `
              <h2>Booking Cancelled</h2>
              <p>A confirmed booking has been cancelled by the customer.</p>
              <ul>
                <li><strong>User:</strong> ${booking.userName} (${booking.userEmail})</li>
                <li><strong>Date:</strong> ${displayDate}</li>
                <li><strong>Time:</strong> ${formatTimeRange12Hour(booking.startTime, booking.endTime)}</li>
                <li><strong>Rental Type:</strong> ${booking.rentalType}</li>
                <li><strong>Booking ID:</strong> ${booking._id}</li>
              </ul>
              <p>The attached cancellation invite removes the slot from calendar apps.</p>
            `,
            attachments: [{
              filename: 'booking-cancelled.ics',
              content: cancellationInvite,
              contentType: 'text/calendar; charset=utf-8; method=CANCEL'
            }]
          });
        } catch (emailError) {
          console.log(`Admin/staff cancellation email failed for ${recipientEmail}:`, emailError.message);
        }
      }
    }

    res.json({
      success: true,
      message: 'Booking cancelled successfully',
      booking
    });
  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error cancelling booking'
    });
  }
});

// @route   GET /api/bookings/:id/download-pdf
// @desc    Download booking PDF for user
// @access  Private (user must own the booking)
router.get('/:id/download-pdf', protect, async (req, res) => {
  try {
    console.log('User PDF download requested for booking:', req.params.id);
    console.log('User making request:', req.user?.email);
    
    // Import bill generator with optimized download function
    const { generateBillForDownloadWithFilename } = require('../utils/billGenerator');
    
    const booking = await Booking.findById(req.params.id).populate('userId');
    
    if (!booking) {
      console.log('Booking not found:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    console.log('Booking found:', booking.userName, booking.userEmail);

    // Check if user owns the booking or is admin
    if (booking.userId._id.toString() !== req.user.id && req.user.role !== 'admin') {
      console.log('Access denied for user:', req.user.email, 'to booking:', req.params.id);
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Generate PDF bill and filename with single database call
    console.log('Starting PDF generation for environment:', process.env.NODE_ENV);
    console.log('VERCEL environment:', process.env.VERCEL);
    console.log('Available memory:', process.memoryUsage());
    
    const { pdfBuffer, filename } = await generateBillForDownloadWithFilename(booking);
    
    console.log('User PDF generated successfully, size:', pdfBuffer.length, 'filename:', filename);
    
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
    console.error('Download PDF error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code
    });
    
    // Return more specific error message in development
    const isDevelopment = process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'development';
    
    res.status(500).json({
      success: false,
      message: 'Server error generating PDF',
      ...(isDevelopment && { error: error.message, stack: error.stack })
    });
  }
});

module.exports = router;
