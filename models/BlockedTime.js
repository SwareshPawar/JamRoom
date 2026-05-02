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
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for efficient queries
blockedTimeSchema.index({ date: 1, startTime: 1 });
blockedTimeSchema.index({ date: 1 });
blockedTimeSchema.index({ isDeleted: 1, deletedAt: -1 });

const shouldIncludeDeleted = (query) => {
  const options = query?.getOptions ? query.getOptions() : (query?.options || {});
  const mongooseOptions = query?.mongooseOptions ? query.mongooseOptions() : {};
  return Boolean(options?.includeDeleted || mongooseOptions?.includeDeleted || query?.options?.includeDeleted);
};

blockedTimeSchema.pre(/^find/, function(next) {
  if (!shouldIncludeDeleted(this)) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

blockedTimeSchema.pre('countDocuments', function(next) {
  if (!shouldIncludeDeleted(this)) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

module.exports = mongoose.model('BlockedTime', blockedTimeSchema);
