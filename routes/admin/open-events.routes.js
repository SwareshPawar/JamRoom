const express = require('express');
const router = express.Router();
const OpenEvent = require('../../models/OpenEvent');
const OpenEventBooking = require('../../models/OpenEventBooking');
const { protect } = require('../../middleware/auth');
const { isAdmin } = require('../../middleware/admin');

const parseTimeToMinutes = (timeValue) => {
  const [hourPart, minutePart] = String(timeValue || '').split(':');
  const hours = Number(hourPart);
  const minutes = Number(minutePart);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return NaN;
  return (hours * 60) + minutes;
};

const formatMinutesToTime = (totalMinutes) => {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const eventSummary = (event, bookingCount = 0) => ({
  id: event._id,
  title: event.title,
  description: event.description,
  date: event.date,
  startTime: event.startTime,
  endTime: event.endTime,
  slotDuration: event.slotDuration,
  slotCount: event.getSlotCount(),
  status: event.status,
  bookingCount,
  createdAt: event.createdAt,
  updatedAt: event.updatedAt
});

router.post('/open-events', protect, isAdmin, async (req, res) => {
  try {
    const { title, description = '', date, startTime, endTime, status = 'draft' } = req.body;

    if (!title || !date || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'title, date, startTime, and endTime are required'
      });
    }

    const startMinutes = parseTimeToMinutes(startTime);
    const endMinutes = parseTimeToMinutes(endTime);

    if (Number.isNaN(startMinutes) || Number.isNaN(endMinutes) || endMinutes <= startMinutes) {
      return res.status(400).json({
        success: false,
        message: 'endTime must be later than startTime'
      });
    }

    const event = await OpenEvent.create({
      title: String(title).trim(),
      description: String(description || '').trim(),
      date,
      startTime,
      endTime,
      status: ['draft', 'published', 'cancelled'].includes(status) ? status : 'draft',
      createdBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: 'Open event created successfully',
      event: eventSummary(event)
    });
  } catch (error) {
    console.error('Create open event error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create open event'
    });
  }
});

router.get('/open-events', protect, isAdmin, async (_req, res) => {
  try {
    const events = await OpenEvent.find().sort({ date: -1, startTime: -1 });

    const eventIds = events.map((event) => event._id);
    const counts = await OpenEventBooking.aggregate([
      { $match: { eventId: { $in: eventIds }, status: 'confirmed' } },
      { $group: { _id: '$eventId', bookingCount: { $sum: 1 } } }
    ]);

    const bookingCountMap = new Map();
    counts.forEach((item) => {
      bookingCountMap.set(String(item._id), item.bookingCount);
    });

    res.json({
      success: true,
      count: events.length,
      events: events.map((event) => eventSummary(event, bookingCountMap.get(String(event._id)) || 0))
    });
  } catch (error) {
    console.error('Admin list open events error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch open events'
    });
  }
});

router.patch('/open-events/:id', protect, isAdmin, async (req, res) => {
  try {
    const allowedFields = ['title', 'description', 'date', 'startTime', 'endTime', 'status'];
    const updates = {};

    allowedFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updates[field] = req.body[field];
      }
    });

    if (Object.prototype.hasOwnProperty.call(updates, 'startTime') || Object.prototype.hasOwnProperty.call(updates, 'endTime')) {
      const current = await OpenEvent.findById(req.params.id);
      if (!current) {
        return res.status(404).json({
          success: false,
          message: 'Open event not found'
        });
      }

      const startTime = updates.startTime || current.startTime;
      const endTime = updates.endTime || current.endTime;
      const startMinutes = parseTimeToMinutes(startTime);
      const endMinutes = parseTimeToMinutes(endTime);
      if (Number.isNaN(startMinutes) || Number.isNaN(endMinutes) || endMinutes <= startMinutes) {
        return res.status(400).json({
          success: false,
          message: 'endTime must be later than startTime'
        });
      }
    }

    const event = await OpenEvent.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Open event not found'
      });
    }

    res.json({
      success: true,
      message: 'Open event updated successfully',
      event: eventSummary(event)
    });
  } catch (error) {
    console.error('Admin update open event error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update open event'
    });
  }
});

router.patch('/open-events/:id/status', protect, isAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['draft', 'published', 'cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }

    const updates = {
      status,
      cancelledAt: status === 'cancelled' ? new Date() : null
    };

    const event = await OpenEvent.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Open event not found'
      });
    }

    res.json({
      success: true,
      message: 'Open event status updated successfully',
      event: eventSummary(event)
    });
  } catch (error) {
    console.error('Admin update open event status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update open event status'
    });
  }
});

router.get('/open-events/:id/bookings', protect, isAdmin, async (req, res) => {
  try {
    const event = await OpenEvent.findById(req.params.id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Open event not found'
      });
    }

    const bookings = await OpenEventBooking.find({
      eventId: event._id,
      status: 'confirmed'
    }).populate('userId', 'name email').sort({ slotIndex: 1, createdAt: 1 });

    const startMinutes = parseTimeToMinutes(event.startTime);

    res.json({
      success: true,
      event: eventSummary(event, bookings.length),
      count: bookings.length,
      bookings: bookings.map((booking) => ({
        id: booking._id,
        slotIndex: booking.slotIndex,
        slotStartTime: formatMinutesToTime(startMinutes + (booking.slotIndex * event.slotDuration)),
        slotEndTime: formatMinutesToTime(startMinutes + ((booking.slotIndex + 1) * event.slotDuration)),
        userId: booking.userId,
        userFirstName: booking.userFirstName,
        userName: String(booking.userId?.name || booking.userFirstName || '').trim(),
        userEmail: String(booking.userId?.email || '').trim(),
        createdAt: booking.createdAt
      }))
    });
  } catch (error) {
    console.error('Admin get open event bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch open event bookings'
    });
  }
});

module.exports = router;
