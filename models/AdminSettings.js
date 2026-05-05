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
    // Category-level rental type controls how all child items are billed.
    rentalType: {
      type: String,
      enum: ['inhouse', 'perday', 'persession', 'pertrack'],
      default: 'inhouse'
    },
    basePrice: {
      type: Number,
      required: true,
      min: 0
    },
    maxQuantity: {
      type: Number,
      min: 1,
      max: 100,
      default: 10
    },
    quantityEnabled: {
      type: Boolean,
      default: false
    },
    deletedAt: {
      type: Date,
      default: null
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
        enum: ['inhouse', 'perday', 'persession', 'pertrack'],
        default: 'inhouse'
      },
      // Per-day price (only used when rentalType is 'perday')
      perdayPrice: {
        type: Number,
        min: 0,
        default: 0
      },
      maxQuantity: {
        type: Number,
        min: 1,
        max: 100,
        default: 10
      },
      quantityEnabled: {
        type: Boolean,
        default: false
      },
      deletedAt: {
        type: Date,
        default: null
      }
    }]
  }],
  savedQuotations: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    rentalTypeLabel: {
      type: String,
      trim: true,
      default: ''
    },
    selectedTypes: [{
      type: String,
      enum: ['inhouse', 'perday', 'persession', 'pertrack']
    }],
    rentals: [{
      name: {
        type: String,
        required: true,
        trim: true
      },
      category: {
        type: String,
        trim: true,
        default: ''
      },
      description: {
        type: String,
        trim: true,
        default: ''
      },
      rentalType: {
        type: String,
        enum: ['inhouse', 'perday', 'persession', 'pertrack'],
        default: 'inhouse'
      },
      quantity: {
        type: Number,
        min: 1,
        max: 100,
        default: 1
      },
      priceSnapshot: {
        type: Number,
        min: 0,
        default: 0
      }
    }],
    schedules: {
      inhouse: {
        date: { type: String, default: '' },
        startTime: { type: String, default: '' },
        endTime: { type: String, default: '' }
      },
      perday: {
        startDate: { type: String, default: '' },
        endDate: { type: String, default: '' },
        pickupTime: { type: String, default: '' },
        returnTime: { type: String, default: '' }
      }
    },
    notes: {
      type: String,
      trim: true,
      default: ''
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    },
    deletedAt: {
      type: Date,
      default: null
    }
  }],
  bookingCategoryBindings: {
    pairs: [{
      leftCategory: {
        type: String,
        trim: true
      },
      rightCategory: {
        type: String,
        trim: true
      },
      leftRentalType: {
        type: String,
        enum: ['inhouse', 'perday', 'persession', 'pertrack'],
        default: 'inhouse'
      },
      rightRentalType: {
        type: String,
        enum: ['inhouse', 'perday', 'persession', 'pertrack'],
        default: 'inhouse'
      },
      deletedAt: {
        type: Date,
        default: null
      }
    }]
  },
  instagramEmbeds: [{
    url: {
      type: String,
      required: true,
      trim: true
    },
    caption: {
      type: String,
      trim: true,
      default: ''
    },
    order: {
      type: Number,
      default: 0
    },
    deletedAt: {
      type: Date,
      default: null
    }
  }],
  upiId: {
    type: String,
    default: 'swareshpawar@okicici'
  },
  upiName: {
    type: String,
    default: 'Swaresh Pawar'
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
      default: '+919970011855'
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
    default: '+919970011855'
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
  classConfig: {
    enabled: {
      type: Boolean,
      default: true
    },
    monthlyFee: {
      type: Number,
      min: 0,
      default: 2000
    },
    classesPerMonth: {
      type: Number,
      min: 1,
      max: 31,
      default: 4
    },
    weeksPerMonthWindow: {
      type: Number,
      min: 1,
      max: 8,
      default: 5
    },
    sessionDurationHours: {
      type: Number,
      min: 1,
      max: 8,
      default: 1
    },
    allowOnlySingleClassItem: {
      type: Boolean,
      default: true
    },
    planOptionsMonths: [{
      type: Number,
      min: 1,
      max: 24
    }],
    multiMonthDiscounts: [{
      months: {
        type: Number,
        min: 1,
        max: 24,
        required: true
      },
      discountPercent: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
      },
      discountAmount: {
        type: Number,
        min: 0,
        default: 0
      }
    }],
    locations: [{
      type: String,
      trim: true
    }],
    categoryKeywords: [{
      type: String,
      trim: true,
      lowercase: true
    }],
    itemKeywords: [{
      type: String,
      trim: true,
      lowercase: true
    }]
  },
  serviceGroupingConfig: {
    defaultGroupKey: {
      type: String,
      trim: true,
      default: 'studio'
    },
    groups: [{
      key: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
      },
      title: {
        type: String,
        required: true,
        trim: true
      },
      subtitle: {
        type: String,
        trim: true,
        default: ''
      },
      icon: {
        type: String,
        trim: true,
        default: ''
      },
      order: {
        type: Number,
        default: 100
      }
    }],
    categoryRules: [{
      groupKey: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
      },
      title: {
        type: String,
        trim: true,
        default: ''
      },
      description: {
        type: String,
        trim: true,
        default: ''
      },
      order: {
        type: Number,
        default: 100
      },
      matchField: {
        type: String,
        enum: ['name', 'category', 'both'],
        default: 'both'
      },
      keywords: [{
        type: String,
        trim: true,
        lowercase: true
      }]
    }]
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
      rentalTypes: [],
      adminEmails: ['admin@jamroom.com'],
      classConfig: {
        enabled: true,
        monthlyFee: 2000,
        classesPerMonth: 4,
        weeksPerMonthWindow: 5,
        sessionDurationHours: 1,
        allowOnlySingleClassItem: true,
        planOptionsMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        multiMonthDiscounts: [
          { months: 2, discountPercent: 5, discountAmount: 0 },
          { months: 3, discountPercent: 5, discountAmount: 0 },
          { months: 4, discountPercent: 10, discountAmount: 0 },
          { months: 5, discountPercent: 10, discountAmount: 0 },
          { months: 6, discountPercent: 10, discountAmount: 0 },
          { months: 7, discountPercent: 12.5, discountAmount: 0 },
          { months: 8, discountPercent: 12.5, discountAmount: 0 },
          { months: 9, discountPercent: 12.5, discountAmount: 0 },
          { months: 10, discountPercent: 15, discountAmount: 0 },
          { months: 11, discountPercent: 15, discountAmount: 0 },
          { months: 12, discountPercent: 15, discountAmount: 0 }
        ],
        locations: ['Wakad Studio', 'Pimple Saudagar Studio'],
        categoryKeywords: ['class', 'guitar class', 'keyboard class', 'music class'],
        itemKeywords: ['guitar class', 'keyboard class', 'guitar lesson', 'keyboard lesson']
      },
      serviceGroupingConfig: {
        defaultGroupKey: 'studio',
        groups: [
          {
            key: 'studio',
            title: 'Studio Usage',
            subtitle: 'Room access, instruments, and in-studio equipment support',
            icon: '🎸',
            order: 10
          },
          {
            key: 'production',
            title: 'Production Services',
            subtitle: 'Composition, arrangement, recording, and creative production support',
            icon: '🎧',
            order: 20
          },
          {
            key: 'finishing',
            title: 'Finishing & Delivery',
            subtitle: 'Mixing, mastering, and final polish for release-ready output',
            icon: '🎼',
            order: 30
          },
          {
            key: 'sound-design',
            title: 'Sound Design',
            subtitle: 'Foley, textures, and custom effects for cinematic or visual work',
            icon: '🎬',
            order: 40
          }
        ],
        categoryRules: [
          {
            groupKey: 'studio',
            title: 'JamRoom Studio',
            description: 'Professional in-studio room usage with monitoring, setup support, and a comfortable recording environment.',
            order: 10,
            matchField: 'name',
            keywords: ['jamroom', 'jam room', 'studio']
          },
          {
            groupKey: 'studio',
            title: 'Bass Guitar',
            description: 'Live bass instrument support for rehearsals, jams, and recording sessions.',
            order: 20,
            matchField: 'both',
            keywords: ['bass guitar']
          },
          {
            groupKey: 'studio',
            title: 'Keyboard',
            description: 'Keyboard setup for composing, rehearsing, and recording melodic parts.',
            order: 30,
            matchField: 'both',
            keywords: ['keyboard', 'piano']
          },
          {
            groupKey: 'studio',
            title: 'Studio Equipment',
            description: 'Studio equipment support prepared for tracking, rehearsal, and live session needs.',
            order: 40,
            matchField: 'both',
            keywords: ['guitar', 'amp', 'drum', 'mic', 'microphone', 'monitor', 'speaker', 'console', 'mixer']
          },
          {
            groupKey: 'production',
            title: 'Composition',
            description: 'Original music composition crafted around your creative brief, mood, and structure.',
            order: 50,
            matchField: 'both',
            keywords: ['composition']
          },
          {
            groupKey: 'production',
            title: 'Arrangement Enhancement',
            description: 'Enhancing the music with additional instrument layers and a fuller arrangement.',
            order: 60,
            matchField: 'both',
            keywords: ['arrangement layering']
          },
          {
            groupKey: 'production',
            title: 'Arrangement',
            description: 'Structuring and refining the song so the production feels complete and performance-ready.',
            order: 70,
            matchField: 'both',
            keywords: ['arrangement']
          },
          {
            groupKey: 'production',
            title: 'Production Service',
            description: 'Hands-on recording and production support tailored to the session requirement.',
            order: 80,
            matchField: 'both',
            keywords: ['recording', 'tracking', 'vocal', 'editing']
          },
          {
            groupKey: 'finishing',
            title: 'Stem Mastering',
            description: 'Mastering from grouped stems for better tonal control, polish, and release-ready output.',
            order: 90,
            matchField: 'both',
            keywords: ['stem mastering']
          },
          {
            groupKey: 'finishing',
            title: 'Mastering',
            description: 'Final polish, loudness balance, and clarity tuning for a release-ready final version.',
            order: 100,
            matchField: 'both',
            keywords: ['mastering']
          },
          {
            groupKey: 'finishing',
            title: 'Mixing',
            description: 'Balancing vocals and instruments for clarity, space, punch, and a polished sound.',
            order: 110,
            matchField: 'both',
            keywords: ['mix']
          },
          {
            groupKey: 'sound-design',
            title: 'Foley / Sound Design',
            description: 'Custom sound effects and texture creation for scenes, visuals, or storytelling moments.',
            order: 120,
            matchField: 'both',
            keywords: ['foley', 'sound effect', 'sfx']
          }
        ]
      },
      whatsappNotifications: {
        enabled: true,
        businessNumber: '+919970011855',
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
            number: '+919970011855',
            role: 'Sound Engineer',
            notifications: {
              bookingRequests: true,
              bookingConfirmations: true,
              paymentUpdates: false,
              cancellations: true
            }
          },
          {
            number: '+919970011855',
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
