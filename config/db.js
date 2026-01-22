const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
    
    // Create indexes after connection
    await createIndexes();
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

const createIndexes = async () => {
  try {
    // Get all models and create indexes
    const User = require('../models/User');
    const Booking = require('../models/Booking');
    const Slot = require('../models/Slot');
    
    await User.createIndexes();
    await Booking.createIndexes();
    await Slot.createIndexes();
    
    console.log('Database indexes created successfully');
  } catch (error) {
    console.log('Index creation skipped or failed:', error.message);
  }
};

module.exports = connectDB;
