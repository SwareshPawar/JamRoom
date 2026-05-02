/**
 * Admin Stats & Debug Routes
 * Handles: revenue analytics, dashboard stats, debug endpoints
 */

const express = require('express');
const router = express.Router();
const Booking = require('../../models/Booking');
const AdminSettings = require('../../models/AdminSettings');
const { protect } = require('../../middleware/auth');
const { isAdmin } = require('../../middleware/admin');
const { computeCollectedAmount } = require('../../utils/adminHelpers');

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
// @desc    Debug settings values
// @access  Private/Admin
router.get('/debug-settings', protect, isAdmin, async (req, res) => {
  try {
    const settings = await AdminSettings.getSettings();
    res.json({
      success: true,
      settings: {
        studioName: settings.studioName,
        studioAddress: settings.studioAddress,
        adminEmails: settings.adminEmails
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// @route   GET /api/admin/revenue
// @desc    Get revenue analytics with filtering
// @access  Private/Admin
router.get('/revenue', protect, isAdmin, async (req, res) => {
  try {
    const { filter, startDate, endDate, year, month, week } = req.query;
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

    res.json({
      success: true,
      revenue: {
        totalRevenue,
        totalBookings,
        avgBookingValue: Math.round(avgBookingValue),
        revenueByType,
        bookingsByType,
        revenueByDate
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
    const totalBookings = await Booking.countDocuments();
    const pendingBookings = await Booking.countDocuments({ bookingStatus: 'PENDING' });
    const confirmedBookings = await Booking.countDocuments({ bookingStatus: 'CONFIRMED' });
    const confirmedPaymentBookings = await Booking.find({ bookingStatus: 'CONFIRMED' }).select('price paymentStatus amountPaid');

    const statsTotals = confirmedPaymentBookings.reduce((acc, booking) => {
      const collected = computeCollectedAmount({
        totalAmount: booking.price,
        paymentStatus: booking.paymentStatus,
        amountPaid: booking.amountPaid
      });
      const due = Math.max(0, Number(booking.price || 0) - collected);

      acc.totalRevenue += collected;
      if (due > 0) {
        acc.totalUnpaidAmount += due;
      }

      return acc;
    }, { totalRevenue: 0, totalUnpaidAmount: 0 });

    const recentBookings = await Booking.find()
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      success: true,
      stats: {
        totalBookings,
        pendingBookings,
        confirmedBookings,
        totalRevenue: statsTotals.totalRevenue,
        totalUnpaidAmount: statsTotals.totalUnpaidAmount,
        recentBookings
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching statistics' });
  }
});

module.exports = router;
