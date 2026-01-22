const mongoose = require('mongoose');
require('dotenv').config();

const AdminSettings = require('./models/AdminSettings');

const updateStudioSettings = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Find and update the studio settings
    const settings = await AdminSettings.findOne();
    
    if (settings) {
      console.log('Current settings:');
      console.log('- Studio Name:', settings.studioName);
      console.log('- Studio Address:', settings.studioAddress?.substring(0, 50) + '...');
      console.log('- Studio Phone:', settings.studioPhone);
      
      // Update with correct values
      settings.studioName = 'Swar JamRoom & Music Studio (SwarJRS)';
      settings.studioAddress = 'Zen Business Center - 202, Bhumkar Chowk Rd, above Cafe Coffee Day, Shankar Kalat Nagar, Wakad, Pune, Pimpri-Chinchwad, Maharashtra 411057';
      settings.studioPhone = '+91 9172706306';
      
      await settings.save();
      
      console.log('\n✅ Settings updated successfully!');
      console.log('New settings:');
      console.log('- Studio Name:', settings.studioName);
      console.log('- Studio Address:', settings.studioAddress?.substring(0, 50) + '...');
      console.log('- Studio Phone:', settings.studioPhone);
      
    } else {
      console.log('No settings found, creating new ones...');
      
      const newSettings = await AdminSettings.create({
        studioName: 'Swar JamRoom & Music Studio (SwarJRS)',
        studioAddress: 'Zen Business Center - 202, Bhumkar Chowk Rd, above Cafe Coffee Day, Shankar Kalat Nagar, Wakad, Pune, Pimpri-Chinchwad, Maharashtra 411057',
        studioPhone: '+91 9172706306',
        adminEmails: ['admin@jamroom.com'],
        rentalTypes: [
          { name: 'JamRoom', description: 'Basic jam room rental', basePrice: 500 },
          { name: 'Instruments', description: 'Instrument rental only', basePrice: 300 },
          { name: 'Sound System', description: 'Sound system rental', basePrice: 400 },
          { name: 'JamRoom + Instruments', description: 'Room with instruments', basePrice: 700 },
          { name: 'Full Package', description: 'Everything included', basePrice: 1000 }
        ]
      });
      
      console.log('✅ New settings created!');
      console.log('- Studio Name:', newSettings.studioName);
    }

  } catch (error) {
    console.error('❌ Error updating settings:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

// Run the update
updateStudioSettings();