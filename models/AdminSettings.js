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
    }
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
  studioName: {
    type: String,
    default: 'Swar JamRoom & Music Studio (SwarJRS)'
  },
  studioAddress: {
    type: String,
    default: 'Zen Business Center - 202, Bhumkar Chowk Rd, above Cafe Coffee Day, Shankar Kalat Nagar, Wakad, Pune, Pimpri-Chinchwad, Maharashtra 411057'
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
      adminEmails: ['admin@jamroom.com']
    });
  }
  
  return settings;
};

adminSettingsSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('AdminSettings', adminSettingsSchema);
