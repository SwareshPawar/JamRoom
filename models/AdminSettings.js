const mongoose = require('mongoose');

const adminSettingsSchema = new mongoose.Schema({
  rentalTypes: [{
    name: {
      type: String,
      required: true
    },
    description: {
      type: String
    },
    basePrice: {
      type: Number,
      required: true,
      min: 0
    },
    // Indicates if base price is always charged when category is selected
    alwaysChargeBase: {
      type: Boolean,
      default: true
    },
    // Sub-items for categories like "Synths", "Guitars" with individual pricing
    subItems: [{
      name: {
        type: String,
        required: true
      },
      description: {
        type: String
      },
      price: {
        type: Number,
        required: true,
        min: 0
      },
      // Rental type: 'inhouse' (tied to jamroom duration) or 'perday' (independent)
      rentalType: {
        type: String,
        enum: ['inhouse', 'perday'],
        default: 'inhouse'
      },
      // Per-day price (only used when rentalType is 'perday')
      perdayPrice: {
        type: Number,
        min: 0,
        default: 0
      }
    }]
  }],
  prices: {
    hourlyRate: {
      type: Number,
      default: 500
    },
    instrumentsRate: {
      type: Number,
      default: 300
    },
    soundSystemRate: {
      type: Number,
      default: 400
    }
  },
  upiId: {
    type: String,
    default: 'swareshpawar@okicici'
  },
  upiName: {
    type: String,
    default: 'Swar JamRoom & Music Studio (SwarJRS)'
  },
  adminEmails: [{
    type: String,
    lowercase: true,
    trim: true
  }],
  // WhatsApp Notification Settings
  whatsappNotifications: {
    enabled: {
      type: Boolean,
      default: true
    },
    // Business number (primary admin)
    businessNumber: {
      type: String,
      default: '+919172706306'
    },
    // Additional notification numbers
    notificationNumbers: [{
      number: {
        type: String,
        required: true,
        trim: true
      },
      role: {
        type: String,
        required: true,
        trim: true // e.g., 'Sound Engineer', 'Maintenance', 'Manager', etc.
      },
      notifications: {
        bookingRequests: {
          type: Boolean,
          default: true
        },
        bookingConfirmations: {
          type: Boolean,
          default: true
        },
        paymentUpdates: {
          type: Boolean,
          default: false
        },
        cancellations: {
          type: Boolean,
          default: true
        }
      }
    }],
    // Notification preferences for business number
    businessNotifications: {
      bookingRequests: {
        type: Boolean,
        default: true
      },
      bookingConfirmations: {
        type: Boolean,
        default: true
      },
      paymentUpdates: {
        type: Boolean,
        default: true
      },
      cancellations: {
        type: Boolean,
        default: true
      }
    }
  },
  studioName: {
    type: String,
    default: 'Swar JamRoom & Music Studio'
  },
  studioAddress: {
    type: String,
    default: 'Swar Jam Room and Music Studio - SwarJRS, Zen Business Center - 202, Bhumkar Chowk Rd, above Cafe Coffee Day, Shankar Kalat Nagar, Wakad, Pune, Pimpri-Chinchwad, Maharashtra 411057'
  },
  studioPhone: {
    type: String,
    default: '+91 9172706306'
  },
  businessHours: {
    startTime: {
      type: String,
      default: '09:00'
    },
    endTime: {
      type: String,
      default: '22:00'
    }
  },
  slotDuration: {
    type: Number,
    default: 60 // minutes
  },
  // GST Configuration
  gstConfig: {
    enabled: {
      type: Boolean,
      default: false // Default to disabled (no GST)
    },
    rate: {
      type: Number,
      default: 0.18, // 18% GST
      min: 0,
      max: 1
    },
    displayName: {
      type: String,
      default: 'GST'
    }
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Ensure only one settings document exists
adminSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  
  if (!settings) {
    // Create default settings
    settings = await this.create({
      rentalTypes: [
        { name: 'JamRoom', description: 'Basic jam room rental', basePrice: 500 },
        { name: 'Instruments', description: 'Instrument rental only', basePrice: 300 },
        { name: 'Sound System', description: 'Sound system rental', basePrice: 400 },
        { name: 'JamRoom + Instruments', description: 'Room with instruments', basePrice: 700 },
        { name: 'Full Package', description: 'Everything included', basePrice: 1000 }
      ],
      adminEmails: ['admin@jamroom.com'],
      whatsappNotifications: {
        enabled: true,
        businessNumber: '+919172706306',
        notificationNumbers: [
          {
            number: '+919970011855',
            role: 'Admin Staff',
            notifications: {
              bookingRequests: true,
              bookingConfirmations: true,
              paymentUpdates: true,
              cancellations: true
            }
          },
          {
            number: '+919876543210',
            role: 'Sound Engineer',
            notifications: {
              bookingRequests: true,
              bookingConfirmations: true,
              paymentUpdates: false,
              cancellations: true
            }
          },
          {
            number: '+919876543211',
            role: 'Maintenance Person',
            notifications: {
              bookingRequests: true,
              bookingConfirmations: true,
              paymentUpdates: false,
              cancellations: true
            }
          }
        ],
        businessNotifications: {
          bookingRequests: true,
          bookingConfirmations: true,
          paymentUpdates: true,
          cancellations: true
        }
      }
    });
  }
  
  return settings;
};

adminSettingsSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('AdminSettings', adminSettingsSchema);
