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

// Compound index for efficient queries
slotSchema.index({ date: 1, startTime: 1 }, { unique: true });
slotSchema.index({ isBlocked: 1 });
slotSchema.index({ isDeleted: 1, deletedAt: -1 });

const shouldIncludeDeleted = (query) => {
  const options = query?.getOptions ? query.getOptions() : (query?.options || {});
  const mongooseOptions = query?.mongooseOptions ? query.mongooseOptions() : {};
  return Boolean(options?.includeDeleted || mongooseOptions?.includeDeleted || query?.options?.includeDeleted);
};

slotSchema.pre(/^find/, function(next) {
  if (!shouldIncludeDeleted(this)) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

slotSchema.pre('countDocuments', function(next) {
  if (!shouldIncludeDeleted(this)) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

module.exports = mongoose.model('Slot', slotSchema);
