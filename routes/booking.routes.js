const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const BlockedTime = require('../models/BlockedTime');
const User = require('../models/User');
const AdminSettings = require('../models/AdminSettings');
const { protect } = require('../middleware/auth');
const { sendEmail } = require('../utils/email');
const { generateCalendarInvite } = require('../utils/calendar');
const { generateBill } = require('../utils/billGenerator');
const { 
  sendBookingRequestNotifications, 
  sendCustomerBookingRequestWhatsApp 
} = require('../utils/whatsapp');

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
      const rentalType = String(subItem?.rentalType || 'inhouse').toLowerCase() === 'perday' ? 'perday' : 'hourly';
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
      perDayDays
    } = req.body;

    const normalizedMode = String(bookingMode).toLowerCase() === 'perday' ? 'perday' : 'hourly';
    const effectiveStartTime = normalizedMode === 'perday'
      ? String(perDayPickupTime || startTime || '')
      : String(startTime || '');
    const effectiveEndTime = normalizedMode === 'perday'
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

      const normalizedRentalTypeRaw = String(rental.rentalType || 'inhouse').toLowerCase();
      const rentalTypeValue = normalizedRentalTypeRaw === 'perday'
        ? 'perday'
        : normalizedRentalTypeRaw === 'persession'
          ? 'persession'
          : 'inhouse';
      if (normalizedMode === 'perday' && rentalTypeValue !== 'perday' && rentalTypeValue !== 'persession') {
        return res.status(400).json({
          success: false,
          message: 'Per-day booking can include only per-day or per-session rental items'
        });
      }

      if (normalizedMode === 'hourly' && rentalTypeValue === 'perday') {
        return res.status(400).json({
          success: false,
          message: 'Hourly booking can include only in-house or per-session rental items'
        });
      }
    }

    const parsedDuration = Number(duration);
    const durationForPricing = normalizedMode === 'hourly' ? parsedDuration : 1;

    // Validate duration for hourly mode
    if (normalizedMode === 'hourly' && parsedDuration < 1) {
      return res.status(400).json({
        success: false,
        message: 'Duration must be at least 1 hour'
      });
    }

    // Convert date(s) to start of day
    const bookingDate = new Date(normalizedMode === 'perday' ? perDayStartDate : date);
    bookingDate.setHours(0, 0, 0, 0);

    let perDayStart = null;
    let perDayEnd = null;
    let computedPerDayDays = 1;
    let computedPerDayHours = 24;

    if (normalizedMode === 'perday') {
      const perDayStartDateTime = parseDateTime(perDayStartDate, effectiveStartTime);
      const perDayEndDateTime = parseDateTime(perDayEndDate, effectiveEndTime);

      perDayStart = new Date(perDayStartDate);
      perDayEnd = new Date(perDayEndDate);

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

      perDayStart.setHours(0, 0, 0, 0);
      perDayEnd.setHours(0, 0, 0, 0);

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
      // Check for conflicts with existing bookings (only CONFIRMED bookings block slots)
      const existingBookings = await Booking.find({
        date: bookingDate,
        bookingStatus: 'CONFIRMED',
        ...buildHourlySlotModeFilter()
      });

      for (const booking of existingBookings) {
        if (checkTimeConflict(effectiveStartTime, effectiveEndTime, booking.startTime, booking.endTime)) {
          return res.status(400).json({
            success: false,
            message: `Time conflict with existing booking (${booking.startTime} - ${booking.endTime})`
          });
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
            message: `This time slot is blocked by admin (${blocked.startTime} - ${blocked.endTime})`
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
      rentals.forEach((rental) => {
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

    // Get admin settings for UPI details and GST configuration
    const settings = await AdminSettings.getSettings();
    const resolvedUpiName = getDisplayUpiName(settings);
    
    // Validate and recalculate totals based on admin settings
    let calculatedSubtotal = 0;
    rentals.forEach((rental) => {
      const normalizedRentalTypeRaw = String(rental?.rentalType || 'inhouse').toLowerCase();
      const rentalType = normalizedRentalTypeRaw === 'perday'
        ? 'perday'
        : normalizedRentalTypeRaw === 'persession'
          ? 'persession'
          : 'inhouse';
      const itemPrice = Number(rental?.price || 0);
      const itemQuantity = Math.max(1, Number(rental?.quantity || 1));

      if (normalizedMode === 'perday') {
        if (rentalType === 'persession') {
          calculatedSubtotal += itemPrice * itemQuantity;
        } else {
          calculatedSubtotal += itemPrice * itemQuantity * computedPerDayDays;
        }
      } else if (rentalType === 'persession') {
        calculatedSubtotal += itemPrice * itemQuantity;
      } else if (rentalType === 'perday') {
        calculatedSubtotal += itemPrice * itemQuantity;
      } else {
        calculatedSubtotal += itemPrice * itemQuantity * durationForPricing;
      }
    });

    if (Number.isFinite(Number(subtotal)) && Number(subtotal) > 0) {
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
    const rentalTypeSummary = deriveDynamicBookingLabel(rentals, rentalType);

    // Create booking with multiple rentals
    const booking = await Booking.create({
      userId: req.user._id,
      bookingMode: normalizedMode,
      date: bookingDate,
      startTime: effectiveStartTime,
      endTime: effectiveEndTime,
      duration: normalizedMode === 'perday' ? computedPerDayHours : parsedDuration,
      perDayStartDate: normalizedMode === 'perday' ? perDayStart : undefined,
      perDayEndDate: normalizedMode === 'perday' ? perDayEnd : undefined,
      perDayDays: normalizedMode === 'perday' ? computedPerDayDays : 1,
      rentalType: rentalTypeSummary, // Legacy field
      rentals: rentals, // New multiple rentals array
      subtotal: calculatedSubtotal,
      taxAmount: calculatedTaxAmount,
      price: calculatedTotalAmount, // Total amount including tax
      userName: req.user.name,
      userEmail: req.user.email,
      userMobile: req.user.mobile,
      bandName,
      notes,
      paymentStatus: 'PENDING',
      bookingStatus: 'PENDING'
    });

    // Format date for display
    const displayDate = bookingDate.toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const perDayDateLabel = normalizedMode === 'perday'
      ? `${perDayStart.toLocaleDateString('en-IN')} ${formatTime12Hour(effectiveStartTime)} to ${perDayEnd.toLocaleDateString('en-IN')} ${formatTime12Hour(effectiveEndTime)} (${computedPerDayDays} day(s))`
      : null;

    // Create rentals summary for email with correct per-day pricing
    const rentalsSummary = rentals.map(rental => {
      let itemTotal;
      if (normalizedMode === 'perday' || rental.rentalType === 'perday') {
        // Per-day rentals: use per-day price and selected day count.
        const perdayPrice = rental.perdayPrice || rental.price;
        const days = normalizedMode === 'perday' ? computedPerDayDays : 1;
        itemTotal = perdayPrice * rental.quantity * days;
        return `<li>${rental.name} × ${rental.quantity} × ${days} day(s) - ₹${itemTotal}</li>`;
      } else if (String(rental.rentalType || '').toLowerCase() === 'persession') {
        itemTotal = rental.price * rental.quantity;
        return `<li>${rental.name} × ${rental.quantity} (Per session) - ₹${itemTotal}</li>`;
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
          <p><strong>Amount:</strong> ₹${totalAmount || subtotal}</p>
          <p>Please complete the payment and wait for admin approval.</p>
          <p>You will receive a confirmation email once approved.</p>
        `
      });
    } catch (emailError) {
      console.log('Booking confirmation email failed:', emailError.message);
    }

    // Send WhatsApp confirmation to customer if mobile provided and opted in
    if (req.user.mobile && req.user.whatsappNotifications?.enabled && req.user.whatsappNotifications?.verified) {
      try {
        await sendCustomerBookingRequestWhatsApp(req.user.mobile, {
          userName: req.user.name,
          date: displayDate,
          startTime: effectiveStartTime,
          endTime: effectiveEndTime,
          duration: normalizedMode === 'perday' ? computedPerDayHours : duration,
          totalAmount: calculatedTotalAmount,
          upiId: settings.upiId,
          upiName: resolvedUpiName
        });
        console.log('Customer booking WhatsApp sent to:', req.user.mobile);
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
      await sendBookingRequestNotifications({
        userName: req.user.name,
        userEmail: req.user.email,
        userMobile: req.user.mobile,
        date: normalizedMode === 'perday' ? perDayDateLabel : displayDate,
        startTime: effectiveStartTime,
        endTime: effectiveEndTime,
        totalAmount: calculatedTotalAmount,
        bandName
      }, settings.whatsappNotifications);
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
    const date = new Date(req.params.date);
    date.setHours(0, 0, 0, 0);
    const dayStart = new Date(date);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    // Public availability: only confirmed bookings are visible and block slots.
    const bookings = await Booking.find({
      date: { $gte: dayStart, $lte: dayEnd },
      bookingStatus: 'CONFIRMED',
      ...buildHourlySlotModeFilter()
    }).select('startTime endTime rentalType bookingStatus bookingMode');

    // Get all blocked times for the date
    const blockedTimes = await BlockedTime.find({
      date: { $gte: dayStart, $lte: dayEnd }
    }).select('startTime endTime reason');

    res.json({
      success: true,
      date: date.toISOString().split('T')[0],
      bookings,
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
        gstConfig: settings.gstConfig || { enabled: false, rate: 0.18, displayName: 'GST' }
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

    booking.bookingStatus = 'CANCELLED';
    await booking.save();

    const displayDate = booking.date.toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const isPerday = booking.bookingMode === 'perday';
    const perdayRangeText = (booking.perDayStartDate && booking.perDayEndDate)
      ? `${new Date(booking.perDayStartDate).toLocaleDateString('en-IN')} ${formatTime12Hour(booking.startTime)} to ${new Date(booking.perDayEndDate).toLocaleDateString('en-IN')} ${formatTime12Hour(booking.endTime)} (${booking.perDayDays || 1} day(s))`
      : displayDate;

    // Send cancellation email
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
          <p>If you paid for this booking, please contact us for a refund.</p>
        `
      });
    } catch (emailError) {
      console.log('Cancellation email failed:', emailError.message);
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
