const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required']
  },
  bookingMode: {
    type: String,
    enum: ['hourly', 'perday'],
    default: 'hourly'
  },
  date: {
    type: Date,
    required: [true, 'Date is required']
  },
  startTime: {
    type: String,
    required: [function() { return this.bookingMode !== 'perday'; }, 'Start time is required'],
    match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)']
  },
  endTime: {
    type: String,
    required: [function() { return this.bookingMode !== 'perday'; }, 'End time is required'],
    match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)']
  },
  duration: {
    type: Number,
    required: [function() { return this.bookingMode !== 'perday'; }, 'Duration is required'],
    min: [1, 'Duration must be at least 1 hour']
  },
  perDayStartDate: {
    type: Date
  },
  perDayEndDate: {
    type: Date
  },
  perDayDays: {
    type: Number,
    min: 1,
    default: 1
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
    category: {
      type: String,
      default: ''
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
    },
    rentalType: {
      type: String,
      enum: ['inhouse', 'perday', 'persession', 'pertrack'],
      default: 'inhouse'
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
  priceAdjustmentType: {
    type: String,
    enum: ['none', 'discount', 'surcharge'],
    default: 'none'
  },
  priceAdjustmentAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  priceAdjustmentValue: {
    type: Number,
    default: 0
  },
  priceAdjustmentNote: {
    type: String,
    trim: true,
    default: ''
  },
  paymentStatus: {
    type: String,
    enum: ['PENDING', 'PARTIAL', 'PAID', 'REFUNDED'],
    default: 'PENDING'
  },
  amountPaid: {
    type: Number,
    default: 0,
    min: 0
  },
  paymentMode: {
    type: String,
    enum: ['UPI', 'CASH', 'OTHER', ''],
    default: ''
  },
  paymentNote: {
    type: String,
    trim: true,
    default: ''
  },
  bookingStatus: {
    type: String,
    enum: ['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED'],
    default: 'PENDING'
  },
  calendarUid: {
    type: String,
    trim: true,
    default: ''
  },
  calendarSequence: {
    type: Number,
    default: 0,
    min: 0
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
  classSession: {
    isClassBooking: {
      type: Boolean,
      default: false
    },
    location: {
      type: String,
      trim: true,
      default: ''
    },
    instrument: {
      type: String,
      trim: true,
      default: ''
    },
    classMonth: {
      type: String,
      trim: true,
      default: ''
    },
    monthlyFee: {
      type: Number,
      min: 0,
      default: 0
    },
    classesPerMonth: {
      type: Number,
      min: 0,
      default: 0
    },
    classNumberInMonth: {
      type: Number,
      min: 0,
      default: 0
    },
    classesRemainingAfterBooking: {
      type: Number,
      min: 0,
      default: 0
    },
    monthlyFeeDueNow: {
      type: Number,
      min: 0,
      default: 0
    },
    planMonths: {
      type: Number,
      min: 1,
      default: 1
    },
    weeksPerMonthWindow: {
      type: Number,
      min: 1,
      default: 5
    },
    planStartDate: {
      type: Date,
      default: null
    },
    planEndDate: {
      type: Date,
      default: null
    },
    totalClassesPlanned: {
      type: Number,
      min: 0,
      default: 0
    },
    completedClassesCount: {
      type: Number,
      min: 0,
      default: 0
    },
    selectedClassItemName: {
      type: String,
      trim: true,
      default: ''
    },
    preferredWeekday: {
      type: String,
      trim: true,
      default: ''
    },
    preferredStartTime: {
      type: String,
      trim: true,
      default: ''
    },
    preferredEndTime: {
      type: String,
      trim: true,
      default: ''
    },
    totalFeeBeforeDiscount: {
      type: Number,
      min: 0,
      default: 0
    },
    discountAmount: {
      type: Number,
      min: 0,
      default: 0
    },
    totalFeeAfterDiscount: {
      type: Number,
      min: 0,
      default: 0
    },
    lessons: [{
      weekNumber: {
        type: Number,
        min: 1,
        default: 1
      },
      classNumber: {
        type: Number,
        min: 1,
        default: 1
      },
      scheduledDate: {
        type: Date,
        default: null
      },
      scheduledStartTime: {
        type: String,
        trim: true,
        default: ''
      },
      scheduledEndTime: {
        type: String,
        trim: true,
        default: ''
      },
      status: {
        type: String,
        enum: ['SCHEDULED', 'COMPLETED', 'CANCELLED'],
        default: 'SCHEDULED'
      },
      completedAt: {
        type: Date,
        default: null
      },
      completedDate: {
        type: Date,
        default: null
      },
      completedStartTime: {
        type: String,
        trim: true,
        default: ''
      },
      completedEndTime: {
        type: String,
        trim: true,
        default: ''
      },
      notes: {
        type: String,
        trim: true,
        default: ''
      },
      details: {
        type: String,
        trim: true,
        default: ''
      },
      slotRequest: {
        proposedDate: { type: Date, default: null },
        proposedStartTime: { type: String, trim: true, default: '' },
        proposedEndTime: { type: String, trim: true, default: '' },
        requestedAt: { type: Date, default: null },
        status: { type: String, enum: ['NONE', 'PENDING', 'APPROVED', 'REJECTED'], default: 'NONE' },
        respondedAt: { type: Date, default: null },
        responseNote: { type: String, trim: true, default: '' }
      },
      completedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
      }
    }]
  },
  isOpenSession: {
    type: Boolean,
    default: false
  },
  openSession: {
    caption: {
      type: String,
      trim: true,
      default: ''
    },
    mediaUrl: {
      type: String,
      trim: true,
      default: ''
    },
    mediaType: {
      type: String,
      enum: ['youtube', 'instagram', ''],
      default: ''
    },
    hiddenByAdmin: {
      type: Boolean,
      default: false
    },
    comments: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      firstName: {
        type: String,
        trim: true,
        required: true
      },
      text: {
        type: String,
        trim: true,
        required: true
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    }],
    presenceMarkers: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      firstName: {
        type: String,
        trim: true,
        required: true
      },
      markedAt: {
        type: Date,
        default: Date.now
      }
    }]
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
bookingSchema.index({ isOpenSession: 1, bookingStatus: 1, date: 1 });
bookingSchema.index({ bookingMode: 1, perDayStartDate: 1, perDayEndDate: 1 });
bookingSchema.index({ userId: 1, 'classSession.classMonth': 1, 'classSession.isClassBooking': 1, bookingStatus: 1 });
bookingSchema.index({ isDeleted: 1, deletedAt: -1 });

const shouldIncludeDeleted = (query) => {
  const options = query?.getOptions ? query.getOptions() : (query?.options || {});
  const mongooseOptions = query?.mongooseOptions ? query.mongooseOptions() : {};
  return Boolean(options?.includeDeleted || mongooseOptions?.includeDeleted || query?.options?.includeDeleted);
};

bookingSchema.pre(/^find/, function(next) {
  if (!shouldIncludeDeleted(this)) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

bookingSchema.pre('countDocuments', function(next) {
  if (!shouldIncludeDeleted(this)) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

// Update updatedAt on save
bookingSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Booking', bookingSchema);
