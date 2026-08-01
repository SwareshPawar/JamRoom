/**
 * Admin Stats & Debug Routes
 * Handles: revenue analytics, dashboard stats, debug endpoints
 */

const express = require('express');
const router = express.Router();
const Booking = require('../../models/Booking');
const AdminSettings = require('../../models/AdminSettings');
const RevenueMonthlySnapshot = require('../../models/RevenueMonthlySnapshot');
const { protect } = require('../../middleware/auth');
const { isAdmin } = require('../../middleware/admin');
const { computeCollectedAmount } = require('../../utils/adminHelpers');

const toMonthKey = (dateValue) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const toMonthLabelFromKey = (monthKey) => {
  const [yearStr, monthStr] = String(monthKey || '').split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return monthKey;

  const monthDate = new Date(year, month - 1, 1);
  if (Number.isNaN(monthDate.getTime())) return monthKey;

  return monthDate.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
};

const buildMonthlyTrendFromBookings = (bookings = []) => {
  const monthMap = new Map();

  (Array.isArray(bookings) ? bookings : []).forEach((booking) => {
    const monthKey = toMonthKey(booking?.date);
    if (!monthKey) return;

    const existing = monthMap.get(monthKey) || {
      key: monthKey,
      label: toMonthLabelFromKey(monthKey),
      amount: 0,
      bookings: 0
    };

    existing.amount += computeCollectedAmount({
      totalAmount: booking.price,
      paymentStatus: booking.paymentStatus,
      amountPaid: booking.amountPaid
    });
    existing.bookings += 1;
    monthMap.set(monthKey, existing);
  });

  return [...monthMap.values()].sort((left, right) => left.key.localeCompare(right.key));
};

const getMonthlyTrendFromSnapshots = async ({ sourceCandidates = [], dateRange = {} }) => {
  const sourceList = Array.isArray(sourceCandidates) && sourceCandidates.length > 0
    ? sourceCandidates
    : ['SYNTHETIC_SPREAD', 'BOOKING_ROLLUP'];

  const monthStartRange = {};
  if (dateRange?.$gte instanceof Date && !Number.isNaN(dateRange.$gte.getTime())) {
    monthStartRange.$gte = dateRange.$gte;
  }
  if (dateRange?.$lt instanceof Date && !Number.isNaN(dateRange.$lt.getTime())) {
    monthStartRange.$lt = dateRange.$lt;
  }
  if (dateRange?.$lte instanceof Date && !Number.isNaN(dateRange.$lte.getTime())) {
    monthStartRange.$lte = dateRange.$lte;
  }

  for (const source of sourceList) {
    const query = { source };
    if (Object.keys(monthStartRange).length > 0) {
      query.monthStart = monthStartRange;
    }

    const rows = await RevenueMonthlySnapshot.find(query)
      .sort({ monthStart: 1 })
      .lean();

    if (!rows.length) {
      continue;
    }

    return {
      source,
      points: rows.map((row) => ({
        key: row.monthKey,
        label: row.monthLabel || toMonthLabelFromKey(row.monthKey),
        amount: Number(row.collectedRevenue || 0),
        bookings: Number(row.bookingCount || 0)
      }))
    };
  }

  return { source: 'NONE', points: [] };
};

