const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const BlockedTime = require('../models/BlockedTime');
const User = require('../models/User');
const AdminSettings = require('../models/AdminSettings');
const { protect } = require('../middleware/auth');
const { isAdmin } = require('../middleware/admin');
const { sendEmail } = require('../utils/email');
const { generateCalendarInvite } = require('../utils/calendar');

// @route   GET /api/admin/revenue
// @desc    Get revenue analytics with filtering
// @access  Private/Admin
router.get('/revenue', protect, isAdmin, async (req, res) => {
  try {
    const { filter, startDate, endDate, year, month, week } = req.query;
    let query = { bookingStatus: 'CONFIRMED', paymentStatus: 'PAID' };
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
          // Current week
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
          // Current month
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
          // Current year
          dateRange = {
            $gte: new Date(now.getFullYear(), 0, 1),
            $lt: new Date(now.getFullYear() + 1, 0, 1)
          };
        }
        break;
      case 'range':
        if (startDate && endDate) {
          dateRange = {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
          };
        }
        break;
      default:
        // All time - no date filter
        break;
    }

    if (Object.keys(dateRange).length > 0) {
      query.date = dateRange;
    }

    const bookings = await Booking.find(query)
      .populate('userId', 'name email')
      .sort({ date: -1, startTime: -1 });

    // Calculate revenue analytics
    const totalRevenue = bookings.reduce((sum, booking) => sum + booking.price, 0);
    const totalBookings = bookings.length;
    const avgBookingValue = totalBookings > 0 ? totalRevenue / totalBookings : 0;

    // Group by rental type
    const revenueByType = {};
    const bookingsByType = {};
    bookings.forEach(booking => {
      if (!revenueByType[booking.rentalType]) {
        revenueByType[booking.rentalType] = 0;
        bookingsByType[booking.rentalType] = 0;
      }
      revenueByType[booking.rentalType] += booking.price;
      bookingsByType[booking.rentalType] += 1;
    });

    // Group by date for trend analysis
    const revenueByDate = {};
    bookings.forEach(booking => {
      const dateKey = booking.date.toISOString().split('T')[0];
      if (!revenueByDate[dateKey]) {
        revenueByDate[dateKey] = 0;
      }
      revenueByDate[dateKey] += booking.price;
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
        price: booking.price,
        bandName: booking.bandName,
        createdAt: booking.createdAt
      }))
    });
  } catch (error) {
    console.error('Get revenue error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching revenue data'
    });
  }
});

// @route   GET /api/admin/bookings/calendar
// @desc    Get bookings formatted for calendar view
// @access  Private/Admin
router.get('/bookings/calendar', protect, isAdmin, async (req, res) => {
  try {
    const { month, year } = req.query;
    let startDate = new Date();
    let endDate = new Date();
    
    if (month && year) {
      startDate = new Date(parseInt(year), parseInt(month), 1);
      endDate = new Date(parseInt(year), parseInt(month) + 1, 0);
    } else {
      // Default to current month
      startDate.setDate(1);
      endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
    }
    
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    const bookings = await Booking.find({
      date: { $gte: startDate, $lte: endDate },
      bookingStatus: { $in: ['PENDING', 'CONFIRMED'] }
    }).populate('userId', 'name email').sort({ date: 1, startTime: 1 });

    // Format bookings for calendar
    const calendarEvents = bookings.map(booking => ({
      id: booking._id,
      title: `${booking.userName} - ${booking.rentalType}`,
      start: `${booking.date.toISOString().split('T')[0]}T${booking.startTime}:00`,
      end: `${booking.date.toISOString().split('T')[0]}T${booking.endTime}:00`,
      backgroundColor: booking.bookingStatus === 'CONFIRMED' ? '#28a745' : '#ffc107',
      borderColor: booking.bookingStatus === 'CONFIRMED' ? '#1e7e34' : '#d39e00',
      textColor: booking.bookingStatus === 'CONFIRMED' ? 'white' : 'black',
      extendedProps: {
        bookingId: booking._id,
        userName: booking.userName,
        userEmail: booking.userEmail,
        bandName: booking.bandName,
        rentalType: booking.rentalType,
        price: booking.price,
        status: booking.bookingStatus,
        paymentStatus: booking.paymentStatus,
        notes: booking.notes
      }
    }));

    res.json({
      success: true,
      events: calendarEvents
    });
  } catch (error) {
    console.error('Get calendar bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching calendar data'
    });
  }
});

