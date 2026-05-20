const mongoose = require('mongoose');

const openEventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Event title is required'],
    trim: true,
    maxlength: 120
  },
  description: {
    type: String,
    trim: true,
    default: '',
    maxlength: 1000
  },
  quickFacts: {
    type: String,
    trim: true,
    default: '',
    maxlength: 1200
  },
  notes: {
    type: String,
    trim: true,
    default: '',
    maxlength: 1500
  },
  date: {
    type: String,
    required: [true, 'Date is required'],
    match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format']
  },
  startTime: {
    type: String,
    required: [true, 'Start time is required'],
    match: [/^([01]\d|2[0-3]):([0-5]\d)$/, 'Start time must be in HH:MM format']
  },
  endTime: {
    type: String,
    required: [true, 'End time is required'],
    match: [/^([01]\d|2[0-3]):([0-5]\d)$/, 'End time must be in HH:MM format']
  },
  slotDuration: {
    type: Number,
    default: 10,
    min: 10,
    max: 10
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'cancelled'],
    default: 'draft'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  cancelledAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

openEventSchema.index({ date: 1, status: 1 });

openEventSchema.methods.getSlotCount = function getSlotCount() {
  const toMinutes = (timeValue) => {
    const [hourPart, minutePart] = String(timeValue || '').split(':');
    const hours = Number(hourPart);
    const minutes = Number(minutePart);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
    return (hours * 60) + minutes;
  };

  const diff = toMinutes(this.endTime) - toMinutes(this.startTime);
  if (diff <= 0) return 0;
  return Math.floor(diff / this.slotDuration);
};

module.exports = mongoose.model('OpenEvent', openEventSchema);