const parseTimeToMinutes = (timeValue) => {
  const raw = String(timeValue || '').trim();
  if (!raw) return NaN;
  const match = raw.match(/^([0-1]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return NaN;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return (hours * 60) + minutes;
};

const buildFollowupQueueItem = (booking, todayStart) => {
  if (!booking) return null;

  const bookingStatus = String(booking.bookingStatus || '').toUpperCase();
  const paymentStatus = String(booking.paymentStatus || '').toUpperCase();
  const bookingDate = booking?.date ? new Date(booking.date) : null;
  const perDayStartDate = booking?.perDayStartDate ? new Date(booking.perDayStartDate) : null;
  const perDayEndDate = booking?.perDayEndDate ? new Date(booking.perDayEndDate) : null;
  const referenceDate = perDayStartDate || bookingDate;
  const isFutureDate = referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())
    ? referenceDate >= todayStart
    : false;

  if (!isFutureDate) {
    return null;
  }

  const isConfirmed = bookingStatus === 'CONFIRMED';
  const isUnpaid = paymentStatus === 'PENDING' || paymentStatus === 'PARTIAL';

  let priority = 99;
  let title = 'Needs follow-up';
  let subtitle = 'Review this booking in the manage bookings table.';

  if (!isConfirmed) {
    priority = 1;
    title = 'Not confirmed';
    subtitle = 'This future booking is still awaiting confirmation.';
  } else if (isUnpaid && paymentStatus === 'PARTIAL') {
    priority = 2;
    title = 'Partial payment pending';
    subtitle = 'Follow up with the customer to collect the remaining balance.';
  } else if (isUnpaid && paymentStatus === 'PENDING') {
    priority = 2;
    title = 'Advance payment pending';
    subtitle = 'Upcoming confirmed booking without payment received.';
  } else if (isUnpaid) {
    priority = 2;
    title = 'Payment pending';
    subtitle = 'Confirmed booking still shows pending payment.';
  } else {
    priority = 3;
    title = 'Upcoming booking';
    subtitle = 'Future booking is confirmed and paid.';
  }

  return {
    _id: booking._id,
    userName: booking.userName || booking.userId?.name || 'N/A',
    userEmail: booking.userEmail || booking.userId?.email || '',
    userMobile: booking.userMobile || booking.userId?.mobile || '',
    bookingStatus,
    paymentStatus,
    rentalType: booking.rentalType || 'Booking',
    bookingMode: booking.bookingMode || 'hourly',
    date: booking.date || null,
    startTime: booking.startTime || '',
    endTime: booking.endTime || '',
    duration: Number(booking.duration || 0),
    perDayStartDate: booking.perDayStartDate || null,
    perDayEndDate: booking.perDayEndDate || null,
    perDayDays: Number(booking.perDayDays || 1),
    amountPaid: Number(booking.amountPaid || 0),
    price: Number(booking.price || 0),
    title,
    subtitle,
    priority,
    reasonKey: !isConfirmed
      ? 'NOT_CONFIRMED'
      : (isUnpaid ? 'UNPAID' : 'UPCOMING')
  };
};

// @route   GET /api/admin/debug-pdf
// @desc    Debug PDF generation environment (for production troubleshooting)
// @access  Private/Admin
router.get('/debug-pdf', protect, isAdmin, async (req, res) => {
  try {
    const diagnostics = {
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL: process.env.VERCEL,
        VERCEL_ENV: process.env.VERCEL_ENV,
        isServerless: !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL_ENV)
      },
      memory: process.memoryUsage(),
      puppeteer: {
        installed: true,
        chromiumPackage: false
      },
      database: {
        connected: require('mongoose').connection.readyState === 1,
        readyState: require('mongoose').connection.readyState
      },
      timestamp: new Date().toISOString()
    };

    try {
      require('@sparticuz/chromium');
      diagnostics.puppeteer.chromiumPackage = true;
    } catch (e) {
      diagnostics.puppeteer.chromiumPackage = false;
    }

    res.json({ success: true, diagnostics });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Debug failed', error: error.message });
  }
});

