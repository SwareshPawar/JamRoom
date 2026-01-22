const mongoose = require('mongoose');

const slotSchema = new mongoose.Schema({
  date: {
    type: String, // Format: YYYY-MM-DD
    required: [true, 'Date is required']
  },
  startTime: {
    type: String, // Format: HH:MM (24-hour)
    required: [true, 'Start time is required']
  },
  endTime: {
    type: String, // Format: HH:MM (24-hour)
    required: [true, 'End time is required']
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index for efficient queries
slotSchema.index({ date: 1, startTime: 1 }, { unique: true });
slotSchema.index({ isBlocked: 1 });

module.exports = mongoose.model('Slot', slotSchema);
