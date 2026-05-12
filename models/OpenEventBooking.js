const mongoose = require('mongoose');

const openEventBookingSchema = new mongoose.Schema({
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OpenEvent',
    required: [true, 'Event ID is required']
  },
  slotIndex: {
    type: Number,
    required: [true, 'Slot index is required'],
    min: 0
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required']
  },
  userFirstName: {
    type: String,
    required: [true, 'User first name is required'],
    trim: true
  },
  status: {
    type: String,
    enum: ['confirmed', 'cancelled'],
    default: 'confirmed'
  },
  cancelledAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

openEventBookingSchema.index(
  { eventId: 1, slotIndex: 1 },
  { unique: true, partialFilterExpression: { status: 'confirmed' } }
);
openEventBookingSchema.index(
  { eventId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { status: 'confirmed' } }
);
openEventBookingSchema.index({ eventId: 1, status: 1, slotIndex: 1 });

module.exports = mongoose.model('OpenEventBooking', openEventBookingSchema);