// @route   GET /api/admin/debug-settings
// @desc    Get all settings for PDF generation (client + server-side)
// @access  Private/Admin
router.get('/debug-settings', protect, isAdmin, async (req, res) => {
  try {
    const settings = await AdminSettings.getSettings();
    console.log('🔍 /api/admin/debug-settings endpoint - Settings being returned:', {
      studioName: settings?.studioName,
      studioAddress: settings?.studioAddress,
      studioPhone: settings?.studioPhone,
      hasSettings: !!settings,
      settingsKeysCount: Object.keys(settings || {}).length
    });
    // Return full settings object needed for PDF templates
    res.json({
      success: true,
      settings: settings || {}
    });
  } catch (error) {
    console.error('🔴 /api/admin/debug-settings error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// @route   GET /api/admin/revenue
// @desc    Get revenue analytics with filtering
// @access  Private/Admin
router.get('/revenue', protect, isAdmin, async (req, res) => {
  try {
    const { filter, startDate, endDate, year, month, week, trendSource, trendScope } = req.query;
    let query = { bookingStatus: 'CONFIRMED', paymentStatus: { $in: ['PAID', 'PARTIAL'] } };
    let dateRange = {};

    const now = new Date();

    switch (filter) {
      case 'today':
        dateRange = {
          $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          $lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
        };
        break;
      case 'week':
        if (week && year) {
          const firstDay = new Date(year, 0, 1 + (week - 1) * 7);
          const lastDay = new Date(firstDay);
          lastDay.setDate(lastDay.getDate() + 6);
          dateRange = { $gte: firstDay, $lte: lastDay };
        } else {
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() - now.getDay());
          startOfWeek.setHours(0, 0, 0, 0);
          const endOfWeek = new Date(startOfWeek);
          endOfWeek.setDate(endOfWeek.getDate() + 6);
          endOfWeek.setHours(23, 59, 59, 999);
          dateRange = { $gte: startOfWeek, $lte: endOfWeek };
        }
        break;
      case 'month':
        if (month && year) {
          dateRange = {
            $gte: new Date(parseInt(year), parseInt(month), 1),
            $lt: new Date(parseInt(year), parseInt(month) + 1, 1)
          };
        } else {
          dateRange = {
            $gte: new Date(now.getFullYear(), now.getMonth(), 1),
            $lt: new Date(now.getFullYear(), now.getMonth() + 1, 1)
          };
        }
        break;
      case 'last_month': {
        const lmStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lmEnd = new Date(now.getFullYear(), now.getMonth(), 1);
        dateRange = { $gte: lmStart, $lt: lmEnd };
        break;
      }
      case 'last_3_months': {
        const l3Start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        const l3End = new Date(now.getFullYear(), now.getMonth(), 1);
        dateRange = { $gte: l3Start, $lt: l3End };
        break;
      }
      case 'year':
        if (year) {
          dateRange = {
            $gte: new Date(parseInt(year), 0, 1),
            $lt: new Date(parseInt(year) + 1, 0, 1)
          };
        } else {
          dateRange = {
            $gte: new Date(now.getFullYear(), 0, 1),
            $lt: new Date(now.getFullYear() + 1, 0, 1)
          };
        }
        break;
      case 'range':
        if (startDate && endDate) {
          dateRange = { $gte: new Date(startDate), $lte: new Date(endDate) };
        }
        break;
      default:
        break;
    }

    if (Object.keys(dateRange).length > 0) {
      query.date = dateRange;
    }

    const bookings = await Booking.find(query)
      .populate('userId', 'name email')
      .sort({ date: -1, startTime: -1 });

    const totalRevenue = bookings.reduce((sum, booking) => {
      return sum + computeCollectedAmount({
        totalAmount: booking.price,
        paymentStatus: booking.paymentStatus,
        amountPaid: booking.amountPaid
      });
    }, 0);
    const totalBookings = bookings.length;
    const avgBookingValue = totalBookings > 0 ? totalRevenue / totalBookings : 0;

    const revenueByType = {};
    const bookingsByType = {};
    bookings.forEach(booking => {
      if (!revenueByType[booking.rentalType]) {
        revenueByType[booking.rentalType] = 0;
        bookingsByType[booking.rentalType] = 0;
      }
      revenueByType[booking.rentalType] += computeCollectedAmount({
        totalAmount: booking.price,
        paymentStatus: booking.paymentStatus,
        amountPaid: booking.amountPaid
      });
      bookingsByType[booking.rentalType] += 1;
    });

    const revenueByDate = {};
    bookings.forEach(booking => {
      const dateKey = booking.date.toISOString().split('T')[0];
      if (!revenueByDate[dateKey]) {
        revenueByDate[dateKey] = 0;
      }
      revenueByDate[dateKey] += computeCollectedAmount({
        totalAmount: booking.price,
        paymentStatus: booking.paymentStatus,
        amountPaid: booking.amountPaid
      });
    });

    const preferredTrendSources = (() => {
      const normalized = String(trendSource || '').toUpperCase();
      if (normalized === 'LIVE_BOOKINGS') return [];
      if (normalized === 'BOOKING_ROLLUP') return ['BOOKING_ROLLUP', 'SYNTHETIC_SPREAD'];
      if (normalized === 'SYNTHETIC_SPREAD') return ['SYNTHETIC_SPREAD', 'BOOKING_ROLLUP'];
      return ['SYNTHETIC_SPREAD', 'BOOKING_ROLLUP'];
    })();

    const normalizedTrendScope = String(trendScope || 'all').toLowerCase();
    const snapshotDateRange = normalizedTrendScope === 'filtered' ? dateRange : {};

    const snapshotTrend = preferredTrendSources.length > 0
      ? await getMonthlyTrendFromSnapshots({
          sourceCandidates: preferredTrendSources,
          dateRange: snapshotDateRange
        })
      : { source: 'LIVE_BOOKINGS', points: [] };

    const monthlyTrend = snapshotTrend.points.length > 0
      ? snapshotTrend.points
      : buildMonthlyTrendFromBookings(bookings);

    res.json({
      success: true,
      revenue: {
        totalRevenue,
        totalBookings,
        avgBookingValue: Math.round(avgBookingValue),
        revenueByType,
        bookingsByType,
        revenueByDate,
        monthlyTrend,
        monthlyTrendSource: snapshotTrend.points.length > 0 ? snapshotTrend.source : 'LIVE_BOOKINGS'
      },
      bookings: bookings.map(booking => ({
        _id: booking._id,
        userName: booking.userName,
        userEmail: booking.userEmail,
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        duration: booking.duration,
        rentalType: booking.rentalType,
        rentals: booking.rentals,
        subtotal: booking.subtotal,
        taxAmount: booking.taxAmount,
        priceAdjustmentType: booking.priceAdjustmentType,
        priceAdjustmentAmount: booking.priceAdjustmentAmount,
        priceAdjustmentValue: booking.priceAdjustmentValue,
        priceAdjustmentNote: booking.priceAdjustmentNote,
        price: booking.price,
        paymentStatus: booking.paymentStatus,
        amountPaid: booking.amountPaid,
        collectedAmount: computeCollectedAmount({
          totalAmount: booking.price,
          paymentStatus: booking.paymentStatus,
          amountPaid: booking.amountPaid
        }),
        outstandingAmount: Math.max(
          0,
          Number(booking.price || 0) - computeCollectedAmount({
            totalAmount: booking.price,
            paymentStatus: booking.paymentStatus,
            amountPaid: booking.amountPaid
          })
        ),
        bandName: booking.bandName,
        notes: booking.notes,
        createdAt: booking.createdAt
      }))
    });
  } catch (error) {
    console.error('Get revenue error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching revenue data' });
  }
});

// @route   GET /api/admin/stats
// @desc    Get admin statistics
// @access  Private/Admin
router.get('/stats', protect, isAdmin, async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const daysInThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    const [
      totalBookings,
      pendingBookingApprovals,
      confirmedBookings,
      confirmedPaymentBookings,
      pendingSlotApprovalAgg,
      recentBookings,
      followupQueueBookings,
      upcomingSessions,
      cancellations,
      settings
    ] = await Promise.all([
      Booking.countDocuments(),
      Booking.countDocuments({ bookingStatus: 'PENDING' }),
      Booking.countDocuments({ bookingStatus: 'CONFIRMED' }),
      Booking.find({ bookingStatus: 'CONFIRMED' }).select('price paymentStatus amountPaid date duration userId'),
      Booking.aggregate([
        {
          $match: {
            isDeleted: { $ne: true },
            'classSession.lessons.slotRequest.status': 'PENDING'
          }
        },
        {
          $project: {
            pendingSlotApprovals: {
              $size: {
                $filter: {
                  input: { $ifNull: ['$classSession.lessons', []] },
                  as: 'lesson',
                  cond: { $eq: ['$$lesson.slotRequest.status', 'PENDING'] }
                }
              }
            }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$pendingSlotApprovals' }
          }
        }
      ]),
      Booking.find()
        .populate('userId', 'name email')
        .sort({ createdAt: -1 })
        .limit(5),
      Booking.find({
        isDeleted: { $ne: true },
        $and: [
          {
            $or: [
              { date: { $gte: todayStart } },
              { perDayStartDate: { $gte: todayStart } }
            ]
          },
          {
            bookingStatus: { $nin: ['CANCELLED', 'REJECTED'] }
          }
        ]
      })
        .populate('userId', 'name email mobile')
        .select('userName userEmail userMobile bookingStatus paymentStatus rentalType bookingMode date startTime endTime duration perDayStartDate perDayEndDate perDayDays amountPaid price userId')
        .sort({ date: 1, createdAt: -1 })
        .limit(8),
      Booking.countDocuments({ bookingStatus: 'CONFIRMED', date: { $gte: todayStart } }),
      Booking.countDocuments({
        bookingStatus: { $in: ['CANCELLED', 'REJECTED'] },
        date: { $gte: thisMonthStart, $lt: nextMonthStart }
      }),
      AdminSettings.getSettings()
    ]);

    const pendingSlotApprovals = Number(pendingSlotApprovalAgg?.[0]?.total || 0);
    const pendingBookings = pendingBookingApprovals + pendingSlotApprovals;

    const statsTotals = confirmedPaymentBookings.reduce((acc, booking) => {
      const collected = computeCollectedAmount({
        totalAmount: booking.price,
        paymentStatus: booking.paymentStatus,
        amountPaid: booking.amountPaid
      });
      const due = Math.max(0, Number(booking.price || 0) - collected);
      const bookingDate = booking?.date ? new Date(booking.date) : null;
      const bookingDuration = Number(booking?.duration || 0);
      const userId = String(booking?.userId || '');

      acc.totalRevenue += collected;
      if (due > 0) {
        acc.totalUnpaidAmount += due;
      }

      if (userId) {
        const current = acc.customerStats.get(userId) || {
          count: 0,
          firstBookingDate: null,
          hasThisMonthBooking: false
        };

        current.count += 1;
        if (!current.firstBookingDate || (bookingDate && bookingDate < current.firstBookingDate)) {
          current.firstBookingDate = bookingDate;
        }
        if (bookingDate && bookingDate >= thisMonthStart && bookingDate < nextMonthStart) {
          current.hasThisMonthBooking = true;
        }

        acc.customerStats.set(userId, current);
      }

      if (bookingDate && bookingDate >= thisMonthStart && bookingDate < nextMonthStart) {
        acc.thisMonthRevenue += collected;
        acc.thisMonthConfirmedDuration += bookingDuration;
        acc.thisMonthConfirmedCount += 1;
      } else if (bookingDate && bookingDate >= lastMonthStart && bookingDate < thisMonthStart) {
        acc.lastMonthRevenue += collected;
      }

      return acc;
    }, {
      totalRevenue: 0,
      totalUnpaidAmount: 0,
      thisMonthRevenue: 0,
      lastMonthRevenue: 0,
      thisMonthConfirmedDuration: 0,
      thisMonthConfirmedCount: 0,
      customerStats: new Map()
    });

    const startMinutes = parseTimeToMinutes(settings?.businessHours?.startTime || '09:00');
    const endMinutes = parseTimeToMinutes(settings?.businessHours?.endTime || '22:00');
    const operatingMinutesPerDay = Number.isNaN(startMinutes) || Number.isNaN(endMinutes)
      ? 13 * 60
      : Math.max(0, endMinutes - startMinutes);
    const monthlyCapacityHours = (operatingMinutesPerDay / 60) * daysInThisMonth;
    const roomUtilizationPct = monthlyCapacityHours > 0
      ? (statsTotals.thisMonthConfirmedDuration / monthlyCapacityHours) * 100
      : 0;

    const revenueGrowthPct = statsTotals.lastMonthRevenue > 0
      ? ((statsTotals.thisMonthRevenue - statsTotals.lastMonthRevenue) / statsTotals.lastMonthRevenue) * 100
      : (statsTotals.thisMonthRevenue > 0 ? 100 : 0);

    let newCustomers = 0;
    let repeatCustomers = 0;
    statsTotals.customerStats.forEach((customer) => {
      if (customer.count >= 2) {
        repeatCustomers += 1;
      }
      if (customer.firstBookingDate && customer.firstBookingDate >= thisMonthStart && customer.firstBookingDate < nextMonthStart) {
        newCustomers += 1;
      }
    });

    const avgBookingDuration = statsTotals.thisMonthConfirmedCount > 0
      ? statsTotals.thisMonthConfirmedDuration / statsTotals.thisMonthConfirmedCount
      : 0;

    const followupQueue = followupQueueBookings
      .map((booking) => buildFollowupQueueItem(booking, todayStart))
      .filter(Boolean)
      .sort((left, right) => {
        const leftDate = new Date(left.perDayStartDate || left.date || 0);
        const rightDate = new Date(right.perDayStartDate || right.date || 0);
        const leftDateStart = Number.isNaN(leftDate.getTime())
          ? 0
          : new Date(leftDate.getFullYear(), leftDate.getMonth(), leftDate.getDate()).getTime();
        const rightDateStart = Number.isNaN(rightDate.getTime())
          ? 0
          : new Date(rightDate.getFullYear(), rightDate.getMonth(), rightDate.getDate()).getTime();

        if (leftDateStart !== rightDateStart) {
          return leftDateStart - rightDateStart;
        }

        const leftTime = parseTimeToMinutes(left.startTime);
        const rightTime = parseTimeToMinutes(right.startTime);
        const leftTimeMinutes = Number.isNaN(leftTime) ? 0 : leftTime;
        const rightTimeMinutes = Number.isNaN(rightTime) ? 0 : rightTime;

        if (leftTimeMinutes !== rightTimeMinutes) {
          return leftTimeMinutes - rightTimeMinutes;
        }

        return left.priority - right.priority;
      })
      .slice(0, 6);

    res.json({
      success: true,
      stats: {
        totalBookings,
        pendingBookings,
        pendingBookingApprovals,
        pendingSlotApprovals,
        confirmedBookings,
        totalRevenue: statsTotals.totalRevenue,
        thisMonthRevenue: statsTotals.thisMonthRevenue,
        lastMonthRevenue: statsTotals.lastMonthRevenue,
        totalUnpaidAmount: statsTotals.totalUnpaidAmount,
        roomUtilizationPct,
        revenueGrowthPct,
        newCustomers,
        repeatCustomers,
        upcomingSessions,
        cancellations,
        avgBookingDuration,
        recentBookings,
        followupQueue
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching statistics' });
  }
});

module.exports = router;
