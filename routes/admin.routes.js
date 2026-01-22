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

    if (booking.bookingStatus === 'CONFIRMED') {
      return res.status(400).json({
        success: false,
        message: 'Booking is already confirmed'
      });
    }

    booking.bookingStatus = 'CONFIRMED';
    booking.paymentStatus = 'PAID';
    await booking.save();

    const settings = await AdminSettings.getSettings();

    const displayDate = booking.date.toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Generate calendar invite
    const calendarInvite = generateCalendarInvite({
      title: `JamRoom Booking - ${booking.rentalType}`,
      description: `Booking confirmed for ${booking.userName}${booking.bandName ? ` (${booking.bandName})` : ''}`,
      location: 'JamRoom Studio',
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
      .populate('slotId')
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
    const { rentalTypes, prices, upiId, upiName, adminEmails, businessHours, slotDuration } = req.body;

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