// @route   GET /api/admin/bookings
// @desc    Get all bookings
// @access  Private/Admin
router.get('/bookings', protect, isAdmin, async (req, res) => {
  try {
    const { status, date, startDate, endDate } = req.query;

    let query = {};

    if (status) {
      query.bookingStatus = status;
    }

    if (date) {
      const queryDate = new Date(date);
      queryDate.setHours(0, 0, 0, 0);
      query.date = queryDate;
    } else if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.date = { $gte: start, $lte: end };
    }

    const bookings = await Booking.find(query)
      .populate('userId', 'name email')
      .sort({ date: -1, startTime: -1 });

    res.json({
      success: true,
      count: bookings.length,
      bookings
    });
  } catch (error) {
    console.error('Get all bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching bookings'
    });
  }
});

// @route   PUT /api/admin/bookings/:id/approve
// @desc    Approve a booking
// @access  Private/Admin
router.put('/bookings/:id/approve', protect, isAdmin, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('userId');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if this is an old booking without the new schema
    if (!booking.startTime || !booking.endTime || !booking.duration || 
        !booking.userEmail || !booking.userName || !booking.rentalType || !booking.userId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot approve old booking. Please create a new booking with the updated system.'
      });
    }

    if (booking.bookingStatus === 'CONFIRMED') {
      return res.status(400).json({
        success: false,
        message: 'Booking is already confirmed'
      });
    }

    booking.bookingStatus = 'CONFIRMED';
    booking.paymentStatus = 'PAID';
    await booking.save();

    // After confirming this booking, reject overlapping pending bookings
    const timeToMinutes = (time) => {
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 60 + minutes;
    };

    const checkTimeConflict = (start1, end1, start2, end2) => {
      const s1 = timeToMinutes(start1);
      const e1 = timeToMinutes(end1);
      const s2 = timeToMinutes(start2);
      const e2 = timeToMinutes(end2);
      return (s1 < e2 && e1 > s2);
    };

    // Find and reject overlapping pending bookings
    const overlappingBookings = await Booking.find({
      _id: { $ne: booking._id },
      date: booking.date,
      bookingStatus: 'PENDING'
    });

    const rejectedBookings = [];
    for (const pendingBooking of overlappingBookings) {
      if (checkTimeConflict(booking.startTime, booking.endTime, pendingBooking.startTime, pendingBooking.endTime)) {
        pendingBooking.bookingStatus = 'REJECTED';
        await pendingBooking.save();
        rejectedBookings.push(pendingBooking);

        // Send rejection email to user
        try {
          await sendEmail({
            to: pendingBooking.userEmail,
            subject: 'Booking Request Update - JamRoom',
            html: `
              <h2>Booking Request Update</h2>
              <p>Hi ${pendingBooking.userName},</p>
              <p>Unfortunately, your booking request for ${pendingBooking.date.toLocaleDateString('en-IN')} from ${pendingBooking.startTime} to ${pendingBooking.endTime} has been automatically rejected due to a scheduling conflict with another confirmed booking.</p>
              <p>Please feel free to make a new booking request for a different time slot.</p>
              <p>Thank you for your understanding.</p>
            `
          });
        } catch (emailError) {
          console.log('Rejection email failed for booking:', pendingBooking._id);
        }
      }
    }

    const settings = await AdminSettings.getSettings();

    const displayDate = booking.date.toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Generate calendar invite
    const calendarInvite = generateCalendarInvite({
      title: `${settings.studioName || 'JamRoom Studio'} Booking - ${booking.rentalType}`,
      description: `Booking confirmed for ${booking.userName}${booking.bandName ? ` (${booking.bandName})` : ''}`,
      location: `${settings.studioName || 'JamRoom Studio'}${settings.studioAddress ? ', ' + settings.studioAddress : ''}`,
      startDate: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      attendees: [booking.userEmail, ...settings.adminEmails]
    });

    // Send confirmation email to user with calendar invite
    try {
      await sendEmail({
        to: booking.userEmail,
        subject: 'Booking Confirmed - JamRoom',
        html: `
          <h2>🎉 Booking Confirmed!</h2>
          <p>Hi ${booking.userName},</p>
          <p>Great news! Your booking has been confirmed.</p>
          <h3>Booking Details:</h3>
          <ul>
            <li><strong>Date:</strong> ${displayDate}</li>
            <li><strong>Time:</strong> ${booking.startTime} - ${booking.endTime}</li>
            <li><strong>Duration:</strong> ${booking.duration} hour(s)</li>
            <li><strong>Rental Type:</strong> ${booking.rentalType}</li>
            <li><strong>Price:</strong> ₹${booking.price}</li>
            ${booking.bandName ? `<li><strong>Band Name:</strong> ${booking.bandName}</li>` : ''}
          </ul>
          <p>A calendar invite is attached to this email.</p>
          <p>Looking forward to seeing you at JamRoom Studio!</p>
        `,
        attachments: [{
          filename: 'booking.ics',
          content: calendarInvite
        }]
      });
    } catch (emailError) {
      console.log('Confirmation email failed:', emailError.message);
    }

    // Send notification to all admins
    try {
      for (const adminEmail of settings.adminEmails) {
        await sendEmail({
          to: adminEmail,
          subject: 'Booking Approved - JamRoom',
          html: `
            <h2>Booking Approved</h2>
            <p>A booking has been approved by ${req.user.name}.</p>
            <h3>Booking Details:</h3>
            <ul>
              <li><strong>User:</strong> ${booking.userName} (${booking.userEmail})</li>
              <li><strong>Date:</strong> ${displayDate}</li>
              <li><strong>Time:</strong> ${booking.startTime} - ${booking.endTime}</li>
              <li><strong>Duration:</strong> ${booking.duration} hour(s)</li>
              <li><strong>Rental Type:</strong> ${booking.rentalType}</li>
              <li><strong>Price:</strong> ₹${booking.price}</li>
            </ul>
          `,
          attachments: [{
            filename: 'booking.ics',
            content: calendarInvite
          }]
        });
      }
    } catch (emailError) {
      console.log('Admin notification email failed:', emailError.message);
    }

    res.json({
      success: true,
      message: 'Booking approved and confirmation sent',
      booking
    });
  } catch (error) {
    console.error('Approve booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error approving booking'
    });
  }
});

