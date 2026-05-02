/**
 * Admin Slot Management Routes
 * Handles: block-time, blocked-times list, delete blocked time
 */

const express = require('express');
const router = express.Router();
const Booking = require('../../models/Booking');
const BlockedTime = require('../../models/BlockedTime');
const { protect } = require('../../middleware/auth');
const { isAdmin } = require('../../middleware/admin');
const { buildHourlySlotModeFilter } = require('../../utils/adminHelpers');

const resolveDeletedFilterMode = (value) => {
  const normalized = String(value || 'active').trim().toLowerCase();
  if (normalized === 'deleted') return 'deleted';
  if (normalized === 'all') return 'all';
  return 'active';
};

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

    // Check for conflicts with existing bookings (only confirmed bookings block slots)
    const conflictBookings = await Booking.find({
      date: blockDate,
      bookingStatus: 'CONFIRMED',
      ...buildHourlySlotModeFilter()
    });

    const checkTimeConflict = (start1, end1, start2, end2) => {
      const timeToMinutes = (time) => {
        const [hours, minutes] = time.split(':').map(Number);
        return hours * 60 + minutes;
      };
      return (timeToMinutes(start1) < timeToMinutes(end2) && timeToMinutes(end1) > timeToMinutes(start2));
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
    const { date, startDate, endDate, deleted } = req.query;
    const deletedFilterMode = resolveDeletedFilterMode(deleted);
    const includeDeleted = deletedFilterMode !== 'active';

    let query = {};

    if (deletedFilterMode === 'deleted') {
      query.isDeleted = true;
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

    const blockedTimes = await BlockedTime.find(query)
      .setOptions({ includeDeleted })
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
// @desc    Soft delete a blocked time
// @access  Private/Admin
router.delete('/blocked-times/:id', protect, isAdmin, async (req, res) => {
  try {
    const blockedTime = await BlockedTime.findById(req.params.id).setOptions({ includeDeleted: true });

    if (!blockedTime) {
      return res.status(404).json({
        success: false,
        message: 'Blocked time not found'
      });
    }

    if (blockedTime.isDeleted === true) {
      return res.status(400).json({
        success: false,
        message: 'Blocked time is already deleted'
      });
    }

    blockedTime.isDeleted = true;
    blockedTime.deletedAt = new Date();
    blockedTime.deletedBy = req.user?._id || null;
    await blockedTime.save();

    res.json({
      success: true,
      message: 'Blocked time moved to deleted records'
    });
  } catch (error) {
    console.error('Delete blocked time error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error removing blocked time'
    });
  }
});

// @route   DELETE /api/admin/blocked-times/:id/permanent
// @desc    Permanently delete a soft-deleted blocked time
// @access  Private/Admin
router.delete('/blocked-times/:id/permanent', protect, isAdmin, async (req, res) => {
  try {
    const blockedTime = await BlockedTime.findOne({
      _id: req.params.id,
      isDeleted: true
    }).setOptions({ includeDeleted: true });

    if (!blockedTime) {
      return res.status(404).json({
        success: false,
        message: 'Deleted blocked time not found'
      });
    }

    const removal = await BlockedTime.deleteOne({ _id: blockedTime._id });
    if ((removal?.deletedCount || 0) < 1) {
      return res.status(500).json({
        success: false,
        message: 'Failed to permanently delete blocked time'
      });
    }

    res.json({
      success: true,
      message: 'Blocked time permanently deleted'
    });
  } catch (error) {
    console.error('Permanent delete blocked time error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error permanently removing blocked time'
    });
  }
});

// @route   PUT /api/admin/blocked-times/:id/restore
// @desc    Restore a soft-deleted blocked time
// @access  Private/Admin
router.put('/blocked-times/:id/restore', protect, isAdmin, async (req, res) => {
  try {
    const blockedTime = await BlockedTime.findOne({
      _id: req.params.id,
      isDeleted: true
    }).setOptions({ includeDeleted: true });

    if (!blockedTime) {
      return res.status(404).json({
        success: false,
        message: 'Deleted blocked time not found'
      });
    }

    blockedTime.isDeleted = false;
    blockedTime.deletedAt = null;
    blockedTime.deletedBy = null;
    await blockedTime.save();

    res.json({
      success: true,
      message: 'Blocked time restored successfully',
      blockedTime
    });
  } catch (error) {
    console.error('Restore blocked time error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error restoring blocked time'
    });
  }
});

module.exports = router;
