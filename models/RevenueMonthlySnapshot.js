const mongoose = require('mongoose');

const revenueMonthlySnapshotSchema = new mongoose.Schema({
  source: {
    type: String,
    enum: ['BOOKING_ROLLUP', 'SYNTHETIC_SPREAD'],
    default: 'BOOKING_ROLLUP',
    required: true
  },
  monthKey: {
    type: String,
    required: true,
    trim: true
  },
  monthLabel: {
    type: String,
    required: true,
    trim: true
  },
  monthStart: {
    type: Date,
    required: true
  },
  monthEnd: {
    type: Date,
    required: true
  },
  collectedRevenue: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  bookingCount: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  meta: {
    mode: {
      type: String,
      trim: true,
      default: ''
    },
    monthsBack: {
      type: Number,
      min: 1,
      default: 0
    }
  },
  generatedAt: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

revenueMonthlySnapshotSchema.index({ source: 1, monthKey: 1 }, { unique: true });
revenueMonthlySnapshotSchema.index({ source: 1, monthStart: 1 });

revenueMonthlySnapshotSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('RevenueMonthlySnapshot', revenueMonthlySnapshotSchema);
