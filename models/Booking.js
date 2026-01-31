const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required']
  },
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
  duration: {
    type: Number,
    required: [true, 'Duration is required'],
    min: [1, 'Duration must be at least 1 hour']
  },
  // Legacy single rental type (kept for backward compatibility)
  rentalType: {
    type: String,
    default: 'Multiple Items'
  },
  // New multiple rentals structure
  rentals: [{
    name: {
      type: String,
      required: [true, 'Rental name is required']
    },
    description: {
      type: String,
      default: ''
    },
    price: {
      type: Number,
      required: [true, 'Rental price is required'],
      min: 0
    },
    quantity: {
      type: Number,
      default: 1,
      min: 1
    }
  }],
  // Total price for all rentals
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: 0
  },
  // Subtotal before taxes
  subtotal: {
    type: Number,
    required: [true, 'Subtotal is required'],
    min: 0
  },
  // Tax amount (18% GST)
  taxAmount: {
    type: Number,
    required: [true, 'Tax amount is required'],
    min: 0
  },
  paymentStatus: {
    type: String,
    enum: ['PENDING', 'PAID', 'REFUNDED'],
    default: 'PENDING'
  },
  bookingStatus: {
    type: String,
    enum: ['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED'],
    default: 'PENDING'
  },
  paymentReference: {
    type: String,
    trim: true
  },
  userName: {
    type: String,
    required: true
  },
  userEmail: {
    type: String,
    required: true
  },
  userMobile: {
    type: String,
    trim: true
  },
  bandName: {
    type: String,
    trim: true
  },
  notes: {
    type: String,
    trim: true
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

// Indexes for efficient queries
bookingSchema.index({ userId: 1, createdAt: -1 });
bookingSchema.index({ date: 1, startTime: 1 });
bookingSchema.index({ bookingStatus: 1 });
bookingSchema.index({ paymentStatus: 1 });
bookingSchema.index({ date: 1, bookingStatus: 1 });

// Update updatedAt on save
bookingSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Booking', bookingSchema);
