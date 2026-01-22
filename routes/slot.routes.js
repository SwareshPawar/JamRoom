const express = require('express');
const router = express.Router();
const Slot = require('../models/Slot');
const Booking = require('../models/Booking');
const { protect } = require('../middleware/auth');
const { isAdmin } = require('../middleware/admin');

// @route   GET /api/slots
// @desc    Get available slots
// @access  Public
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;

    let query = { isBlocked: false };

    if (date) {
      query.date = date;
    } else if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    }

    const slots = await Slot.find(query).sort({ date: 1, startTime: 1 });

    // Check which slots are already booked
    const slotsWithBookings = await Promise.all(
      slots.map(async (slot) => {
        // Check for confirmed bookings (slots are available if only pending)
        const confirmedBooking = await Booking.findOne({
          slotId: slot._id,
          bookingStatus: 'CONFIRMED'
        });

        // Also get pending bookings for reference
        const pendingBookings = await Booking.find({
          slotId: slot._id,
          bookingStatus: 'PENDING'
        }).countDocuments();

        return {
          ...slot.toObject(),
          isBooked: !!confirmedBooking,
          bookingId: confirmedBooking?._id,
          pendingBookings
        };
      })
    );

    res.json({
      success: true,
      count: slotsWithBookings.length,
      slots: slotsWithBookings
    });
  } catch (error) {
    console.error('Get slots error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching slots'
    });
  }
});

// @route   POST /api/slots
// @desc    Create new slot (admin only)
// @access  Private/Admin
router.post('/', protect, isAdmin, async (req, res) => {
  try {
    const { date, startTime, endTime } = req.body;

    if (!date || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'Please provide date, startTime, and endTime'
      });
    }

    // Check if slot already exists
    const existingSlot = await Slot.findOne({ date, startTime });
    if (existingSlot) {
      return res.status(400).json({
        success: false,
        message: 'Slot already exists'
      });
    }

    const slot = await Slot.create({
      date,
      startTime,
      endTime,
      isBlocked: false
    });

    res.status(201).json({
      success: true,
      message: 'Slot created successfully',
      slot
    });
  } catch (error) {
    console.error('Create slot error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating slot'
    });
  }
});

// @route   PUT /api/slots/:id
// @desc    Update slot (admin only)
// @access  Private/Admin
router.put('/:id', protect, isAdmin, async (req, res) => {
  try {
    const { date, startTime, endTime, isBlocked } = req.body;

    const slot = await Slot.findById(req.params.id);

    if (!slot) {
      return res.status(404).json({
        success: false,
        message: 'Slot not found'
      });
    }

    // Check if slot has confirmed bookings before blocking
    if (isBlocked) {
      const confirmedBooking = await Booking.findOne({
        slotId: slot._id,
        bookingStatus: 'CONFIRMED'
      });

      if (confirmedBooking) {
        return res.status(400).json({
          success: false,
          message: 'Cannot block slot with confirmed booking'
        });
      }
    }

    if (date) slot.date = date;
    if (startTime) slot.startTime = startTime;
    if (endTime) slot.endTime = endTime;
    if (typeof isBlocked !== 'undefined') slot.isBlocked = isBlocked;

    await slot.save();

    res.json({
      success: true,
      message: 'Slot updated successfully',
      slot
    });
  } catch (error) {
    console.error('Update slot error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating slot'
    });
  }
});

// @route   DELETE /api/slots/:id
// @desc    Delete slot (admin only)
// @access  Private/Admin
router.delete('/:id', protect, isAdmin, async (req, res) => {
  try {
    const slot = await Slot.findById(req.params.id);

    if (!slot) {
      return res.status(404).json({
        success: false,
        message: 'Slot not found'
      });
    }

    // Check if slot has bookings
    const bookings = await Booking.find({
      slotId: slot._id,
      bookingStatus: { $in: ['PENDING', 'CONFIRMED'] }
    });

    if (bookings.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete slot with active bookings'
      });
    }

    await Slot.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Slot deleted successfully'
    });
  } catch (error) {
    console.error('Delete slot error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting slot'
    });
  }
});

// @route   POST /api/slots/bulk
// @desc    Create multiple slots (admin only)
// @access  Private/Admin
router.post('/bulk', protect, isAdmin, async (req, res) => {
  try {
    const { dates, startTime, endTime, slotDuration } = req.body;

    if (!dates || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'Please provide dates, startTime, and endTime'
      });
    }

    const duration = slotDuration || 60; // Default 60 minutes
    const slots = [];

    for (const date of dates) {
      let currentTime = startTime;
      const endHour = parseInt(endTime.split(':')[0]);
      
      while (parseInt(currentTime.split(':')[0]) < endHour) {
        const startHour = parseInt(currentTime.split(':')[0]);
        const nextHour = startHour + (duration / 60);
        const slotEndTime = `${String(nextHour).padStart(2, '0')}:00`;

        // Check if slot doesn't exist
        const existing = await Slot.findOne({ date, startTime: currentTime });
        
        if (!existing) {
          slots.push({
            date,
            startTime: currentTime,
            endTime: slotEndTime
          });
        }

        currentTime = slotEndTime;
      }
    }

    if (slots.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'All slots already exist'
      });
    }

    const createdSlots = await Slot.insertMany(slots);

    res.status(201).json({
      success: true,
      message: `${createdSlots.length} slots created successfully`,
      count: createdSlots.length,
      slots: createdSlots
    });
  } catch (error) {
    console.error('Bulk create slots error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating slots'
    });
  }
});

module.exports = router;
