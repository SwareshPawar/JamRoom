const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
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

    const bookings = await Booking.find(query)
      .populate('slotId')
      .populate('userId', 'name email')
      .sort({ createdAt: -1 });

    // Filter by date if needed
    let filteredBookings = bookings;
    if (date) {
      filteredBookings = bookings.filter(b => b.slotId.date === date);
    } else if (startDate && endDate) {
      filteredBookings = bookings.filter(b => 
        b.slotId.date >= startDate && b.slotId.date <= endDate
      );
    }

    res.json({
      success: true,
      count: filteredBookings.length,
      bookings: filteredBookings
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
      .populate('slotId')
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

    // Generate calendar invite
    const calendarInvite = generateCalendarInvite({
      title: `JamRoom Booking - ${booking.rentalType}`,
      description: `Booking confirmed for ${booking.userName}${booking.bandName ? ` (${booking.bandName})` : ''}`,
      location: 'JamRoom Studio',
      startDate: booking.slotId.date,
      startTime: booking.slotId.startTime,
      endTime: booking.slotId.endTime,
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
            <li><strong>Date:</strong> ${booking.slotId.date}</li>
            <li><strong>Time:</strong> ${booking.slotId.startTime} - ${booking.slotId.endTime}</li>
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
              <li><strong>Date:</strong> ${booking.slotId.date}</li>
              <li><strong>Time:</strong> ${booking.slotId.startTime} - ${booking.slotId.endTime}</li>
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
      .populate('slotId')
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
            <li><strong>Date:</strong> ${booking.slotId.date}</li>
            <li><strong>Time:</strong> ${booking.slotId.startTime} - ${booking.slotId.endTime}</li>
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

module.exports = router;
