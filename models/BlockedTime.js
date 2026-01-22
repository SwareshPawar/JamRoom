const mongoose = require('mongoose');

const blockedTimeSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: [true, 'Date is required']
  },
  startTime: {
    type: String,
    required: [true, 'Start time is required'],
    match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)']
  },
  endTime: {
    type: String,
    required: [true, 'End time is required'],
    match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)']
  },
  reason: {
    type: String,
    trim: true,
    default: 'Blocked by admin'
  },
  blockedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for efficient queries
blockedTimeSchema.index({ date: 1, startTime: 1 });
blockedTimeSchema.index({ date: 1 });

module.exports = mongoose.model('BlockedTime', blockedTimeSchema);
