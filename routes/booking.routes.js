const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Slot = require('../models/Slot');
const User = require('../models/User');
const AdminSettings = require('../models/AdminSettings');
const { protect } = require('../middleware/auth');
const { sendEmail } = require('../utils/email');
const { generateCalendarInvite } = require('../utils/calendar');

// @route   POST /api/bookings
// @desc    Create a new booking
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const { slotId, rentalType, bandName, notes } = req.body;

    if (!slotId || !rentalType) {
      return res.status(400).json({
        success: false,
        message: 'Please provide slotId and rentalType'
      });
    }

    // Check if slot exists and is available
    const slot = await Slot.findById(slotId);
    if (!slot) {
      return res.status(404).json({
        success: false,
        message: 'Slot not found'
      });
    }

    if (slot.isBlocked) {
      return res.status(400).json({
        success: false,
        message: 'This slot is blocked'
      });
    }

    // Check if slot is already booked
    const existingBooking = await Booking.findOne({
      slotId,
      bookingStatus: { $in: ['PENDING', 'CONFIRMED'] }
    });

    if (existingBooking) {
      return res.status(400).json({
        success: false,
        message: 'This slot is already booked'
      });
    }

    // Get pricing from admin settings
    const settings = await AdminSettings.getSettings();
    const rentalTypeInfo = settings.rentalTypes.find(rt => rt.name === rentalType);
    const price = rentalTypeInfo ? rentalTypeInfo.basePrice : 500;

    // Create booking
    const booking = await Booking.create({
      userId: req.user._id,
      slotId,
      rentalType,
      price,
      userName: req.user.name,
      userEmail: req.user.email,
      bandName,
      notes,
      paymentStatus: 'PENDING',
      bookingStatus: 'PENDING'
    });

    // Populate slot details
    await booking.populate('slotId');

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
            <li><strong>Date:</strong> ${slot.date}</li>
            <li><strong>Time:</strong> ${slot.startTime} - ${slot.endTime}</li>
            <li><strong>Rental Type:</strong> ${rentalType}</li>
            <li><strong>Price:</strong> ₹${price}</li>
            <li><strong>Status:</strong> PENDING</li>
          </ul>
          <h3>Payment Details:</h3>
          <p><strong>UPI ID:</strong> ${settings.upiId}</p>
          <p>Please complete the payment and wait for admin approval.</p>
          <p>You will receive a confirmation email once approved.</p>
        `
      });
    } catch (emailError) {
      console.log('Booking confirmation email failed:', emailError.message);
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
              <li><strong>Date:</strong> ${slot.date}</li>
              <li><strong>Time:</strong> ${slot.startTime} - ${slot.endTime}</li>
              <li><strong>Rental Type:</strong> ${rentalType}</li>
              <li><strong>Price:</strong> ₹${price}</li>
              ${bandName ? `<li><strong>Band Name:</strong> ${bandName}</li>` : ''}
            </ul>
            <p>Please review and approve/reject this booking in the admin panel.</p>
          `
        });
      }
    } catch (emailError) {
      console.log('Admin notification email failed:', emailError.message);
    }

    res.status(201).json({
      success: true,
      message: 'Booking created successfully. Pending admin approval.',
      booking,
      upiDetails: {
        upiId: settings.upiId,
        upiName: settings.upiName,
        amount: price
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

// @route   GET /api/bookings/my-bookings
// @desc    Get user's bookings
// @access  Private
router.get('/my-bookings', protect, async (req, res) => {
  try {
    const bookings = await Booking.find({ userId: req.user._id })
      .populate('slotId')
      .sort({ createdAt: -1 });

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

// @route   GET /api/bookings/:id
// @desc    Get single booking
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('slotId')
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
    const booking = await Booking.findById(req.params.id).populate('slotId');

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
            <li><strong>Date:</strong> ${booking.slotId.date}</li>
            <li><strong>Time:</strong> ${booking.slotId.startTime} - ${booking.slotId.endTime}</li>
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

module.exports = router;
