const mongoose = require('mongoose');
const AdminSettings = require('./models/AdminSettings');
require('dotenv').config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

const fixDatabase = async () => {
  try {
    await connectDB();
    
    // Get current settings
    const currentSettings = await AdminSettings.findOne();
    console.log('Current settings:', JSON.stringify(currentSettings, null, 2));
    
    // Update with the correct structure
    const newRentalTypes = [
      {
        name: 'JamRoom',
        description: 'Professional jam room with equipment',
        basePrice: 300,
        subItems: [
          {
            name: 'Microphone',
            description: 'Professional microphone',
            price: 0
          },
          {
            name: 'Audio Jacks',
            description: 'Audio input/output jacks',
            price: 0
          },
          {
            name: 'IEM',
            description: 'In-ear monitors',
            price: 50
          }
        ]
      },
      {
        name: 'Instrument Rentals',
        description: 'Musical instruments for rent',
        basePrice: 0,
        subItems: [
          {
            name: 'Guitar',
            description: 'Electric/Acoustic guitar',
            price: 200
          },
          {
            name: 'Keyboard',
            description: 'Digital keyboard/piano',
            price: 200
          }
        ]
      }
    ];
    
    // Update the settings
    if (currentSettings) {
      currentSettings.rentalTypes = newRentalTypes;
      await currentSettings.save();
      console.log('Database updated successfully');
    } else {
      await AdminSettings.create({
        rentalTypes: newRentalTypes,
        adminEmails: ['admin@jamroom.com']
      });
      console.log('New settings created successfully');
    }
    
    // Verify the update
    const updatedSettings = await AdminSettings.findOne();
    console.log('Updated settings:', JSON.stringify(updatedSettings.rentalTypes, null, 2));
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

fixDatabase();