// @route   PUT /api/admin/bookings/:id/reject
// @desc    Reject a booking
// @access  Private/Admin
router.put('/bookings/:id/reject', protect, isAdmin, async (req, res) => {
  try {
    const { reason } = req.body;

    const booking = await Booking.findById(req.params.id)
      .populate('userId');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if this is an old booking without the new schema
    if (!booking.startTime || !booking.endTime || !booking.duration || 
        !booking.userEmail || !booking.userName || !booking.rentalType || !booking.userId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot reject old booking. Please delete it manually from the database.'
      });
    }

    booking.bookingStatus = 'REJECTED';
    if (reason) {
      booking.notes = (booking.notes ? booking.notes + '\n' : '') + `Rejection reason: ${reason}`;
    }
    await booking.save();

    const displayDate = booking.date.toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Send rejection email to user
    try {
      await sendEmail({
        to: booking.userEmail,
        subject: 'Booking Update - JamRoom',
        html: `
          <h2>Booking Update</h2>
          <p>Hi ${booking.userName},</p>
          <p>Unfortunately, your booking request has been declined.</p>
          <h3>Booking Details:</h3>
          <ul>
            <li><strong>Date:</strong> ${displayDate}</li>
            <li><strong>Time:</strong> ${booking.startTime} - ${booking.endTime}</li>
            <li><strong>Rental Type:</strong> ${booking.rentalType}</li>
          </ul>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
          <p>Please contact us if you have any questions or would like to book another slot.</p>
        `
      });
    } catch (emailError) {
      console.log('Rejection email failed:', emailError.message);
    }

    res.json({
      success: true,
      message: 'Booking rejected',
      booking
    });
  } catch (error) {
    console.error('Reject booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error rejecting booking'
    });
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
    const totalRevenue = await Booking.aggregate([
      { $match: { bookingStatus: 'CONFIRMED', paymentStatus: 'PAID' } },
      { $group: { _id: null, total: { $sum: '$price' } } }
    ]);

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
        totalRevenue: totalRevenue[0]?.total || 0,
        recentBookings
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching statistics'
    });
  }
});

// @route   GET /api/admin/settings
// @desc    Get admin settings
// @access  Private/Admin
router.get('/settings', protect, isAdmin, async (req, res) => {
  try {
    const settings = await AdminSettings.getSettings();

    res.json({
      success: true,
      settings
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching settings'
    });
  }
});

// @route   PUT /api/admin/settings
// @desc    Update admin settings
// @access  Private/Admin
router.put('/settings', protect, isAdmin, async (req, res) => {
  try {
    const { rentalTypes, prices, upiId, upiName, adminEmails, businessHours, slotDuration, studioName, studioAddress } = req.body;

    let settings = await AdminSettings.findOne();
    
    if (!settings) {
      settings = await AdminSettings.create(req.body);
    } else {
      if (rentalTypes) settings.rentalTypes = rentalTypes;
      if (prices) settings.prices = prices;
      if (upiId) settings.upiId = upiId;
      if (upiName) settings.upiName = upiName;
      if (adminEmails) settings.adminEmails = adminEmails;
      if (businessHours) settings.businessHours = businessHours;
      if (slotDuration) settings.slotDuration = slotDuration;
      if (studioName) settings.studioName = studioName;
      if (studioAddress) settings.studioAddress = studioAddress;
      
      await settings.save();
    }

    res.json({
      success: true,
      message: 'Settings updated successfully',
      settings
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating settings'
    });
  }
});

// @route   POST /api/admin/make-admin
// @desc    Grant admin privileges to a user
// @access  Private/Admin
router.post('/make-admin', protect, isAdmin, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Please provide user email'
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.role === 'admin') {
      return res.status(400).json({
        success: false,
        message: 'User is already an admin'
      });
    }

    user.role = 'admin';
    await user.save();

    // Add to admin emails in settings
    const settings = await AdminSettings.getSettings();
    if (!settings.adminEmails.includes(email)) {
      settings.adminEmails.push(email);
      await settings.save();
    }

    // Send notification email
    try {
      await sendEmail({
        to: email,
        subject: 'Admin Access Granted - JamRoom',
        html: `
          <h2>Admin Access Granted</h2>
          <p>Hi ${user.name},</p>
          <p>You have been granted admin privileges for JamRoom booking system.</p>
          <p>You can now access the admin panel to manage bookings and settings.</p>
        `
      });
    } catch (emailError) {
      console.log('Admin notification email failed:', emailError.message);
    }

    res.json({
      success: true,
      message: 'Admin privileges granted successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Make admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error granting admin privileges'
    });
  }
});

// @route   POST /api/admin/block-time
// @desc    Block a time range
// @access  Private/Admin
router.post('/block-time', protect, isAdmin, async (req, res) => {
  try {
    const { date, startTime, endTime, reason } = req.body;

    if (!date || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'Please provide date, startTime, and endTime'
      });
    }

    const blockDate = new Date(date);
    blockDate.setHours(0, 0, 0, 0);

    // Check for conflicts with existing bookings
    const conflictBookings = await Booking.find({
      date: blockDate,
      bookingStatus: { $in: ['PENDING', 'CONFIRMED'] }
    });

    const timeToMinutes = (time) => {
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 60 + minutes;
    };

    const checkTimeConflict = (start1, end1, start2, end2) => {
      return (start1 < end2 && end1 > start2);
    };

    for (const booking of conflictBookings) {
      if (checkTimeConflict(startTime, endTime, booking.startTime, booking.endTime)) {
        return res.status(400).json({
          success: false,
          message: `Cannot block: Conflicts with existing booking (${booking.startTime} - ${booking.endTime})`
        });
      }
    }

    const blockedTime = await BlockedTime.create({
      date: blockDate,
      startTime,
      endTime,
      reason: reason || 'Blocked by admin',
      blockedBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: 'Time blocked successfully',
      blockedTime
    });
  } catch (error) {
    console.error('Block time error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error blocking time'
    });
  }
});

// @route   GET /api/admin/blocked-times
// @desc    Get all blocked times
// @access  Private/Admin
router.get('/blocked-times', protect, isAdmin, async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;

    let query = {};

    if (date) {
      const queryDate = new Date(date);
      queryDate.setHours(0, 0, 0, 0);
      query.date = queryDate;
    } else if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.date = { $gte: start, $lte: end };
    }

    const blockedTimes = await BlockedTime.find(query)
      .populate('blockedBy', 'name email')
      .sort({ date: 1, startTime: 1 });

    res.json({
      success: true,
      count: blockedTimes.length,
      blockedTimes
    });
  } catch (error) {
    console.error('Get blocked times error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching blocked times'
    });
  }
});

// @route   DELETE /api/admin/blocked-times/:id
// @desc    Remove a blocked time
// @access  Private/Admin
router.delete('/blocked-times/:id', protect, isAdmin, async (req, res) => {
  try {
    const blockedTime = await BlockedTime.findById(req.params.id);

    if (!blockedTime) {
      return res.status(404).json({
        success: false,
        message: 'Blocked time not found'
      });
    }

    await blockedTime.deleteOne();

    res.json({
      success: true,
      message: 'Blocked time removed successfully'
    });
  } catch (error) {
    console.error('Delete blocked time error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error removing blocked time'
    });
  }
});

module.exports = router;
